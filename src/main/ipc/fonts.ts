import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import { listInstalledFonts, installCustomFont, deleteCustomFont } from '@main/core/system/fonts'

export function registerFontsIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FONTS_LIST, async () => {
    try {
      return await listInstalledFonts()
    } catch (err) {
      console.error('Failed to list fonts:', err)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.FONTS_INSTALL, async (_event, filePath: string) => {
    try {
      return await installCustomFont(filePath)
    } catch (err: any) {
      console.error('Failed to install font:', err)
      throw new Error(err.message || 'Failed to install custom font')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FONTS_DELETE, async (_event, fileName: string) => {
    try {
      return await deleteCustomFont(fileName)
    } catch (err) {
      console.error('Failed to delete font:', err)
      return false
    }
  })
}
