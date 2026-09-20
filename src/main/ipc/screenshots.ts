import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import {
  listInstanceScreenshots,
  deleteInstanceScreenshot,
  getScreenshotsDirectory
} from '@main/core/minecraft/screenshots'
import { ensureDirectoryExists } from '@main/utils/filesystem'

export function registerScreenshotIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SCREENSHOTS_LIST, async (_event, instanceId: string) => {
    return await listInstanceScreenshots(instanceId)
  })

  ipcMain.handle(
    IPC_CHANNELS.SCREENSHOTS_DELETE,
    async (_event, instanceId: string, filename: string) => {
      return await deleteInstanceScreenshot(instanceId, filename)
    }
  )

  ipcMain.handle(IPC_CHANNELS.SCREENSHOTS_OPEN_FOLDER, async (_event, instanceId: string) => {
    const dir = getScreenshotsDirectory(instanceId)
    await ensureDirectoryExists(dir)
    await shell.openPath(dir)
  })
}
