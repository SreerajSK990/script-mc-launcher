import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type { ModLoaderType } from '@shared/types/instance'
import { getAvailableMinecraftVersions } from '@main/core/minecraft/meta'
import { getCompatibleLoaderVersions } from '@main/core/meta/prism'

export function registerMetaIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.META_GET_VERSIONS, async () => {
    return await getAvailableMinecraftVersions()
  })

  ipcMain.handle(
    IPC_CHANNELS.META_GET_LOADER_VERSIONS,
    async (_event, loaderType: ModLoaderType, minecraftVersion: string) => {
      return await getCompatibleLoaderVersions(loaderType, minecraftVersion)
    }
  )
}
