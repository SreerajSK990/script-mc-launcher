import type { BrowserWindow } from 'electron'
import { registerInstanceIpcHandlers } from '@main/ipc/instances'
import { registerSystemIpcHandlers } from '@main/ipc/system'
import { registerAuthIpcHandlers } from '@main/ipc/auth'
import { registerLaunchIpcHandlers } from '@main/ipc/launch'
import { registerMetaIpcHandlers } from '@main/ipc/meta'
import { registerModsIpcHandlers } from '@main/ipc/mods'
import { registerJavaIpcHandlers } from '@main/ipc/java'

export function registerAllIpcHandlers(mainWindow: BrowserWindow): void {
  registerInstanceIpcHandlers()
  registerSystemIpcHandlers(mainWindow)
  registerAuthIpcHandlers(mainWindow)
  registerLaunchIpcHandlers(mainWindow)
  registerMetaIpcHandlers()
  registerModsIpcHandlers()
  registerJavaIpcHandlers()
}
