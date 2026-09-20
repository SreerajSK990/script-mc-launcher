import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import {
  listAllSkins,
  getActiveSkinId,
  setActiveSkin,
  saveSkin,
  deleteSkin,
  searchPlayerSkin,
  type SaveSkinParams
} from '@main/core/system/skins'

export function registerSkinsIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SKINS_LIST, async () => {
    try {
      return await listAllSkins()
    } catch (error) {
      console.error('Failed to list skins:', error)
      return { activeSkinId: null, skins: [] }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SKINS_GET_ACTIVE, async () => {
    try {
      return await getActiveSkinId()
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.SKINS_APPLY, async (_event, skinId: string) => {
    try {
      return await setActiveSkin(skinId)
    } catch (error) {
      console.error('Failed to apply skin:', error)
      return {
        success: false,
        uploadedToMojang: false,
        message: error instanceof Error ? error.message : 'Failed to apply skin'
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SKINS_SAVE, async (_event, params: SaveSkinParams) => {
    return await saveSkin(params)
  })

  ipcMain.handle(IPC_CHANNELS.SKINS_DELETE, async (_event, skinId: string) => {
    return await deleteSkin(skinId)
  })

  ipcMain.handle(IPC_CHANNELS.SKINS_SEARCH_PLAYER, async (_event, username: string) => {
    return await searchPlayerSkin(username)
  })
}
