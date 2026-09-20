import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type {
  InstanceConfiguration,
  CreateInstancePayload,
  UpdateInstancePayload
} from '@shared/types/instance'
import { DEFAULT_INSTANCE_SETTINGS } from '@shared/constants/defaults'
import {
  getInstancesDirectory,
  getInstancePath,
  getInstanceConfigPath,
  getInstanceMinecraftPath
} from '@main/services/paths'
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

export async function updateExistingInstance(payload: UpdateInstancePayload): Promise<InstanceConfiguration> {
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

export async function deleteInstanceById(instanceId: string): Promise<boolean> {
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



