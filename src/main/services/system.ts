import { totalmem, freemem, platform, arch, release } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import type { SystemEnvironment, SystemMemoryInfo, OperatingSystemInfo } from '@shared/types/system'
import { getLauncherRootDirectory } from '@main/services/paths'

const execFileAsync = promisify(execFile)

export function getSystemMemory(): SystemMemoryInfo {
  const totalMegabytes = Math.round(totalmem() / (1024 * 1024))
  const freeMegabytes = Math.round(freemem() / (1024 * 1024))

  const halfTotal = Math.round(totalMegabytes / 2)
  const recommendedAllocationMegabytes = Math.max(2048, Math.min(8192, halfTotal))

  return {
    totalMegabytes,
    freeMegabytes,
    recommendedAllocationMegabytes
  }
}

export function getOperatingSystem(): OperatingSystemInfo {
  let mappedPlatform: 'windows' | 'macos' | 'linux' = 'linux'

  if (platform() === 'win32') {
    mappedPlatform = 'windows'
  } else if (platform() === 'darwin') {
    mappedPlatform = 'macos'
  }

  return {
    platform: mappedPlatform,
    architecture: arch(),
    release: release()
  }
}

export async function detectSystemJavaPath(): Promise<string | null> {
  const javaHome = process.env.JAVA_HOME
  if (javaHome) {
    const javaBinary = platform() === 'win32' ? join(javaHome, 'bin', 'java.exe') : join(javaHome, 'bin', 'java')
    return javaBinary
  }

  const lookupCommand = platform() === 'win32' ? 'where' : 'which'
  try {
    const { stdout } = await execFileAsync(lookupCommand, ['java'])
    const candidatePath = stdout.split('\n')[0]?.trim()
    return candidatePath || null
  } catch {
    return null
  }
}

export async function getSystemEnvironment(): Promise<SystemEnvironment> {
  const memory = getSystemMemory()
  const os = getOperatingSystem()
  const defaultJavaPath = await detectSystemJavaPath()
  const appDataDirectory = getLauncherRootDirectory()

  return {
    memory,
    os,
    defaultJavaPath,
    appDataDirectory
  }
}
