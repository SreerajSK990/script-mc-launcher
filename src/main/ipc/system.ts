import { ipcMain, BrowserWindow, shell, dialog } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import { getSystemEnvironment } from '@main/services/system'

export function registerSystemIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize()
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return mainWindow.isMaximized()
    }
    return false
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close()
    }
  })

  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_ENVIRONMENT, async () => {
    return await getSystemEnvironment()
  })

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, async (_event, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_DIRECTORY, async (_event, directoryPath: string) => {
    await shell.openPath(directoryPath)
  })

  ipcMain.handle(
    IPC_CHANNELS.SYSTEM_SELECT_FILE,
    async (
      _event,
      options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }
    ) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: options?.title || 'Select File',
        properties: ['openFile'],
        filters: options?.filters
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return result.filePaths[0]
    }
  )
}

