import type {
  ModSearchResult,
  ModVersionFile,
  ModSearchParams,
  InstallModPayload,
  InstalledModRecord,
  ModSource,
  ModDetail
} from '@shared/types/mods'
import type { ModLoaderType } from '@shared/types/instance'
import { searchModrinth, getModrinthProjectVersions, getModrinthProjectDetail } from '@main/core/mods/modrinth'
import {
  searchCurseForge,
  getCurseForgeFiles,
  getCurseForgeModDetail,
  setCurseForgeApiKey,
  getCurseForgeApiKey,
  initCurseForgeApiKey
} from '@main/core/mods/curseforge'
import {
  listInstalledMods,
  installModToInstance,
  toggleModEnabled,
  deleteInstalledMod
} from '@main/core/mods/manager'

export { setCurseForgeApiKey, getCurseForgeApiKey, initCurseForgeApiKey }

export async function fetchModDetail(source: ModSource, id: string): Promise<ModDetail> {
  if (source === 'curseforge') {
    return await getCurseForgeModDetail(id)
  }
  return await getModrinthProjectDetail(id)
}

export async function searchAllMods(params: ModSearchParams): Promise<ModSearchResult[]> {
  const source = params.source || 'all'

  if (source === 'modrinth') {
    return await searchModrinth(params)
  }

  if (source === 'curseforge') {
    return await searchCurseForge(params)
  }

  const [modrinthResults, curseForgeResults] = await Promise.all([
    searchModrinth(params).catch(() => []),
    searchCurseForge(params).catch(() => [])
  ])

  const seenTitles = new Set<string>()
  const merged: ModSearchResult[] = []

  for (const item of modrinthResults) {
    seenTitles.add(item.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
    merged.push(item)
  }

  for (const item of curseForgeResults) {
    const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!seenTitles.has(key)) {
      seenTitles.add(key)
      merged.push(item)
    }
  }

  return merged
}

export async function fetchModVersions(
  projectId: string,
  source: ModSource,
  minecraftVersion?: string,
  loader?: ModLoaderType
): Promise<ModVersionFile[]> {
  try {
    if (source === 'curseforge') {
      return await getCurseForgeFiles(projectId, minecraftVersion, loader)
    }
    return await getModrinthProjectVersions(projectId, minecraftVersion, loader)
  } catch (err) {
    console.warn(`Failed to fetch versions for mod ${projectId}:`, err)
    return []
  }
}

export async function installMod(payload: InstallModPayload): Promise<InstalledModRecord> {
  return await installModToInstance(payload)
}

export async function listMods(instanceId: string): Promise<InstalledModRecord[]> {
  return await listInstalledMods(instanceId)
}

export async function toggleMod(
  instanceId: string,
  filename: string,
  enable: boolean
): Promise<boolean> {
  return await toggleModEnabled(instanceId, filename, enable)
}

export async function deleteMod(instanceId: string, filename: string): Promise<boolean> {
  return await deleteInstalledMod(instanceId, filename)
}
