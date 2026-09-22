import { homedir } from 'node:os'
import { join } from 'node:path'
import { LAUNCHER_METADATA } from '@shared/constants/defaults'
import { ensureDirectoryExists } from '@main/utils/filesystem'

export function getLauncherRootDirectory(): string {
  if (process.env.LAUNCHER_DATA_DIR) {
    return process.env.LAUNCHER_DATA_DIR
  }

  const userHome = homedir()

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) {
      return join(appData, LAUNCHER_METADATA.DATA_DIRECTORY_NAME)
    }
  } else if (process.platform === 'darwin') {
    return join(userHome, 'Library', 'Application Support', LAUNCHER_METADATA.DATA_DIRECTORY_NAME)
  }

  return join(userHome, LAUNCHER_METADATA.DATA_DIRECTORY_NAME)
}

export function getInstancesDirectory(): string {
  return join(getLauncherRootDirectory(), 'instances')
}

export function getInstancePath(instanceId: string): string {
  return join(getInstancesDirectory(), instanceId)
}

export function getInstanceMinecraftPath(instanceId: string): string {
  return join(getInstancePath(instanceId), 'minecraft')
}

export function getInstanceConfigPath(instanceId: string): string {
  return join(getInstancePath(instanceId), 'instance.json')
}

export function getLibrariesDirectory(): string {
  return join(getLauncherRootDirectory(), 'libraries')
}

export function getAssetsDirectory(): string {
  return join(getLauncherRootDirectory(), 'assets')
}

export function getJavaRuntimesDirectory(): string {
  return join(getLauncherRootDirectory(), 'java')
}

export function getMetaCacheDirectory(): string {
  return join(getLauncherRootDirectory(), 'meta-cache')
}

export function getFontsDirectory(): string {
  return join(getLauncherRootDirectory(), 'fonts')
}

export function getSkinsDirectory(): string {
  return join(getLauncherRootDirectory(), 'skins')
}

export function getCapesDirectory(): string {
  return join(getLauncherRootDirectory(), 'capes')
}

export async function initializeLauncherDirectories(): Promise<void> {
  const root = getLauncherRootDirectory()
  await ensureDirectoryExists(root)
  await ensureDirectoryExists(getInstancesDirectory())
  await ensureDirectoryExists(getLibrariesDirectory())
  await ensureDirectoryExists(getAssetsDirectory())
  await ensureDirectoryExists(getJavaRuntimesDirectory())
  await ensureDirectoryExists(getMetaCacheDirectory())
  await ensureDirectoryExists(getFontsDirectory())
  await ensureDirectoryExists(getSkinsDirectory())
  await ensureDirectoryExists(getCapesDirectory())
}


