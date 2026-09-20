import { ipcMain, BrowserWindow, dialog } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type { CloneInstancePayload } from '@shared/types/externalLauncher'
import {
  scanExternalInstances,
  scanCustomDirectory,
  cloneExternalInstance
} from '@main/core/importers/externalLaunchers'

export function registerExternalLauncherIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.LAUNCHERS_SCAN_ALL, async () => {
    return await scanExternalInstances()
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCHERS_SCAN_DIRECTORY, async (_event, directoryPath: string) => {
    return await scanCustomDirectory(directoryPath)
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCHERS_SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Minecraft Instance or Launcher Folder',
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCHERS_CLONE, async (_event, payload: CloneInstancePayload) => {
    return await cloneExternalInstance(payload, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.LAUNCHERS_CLONE_PROGRESS_EVENT, progress)
      }
    })
  })
}
