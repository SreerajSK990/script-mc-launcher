import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type { ModSearchParams, InstallModPayload, ModSource, ModUpdateInfo } from '@shared/types/mods'
import type { ModLoaderType } from '@shared/types/instance'
import {
  searchAllMods,
  fetchModDetail,
  fetchModVersions,
  installMod,
  listMods,
  toggleMod,
  deleteMod,
  setCurseForgeApiKey,
  getCurseForgeApiKey
} from '@main/services/mods'
import { checkForModUpdates, updateAllMods } from '@main/core/mods/updates'

export function registerModsIpcHandlers(mainWindow?: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.MODS_SEARCH, async (_event, params: ModSearchParams) => {
    return await searchAllMods(params)
  })

  ipcMain.handle(IPC_CHANNELS.MODS_GET_DETAIL, async (_event, source: ModSource, id: string) => {
    return await fetchModDetail(source, id)
  })

  ipcMain.handle(
    IPC_CHANNELS.MODS_GET_VERSIONS,
    async (
      _event,
      projectId: string,
      source: ModSource,
      minecraftVersion?: string,
      loader?: ModLoaderType
    ) => {
      try {
        return await fetchModVersions(projectId, source, minecraftVersion, loader)
      } catch (err) {
        console.warn(`IPC mods:get-versions error for ${projectId}:`, err)
        return []
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.MODS_INSTALL, async (_event, payload: InstallModPayload) => {
    return await installMod(payload)
  })

  ipcMain.handle(IPC_CHANNELS.MODS_LIST_INSTALLED, async (_event, instanceId: string) => {
    return await listMods(instanceId)
  })

  ipcMain.handle(
    IPC_CHANNELS.MODS_TOGGLE_INSTALLED,
    async (_event, instanceId: string, filename: string, enable: boolean) => {
      return await toggleMod(instanceId, filename, enable)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MODS_DELETE_INSTALLED,
    async (_event, instanceId: string, filename: string) => {
      return await deleteMod(instanceId, filename)
    }
  )

  ipcMain.handle(IPC_CHANNELS.MODS_SET_CURSEFORGE_KEY, async (_event, key: string | null) => {
    setCurseForgeApiKey(key)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.MODS_GET_CURSEFORGE_KEY, async () => {
    return getCurseForgeApiKey()
  })

  ipcMain.handle(IPC_CHANNELS.MODS_CHECK_UPDATES, async (_event, instanceId: string) => {
    try {
      return await checkForModUpdates(instanceId)
    } catch (err) {
      console.warn('Failed to check for mod updates:', err)
      return []
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.MODS_UPDATE_ALL,
    async (_event, instanceId: string, updates: ModUpdateInfo[]) => {
      try {
        return await updateAllMods(instanceId, updates, (progress) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.MODS_UPDATE_PROGRESS_EVENT, progress)
          }
        })
      } catch (err) {
        console.error('Failed to update all mods:', err)
        return { success: false, updatedCount: 0 }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MODS_INSTALL_DROPPED,
    async (_event, instanceId: string, filePaths: string[]) => {
      try {
        const { installDroppedModFiles } = await import('@main/core/mods/drop')
        return await installDroppedModFiles(instanceId, filePaths)
      } catch (err) {
        console.error('Failed to install dropped mods:', err)
        return { success: false, installedMods: [] }
      }
    }
  )
}

