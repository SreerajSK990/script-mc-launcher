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
  AlertCircle,
  Loader2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import type { InstanceConfiguration, ModLoaderType } from '@shared/types/instance'
import type {
  ModSearchResult,
  ModVersionFile,
  InstalledModRecord,
  ModSource
} from '@shared/types/mods'
import type { ModpackImportProgressEvent } from '@shared/types/modpack'
import { Button } from '@renderer/components/common/Button'
import { Modal } from '@renderer/components/common/Modal'
import { ChangeModVersionModal } from '@renderer/components/mods/ChangeModVersionModal'

interface ModBrowserPageProps {
  instances: InstanceConfiguration[]
  onOpenFolder: (instanceId: string) => void
  onNotification: (message: string) => void
  initialInstanceId?: string
  onInstanceCreated?: (instance: InstanceConfiguration) => void
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
  onNotification,
  initialInstanceId,
  onInstanceCreated
}) => {
  const [projectType, setProjectType] = useState<'mod' | 'modpack'>('mod')
  const [activeSubTab, setActiveSubTab] = useState<'browse' | 'installed'>('browse')
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(
    initialInstanceId ||
    instances.find((i) => i.loaderType !== 'vanilla')?.id ||
    instances[0]?.id ||
    ''
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedSource, setSelectedSource] = useState<'all' | 'modrinth' | 'curseforge'>('modrinth')
  const [searchResults, setSearchResults] = useState<ModSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [hasMoreResults, setHasMoreResults] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const PAGE_SIZE = 24

  const [selectedModForVersions, setSelectedModForVersions] = useState<ModSearchResult | null>(null)
  const [availableVersions, setAvailableVersions] = useState<ModVersionFile[]>([])
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null)

  // Modpack install state
  const [modpackInstanceName, setModpackInstanceName] = useState('')
  const [modpackProgress, setModpackProgress] = useState<ModpackImportProgressEvent | null>(null)
  const [isInstallingModpack, setIsInstallingModpack] = useState(false)

  const [installedMods, setInstalledMods] = useState<InstalledModRecord[]>([])
  const [isLoadingInstalled, setIsLoadingInstalled] = useState(false)
  const [selectedInstalledModForChange, setSelectedInstalledModForChange] = useState<InstalledModRecord | null>(null)

  const currentInstance = instances.find((i) => i.id === selectedInstanceId)

  useEffect(() => {
    if (initialInstanceId) {
      setSelectedInstanceId(initialInstanceId)
    } else if (!selectedInstanceId && instances.length > 0) {
      const preferred = instances.find((i) => i.loaderType !== 'vanilla') || instances[0]
      setSelectedInstanceId(preferred.id)
    }
  }, [instances, selectedInstanceId, initialInstanceId])

  // Listen to modpack install progress
  useEffect(() => {
    if (!window.launcherAPI?.modpacks) return
    const unsub = window.launcherAPI.modpacks.onProgress((event) => {
      setModpackProgress(event)
    })
    return () => {
      unsub()
    }
  }, [])

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

  const getInstalledModForProject = useCallback(
    (project: ModSearchResult): InstalledModRecord | undefined => {
      if (projectType !== 'mod' || !selectedInstanceId) return undefined

      const projId = project.id.toLowerCase()
      const projSlug = (project.slug || '').toLowerCase()
      const projName = project.name.toLowerCase()
      const projClean = projName.replace(/[^a-z0-9]/g, '')

      return installedMods.find((inst) => {
        const instId = inst.id.toLowerCase()
        const instName = inst.name.toLowerCase()
        const instClean = instName.replace(/[^a-z0-9]/g, '')
        const instFile = inst.filename.toLowerCase()

        // Direct ID or slug match
        if (instId === projId || (projSlug && instId === projSlug)) return true

        // Exact name match
        if (instName === projName || (projClean.length >= 3 && instClean === projClean)) return true

        // Filename prefix match with slug or clean name
        if (
          projSlug &&
          (instFile.startsWith(projSlug + '-') ||
            instFile.startsWith(projSlug + '_') ||
            instFile.startsWith(projSlug + '+'))
        ) {
          return true
        }
        if (projClean.length >= 4 && instFile.startsWith(projClean)) {
          return true
        }

        return false
      })
    },
    [projectType, selectedInstanceId, installedMods]
  )

  useEffect(() => {
    if (selectedInstanceId && projectType === 'mod') {
      fetchInstalledMods()
    }
  }, [selectedInstanceId, fetchInstalledMods, projectType])

  const executeSearch = useCallback(
    async (page = 0, isAppend = false) => {
      if (!window.launcherAPI?.mods) return

      try {
        if (isAppend) {
          setIsLoadingMore(true)
        } else {
          setIsSearching(true)
          if (page === 0) {
            setSearchResults([])
          }
        }

        const results = await window.launcherAPI.mods.search({
          query: searchQuery.trim(),
          category: selectedCategory !== 'all' ? selectedCategory : undefined,
          source: selectedSource,
          projectType,
          minecraftVersion: projectType === 'mod' ? currentInstance?.minecraftVersion : undefined,
          loader:
            projectType === 'mod' && currentInstance?.loaderType !== 'vanilla'
              ? currentInstance?.loaderType
              : undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE
        })

        if (isAppend) {
          let addedCount = 0
          setSearchResults((prev) => {
            const existingKeys = new Set(prev.map((item) => `${item.source}:${item.id}`))
            const uniqueNew = results.filter((item) => !existingKeys.has(`${item.source}:${item.id}`))
            addedCount = uniqueNew.length
            return [...prev, ...uniqueNew]
          })
          setHasMoreResults(results.length >= PAGE_SIZE && addedCount > 0)
        } else {
          setSearchResults(results)
          setHasMoreResults(results.length >= PAGE_SIZE)
        }

        setCurrentPage(page)
      } catch (error) {
        console.error('Search error:', error)
        if (!isAppend) setSearchResults([])
      } finally {
        setIsSearching(false)
        setIsLoadingMore(false)
      }
    },
    [searchQuery, selectedCategory, selectedSource, projectType, currentInstance]
  )

  useEffect(() => {
    setCurrentPage(0)
    const timer = setTimeout(() => {
      executeSearch(0, false)
    }, 300)
    return () => clearTimeout(timer)
  }, [executeSearch])

  const handleLoadMore = () => {
    if (isLoadingMore || isSearching || !hasMoreResults) return
    executeSearch(currentPage + 1, true)
  }

  const handleNextPage = () => {
    if (isSearching || isLoadingMore || !hasMoreResults) return
    executeSearch(currentPage + 1, false)
  }

  const handlePrevPage = () => {
    if (isSearching || isLoadingMore || currentPage <= 0) return
    executeSearch(currentPage - 1, false)
  }

  const handleOpenInstallModal = async (mod: ModSearchResult) => {
    setSelectedModForVersions(mod)
    setAvailableVersions([])
    setIsLoadingVersions(true)
    setModpackInstanceName(mod.name)
    setModpackProgress(null)
    setIsInstallingModpack(false)

    try {
      if (window.launcherAPI?.mods) {
        const versions = await window.launcherAPI.mods.getVersions(
          mod.id,
          mod.source,
          projectType === 'mod' ? currentInstance?.minecraftVersion : undefined,
          projectType === 'mod' && currentInstance?.loaderType !== 'vanilla' ? currentInstance?.loaderType : undefined
        )
        setAvailableVersions(versions)
      }
    } catch (error) {
      console.error('Failed to get versions:', error)
    } finally {
      setIsLoadingVersions(false)
    }
  }

  const handleInstallModVersion = async (version: ModVersionFile, oldFilename?: string) => {
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
        },
        oldFilename
      })

      onNotification(
        oldFilename
          ? `Switched ${selectedModForVersions.name} to version ${version.versionNumber || version.name}!`
          : `Installed ${selectedModForVersions.name} successfully.`
      )
      await fetchInstalledMods()
      setSelectedModForVersions(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to install mod'
      onNotification(message)
    } finally {
      setInstallingVersionId(null)
    }
  }

  const handleInstallModpackVersion = async (version: ModVersionFile) => {
    if (!selectedModForVersions || !window.launcherAPI?.modpacks) return

    try {
      setIsInstallingModpack(true)
      const instance = await window.launcherAPI.modpacks.installRemote({
        source: selectedModForVersions.source,
        projectId: selectedModForVersions.id,
        versionFile: version,
        customInstanceName: modpackInstanceName.trim() || selectedModForVersions.name
      })

      onNotification(`Installed modpack "${instance.name}" successfully!`)
      onInstanceCreated?.(instance)
      setSelectedModForVersions(null)
    } catch (error: any) {
      onNotification(error?.message || 'Failed to install modpack')
    } finally {
      setIsInstallingModpack(false)
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
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* Header bar (Pinned) */}
      <div className="shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-border-subtle">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            {projectType === 'modpack' ? (
              <Package size={24} className="text-primary" />
            ) : (
              <Boxes size={24} className="text-primary" />
            )}
            <span>{projectType === 'modpack' ? 'Modpack Browser' : 'Mod Browser'}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {projectType === 'modpack'
              ? 'Discover and install complete curated modpacks directly from Modrinth and CurseForge'
              : 'Discover, download, and manage mods directly for your Minecraft instances'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Project Type Switcher */}
          <div className="flex items-center gap-1 bg-background-darkest border border-border-subtle p-1 rounded-xl">
            <button
              onClick={() => {
                setProjectType('mod')
                setActiveSubTab('browse')
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                projectType === 'mod'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Boxes size={14} />
              <span>Mods</span>
            </button>
            <button
              onClick={() => {
                setProjectType('modpack')
                setActiveSubTab('browse')
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                projectType === 'modpack'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Package size={14} />
              <span>Modpacks</span>
            </button>
          </div>

          {/* Instance selector (only in mods mode) */}
          {projectType === 'mod' ? (
            <div className="flex items-center gap-2 bg-background-darkest border border-border-subtle p-1.5 rounded-xl">
              <span className="text-xs text-slate-400 pl-2">Target Instance:</span>
              {instances.length === 0 ? (
                <span className="text-xs text-slate-500 pr-2">No instances created</span>
              ) : (
                <select
                  value={selectedInstanceId}
                  onChange={(e) => setSelectedInstanceId(e.target.value)}
                  className="bg-background-surface text-slate-100 text-xs px-3 py-1.5 rounded-lg border border-border-subtle focus:outline-none focus:border-primary font-medium"
                >
                  {instances.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} ({inst.loaderType} • {inst.minecraftVersion})
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-background-darkest border border-border-subtle text-xs text-slate-300">
              <Layers size={14} className="text-primary" />
              <span>Installs as New Instance</span>
            </div>
          )}

          {/* Browse / Installed Tabs (only in mods mode) */}
          {projectType === 'mod' && (
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
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-primary/20 text-primary">
                  {installedMods.length}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {activeSubTab === 'browse' ? (
        <div className="flex flex-col flex-1 min-h-0 pt-3">
          {/* Search Toolbar (Pinned) */}
          <div className="shrink-0 flex flex-col gap-2.5 pb-3">
            <div className="flex flex-col md:flex-row items-center gap-3 bg-background-card border border-border-subtle p-3 rounded-2xl">
              <div className="relative flex-1 w-full">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder={
                    projectType === 'modpack'
                      ? 'Search modpacks on Modrinth / CurseForge...'
                      : 'Search mods on Modrinth...'
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 bg-background-darkest rounded-xl text-xs text-slate-100 placeholder-slate-500 border border-border-subtle focus:border-primary focus:outline-none"
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
                {projectType === 'mod' && (
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-background-darkest text-slate-200 text-xs px-3 py-2 rounded-xl border border-border-subtle focus:outline-none focus:border-primary"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex items-center gap-1 bg-background-darkest border border-border-subtle p-1 rounded-xl">
                  <button
                    onClick={() => setSelectedSource('modrinth')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      selectedSource === 'modrinth'
                        ? 'bg-background-surface text-primary border border-primary/20'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Modrinth
                  </button>
                  <button
                    onClick={() => setSelectedSource('curseforge')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      selectedSource === 'curseforge'
                        ? 'bg-background-surface text-amber-400 border border-amber-500/20'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    CurseForge
                  </button>
                </div>

                <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => executeSearch(0, false)} disabled={isSearching} />
              </div>
            </div>

            {/* Search Result Count */}
            {!isSearching && searchResults.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] text-slate-400 font-mono">
                  Showing {searchResults.length} {projectType === 'modpack' ? 'modpacks' : 'mods'} (Page {currentPage + 1})
                </span>
                {hasMoreResults && (
                  <span className="text-[11px] text-primary/80 font-medium">
                    More results available below
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Results Area (Scrolls independently) */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1.5 flex flex-col gap-4">
            {isSearching ? (
              <div className="flex-1 flex flex-col items-center justify-center py-24 text-slate-500 gap-3">
                <RefreshCw size={28} className="animate-spin text-primary" />
                <p className="text-xs">
                  {projectType === 'modpack' ? 'Searching modpacks...' : 'Searching mods...'}
                </p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-500 gap-2 border border-dashed border-border-subtle rounded-2xl">
                <Package size={32} className="text-slate-600 mb-1" />
                <p className="text-sm font-medium text-slate-400">
                  {projectType === 'modpack' ? 'No modpacks found' : 'No mods found'}
                </p>
                <p className="text-xs text-slate-600">
                  Try refining your search query or selecting a different source
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {searchResults.map((item) => (
                    <div
                      key={`${item.source}-${item.id}`}
                      className="bg-background-card hover:bg-background-surface/80 border border-border-subtle hover:border-border-strong rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 group"
                    >
                      <div>
                        <div className="flex items-start gap-3 mb-2.5">
                          {item.iconUrl ? (
                            <img
                              src={item.iconUrl}
                              alt={item.name}
                              className="w-10 h-10 rounded-xl bg-background-darkest object-cover border border-border-subtle shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                              {projectType === 'modpack' ? <Package size={18} /> : <Boxes size={18} />}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <h3 className="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
                                {item.name}
                              </h3>
                              <span
                                className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                                  item.source === 'modrinth'
                                    ? 'bg-primary/15 text-primary border-primary/30'
                                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                }`}
                              >
                                {item.source}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 block truncate">
                              by {item.author}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed mb-3 line-clamp-2">
                          {item.description}
                        </p>

                        <div className="flex flex-wrap gap-1 mb-3">
                          {item.loaders.slice(0, 3).map((loader) => (
                            <span
                              key={loader}
                              className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-background-darkest text-slate-400 border border-border-subtle"
                            >
                              {loader}
                            </span>
                          ))}
                          {item.categories.slice(0, 2).map((cat) => (
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
                          {formatDownloads(item.downloads)} downloads
                        </span>

                        {(() => {
                          const installedRecord = getInstalledModForProject(item)
                          if (installedRecord) {
                            return (
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={Check}
                                className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                                onClick={() => handleOpenInstallModal(item)}
                                title={`Installed (${installedRecord.version || 'installed'}). Click to change version.`}
                              >
                                Installed
                              </Button>
                            )
                          }
                          return (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={Download}
                              onClick={() => handleOpenInstallModal(item)}
                            >
                              {projectType === 'modpack' ? 'Install Modpack' : 'Install'}
                            </Button>
                          )
                        })()}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 pb-8 border-t border-border-subtle/50 mt-2">
                  <div className="text-xs text-slate-400">
                    Page <span className="font-semibold text-white">{currentPage + 1}</span> • Showing{' '}
                    <span className="font-semibold text-white">{searchResults.length}</span> items
                  </div>

                  <div className="flex items-center gap-2">
                    {hasMoreResults && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={isLoadingMore ? Loader2 : Download}
                        isLoading={isLoadingMore}
                        onClick={handleLoadMore}
                        className="text-xs font-semibold"
                      >
                        Load More
                      </Button>
                    )}

                    <div className="flex items-center gap-1 bg-background-darkest border border-border-subtle p-1 rounded-xl">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={ChevronLeft}
                        disabled={currentPage <= 0 || isSearching}
                        onClick={handlePrevPage}
                        title="Previous Page"
                      />
                      <span className="text-xs font-mono px-2.5 text-slate-300 font-semibold">
                        {currentPage + 1}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={ChevronRight}
                        disabled={!hasMoreResults || isSearching}
                        onClick={handleNextPage}
                        title="Next Page"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Installed Mods Tab (Mods Mode Only) */
        <div className="flex flex-col flex-1 min-h-0 pt-3 gap-4">
          <div className="shrink-0 flex items-center justify-between bg-background-card border border-border-subtle p-4 rounded-2xl">
            <div>
              <h3 className="text-sm font-bold text-white">
                Installed in {currentInstance?.name || 'Instance'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {installedMods.length} mods currently placed in instance mods folder
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
                disabled={isLoadingInstalled}
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {isLoadingInstalled ? (
              <div className="py-16 text-center text-slate-500 text-xs">Loading installed mods...</div>
            ) : installedMods.length === 0 ? (
              <div className="py-16 text-center text-slate-500 border border-dashed border-border-subtle rounded-2xl p-6">
                <p className="text-xs text-slate-400 mb-2">No mods installed in this instance yet.</p>
                <Button variant="primary" size="sm" onClick={() => setActiveSubTab('browse')}>
                  Browse & Install Mods
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pb-6">
                {installedMods.map((mod) => (
                  <div
                    key={mod.filename}
                    className={`p-3.5 rounded-2xl border transition-all duration-150 flex items-center justify-between gap-3 ${
                      mod.enabled
                        ? 'bg-background-card border-border-subtle hover:border-border-strong hover:bg-background-surface/50'
                        : 'bg-background-darkest/50 border-border-subtle/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                          mod.enabled
                            ? 'bg-primary/10 border-primary/20 text-primary'
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
                            ? 'bg-primary/15 border-primary/30 text-primary hover:bg-primary/20'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {mod.enabled ? 'Enabled' : 'Disabled'}
                      </button>

                      <Button
                        variant="secondary"
                        size="sm"
                        icon={ArrowUpDown}
                        onClick={() => setSelectedInstalledModForChange(mod)}
                        title="Change mod version"
                      >
                        Change Version
                      </Button>

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
        </div>
      )}


      {/* Install Modal (Handles both Mod installation and Modpack installation) */}
      {selectedModForVersions && (
        <Modal
          isOpen={Boolean(selectedModForVersions)}
          onClose={() => {
            if (!isInstallingModpack) {
              setSelectedModForVersions(null)
            }
          }}
          title={
            projectType === 'modpack'
              ? `Install Modpack: ${selectedModForVersions.name}`
              : `Install ${selectedModForVersions.name}`
          }
          description={
            projectType === 'modpack'
              ? `Create a new Minecraft instance from this modpack`
              : `Select compatible version for ${currentInstance?.name || 'Minecraft'} (${currentInstance?.loaderType} • ${currentInstance?.minecraftVersion})`
          }
          maxWidthClass="max-w-xl"
        >
          <div className="flex flex-col gap-4">
            {/* Instance Name Input for Modpacks */}
            {projectType === 'modpack' && (
              <div className="bg-background-darkest border border-border-subtle p-3.5 rounded-xl space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  New Instance Name
                </label>
                <input
                  type="text"
                  value={modpackInstanceName}
                  onChange={(e) => setModpackInstanceName(e.target.value)}
                  disabled={isInstallingModpack}
                  placeholder="Instance Name"
                  className="w-full bg-background-surface border border-border-subtle focus:border-primary rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
                />
              </div>
            )}

            {/* Live Modpack Installation Progress */}
            {projectType === 'modpack' && isInstallingModpack && modpackProgress && (
              <div className="bg-background-darkest border border-border-subtle p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200 capitalize flex items-center gap-1.5">
                    <Loader2 size={13} className="animate-spin text-primary" />
                    {modpackProgress.step}
                  </span>
                  <span className="text-primary font-mono">{modpackProgress.percentage}%</span>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-300 rounded-full"
                    style={{ width: `${modpackProgress.percentage}%` }}
                  />
                </div>

                <p className="text-xs text-slate-400 truncate font-mono">{modpackProgress.message}</p>
              </div>
            )}

            {isLoadingVersions ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                <RefreshCw size={24} className="animate-spin text-primary" />
                <span className="text-xs">Fetching available versions...</span>
              </div>
            ) : availableVersions.length === 0 ? (
              <div className="py-8 text-center text-slate-500 flex flex-col items-center gap-2">
                <AlertCircle size={28} className="text-amber-400" />
                <p className="text-xs text-slate-300">
                  {projectType === 'modpack'
                    ? 'No installable versions found for this modpack.'
                    : `No matching versions found for ${currentInstance?.loaderType} ${currentInstance?.minecraftVersion}.`}
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
                              ? 'bg-primary/10 text-primary border-primary/20'
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
                        {ver.gameVersions && ver.gameVersions.length > 0 && (
                          <>
                            <span>•</span>
                            <span>MC {ver.gameVersions[0]}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const installedRecordForModal = selectedModForVersions
                        ? getInstalledModForProject(selectedModForVersions)
                        : undefined

                      const isCurrent =
                        projectType === 'mod' &&
                        installedRecordForModal &&
                        (ver.filename.toLowerCase() ===
                          installedRecordForModal.filename.toLowerCase() ||
                          ver.versionNumber === installedRecordForModal.version)

                      if (isCurrent) {
                        return (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-semibold">
                            <Check size={13} />
                            <span>Current</span>
                          </div>
                        )
                      }

                      if (projectType === 'mod' && installedRecordForModal) {
                        return (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={installingVersionId === ver.id ? Loader2 : ArrowUpDown}
                            isLoading={installingVersionId === ver.id}
                            disabled={isInstallingModpack}
                            onClick={() =>
                              handleInstallModVersion(ver, installedRecordForModal.filename)
                            }
                          >
                            Switch Version
                          </Button>
                        )
                      }

                      return (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={Download}
                          isLoading={
                            projectType === 'modpack'
                              ? isInstallingModpack
                              : installingVersionId === ver.id
                          }
                          disabled={isInstallingModpack}
                          onClick={() =>
                            projectType === 'modpack'
                              ? handleInstallModpackVersion(ver)
                              : handleInstallModVersion(ver)
                          }
                        >
                          {projectType === 'modpack' ? 'Install Pack' : 'Install'}
                        </Button>
                      )
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Change Mod Version Modal (from Installed tab) */}
      {currentInstance && (
        <ChangeModVersionModal
          isOpen={Boolean(selectedInstalledModForChange)}
          onClose={() => setSelectedInstalledModForChange(null)}
          instance={currentInstance}
          mod={selectedInstalledModForChange}
          onSuccess={(msg) => {
            onNotification(msg)
            fetchInstalledMods()
          }}
        />
      )}
    </div>
  )
}
