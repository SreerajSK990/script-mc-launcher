import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowLeft,
  Play,
  FolderOpen,
  SlidersHorizontal,
  Sliders,
  Package,
  Camera,
  Save,
  Trash2,
  Search,
  Check,
  RotateCcw,
  Zap,
  Cpu,
  X,
  Copy,
  Maximize2,
  ExternalLink,
  Plus,
  ArrowUpDown,
  ArrowUpCircle,
  RefreshCw,
  Loader2,
  Dices,
  Upload,
  Server,
  Wrench,
  Palette
} from 'lucide-react'
import type { InstanceConfiguration, ModLoaderType } from '@shared/types/instance'
import type { InstalledModRecord, ModUpdateInfo } from '@shared/types/mods'
import type { ScreenshotEntry } from '@shared/types/screenshot'
import type { QuickPlayTarget } from '@shared/types/servers'
import { Button } from '@renderer/components/common/Button'
import { ConfirmModal } from '@renderer/components/common/ConfirmModal'
import { ChangeModVersionModal } from '@renderer/components/mods/ChangeModVersionModal'
import { MinecraftSettingsEditor } from '@renderer/components/settings/MinecraftSettingsEditor'
import { InstanceServersSection } from '@renderer/components/servers/InstanceServersSection'
import { InstanceInstallationSection } from '@renderer/components/instances/InstanceInstallationSection'
import {
  getMinecraftIconById,
  getRandomMinecraftIcon
} from '@shared/constants/minecraftIcons'

interface InstanceDetailPageProps {
  instance: InstanceConfiguration
  onBack: () => void
  onLaunch: (instance: InstanceConfiguration) => void
  onQuickPlay?: (target: QuickPlayTarget) => void
  onOpenFolder: (instanceId: string) => void
  onBrowseMods: (instance: InstanceConfiguration) => void
  onBrowseResourcePacks?: (instance: InstanceConfiguration) => void
  onInstanceUpdated: (updated: InstanceConfiguration) => void
  onNotification?: (message: string) => void
}

type DetailSubTab = 'config' | 'installation' | 'mods' | 'servers' | 'screenshots' | 'mcSettings'

const RAM_PRESETS = [
  { label: '2 GB', mb: 2048 },
  { label: '4 GB', mb: 4096 },
  { label: '6 GB', mb: 6144 },
  { label: '8 GB', mb: 8192 },
  { label: '12 GB', mb: 12288 },
  { label: '16 GB', mb: 16384 }
]

const AIKAR_G1GC_FLAGS = [
  '-XX:+UseG1GC',
  '-XX:+ParallelRefProcEnabled',
  '-XX:MaxGCPauseMillis=200',
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:+DisableExplicitGC',
  '-XX:+AlwaysPreTouch',
  '-XX:G1NewSizePercent=30',
  '-XX:G1MaxNewSizePercent=40',
  '-XX:G1ReservePercent=20',
  '-XX:G1HeapWastePercent=5',
  '-XX:G1MixedGCCountTarget=4',
  '-XX:InitiatingHeapOccupancyPercent=15',
  '-XX:G1MixedGCLiveThresholdPercent=90',
  '-XX:G1RSetUpdatingPauseTimePercent=5',
  '-XX:SurvivorRatio=32',
  '-XX:+PerfDisableSharedMem',
  '-XX:MaxTenuringThreshold=1'
]

const SHENANDOAH_FLAGS = [
  '-XX:+UseShenandoahGC',
  '-XX:ShenandoahGCMode=iu',
  '-XX:+UnlockDiagnosticVMOptions',
  '-XX:+AlwaysPreTouch',
  '-XX:+DisableExplicitGC'
]

function getLoaderBadgeColor(loader: ModLoaderType): string {
  switch (loader) {
    case 'fabric':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    case 'quilt':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
    case 'forge':
      return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
    case 'neoforge':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    case 'vanilla':
    default:
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  }
}

