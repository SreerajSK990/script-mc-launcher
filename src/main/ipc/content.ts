import { ipcMain, shell, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type { InstallModPayload } from '@shared/types/mods'
import type { OperationResult, RecoverySettings } from '@shared/types/operations'
import { planModInstallation } from '@main/core/mods/dependencies'
import {
  listSnapshots,
  backupSaves,
  restoreSnapshot,
  getRecoverySettings,
  saveRecoverySettings
} from '@main/services/recovery'
import {
  listShaders,
  installShader,
  importShaders,
  deleteShader,
  getShaderEnvironment,
  shaderDirectory
} from '@main/core/shaders/manager'
import { cancelTransfer, withTransfer } from '@main/utils/download'

export function registerContentIpc(window: BrowserWindow): void {
  function register<Args extends unknown[], T>(channel: string, action: (...args: Args) => Promise<T>): void {
    ipcMain.handle(channel, async (_event, ...args: Args): Promise<OperationResult<T>> => {
      try {
        return { success: true, data: await action(...args) }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })
  }
  register(IPC_CHANNELS.CONTENT_PLAN_MODS, (payloads: InstallModPayload[]) => planModInstallation(payloads))
  register(IPC_CHANNELS.CONTENT_LIST_BACKUPS, (id: string) => listSnapshots(id))
  register(IPC_CHANNELS.CONTENT_BACKUP_SAVES, (id: string) => backupSaves(id))
  register(IPC_CHANNELS.CONTENT_RESTORE_BACKUP, (id: string, backup: string) => restoreSnapshot(id, backup))
  register(IPC_CHANNELS.CONTENT_GET_RECOVERY_SETTINGS, (id: string) => getRecoverySettings(id))
  register(IPC_CHANNELS.CONTENT_SAVE_RECOVERY_SETTINGS, (id: string, settings: RecoverySettings) =>
    saveRecoverySettings(id, settings)
  )
  register(IPC_CHANNELS.CONTENT_LIST_SHADERS, (id: string) => listShaders(id))
  register(IPC_CHANNELS.CONTENT_SHADER_ENVIRONMENT, (id: string) => getShaderEnvironment(id))
  register(IPC_CHANNELS.CONTENT_INSTALL_SHADER, (payload: InstallModPayload) =>
    withTransfer(
      payload.instanceId,
      (progress) => {
        if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.CONTENT_TRANSFER_PROGRESS, progress)
      },
      () => installShader(payload)
    )
  )
  register(IPC_CHANNELS.CONTENT_IMPORT_SHADERS, (id: string, paths: string[]) => importShaders(id, paths))
  register(IPC_CHANNELS.CONTENT_DELETE_SHADER, (id: string, filename: string) => deleteShader(id, filename))
  register(IPC_CHANNELS.CONTENT_OPEN_SHADER_FOLDER, async (id: string) => {
    await listShaders(id)
    const error = await shell.openPath(shaderDirectory(id))
    if (error) throw new Error(error)
  })
  register(IPC_CHANNELS.CONTENT_CANCEL_TRANSFER, async (id: string) => cancelTransfer(id))
}
