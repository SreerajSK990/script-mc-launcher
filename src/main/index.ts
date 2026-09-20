import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { initializeLauncherDirectories } from '@main/services/paths'
import { initializeAuthenticationState } from '@main/services/auth'
import { initializeLauncherSettings } from '@main/services/settings'
import { initCurseForgeApiKey } from '@main/services/mods'
import { registerAllIpcHandlers } from '@main/ipc/register'
import { initializeAutoUpdater } from '@main/services/updater'
import { initializeDiscordRpc, clearDiscordActivity } from '@main/services/discordRpc'

let mainWindow: BrowserWindow | null = null

function resolvePreloadPath(): string {
  const mjsPath = join(__dirname, '../preload/index.mjs')
  if (existsSync(mjsPath)) {
    return mjsPath
  }
  return join(__dirname, '../preload/index.js')
}

function resolveAppIcon(): string | undefined {
  const devPath = join(__dirname, '../../build/icon.png')
  if (existsSync(devPath)) {
    return devPath
  }
  const prodPath = join(process.resourcesPath, 'build/icon.png')
  if (existsSync(prodPath)) {
    return prodPath
  }
  return undefined
}

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0B0D13',
    autoHideMenuBar: true,
    icon: resolveAppIcon(),
    webPreferences: {
      preload: resolvePreloadPath(),
      sandbox: false,
      contextIsolation: true
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  registerAllIpcHandlers(window)

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    await window.loadURL(rendererUrl)
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(async () => {
  await initializeLauncherDirectories()
  await initializeAuthenticationState()
  const settings = await initializeLauncherSettings()
  if (settings.curseForgeApiKey) {
    initCurseForgeApiKey(settings.curseForgeApiKey)
  }
  mainWindow = await createMainWindow()
  initializeAutoUpdater(mainWindow)
  initializeDiscordRpc()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createMainWindow()
      initializeAutoUpdater(mainWindow)
    }
  })
})

app.on('before-quit', () => {
  clearDiscordActivity()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
