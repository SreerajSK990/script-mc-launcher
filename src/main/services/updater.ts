import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type { UpdateCheckResult, UpdateInfo, UpdateProgressEvent, UpdateStatus } from '@shared/types/updater'

let targetWindow: BrowserWindow | null = null

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

function broadcastStatus(status: UpdateStatus, message?: string): void {
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.webContents.send(IPC_CHANNELS.UPDATER_STATUS_EVENT, status, message)
  }
}

function broadcastProgress(progress: UpdateProgressEvent): void {
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.webContents.send(IPC_CHANNELS.UPDATER_PROGRESS_EVENT, progress)
  }
}

function broadcastDownloaded(info: UpdateInfo): void {
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.webContents.send(IPC_CHANNELS.UPDATER_DOWNLOADED_EVENT, info)
  }
}

autoUpdater.on('checking-for-update', () => {
  broadcastStatus('checking')
})

autoUpdater.on('update-available', (info) => {
  broadcastStatus('available', info.version)
})

autoUpdater.on('update-not-available', () => {
  broadcastStatus('not-available')
})

autoUpdater.on('download-progress', (progress) => {
  broadcastProgress({
    percent: Math.round(progress.percent || 0),
    bytesPerSecond: progress.bytesPerSecond || 0,
    transferred: progress.transferred || 0,
    total: progress.total || 0
  })
})

autoUpdater.on('update-downloaded', (info) => {
  broadcastStatus('downloaded', info.version)
  broadcastDownloaded({
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
  })
})

autoUpdater.on('error', (err) => {
  broadcastStatus('error', err?.message || 'Unknown update error')
})

export function initializeAutoUpdater(window: BrowserWindow): void {
  targetWindow = window

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 15000)
  }
}

export async function checkForUpdatesManual(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result) {
      return {
        hasUpdate: false,
        currentVersion
      }
    }

    const latestVersion = result.updateInfo?.version
    const hasUpdate = Boolean(latestVersion && latestVersion !== currentVersion)

    return {
      hasUpdate,
      currentVersion,
      latestVersion
    }
  } catch (err: any) {
    return {
      hasUpdate: false,
      currentVersion,
      error: err?.message || 'Failed to check for updates'
    }
  }
}

export function quitAndInstallUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}
