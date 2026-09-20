import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import {
  getCurrentAuthState,
  loginWithMicrosoftAccount,
  loginWithOfflineAccount,
  logoutAccount,
  switchActiveAccount
} from '@main/services/auth'

export function registerAuthIpcHandlers(mainWindow?: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_STATE, async () => {
    return await getCurrentAuthState()
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN_MICROSOFT, async () => {
    return await loginWithMicrosoftAccount(mainWindow)
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN_OFFLINE, async (_event, username: string) => {
    return await loginWithOfflineAccount(username)
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (_event, accountId: string) => {
    return await logoutAccount(accountId)
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_SWITCH_ACCOUNT, async (_event, accountId: string) => {
    return await switchActiveAccount(accountId)
  })
}
