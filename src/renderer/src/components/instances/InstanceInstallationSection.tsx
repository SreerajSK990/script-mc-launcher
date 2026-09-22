import React, { useState, useEffect } from 'react'
import {
  Check,
  Save,
  X,
  Wrench,
  Loader2,
  AlertTriangle,
  Shield,
  Archive,
  Copy
} from 'lucide-react'
import type { InstanceConfiguration, ModLoaderType } from '@shared/types/instance'
import type { MinecraftVersionEntry } from '@shared/types/manifest'
import { Button } from '@renderer/components/common/Button'

interface InstanceInstallationSectionProps {
  instance: InstanceConfiguration
  onInstanceUpdated: (updated: InstanceConfiguration) => void
  onNotification: (message: string) => void
}

type BackupStrategy = 'both' | 'instance' | 'saves' | 'none'

const PLATFORMS: Array<{ id: ModLoaderType; label: string }> = [
  { id: 'vanilla', label: 'Vanilla' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' },
  { id: 'quilt', label: 'Quilt' }
]

function isSnapshotLikeVersion(version: string): boolean {
  return (
    /[-_](rc|pre|snapshot|beta|alpha)/i.test(version) ||
    /^\d\dw\d\d[a-z]$/i.test(version)
  )
}

export const InstanceInstallationSection: React.FC<InstanceInstallationSectionProps> = ({
  instance,
  onInstanceUpdated,
  onNotification
}) => {
  const [platform, setPlatform] = useState<ModLoaderType>(instance.loaderType)
  const [gameVersion, setGameVersion] = useState<string>(instance.minecraftVersion)
  const [loaderVersion, setLoaderVersion] = useState<string | null>(instance.loaderVersion)

  const [allVersions, setAllVersions] = useState<MinecraftVersionEntry[]>([])
  const [showSnapshots, setShowSnapshots] = useState<boolean>(() => isSnapshotLikeVersion(instance.minecraftVersion))
  const [availableLoaderVersions, setAvailableLoaderVersions] = useState<string[]>([])
  const [isLoadingLoaderVersions, setIsLoadingLoaderVersions] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [isRepairing, setIsRepairing] = useState(false)

  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [backupStrategy, setBackupStrategy] = useState<BackupStrategy>('both')

  useEffect(() => {
    let isMounted = true
    const loadVersions = async () => {
      if (window.launcherAPI?.meta) {
        try {
          const versions = await window.launcherAPI.meta.getVersions()
          if (isMounted && versions && versions.length > 0) {
            setAllVersions(versions)
            const currentEntry = versions.find((v) => v.id === instance.minecraftVersion)
            if (currentEntry && currentEntry.type !== 'release') {
              setShowSnapshots(true)
            }
          }
        } catch {
        }
      }
    }
    loadVersions()
    return () => {
      isMounted = false
    }
  }, [instance.minecraftVersion])

  useEffect(() => {
    if (platform === 'vanilla') {
      setAvailableLoaderVersions([])
      setLoaderVersion(null)
      return
    }

    let isMounted = true
    const loadLoaderVersions = async () => {
      try {
        setIsLoadingLoaderVersions(true)
        if (window.launcherAPI?.meta) {
          const versions = await window.launcherAPI.meta.getLoaderVersions(platform, gameVersion)
          if (isMounted) {
            setAvailableLoaderVersions(versions)
            if (versions.length > 0) {
              if (
                platform === instance.loaderType &&
                gameVersion === instance.minecraftVersion &&
                instance.loaderVersion &&
                versions.includes(instance.loaderVersion)
              ) {
                setLoaderVersion(instance.loaderVersion)
              } else {
                setLoaderVersion(versions[0])
              }
            } else {
              setLoaderVersion(null)
            }
          }
        }
      } catch {
        if (isMounted) {
          setAvailableLoaderVersions([])
          setLoaderVersion(null)
        }
      } finally {
        if (isMounted) {
          setIsLoadingLoaderVersions(false)
        }
      }
    }

    loadLoaderVersions()
    return () => {
      isMounted = false
    }
  }, [platform, gameVersion, instance.loaderType, instance.minecraftVersion, instance.loaderVersion])

  const filteredVersions = allVersions.filter((v) => {
    if (v.id === instance.minecraftVersion) return true
    if (v.type === 'release') return true
    if (showSnapshots && (v.type === 'snapshot' || v.type === 'old_beta' || v.type === 'old_alpha')) return true
    return false
  })

  const isDirty =
    platform !== instance.loaderType ||
    gameVersion !== instance.minecraftVersion ||
    (platform !== 'vanilla' && loaderVersion !== instance.loaderVersion)

  const handleCancel = () => {
    setPlatform(instance.loaderType)
    setGameVersion(instance.minecraftVersion)
    setLoaderVersion(instance.loaderVersion)
  }

  const handleSaveClick = () => {
    if (!isDirty) return
    setShowConfirmModal(true)
  }

  const handleConfirmUpdate = async () => {
    setIsSaving(true)
    try {
      if (backupStrategy === 'saves' || backupStrategy === 'both') {
        if (window.launcherAPI?.instances?.backupSaves) {
          await window.launcherAPI.instances.backupSaves(instance.id)
        }
      }

      if (backupStrategy === 'instance' || backupStrategy === 'both') {
        if (window.launcherAPI?.instances?.clone) {
          await window.launcherAPI.instances.clone(
            instance.id,
            `${instance.name} (Backup ${instance.minecraftVersion})`
          )
        }
      }

      if (window.launcherAPI?.instances) {
        const updated = await window.launcherAPI.instances.update({
          id: instance.id,
          minecraftVersion: gameVersion,
          loaderType: platform,
          loaderVersion: platform === 'vanilla' ? null : loaderVersion
        })

        onInstanceUpdated(updated)
        setShowConfirmModal(false)
        onNotification(`Installation updated to Minecraft ${gameVersion} (${platform}).`)
      }
    } catch (err) {
      console.error('Failed to update installation:', err)
      onNotification(err instanceof Error ? err.message : 'Failed to update installation.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRepair = async () => {
    if (!window.launcherAPI?.instances?.repair) return
    setIsRepairing(true)
    try {
      const res = await window.launcherAPI.instances.repair(instance.id)
      onNotification(res.message || 'Instance repaired successfully.')
    } catch (err) {
      console.error('Failed to repair instance:', err)
      onNotification(err instanceof Error ? err.message : 'Failed to repair instance.')
    } finally {
      setIsRepairing(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-background-card border border-border-subtle rounded-2xl p-6 space-y-6 shadow-md">
        <div>
          <h3 className="text-base font-semibold text-white tracking-tight">Edit installation</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Modify the modding platform, Minecraft game version, and mod loader build for this instance
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Platform
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {PLATFORMS.map((p) => {
              const isSelected = platform === p.id
              const isCurrent = instance.loaderType === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'bg-background-surface border border-border-subtle text-slate-300 hover:text-white hover:border-white/20'
                  }`}
                >
                  {isSelected && <Check size={14} className="text-emerald-400" />}
                  <span>{p.label}</span>
                  {isCurrent && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-300 font-normal">
                      Current
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Game version
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showSnapshots}
                onChange={(e) => setShowSnapshots(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-background-surface border-border-subtle text-primary focus:ring-0 cursor-pointer"
              />
              <span>Show Snapshots & Pre-releases</span>
            </label>
          </div>

          <div className="relative">
            <select
              value={gameVersion}
              onChange={(e) => setGameVersion(e.target.value)}
              className="w-full bg-background-surface border border-border-subtle focus:border-primary/60 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none transition-colors appearance-none cursor-pointer"
            >
              {filteredVersions.length === 0 ? (
                <option value={gameVersion}>
                  {gameVersion} {gameVersion === instance.minecraftVersion ? '★ (Current)' : ''}
                </option>
              ) : (
                filteredVersions.map((v) => {
                  const isCurrent = v.id === instance.minecraftVersion
                  const currentMarker = isCurrent ? '★ (Current)' : ''
                  const typeMarker = v.type !== 'release' ? `[${v.type}]` : ''
                  return (
                    <option key={v.id} value={v.id}>
                      {v.id} {currentMarker} {typeMarker}
                    </option>
                  )
                })
              )}
            </select>
          </div>

          {gameVersion === instance.minecraftVersion ? (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium pt-0.5">
              <Check size={12} />
              <span>Current version installed ({instance.minecraftVersion})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400 font-medium pt-0.5">
              <AlertTriangle size={12} />
              <span>Will change from {instance.minecraftVersion} to {gameVersion}</span>
            </div>
          )}
        </div>

        {platform !== 'vanilla' && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              {platform.charAt(0).toUpperCase() + platform.slice(1)} version
            </label>
            <div className="relative">
              {isLoadingLoaderVersions ? (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-background-surface border border-border-subtle text-xs text-slate-400">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  <span>Loading compatible {platform} versions...</span>
                </div>
              ) : availableLoaderVersions.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                  <AlertTriangle size={14} />
                  <span>No {platform} builds found for Minecraft {gameVersion}</span>
                </div>
              ) : (
                <select
                  value={loaderVersion || ''}
                  onChange={(e) => setLoaderVersion(e.target.value)}
                  className="w-full bg-background-surface border border-border-subtle focus:border-primary/60 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none transition-colors appearance-none cursor-pointer"
                >
                  {availableLoaderVersions.map((v, idx) => {
                    const isCurrent = platform === instance.loaderType && v === instance.loaderVersion
                    const currentMarker = isCurrent ? '★ (Current)' : ''
                    const recommendedMarker = idx === 0 ? '(Latest / Recommended)' : ''
                    return (
                      <option key={v} value={v}>
                        {v} {currentMarker} {recommendedMarker}
                      </option>
                    )
                  })}
                </select>
              )}
            </div>

            {loaderVersion && (
              platform === instance.loaderType && loaderVersion === instance.loaderVersion ? (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium pt-0.5">
                  <Check size={12} />
                  <span>Current loader installed ({instance.loaderVersion})</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-400 font-medium pt-0.5">
                  <AlertTriangle size={12} />
                  <span>
                    {instance.loaderVersion && platform === instance.loaderType
                      ? `Will change loader from ${instance.loaderVersion} to ${loaderVersion}`
                      : `Selected loader build: ${loaderVersion}`}
                  </span>
                </div>
              )
            )}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="primary"
            size="sm"
            icon={Save}
            disabled={!isDirty || isSaving || (platform !== 'vanilla' && !loaderVersion)}
            isLoading={isSaving}
            onClick={handleSaveClick}
          >
            Save
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={X}
            disabled={!isDirty || isSaving}
            onClick={handleCancel}
          >
            Cancel
          </Button>
        </div>
      </div>

      <div className="bg-background-card border border-border-subtle rounded-2xl p-6 space-y-4 shadow-md">
        <div>
          <h3 className="text-base font-semibold text-white tracking-tight">Repair instance</h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Reinstalls Minecraft dependencies, cleans temporary natives, and forces a full integrity check.
            This can resolve crashes or game launch errors caused by corrupted files.
          </p>
        </div>

        <div>
          <Button
            variant="secondary"
            size="sm"
            icon={Wrench}
            isLoading={isRepairing}
            onClick={handleRepair}
          >
            Repair
          </Button>
        </div>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-background-card border border-border-subtle rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Update Instance Installation</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Upgrading or switching versions can impact existing installed mods and world saves.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-background-surface border border-border-subtle text-xs space-y-1">
              <div className="text-slate-400 flex items-center justify-between">
                <span>Current Installation:</span>
                <span className="font-mono text-slate-200">
                  {instance.minecraftVersion} ({instance.loaderType})
                </span>
              </div>
              <div className="text-emerald-400 flex items-center justify-between font-semibold">
                <span>Target Installation:</span>
                <span className="font-mono">
                  {gameVersion} ({platform} {loaderVersion ? loaderVersion : ''})
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Select Safety Backup Strategy
              </label>

              <div className="grid grid-cols-1 gap-2">
                <div
                  onClick={() => setBackupStrategy('both')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    backupStrategy === 'both'
                      ? 'bg-primary/10 border-primary shadow-sm'
                      : 'bg-background-surface border-border-subtle hover:border-white/20'
                  }`}
                >
                  <Shield size={16} className={backupStrategy === 'both' ? 'text-primary mt-0.5' : 'text-slate-400 mt-0.5'} />
                  <div className="flex-1">
                    <div className="text-xs font-bold text-white flex items-center justify-between">
                      <span>Backup Both (Recommended)</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Safest</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Clones the entire instance into a separate backup copy and creates a timestamped zip of your world saves.
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => setBackupStrategy('instance')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    backupStrategy === 'instance'
                      ? 'bg-primary/10 border-primary shadow-sm'
                      : 'bg-background-surface border-border-subtle hover:border-white/20'
                  }`}
                >
                  <Copy size={16} className={backupStrategy === 'instance' ? 'text-primary mt-0.5' : 'text-slate-400 mt-0.5'} />
                  <div className="flex-1">
                    <div className="text-xs font-bold text-white">Backup Instance only</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Clones the entire instance as "{instance.name} (Backup {instance.minecraftVersion})" before updating.
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => setBackupStrategy('saves')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    backupStrategy === 'saves'
                      ? 'bg-primary/10 border-primary shadow-sm'
                      : 'bg-background-surface border-border-subtle hover:border-white/20'
                  }`}
                >
                  <Archive size={16} className={backupStrategy === 'saves' ? 'text-primary mt-0.5' : 'text-slate-400 mt-0.5'} />
                  <div className="flex-1">
                    <div className="text-xs font-bold text-white">Backup Saves only</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Compresses your singleplayer worlds into a timestamped zip archive in the instance's backups folder.
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => setBackupStrategy('none')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    backupStrategy === 'none'
                      ? 'bg-primary/10 border-primary shadow-sm'
                      : 'bg-background-surface border-border-subtle hover:border-white/20'
                  }`}
                >
                  <X size={16} className={backupStrategy === 'none' ? 'text-primary mt-0.5' : 'text-slate-400 mt-0.5'} />
                  <div className="flex-1">
                    <div className="text-xs font-bold text-white">No backup</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Directly apply the update without creating any backups.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Check}
                isLoading={isSaving}
                onClick={handleConfirmUpdate}
              >
                Confirm & Update
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
