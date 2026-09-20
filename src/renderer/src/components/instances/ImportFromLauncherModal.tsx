import React, { useState, useEffect, useCallback } from 'react'
import {
  X,
  Copy,
  FolderOpen,
  RotateCcw,
  Search,
  Check,
  AlertCircle,
  Loader2,
  Package,
  Layers,
  HardDrive,
  Compass
} from 'lucide-react'
import type {
  DiscoveredExternalInstance,
  ExternalLauncherType,
  CloneProgressEvent
} from '@shared/types/externalLauncher'
import type { InstanceConfiguration } from '@shared/types/instance'
import { Button } from '@renderer/components/common/Button'

interface ImportFromLauncherModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (instance: InstanceConfiguration) => void
}

type FilterTab = 'all' | ExternalLauncherType

const LAUNCHER_TABS: Array<{ id: FilterTab; label: string }> = [
  { id: 'all', label: 'All Launchers' },
  { id: 'prism', label: 'Prism' },
  { id: 'curseforge', label: 'CurseForge' },
  { id: 'modrinth', label: 'Modrinth' },
  { id: 'vanilla', label: 'Official' }
]

function getLauncherBadgeColor(type: ExternalLauncherType): string {
  switch (type) {
    case 'prism':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    case 'modrinth':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    case 'curseforge':
      return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
    case 'multimc':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    case 'vanilla':
      return 'bg-slate-500/10 text-slate-300 border-slate-500/20'
    default:
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
  }
}

