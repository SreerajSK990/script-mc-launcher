import { join } from 'node:path'
import { getLauncherRootDirectory } from '@main/services/paths'
import { readJsonFile, writeJsonFileAtomic } from '@main/utils/filesystem'

export interface LauncherSettings {
  curseForgeApiKey?: string | null
  defaultRamMb?: number
  customJavaPath?: string | null
}

let cachedSettings: LauncherSettings | null = null

function getSettingsPath(): string {
  return join(getLauncherRootDirectory(), 'settings.json')
}

export async function getLauncherSettings(): Promise<LauncherSettings> {
  if (cachedSettings) {
    return cachedSettings
  }

  try {
    const loaded = await readJsonFile<LauncherSettings>(getSettingsPath())
    cachedSettings = loaded || {}
    return cachedSettings
  } catch {
    cachedSettings = {}
    return cachedSettings
  }
}

export async function updateLauncherSettings(patch: Partial<LauncherSettings>): Promise<LauncherSettings> {
  const current = await getLauncherSettings()
  const updated = { ...current, ...patch }
  cachedSettings = updated

  try {
    await writeJsonFileAtomic(getSettingsPath(), updated)
  } catch (err) {
    console.error('Failed to save settings.json:', err)
  }

  return updated
}

export async function initializeLauncherSettings(): Promise<LauncherSettings> {
  const settings = await getLauncherSettings()
  return settings
}
