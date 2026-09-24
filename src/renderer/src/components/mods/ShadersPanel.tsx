import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Search,
  Upload,
  FolderOpen,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  Sun,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  Download
} from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { ModSearchResult, ModVersionFile } from '@shared/types/mods'
import type { ShaderPack, ShaderEnvironment } from '@shared/types/operations'
import { Button } from '@renderer/components/common/Button'
import { ConfirmModal } from '@renderer/components/common/ConfirmModal'
import { ModDetailModal } from './ModDetailModal'
import { installModWithPreview, unwrapResult } from './DependencyInstallHost'

export interface ShadersPanelProps {
  instance?: InstanceConfiguration
  activeSubTab?: 'browse' | 'installed'
  onSubTabChange?: (tab: 'browse' | 'installed') => void
  onInstalledCountChange?: (count: number) => void
}

const PAGE_SIZE = 24

function formatFileSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatDownloads(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
  return String(num)
}

export const ShadersPanel: React.FC<ShadersPanelProps> = ({
  instance,
  activeSubTab,
  onSubTabChange,
  onInstalledCountChange
}) => {
  const [internalSubTab, setInternalSubTab] = useState<'browse' | 'installed'>('browse')
  const currentTab = activeSubTab ?? internalSubTab
  const handleTabChange = (tab: 'browse' | 'installed') => {
    if (onSubTabChange) {
      onSubTabChange(tab)
    } else {
      setInternalSubTab(tab)
    }
  }

  const [query, setQuery] = useState('')
  const [source, setSource] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [results, setResults] = useState<ModSearchResult[]>([])
  const [packs, setPacks] = useState<ShaderPack[]>([])
  const [environment, setEnvironment] = useState<ShaderEnvironment | null>(null)
  const [detail, setDetail] = useState<ModSearchResult | null>(null)
  const [remove, setRemove] = useState<ShaderPack | null>(null)
  const [busy, setBusy] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreResults, setHasMoreResults] = useState(true)
  const [currentPage, setCurrentPage] = useState(0)
  const [safetyLimit, setSafetyLimit] = useState(8)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [message, setMessage] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const generation = useRef(0)
  const isFetchingRef = useRef(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const isEmbeddedInModBrowser = activeSubTab !== undefined

  const getInstalledShader = useCallback(
    (project: ModSearchResult): ShaderPack | undefined => {
      const projId = (project.id || '').toLowerCase().trim()
      const projSlug = (project.slug || '').toLowerCase().trim()
      const projName = (project.name || '').toLowerCase().trim()
      const projClean = projName.replace(/[^a-z0-9]/g, '')
      const projCore = projClean.replace(/(shaders|shader|packs|pack)$/g, '')

      return packs.find((pack) => {
        const packId = (pack.id || '').toLowerCase().trim()
        const packName = (pack.name || '').toLowerCase().trim()
        const packClean = packName.replace(/[^a-z0-9]/g, '')
        const packFile = (pack.filename || '').toLowerCase().trim()
        const packFileBase = packFile.replace(/\.zip$/i, '')
        const packFileClean = packFileBase.replace(/[^a-z0-9]/g, '')
        const packCore = packFileClean.replace(/(shaders|shader|packs|pack)$/g, '')

        if (pack.source && project.source && pack.source === project.source && packId === projId) {
          return true
        }
        if (packId === projId || (projSlug && packId === projSlug)) {
          return true
        }
        if (packName === projName || (projClean.length >= 3 && packClean === projClean)) {
          return true
        }
        if (
          projSlug &&
          (packFileBase === projSlug ||
            packFile.startsWith(projSlug + '-') ||
            packFile.startsWith(projSlug + '_') ||
            packFile.startsWith(projSlug + '+') ||
            packFile.startsWith(projSlug + '.') ||
            packFile.includes(projSlug))
        ) {
          return true
        }
        if (
          projClean.length >= 4 &&
          (packFileClean.startsWith(projClean) ||
            packFileClean.includes(projClean) ||
            projClean.includes(packFileClean))
        ) {
          return true
        }
        if (
          projCore.length >= 3 &&
          (packFileClean.startsWith(projCore) || packCore.startsWith(projCore))
        ) {
          return true
        }
        return false
      })
    },
    [packs]
  )

  const refresh = useCallback(async () => {
    if (!instance) return
    const [installed, loader] = await Promise.all([
      window.launcherAPI.content.listShaders(instance.id),
      window.launcherAPI.content.shaderEnvironment(instance.id)
    ])
    const packsList = unwrapResult(installed)
    setPacks(packsList)
    setEnvironment(unwrapResult(loader))
    onInstalledCountChange?.(packsList.length)
  }, [instance?.id, onInstalledCountChange])

  useEffect(() => {
    setPacks([])
    setEnvironment(null)
    setDetail(null)
    refresh().catch((error) => setMessage(String(error)))
  }, [refresh])

  const executeSearch = useCallback(
    async (pageToLoad = 0, isAppend = false) => {
      if (isFetchingRef.current) return
      const currentGen = ++generation.current
      isFetchingRef.current = true

      if (isAppend) {
        setIsLoadingMore(true)
      } else {
        setIsSearching(true)
        if (pageToLoad === 0) {
          setResults([])
        }
      }

      try {
        const hits = await window.launcherAPI.mods.search({
          query: query.trim(),
          source,
          projectType: 'shader',
          minecraftVersion: instance?.minecraftVersion,
          limit: PAGE_SIZE,
          offset: pageToLoad * PAGE_SIZE
        })

        if (currentGen === generation.current) {
          if (isAppend) {
            setResults((prev) => {
              const existingKeys = new Set(prev.map((item) => `${item.source}:${item.id}`))
              const uniqueNew = hits.filter((item) => !existingKeys.has(`${item.source}:${item.id}`))
              return [...prev, ...uniqueNew]
            })
          } else {
            setResults(hits)
          }
          setHasMoreResults(hits.length >= PAGE_SIZE)
          setCurrentPage(pageToLoad)
        }
      } catch (error) {
        if (currentGen === generation.current) {
          setMessage(error instanceof Error ? error.message : String(error))
          if (!isAppend) setResults([])
        }
      } finally {
        if (currentGen === generation.current) {
          setIsSearching(false)
          setIsLoadingMore(false)
          isFetchingRef.current = false
        }
      }
    },
    [query, source, instance?.minecraftVersion]
  )

  useEffect(() => {
    setCurrentPage(0)
    setSafetyLimit(8)
    scrollContainerRef.current?.scrollTo({ top: 0 })
    const timer = setTimeout(() => {
      executeSearch(0, false)
    }, 300)
    return () => clearTimeout(timer)
  }, [executeSearch])

  useEffect(() => {
    const sentinel = sentinelRef.current
    const container = scrollContainerRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          if (!hasMoreResults || isSearching || isLoadingMore || isFetchingRef.current) {
            return
          }
          if (currentPage >= safetyLimit) {
            return
          }
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
          }
          debounceTimerRef.current = setTimeout(() => {
            executeSearch(currentPage + 1, true)
          }, 200)
        }
      },
      {
        root: isEmbeddedInModBrowser ? container || null : null,
        rootMargin: '300px'
      }
    )

    observer.observe(sentinel)

    return () => {
      observer.disconnect()
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [hasMoreResults, isSearching, isLoadingMore, currentPage, safetyLimit, executeSearch, isEmbeddedInModBrowser])

  useEffect(() => {
    if (isEmbeddedInModBrowser) return
    const handleWindowScroll = () => {
      if (window.scrollY > 500) {
        setShowScrollTop(true)
      } else {
        setShowScrollTop(false)
      }
    }
    window.addEventListener('scroll', handleWindowScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleWindowScroll)
  }, [isEmbeddedInModBrowser])

  const handleContainerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    if (target.scrollTop > 500) {
      if (!showScrollTop) setShowScrollTop(true)
    } else {
      if (showScrollTop) setShowScrollTop(false)
    }
  }

  const handleScrollToTop = () => {
    if (isEmbeddedInModBrowser && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const perform = async (work: () => Promise<void>) => {
    setBusy(true)
    setMessage('')
    try {
      await work()
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const install = async (project: ModSearchResult, version: ModVersionFile) => {
    if (!instance) throw new Error('Select an instance first')
    if (busy) throw new Error('Another operation is in progress')
    setBusy(true)
    try {
      const previous = getInstalledShader(project)
      unwrapResult(
        await window.launcherAPI.content.installShader({
          instanceId: instance.id,
          versionFile: version,
          modMetadata: { id: project.id, name: project.name, source: project.source },
          oldFilename: previous?.filename
        })
      )
      setMessage(`${project.name} installed. Select it in Minecraft's shader settings.`)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const setupLoader = () =>
    perform(async () => {
      if (!instance || !environment?.recommendedProject) return
      const versions = await window.launcherAPI.mods.getVersions(
        environment.recommendedProject,
        'modrinth',
        instance.minecraftVersion,
        instance.loaderType
      )
      const version = versions.find((item) => item.releaseType === 'release') || versions[0]
      if (!version)
        throw new Error(
          'No compatible shader-loader version is available for this Minecraft version and platform'
        )
      await installModWithPreview({
        instanceId: instance.id,
        versionFile: version,
        modMetadata: {
          id: version.projectId,
          name: environment.recommendedProject === 'iris' ? 'Iris' : 'Oculus',
          source: 'modrinth'
        }
      })
      setMessage('Shader loader installed. Launch Minecraft and select your shader in video settings.')
    })

  const importPaths = (paths: string[]) =>
    perform(async () => {
      if (!instance) throw new Error('Select an instance first')
      unwrapResult(await window.launcherAPI.content.importShaders(instance.id, paths))
      setMessage('Shader pack(s) imported successfully.')
    })

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    if (!instance || busy) return
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.launcherAPI.system.pathForFile(file))
      .filter((p): p is string => Boolean(p && p.toLowerCase().endsWith('.zip')))
    if (paths.length === 0) {
      setMessage('Please drop valid .zip shader pack files.')
      return
    }
    void importPaths(paths)
  }

  return (
    <section
      className={`text-sm text-slate-300 relative ${
        isEmbeddedInModBrowser ? 'flex flex-col h-full overflow-hidden gap-3' : 'space-y-4'
      }`}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsDragging(false)
        }
      }}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-background-dark/85 backdrop-blur-sm border-2 border-dashed border-primary rounded-2xl flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-150 pointer-events-none">
          <Sun size={48} className="text-primary animate-bounce mb-3" />
          <h3 className="text-lg font-bold text-white">Drop Shader Packs (.zip) Here</h3>
          <p className="text-xs text-slate-300 mt-1">
            {instance
              ? `Release .zip files to install them directly into "${instance.name}"`
              : 'Select an instance first to install dropped shaders'}
          </p>
        </div>
      )}

      <div className={`shrink-0 space-y-3 ${isEmbeddedInModBrowser ? '' : ''}`}>
        <div className="rounded-2xl border border-border-subtle bg-background-card p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl border shrink-0 ${
                  environment?.installed.length
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
              >
                {environment?.installed.length ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <AlertCircle size={20} />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">
                    {environment?.installed.length
                      ? `Shader Pipeline Ready (${environment.installed.join(', ')})`
                      : 'Shader Loader Required'}
                  </h3>
                  {environment?.installed.length ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Supported
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-semibold">
                      Needs Setup
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {environment?.message || 'Select an instance to check shader-loader support.'}
                </p>
              </div>
            </div>

            {environment && !environment.installed.length && environment.recommendedProject && (
              <Button
                variant="primary"
                size="sm"
                icon={Download}
                disabled={busy}
                onClick={setupLoader}
                className="shrink-0"
              >
                Install {environment.recommendedProject === 'iris' ? 'Iris' : 'Oculus'}
              </Button>
            )}
          </div>

          <p className="text-[11px] text-slate-500 pt-1 border-t border-border-subtle/50">
            Installed packs are available in-game. Activate your chosen shader in Minecraft's Video Settings → Shader Packs.
          </p>
        </div>

        {message && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-slate-200">
            <span>{message}</span>
            <button onClick={() => setMessage('')} className="text-slate-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-background-card border border-border-subtle p-3 rounded-2xl">
          {!activeSubTab ? (
            <div className="flex items-center gap-1 bg-background-darkest border border-border-subtle p-1 rounded-xl shrink-0">
              <button
                onClick={() => handleTabChange('browse')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  currentTab === 'browse'
                    ? 'bg-background-surface text-white shadow-sm border border-border-strong'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Browse Shaders
              </button>
              <button
                onClick={() => handleTabChange('installed')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  currentTab === 'installed'
                    ? 'bg-background-surface text-white shadow-sm border border-border-strong'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Installed</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-primary/20 text-primary">
                  {packs.length}
                </span>
              </button>
            </div>
          ) : null}

          {currentTab === 'browse' ? (
            <div className="flex flex-1 items-center gap-2.5 min-w-0">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search shaders on Modrinth / CurseForge..."
                  className="w-full pl-10 pr-8 py-2 bg-background-darkest rounded-xl text-xs text-slate-100 placeholder-slate-500 border border-border-subtle focus:border-primary focus:outline-none"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 bg-background-darkest border border-border-subtle p-1 rounded-xl shrink-0">
                <button
                  onClick={() => setSource('modrinth')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    source === 'modrinth'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Modrinth
                </button>
                <button
                  onClick={() => setSource('curseforge')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    source === 'curseforge'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  CurseForge
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 px-1">
              <span>{packs.length} shader pack{packs.length === 1 ? '' : 's'} installed in this instance</span>
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0 justify-end">
            <Button
              disabled={!instance || busy}
              variant="secondary"
              size="sm"
              icon={Upload}
              onClick={async () => {
                const path = await window.launcherAPI.system.selectFile({
                  title: 'Import shader pack',
                  filters: [{ name: 'Shader ZIP', extensions: ['zip'] }]
                })
                if (path) void importPaths([path])
              }}
            >
              Import ZIP
            </Button>
            <Button
              disabled={!instance}
              variant="ghost"
              size="sm"
              icon={FolderOpen}
              onClick={() =>
                perform(async () => {
                  if (instance) unwrapResult(await window.launcherAPI.content.openShaderFolder(instance.id))
                })
              }
            >
              Open Folder
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleContainerScroll}
        className={
          isEmbeddedInModBrowser
            ? 'flex-1 min-h-0 overflow-y-auto pr-1.5 flex flex-col gap-4'
            : 'flex flex-col gap-4'
        }
      >
        {currentTab === 'installed' && packs.length === 0 && (
          <div className="py-16 text-center text-slate-500 border border-dashed border-border-subtle rounded-2xl p-6">
            <Sun size={36} className="mx-auto text-slate-600 mb-3" />
            <p className="text-xs text-slate-400 mb-1">No shader packs installed in this instance yet.</p>
            <p className="text-[11px] text-slate-500 mb-4">You can browse and download shaders or drop shader ZIP files here.</p>
            <Button variant="primary" size="sm" onClick={() => handleTabChange('browse')}>
              Browse Shaders
            </Button>
          </div>
        )}

        {currentTab === 'installed' && packs.length > 0 && (
          <div className="flex flex-col gap-2 pb-6">
            {packs.map((pack) => (
              <div
                key={pack.filename}
                className="p-3.5 rounded-2xl border bg-background-card border-border-subtle hover:border-border-strong hover:bg-background-surface/50 transition-all duration-150 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                    <Sun size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white truncate">
                        {pack.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-background-darkest text-emerald-400 border border-emerald-500/20">
                        Installed
                      </span>
                      {pack.version && pack.version !== 'Local' && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-background-darkest text-slate-400 border border-border-subtle">
                          {pack.version}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono block truncate">
                      {pack.filename} • {formatFileSize(pack.sizeBytes)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {pack.source && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={ArrowUpDown}
                      disabled={busy}
                      onClick={() =>
                        setDetail({
                          id: pack.id,
                          name: pack.name,
                          source: pack.source!,
                          slug: pack.id,
                          author: '',
                          description: '',
                          downloads: 0,
                          categories: [],
                          loaders: [],
                          projectType: 'shader'
                        })
                      }
                      title="Change shader version"
                    >
                      Change Version
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    disabled={busy}
                    onClick={() => setRemove(pack)}
                    title="Delete shader pack"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {currentTab === 'browse' && isSearching && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 size={32} className="animate-spin text-primary mb-3" />
            <p className="text-xs">Searching shader packs...</p>
          </div>
        )}

        {currentTab === 'browse' && !isSearching && results.length === 0 && (
          <div className="py-16 text-center text-slate-500 border border-dashed border-border-subtle rounded-2xl p-6">
            <Sun size={36} className="mx-auto text-slate-600 mb-3" />
            <p className="text-xs text-slate-400 mb-1">No matching shader packs found.</p>
            <p className="text-[11px] text-slate-500">
              {source === 'curseforge'
                ? 'CurseForge requires an API key configured in Settings.'
                : 'Try searching with different keywords.'}
            </p>
          </div>
        )}

        {currentTab === 'browse' && !isSearching && results.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {results.map((project) => {
                const installedPack = getInstalledShader(project)
                const isInstalled = Boolean(installedPack)

                return (
                  <div
                    key={`${project.source}:${project.id}`}
                    onClick={() => setDetail(project)}
                    className="bg-background-card hover:bg-background-surface/80 border border-border-subtle hover:border-border-strong rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 group cursor-pointer"
                  >
                    <div>
                      <div className="flex items-start gap-3 mb-2.5">
                        {project.iconUrl ? (
                          <img
                            src={project.iconUrl}
                            alt={project.name}
                            className="w-10 h-10 rounded-xl bg-background-darkest object-cover border border-border-subtle shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                            <Sun size={18} />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
                              {project.name}
                            </h3>
                            <span
                              className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                                project.source === 'modrinth'
                                  ? 'bg-primary/15 text-primary border-primary/30'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {project.source}
                            </span>
                          </div>
                          {project.author && (
                            <span className="text-[11px] text-slate-400 block truncate">
                              by {project.author}
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed mb-3 line-clamp-2">
                        {project.description}
                      </p>

                      <div className="flex flex-wrap gap-1 mb-3">
                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-background-darkest text-amber-400 border border-amber-500/20">
                          Shader Pack
                        </span>
                        {project.categories.slice(0, 2).map((cat) => (
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
                        {formatDownloads(project.downloads)} downloads
                      </span>

                      {isInstalled ? (
                        <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-mono">
                          <CheckCircle2 size={12} />
                          <span>Installed</span>
                          {installedPack?.version && installedPack.version !== 'Local' && (
                            <span className="text-[10px] text-emerald-400/80">({installedPack.version})</span>
                          )}
                        </span>
                      ) : (
                        <Button
                          size="xs"
                          variant="secondary"
                          icon={Download}
                          onClick={(e) => {
                            e.stopPropagation()
                            setDetail(project)
                          }}
                        >
                          Install
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {isLoadingMore && (
              <div className="flex items-center justify-center py-6 gap-2 text-slate-400 text-xs">
                <Loader2 size={16} className="animate-spin text-primary" />
                <span>Loading more shader packs...</span>
              </div>
            )}

            {currentPage >= safetyLimit && hasMoreResults && (
              <div className="flex flex-col items-center justify-center py-6 gap-2.5 border-t border-border-subtle/40 mt-2">
                <p className="text-xs text-slate-400">
                  Showing <span className="font-semibold text-white">{results.length}</span> shader packs. Paused to conserve memory.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={() => {
                    setSafetyLimit((prev) => prev + 8)
                    executeSearch(currentPage + 1, true)
                  }}
                  className="text-xs font-semibold"
                >
                  Continue Browsing
                </Button>
              </div>
            )}

            {hasMoreResults && currentPage < safetyLimit && (
              <div ref={sentinelRef} className="h-6 w-full" />
            )}

            {!hasMoreResults && results.length > 0 && (
              <div className="py-8 text-center text-xs text-slate-500 font-medium border-t border-border-subtle/30 mt-2">
                End of catalog • Showing all {results.length} shader packs
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 pb-8 border-t border-border-subtle/50 mt-2">
              <div className="text-xs text-slate-400 font-mono">
                Page <span className="font-semibold text-white">{currentPage + 1}</span> • Showing{' '}
                <span className="font-semibold text-white">{results.length}</span> shader packs
              </div>

              {hasMoreResults && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={isLoadingMore ? Loader2 : Download}
                  isLoading={isLoadingMore}
                  disabled={isLoadingMore || isSearching}
                  onClick={() => executeSearch(currentPage + 1, true)}
                  className="text-xs font-semibold"
                >
                  Load More Shaders
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {showScrollTop && (
        <button
          onClick={handleScrollToTop}
          className="fixed bottom-6 right-8 p-3 rounded-full bg-primary text-white shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all duration-200 z-40 animate-in fade-in zoom-in-75"
          title="Scroll to top"
        >
          <ArrowUp size={18} />
        </button>
      )}

      <ModDetailModal
        isOpen={Boolean(detail)}
        onClose={() => setDetail(null)}
        mod={detail}
        currentInstance={instance}
        onInstallVersion={install}
        isInstalled={Boolean(detail && getInstalledShader(detail))}
        installedVersion={detail ? getInstalledShader(detail)?.version : undefined}
      />

      <ConfirmModal
        isOpen={Boolean(remove)}
        title="Delete shader pack?"
        message={`Remove "${remove?.name || 'this shader'}" from ${instance?.name || 'this instance'}?`}
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          const selected = remove
          setRemove(null)
          if (instance && selected)
            void perform(async () => {
              unwrapResult(await window.launcherAPI.content.deleteShader(instance.id, selected.filename))
              setMessage(`Removed "${selected.name}".`)
            })
        }}
      />
    </section>
  )
}
