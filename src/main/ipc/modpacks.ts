import { ipcMain, BrowserWindow, dialog } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type { InstallRemoteModpackPayload } from '@shared/types/modpack'
import {
  parseModpackArchive,
  importModpackArchive,
  downloadAndInstallRemoteModpack
} from '@main/core/modpacks/importer'

export function registerModpackIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.MODPACKS_SELECT_FILE, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Modpack Archive',
      properties: ['openFile'],
      filters: [
        { name: 'Modpacks (*.mrpack, *.zip)', extensions: ['mrpack', 'zip'] },
        { name: 'Modrinth Modpack (*.mrpack)', extensions: ['mrpack'] },
        { name: 'CurseForge Modpack (*.zip)', extensions: ['zip'] },
        { name: 'All Files (*.*)', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.MODPACKS_INSPECT, async (_event, filePath: string) => {
    return await parseModpackArchive(filePath)
  })

  ipcMain.handle(
    IPC_CHANNELS.MODPACKS_IMPORT,
    async (_event, filePath: string, customName?: string) => {
      return await importModpackArchive(filePath, customName, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.MODPACKS_PROGRESS_EVENT, progress)
        }
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MODPACKS_INSTALL_REMOTE,
    async (_event, payload: InstallRemoteModpackPayload) => {
      if (!payload.versionFile.downloadUrl) {
        throw new Error('Direct download is not available for this modpack version.')
      }
      return await downloadAndInstallRemoteModpack(
        payload.versionFile.downloadUrl,
        payload.versionFile.filename,
        payload.customInstanceName,
        (progress) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.MODPACKS_PROGRESS_EVENT, progress)
          }
        }
      )
    }
  )
}