export const ImportFromLauncherModal: React.FC<ImportFromLauncherModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [instances, setInstances] = useState<DiscoveredExternalInstance[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [selectedLauncherTab, setSelectedLauncherTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedInstance, setSelectedInstance] = useState<DiscoveredExternalInstance | null>(null)
  const [customName, setCustomName] = useState('')
  const [copySaves, setCopySaves] = useState(false)

  const [isCloning, setIsCloning] = useState(false)
  const [cloneProgress, setCloneProgress] = useState<CloneProgressEvent | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const scanAllLaunchers = useCallback(async () => {
    if (!window.launcherAPI?.externalLaunchers) return
    setIsScanning(true)
    setErrorMessage(null)
    try {
      const results = await window.launcherAPI.externalLaunchers.scanAll()
      setInstances(results)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to scan external launchers')
    } finally {
      setIsScanning(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      setSelectedInstance(null)
      setCustomName('')
      setCopySaves(false)
      setIsCloning(false)
      setCloneProgress(null)
      setErrorMessage(null)
      scanAllLaunchers()
    }
  }, [isOpen, scanAllLaunchers])

  useEffect(() => {
    if (!isOpen || !window.launcherAPI?.externalLaunchers) return

    const unsub = window.launcherAPI.externalLaunchers.onProgress((event) => {
      setCloneProgress(event)
    })

    return () => {
      unsub()
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSelectCustomFolder = async () => {
    try {
      const selected = await window.launcherAPI.externalLaunchers.selectDirectory()
      if (!selected) return

      setIsScanning(true)
      const found = await window.launcherAPI.externalLaunchers.scanDirectory(selected)
      if (found.length === 0) {
        setErrorMessage(`No Minecraft instances recognized in: ${selected}`)
      } else {
        setInstances((prev) => {
          const existingPaths = new Set(prev.map((i) => i.sourcePath))
          const newEntries = found.filter((i) => !existingPaths.has(i.sourcePath))
          return [...newEntries, ...prev]
        })
        setSelectedInstance(found[0])
        setCustomName(`${found[0].name} (Cloned)`)
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to scan custom folder')
    } finally {
      setIsScanning(false)
    }
  }

  const handleChooseInstance = (inst: DiscoveredExternalInstance) => {
    setSelectedInstance(inst)
    setCustomName(`${inst.name} (Cloned)`)
    setCopySaves(false)
    setErrorMessage(null)
  }

  const handleStartClone = async () => {
    if (!selectedInstance) return

    setIsCloning(true)
    setErrorMessage(null)

    try {
      const cloned = await window.launcherAPI.externalLaunchers.clone({
        sourceInstance: selectedInstance,
        customName: customName.trim(),
        copySaves
      })

      onSuccess(cloned)
      onClose()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to clone instance')
      setIsCloning(false)
    }
  }

  const filteredInstances = instances.filter((inst) => {
    const matchesTab =
      selectedLauncherTab === 'all' || inst.launcherType === selectedLauncherTab

    const matchesSearch =
      inst.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inst.minecraftVersion.includes(searchQuery) ||
      inst.launcherName.toLowerCase().includes(searchQuery.toLowerCase())

    return matchesTab && matchesSearch
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background-card border border-border-subtle rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-subtle bg-background-surface/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Copy size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Import from Other Launcher</h3>
              <p className="text-xs text-slate-400">
                Clone existing instances from Prism, CurseForge, Modrinth, or Vanilla into Script Launcher
              </p>
            </div>
          </div>

          {!isCloning && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Toolbar: Launcher filter tabs + Browse custom folder + Search */}
        <div className="p-4 border-b border-border-subtle/80 bg-background-darkest/40 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {LAUNCHER_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedLauncherTab(tab.id)}
                disabled={isCloning}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  selectedLauncherTab === tab.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-background-surface'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-56">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                placeholder="Filter instances..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isCloning}
                className="w-full pl-8 pr-3 py-1.5 bg-background-surface border border-border-subtle focus:border-primary rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>

            <Button
              variant="secondary"
              size="sm"
              icon={FolderOpen}
              onClick={handleSelectCustomFolder}
              disabled={isCloning}
              title="Pick a custom folder to scan"
            >
              Browse Folder...
            </Button>

            <Button
              variant="ghost"
              size="sm"
              icon={RotateCcw}
              onClick={scanAllLaunchers}
              disabled={isScanning || isCloning}
              title="Rescan launchers"
            />
          </div>
        </div>

        {/* Content Body: Left list & Right clone options */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[380px]">
          {/* Instances List (Col 7) */}
          <div className="md:col-span-7 border-r border-border-subtle p-4 overflow-y-auto space-y-2.5">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2 mb-3">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {isScanning ? (
              <div className="py-20 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 size={24} className="animate-spin text-primary" />
                <span className="text-xs">Scanning system for Minecraft instances...</span>
              </div>
            ) : filteredInstances.length === 0 ? (
              <div className="py-20 text-center text-slate-500 flex flex-col items-center gap-2">
                <Compass size={32} className="text-slate-600 mb-1" />
                <p className="text-sm font-medium text-slate-300">No external instances found</p>
                <p className="text-xs text-slate-500 max-w-xs">
                  Make sure Prism, Modrinth, or CurseForge are installed, or click "Browse Folder..." to select an instance manually.
                </p>
              </div>
            ) : (
              filteredInstances.map((inst) => {
                const isSelected = selectedInstance?.sourcePath === inst.sourcePath
                return (
                  <div
                    key={`${inst.launcherType}-${inst.id}`}
                    onClick={() => !isCloning && handleChooseInstance(inst)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-primary/10 border-primary shadow-sm'
                        : 'bg-background-surface hover:bg-slate-800/60 border-border-subtle'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white truncate">
                          {inst.name}
                        </span>
                        <span
                          className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-full border ${getLauncherBadgeColor(
                            inst.launcherType
                          )}`}
                        >
                          {inst.launcherName}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono">
                        <span>MC {inst.minecraftVersion}</span>
                        <span>•</span>
                        <span className="capitalize">{inst.loaderType}</span>
                        {inst.totalModCount > 0 && (
                          <>
                            <span>•</span>
                            <span>{inst.totalModCount} mods</span>
                          </>
                        )}
                        {inst.hasSaves && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400/90">{inst.savesCount} worlds</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-primary border-primary text-white'
                            : 'border-border-subtle bg-background-card'
                        }`}
                      >
                        {isSelected && <Check size={12} />}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Clone Settings & Progress (Col 5) */}
          <div className="md:col-span-5 p-5 bg-background-surface/30 flex flex-col justify-between overflow-y-auto">
            {selectedInstance ? (
              <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Clone Settings
                </h4>

                <div className="bg-background-card border border-border-subtle p-3.5 rounded-xl space-y-2">
                  <span className="text-[11px] text-slate-400 block font-mono">Source Instance</span>
                  <p className="text-sm font-bold text-white truncate">{selectedInstance.name}</p>
                  <p className="text-xs text-slate-400">
                    From {selectedInstance.launcherName} (Minecraft {selectedInstance.minecraftVersion})
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Target Instance Name
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    disabled={isCloning}
                    placeholder="Enter instance name"
                    className="w-full bg-background-card border border-border-subtle focus:border-primary rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
                  />
                </div>

                <div className="bg-background-card border border-border-subtle p-3.5 rounded-xl space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={copySaves}
                      onChange={(e) => setCopySaves(e.target.checked)}
                      disabled={isCloning || !selectedInstance.hasSaves}
                      className="accent-primary rounded mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">
                        Include World Saves
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {selectedInstance.hasSaves
                          ? `Clones ${selectedInstance.savesCount} singleplayer world(s) from the source.`
                          : 'No singleplayer worlds found in this instance.'}
                      </span>
                    </div>
                  </label>
                </div>

                <div className="text-[11px] text-slate-500 space-y-1 pt-1">
                  <p>• Copies all configs, mods, resource packs, and shader packs.</p>
                  <p>• Completely isolated in Script Launcher. Original files remain untouched.</p>
                </div>

                {isCloning && cloneProgress && (
                  <div className="bg-background-card border border-border-subtle p-3.5 rounded-xl space-y-2.5 mt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200 capitalize flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin text-primary" />
                        {cloneProgress.step}
                      </span>
                      <span className="text-primary font-mono">{cloneProgress.percentage}%</span>
                    </div>

                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-300 rounded-full"
                        style={{ width: `${cloneProgress.percentage}%` }}
                      />
                    </div>

                    <p className="text-xs text-slate-400 font-mono truncate">
                      {cloneProgress.message}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                <Layers size={28} className="text-slate-600 mb-1" />
                <p className="text-xs text-slate-400">Select an instance on the left to clone it.</p>
              </div>
            )}

            <div className="pt-4 border-t border-border-subtle/60 flex items-center justify-end gap-2.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={isCloning}
              >
                Cancel
              </Button>

              <Button
                variant="primary"
                size="sm"
                icon={isCloning ? Loader2 : Copy}
                onClick={handleStartClone}
                disabled={!selectedInstance || isCloning || !customName.trim()}
              >
                {isCloning ? 'Cloning Instance...' : 'Clone Instance'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
