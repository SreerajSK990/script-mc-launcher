import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Play,
  FolderOpen,
  SlidersHorizontal,
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
  ArrowUpDown
} from 'lucide-react'
import type { InstanceConfiguration, ModLoaderType } from '@shared/types/instance'
import type { InstalledModRecord } from '@shared/types/mods'
import type { ScreenshotEntry } from '@shared/types/screenshot'
import { Button } from '@renderer/components/common/Button'
import { ChangeModVersionModal } from '@renderer/components/mods/ChangeModVersionModal'

interface InstanceDetailPageProps {
  instance: InstanceConfiguration
  onBack: () => void
  onLaunch: (instance: InstanceConfiguration) => void
  onOpenFolder: (instanceId: string) => void
  onBrowseMods: (instance: InstanceConfiguration) => void
  onInstanceUpdated: (updated: InstanceConfiguration) => void
}

type DetailSubTab = 'config' | 'mods' | 'screenshots'

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
  onOpenFolder,
  onBrowseMods,
  onInstanceUpdated
}) => {
  const [activeTab, setActiveTab] = useState<DetailSubTab>('config')

  // Configuration state
  const [name, setName] = useState(instance.name)
  const [ramMb, setRamMb] = useState(instance.ramAllocationMegabytes)
  const [jvmArgsText, setJvmArgsText] = useState((instance.jvmArguments || []).join(' '))
  const [javaPath, setJavaPath] = useState(instance.javaPath || '')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Mods state
  const [installedMods, setInstalledMods] = useState<InstalledModRecord[]>([])
  const [modsSearch, setModsSearch] = useState('')
  const [isLoadingMods, setIsLoadingMods] = useState(false)
  const [selectedModForVersionChange, setSelectedModForVersionChange] = useState<InstalledModRecord | null>(null)
  const [modsFeedbackMessage, setModsFeedbackMessage] = useState<string | null>(null)

  // Screenshots state
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([])
  const [isLoadingScreenshots, setIsLoadingScreenshots] = useState(false)
  const [selectedLightboxScreenshot, setSelectedLightboxScreenshot] = useState<ScreenshotEntry | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  // Sync state if instance prop changes
  useEffect(() => {
    setName(instance.name)
    setRamMb(instance.ramAllocationMegabytes)
    setJvmArgsText((instance.jvmArguments || []).join(' '))
    setJavaPath(instance.javaPath || '')
  }, [instance])

  // Load mods
  const loadMods = useCallback(async () => {
    if (!window.launcherAPI?.mods) return
    setIsLoadingMods(true)
    try {
      const list = await window.launcherAPI.mods.listInstalled(instance.id)
      setInstalledMods(list)
    } catch (err) {
      console.error('Failed to list mods:', err)
    } finally {
      setIsLoadingMods(false)
    }
  }, [instance.id])

  // Load screenshots
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
      loadMods()
    } else if (activeTab === 'screenshots') {
      loadScreenshots()
    }
  }, [activeTab, loadMods, loadScreenshots])

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
        javaPath: javaPath.trim() || null
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
    try {
      await window.launcherAPI.mods.toggleInstalled(instance.id, mod.filename, !mod.enabled)
      await loadMods()
    } catch (err) {
      console.error('Failed to toggle mod:', err)
    }
  }

  const handleDeleteMod = async (mod: InstalledModRecord) => {
    if (!confirm(`Are you sure you want to remove ${mod.name}?`)) return
    try {
      await window.launcherAPI.mods.deleteInstalled(instance.id, mod.filename)
      await loadMods()
    } catch (err) {
      console.error('Failed to delete mod:', err)
    }
  }

  const handleDeleteScreenshot = async (filename: string) => {
    if (!confirm('Are you sure you want to delete this screenshot?')) return
    try {
      await window.launcherAPI.screenshots.delete(instance.id, filename)
      if (selectedLightboxScreenshot?.filename === filename) {
        setSelectedLightboxScreenshot(null)
      }
      await loadScreenshots()
    } catch (err) {
      console.error('Failed to delete screenshot:', err)
    }
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
      {/* Top Breadcrumb & Actions Bar */}
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
            <p className="text-xs text-slate-400 mt-0.5">
              Minecraft {instance.minecraftVersion} • {(ramMb / 1024).toFixed(1)} GB RAM
            </p>
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

      {/* Navigation Sub-Tabs */}
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
      </div>

      {/* Tab 1: Configuration */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          {/* General & Name */}
          <div className="bg-background-card border border-border-subtle rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">General Information</h3>
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
          </div>

          {/* Memory Allocation */}
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

          {/* Java Runtime Override */}
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

          {/* Custom JVM Arguments */}
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

          {/* Save Action */}
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

      {/* Tab 2: Installed Mods */}
      {activeTab === 'mods' && (
        <div className="space-y-5">
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

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={FolderOpen}
                onClick={() => onOpenFolder(instance.id)}
              >
                Open Mods Folder
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

          {isLoadingMods ? (
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
              {filteredMods.map((mod) => (
                <div
                  key={mod.filename}
                  className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                    mod.enabled ? 'hover:bg-background-surface/40' : 'opacity-60 bg-black/20'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <button
                      onClick={() => handleToggleMod(mod)}
                      className={`w-9 h-5 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                        mod.enabled ? 'bg-primary' : 'bg-slate-700'
                      }`}
                      title={mod.enabled ? 'Disable mod' : 'Enable mod'}
                    >
                      <div
                        className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform duration-200 ${
                          mod.enabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100 truncate">
                          {mod.name}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase bg-slate-800 border border-border-subtle text-slate-400 shrink-0">
                          {mod.source}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
                        {mod.filename} • {(mod.fileSizeBytes / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
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
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Screenshots Gallery */}
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

      {/* Lightbox Modal */}
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

      {/* Change Mod Version Modal */}
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
    </div>
  )
}
