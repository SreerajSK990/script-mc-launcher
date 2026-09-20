import { delimiter, join } from 'node:path'
import type { LaunchProgressStep, LaunchProgressEvent, LaunchLogEvent } from '@shared/types/launch'
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

const activeProcesses = new Map<string, RunningProcessHandle>()

export function isInstanceRunning(instanceId: string): boolean {
  return activeProcesses.has(instanceId)
}

export function stopRunningInstance(instanceId: string): boolean {
  const handle = activeProcesses.get(instanceId)
  if (!handle) {
    return false
  }

  handle.kill()
  activeProcesses.delete(instanceId)
  return true
}

export async function launchInstance(
  instanceId: string,
  onProgress: (event: LaunchProgressEvent) => void,
  onLog: (event: LaunchLogEvent) => void
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

  const javaExecutable = instance.javaPath || (await detectSystemJavaPath()) || 'java'
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
      const durationSeconds = Math.max(0, Math.round((Date.now() - processStartTime) / 1000))

      if (exitCode === 0) {
        sendLog(`Minecraft process completed cleanly (Duration: ${durationSeconds}s)`)
        sendProgress('COMPLETED', 'Game closed')
      } else {
        sendLog(`Minecraft process exited with code ${exitCode}`, 'error')
        sendProgress('CRASHED', `Game closed with code ${exitCode}`)
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
