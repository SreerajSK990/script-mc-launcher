import { findManagedDependencyIssues } from '@main/core/mods/dependencies'
import { listInstalledMods } from '@main/core/mods/manager'
import { getRecoverySettings, backupSaves } from './recovery'
import { reserveInstance } from './instanceOperations'
import { delimiter, join } from 'node:path'
import type { LaunchProgressStep, LaunchProgressEvent, LaunchLogEvent } from '@shared/types/launch'
import type { QuickPlayLaunchOptions } from '@shared/types/servers'
import { getInstanceById, updateExistingInstance } from '@main/services/instances'
import { getCurrentAuthState, loginWithOfflineAccount } from '@main/services/auth'
import { detectSystemJavaPath } from '@main/services/system'
import { getInstancePath, getInstanceMinecraftPath } from '@main/services/paths'
import { fetchVersionPackage } from '@main/core/minecraft/meta'
import { prepareMinecraftLibraries } from '@main/core/minecraft/libraries'
import { prepareMinecraftAssets } from '@main/core/minecraft/assets'
import { buildExecutionArguments } from '@main/core/minecraft/arguments'
import { spawnMinecraftProcess, type RunningProcessHandle } from '@main/core/minecraft/launcher'
import { resolveInstanceLaunchConfiguration } from '@main/core/loaders/resolver'
import { ensureJavaRuntime } from '@main/core/java/runtime'

const activeProcesses = new Map<string, RunningProcessHandle>()

function isVersionAtLeast(version: string, targetMajor: number, targetMinor: number): boolean {
  const parts = version.split('.').map(p => parseInt(p, 10))
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return false
  if (parts[0] > targetMajor) return true
  if (parts[0] === targetMajor) return parts[1] >= targetMinor
  return false
}

export function isInstanceRunning(instanceId: string): boolean {
  return activeProcesses.has(instanceId)
}

export function stopRunningInstance(instanceId: string): boolean {
  const handle = activeProcesses.get(instanceId)
  if (!handle) {
    return false
  }

  handle.kill()
  return true
}