export const InstanceDetailPage: React.FC<InstanceDetailPageProps> = ({
  instance,
  onBack,
  onLaunch,
  onQuickPlay,
  onOpenFolder,
  onBrowseMods,
  onBrowseResourcePacks,
  onInstanceUpdated,
  onNotification
}) => {
  const [activeTab, setActiveTab] = useState<DetailSubTab>('config')

  const [name, setName] = useState(instance.name)
  const [ramMb, setRamMb] = useState(instance.ramAllocationMegabytes)
  const [jvmArgsText, setJvmArgsText] = useState((instance.jvmArguments || []).join(' '))
  const [javaPath, setJavaPath] = useState(instance.javaPath || '')
  const [icon, setIcon] = useState(instance.icon || 'minecraft_grass')
  const [group, setGroup] = useState(instance.group || '')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [installedMods, setInstalledMods] = useState<InstalledModRecord[]>([])
  const [modsSearch, setModsSearch] = useState('')
  const [isLoadingMods, setIsLoadingMods] = useState(false)
  const [selectedModForVersionChange, setSelectedModForVersionChange] = useState<InstalledModRecord | null>(null)
  const [modsFeedbackMessage, setModsFeedbackMessage] = useState<string | null>(null)
  const [modUpdates, setModUpdates] = useState<ModUpdateInfo[]>([])
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)
  const [isUpdatingAll, setIsUpdatingAll] = useState(false)
  const [updatingModId, setUpdatingModId] = useState<string | null>(null)
  const [updateProgress, setUpdateProgress] = useState<{ message: string; current: number; total: number } | null>(null)
  const [isDraggingMods, setIsDraggingMods] = useState(false)

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmLabel?: string
    variant?: 'danger' | 'warning' | 'primary'
    onConfirm: () => void | Promise<void>
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  })

  const closeConfirmDialog = () => {
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
  }

  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([])
  const [isLoadingScreenshots, setIsLoadingScreenshots] = useState(false)
  const [selectedLightboxScreenshot, setSelectedLightboxScreenshot] = useState<ScreenshotEntry | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  useEffect(() => {
    setName(instance.name)
    setRamMb(instance.ramAllocationMegabytes)
    setJvmArgsText((instance.jvmArguments || []).join(' '))
    setJavaPath(instance.javaPath || '')
  }, [instance])

  const loadMods = useCallback(async (silent = false) => {
    if (!window.launcherAPI?.mods) return
    if (!silent) setIsLoadingMods(true)
    try {
      const list = await window.launcherAPI.mods.listInstalled(instance.id)
      setInstalledMods(list)
    } catch (err) {
      console.error('Failed to list mods:', err)
    } finally {
      if (!silent) setIsLoadingMods(false)
    }
  }, [instance.id])

  const checkForUpdates = useCallback(async () => {
    if (!window.launcherAPI?.mods) return
    setIsCheckingUpdates(true)
    try {
      const updates = await window.launcherAPI.mods.checkUpdates(instance.id)
      setModUpdates(updates)
    } catch (err) {
      console.warn('Failed to check for mod updates:', err)
    } finally {
      setIsCheckingUpdates(false)
    }
  }, [instance.id])

  const loadScreenshots = useCallback(async () => {
    if (!window.launcherAPI?.screenshots) return
    setIsLoadingScreenshots(true)
    try {
      const list = await window.launcherAPI.screenshots.list(instance.id)
      setScreenshots(list)
    } catch (err) {
      console.error('Failed to list screenshots:', err)
    } finally {
      setIsLoadingScreenshots(false)
    }
  }, [instance.id])

  useEffect(() => {
    if (activeTab === 'mods') {
      loadMods().then(() => checkForUpdates())
    } else if (activeTab === 'screenshots') {
      loadScreenshots()
    }
  }, [activeTab, loadMods, checkForUpdates, loadScreenshots])

  const handleSaveConfig = async () => {
    if (!name.trim()) return
    setIsSaving(true)

    const parsedJvmArgs = jvmArgsText
      .split(' ')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    try {
      const updated = await window.launcherAPI.instances.update({
        id: instance.id,
        name: name.trim(),
        ramAllocationMegabytes: ramMb,
        jvmArguments: parsedJvmArgs,
        javaPath: javaPath.trim() || null,
        icon: icon,
        group: group.trim() || null
      })


      onInstanceUpdated(updated)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err) {
      console.error('Failed to save instance configuration:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handlePickJavaFile = async () => {
    try {
      const selected = await window.launcherAPI.system.selectFile({
        title: 'Select Java Executable (java.exe)',
        filters: [{ name: 'Executables (*.exe)', extensions: ['exe'] }]
      })
      if (selected) {
        setJavaPath(selected)
      }
    } catch (err) {
      console.error('Failed to select file:', err)
    }
  }

  const handleToggleMod = async (mod: InstalledModRecord) => {
    const nextEnabled = !mod.enabled
    setInstalledMods((prev) =>
      prev.map((m) => (m.filename === mod.filename ? { ...m, enabled: nextEnabled } : m))
    )

    try {
      await window.launcherAPI.mods.toggleInstalled(instance.id, mod.filename, nextEnabled)
      await loadMods(true)
    } catch (err) {
      console.error('Failed to toggle mod:', err)
      setInstalledMods((prev) =>
        prev.map((m) => (m.filename === mod.filename ? { ...m, enabled: !nextEnabled } : m))
      )
    }
  }

  const handleUpdateSingleMod = async (update: ModUpdateInfo) => {
    if (!window.launcherAPI?.mods) return
    setUpdatingModId(update.modId)
    try {
      await window.launcherAPI.mods.install({
        instanceId: instance.id,
        versionFile: update.versionFile,
        modMetadata: {
          id: update.modId,
          name: update.name,
          source: update.source
        },
        oldFilename: update.currentFilename
      })
      setModsFeedbackMessage(`Successfully updated ${update.name} to ${update.latestVersion}!`)
      setModUpdates((prev) => prev.filter((u) => u.modId !== update.modId))
      await loadMods(true)
    } catch (err: any) {
      console.error('Failed to update mod:', err)
      alert(err.message || 'Failed to update mod.')
    } finally {
      setUpdatingModId(null)
    }
  }

  const handleUpdateAllMods = async () => {
    if (!window.launcherAPI?.mods || modUpdates.length === 0) return
    setConfirmDialog({
      isOpen: true,
      title: 'Update All Mods',
      message: `Are you sure you want to update all ${modUpdates.length} mods to their latest compatible versions? Outdated JAR files will be safely replaced.`,
      confirmLabel: 'Update All',
      variant: 'primary',
      onConfirm: async () => {
        closeConfirmDialog()
        setIsUpdatingAll(true)
        setUpdateProgress({ message: 'Starting update...', current: 0, total: modUpdates.length })

        const unsub = window.launcherAPI!.mods.onUpdateProgress((p) => {
          setUpdateProgress(p)
        })

        try {
          const res = await window.launcherAPI!.mods.updateAll(instance.id, modUpdates)
          setModsFeedbackMessage(`Successfully updated ${res.updatedCount} mods!`)
          setModUpdates([])
          await loadMods(true)
        } catch (err: any) {
          console.error('Failed to update all mods:', err)
          setModsFeedbackMessage(err.message || 'Failed to update all mods.')
        } finally {
          unsub()
          setIsUpdatingAll(false)
          setUpdateProgress(null)
        }
      }
    })
  }

  const handleDeleteMod = (mod: InstalledModRecord) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Mod',
      message: `Are you sure you want to remove ${mod.name}? This will delete "${mod.filename}" from your instance.`,
      confirmLabel: 'Remove Mod',
      variant: 'danger',
      onConfirm: async () => {
        closeConfirmDialog()
        try {
          await window.launcherAPI?.mods.deleteInstalled(instance.id, mod.filename)
          await loadMods(true)
        } catch (err) {
          console.error('Failed to delete mod:', err)
        }
      }
    })
  }

  const handleModFilesDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingMods(false)

    const files = Array.from(e.dataTransfer.files)
    const validPaths = files
      .map((f) => (f as any).path)
      .filter((p): p is string => Boolean(p && (p.toLowerCase().endsWith('.jar') || p.toLowerCase().endsWith('.zip'))))

    if (validPaths.length === 0) {
      setModsFeedbackMessage('Please drop valid .jar or .zip Minecraft mod files.')
      setTimeout(() => setModsFeedbackMessage(null), 4000)
      return
    }

    try {
      if (window.launcherAPI?.mods?.installDropped) {
        const res = await window.launcherAPI.mods.installDropped(instance.id, validPaths)
        if (res.success) {
          setModsFeedbackMessage(`Successfully installed ${res.installedMods.length} dropped mod(s)!`)
          setTimeout(() => setModsFeedbackMessage(null), 4000)
          await loadMods(true)
        } else {
          setModsFeedbackMessage('No valid mod files could be installed.')
          setTimeout(() => setModsFeedbackMessage(null), 4000)
        }
      }
    } catch (err) {
      console.error('Failed to install dropped mods:', err)
      setModsFeedbackMessage('Failed to install dropped mods.')
      setTimeout(() => setModsFeedbackMessage(null), 4000)
    }
  }

  const handleDeleteScreenshot = (filename: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Screenshot',
      message: 'Are you sure you want to permanently delete this screenshot? This action cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        closeConfirmDialog()
        try {
          await window.launcherAPI?.screenshots.delete(instance.id, filename)
          if (selectedLightboxScreenshot?.filename === filename) {
            setSelectedLightboxScreenshot(null)
          }
          await loadScreenshots()
        } catch (err) {
          console.error('Failed to delete screenshot:', err)
        }
      }
    })
  }

  const handleCopyScreenshot = async (screenshot: ScreenshotEntry) => {
    try {
      const res = await fetch(screenshot.dataUrl)
      const blob = await res.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ])
      setCopyFeedback(screenshot.filename)
      setTimeout(() => setCopyFeedback(null), 2000)
    } catch (err) {
      console.error('Failed to copy screenshot to clipboard:', err)
    }
  }

  const filteredMods = installedMods.filter(
    (m) =>
      m.name.toLowerCase().includes(modsSearch.toLowerCase()) ||
      m.filename.toLowerCase().includes(modsSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-background-card border border-border-subtle p-5 rounded-2xl">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            icon={ArrowLeft}
            onClick={onBack}
            className="text-slate-400 hover:text-white"
          >
            Back
          </Button>

          <div className="h-6 w-px bg-border-subtle" />

          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white tracking-tight">{instance.name}</h2>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase border ${getLoaderBadgeColor(
                  instance.loaderType
                )}`}
              >
                {instance.loaderType}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-400">
                Minecraft {instance.minecraftVersion} • {(ramMb / 1024).toFixed(1)} GB RAM
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('installation')}
                className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 font-medium transition-colors cursor-pointer flex items-center gap-1"
                title="Edit Platform & Minecraft Version"
              >
                <Wrench size={10} />
                <span>Change Version</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <Button
            variant="secondary"
            size="sm"
            icon={FolderOpen}
            onClick={() => onOpenFolder(instance.id)}
            title="Open Instance Folder"
          >
            Open Folder
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={Play}
            onClick={() => onLaunch(instance)}
            className="flex-1 md:flex-initial"
          >
            Launch Instance
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border-subtle pb-px">
        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'config'
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-background-card'
          }`}
        >
          <SlidersHorizontal size={16} />
          <span>Configuration & Settings</span>
        </button>

        <button
          onClick={() => setActiveTab('installation')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'installation'
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-background-card'
          }`}
        >
          <Wrench size={16} />
          <span>Installation</span>
        </button>

        <button
          onClick={() => setActiveTab('mods')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'mods'
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-background-card'
          }`}
        >
          <Package size={16} />
          <span>Installed Mods</span>
          {installedMods.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-background-surface border border-border-subtle text-slate-300">
              {installedMods.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('servers')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'servers'
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-background-card'
          }`}
        >
          <Server size={16} />
          <span>Multiplayer Servers</span>
        </button>

        <button
          onClick={() => setActiveTab('screenshots')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'screenshots'
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-background-card'
          }`}
        >
          <Camera size={16} />
          <span>Screenshots Gallery</span>
          {screenshots.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-background-surface border border-border-subtle text-slate-300">
              {screenshots.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('mcSettings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'mcSettings'
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-background-card'
          }`}
        >
          <Sliders size={16} />
          <span>Minecraft Settings</span>
        </button>
      </div>

      {activeTab === 'config' && (
        <div className="space-y-6">
          <div className="bg-background-card border border-border-subtle rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">General Information</h3>
            
            <div className="max-w-md">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Instance Icon
              </label>
              <div className="flex items-center gap-4 p-3 bg-background-surface border border-border-subtle rounded-2xl">
                <div
                  className={`w-16 h-16 rounded-xl shrink-0 flex items-center justify-center p-2 shadow-inner ${
                    icon.startsWith('data:') || icon.startsWith('http')
                      ? 'bg-gradient-to-br from-slate-800 to-zinc-900'
                      : `bg-gradient-to-br ${getMinecraftIconById(icon).bg}`
                  }`}
                >
                  <img
                    src={icon.startsWith('data:') || icon.startsWith('http') ? icon : getMinecraftIconById(icon).dataUrl}
                    alt={name}
                    className="w-12 h-12 object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {icon.startsWith('data:') || icon.startsWith('http') ? 'Custom Uploaded Icon' : getMinecraftIconById(icon).name}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const random = getRandomMinecraftIcon()
                        setIcon(random.id)
                      }}
                      className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Dices size={14} />
                      <span>Randomize</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 rounded-lg bg-background-card hover:bg-slate-700 text-slate-300 border border-border-subtle text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Upload size={14} />
                      <span>Upload</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIcon('minecraft_grass')}
                      className="text-[11px] text-slate-500 hover:text-slate-300 ml-1 cursor-pointer"
                    >
                      Reset
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const reader = new FileReader()
                          reader.onload = () => {
                            if (typeof reader.result === 'string') {
                              setIcon(reader.result)
                            }
                          }
                          reader.readAsDataURL(file)
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="max-w-md">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Instance Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-background-surface border border-border-subtle focus:border-primary/60 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none transition-colors"
                placeholder="Instance Name"
              />
            </div>

            <div className="max-w-md">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Group (Folder Categorization)
              </label>
              <input
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="w-full bg-background-surface border border-border-subtle focus:border-primary/60 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none transition-colors"
                placeholder="e.g. Modpacks, Survival SMP, Testing..."
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Leave blank for an ungrouped instance.
              </p>
            </div>

          </div>

          <div className="bg-background-card border border-border-subtle rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Memory Allocation (RAM)</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Allocate the amount of system memory dedicated to this Minecraft instance
                </p>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-background-surface border border-border-subtle text-sm font-mono font-semibold text-primary">
                {ramMb} MB ({ (ramMb / 1024).toFixed(1) } GB)
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="range"
                min="1024"
                max="16384"
                step="512"
                value={ramMb}
                onChange={(e) => setRamMb(Number(e.target.value))}
                className="w-full accent-primary h-2 bg-slate-800 rounded-lg cursor-pointer"
              />

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-400 mr-2">Presets:</span>
                {RAM_PRESETS.map((p) => (
                  <button
                    key={p.mb}
                    onClick={() => setRamMb(p.mb)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      ramMb === p.mb
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-background-surface border-border-subtle text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-background-card border border-border-subtle rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-white">Java Executable</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Leave blank to let the launcher auto-download and manage the optimal Mojang Java version
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={javaPath}
                onChange={(e) => setJavaPath(e.target.value)}
                placeholder="Auto-managed by launcher"
                className="flex-1 bg-background-surface border border-border-subtle focus:border-primary/60 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 font-mono focus:outline-none transition-colors"
              />

              <Button
                variant="secondary"
                size="sm"
                icon={FolderOpen}
                onClick={handlePickJavaFile}
              >
                Browse...
              </Button>

              {javaPath && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={RotateCcw}
                  onClick={() => setJavaPath('')}
                >
                  Auto
                </Button>
              )}
            </div>
          </div>

          <div className="bg-background-card border border-border-subtle rounded-2xl p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">JVM Arguments</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Custom garbage collection and runtime flags passed to Java
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="xs"
                  icon={Zap}
                  onClick={() => setJvmArgsText(AIKAR_G1GC_FLAGS.join(' '))}
                  title="Apply Aikar's high-performance G1GC flags"
                >
                  Aikar's G1GC
                </Button>

                <Button
                  variant="ghost"
                  size="xs"
                  icon={Cpu}
                  onClick={() => setJvmArgsText(SHENANDOAH_FLAGS.join(' '))}
                  title="Apply ultra-low-latency Shenandoah GC flags"
                >
                  Shenandoah GC
                </Button>

                <Button
                  variant="ghost"
                  size="xs"
                  icon={RotateCcw}
                  onClick={() => setJvmArgsText('')}
                  title="Clear custom arguments"
                >
                  Clear
                </Button>
              </div>
            </div>

            <textarea
              rows={3}
              value={jvmArgsText}
              onChange={(e) => setJvmArgsText(e.target.value)}
              placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled ..."
              className="w-full bg-background-surface border border-border-subtle focus:border-primary/60 rounded-xl p-3.5 text-xs text-slate-200 font-mono focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center justify-between bg-background-card border border-border-subtle rounded-2xl p-5">
            <div>
              {saveSuccess && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <Check size={15} />
                  Settings saved successfully!
                </span>
              )}
            </div>

            <Button
              variant="primary"
              size="md"
              icon={Save}
              onClick={handleSaveConfig}
              disabled={isSaving || !name.trim()}
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'installation' && (
        <InstanceInstallationSection
          instance={instance}
          onInstanceUpdated={onInstanceUpdated}
          onNotification={(msg) => onNotification?.(msg)}
        />
      )}

      {activeTab === 'mods' && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDraggingMods(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsDraggingMods(false)
            }
          }}
          onDrop={handleModFilesDrop}
          className="space-y-5 relative min-h-[300px]"
        >
          {isDraggingMods && (
            <div className="absolute inset-0 z-50 bg-background-dark/85 backdrop-blur-sm border-2 border-dashed border-primary rounded-2xl flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-150 pointer-events-none">
              <Package size={48} className="text-primary animate-bounce mb-3" />
              <h3 className="text-lg font-bold text-white">Drop Minecraft Mods Here</h3>
              <p className="text-xs text-slate-300 mt-1">
                Release .jar or .zip files to automatically install them into {instance.name}
              </p>
            </div>
          )}

          {modsFeedbackMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
              <Check size={16} className="shrink-0" />
              <span>{modsFeedbackMessage}</span>
            </div>
          )}

          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-background-card border border-border-subtle p-3 rounded-2xl">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                value={modsSearch}
                onChange={(e) => setModsSearch(e.target.value)}
                placeholder="Search installed mods..."
                className="w-full bg-background-surface border border-border-subtle focus:border-primary/60 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                icon={isCheckingUpdates ? Loader2 : RefreshCw}
                isLoading={isCheckingUpdates}
                onClick={checkForUpdates}
                title="Check for mod updates"
              >
                {isCheckingUpdates ? 'Checking Updates...' : 'Check Updates'}
              </Button>

              {modUpdates.length > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={isUpdatingAll ? Loader2 : ArrowUpCircle}
                  isLoading={isUpdatingAll}
                  onClick={handleUpdateAllMods}
                >
                  Update All ({modUpdates.length})
                </Button>
              )}

              <Button
                variant="secondary"
                size="sm"
                icon={FolderOpen}
                onClick={() => onOpenFolder(instance.id)}
              >
                Open Mods Folder
              </Button>

              <Button
                variant="secondary"
                size="sm"
                icon={Palette}
                onClick={() => onBrowseResourcePacks?.(instance)}
              >
                Resource Packs
              </Button>

              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => onBrowseMods(instance)}
              >
                Browse Online Mods
              </Button>
            </div>
          </div>

          {updateProgress && (
            <div className="bg-background-card border border-emerald-500/30 p-4 rounded-2xl flex flex-col gap-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-200 font-medium flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-emerald-400" />
                  {updateProgress.message}
                </span>
                <span className="text-emerald-400 font-mono font-semibold">
                  {updateProgress.current} / {updateProgress.total}
                </span>
              </div>
              <div className="w-full h-2 bg-background-darkest rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${(updateProgress.current / updateProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {isLoadingMods && installedMods.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Loading installed mods...
            </div>
          ) : filteredMods.length === 0 ? (
            <div className="bg-background-card border border-border-subtle rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
                <Package size={24} />
              </div>
              <h3 className="text-base font-semibold text-white">No Mods Installed</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {modsSearch
                  ? 'No mods match your search query.'
                  : 'Install mods from Modrinth or CurseForge to enhance your gameplay.'}
              </p>
              {!modsSearch && (
                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    onClick={() => onBrowseMods(instance)}
                  >
                    Browse Mods
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-background-card border border-border-subtle rounded-2xl overflow-hidden divide-y divide-border-subtle/60">
              {filteredMods.map((mod) => {
                const update = modUpdates.find(
                  (u) => u.currentFilename === mod.filename || u.modId === mod.id
                )
                const isUpdatingThis = updatingModId === update?.modId

                return (
                  <div
                    key={mod.filename}
                    className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                      mod.enabled ? 'hover:bg-background-surface/40' : 'opacity-60 bg-black/20'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={mod.enabled}
                        onClick={() => handleToggleMod(mod)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          mod.enabled
                            ? 'bg-emerald-500 shadow-sm shadow-emerald-950/40'
                            : 'bg-slate-700'
                        }`}
                        title={mod.enabled ? 'Disable mod' : 'Enable mod'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transform transition-transform duration-200 ease-in-out ${
                            mod.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-100 truncate">
                            {mod.name}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase bg-slate-800 border border-border-subtle text-slate-400 shrink-0">
                            {mod.source}
                          </span>
                          {update && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0 flex items-center gap-1">
                              <ArrowUpCircle size={11} />
                              Update: v{update.latestVersion}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
                          {mod.filename} • {(mod.fileSizeBytes / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {update && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={isUpdatingThis ? Loader2 : ArrowUpCircle}
                          isLoading={isUpdatingThis}
                          onClick={() => handleUpdateSingleMod(update)}
                          title={`Update to ${update.latestVersion}`}
                        >
                          Update
                        </Button>
                      )}

                      <Button
                        variant="secondary"
                        size="sm"
                        icon={ArrowUpDown}
                        onClick={() => setSelectedModForVersionChange(mod)}
                        title="Change mod version"
                      >
                        Change Version
                      </Button>

                      <button
                        onClick={() => handleDeleteMod(mod)}
                        className="p-2 rounded-lg bg-background-surface hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-border-subtle hover:border-rose-900/50 transition-colors"
                        title="Remove mod"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'servers' && (
        <InstanceServersSection
          instance={instance}
          onLaunchServer={(server) => {
            if (onQuickPlay) {
              onQuickPlay(server)
            } else {
              onLaunch(instance)
            }
          }}
        />
      )}

      {activeTab === 'screenshots' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between bg-background-card border border-border-subtle p-3 rounded-2xl">
            <p className="text-xs text-slate-400 pl-2">
              {screenshots.length} {screenshots.length === 1 ? 'screenshot' : 'screenshots'} captured
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                onClick={loadScreenshots}
              >
                Refresh
              </Button>

              <Button
                variant="secondary"
                size="sm"
                icon={FolderOpen}
                onClick={() => onOpenFolder(instance.id)}
              >
                Open Screenshots Folder
              </Button>
            </div>
          </div>

          {isLoadingScreenshots ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Loading screenshots...
            </div>
          ) : screenshots.length === 0 ? (
            <div className="bg-background-card border border-border-subtle rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
                <Camera size={24} />
              </div>
              <h3 className="text-base font-semibold text-white">No Screenshots Yet</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Press F2 while playing Minecraft in this instance to take in-game screenshots. They will automatically appear here!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {screenshots.map((s) => (
                <div
                  key={s.filename}
                  className="group relative bg-background-card border border-border-subtle hover:border-border-strong rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-200 flex flex-col"
                >
                  <div
                    className="relative aspect-video bg-black/40 overflow-hidden cursor-pointer"
                    onClick={() => setSelectedLightboxScreenshot(s)}
                  >
                    <img
                      src={s.dataUrl}
                      alt={s.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <span className="text-xs text-white font-medium flex items-center gap-1.5">
                        <Maximize2 size={13} />
                        View Full Size
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 flex items-center justify-between gap-2 border-t border-border-subtle/60">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-slate-200 block truncate" title={s.filename}>
                        {s.filename}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono block">
                        {(s.sizeBytes / 1024).toFixed(0)} KB • {new Date(s.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleCopyScreenshot(s)}
                        className="p-1.5 rounded-lg bg-background-surface hover:bg-slate-700 text-slate-400 hover:text-slate-100 border border-border-subtle transition-colors"
                        title={copyFeedback === s.filename ? 'Copied!' : 'Copy Image to Clipboard'}
                      >
                        {copyFeedback === s.filename ? (
                          <Check size={14} className="text-emerald-400" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>

                      <button
                        onClick={() => handleDeleteScreenshot(s.filename)}
                        className="p-1.5 rounded-lg bg-background-surface hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-border-subtle hover:border-rose-900/50 transition-colors"
                        title="Delete Screenshot"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'mcSettings' && (
        <MinecraftSettingsEditor
          instanceId={instance.id}
          onOpenFolder={() => onOpenFolder(instance.id)}
        />
      )}

      {selectedLightboxScreenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setSelectedLightboxScreenshot(null)}
        >
          <div
            className="relative max-w-5xl w-full bg-background-card border border-border-subtle rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-background-surface/80">
              <span className="text-sm font-semibold text-white font-mono truncate">
                {selectedLightboxScreenshot.filename}
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="xs"
                  icon={copyFeedback === selectedLightboxScreenshot.filename ? Check : Copy}
                  onClick={() => handleCopyScreenshot(selectedLightboxScreenshot)}
                >
                  {copyFeedback === selectedLightboxScreenshot.filename ? 'Copied!' : 'Copy Image'}
                </Button>

                <Button
                  variant="ghost"
                  size="xs"
                  icon={Trash2}
                  onClick={() => handleDeleteScreenshot(selectedLightboxScreenshot.filename)}
                  className="text-rose-400 hover:bg-rose-950/40"
                >
                  Delete
                </Button>

                <button
                  onClick={() => setSelectedLightboxScreenshot(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-2"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="max-h-[80vh] flex items-center justify-center bg-black/50 p-2 overflow-hidden">
              <img
                src={selectedLightboxScreenshot.dataUrl}
                alt={selectedLightboxScreenshot.filename}
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      <ChangeModVersionModal
        isOpen={Boolean(selectedModForVersionChange)}
        onClose={() => setSelectedModForVersionChange(null)}
        instance={instance}
        mod={selectedModForVersionChange}
        onSuccess={(msg) => {
          setModsFeedbackMessage(msg)
          loadMods()
          setTimeout(() => setModsFeedbackMessage(null), 3500)
        }}
      />

      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirmDialog}
      />
    </div>
  )
}
