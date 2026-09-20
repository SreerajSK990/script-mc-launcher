import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowUpDown,
  Check,
  Download,
  AlertCircle,
  Loader2,
  RefreshCw,
  Package,
  Layers
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

  // 1. Spaced CamelCase / PascalCase, e.g. "ForgeConfigAPIPort" -> "Forge Config API Port"
  const spacedCamel = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')

  // 2. Strip trailing versions, build numbers, mc versions, and loader tags
  // e.g. "c2me-fabric-mc26.3-0.3.6" -> "c2me-fabric"
  // e.g. "cloth-config-26.3.1" -> "cloth-config"
  // e.g. "fabric-api-0.160.7+26.3" -> "fabric-api"
  // e.g. "connectedglass-1.1.13-fabric-mc1.20.1" -> "connectedglass"
  const strippedVersions = raw
    .replace(/[-_+](mc)?v?\d+(\.\d+).*$/i, '')
    .replace(/\+.*$/, '')

  const strippedLoader = strippedVersions
    .replace(/[-_+](fabric|forge|neoforge|quilt)$/i, '')

  const spacedCamelStripped = spacedCamel
    .replace(/[-_+](mc)?v?\d+(\.\d+).*$/i, '')
    .replace(/\+.*$/, '')

  // Insert space in common compound words like "connectedglass" -> "connected glass"
  const compoundSpaced = strippedLoader.replace(/(connected)(glass)/i, '$1 $2')

  // Add prioritized queries:
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

  const fetchVersions = useCallback(async () => {
    if (!mod || !window.launcherAPI?.mods) return
    setIsLoading(true)
    setErrorMessage(null)
    setVersions([])
    setResolvedProjectId(null)

    try {
      const loader = instance.loaderType !== 'vanilla' ? instance.loaderType : undefined

      // 1. First attempt: if mod.id is a real project ID (not our synthetic manual- ID), try direct lookup
      if (mod.id && !mod.id.startsWith('manual-') && !mod.id.includes(' ')) {
        try {
          let resultVersions = await window.launcherAPI.mods.getVersions(
            mod.id,
            mod.source,
            instance.minecraftVersion,
            loader
          )
          // If strict MC version returned 0, try without MC version filter (fallback to loader only)
          if ((!resultVersions || resultVersions.length === 0) && instance.minecraftVersion) {
            resultVersions = await window.launcherAPI.mods.getVersions(
              mod.id,
              mod.source,
              undefined,
              loader
            )
          }

          if (resultVersions && resultVersions.length > 0) {
            setVersions(resultVersions)
            setResolvedProjectId(mod.id)
            return
          }
        } catch {
          // Continue to fallback search
        }
      }

      // 2. Second attempt: search mod by candidate queries to resolve project ID
      const candidateQueries = extractCandidateQueries(mod.name, mod.filename)

      for (const query of candidateQueries.slice(0, 4)) {
        try {
          const searchHits = await window.launcherAPI.mods.search({
            query,
            source: mod.source,
            minecraftVersion: instance.minecraftVersion,
            loader,
            limit: 5
          })

          if (searchHits && searchHits.length > 0) {
            // Try top hits
            for (const hit of searchHits.slice(0, 3)) {
              let hitVersions = await window.launcherAPI.mods.getVersions(
                hit.id,
                hit.source,
                instance.minecraftVersion,
                loader
              )

              if ((!hitVersions || hitVersions.length === 0) && instance.minecraftVersion) {
                hitVersions = await window.launcherAPI.mods.getVersions(
                  hit.id,
                  hit.source,
                  undefined,
                  loader
                )
              }

              if (hitVersions && hitVersions.length > 0) {
                setVersions(hitVersions)
                setResolvedProjectId(hit.id)
                return
              }
            }
          }
        } catch {
          // Try next candidate
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
  }, [instance.loaderType, instance.minecraftVersion, mod])

  useEffect(() => {
    if (isOpen && mod) {
      fetchVersions()
    }
  }, [isOpen, mod, fetchVersions])

  if (!isOpen || !mod) return null

  const handleSwitchVersion = async (version: ModVersionFile) => {
    if (!window.launcherAPI?.mods) return

    try {
      setSwitchingVersionId(version.id)
      setErrorMessage(null)

      await window.launcherAPI.mods.install({
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

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${bytes} B`
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
      maxWidthClass="max-w-xl"
    >
      <div className="flex flex-col gap-4">
        {/* Current Mod Status Banner */}
        <div className="bg-background-darkest border border-border-subtle p-3.5 rounded-xl flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] text-slate-400 block font-mono">Current Installation</span>
            <p className="text-xs font-semibold text-white truncate mt-0.5">{mod.filename}</p>
            <p className="text-[11px] text-slate-400 font-mono">
              Version: <span className="text-slate-200">{mod.version || 'Custom'}</span> • Source:{' '}
              <span className="capitalize text-slate-200">{mod.source}</span>
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            onClick={fetchVersions}
            disabled={isLoading || Boolean(switchingVersionId)}
            title="Refresh versions"
          />
        </div>

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
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
            {versions.map((ver) => {
              const isCurrent =
                ver.filename.toLowerCase() === mod.filename.toLowerCase() ||
                ver.versionNumber === mod.version

              return (
                <div
                  key={ver.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                    isCurrent
                      ? 'bg-emerald-500/5 border-emerald-500/30'
                      : 'bg-background-darkest hover:bg-slate-800/50 border-border-subtle'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white truncate">
                        {ver.name || ver.versionNumber}
                      </span>
                      <span
                        className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                          ver.releaseType === 'release'
                            ? 'bg-primary/15 text-primary border-primary/30'
                            : ver.releaseType === 'beta'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {ver.releaseType}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-1">
                      <span className="truncate">{ver.filename}</span>
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

                  <div className="shrink-0">
                    {isCurrent ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-semibold">
                        <Check size={13} />
                        <span>Current</span>
                      </div>
                    ) : (
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
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