async function launchInstanceInternal(
  instanceId: string,
  onProgress: (event: LaunchProgressEvent) => void,
  onLog: (event: LaunchLogEvent) => void,
  quickPlay: QuickPlayLaunchOptions | undefined,
  release: () => void
): Promise<boolean> {
  if (isInstanceRunning(instanceId)) {
    throw new Error('This instance is already running.')
  }

  const sendProgress = (step: LaunchProgressStep, statusText: string, currentItems?: number, totalItems?: number, percentage?: number) => {
    onProgress({
      instanceId,
      step,
      statusText,
      currentItems,
      totalItems,
      percentage
    })
  }

  const sendLog = (text: string, level: 'info' | 'warn' | 'error' = 'info') => {
    onLog({
      instanceId,
      text,
      level,
      timestamp: new Date().toLocaleTimeString()
    })
  }

  sendProgress('FETCHING_METADATA', 'Preparing instance environment...')
  const instance = await getInstanceById(instanceId)

  if (!instance) {
    throw new Error(`Instance ${instanceId} does not exist.`)
  }

  const dependencyIssues = findManagedDependencyIssues(await listInstalledMods(instanceId))
  if (dependencyIssues.length) throw new Error(`Resolve mod requirements before launching: ${dependencyIssues.join(' ')}`)

  let authState = await getCurrentAuthState()
  let activeAccount = authState.activeAccount

  if (!activeAccount) {
    if (authState.accounts.length > 0) {
      activeAccount = authState.accounts[0]
    } else {
      sendLog('No player account connected. Creating default "Player" offline profile.')
      activeAccount = await loginWithOfflineAccount('Player')
    }
  }

  sendLog(`Authenticated as: ${activeAccount.username} (${activeAccount.accountType})`)

  const baseVersionPackage = await fetchVersionPackage(instance.minecraftVersion)
  sendLog(`Loaded version metadata for Minecraft ${baseVersionPackage.id}`)

  sendProgress('PREPARING_LOADER', `Resolving ${instance.loaderType} configuration...`)
  const launchConfig = await resolveInstanceLaunchConfiguration(instance, baseVersionPackage)
  const resolvedVersionPackage = launchConfig.versionPackage
  sendLog(`Configured runtime for loader: ${instance.loaderType}`)

  const nativesDirectory = join(getInstancePath(instance.id), 'natives')

  sendProgress('VERIFYING_LIBRARIES', 'Verifying libraries and client jar...')
  const classpathJars = await prepareMinecraftLibraries(
    resolvedVersionPackage,
    nativesDirectory,
    (completed, total, currentItem) => {
      const percentage = Math.round((completed / total) * 100)
      sendProgress('DOWNLOADING_LIBRARIES', `Downloading libraries: ${completed}/${total}`, completed, total, percentage)
    },
    launchConfig.extraDownloadTasks
  )
  sendLog(`Verified ${classpathJars.length} libraries on classpath`)

  sendProgress('VERIFYING_ASSETS', 'Verifying game assets...')
  await prepareMinecraftAssets(resolvedVersionPackage, (completed, total, currentItem) => {
    const percentage = Math.round((completed / total) * 100)
    sendProgress('DOWNLOADING_ASSETS', `Downloading assets: ${completed}/${total}`, completed, total, percentage)
  })
  sendLog('All game assets verified successfully')

  sendProgress('BUILDING_ARGUMENTS', 'Constructing JVM parameters...')
  const classpathString = classpathJars.join(delimiter)

  const { jvmArguments, gameArguments, mainClass } = buildExecutionArguments({
    instance,
    versionPackage: resolvedVersionPackage,
    account: activeAccount,
    nativesDirectory,
    classpathString
  })

  if (launchConfig.extraJvmArguments.length > 0) {
    jvmArguments.push(...launchConfig.extraJvmArguments)
  }

  if (quickPlay) {
    if (quickPlay.type === 'server' && quickPlay.host) {
      if (isVersionAtLeast(instance.minecraftVersion, 1, 20)) {
        const address = quickPlay.port ? `${quickPlay.host}:${quickPlay.port}` : quickPlay.host
        sendLog(`Quick-play joining server via modern argument: ${address}`)
        gameArguments.push('--quickPlayMultiplayer', address)
      } else {
        sendLog(`Quick-play joining server via standard arguments: ${quickPlay.host}:${quickPlay.port || 25565}`)
        gameArguments.push('--server', quickPlay.host)
        if (quickPlay.port) {
          gameArguments.push('--port', String(quickPlay.port))
        }
      }
    } else if (quickPlay.type === 'world' && quickPlay.worldFolder) {
      if (isVersionAtLeast(instance.minecraftVersion, 1, 20)) {
        sendLog(`Quick-play loading singleplayer world: ${quickPlay.worldFolder}`)
        gameArguments.push('--quickPlaySingleplayer', quickPlay.worldFolder)
      } else {
        sendLog('Quick-play singleplayer is only natively supported on Minecraft 1.20+; launching instance normally.', 'warn')
      }
    }
  }

  let javaExecutable = instance.javaPath

  if (!javaExecutable) {
    try {
      sendProgress('STARTING_JAVA', 'Resolving Java runtime for instance...')
      javaExecutable = await ensureJavaRuntime(
        resolvedVersionPackage,
        instance.minecraftVersion,
        (stepText, current, total, percentage) => {
          sendProgress('DOWNLOADING_LIBRARIES', stepText, current, total, percentage)
        }
      )
      sendLog(`Configured managed Java runtime: ${javaExecutable}`)
    } catch (javaError) {
      sendLog(
        `Automatic Java setup encountered an issue: ${
          javaError instanceof Error ? javaError.message : String(javaError)
        }. Falling back to system Java.`,
        'warn'
      )
      javaExecutable = (await detectSystemJavaPath()) || 'java'
    }
  }

  const workingDirectory = getInstanceMinecraftPath(instance.id)

  sendProgress('STARTING_JAVA', 'Spawning Java Virtual Machine...')
  sendLog(`Executing Java: ${javaExecutable}`)
  sendLog(`Main class: ${mainClass}`)
  sendLog(`Working directory: ${workingDirectory}`)

  const processStartTime = Date.now()

  const handle = spawnMinecraftProcess({
    javaExecutable,
    workingDirectory,
    jvmArguments,
    mainClass,
    gameArguments,
    onLog: (line, level) => {
      sendLog(line, level)
    },
    onExit: async (exitCode) => {
      activeProcesses.delete(instanceId)
      release()
      const durationSeconds = Math.max(0, Math.round((Date.now() - processStartTime) / 1000))

      if (exitCode === 0) {
        sendLog(`Minecraft process completed cleanly (Duration: ${durationSeconds}s)`)
        sendProgress('COMPLETED', 'Game closed')
      } else {
        sendLog(`Minecraft process exited with code ${exitCode}`, 'error')
        sendProgress('CRASHED', `Game closed with code ${exitCode}`)
      }

      if (exitCode === 0) {
        try {
          if ((await getRecoverySettings(instanceId)).backupAfterPlay) {
            await backupSaves(instanceId)
            sendLog('World saves backed up after game exit')
          }
        } catch (error) { sendLog(`Automatic backup failed: ${error instanceof Error ? error.message : String(error)}`, 'warn') }
      }

      try {
        const currentConfig = await getInstanceById(instance.id)
        const previousMinutes = currentConfig?.totalPlayTimeMinutes || 0
        const sessionMinutes = Math.max(1, Math.round(durationSeconds / 60))
        const totalPlayTimeMinutes = durationSeconds >= 10 ? previousMinutes + sessionMinutes : previousMinutes

        await updateExistingInstance({
          id: instance.id,
          lastPlayedAt: new Date().toISOString(),
          totalPlayTimeMinutes
        })
      } catch {
        // Ignore instance update error on exit
      }
    }
  })

  activeProcesses.set(instanceId, handle)
  sendProgress('RUNNING', 'Minecraft is running')
  return true
}

export async function launchInstance(instanceId: string, onProgress: (event: LaunchProgressEvent) => void, onLog: (event: LaunchLogEvent) => void, quickPlay?: QuickPlayLaunchOptions): Promise<boolean> {
  const release = reserveInstance(instanceId, 'Minecraft is launching or running')
  try {
    return await launchInstanceInternal(instanceId, onProgress, onLog, quickPlay, release)
  } catch (error) {
    release()
    throw error
  }
}
