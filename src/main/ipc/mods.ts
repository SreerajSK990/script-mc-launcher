import type { OperationResult } from '@shared/types/operations'
import { withTransfer } from '@main/utils/download'
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

async function resultOf<T>(work: () => Promise<T>): Promise<OperationResult<T>> {
  try {
    return { success: true, data: await work() }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function registerModsIpcHandlers(mainWindow?: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.MODS_SEARCH, async (_event, params: ModSearchParams) => {
    return resultOf(() => searchAllMods(params))
  })

  ipcMain.handle(IPC_CHANNELS.MODS_GET_DETAIL, async (_event, source: ModSource, id: string) => {
    return resultOf(() => fetchModDetail(source, id))
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
    try {
      const data = await withTransfer(
        payload.instanceId,
        (progress) => {
          if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send(IPC_CHANNELS.CONTENT_TRANSFER_PROGRESS, progress)
        },
        () => installMod(payload)
      )
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MODS_LIST_INSTALLED, async (_event, instanceId: string) => {
    return resultOf(() => listMods(instanceId))
  })

  ipcMain.handle(
    IPC_CHANNELS.MODS_TOGGLE_INSTALLED,
    async (_event, instanceId: string, filename: string, enable: boolean) => {
      return resultOf(() => toggleMod(instanceId, filename, enable))
    }
  )

  ipcMain.handle(IPC_CHANNELS.MODS_DELETE_INSTALLED, async (_event, instanceId: string, filename: string) => {
    return resultOf(() => deleteMod(instanceId, filename))
  })

  ipcMain.handle(IPC_CHANNELS.MODS_SET_CURSEFORGE_KEY, async (_event, key: string | null) => {
    setCurseForgeApiKey(key)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.MODS_GET_CURSEFORGE_KEY, async () => {
    return getCurseForgeApiKey()
  })

  ipcMain.handle(
    IPC_CHANNELS.MODS_CHECK_UPDATES,
    async (_event, instanceId: string, forceRefresh?: boolean) => {
      try {
        return await checkForModUpdates(instanceId, forceRefresh)
      } catch (err) {
        console.warn('Failed to check for mod updates:', err)
        return []
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MODS_UPDATE_ALL,
    async (_event, instanceId: string, updates: ModUpdateInfo[]) => {
      try {
        return await withTransfer(
          instanceId,
          (progress) => {
            if (mainWindow && !mainWindow.isDestroyed())
              mainWindow.webContents.send(IPC_CHANNELS.CONTENT_TRANSFER_PROGRESS, progress)
          },
          () =>
            updateAllMods(instanceId, updates, (progress) => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(IPC_CHANNELS.MODS_UPDATE_PROGRESS_EVENT, {
                  ...progress,
                  instanceId
                })
              }
            })
        )
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        return {
          success: false,
          updatedCount: 0,
          failures: updates.map((item) => ({
            modId: item.modId,
            source: item.source,
            name: item.name,
            error
          })),
          error
        }
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
