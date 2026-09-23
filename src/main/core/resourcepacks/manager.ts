import { join, basename } from 'node:path'
import { promises as fs } from 'node:fs'
import AdmZip from 'adm-zip'
import { getInstancePath, getInstanceMinecraftPath } from '@main/services/paths'
import {
  readJsonFile,
  writeJsonFileAtomic,
  doesPathExist,
  ensureDirectoryExists
} from '@main/utils/filesystem'
import { downloadFileWithHash } from '@main/utils/download'
import type { InstalledResourcePackRecord, InstallModPayload } from '@shared/types/mods'

export function getResourcePacksDirectory(instanceId: string): string {
  return join(getInstanceMinecraftPath(instanceId), 'resourcepacks')
}

export function getResourcePacksMetadataPath(instanceId: string): string {
  return join(getInstancePath(instanceId), 'resourcepacks.json')
}

interface PackMcmetaInfo {
  description?: string
  iconDataUrl?: string
}

function extractZipPackInfo(zipPath: string): PackMcmetaInfo {
  try {
    const zip = new AdmZip(zipPath)
    let description: string | undefined
    let iconDataUrl: string | undefined

    const metaEntry = zip.getEntry('pack.mcmeta')
    if (metaEntry) {
      try {
        const text = zip.readAsText(metaEntry)
        const json = JSON.parse(text)
        if (json?.pack?.description) {
          if (typeof json.pack.description === 'string') {
            description = json.pack.description
          } else if (typeof json.pack.description === 'object' && json.pack.description.text) {
            description = json.pack.description.text
          }
        }
      } catch {}
    }

    const pngEntry = zip.getEntry('pack.png')
    if (pngEntry) {
      try {
        const buffer = zip.readFile(pngEntry)
        if (buffer && buffer.length > 0) {
          iconDataUrl = `data:image/png;base64,${buffer.toString('base64')}`
        }
      } catch {}
    }

    return { description, iconDataUrl }
  } catch {
    return {}
  }
}

export async function listInstalledResourcePacks(instanceId: string): Promise<InstalledResourcePackRecord[]> {
  const packsDir = getResourcePacksDirectory(instanceId)
  await ensureDirectoryExists(packsDir)

  const metaPath = getResourcePacksMetadataPath(instanceId)
  const savedPacks = (await readJsonFile<InstalledResourcePackRecord[]>(metaPath)) || []

  let diskEntries: string[] = []
  try {
    diskEntries = await fs.readdir(packsDir)
  } catch {
    diskEntries = []
  }

  const diskFilesMap = new Map<string, { enabled: boolean; originalFilename: string; size: number; fullPath: string }>()

  for (const entry of diskEntries) {
    const fullPath = join(packsDir, entry)
    try {
      const stats = await fs.stat(fullPath)
      if (stats.isFile()) {
        if (entry.endsWith('.zip')) {
          diskFilesMap.set(entry, { enabled: true, originalFilename: entry, size: stats.size, fullPath })
        } else if (entry.endsWith('.zip.disabled')) {
          const baseName = entry.slice(0, -9)
          diskFilesMap.set(baseName, { enabled: false, originalFilename: entry, size: stats.size, fullPath })
        }
      } else if (stats.isDirectory() && !entry.endsWith('.disabled')) {
        diskFilesMap.set(entry, { enabled: true, originalFilename: entry, size: 0, fullPath })
      }
    } catch {}
  }

  const syncedList: InstalledResourcePackRecord[] = []
  const recognizedFilenames = new Set<string>()

  for (const record of savedPacks) {
    const diskInfo = diskFilesMap.get(record.filename)
    if (diskInfo) {
      syncedList.push({
        ...record,
        enabled: diskInfo.enabled,
        fileSizeBytes: diskInfo.size
      })
      recognizedFilenames.add(record.filename)
    }
  }

  for (const [filename, info] of diskFilesMap.entries()) {
    if (!recognizedFilenames.has(filename)) {
      const packInfo = info.fullPath.endsWith('.zip') || info.fullPath.endsWith('.zip.disabled')
        ? extractZipPackInfo(info.fullPath)
        : {}
      const cleanName = filename.replace(/\.zip$/, '')

      syncedList.push({
        id: `manual-${cleanName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`,
        name: cleanName,
        version: 'custom',
        filename,
        source: 'modrinth',
        iconUrl: packInfo.iconDataUrl,
        description: packInfo.description,
        installedAt: new Date().toISOString(),
        enabled: info.enabled,
        fileSizeBytes: info.size
      })
    }
  }

  await writeJsonFileAtomic(metaPath, syncedList)
  return syncedList
}

