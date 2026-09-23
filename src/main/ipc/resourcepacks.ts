import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type { InstallModPayload } from '@shared/types/mods'
import {
  listInstalledResourcePacks,
  installResourcePackToInstance,
  toggleResourcePackEnabled,
  deleteInstalledResourcePack,
  installDroppedResourcePacks,
  getResourcePacksDirectory
} from '@main/core/resourcepacks/manager'
import { ensureDirectoryExists } from '@main/utils/filesystem'

export function registerResourcePacksIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.RESOURCEPACKS_LIST_INSTALLED, async (_event, instanceId: string) => {
    try {
      return await listInstalledResourcePacks(instanceId)
    } catch (err) {
      console.error('Failed to list installed resource packs:', err)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.RESOURCEPACKS_INSTALL, async (_event, payload: InstallModPayload) => {
    try {
      return await installResourcePackToInstance(payload)
    } catch (err) {
      console.error('Failed to install resource pack:', err)
      throw err
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.RESOURCEPACKS_TOGGLE_INSTALLED,
    async (_event, instanceId: string, filename: string, enable: boolean) => {
      try {
        return await toggleResourcePackEnabled(instanceId, filename, enable)
      } catch (err) {
        console.error('Failed to toggle resource pack:', err)
        return false
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.RESOURCEPACKS_DELETE_INSTALLED,
    async (_event, instanceId: string, filename: string) => {
      try {
        return await deleteInstalledResourcePack(instanceId, filename)
      } catch (err) {
        console.error('Failed to delete resource pack:', err)
        return false
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.RESOURCEPACKS_INSTALL_DROPPED,
    async (_event, instanceId: string, filePaths: string[]) => {
      try {
        return await installDroppedResourcePacks(instanceId, filePaths)
      } catch (err) {
        console.error('Failed to install dropped resource packs:', err)
        return { success: false, installedPacks: [] }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.RESOURCEPACKS_OPEN_FOLDER, async (_event, instanceId: string) => {
    try {
      const dir = getResourcePacksDirectory(instanceId)
      await ensureDirectoryExists(dir)
      await shell.openPath(dir)
    } catch (err) {
      console.error('Failed to open resource packs folder:', err)
    }
  })
}
