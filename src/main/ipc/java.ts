import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import { getManagedJavaRuntimesSummary, ensureJavaRuntime } from '@main/core/java/runtime'

export function registerJavaIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.JAVA_GET_RUNTIMES, async () => {
    return await getManagedJavaRuntimesSummary()
  })

  ipcMain.handle(IPC_CHANNELS.JAVA_DOWNLOAD_RUNTIME, async (_event, componentOrVersion: string) => {
    return await ensureJavaRuntime(null, componentOrVersion)
  })
}
