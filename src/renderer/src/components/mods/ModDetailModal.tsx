import React, { useState, useEffect } from 'react'
import {
  X,
  Download,
  Check,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Calendar,
  Users,
  FileText,
  Sparkles,
  Heart,
  MessageSquare,
  Code,
  Tag,
  ImageIcon,
  Layers,
  Globe,
  Info,
  ChevronRight
} from 'lucide-react'
import { marked } from 'marked'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { ModSearchResult, ModDetail, ModVersionFile } from '@shared/types/mods'
import { Button } from '@renderer/components/common/Button'

interface ModDetailModalProps {
  isOpen: boolean
  onClose: () => void
  mod: ModSearchResult | null
  currentInstance?: InstanceConfiguration
  onInstallVersion?: (mod: ModSearchResult, version: ModVersionFile) => Promise<void>
  isInstalled?: boolean
  installedVersion?: string
}

function formatNumber(num: number): string {
  if (num >= 10000000) {
    return `${(num / 10000000).toFixed(1)}Cr`
  }
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return String(num)
}

function formatDateAgo(dateString?: string): string {
  if (!dateString) return 'Unknown'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return dateString

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(months / 12)
  return `${years}y ago`
}

export const ModDetailModal: React.FC<ModDetailModalProps> = ({
  isOpen,
  onClose,
  mod,
  currentInstance,
  onInstallVersion,
  isInstalled,
  installedVersion
}) => {
  const [activeTab, setActiveTab] = useState<'description' | 'versions' | 'gallery'>('description')
  const [detail, setDetail] = useState<ModDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [versions, setVersions] = useState<ModVersionFile[]>([])
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null)

  const [selectedLightboxImage, setSelectedLightboxImage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !mod) {
      setDetail(null)
      setVersions([])
      setActiveTab('description')
      setSelectedLightboxImage(null)
      return
    }

    let isMounted = true
    setIsLoadingDetail(true)
    setDetailError(null)

    if (window.launcherAPI?.mods?.getDetail) {
      window.launcherAPI.mods
        .getDetail(mod.source, mod.id)
        .then((res) => {
          if (isMounted) {
            setDetail(res)
            setIsLoadingDetail(false)
          }
        })
        .catch((err) => {
          if (isMounted) {
            console.error('Failed to fetch mod detail:', err)
            setDetailError(err instanceof Error ? err.message : 'Could not load mod details')
            setIsLoadingDetail(false)
          }
        })
    } else {
      setIsLoadingDetail(false)
    }

    setIsLoadingVersions(true)
    if (window.launcherAPI?.mods?.getVersions) {
      const loaderArg =
        mod.projectType === 'resourcepack' || currentInstance?.loaderType === 'vanilla'
          ? undefined
          : currentInstance?.loaderType

      window.launcherAPI.mods
        .getVersions(
          mod.id,
          mod.source,
          currentInstance?.minecraftVersion,
          loaderArg
        )
        .then(async (verList) => {
          if (!isMounted) return
          if (verList.length === 0 && mod.projectType === 'resourcepack') {
            const fallbackList = await window.launcherAPI.mods
              .getVersions(mod.id, mod.source)
              .catch(() => [])
            if (isMounted) {
              setVersions(fallbackList)
              setIsLoadingVersions(false)
              return
            }
          }
          setVersions(verList)
          setIsLoadingVersions(false)
        })
        .catch((err) => {
          if (isMounted) {
            console.warn('Failed to fetch versions for detail modal:', err)
            setIsLoadingVersions(false)
          }
        })
    } else {
      setIsLoadingVersions(false)
    }

    return () => {
      isMounted = false
    }
  }, [isOpen, mod, currentInstance])

  if (!isOpen || !mod) return null

  const handleOpenExternal = (url?: string) => {
    if (!url) return
    if (window.launcherAPI?.system?.openExternalUrl) {
      window.launcherAPI.system.openExternalUrl(url)
    } else {
      window.open(url, '_blank')
    }
  }

  const handleInstallClick = async (targetVersion?: ModVersionFile) => {
    if (!onInstallVersion || !mod) return
    const versionToInstall = targetVersion || versions[0]
    if (!versionToInstall) return

    setInstallingVersionId(versionToInstall.id)
    try {
      await onInstallVersion(mod, versionToInstall)
    } finally {
      setInstallingVersionId(null)
    }
  }

  const parsedMarkdown = detail?.description
    ? (marked.parse(detail.description) as string)
    : ''

  const displayDownloads = detail?.downloads ?? mod.downloads
  const displayFollowers = detail?.followers ?? 0
  const displayIcon = detail?.iconUrl || mod.iconUrl
  const displayCategories = detail?.categories?.length ? detail.categories : mod.categories
  const displayLoaders = detail?.loaders?.length ? detail.loaders : mod.loaders

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-6xl h-[90vh] bg-background-card border border-border-subtle rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 md:p-6 border-b border-border-subtle bg-background-dark/40 shrink-0">
          <div className="flex items-start gap-4 min-w-0 flex-1 pr-4">
            {displayIcon ? (
              <img
                src={displayIcon}
                alt={mod.name}
                className="w-16 h-16 rounded-2xl bg-background-darkest object-cover border border-border-subtle shrink-0 shadow-md"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 shadow-md">
                <Sparkles size={28} />
              </div>
            )}

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight truncate">
                  {detail?.name || mod.name}
                </h2>
                <span
                  className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border shrink-0 font-bold ${
                    mod.source === 'modrinth'
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {mod.source}
                </span>
                {isInstalled && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <Check size={10} /> Installed ({installedVersion || 'Active'})
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                {detail?.summary || mod.description}
              </p>

              <div className="flex items-center gap-3 pt-1 text-xs text-slate-400 flex-wrap">
                <span className="font-mono text-slate-300 font-semibold">
                  {formatNumber(displayDownloads)} downloads
                </span>
                {displayFollowers > 0 && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="font-mono text-slate-300">
                      {formatNumber(displayFollowers)} followers
                    </span>
                  </>
                )}
                {displayCategories.slice(0, 3).map((cat) => (
                  <span
                    key={cat}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-slate-400 border border-border-subtle capitalize"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {versions.length > 0 && (
              <Button
                variant={isInstalled ? 'secondary' : 'primary'}
                size="md"
                icon={isInstalled ? Check : Download}
                isLoading={Boolean(installingVersionId)}
                onClick={() => handleInstallClick()}
              >
                {isInstalled ? 'Reinstall' : 'Install'}
              </Button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close modal"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 border-b border-border-subtle bg-background-surface/30 shrink-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('description')}
              className={`px-4 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                activeTab === 'description'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText size={14} />
              Description
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('versions')}
              className={`px-4 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                activeTab === 'versions'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers size={14} />
              Versions
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10">
                {versions.length}
              </span>
            </button>

            {Boolean(detail?.gallery?.length) && (
              <button
                type="button"
                onClick={() => setActiveTab('gallery')}
                className={`px-4 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                  activeTab === 'gallery'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <ImageIcon size={14} />
                Gallery
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10">
                  {detail?.gallery.length}
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 py-2">
            {detail?.links?.discord && (
              <button
                type="button"
                onClick={() => handleOpenExternal(detail.links.discord)}
                className="px-2.5 py-1 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Join Discord server"
              >
                <MessageSquare size={13} className="text-indigo-400" />
                Discord
              </button>
            )}
            {detail?.links?.source && (
              <button
                type="button"
                onClick={() => handleOpenExternal(detail.links.source)}
                className="px-2.5 py-1 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                title="View Source Code"
              >
                <Code size={13} className="text-slate-400" />
                Source
              </button>
            )}
            {detail?.links?.donate && (
              <button
                type="button"
                onClick={() => handleOpenExternal(detail.links.donate)}
                className="px-2.5 py-1 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-rose-300 hover:text-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Donate to Creator"
              >
                <Heart size={13} className="text-rose-400" />
                Donate
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-8 h-full overflow-y-auto p-6 custom-scrollbar">
            {isLoadingDetail ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
                <Loader2 size={36} className="text-primary animate-spin" />
                <span className="text-xs">Loading mod details...</span>
              </div>
            ) : detailError ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-rose-400">
                <AlertCircle size={32} />
                <span className="text-sm font-semibold">{detailError}</span>
              </div>
            ) : activeTab === 'description' ? (
              <div className="space-y-6">
                {parsedMarkdown ? (
                  <div
                    className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed
                      [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:border-b [&_h1]:border-border-subtle [&_h1]:pb-2
                      [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-5 [&_h2]:mb-2.5 [&_h2]:border-b [&_h2]:border-border-subtle [&_h2]:pb-1.5
                      [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-slate-100 [&_h3]:mt-4 [&_h3]:mb-2
                      [&_p]:mb-3 [&_p]:leading-relaxed
                      [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3
                      [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3
                      [&_li]:mb-1
                      [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
                      [&_img]:rounded-2xl [&_img]:max-w-full [&_img]:my-4 [&_img]:border [&_img]:border-border-subtle [&_img]:shadow-lg
                      [&_code]:bg-background-darkest [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:font-mono [&_code]:text-xs [&_code]:text-emerald-300
                      [&_pre]:bg-background-darkest [&_pre]:p-4 [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-border-subtle [&_pre]:overflow-x-auto
                      [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-400
                      [&_table]:w-full [&_table]:border-collapse [&_table]:my-4
                      [&_th]:border [&_th]:border-border-subtle [&_th]:p-2.5 [&_th]:bg-background-darkest [&_th]:text-left [&_th]:text-xs [&_th]:font-bold
                      [&_td]:border [&_td]:border-border-subtle [&_td]:p-2.5 [&_td]:text-xs"
                    dangerouslySetInnerHTML={{ __html: parsedMarkdown }}
                  />
                ) : (
                  <div className="py-12 text-center text-xs text-slate-500">
                    No detailed description provided for this mod.
                  </div>
                )}
              </div>
            ) : activeTab === 'versions' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Available Releases ({versions.length})
                  </span>
                  {currentInstance && (
                    <span className="text-xs text-slate-400 font-mono">
                      Filtered for: {currentInstance.minecraftVersion} ({currentInstance.loaderType})
                    </span>
                  )}
                </div>

                {isLoadingVersions ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                    <Loader2 size={32} className="text-primary animate-spin" />
                    <span className="text-xs">Fetching version files...</span>
                  </div>
                ) : versions.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    No compatible version files found for this Minecraft version and loader.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {versions.map((ver) => {
                      const isVerInstalling = installingVersionId === ver.id
                      return (
                        <div
                          key={ver.id}
                          className="p-3.5 rounded-2xl bg-background-surface/60 border border-border-subtle hover:border-border-strong transition-all flex items-center justify-between gap-4"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-white truncate">
                                {ver.name || ver.versionNumber}
                              </span>
                              <span
                                className={`text-[9px] uppercase font-mono px-1.5 py-0.2 rounded font-semibold ${
                                  ver.releaseType === 'release'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : ver.releaseType === 'beta'
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                }`}
                              >
                                {ver.releaseType}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {formatDateAgo(ver.datePublished)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                              <span className="font-mono text-slate-300">
                                {ver.gameVersions.join(', ')}
                              </span>
                              {ver.loaders.length > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="uppercase font-mono text-primary">
                                    {ver.loaders.join(', ')}
                                  </span>
                                </>
                              )}
                              <span>•</span>
                              <span className="font-mono">
                                {(ver.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                              </span>
                            </div>
                          </div>

                          <Button
                            variant="secondary"
                            size="sm"
                            icon={isVerInstalling ? Loader2 : Download}
                            isLoading={isVerInstalling}
                            onClick={() => handleInstallClick(ver)}
                          >
                            Install
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                  {detail?.gallery.map((img, i) => (
                    <div
                      key={img.url || i}
                      onClick={() => setSelectedLightboxImage(img.url)}
                      className="group relative rounded-2xl overflow-hidden border border-border-subtle hover:border-primary cursor-pointer transition-all aspect-video bg-background-darkest"
                    >
                      <img
                        src={img.url}
                        alt={img.title || 'Mod screenshot'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                      {img.title && (
                        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-[10px] text-white truncate">
                          {img.title}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-border-subtle h-full overflow-y-auto p-6 space-y-6 bg-background-dark/30 custom-scrollbar">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck size={14} className="text-primary" />
                Compatibility
              </h4>
              <div className="p-3.5 rounded-2xl bg-background-surface/50 border border-border-subtle space-y-3">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1.5">
                    Minecraft Versions
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                    {(detail?.gameVersions?.length ? detail.gameVersions : [currentInstance?.minecraftVersion || '1.20.1']).map((v) => (
                      <span
                        key={v}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-background-darkest text-slate-300 border border-border-subtle"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1.5">
                    Platforms & Loaders
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {mod.projectType === 'resourcepack' ? (
                      <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                        Vanilla & All Mod Loaders
                      </span>
                    ) : displayLoaders.length > 0 ? (
                      displayLoaders.map((l) => (
                        <span
                          key={l}
                          className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 font-bold"
                        >
                          {l}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">Universal</span>
                    )}
                  </div>
                </div>

                {(detail?.clientSide || detail?.serverSide) && (
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1.5">
                      Environment
                    </span>
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      {detail.clientSide && (
                        <span className="px-2 py-0.5 rounded bg-white/5 border border-border-subtle capitalize text-[10px]">
                          Client: {detail.clientSide}
                        </span>
                      )}
                      {detail.serverSide && (
                        <span className="px-2 py-0.5 rounded bg-white/5 border border-border-subtle capitalize text-[10px]">
                          Server: {detail.serverSide}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Globe size={14} className="text-primary" />
                External Links
              </h4>
              <div className="space-y-1.5">
                {detail?.links?.issues && (
                  <button
                    type="button"
                    onClick={() => handleOpenExternal(detail.links.issues)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-background-surface/50 hover:bg-background-surface border border-border-subtle text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <span>Report issues</span>
                    <ExternalLink size={12} className="text-slate-500" />
                  </button>
                )}
                {detail?.links?.source && (
                  <button
                    type="button"
                    onClick={() => handleOpenExternal(detail.links.source)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-background-surface/50 hover:bg-background-surface border border-border-subtle text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <span>View source</span>
                    <ExternalLink size={12} className="text-slate-500" />
                  </button>
                )}
                {detail?.links?.wiki && (
                  <button
                    type="button"
                    onClick={() => handleOpenExternal(detail.links.wiki)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-background-surface/50 hover:bg-background-surface border border-border-subtle text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <span>Visit wiki</span>
                    <ExternalLink size={12} className="text-slate-500" />
                  </button>
                )}
                {detail?.links?.discord && (
                  <button
                    type="button"
                    onClick={() => handleOpenExternal(detail.links.discord)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-background-surface/50 hover:bg-background-surface border border-border-subtle text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <span>Join Discord server</span>
                    <ExternalLink size={12} className="text-slate-500" />
                  </button>
                )}
                {detail?.links?.donate && (
                  <button
                    type="button"
                    onClick={() => handleOpenExternal(detail.links.donate)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-background-surface/50 hover:bg-background-surface border border-border-subtle text-xs text-rose-300 hover:text-rose-200 transition-colors cursor-pointer"
                  >
                    <span>Donate to project</span>
                    <ExternalLink size={12} className="text-rose-400" />
                  </button>
                )}
              </div>
            </div>

            {Boolean(detail?.creators?.length) && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Users size={14} className="text-primary" />
                  Creators
                </h4>
                <div className="space-y-2">
                  {detail?.creators.map((c, i) => (
                    <div
                      key={c.name || i}
                      className="p-2.5 rounded-xl bg-background-surface/50 border border-border-subtle flex items-center gap-3"
                    >
                      {c.avatarUrl ? (
                        <img
                          src={c.avatarUrl}
                          alt={c.name}
                          className="w-8 h-8 rounded-lg object-cover bg-black/40 border border-white/10"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white truncate">{c.name}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{c.role || 'Creator'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Info size={14} className="text-primary" />
                Details
              </h4>
              <div className="p-3.5 rounded-2xl bg-background-surface/50 border border-border-subtle text-xs space-y-2.5 text-slate-300">
                {detail?.license && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">License</span>
                    <span className="font-mono text-white text-[11px]">
                      {detail.license.name || detail.license.id}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Published</span>
                  <span className="text-white text-[11px]">{formatDateAgo(detail?.publishedAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Updated</span>
                  <span className="text-white text-[11px]">{formatDateAgo(detail?.updatedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedLightboxImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedLightboxImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center">
            <img
              src={selectedLightboxImage}
              alt="Screenshot Preview"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain border border-white/10 shadow-2xl"
            />
            <button
              onClick={() => setSelectedLightboxImage(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
