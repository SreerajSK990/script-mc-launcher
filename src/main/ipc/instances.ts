import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type { CreateInstancePayload, UpdateInstancePayload } from '@shared/types/instance'
import {
  listAllInstances,
  getInstanceById,
  createNewInstance,
  updateExistingInstance,
  deleteInstanceById
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
}
