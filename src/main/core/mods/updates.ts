import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { getInstanceConfigPath } from '@main/services/paths'
import { readJsonFile, doesPathExist } from '@main/utils/filesystem'
import type { InstanceConfiguration, ModLoaderType } from '@shared/types/instance'
import type { ModUpdateInfo, InstalledModRecord, ModVersionFile } from '@shared/types/mods'
import { listInstalledMods, installModToInstance, getModsDirectory } from './manager'
import { getModrinthProjectVersions } from './modrinth'
import { getCurseForgeFiles } from './curseforge'
import { getCachedData, setCachedData } from './cache'

const UPDATE_CHECK_CACHE_TTL = 15 * 60 * 1000
const USER_AGENT = 'ScriptLauncher/0.2.0 (github.com/SreerajSK990/script-mc-launcher)'
const MODRINTH_API_BASE = 'https://api.modrinth.com/v2'

interface ModrinthBatchUpdatePayload {
  hashes: string[]
  algorithm: 'sha512' | 'sha1'
  loaders?: string[]
  game_versions?: string[]
}

interface ModrinthBatchFileEntry {
  hashes: {
    sha512?: string
    sha1?: string
  }
  url: string
  filename: string
  primary: boolean
  size: number
}

interface ModrinthBatchVersionEntry {
  id: string
  project_id: string
  name: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  version_type: 'release' | 'beta' | 'alpha'
  date_published: string
  changelog?: string
  files: ModrinthBatchFileEntry[]
}

async function computeFileSha512(filePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath)
    return createHash('sha512').update(buffer).digest('hex')
  } catch {
    return null
  }
}

export async function checkForModUpdates(
  instanceId: string,
  forceRefresh = false
): Promise<ModUpdateInfo[]> {
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
  if (!forceRefresh) {
    const cached = await getCachedData<ModUpdateInfo[]>(cacheKey, UPDATE_CHECK_CACHE_TTL)
    if (cached) {
      return cached
    }
  }

  const modsDir = getModsDirectory(instanceId)
  const loader = instance.loaderType !== 'vanilla' ? instance.loaderType : undefined

  const hashToModMap = new Map<string, InstalledModRecord>()
  const fileToHashMap = new Map<string, string>()

  await Promise.all(
    installedMods.map(async (mod) => {
      let resolvedPath = join(modsDir, mod.filename)
      if (!(await doesPathExist(resolvedPath))) {
        const disabledPath = join(modsDir, `${mod.filename}.disabled`)
        if (await doesPathExist(disabledPath)) {
          resolvedPath = disabledPath
        } else {
          return
        }
      }

      const hash = await computeFileSha512(resolvedPath)
      if (hash) {
        hashToModMap.set(hash, mod)
        fileToHashMap.set(mod.filename, hash)
      }
    })
  )

  const updates: ModUpdateInfo[] = []
  const resolvedFilenames = new Set<string>()

  const allHashes = Array.from(hashToModMap.keys())
  if (allHashes.length > 0) {
    try {
      const payload: ModrinthBatchUpdatePayload = {
        hashes: allHashes,
        algorithm: 'sha512',
        loaders: loader ? [loader.toLowerCase()] : undefined,
        game_versions: [instance.minecraftVersion]
      }

      const response = await fetch(`${MODRINTH_API_BASE}/version_files/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT
        },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const batchResults = (await response.json()) as Record<string, ModrinthBatchVersionEntry>

        for (const [hash, versionEntry] of Object.entries(batchResults)) {
          const mod = hashToModMap.get(hash)
          if (!mod || !versionEntry) continue

          resolvedFilenames.add(mod.filename)

          const primaryFile =
            versionEntry.files.find((f) => f.primary) || versionEntry.files[0]
          if (!primaryFile) continue

          const isSameHash = primaryFile.hashes?.sha512?.toLowerCase() === hash.toLowerCase()
          const isSameVersionNumber =
            versionEntry.version_number &&
            mod.version &&
            versionEntry.version_number.trim() === mod.version.trim()
          const isSameFilename =
            primaryFile.filename.toLowerCase() === mod.filename.toLowerCase()

          if (!isSameHash && (!isSameVersionNumber || !isSameFilename)) {
            const validLoaders: ModLoaderType[] = []
            for (const l of versionEntry.loaders || []) {
              const lower = l.toLowerCase()
              if (
                lower === 'fabric' ||
                lower === 'forge' ||
                lower === 'neoforge' ||
                lower === 'quilt'
              ) {
                validLoaders.push(lower as ModLoaderType)
              }
            }

            const versionFile: ModVersionFile = {
              id: versionEntry.id,
              projectId: versionEntry.project_id,
              name: versionEntry.name,
              versionNumber: versionEntry.version_number,
              gameVersions: versionEntry.game_versions,
              loaders: validLoaders,
              downloadUrl: primaryFile.url,
              filename: primaryFile.filename,
              sizeBytes: primaryFile.size,
              sha512: primaryFile.hashes?.sha512,
              sha1: primaryFile.hashes?.sha1,
              releaseType: versionEntry.version_type,
              datePublished: versionEntry.date_published,
              changelog: versionEntry.changelog
            }

            updates.push({
              modId: mod.id.startsWith('manual-') ? versionEntry.project_id : mod.id,
              name: mod.name,
              currentVersion: mod.version,
              currentFilename: mod.filename,
              latestVersion: versionEntry.version_number || versionEntry.name,
              source: 'modrinth',
              versionFile,
              releaseType: versionEntry.version_type
            })
          }
        }
      }
    } catch {
    }
  }

  const remainingMods = installedMods.filter((m) => !resolvedFilenames.has(m.filename))

  await Promise.all(
    remainingMods.map(async (mod) => {
      try {
        let versions: ModVersionFile[] = []

        if (mod.source === 'curseforge') {
          versions = await getCurseForgeFiles(mod.id, instance.minecraftVersion, loader)
        } else if (mod.id && !mod.id.startsWith('manual-') && !mod.id.includes(' ')) {
          versions = await getModrinthProjectVersions(mod.id, instance.minecraftVersion, loader)
        }

        if (versions.length > 0) {
          const latestVersion =
            versions.find((v) => v.releaseType === 'release') || versions[0]
          const isSameFile =
            latestVersion.filename.toLowerCase() === mod.filename.toLowerCase() ||
            (latestVersion.versionNumber &&
              mod.version &&
              latestVersion.versionNumber.trim() === mod.version.trim())

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
      }
    })
  )

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
