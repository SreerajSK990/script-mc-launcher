import { withInstanceOperation, assertInstanceIdle } from './instanceOperations'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type {
  InstanceConfiguration,
  CreateInstancePayload,
  UpdateInstancePayload
} from '@shared/types/instance'
import { DEFAULT_INSTANCE_SETTINGS } from '@shared/constants/defaults'
import AdmZip from 'adm-zip'
import {
  getInstancesDirectory,
  getInstancePath,
  getInstanceConfigPath,
  getInstanceMinecraftPath,
  getMetaCacheDirectory
} from '@main/services/paths'
import { isInstanceRunning } from '@main/services/launch'
import {
  ensureDirectoryExists,
  readJsonFile,
  writeJsonFileAtomic,
  removeDirectorySafely,
  doesPathExist
} from '@main/utils/filesystem'

function generateInstanceId(name: string): string {
  const sanitizedName = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)

  const randomSuffix = randomBytes(4).toString('hex')
  return sanitizedName ? `${sanitizedName}-${randomSuffix}` : `instance-${randomSuffix}`
}

export async function listAllInstances(): Promise<InstanceConfiguration[]> {
  const instancesDirectory = getInstancesDirectory()
  await ensureDirectoryExists(instancesDirectory)

  const directoryEntries = await fs.readdir(instancesDirectory, { withFileTypes: true })
  const instances: InstanceConfiguration[] = []

  for (const entry of directoryEntries) {
    if (!entry.isDirectory()) {
      continue
    }

    const configPath = getInstanceConfigPath(entry.name)
    const config = await readJsonFile<InstanceConfiguration>(configPath)

    if (config) {
      instances.push(config)
    }
  }

  return instances.sort((a, b) => {
    const timeA = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : new Date(a.createdAt).getTime()
    const timeB = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : new Date(b.createdAt).getTime()
    return timeB - timeA
  })
}

export async function getInstanceById(instanceId: string): Promise<InstanceConfiguration | null> {
  const configPath = getInstanceConfigPath(instanceId)
  return readJsonFile<InstanceConfiguration>(configPath)
}

export async function createNewInstance(payload: CreateInstancePayload): Promise<InstanceConfiguration> {
  const instanceId = generateInstanceId(payload.name)
  const instanceDirectory = getInstancePath(instanceId)
  const minecraftDirectory = getInstanceMinecraftPath(instanceId)

  await ensureDirectoryExists(instanceDirectory)
  await ensureDirectoryExists(minecraftDirectory)
  await ensureDirectoryExists(join(minecraftDirectory, 'mods'))
  await ensureDirectoryExists(join(minecraftDirectory, 'saves'))
  await ensureDirectoryExists(join(minecraftDirectory, 'config'))

  const now = new Date().toISOString()

  const newInstance: InstanceConfiguration = {
    id: instanceId,
    name: payload.name.trim(),
    minecraftVersion: payload.minecraftVersion || DEFAULT_INSTANCE_SETTINGS.MINECRAFT_VERSION,
    loaderType: payload.loaderType || DEFAULT_INSTANCE_SETTINGS.LOADER_TYPE,
    loaderVersion: payload.loaderVersion ?? null,
    javaPath: payload.javaPath ?? null,
    jvmArguments: payload.jvmArguments ?? [...DEFAULT_INSTANCE_SETTINGS.JVM_ARGUMENTS],
    ramAllocationMegabytes: payload.ramAllocationMegabytes ?? DEFAULT_INSTANCE_SETTINGS.RAM_ALLOCATION_MB,
    icon: payload.icon || 'minecraft_grass',
    group: payload.group ? payload.group.trim() : null,
    isFavorite: Boolean(payload.isFavorite),
    createdAt: now,
    lastPlayedAt: null,
    totalPlayTimeMinutes: 0
  }

  const configPath = getInstanceConfigPath(instanceId)
  await writeJsonFileAtomic(configPath, newInstance)

  return newInstance
}

