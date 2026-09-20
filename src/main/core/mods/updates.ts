import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { getInstanceConfigPath } from '@main/services/paths'
import { readJsonFile } from '@main/utils/filesystem'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { ModUpdateInfo, InstalledModRecord, ModVersionFile } from '@shared/types/mods'
import { listInstalledMods, installModToInstance } from './manager'
import { getModrinthProjectVersions, searchModrinth } from './modrinth'
import { getCurseForgeFiles, searchCurseForge } from './curseforge'
import { getCachedData, setCachedData } from './cache'

const UPDATE_CHECK_CACHE_TTL = 30 * 60 * 1000 // 30 minutes

function cleanModQuery(name: string, filename: string): string {
  const raw = (name || filename || '')
    .replace(/^manual-/, '')
    .replace(/\.jar(\.disabled)?$/i, '')
    .trim()

  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_+](mc)?v?\d+(\.\d+).*$/i, '')
    .replace(/[-_+](fabric|forge|neoforge|quilt)$/i, '')
    .replace(/[-_.]/g, ' ')
    .trim()
}

export async function checkForModUpdates(instanceId: string): Promise<ModUpdateInfo[]> {
  const configPath = getInstanceConfigPath(instanceId)
  const instance = await readJsonFile<InstanceConfiguration>(configPath)
  if (!instance) {
    return []
  }

  const installedMods = await listInstalledMods(instanceId)
  if (installedMods.length === 0) {
    return []
  }

  const cacheKey = `mod_updates_check_${instanceId}_${instance.minecraftVersion}_${instance.loaderType}`
  const cached = await getCachedData<ModUpdateInfo[]>(cacheKey, UPDATE_CHECK_CACHE_TTL)
  if (cached) {
    return cached
  }

  const updates: ModUpdateInfo[] = []
  const loader = instance.loaderType !== 'vanilla' ? instance.loaderType : undefined

  for (const mod of installedMods) {
    try {
      let versions: ModVersionFile[] = []

      // 1. Direct query if not a manual- synthetic ID
      if (mod.id && !mod.id.startsWith('manual-') && !mod.id.includes(' ')) {
        if (mod.source === 'curseforge') {
          versions = await getCurseForgeFiles(mod.id, instance.minecraftVersion, loader)
        } else {
          versions = await getModrinthProjectVersions(mod.id, instance.minecraftVersion, loader)
        }
      }

      // 2. Fallback search by clean name if no versions found yet
      if (versions.length === 0) {
        const query = cleanModQuery(mod.name, mod.filename)
        if (query.length >= 2) {
          if (mod.source === 'curseforge') {
            const hits = await searchCurseForge({
              query,
              minecraftVersion: instance.minecraftVersion,
              loader,
              limit: 3
            })
            if (hits.length > 0) {
              versions = await getCurseForgeFiles(hits[0].id, instance.minecraftVersion, loader)
            }
          } else {
            const hits = await searchModrinth({
              query,
              minecraftVersion: instance.minecraftVersion,
              loader,
              limit: 3
            })
            if (hits.length > 0) {
              versions = await getModrinthProjectVersions(hits[0].id, instance.minecraftVersion, loader)
            }
          }
        }
      }

      if (versions.length > 0) {
        // Find latest release or top version
        const latestVersion = versions.find((v) => v.releaseType === 'release') || versions[0]

        // Compare with installed mod
        const isSameFile =
          latestVersion.filename.toLowerCase() === mod.filename.toLowerCase() ||
          latestVersion.versionNumber === mod.version

        if (!isSameFile) {
          updates.push({
            modId: mod.id,
            name: mod.name,
            currentVersion: mod.version,
            currentFilename: mod.filename,
            latestVersion: latestVersion.versionNumber || latestVersion.name,
            source: mod.source,
            versionFile: latestVersion,
            releaseType: latestVersion.releaseType
          })
        }
      }
    } catch {
      // Ignore individual mod check failures
    }
  }

  await setCachedData(cacheKey, updates)
  return updates
}

export async function updateAllMods(
  instanceId: string,
  updates: ModUpdateInfo[],
  onProgress?: (progress: { message: string; current: number; total: number }) => void
): Promise<{ success: boolean; updatedCount: number }> {
  let updatedCount = 0
  const total = updates.length

  for (let i = 0; i < total; i++) {
    const item = updates[i]
    if (onProgress) {
      onProgress({
        message: `Updating ${item.name} to ${item.latestVersion}...`,
        current: i + 1,
        total
      })
    }

    try {
      await installModToInstance({
        instanceId,
        versionFile: item.versionFile,
        modMetadata: {
          id: item.modId,
          name: item.name,
          source: item.source
        },
        oldFilename: item.currentFilename
      })
      updatedCount++
    } catch (err) {
      console.warn(`Failed to update mod ${item.name}:`, err)
    }
  }

  return { success: true, updatedCount }
}
