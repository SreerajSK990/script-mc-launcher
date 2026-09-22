import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { MOJANG_METADATA_CONFIG } from '@shared/constants/mojang'
import type { VersionManifest, VersionPackage, MinecraftVersionEntry } from '@shared/types/manifest'
import { getMetaCacheDirectory } from '@main/services/paths'
import { readJsonFile, writeJsonFileAtomic, doesPathExist } from '@main/utils/filesystem'

function getMojangManifestCachePath(): string {
  return join(getMetaCacheDirectory(), 'mojang', 'version_manifest_v2.json')
}

function getVersionPackageCachePath(versionId: string): string {
  return join(getMetaCacheDirectory(), 'mojang', 'versions', `${versionId}.json`)
}

export async function fetchMojangVersionManifest(): Promise<VersionManifest> {
  const cacheFilePath = getMojangManifestCachePath()

  if (await doesPathExist(cacheFilePath)) {
    try {
      const stats = await fs.stat(cacheFilePath)
      const ageMs = Date.now() - stats.mtimeMs
      if (ageMs < MOJANG_METADATA_CONFIG.DEFAULT_MANIFEST_TTL_MS) {
        const cached = await readJsonFile<VersionManifest>(cacheFilePath)
        if (cached && Array.isArray(cached.versions)) {
          return cached
        }
      }
    } catch {
      // If reading cache fails, proceed to network fetch
    }
  }

  const response = await fetch(MOJANG_METADATA_CONFIG.VERSION_MANIFEST_URL)
  if (!response.ok) {
    const cached = await readJsonFile<VersionManifest>(cacheFilePath)
    if (cached) {
      return cached
    }
    throw new Error(`Failed to fetch Mojang version manifest: HTTP ${response.status}`)
  }

  const manifest = (await response.json()) as VersionManifest
  await writeJsonFileAtomic(cacheFilePath, manifest)
  return manifest
}

export async function fetchVersionPackage(versionId: string): Promise<VersionPackage> {
  const cacheFilePath = getVersionPackageCachePath(versionId)

  const cached = await readJsonFile<VersionPackage>(cacheFilePath)
  if (cached && cached.id === versionId) {
    return cached
  }

  const manifest = await fetchMojangVersionManifest()
  const entry = manifest.versions.find((v) => v.id === versionId)

  if (!entry) {
    throw new Error(`Minecraft version "${versionId}" was not found in Mojang version manifest.`)
  }

  const response = await fetch(entry.url)
  if (!response.ok) {
    throw new Error(`Failed to fetch version package for "${versionId}": HTTP ${response.status}`)
  }

  const versionPackage = (await response.json()) as VersionPackage
  await writeJsonFileAtomic(cacheFilePath, versionPackage)
  return versionPackage
}

export async function getAvailableReleaseVersions(): Promise<string[]> {
  const manifest = await fetchMojangVersionManifest()
  return manifest.versions
    .filter((v) => v.type === 'release')
    .map((v) => v.id)
}

export async function getAvailableMinecraftVersions(): Promise<MinecraftVersionEntry[]> {
  const manifest = await fetchMojangVersionManifest()
  return manifest.versions.map((v) => ({
    id: v.id,
    type: v.type,
    releaseTime: v.releaseTime
  }))
}
