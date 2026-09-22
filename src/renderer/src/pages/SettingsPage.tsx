import React, { useState, useEffect } from 'react'
import {
  FolderOpen,
  HardDrive,
  Cpu,
  Terminal,
  Save,
  Key,
  Download,
  Check,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Coffee,
  Sparkles,
  RotateCcw,
  Loader2,
  Eye,
  EyeOff
} from 'lucide-react'
import type { SystemEnvironment } from '@shared/types/system'
import type { UpdateStatus, UpdateProgressEvent, UpdateInfo } from '@shared/types/updater'
import { LAUNCHER_METADATA } from '@shared/constants/defaults'
import { Button } from '@renderer/components/common/Button'
import { FontSettingsSection } from '@renderer/components/settings/FontSettingsSection'

interface SettingsPageProps {
  systemEnv: SystemEnvironment | null
}

interface ManagedRuntimeItem {
  component: string
  versionName: string
  majorVersion: number
  isInstalled: boolean
  executablePath: string
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ systemEnv }) => {
  const [defaultRamMb, setDefaultRamMb] = useState(4096)
  const [curseForgeApiKey, setCurseForgeApiKey] = useState('')
  const [savedNotification, setSavedNotification] = useState(false)
  const [javaRuntimes, setJavaRuntimes] = useState<ManagedRuntimeItem[]>([])
  const [downloadingComponent, setDownloadingComponent] = useState<string | null>(null)
  const [isLoadingRuntimes, setIsLoadingRuntimes] = useState(false)

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const [updateStatusMessage, setUpdateStatusMessage] = useState<string | null>(null)
  const [updateProgress, setUpdateProgress] = useState<UpdateProgressEvent | null>(null)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [downloadedUpdateInfo, setDownloadedUpdateInfo] = useState<UpdateInfo | null>(null)
  const [redactIps, setRedactIps] = useState(() => {
    return localStorage.getItem('script_launcher_redact_ips') !== 'false'
  })

  const toggleRedactIps = () => {
    setRedactIps((prev) => {
      const next = !prev
      localStorage.setItem('script_launcher_redact_ips', String(next))
      return next
    })
  }

  useEffect(() => {
    if (!window.launcherAPI?.updater) return
    const unsubStatus = window.launcherAPI.updater.onStatus((status, msg) => {
      setUpdateStatus(status)
      if (msg) setUpdateStatusMessage(msg)
      if (status === 'checking') setIsCheckingUpdate(true)
      else setIsCheckingUpdate(false)
    })
    const unsubProgress = window.launcherAPI.updater.onProgress((p) => {
      setUpdateProgress(p)
      setUpdateStatus('downloading')
    })
    const unsubDownloaded = window.launcherAPI.updater.onDownloaded((info) => {
      setUpdateStatus('downloaded')
      setDownloadedUpdateInfo(info)
    })
    return () => {
      unsubStatus()
      unsubProgress()
      unsubDownloaded()
    }
  }, [])

  const handleCheckForUpdates = async () => {
    if (!window.launcherAPI?.updater) return
    setIsCheckingUpdate(true)
    setUpdateStatus('checking')
    setUpdateStatusMessage(null)
    try {
      const res = await window.launcherAPI.updater.checkForUpdates()
      if (!res.hasUpdate) {
        setUpdateStatus('not-available')
      } else {
        setUpdateStatus('available')
        if (res.latestVersion) setUpdateStatusMessage(`v${res.latestVersion}`)
      }
    } catch (err: any) {
      setUpdateStatus('error')
      setUpdateStatusMessage(err?.message || 'Failed to check for updates')
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const handleQuitAndInstall = () => {
    window.launcherAPI?.updater?.quitAndInstall()
  }

  const loadSettingsAndRuntimes = async () => {
    try {
      if (window.launcherAPI?.mods) {
        const key = await window.launcherAPI.mods.getCurseForgeKey()
        if (key) setCurseForgeApiKey(key)
      }
      if (window.launcherAPI?.java) {
        setIsLoadingRuntimes(true)
        const list = await window.launcherAPI.java.getRuntimes()
        setJavaRuntimes(list)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setIsLoadingRuntimes(false)
    }
  }

  useEffect(() => {
    loadSettingsAndRuntimes()
  }, [])

  const handleOpenFolder = () => {
    if (systemEnv?.appDataDirectory) {
      window.launcherAPI?.system.openDirectory(systemEnv.appDataDirectory)
    }
  }

  const handleDownloadJava = async (component: string) => {
    if (!window.launcherAPI?.java) return
    try {
      setDownloadingComponent(component)
      await window.launcherAPI.java.downloadRuntime(component)
      await loadSettingsAndRuntimes()
      setSavedNotification(true)
      setTimeout(() => setSavedNotification(false), 2000)
    } catch (error) {
      console.error('Failed to download Java runtime:', error)
    } finally {
      setDownloadingComponent(null)
    }
  }

  const handleSave = async () => {
    if (window.launcherAPI?.mods) {
      await window.launcherAPI.mods.setCurseForgeKey(curseForgeApiKey.trim() || null)
    }
    setSavedNotification(true)
    setTimeout(() => setSavedNotification(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl w-full">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Settings</h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Configure default performance settings, storage locations, Java runtimes, and mod APIs
        </p>
      </div>

      {savedNotification && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
          <span>Preferences saved successfully.</span>
        </div>
      )}

      <div className="bg-background-card border border-border-subtle rounded-2xl p-6 flex flex-col gap-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-1">
            Data Storage
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            Location where instances, libraries, assets, and cache files are stored
          </p>

          <div className="flex items-center gap-3">
            <div className="flex-1 px-3.5 py-2.5 rounded-xl bg-background-darkest border border-border-subtle font-mono text-xs text-slate-300 truncate">
              {systemEnv?.appDataDirectory || 'Loading...'}
            </div>
            <Button
              variant="secondary"
              size="md"
              icon={FolderOpen}
              onClick={handleOpenFolder}
            >
              Open Folder
            </Button>
          </div>
        </div>

        <div className="pt-6 border-t border-border-subtle/60">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                Default RAM Allocation
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Default memory assigned when creating a new Minecraft instance
              </p>
            </div>
            <span className="text-sm font-mono text-emerald-400">
              {(defaultRamMb / 1024).toFixed(1)} GB ({defaultRamMb} MB)
            </span>
          </div>

          <input
            type="range"
            min={1024}
            max={16384}
            step={512}
            value={defaultRamMb}
            onChange={(e) => setDefaultRamMb(Number(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer mt-3"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
            <span>1 GB</span>
            <span>Recommended: 4 GB</span>
            <span>16 GB</span>
          </div>
        </div>

        <div className="pt-6 border-t border-border-subtle/60">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                Managed Java Runtimes (Mojang Official)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Mojang JREs auto-download when launching instances. You can also pre-download them here.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              onClick={loadSettingsAndRuntimes}
              isLoading={isLoadingRuntimes}
            >
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {javaRuntimes.map((runtime) => (
              <div
                key={runtime.component}
                className="p-3.5 rounded-xl bg-background-darkest border border-border-subtle flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Coffee size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white truncate">
                        {runtime.versionName}
                      </span>
                      {runtime.isInstalled ? (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Installed
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-border-subtle">
                          Available
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono block truncate mt-0.5">
                      {runtime.component}
                    </span>
                  </div>
                </div>

                {!runtime.isInstalled && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    isLoading={downloadingComponent === runtime.component}
                    onClick={() => handleDownloadJava(runtime.component)}
                  >
                    Download
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="pt-6 border-t border-border-subtle/60">
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-1">
            CurseForge Integration
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            Modrinth works out-of-the-box with zero setup. To also search and download from CurseForge, enter your free CurseForge API key.
          </p>

          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Key size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                placeholder="Optional CurseForge API Key ($2a$10$...)"
                value={curseForgeApiKey}
                onChange={(e) => setCurseForgeApiKey(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background-darkest rounded-xl text-xs text-slate-100 placeholder-slate-500 border border-border-subtle focus:border-emerald-500 focus:outline-none font-mono"
              />
            </div>
            <Button
              variant="ghost"
              size="md"
              icon={ExternalLink}
              onClick={() =>
                window.launcherAPI?.system.openExternalUrl('https://console.curseforge.com/')
              }
            >
              Get API Key
            </Button>
          </div>
        </div>

        <FontSettingsSection />

        <div className="pt-6 border-t border-border-subtle/60">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                Application Updates
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically check GitHub Releases for launcher updates and improvements
              </p>
            </div>
            <div className="flex items-center gap-2">
              {updateStatus === 'downloaded' && (
                <Button variant="primary" size="sm" icon={RotateCcw} onClick={handleQuitAndInstall}>
                  Restart to Apply
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                icon={isCheckingUpdate ? Loader2 : RefreshCw}
                onClick={handleCheckForUpdates}
                disabled={isCheckingUpdate || updateStatus === 'downloading'}
              >
                {isCheckingUpdate ? 'Checking...' : 'Check for Updates'}
              </Button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-background-darkest border border-border-subtle flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Current Version:</span>
                <span className="text-emerald-400 font-mono font-semibold">
                  v{LAUNCHER_METADATA.VERSION}
                </span>
              </div>
              <div>
                {updateStatus === 'idle' && (
                  <span className="text-slate-500 font-mono text-[11px]">Ready to check</span>
                )}
                {updateStatus === 'checking' && (
                  <span className="text-sky-400 font-mono text-[11px] flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" />
                    Checking GitHub...
                  </span>
                )}
                {updateStatus === 'available' && (
                  <span className="text-amber-400 font-mono text-[11px]">
                    New version found {updateStatusMessage || ''} — downloading...
                  </span>
                )}
                {updateStatus === 'not-available' && (
                  <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                    <Check size={12} />
                    You are on the latest version
                  </span>
                )}
                {updateStatus === 'downloading' && (
                  <span className="text-sky-400 font-mono text-[11px] flex items-center gap-1.5">
                    <Download size={12} className="animate-bounce" />
                    Downloading update...
                  </span>
                )}
                {updateStatus === 'downloaded' && (
                  <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                    <Check size={12} />
                    Update {downloadedUpdateInfo?.version ? `v${downloadedUpdateInfo.version}` : ''} ready to install
                  </span>
                )}
                {updateStatus === 'error' && (
                  <span className="text-rose-400 font-mono text-[11px]">
                    {updateStatusMessage || 'Check failed'}
                  </span>
                )}
              </div>
            </div>

            {updateStatus === 'downloading' && updateProgress && (
              <div className="flex flex-col gap-1.5 pt-2 border-t border-border-subtle/50">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>Progress</span>
                  <span>{updateProgress.percent.toFixed(1)}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-200"
                    style={{ width: `${Math.min(100, Math.max(0, updateProgress.percent))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>{(updateProgress.transferred / 1024 / 1024).toFixed(1)} MB / {(updateProgress.total / 1024 / 1024).toFixed(1)} MB</span>
                  <span>{(updateProgress.bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pt-6 border-t border-border-subtle/60">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400" />
                Privacy & Streamer Mode
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Protect sensitive multiplayer server IP addresses and ports from leaking
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-background-darkest border border-border-subtle flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-slate-200 block">Redact Server IP Addresses</span>
              <span className="text-xs text-slate-400">
                Masks multiplayer server IPs on the dashboard and instance server tabs (click eye icon to peek)
              </span>
            </div>
            <Button
              variant={redactIps ? 'primary' : 'ghost'}
              size="sm"
              icon={redactIps ? EyeOff : Eye}
              onClick={toggleRedactIps}
            >
              {redactIps ? 'Redacted' : 'Visible'}
            </Button>
          </div>
        </div>

        <div className="pt-6 border-t border-border-subtle/60">
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-3">
            Hardware & Application Summary
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-background-darkest border border-border-subtle flex items-center justify-between">
              <span className="text-slate-400">Launcher Version</span>
              <span className="text-emerald-400 font-semibold">
                v{LAUNCHER_METADATA.VERSION}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-background-darkest border border-border-subtle flex items-center justify-between">
              <span className="text-slate-400">Total System RAM</span>
              <span className="text-slate-200">
                {systemEnv ? `${(systemEnv.memory.totalMegabytes / 1024).toFixed(1)} GB` : '...'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-background-darkest border border-border-subtle flex items-center justify-between">
              <span className="text-slate-400">Operating System</span>
              <span className="text-slate-200 capitalize">
                {systemEnv?.os.platform} ({systemEnv?.os.architecture})
              </span>
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <Button variant="primary" icon={Save} onClick={handleSave}>
            Save Preferences
          </Button>
        </div>
      </div>
    </div>
  )
}
