import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import { launchInstance, stopRunningInstance } from '@main/services/launch'
export function registerLaunchIpcHandlers(mainWindow?: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.LAUNCH_START, async (_event, instanceId: string) => {
    return await launchInstance(
      instanceId,
      (progressEvent) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.LAUNCH_STATUS_EVENT, progressEvent)
        }
      },
      (logEvent) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.LAUNCH_LOG_EVENT, logEvent)
        }
      }
    )
  })

  ipcMain.handle(IPC_CHANNELS.LAUNCH_STOP, async (_event, instanceId: string) => {
    return stopRunningInstance(instanceId)
  })
}
