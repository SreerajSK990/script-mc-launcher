import type { BrowserWindow } from 'electron'
import { registerInstanceIpcHandlers } from '@main/ipc/instances'
import { registerSystemIpcHandlers } from '@main/ipc/system'
import { registerAuthIpcHandlers } from '@main/ipc/auth'
import { registerLaunchIpcHandlers } from '@main/ipc/launch'
import { registerMetaIpcHandlers } from '@main/ipc/meta'
import { registerModsIpcHandlers } from '@main/ipc/mods'
import { registerModpackIpcHandlers } from '@main/ipc/modpacks'
import { registerScreenshotIpcHandlers } from '@main/ipc/screenshots'
import { registerJavaIpcHandlers } from '@main/ipc/java'
import { registerExternalLauncherIpcHandlers } from '@main/ipc/externalLaunchers'
import { registerFontsIpcHandlers } from '@main/ipc/fonts'
import { registerServersIpcHandlers } from '@main/ipc/servers'
import { registerSkinsIpcHandlers } from '@main/ipc/skins'
import { registerGameSettingsIpcHandlers } from '@main/ipc/gameSettings'

export function registerAllIpcHandlers(mainWindow: BrowserWindow): void {
  registerInstanceIpcHandlers()
  registerSystemIpcHandlers(mainWindow)
  registerAuthIpcHandlers(mainWindow)
  registerLaunchIpcHandlers(mainWindow)
  registerMetaIpcHandlers()
  registerModsIpcHandlers(mainWindow)
  registerModpackIpcHandlers(mainWindow)
  registerScreenshotIpcHandlers()
  registerJavaIpcHandlers()
  registerExternalLauncherIpcHandlers(mainWindow)
  registerFontsIpcHandlers()
  registerServersIpcHandlers()
  registerSkinsIpcHandlers()
  registerGameSettingsIpcHandlers()
}

