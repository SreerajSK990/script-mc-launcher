import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Download,
  Check,
  FolderOpen,
  Trash2,
  RefreshCw,
  SlidersHorizontal,
  Package,
  Boxes,
  Layers,
  Sparkles,
  X,
  ExternalLink,
  ShieldCheck,
  AlertCircle
} from 'lucide-react'
import type { InstanceConfiguration, ModLoaderType } from '@shared/types/instance'
import type {
  ModSearchResult,
  ModVersionFile,
  InstalledModRecord,
  ModSource
} from '@shared/types/mods'
import { Button } from '@renderer/components/common/Button'
import { Modal } from '@renderer/components/common/Modal'

interface ModBrowserPageProps {
  instances: InstanceConfiguration[]
  onOpenFolder: (instanceId: string) => void
  onNotification: (message: string) => void
}

const CATEGORIES = [
  { id: 'all', label: 'All Categories' },
  { id: 'optimization', label: 'Performance' },
  { id: 'technology', label: 'Tech & Automation' },
  { id: 'magic', label: 'Magic' },
  { id: 'adventure', label: 'Adventure & RPG' },
  { id: 'utility', label: 'Utility & QoL' },
  { id: 'worldgen', label: 'World Gen & Biomes' },
  { id: 'decoration', label: 'Decoration & Building' }
]

