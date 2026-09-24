import { installModWithPreview } from '@renderer/components/mods/DependencyInstallHost'
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ArrowUpDown,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw,
  Layers,
  ExternalLink,
  FolderOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  Globe
} from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { InstalledModRecord, ModVersionFile } from '@shared/types/mods'
import { Modal } from '@renderer/components/common/Modal'
import { Button } from '@renderer/components/common/Button'

interface ChangeModVersionModalProps {
  isOpen: boolean
  onClose: () => void
  instance: InstanceConfiguration
  mod: InstalledModRecord | null
  onSuccess: (message: string) => void
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

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function extractCandidateQueries(name: string, filename: string): string[] {
  const queries: string[] = []
  const seen = new Set<string>()

  const add = (q: string | undefined | null) => {
    if (!q) return
    const trimmed = q.trim()
    if (trimmed.length >= 2 && !seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase())
      queries.push(trimmed)
    }
  }

  const raw = (name || filename || '')
    .replace(/^manual-/, '')
    .replace(/\.jar(\.disabled)?$/i, '')
    .trim()

  const spacedCamel = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')

  const strippedVersions = raw
    .replace(/[-_+](mc)?v?\d+(\.\d+).*$/i, '')
    .replace(/\+.*$/, '')

  const strippedLoader = strippedVersions
    .replace(/[-_+](fabric|forge|neoforge|quilt)$/i, '')

  const spacedCamelStripped = spacedCamel
    .replace(/[-_+](mc)?v?\d+(\.\d+).*$/i, '')
    .replace(/\+.*$/, '')

  const compoundSpaced = strippedLoader.replace(/(connected)(glass)/i, '$1 $2')

  add(compoundSpaced.replace(/[-_.]/g, ' '))
  add(strippedLoader.replace(/[-_.]/g, ' '))
  add(strippedVersions.replace(/[-_.]/g, ' '))
  add(spacedCamelStripped.replace(/[-_.]/g, ' '))
  add(strippedLoader)
  add(strippedVersions)
  add(raw.replace(/[-_.]/g, ' '))

  return queries
}