async function updateExistingInstanceInternal(payload: UpdateInstancePayload): Promise<InstanceConfiguration> {
  const existing = await getInstanceById(payload.id)
  if (!existing) {
    throw new Error(`Instance with id "${payload.id}" does not exist.`)
  }

  const updated: InstanceConfiguration = {
    ...existing,
    name: payload.name !== undefined ? payload.name.trim() : existing.name,
    minecraftVersion: payload.minecraftVersion ?? existing.minecraftVersion,
    loaderType: payload.loaderType ?? existing.loaderType,
    loaderVersion: payload.loaderVersion !== undefined ? payload.loaderVersion : existing.loaderVersion,
    javaPath: payload.javaPath !== undefined ? payload.javaPath : existing.javaPath,
    jvmArguments: payload.jvmArguments ?? existing.jvmArguments,
    ramAllocationMegabytes: payload.ramAllocationMegabytes ?? existing.ramAllocationMegabytes,
    icon: payload.icon !== undefined ? payload.icon : existing.icon,
    group: payload.group !== undefined ? (payload.group ? payload.group.trim() : null) : existing.group,
    isFavorite: payload.isFavorite !== undefined ? payload.isFavorite : existing.isFavorite,
    lastPlayedAt: payload.lastPlayedAt !== undefined ? payload.lastPlayedAt : existing.lastPlayedAt,
    totalPlayTimeMinutes: payload.totalPlayTimeMinutes ?? existing.totalPlayTimeMinutes
  }

  const configPath = getInstanceConfigPath(payload.id)
  await writeJsonFileAtomic(configPath, updated)

  return updated
}

export async function setInstanceGroup(instanceId: string, group: string | null): Promise<InstanceConfiguration> {
  return await updateExistingInstance({
    id: instanceId,
    group: group ? group.trim() : null
  })
}

export async function renameGroup(oldName: string, newName: string): Promise<void> {
  const instances = await listAllInstances()
  const targetGroup = oldName.trim()
  const cleanNewName = newName.trim()

  for (const instance of instances) {
    if (instance.group === targetGroup) {
      await updateExistingInstance({
        id: instance.id,
        group: cleanNewName || null
      })
    }
  }
}

export async function disbandGroup(groupName: string): Promise<void> {
  const instances = await listAllInstances()
  const targetGroup = groupName.trim()

  for (const instance of instances) {
    if (instance.group === targetGroup) {
      await updateExistingInstance({
        id: instance.id,
        group: null
      })
    }
  }
}

export async function deleteGroup(groupName: string): Promise<void> {
  const instances = await listAllInstances()
  const targetGroup = groupName.trim()

  for (const instance of instances) {
    if (instance.group === targetGroup) {
      await deleteInstanceById(instance.id)
    }
  }
}

export async function saveInstanceCustomIcon(instanceId: string, dataUrl: string): Promise<string> {
  const instanceDir = getInstancePath(instanceId)
  await ensureDirectoryExists(instanceDir)

  const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/)
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid image data URL format')
  }

  const buffer = Buffer.from(matches[2], 'base64')
  const iconFileName = 'icon.png'
  const targetFilePath = join(instanceDir, iconFileName)
  await fs.writeFile(targetFilePath, buffer)

  await updateExistingInstance({
    id: instanceId,
    icon: dataUrl
  })

  return dataUrl
}

async function deleteInstanceByIdInternal(instanceId: string): Promise<boolean> {
  const instanceDirectory = getInstancePath(instanceId)
  const exists = await doesPathExist(instanceDirectory)

  if (!exists) {
    return false
  }

  await removeDirectorySafely(instanceDirectory)
  return true
}

export async function toggleInstanceFavorite(instanceId: string): Promise<InstanceConfiguration> {
  const instance = await getInstanceById(instanceId)
  if (!instance) {
    throw new Error(`Instance not found: ${instanceId}`)
  }

  const updatedFavorite = !Boolean(instance.isFavorite)
  return await updateExistingInstance({
    id: instanceId,
    isFavorite: updatedFavorite
  })
}

async function repairInstanceInternal(instanceId: string): Promise<{ success: boolean; message: string }> {
  const instance = await getInstanceById(instanceId)
  if (!instance) {
    throw new Error(`Instance ${instanceId} does not exist.`)
  }

  if (isInstanceRunning(instanceId)) {
    throw new Error('Cannot repair an instance while it is actively running. Please close the game first.')
  }

  const nativesDir = join(getInstancePath(instanceId), 'natives')
  if (await doesPathExist(nativesDir)) {
    await removeDirectorySafely(nativesDir)
  }

  const metaCacheDir = getMetaCacheDirectory()
  const versionMetaFile = join(metaCacheDir, `version-${instance.minecraftVersion}.json`)
  if (await doesPathExist(versionMetaFile)) {
    try {
      await fs.unlink(versionMetaFile)
    } catch {}
  }

  return {
    success: true,
    message: `Instance "${instance.name}" repaired successfully. Dependencies and runtime libraries will be verified and re-downloaded on next launch.`
  }
}

