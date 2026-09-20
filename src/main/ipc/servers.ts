import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import { getAllQuickPlayTargets, pingMinecraftServer } from '@main/core/minecraft/servers'

export function registerServersIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SERVERS_LIST_ALL, async () => {
    try {
      return await getAllQuickPlayTargets()
    } catch (error) {
      console.error('Failed to retrieve quick play targets:', error)
      return []
    }
  })

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