export const ChangeModVersionModal: React.FC<ChangeModVersionModalProps> = ({
  isOpen,
  onClose,
  instance,
  mod,
  onSuccess
}) => {
  const [versions, setVersions] = useState<ModVersionFile[]>([])
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [switchingVersionId, setSwitchingVersionId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showAllMcVersions, setShowAllMcVersions] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState<'all' | 'release' | 'beta' | 'alpha'>('all')
  const [expandedChangelogId, setExpandedChangelogId] = useState<string | null>(null)

  const fetchVersions = useCallback(async () => {
    if (!mod || !window.launcherAPI?.mods) return
    setIsLoading(true)
    setErrorMessage(null)
    setVersions([])
    setResolvedProjectId(null)

    try {
      const loader = instance.loaderType !== 'vanilla' ? instance.loaderType : undefined

      if (mod.id && !mod.id.startsWith('manual-') && !mod.id.includes(' ')) {
        try {
          let resultVersions = await window.launcherAPI.mods.getVersions(
            mod.id,
            mod.source,
            showAllMcVersions ? undefined : instance.minecraftVersion,
            loader
          )

          if ((!resultVersions || resultVersions.length === 0) && instance.minecraftVersion && !showAllMcVersions) {
            resultVersions = await window.launcherAPI.mods.getVersions(
              mod.id,
              mod.source,
              undefined,
              loader
            )
            if (resultVersions && resultVersions.length > 0) {
              setShowAllMcVersions(true)
            }
          }

          if (resultVersions && resultVersions.length > 0) {
            setVersions(resultVersions)
            setResolvedProjectId(mod.id)
            return
          }
        } catch {
        }
      }

      const candidateQueries = extractCandidateQueries(mod.name, mod.filename)

      for (const query of candidateQueries.slice(0, 4)) {
        try {
          const searchHits = await window.launcherAPI.mods.search({
            query,
            source: mod.source,
            minecraftVersion: showAllMcVersions ? undefined : instance.minecraftVersion,
            loader,
            limit: 5
          })

          if (searchHits && searchHits.length > 0) {
            for (const hit of searchHits.slice(0, 3)) {
              let hitVersions = await window.launcherAPI.mods.getVersions(
                hit.id,
                hit.source,
                showAllMcVersions ? undefined : instance.minecraftVersion,
                loader
              )

              if ((!hitVersions || hitVersions.length === 0) && instance.minecraftVersion && !showAllMcVersions) {
                hitVersions = await window.launcherAPI.mods.getVersions(
                  hit.id,
                  hit.source,
                  undefined,
                  loader
                )
                if (hitVersions && hitVersions.length > 0) {
                  setShowAllMcVersions(true)
                }
              }

              if (hitVersions && hitVersions.length > 0) {
                setVersions(hitVersions)
                setResolvedProjectId(hit.id)
                return
              }
            }
          }
        } catch {
        }
      }

      setErrorMessage(
        `Could not find compatible versions for "${mod.name}" on ${mod.source}.`
      )
    } catch (err: any) {
      console.error('Failed to fetch mod versions for version change:', err)
      setErrorMessage(err.message || 'Failed to fetch available versions.')
    } finally {
      setIsLoading(false)
    }
  }, [instance.loaderType, instance.minecraftVersion, mod, showAllMcVersions])

  useEffect(() => {
    if (isOpen && mod) {
      fetchVersions()
    }
  }, [isOpen, mod, fetchVersions])

  const channelCounts = useMemo(() => {
    let release = 0
    let beta = 0
    let alpha = 0
    for (const v of versions) {
      if (v.releaseType === 'release') release++
      else if (v.releaseType === 'beta') beta++
      else if (v.releaseType === 'alpha') alpha++
    }
    return { all: versions.length, release, beta, alpha }
  }, [versions])

  const displayedVersions = useMemo(() => {
    return versions.filter((ver) => {
      if (selectedChannel !== 'all' && ver.releaseType !== selectedChannel) {
        return false
      }
      return true
    })
  }, [versions, selectedChannel])

  if (!isOpen || !mod) return null

  const handleOpenExternal = (url?: string) => {
    if (!url) return
    if (window.launcherAPI?.system?.openExternalUrl) {
      window.launcherAPI.system.openExternalUrl(url)
    } else if (window.launcherAPI?.system?.openExternal) {
      window.launcherAPI.system.openExternal(url)
    }
  }

  const handleOpenFolder = () => {
    if (window.launcherAPI?.instances?.openFolder) {
      window.launcherAPI.instances.openFolder(instance.id)
    }
  }

  const handleSwitchVersion = async (version: ModVersionFile) => {
    if (!window.launcherAPI?.mods) return

    try {
      setSwitchingVersionId(version.id)
      setErrorMessage(null)

      await installModWithPreview({
        instanceId: instance.id,
        versionFile: version,
        modMetadata: {
          id: resolvedProjectId || mod.id,
          name: mod.name,
          source: mod.source,
          iconUrl: mod.iconUrl
        },
        oldFilename: mod.filename
      })

      onSuccess(`Successfully changed ${mod.name} to version ${version.versionNumber || version.name}!`)
      onClose()
    } catch (err: any) {
      console.error('Failed to change mod version:', err)
      setErrorMessage(err.message || 'Failed to switch mod version.')
    } finally {
      setSwitchingVersionId(null)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!switchingVersionId) {
          onClose()
        }
      }}
      title={`Change Version: ${mod.name}`}
      description={`Select a compatible version for Minecraft ${instance.minecraftVersion} (${instance.loaderType})`}
      maxWidthClass="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        <div className="bg-background-darkest border border-border-subtle p-3.5 rounded-xl flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] text-slate-400 block font-mono">Current Installation</span>
            <p className="text-xs font-semibold text-white truncate mt-0.5">{mod.filename}</p>
            <p className="text-[11px] text-slate-400 font-mono">
              Version: <span className="text-slate-200">{mod.version || 'Custom'}</span> • Source:{' '}
              <span className="capitalize text-slate-200">{mod.source}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              icon={FolderOpen}
              onClick={handleOpenFolder}
              title="Open mods folder"
            >
              Mods Folder
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              onClick={fetchVersions}
              disabled={isLoading || Boolean(switchingVersionId)}
              title="Refresh versions"
            />
          </div>
        </div>

        {versions.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2.5">
            <div className="flex items-center gap-1 bg-background-darkest p-1 rounded-xl border border-border-subtle">
              {(['all', 'release', 'beta', 'alpha'] as const).map((channel) => {
                const count = channelCounts[channel]
                const isActive = selectedChannel === channel
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => setSelectedChannel(channel)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-all flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'bg-primary text-black font-bold shadow'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>{channel}</span>
                    <span
                      className={`text-[10px] font-mono px-1 rounded ${
                        isActive ? 'bg-black/20 text-black font-bold' : 'bg-white/10 text-slate-300'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAllMcVersions}
                onChange={(e) => setShowAllMcVersions(e.target.checked)}
                className="rounded bg-background-darkest border-border-subtle text-primary focus:ring-0 cursor-pointer"
              />
              <span>Show all MC versions</span>
            </label>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isLoading ? (
          <div className="py-14 flex flex-col items-center justify-center gap-2.5 text-slate-400">
            <Loader2 size={24} className="animate-spin text-primary" />
            <span className="text-xs">Fetching compatible versions from {mod.source}...</span>
          </div>
        ) : versions.length === 0 ? (
          <div className="py-10 text-center text-slate-500 flex flex-col items-center gap-2">
            <Layers size={28} className="text-slate-600" />
            <p className="text-xs text-slate-300">No alternate versions found for this instance.</p>
            <div className="flex items-center gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                icon={FolderOpen}
                onClick={handleOpenFolder}
              >
                Open Mods Folder
              </Button>
              {!showAllMcVersions && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAllMcVersions(true)}
                >
                  Show all MC versions
                </Button>
              )}
            </div>
          </div>
        ) : displayedVersions.length === 0 ? (
          <div className="py-10 text-center text-slate-500 flex flex-col items-center gap-2">
            <Layers size={28} className="text-slate-600" />
            <p className="text-xs text-slate-300">No {selectedChannel} versions available.</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedChannel('all')}
            >
              View all channels
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 max-h-96 overflow-y-auto pr-1">
            {displayedVersions.map((ver) => {
              const isCurrent =
                ver.filename.toLowerCase() === mod.filename.toLowerCase() ||
                ver.versionNumber === mod.version

              const fileWebUrl =
                ver.websiteUrl ||
                (mod.source === 'curseforge'
                  ? `https://www.curseforge.com/projects/${ver.projectId}/files/${ver.id}`
                  : `https://modrinth.com/mod/${ver.projectId}/version/${ver.id}`)

              return (
                <div
                  key={ver.id}
                  className={`p-3.5 rounded-xl border flex flex-col gap-2.5 transition-colors ${
                    isCurrent
                      ? 'bg-emerald-500/5 border-emerald-500/30'
                      : 'bg-background-darkest hover:bg-slate-800/40 border-border-subtle'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-white break-words">
                          {ver.name || ver.versionNumber}
                        </span>
                        <span
                          className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border font-semibold ${
                            ver.releaseType === 'release'
                              ? 'bg-primary/15 text-primary border-primary/30'
                              : ver.releaseType === 'beta'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {ver.releaseType}
                        </span>
                        {!ver.downloadUrl && (
                          <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1">
                            <Globe size={10} />
                            External Only
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400 font-mono mt-1.5">
                        <span className="truncate max-w-[200px] text-slate-300">{ver.filename}</span>
                        <span>•</span>
                        <span>{formatFileSize(ver.sizeBytes)}</span>
                        {ver.datePublished && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar size={11} className="text-slate-500" />
                              {formatDateAgo(ver.datePublished)}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {ver.loaders && ver.loaders.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {ver.loaders.map((l) => (
                              <span
                                key={l}
                                className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 font-bold"
                              >
                                {l}
                              </span>
                            ))}
                          </div>
                        )}
                        {ver.gameVersions && ver.gameVersions.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-slate-300 border border-border-subtle">
                              MC {ver.gameVersions.slice(0, 3).join(', ')}
                              {ver.gameVersions.length > 3 ? ` +${ver.gameVersions.length - 3}` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      {isCurrent ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-semibold">
                          <Check size={13} />
                          <span>Current</span>
                        </div>
                      ) : ver.downloadUrl ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={switchingVersionId === ver.id ? Loader2 : ArrowUpDown}
                          isLoading={switchingVersionId === ver.id}
                          disabled={Boolean(switchingVersionId)}
                          onClick={() => handleSwitchVersion(ver)}
                        >
                          Switch
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            icon={ExternalLink}
                            onClick={() => handleOpenExternal(fileWebUrl)}
                            title="Download from website in browser"
                          >
                            Download on Web
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {ver.changelog && (
                    <div className="border-t border-border-subtle/60 pt-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setExpandedChangelogId(expandedChangelogId === ver.id ? null : ver.id)}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {expandedChangelogId === ver.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        <span>{expandedChangelogId === ver.id ? 'Hide Changelog' : 'View Changelog'}</span>
                      </button>
                      {expandedChangelogId === ver.id && (
                        <div className="mt-2 p-2.5 rounded-lg bg-black/40 border border-border-subtle text-[11px] text-slate-300 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {ver.changelog}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