async function backupInstanceSavesInternal(instanceId: string): Promise<{ success: boolean; backupPath: string }> {
  const instance = await getInstanceById(instanceId)
  if (!instance) {
    throw new Error(`Instance ${instanceId} does not exist.`)
  }

  const savesDir = join(getInstanceMinecraftPath(instanceId), 'saves')
  const savesExist = await doesPathExist(savesDir)
  if (!savesExist) {
    return {
      success: true,
      backupPath: 'No saves directory found to backup.'
    }
  }

  const backupsDir = join(getInstancePath(instanceId), 'backups')
  await ensureDirectoryExists(backupsDir)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFileName = `saves-backup-${timestamp}.zip`
  const backupFilePath = join(backupsDir, backupFileName)

  const zip = new AdmZip()
  zip.addLocalFolder(savesDir)
  zip.writeZip(backupFilePath)

  return {
    success: true,
    backupPath: backupFilePath
  }
}

async function cloneInstanceInternal(
  instanceId: string,
  customName?: string
): Promise<InstanceConfiguration> {
  const source = await getInstanceById(instanceId)
  if (!source) {
    throw new Error(`Instance ${instanceId} does not exist.`)
  }

  const newName = customName?.trim() || `${source.name} (Backup)`
  const newInstance = await createNewInstance({
    name: newName,
    minecraftVersion: source.minecraftVersion,
    loaderType: source.loaderType,
    loaderVersion: source.loaderVersion,
    ramAllocationMegabytes: source.ramAllocationMegabytes,
    javaPath: source.javaPath,
    jvmArguments: source.jvmArguments,
    icon: source.icon,
    group: source.group
  })

  const sourceMinecraftDir = getInstanceMinecraftPath(source.id)
  const targetMinecraftDir = getInstanceMinecraftPath(newInstance.id)

  if (await doesPathExist(sourceMinecraftDir)) {
    await ensureDirectoryExists(targetMinecraftDir)
    const items = await fs.readdir(sourceMinecraftDir)
    for (const item of items) {
      if (item === 'crash-reports' || item === 'logs' || item === '.fabric' || item === '.quilt') {
        continue
      }
      const srcItem = join(sourceMinecraftDir, item)
      const dstItem = join(targetMinecraftDir, item)
      try {
        await fs.cp(srcItem, dstItem, { recursive: true })
      } catch (copyErr) {
        console.warn(`Failed to copy item during clone: ${item}`, copyErr)
      }
    }
  }

  for (const filename of ['mods.json', 'resourcepacks.json', 'shaders.json']) {
    const metadata = join(getInstancePath(source.id), filename)
    if (await doesPathExist(metadata)) await fs.copyFile(metadata, join(getInstancePath(newInstance.id), filename))
  }

  return newInstance
}




export async function deleteInstanceById(instanceId: string): Promise<boolean> {
  assertInstanceIdle(instanceId)
  if (!(await getInstanceById(instanceId))) return false
  return withInstanceOperation(instanceId, 'deleting instance', () => deleteInstanceByIdInternal(instanceId))
}

export async function repairInstance(instanceId: string): Promise<{ success: boolean; message: string }> {
  return withInstanceOperation(instanceId, 'repairing instance', () => repairInstanceInternal(instanceId))
}

export async function backupInstanceSaves(instanceId: string): Promise<{ success: boolean; backupPath: string }> {
  return withInstanceOperation(instanceId, 'backing up saves', () => backupInstanceSavesInternal(instanceId))
}

export async function cloneInstance(instanceId: string, customName?: string): Promise<InstanceConfiguration> {
  return withInstanceOperation(instanceId, 'cloning instance', () => cloneInstanceInternal(instanceId, customName))
}

export async function updateExistingInstance(payload: UpdateInstancePayload): Promise<InstanceConfiguration> {
  if (payload.minecraftVersion !== undefined || payload.loaderType !== undefined || payload.loaderVersion !== undefined || payload.javaPath !== undefined || payload.jvmArguments !== undefined || payload.ramAllocationMegabytes !== undefined) {
    return withInstanceOperation(payload.id, 'changing instance configuration', () => updateExistingInstanceInternal(payload))
  }
  return updateExistingInstanceInternal(payload)
}
