import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { getInstancePath, getInstanceMinecraftPath } from '@main/services/paths'
import {
  readJsonFile,
  writeJsonFileAtomic,
  doesPathExist,
  ensureDirectoryExists
} from '@main/utils/filesystem'
import { downloadFileWithHash } from '@main/utils/download'
import type { InstalledModRecord, InstallModPayload } from '@shared/types/mods'

export function getModsDirectory(instanceId: string): string {
  return join(getInstanceMinecraftPath(instanceId), 'mods')
}

export function getModsMetadataPath(instanceId: string): string {
  return join(getInstancePath(instanceId), 'mods.json')
}

export async function listInstalledMods(instanceId: string): Promise<InstalledModRecord[]> {
  const modsDir = getModsDirectory(instanceId)
  await ensureDirectoryExists(modsDir)

  const metaPath = getModsMetadataPath(instanceId)
  const savedMods = (await readJsonFile<InstalledModRecord[]>(metaPath)) || []

  let diskEntries: string[] = []
  try {
    diskEntries = await fs.readdir(modsDir)
  } catch {
    diskEntries = []
  }

  const diskFilesMap = new Map<string, { enabled: boolean; originalFilename: string; size: number }>()

  for (const entry of diskEntries) {
    const fullPath = join(modsDir, entry)
    try {
      const stats = await fs.stat(fullPath)
      if (!stats.isFile()) continue

      if (entry.endsWith('.jar')) {
        diskFilesMap.set(entry, { enabled: true, originalFilename: entry, size: stats.size })
      } else if (entry.endsWith('.jar.disabled')) {
        const baseName = entry.slice(0, -9)
        diskFilesMap.set(baseName, { enabled: false, originalFilename: entry, size: stats.size })
      }
    } catch {
      // Ignore unreadable entries
    }
  }

  const syncedList: InstalledModRecord[] = []
  const recognizedFilenames = new Set<string>()

  for (const record of savedMods) {
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
      syncedList.push({
        id: `manual-${filename.replace(/\.jar$/, '').toLowerCase()}`,
        name: filename.replace(/\.jar$/, ''),
        version: 'custom',
        filename,
        source: 'modrinth',
        installedAt: new Date().toISOString(),
        enabled: info.enabled,
        fileSizeBytes: info.size
      })
    }
  }

  await writeJsonFileAtomic(metaPath, syncedList)
  return syncedList
}

export async function installModToInstance(payload: InstallModPayload): Promise<InstalledModRecord> {
  const modsDir = getModsDirectory(payload.instanceId)
  await ensureDirectoryExists(modsDir)

  const destination = join(modsDir, payload.versionFile.filename)

  if (!payload.versionFile.downloadUrl) {
    throw new Error('Direct download is not available for this version. Please use "Download from Website".')
  }

  const hashAlgo = payload.versionFile.sha512 ? 'sha512' : 'sha1'
  const expectedHash = payload.versionFile.sha512 || payload.versionFile.sha1

  await downloadFileWithHash(payload.versionFile.downloadUrl, destination, expectedHash, hashAlgo)

  let statsSize = payload.versionFile.sizeBytes
  try {
    const stats = await fs.stat(destination)
    statsSize = stats.size
  } catch {
    // Keep sizeBytes fallback
  }

  const newRecord: InstalledModRecord = {
    id: payload.modMetadata.id,
    name: payload.modMetadata.name,
    version: payload.versionFile.versionNumber,
    filename: payload.versionFile.filename,
    source: payload.modMetadata.source,
    iconUrl: payload.modMetadata.iconUrl,
    installedAt: new Date().toISOString(),
    enabled: true,
    fileSizeBytes: statsSize,
    gameVersion: payload.versionFile.gameVersions[0],
    loader: payload.versionFile.loaders[0]
  }

  const metaPath = getModsMetadataPath(payload.instanceId)
  const existingMods = (await readJsonFile<InstalledModRecord[]>(metaPath)) || []

  // Check for previous file that needs cleanup
  const oldFilesToRemove = new Set<string>()
  if (payload.oldFilename && payload.oldFilename !== payload.versionFile.filename) {
    oldFilesToRemove.add(payload.oldFilename)
  }

  const previousRecord = existingMods.find(
    (mod) =>
      mod.id === newRecord.id ||
      (payload.oldFilename && (mod.filename === payload.oldFilename || mod.filename === `${payload.oldFilename}.disabled`))
  )

  if (previousRecord && previousRecord.filename !== payload.versionFile.filename) {
    oldFilesToRemove.add(previousRecord.filename)
  }

  for (const oldFile of oldFilesToRemove) {
    const activeOld = join(modsDir, oldFile)
    const disabledOld = join(modsDir, `${oldFile}.disabled`)
    await fs.rm(activeOld, { force: true }).catch(() => {})
    await fs.rm(disabledOld, { force: true }).catch(() => {})
  }

  const updatedMods = existingMods.filter(
    (mod) =>
      mod.id !== newRecord.id &&
      mod.filename !== newRecord.filename &&
      !oldFilesToRemove.has(mod.filename)
  )
  updatedMods.push(newRecord)

  await writeJsonFileAtomic(metaPath, updatedMods)
  return newRecord
}

export async function toggleModEnabled(
  instanceId: string,
  filename: string,
  enable: boolean
): Promise<boolean> {
  const modsDir = getModsDirectory(instanceId)
  const activePath = join(modsDir, filename)
  const disabledPath = join(modsDir, `${filename}.disabled`)

  if (enable) {
    if (await doesPathExist(disabledPath)) {
      await fs.rename(disabledPath, activePath)
    }
  } else {
    if (await doesPathExist(activePath)) {
      await fs.rename(activePath, disabledPath)
    }
  }

  const metaPath = getModsMetadataPath(instanceId)
  const mods = (await readJsonFile<InstalledModRecord[]>(metaPath)) || []
  const target = mods.find((m) => m.filename === filename)
  if (target) {
    target.enabled = enable
    await writeJsonFileAtomic(metaPath, mods)
  }

  return true
}

export async function deleteInstalledMod(instanceId: string, filename: string): Promise<boolean> {
  const modsDir = getModsDirectory(instanceId)
  const activePath = join(modsDir, filename)
  const disabledPath = join(modsDir, `${filename}.disabled`)

  await fs.rm(activePath, { force: true }).catch(() => {})
  await fs.rm(disabledPath, { force: true }).catch(() => {})

  const metaPath = getModsMetadataPath(instanceId)
  const mods = (await readJsonFile<InstalledModRecord[]>(metaPath)) || []
  const filtered = mods.filter((m) => m.filename !== filename)

  await writeJsonFileAtomic(metaPath, filtered)
  return true
}
