import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import { checkForUpdatesManual, quitAndInstallUpdate } from '@main/services/updater'

export function registerUpdaterIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.UPDATER_CHECK, async () => {
    return await checkForUpdatesManual()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATER_QUIT_AND_INSTALL, async () => {
    quitAndInstallUpdate()
  })
}
