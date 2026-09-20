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

      // 1. First attempt: lookup directly with mod.id
      let resultVersions = await window.launcherAPI.mods.getVersions(
        mod.id,
        mod.source,
        instance.minecraftVersion,
        loader
      )

      if (resultVersions && resultVersions.length > 0) {
        setVersions(resultVersions)
        setResolvedProjectId(mod.id)
        return
      }

      // 2. Second attempt: search mod by clean name to resolve project ID
      const cleanQuery = mod.name
        .replace(/[-_.]/g, ' ')
        .replace(/\b(fabric|forge|neoforge|quilt|mc|v\d+)\b/gi, '')
        .trim()

      const searchHits = await window.launcherAPI.mods.search({
        query: cleanQuery || mod.name,
        source: mod.source,
        minecraftVersion: instance.minecraftVersion,
        loader,
        limit: 6
      })

      if (searchHits && searchHits.length > 0) {
        // Try the top search hit
        const topHit = searchHits[0]
        const fallbackVersions = await window.launcherAPI.mods.getVersions(
          topHit.id,
          topHit.source,
          instance.minecraftVersion,
          loader
        )

        if (fallbackVersions && fallbackVersions.length > 0) {
          setVersions(fallbackVersions)
          setResolvedProjectId(topHit.id)
          return
        }
      }

      setErrorMessage(
        `No compatible versions found for ${instance.loaderType} ${instance.minecraftVersion}.`
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
