import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type { CreateInstancePayload, UpdateInstancePayload } from '@shared/types/instance'
import {
  listAllInstances,
  getInstanceById,
  createNewInstance,
  updateExistingInstance,
  deleteInstanceById,
  setInstanceGroup,
  renameGroup,
  disbandGroup,
  deleteGroup,
  saveInstanceCustomIcon,
  toggleInstanceFavorite
} from '@main/services/instances'
import { getInstancePath } from '@main/services/paths'

export function registerInstanceIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.INSTANCES_LIST, async () => {
    return await listAllInstances()
  })

  ipcMain.handle(IPC_CHANNELS.INSTANCES_GET, async (_event, instanceId: string) => {
    return await getInstanceById(instanceId)
  })

  ipcMain.handle(IPC_CHANNELS.INSTANCES_CREATE, async (_event, payload: CreateInstancePayload) => {
    return await createNewInstance(payload)
  })

  ipcMain.handle(IPC_CHANNELS.INSTANCES_UPDATE, async (_event, payload: UpdateInstancePayload) => {
    return await updateExistingInstance(payload)
  })

  ipcMain.handle(IPC_CHANNELS.INSTANCES_DELETE, async (_event, instanceId: string) => {
    return await deleteInstanceById(instanceId)
  })

  ipcMain.handle(IPC_CHANNELS.INSTANCES_OPEN_FOLDER, async (_event, instanceId: string) => {
    const targetPath = getInstancePath(instanceId)
    await shell.openPath(targetPath)
  })

  ipcMain.handle(IPC_CHANNELS.INSTANCES_SET_GROUP, async (_event, instanceId: string, group: string | null) => {
    return await setInstanceGroup(instanceId, group)
  })

  ipcMain.handle(IPC_CHANNELS.INSTANCES_RENAME_GROUP, async (_event, oldName: string, newName: string) => {
    return await renameGroup(oldName, newName)
  })

  ipcMain.handle(IPC_CHANNELS.INSTANCES_DISBAND_GROUP, async (_event, groupName: string) => {
    return await disbandGroup(groupName)
  })

  ipcMain.handle(IPC_CHANNELS.INSTANCES_DELETE_GROUP, async (_event, groupName: string) => {
    return await deleteGroup(groupName)
  })

  ipcMain.handle(IPC_CHANNELS.INSTANCES_SAVE_CUSTOM_ICON, async (_event, instanceId: string, dataUrl: string) => {
    return await saveInstanceCustomIcon(instanceId, dataUrl)
  })

  ipcMain.handle(IPC_CHANNELS.INSTANCES_TOGGLE_FAVORITE, async (_event, instanceId: string) => {
    return await toggleInstanceFavorite(instanceId)
  })
}


