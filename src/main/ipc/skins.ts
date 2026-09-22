import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import {
  listAllSkins,
  getActiveSkinId,
  setActiveSkin,
  saveSkin,
  deleteSkin,
  searchPlayerSkin,
  listAllCapes,
  setActiveCape,
  saveCustomCape,
  deleteCustomCape,
  fetchOptifineCape,
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

  ipcMain.handle(IPC_CHANNELS.SKINS_LIST_CAPES, async () => {
    try {
      return await listAllCapes()
    } catch (error) {
      console.error('Failed to list capes:', error)
      return { activeCapeId: null, capes: [] }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SKINS_APPLY_CAPE, async (_event, capeId: string | null) => {
    try {
      return await setActiveCape(capeId)
    } catch (error) {
      console.error('Failed to apply cape:', error)
      return {
        success: false,
        equippedToMojang: false,
        message: error instanceof Error ? error.message : 'Failed to apply cape'
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SKINS_SAVE_CAPE, async (_event, params: { name: string; textureData: string }) => {
    return await saveCustomCape(params)
  })

  ipcMain.handle(IPC_CHANNELS.SKINS_DELETE_CAPE, async (_event, capeId: string) => {
    return await deleteCustomCape(capeId)
  })

  ipcMain.handle(IPC_CHANNELS.SKINS_SEARCH_OPTIFINE_CAPE, async (_event, username: string) => {
    return await fetchOptifineCape(username)
  })
}

