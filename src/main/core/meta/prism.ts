import { join } from 'node:path'
import type { ModLoaderType } from '@shared/types/instance'
import type { PrismComponentIndex, PrismComponentVersion } from '@shared/types/prism'
import { getMetaCacheDirectory } from '@main/services/paths'
import { readJsonFile, writeJsonFileAtomic, doesPathExist, getFileAgeMilliseconds } from '@main/utils/filesystem'

const PRISM_META_BASE_URL = 'https://meta.prismlauncher.org/v1'
const CACHE_TTL_MILLISECONDS = 60 * 60 * 1000

const LOADER_UID_MAP: Record<ModLoaderType, string | null> = {
  vanilla: null,
  fabric: 'net.fabricmc.fabric-loader',
  quilt: 'org.quiltmc.quilt-loader',
  forge: 'net.minecraftforge',
  neoforge: 'net.neoforged'
}

export function getPrismComponentUid(loader: ModLoaderType): string | null {
  return LOADER_UID_MAP[loader] || null
}

export async function fetchPrismComponentIndex(componentUid: string): Promise<PrismComponentIndex> {
  const cachePath = join(getMetaCacheDirectory(), 'prism', componentUid, 'index.json')
  const isCached = await doesPathExist(cachePath)

  if (isCached) {
    const age = await getFileAgeMilliseconds(cachePath)
    if (age !== null && age < CACHE_TTL_MILLISECONDS) {
      const cachedData = await readJsonFile<PrismComponentIndex>(cachePath)
      if (cachedData && Array.isArray(cachedData.versions)) {
        return cachedData
      }
    }
  }

  const endpointUrl = `${PRISM_META_BASE_URL}/${componentUid}/index.json`

  try {
    const response = await fetch(endpointUrl, {
      headers: {
        'User-Agent': 'ScriptLauncher/0.1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`Prism meta responded with status ${response.status}`)
    }

    const data = (await response.json()) as PrismComponentIndex
    await writeJsonFileAtomic(cachePath, data)
    return data
  } catch (error) {
    if (isCached) {
      const fallbackData = await readJsonFile<PrismComponentIndex>(cachePath)
      if (fallbackData) {
        return fallbackData
      }
    }

    throw new Error(`Failed to fetch loader index for ${componentUid}: ${error instanceof Error ? error.message : 'Network error'}`)
  }
}

export async function fetchPrismComponentVersion(componentUid: string, version: string): Promise<PrismComponentVersion> {
  const cachePath = join(getMetaCacheDirectory(), 'prism', componentUid, `${version}.json`)
  const isCached = await doesPathExist(cachePath)

  if (isCached) {
    const cachedData = await readJsonFile<PrismComponentVersion>(cachePath)
    if (cachedData) {
      return cachedData
    }
  }

  const endpointUrl = `${PRISM_META_BASE_URL}/${componentUid}/${version}.json`

  try {
    const response = await fetch(endpointUrl, {
      headers: {
        'User-Agent': 'ScriptLauncher/0.1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`Prism meta responded with status ${response.status}`)
    }

    const data = (await response.json()) as PrismComponentVersion
    await writeJsonFileAtomic(cachePath, data)
    return data
  } catch (error) {
    if (isCached) {
      const fallbackData = await readJsonFile<PrismComponentVersion>(cachePath)
      if (fallbackData) {
        return fallbackData
      }
    }

    throw new Error(`Failed to fetch loader version ${version} for ${componentUid}: ${error instanceof Error ? error.message : 'Network error'}`)
  }
}

export async function getCompatibleLoaderVersions(loader: ModLoaderType, minecraftVersion: string): Promise<string[]> {
  const uid = getPrismComponentUid(loader)
  if (!uid) {
    return []
  }

  const index = await fetchPrismComponentIndex(uid)
  if (!index || !Array.isArray(index.versions)) {
    return []
  }

  if (loader === 'fabric' || loader === 'quilt') {
    return index.versions
      .map((entry) => entry.version)
      .slice(0, 35)
  }

  const exactMatches = index.versions.filter((entry) => {
    return entry.requires?.some((req) => req.uid === 'net.minecraft' && req.equals === minecraftVersion)
  })

  if (exactMatches.length > 0) {
    return exactMatches.map((entry) => entry.version)
  }

  if (loader === 'neoforge') {
    const versionParts = minecraftVersion.split('.')
    if (versionParts.length >= 2) {
      const majorMinorPrefix = `${versionParts[1]}.${versionParts[2] || '0'}`
      const fallbackMatches = index.versions.filter((entry) => entry.version.startsWith(majorMinorPrefix))
      if (fallbackMatches.length > 0) {
        return fallbackMatches.map((entry) => entry.version)
      }
    }
  }

  return []
}