export const ModBrowserPage: React.FC<ModBrowserPageProps> = ({
  instances,
  onOpenFolder,
  onNotification
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'browse' | 'installed'>('browse')
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(
    instances.find((i) => i.loaderType !== 'vanilla')?.id || instances[0]?.id || ''
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedSource, setSelectedSource] = useState<'all' | 'modrinth' | 'curseforge'>('modrinth')
  const [searchResults, setSearchResults] = useState<ModSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const [selectedModForVersions, setSelectedModForVersions] = useState<ModSearchResult | null>(null)
  const [availableVersions, setAvailableVersions] = useState<ModVersionFile[]>([])
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null)

  const [installedMods, setInstalledMods] = useState<InstalledModRecord[]>([])
  const [isLoadingInstalled, setIsLoadingInstalled] = useState(false)

  const currentInstance = instances.find((i) => i.id === selectedInstanceId)

  useEffect(() => {
    if (!selectedInstanceId && instances.length > 0) {
      const preferred = instances.find((i) => i.loaderType !== 'vanilla') || instances[0]
      setSelectedInstanceId(preferred.id)
    }
  }, [instances, selectedInstanceId])

  const fetchInstalledMods = useCallback(async () => {
    if (!selectedInstanceId || !window.launcherAPI?.mods) return
    try {
      setIsLoadingInstalled(true)
      const list = await window.launcherAPI.mods.listInstalled(selectedInstanceId)
      setInstalledMods(list)
    } catch (error) {
      console.error('Failed to list installed mods:', error)
    } finally {
      setIsLoadingInstalled(false)
    }
  }, [selectedInstanceId])

  useEffect(() => {
    if (selectedInstanceId) {
      fetchInstalledMods()
    }
  }, [selectedInstanceId, fetchInstalledMods])

  const executeSearch = useCallback(async () => {
    if (!window.launcherAPI?.mods) return

    try {
      setIsSearching(true)
      const results = await window.launcherAPI.mods.search({
        query: searchQuery.trim(),
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        source: selectedSource,
        minecraftVersion: currentInstance?.minecraftVersion,
        loader: currentInstance?.loaderType !== 'vanilla' ? currentInstance?.loaderType : undefined,
        limit: 24
      })
      setSearchResults(results)
    } catch (error) {
      console.error('Mod search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, selectedCategory, selectedSource, currentInstance])

  useEffect(() => {
    const timer = setTimeout(() => {
      executeSearch()
    }, 300)
    return () => clearTimeout(timer)
  }, [executeSearch])

  const handleOpenInstallModal = async (mod: ModSearchResult) => {
    setSelectedModForVersions(mod)
    setAvailableVersions([])
    setIsLoadingVersions(true)

    try {
      if (window.launcherAPI?.mods) {
        const versions = await window.launcherAPI.mods.getVersions(
          mod.id,
          mod.source,
          currentInstance?.minecraftVersion,
          currentInstance?.loaderType !== 'vanilla' ? currentInstance?.loaderType : undefined
        )
        setAvailableVersions(versions)
      }
    } catch (error) {
      console.error('Failed to get mod versions:', error)
    } finally {
      setIsLoadingVersions(false)
    }
  }

  const handleInstallVersion = async (version: ModVersionFile) => {
    if (!selectedInstanceId || !selectedModForVersions || !window.launcherAPI?.mods) return

    try {
      setInstallingVersionId(version.id)
      await window.launcherAPI.mods.install({
        instanceId: selectedInstanceId,
        versionFile: version,
        modMetadata: {
          id: selectedModForVersions.id,
          name: selectedModForVersions.name,
          source: selectedModForVersions.source,
          iconUrl: selectedModForVersions.iconUrl
        }
      })

      onNotification(`Installed ${selectedModForVersions.name} successfully.`)
      await fetchInstalledMods()
      setSelectedModForVersions(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to install mod'
      onNotification(message)
    } finally {
      setInstallingVersionId(null)
    }
  }

  const handleToggleMod = async (mod: InstalledModRecord) => {
    if (!selectedInstanceId || !window.launcherAPI?.mods) return
    try {
      await window.launcherAPI.mods.toggleInstalled(selectedInstanceId, mod.filename, !mod.enabled)
      await fetchInstalledMods()
      onNotification(`${mod.name} ${!mod.enabled ? 'enabled' : 'disabled'}.`)
    } catch (error) {
      console.error('Failed to toggle mod:', error)
    }
  }

  const handleDeleteMod = async (mod: InstalledModRecord) => {
    if (!selectedInstanceId || !window.launcherAPI?.mods) return
    const confirmed = window.confirm(`Are you sure you want to remove ${mod.name}?`)
    if (!confirmed) return

    try {
      await window.launcherAPI.mods.deleteInstalled(selectedInstanceId, mod.filename)
      await fetchInstalledMods()
      onNotification(`Removed ${mod.name}.`)
    } catch (error) {
      console.error('Failed to delete mod:', error)
    }
  }

  const formatDownloads = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
    return String(num)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${bytes} B`
  }

  return (
    <div className="flex flex-col gap-5 w-full h-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-border-subtle">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Boxes size={24} className="text-emerald-400" />
            <span>Mod Browser</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Discover, download, and manage mods directly for your Minecraft instances
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-background-darkest border border-border-subtle p-1.5 rounded-xl">
            <span className="text-xs text-slate-400 pl-2">Target Instance:</span>
            {instances.length === 0 ? (
              <span className="text-xs text-slate-500 pr-2">No instances created</span>
            ) : (
              <select
                value={selectedInstanceId}
                onChange={(e) => setSelectedInstanceId(e.target.value)}
                className="bg-background-surface text-slate-100 text-xs px-3 py-1.5 rounded-lg border border-border-subtle focus:outline-none focus:border-emerald-500 font-medium"
              >
                {instances.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name} ({inst.loaderType} • {inst.minecraftVersion})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-1 bg-background-darkest border border-border-subtle p-1 rounded-xl">
            <button
              onClick={() => setActiveSubTab('browse')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeSubTab === 'browse'
                  ? 'bg-background-surface text-white shadow-sm border border-border-strong'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Browse Mods
            </button>
            <button
              onClick={() => setActiveSubTab('installed')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeSubTab === 'installed'
                  ? 'bg-background-surface text-white shadow-sm border border-border-strong'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Installed</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300">
                {installedMods.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {activeSubTab === 'browse' ? (
        <div className="flex flex-col gap-4 flex-1">
          <div className="flex flex-col md:flex-row items-center gap-3 bg-background-card border border-border-subtle p-3 rounded-2xl">
            <div className="relative flex-1 w-full">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search mods on Modrinth..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-8 py-2 bg-background-darkest rounded-xl text-xs text-slate-100 placeholder-slate-500 border border-border-subtle focus:border-emerald-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-background-darkest text-slate-200 text-xs px-3 py-2 rounded-xl border border-border-subtle focus:outline-none focus:border-emerald-500"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>

              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value as any)}
                className="bg-background-darkest text-slate-200 text-xs px-3 py-2 rounded-xl border border-border-subtle focus:outline-none focus:border-emerald-500"
              >
                <option value="modrinth">Modrinth</option>
                <option value="all">Unified (All)</option>
                <option value="curseforge">CurseForge</option>
              </select>

              <Button
                variant="ghost"
                size="sm"
                icon={RefreshCw}
                onClick={executeSearch}
                isLoading={isSearching}
                title="Refresh Search"
              >
                Refresh
              </Button>
            </div>
          </div>

          {currentInstance && (
            <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>
                  Filtering for <strong>{currentInstance.name}</strong> ({currentInstance.loaderType} • {currentInstance.minecraftVersion})
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {searchResults.length} mods found
              </span>
            </div>
          )}

          {isSearching ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <RefreshCw size={28} className="animate-spin text-emerald-500" />
              <p className="text-xs">Searching for mods...</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-500 gap-2 border border-dashed border-border-subtle rounded-2xl">
              <Package size={32} className="text-slate-600 mb-1" />
              <p className="text-sm font-medium text-slate-400">No mods found</p>
              <p className="text-xs text-slate-600">
                Try refining your search query or selecting a different category
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 overflow-y-auto pr-1">
              {searchResults.map((mod) => (
                <div
                  key={`${mod.source}-${mod.id}`}
                  className="bg-background-card hover:bg-background-surface/70 border border-border-subtle hover:border-border-strong rounded-2xl p-4 flex flex-col justify-between transition-all group shadow-sm"
                >
                  <div>
                    <div className="flex items-start gap-3 mb-2.5">
                      {mod.iconUrl ? (
                        <img
                          src={mod.iconUrl}
                          alt={mod.name}
                          className="w-10 h-10 rounded-xl bg-background-darkest object-cover border border-border-subtle shrink-0"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                          <Package size={18} />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="text-sm font-bold text-white truncate group-hover:text-emerald-300 transition-colors">
                            {mod.name}
                          </h3>
                          <span
                            className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                              mod.source === 'modrinth'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {mod.source}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 block truncate">
                          by {mod.author}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed mb-3 line-clamp-2">
                      {mod.description}
                    </p>

                    <div className="flex flex-wrap gap-1 mb-3">
                      {mod.loaders.slice(0, 3).map((loader) => (
                        <span
                          key={loader}
                          className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-background-darkest text-slate-400 border border-border-subtle"
                        >
                          {loader}
                        </span>
                      ))}
                      {mod.categories.slice(0, 2).map((cat) => (
                        <span
                          key={cat}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-background-darkest text-slate-500 border border-border-subtle"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-border-subtle/50 text-xs">
                    <span className="text-slate-500 font-mono text-[11px]">
                      {formatDownloads(mod.downloads)} downloads
                    </span>

                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Download}
                      onClick={() => handleOpenInstallModal(mod)}
                    >
                      Install
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 flex-1">
          <div className="flex items-center justify-between bg-background-card border border-border-subtle p-4 rounded-2xl">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Installed Mods in {currentInstance?.name || 'Selected Instance'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {installedMods.length} mods located in <code>instances/{currentInstance?.id}/minecraft/mods/</code>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={FolderOpen}
                onClick={() => selectedInstanceId && onOpenFolder(selectedInstanceId)}
              >
                Open Mods Folder
              </Button>

              <Button
                variant="ghost"
                size="sm"
                icon={RefreshCw}
                onClick={fetchInstalledMods}
                isLoading={isLoadingInstalled}
              >
                Refresh
              </Button>
            </div>
          </div>

          {isLoadingInstalled ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <RefreshCw size={24} className="animate-spin text-emerald-500" />
              <p className="text-xs">Reading installed mods...</p>
            </div>
          ) : installedMods.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-500 gap-2 border border-dashed border-border-subtle rounded-2xl">
              <Boxes size={32} className="text-slate-600 mb-1" />
              <p className="text-sm font-medium text-slate-400">No mods installed in this instance</p>
              <p className="text-xs text-slate-600">
                Switch to the "Browse Mods" tab to discover and install mods
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto pr-1">
              {installedMods.map((mod) => (
                <div
                  key={mod.filename}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                    mod.enabled
                      ? 'bg-background-card border-border-subtle hover:border-border-strong'
                      : 'bg-background-darkest/50 border-border-subtle/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                        mod.enabled
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-slate-800 border-slate-700 text-slate-500'
                      }`}
                    >
                      <Package size={17} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-100 truncate">
                          {mod.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-background-darkest text-slate-400 border border-border-subtle">
                          {mod.version}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono block truncate">
                        {mod.filename} • {formatFileSize(mod.fileSizeBytes)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleMod(mod)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        mod.enabled
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mod.enabled ? 'Enabled' : 'Disabled'}
                    </button>

                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      onClick={() => handleDeleteMod(mod)}
                      title="Delete Mod"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedModForVersions && (
        <Modal
          isOpen={Boolean(selectedModForVersions)}
          onClose={() => setSelectedModForVersions(null)}
          title={`Install ${selectedModForVersions.name}`}
          description={`Select compatible version for ${currentInstance?.name || 'Minecraft'} (${currentInstance?.loaderType} • ${currentInstance?.minecraftVersion})`}
          maxWidthClass="max-w-xl"
        >
          <div className="flex flex-col gap-4">
            {isLoadingVersions ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                <RefreshCw size={24} className="animate-spin text-emerald-400" />
                <span className="text-xs">Fetching compatible versions from Modrinth...</span>
              </div>
            ) : availableVersions.length === 0 ? (
              <div className="py-8 text-center text-slate-500 flex flex-col items-center gap-2">
                <AlertCircle size={28} className="text-amber-400" />
                <p className="text-xs text-slate-300">
                  No matching versions found for {currentInstance?.loaderType} {currentInstance?.minecraftVersion}.
                </p>
                <p className="text-[11px] text-slate-500">
                  This mod might not support this specific version of Minecraft or loader.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
                {availableVersions.map((ver) => (
                  <div
                    key={ver.id}
                    className="p-3 rounded-xl bg-background-darkest border border-border-subtle flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {ver.name || ver.versionNumber}
                        </span>
                        <span
                          className={`text-[9px] uppercase font-mono px-1.5 py-0.2 rounded border ${
                            ver.releaseType === 'release'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                        >
                          {ver.releaseType}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                        <span>{ver.filename}</span>
                        <span>•</span>
                        <span>{formatFileSize(ver.sizeBytes)}</span>
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      icon={Download}
                      isLoading={installingVersionId === ver.id}
                      onClick={() => handleInstallVersion(ver)}
                    >
                      Install
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