export async function installResourcePackToInstance(payload: InstallModPayload): Promise<InstalledResourcePackRecord> {
  const packsDir = getResourcePacksDirectory(payload.instanceId)
  await ensureDirectoryExists(packsDir)

  const destination = join(packsDir, payload.versionFile.filename)
  const hashAlgo = payload.versionFile.sha512 ? 'sha512' : 'sha1'
  const expectedHash = payload.versionFile.sha512 || payload.versionFile.sha1

  await downloadFileWithHash(payload.versionFile.downloadUrl, destination, expectedHash, hashAlgo)

  let statsSize = payload.versionFile.sizeBytes
  try {
    const stats = await fs.stat(destination)
    statsSize = stats.size
  } catch {}

  const newRecord: InstalledResourcePackRecord = {
    id: payload.modMetadata.id,
    name: payload.modMetadata.name,
    version: payload.versionFile.versionNumber,
    filename: payload.versionFile.filename,
    source: payload.modMetadata.source,
    iconUrl: payload.modMetadata.iconUrl,
    installedAt: new Date().toISOString(),
    enabled: true,
    fileSizeBytes: statsSize,
    gameVersion: payload.versionFile.gameVersions[0]
  }

  const metaPath = getResourcePacksMetadataPath(payload.instanceId)
  const existingPacks = (await readJsonFile<InstalledResourcePackRecord[]>(metaPath)) || []

  const oldFilesToRemove = new Set<string>()
  if (payload.oldFilename && payload.oldFilename !== payload.versionFile.filename) {
    oldFilesToRemove.add(payload.oldFilename)
  }

  const previousRecord = existingPacks.find(
    (p) =>
      p.id === newRecord.id ||
      (payload.oldFilename && (p.filename === payload.oldFilename || p.filename === `${payload.oldFilename}.disabled`))
  )

  if (previousRecord && previousRecord.filename !== payload.versionFile.filename) {
    oldFilesToRemove.add(previousRecord.filename)
  }

  for (const oldFile of oldFilesToRemove) {
    const activeOld = join(packsDir, oldFile)
    const disabledOld = join(packsDir, `${oldFile}.disabled`)
    await fs.rm(activeOld, { force: true }).catch(() => {})
    await fs.rm(disabledOld, { force: true }).catch(() => {})
  }

  const updatedPacks = existingPacks.filter(
    (p) =>
      p.id !== newRecord.id &&
      p.filename !== newRecord.filename &&
      !oldFilesToRemove.has(p.filename)
  )
  updatedPacks.push(newRecord)

  await writeJsonFileAtomic(metaPath, updatedPacks)
  return newRecord
}

export async function toggleResourcePackEnabled(
  instanceId: string,
  filename: string,
  enable: boolean
): Promise<boolean> {
  const packsDir = getResourcePacksDirectory(instanceId)
  const activePath = join(packsDir, filename)
  const disabledPath = join(packsDir, `${filename}.disabled`)

  if (enable) {
    if (await doesPathExist(disabledPath)) {
      await fs.rename(disabledPath, activePath)
    }
  } else {
    if (await doesPathExist(activePath)) {
      await fs.rename(activePath, disabledPath)
    }
  }

  const metaPath = getResourcePacksMetadataPath(instanceId)
  const packs = (await readJsonFile<InstalledResourcePackRecord[]>(metaPath)) || []
  const target = packs.find((p) => p.filename === filename)
  if (target) {
    target.enabled = enable
    await writeJsonFileAtomic(metaPath, packs)
  }

  return true
}

export async function deleteInstalledResourcePack(instanceId: string, filename: string): Promise<boolean> {
  const packsDir = getResourcePacksDirectory(instanceId)
  const activePath = join(packsDir, filename)
  const disabledPath = join(packsDir, `${filename}.disabled`)

  await fs.rm(activePath, { force: true }).catch(() => {})
  await fs.rm(disabledPath, { force: true }).catch(() => {})

  const metaPath = getResourcePacksMetadataPath(instanceId)
  const packs = (await readJsonFile<InstalledResourcePackRecord[]>(metaPath)) || []
  const filtered = packs.filter((p) => p.filename !== filename)

  await writeJsonFileAtomic(metaPath, filtered)
  return true
}

export async function installDroppedResourcePacks(
  instanceId: string,
  filePaths: string[]
): Promise<{ success: boolean; installedPacks: InstalledResourcePackRecord[] }> {
  const packsDir = getResourcePacksDirectory(instanceId)
  await ensureDirectoryExists(packsDir)

  const installedPacks: InstalledResourcePackRecord[] = []

  for (const filePath of filePaths) {
    if (!filePath.toLowerCase().endsWith('.zip')) continue

    const fileName = basename(filePath)
    const destination = join(packsDir, fileName)

    try {
      await fs.copyFile(filePath, destination)
      const stats = await fs.stat(destination)
      const packInfo = extractZipPackInfo(destination)
      const cleanName = fileName.replace(/\.zip$/i, '')

      const newRecord: InstalledResourcePackRecord = {
        id: `manual-${cleanName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`,
        name: cleanName,
        version: '1.0.0',
        filename: fileName,
        source: 'modrinth',
        iconUrl: packInfo.iconDataUrl,
        description: packInfo.description,
        installedAt: new Date().toISOString(),
        enabled: true,
        fileSizeBytes: stats.size
      }

      installedPacks.push(newRecord)
    } catch {}
  }

  if (installedPacks.length === 0) {
    return { success: false, installedPacks: [] }
  }

  const metaPath = getResourcePacksMetadataPath(instanceId)
  const existing = (await readJsonFile<InstalledResourcePackRecord[]>(metaPath)) || []

  for (const newPack of installedPacks) {
    const idx = existing.findIndex((p) => p.filename === newPack.filename)
    if (idx >= 0) {
      existing[idx] = newPack
    } else {
      existing.push(newPack)
    }
  }

  await writeJsonFileAtomic(metaPath, existing)
  return { success: true, installedPacks }
}
