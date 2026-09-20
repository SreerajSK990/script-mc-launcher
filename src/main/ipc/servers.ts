import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import {
  getAllQuickPlayTargets,
  pingMinecraftServer,
  listInstanceServers,
  addInstanceServer,
  removeInstanceServer
} from '@main/core/minecraft/servers'
import type { AddServerPayload, RemoveServerPayload } from '@shared/types/servers'

export function registerServersIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SERVERS_LIST_ALL, async () => {
    try {
      return await getAllQuickPlayTargets()
    } catch (error) {
      console.error('Failed to retrieve quick play targets:', error)
      return []
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.SERVERS_LIST_INSTANCE,
    async (_event, instanceId: string) => {
      try {
        return await listInstanceServers(instanceId)
      } catch (error) {
        console.error('Failed to list instance servers:', error)
        return []
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SERVERS_ADD,
    async (_event, payload: AddServerPayload) => {
      try {
        return await addInstanceServer(payload.instanceId, {
          name: payload.name,
          ip: payload.ip
        })
      } catch (error: any) {
        console.error('Failed to add server to instance:', error)
        throw new Error(error?.message || 'Failed to add server')
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SERVERS_REMOVE,
    async (_event, payload: RemoveServerPayload) => {
      try {
        return await removeInstanceServer(payload.instanceId, payload.serverIp)
      } catch (error: any) {
        console.error('Failed to remove server from instance:', error)
        throw new Error(error?.message || 'Failed to remove server')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.SERVERS_PING, async (_event, host: string, port?: number) => {
    try {
      return await pingMinecraftServer(host, port)
    } catch {
      return {
        online: false,
        latencyMs: -1
      }
    }
  })
}
