import { planModInstallation } from './dependencies'
import { withInstanceOperation, validateFilename } from '@main/services/instanceOperations'
import { withModSnapshot, withModFileTransaction } from '@main/services/recovery'
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

  return syncedList
}

export async function installSingleModFile(payload: InstallModPayload): Promise<InstalledModRecord> {
  const modsDir = getModsDirectory(payload.instanceId)
  await ensureDirectoryExists(modsDir)

  validateFilename(payload.versionFile.filename)
  if (!payload.versionFile.filename.endsWith('.jar')) throw new Error('Expected a mod JAR file')
  if (payload.oldFilename) validateFilename(payload.oldFilename)
  const metaPath = getModsMetadataPath(payload.instanceId)
  const existingMods = (await readJsonFile<InstalledModRecord[]>(metaPath)) || []
  const previousRecord = existingMods.find(
    (mod) =>
      (mod.source === payload.modMetadata.source && mod.id === payload.modMetadata.id) ||
      mod.filename === payload.oldFilename
  )
  const collision = existingMods.find(
    (mod) => mod.filename === payload.versionFile.filename && mod !== previousRecord
  )
  if (collision) throw new Error(`Filename is already used by ${collision.name}`)
  const previousFilename = previousRecord?.filename || payload.oldFilename
  const activeExists = previousFilename ? await doesPathExist(join(modsDir, previousFilename)) : false
  const disabledExists = previousFilename
    ? await doesPathExist(join(modsDir, `${previousFilename}.disabled`))
    : false
  const enabled =
    disabledExists && !activeExists ? false : activeExists ? true : (previousRecord?.enabled ?? true)
  const destination = join(
    modsDir,
    enabled ? payload.versionFile.filename : `${payload.versionFile.filename}.disabled`
  )

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
    enabled,
    versionId: payload.versionFile.id,
    dependencies: payload.versionFile.dependencies,
    fileSizeBytes: statsSize,
    gameVersion: payload.versionFile.gameVersions[0],
    loader: payload.versionFile.loaders[0]
  }

  const oldFilesToRemove = new Set<string>()
  if (payload.oldFilename && payload.oldFilename !== newRecord.filename)
    oldFilesToRemove.add(payload.oldFilename)
  if (previousRecord && previousRecord.filename !== newRecord.filename)
    oldFilesToRemove.add(previousRecord.filename)

  for (const oldFile of oldFilesToRemove) {
    validateFilename(oldFile)
    const activeOld = join(modsDir, oldFile)
    const disabledOld = join(modsDir, `${oldFile}.disabled`)
    await fs.rm(activeOld, { force: true })
    await fs.rm(disabledOld, { force: true })
  }

  const updatedMods = existingMods.filter(
    (mod) =>
      !(mod.id === newRecord.id && mod.source === newRecord.source) &&
      mod.filename !== newRecord.filename &&
      !oldFilesToRemove.has(mod.filename)
  )
  updatedMods.push(newRecord)

  await writeJsonFileAtomic(metaPath, updatedMods)
  return newRecord
}

async function toggleModEnabledInternal(
  instanceId: string,
  filename: string,
  enable: boolean
): Promise<boolean> {
  const modsDir = getModsDirectory(instanceId)
  validateFilename(filename)
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

async function deleteInstalledModInternal(instanceId: string, filename: string): Promise<boolean> {
  const modsDir = getModsDirectory(instanceId)
  validateFilename(filename)
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

export async function installModToInstance(payload: InstallModPayload): Promise<InstalledModRecord> {
  return withInstanceOperation(payload.instanceId, 'installing mods', () =>
    installModWithDependencies(payload)
  )
}

export async function installModWithDependencies(
  payload: InstallModPayload,
  keepSnapshot = true
): Promise<InstalledModRecord> {
  const plan = await planModInstallation([payload])
  const install = async () => {
    let installed: InstalledModRecord | undefined
    for (const item of plan.items) {
      const result = await installSingleModFile(item)
      if (
        item.versionFile.id === payload.versionFile.id &&
        item.modMetadata.source === payload.modMetadata.source
      )
        installed = result
    }
    if (plan.reusedItems.length) {
      const records = await listInstalledMods(payload.instanceId)
      for (const item of plan.reusedItems) {
        const record = records.find(
          (mod) => mod.filename === item.versionFile.filename || mod.filename === item.oldFilename
        )
        if (record)
          Object.assign(record, {
            id: item.versionFile.projectId,
            source: item.modMetadata.source,
            versionId: item.versionFile.id,
            version: item.versionFile.versionNumber,
            dependencies: item.versionFile.dependencies
          })
      }
      await writeJsonFileAtomic(getModsMetadataPath(payload.instanceId), records)
    }
    if (!installed) throw new Error('Requested mod was not installed')
    return installed
  }
  return keepSnapshot
    ? withModSnapshot(payload.instanceId, `Before installing ${payload.modMetadata.name}`, install)
    : withModFileTransaction(payload.instanceId, plan.items, install)
}

export async function toggleModEnabled(
  instanceId: string,
  filename: string,
  enable: boolean
): Promise<boolean> {
  return withInstanceOperation(instanceId, 'changing mod state', () =>
    toggleModEnabledInternal(instanceId, filename, enable)
  )
}

export async function deleteInstalledMod(instanceId: string, filename: string): Promise<boolean> {
  return withInstanceOperation(instanceId, 'deleting mod', () =>
    withModSnapshot(instanceId, 'Before deleting mod', () => deleteInstalledModInternal(instanceId, filename))
  )
}
