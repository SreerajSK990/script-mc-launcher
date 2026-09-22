import React, { useState, useEffect, useRef } from 'react'
import { Plus, Dices, Upload, Sparkles, Folder } from 'lucide-react'
import type { CreateInstancePayload, ModLoaderType } from '@shared/types/instance'
import type { MinecraftVersionEntry } from '@shared/types/manifest'
import { Modal } from '@renderer/components/common/Modal'
import { Button } from '@renderer/components/common/Button'
import {
  DEFAULT_MINECRAFT_ICON,
  getRandomMinecraftIcon,
  getMinecraftIconById
} from '@shared/constants/minecraftIcons'

interface CreateInstanceModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (payload: CreateInstancePayload) => Promise<void>
}

const FALLBACK_VERSION_ENTRIES: MinecraftVersionEntry[] = [
  { id: '1.21.1', type: 'release', releaseTime: '2024-08-08' },
  { id: '1.21', type: 'release', releaseTime: '2024-06-13' },
  { id: '1.20.6', type: 'release', releaseTime: '2024-04-29' },
  { id: '1.20.4', type: 'release', releaseTime: '2023-12-07' },
  { id: '1.20.1', type: 'release', releaseTime: '2023-06-12' },
  { id: '1.19.4', type: 'release', releaseTime: '2023-03-14' },
  { id: '1.18.2', type: 'release', releaseTime: '2022-02-28' },
  { id: '1.16.5', type: 'release', releaseTime: '2021-01-15' },
  { id: '1.12.2', type: 'release', releaseTime: '2017-09-18' },
  { id: '1.8.9', type: 'release', releaseTime: '2015-12-03' }
]

const MOD_LOADERS: Array<{ id: ModLoaderType; label: string; description: string }> = [
  { id: 'vanilla', label: 'Vanilla', description: 'Standard unmodified Minecraft' },
  { id: 'fabric', label: 'Fabric', description: 'Lightweight and fast mod loader' },
  { id: 'quilt', label: 'Quilt', description: 'Modern community fork of Fabric' },
  { id: 'forge', label: 'Forge', description: 'Classic modding framework' },
  { id: 'neoforge', label: 'NeoForge', description: 'Next-generation Forge fork' }
]

export const CreateInstanceModal: React.FC<CreateInstanceModalProps> = ({
  isOpen,
  onClose,
  onCreate
}) => {
  const [name, setName] = useState('')
  const [minecraftVersion, setMinecraftVersion] = useState('1.21.1')
  const [allVersions, setAllVersions] = useState<MinecraftVersionEntry[]>(FALLBACK_VERSION_ENTRIES)
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [showHistorical, setShowHistorical] = useState(false)
  const [loaderType, setLoaderType] = useState<ModLoaderType>('vanilla')
  const [loaderVersion, setLoaderVersion] = useState<string | null>(null)
  const [availableLoaderVersions, setAvailableLoaderVersions] = useState<string[]>([])
  const [isLoadingLoaderVersions, setIsLoadingLoaderVersions] = useState(false)
  const [ramAllocationMb, setRamAllocationMb] = useState(4096)

  // Icon state
  const [iconId, setIconId] = useState<string>('minecraft_grass')
  const [customIconDataUrl, setCustomIconDataUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Group state
  const [group, setGroup] = useState<string>('')
  const [existingGroups, setExistingGroups] = useState<string[]>([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && window.launcherAPI?.instances) {
      window.launcherAPI.instances.list().then((list) => {
        const groups = Array.from(
          new Set(list.map((i) => i.group?.trim()).filter((g): g is string => Boolean(g && g.length > 0)))
        ).sort((a, b) => a.localeCompare(b))
        setExistingGroups(groups)
      })
    }
  }, [isOpen])


  const filteredVersions = allVersions.filter((v) => {
    if (v.type === 'release') return true
    if (showSnapshots && v.type === 'snapshot') return true
    if (showHistorical && (v.type === 'old_beta' || v.type === 'old_alpha')) return true
    return false
  })

  const selectedVersionEntry = allVersions.find((v) => v.id === minecraftVersion)

  useEffect(() => {
    const loadVersions = async () => {
      if (window.launcherAPI?.meta) {
        try {
          const versions = await window.launcherAPI.meta.getVersions()
          if (versions && versions.length > 0) {
            setAllVersions(versions)
            const defaultRelease = versions.find((v) => v.type === 'release')?.id || versions[0]?.id
            if (defaultRelease && !versions.some((v) => v.id === minecraftVersion)) {
              setMinecraftVersion(defaultRelease)
            }
          }
        } catch {
        }
      }
    }
    loadVersions()
  }, [])

  useEffect(() => {
    if (filteredVersions.length > 0 && !filteredVersions.some((v) => v.id === minecraftVersion)) {
      setMinecraftVersion(filteredVersions[0].id)
    }
  }, [showSnapshots, showHistorical, filteredVersions, minecraftVersion])

  useEffect(() => {
    if (loaderType === 'vanilla') {
      setAvailableLoaderVersions([])
      setLoaderVersion(null)
      return
    }

    let isMounted = true
    const loadLoaderVersions = async () => {
      try {
        setIsLoadingLoaderVersions(true)
        if (window.launcherAPI?.meta) {
          const versions = await window.launcherAPI.meta.getLoaderVersions(loaderType, minecraftVersion)
          if (isMounted) {
            setAvailableLoaderVersions(versions)
            setLoaderVersion(versions.length > 0 ? versions[0] : null)
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
  }, [loaderType, minecraftVersion])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Please provide a name for this instance.')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      await onCreate({
        name: name.trim(),
        minecraftVersion,
        loaderType,
        loaderVersion: loaderType === 'vanilla' ? null : loaderVersion,
        ramAllocationMegabytes: ramAllocationMb,
        icon: customIconDataUrl || iconId,
        group: group.trim() || null
      })
      setName('')
      setMinecraftVersion('1.21.1')
      setLoaderType('vanilla')
      setLoaderVersion(null)
      setRamAllocationMb(4096)
      setIconId('minecraft_grass')
      setCustomIconDataUrl(null)
      setGroup('')
      onClose()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to create instance'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Instance"
      description="Set up an isolated Minecraft environment with your preferred version and loader."
      maxWidthClass="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Instance Icon Selector & Randomizer */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Instance Icon
          </label>
          <div className="flex items-center gap-4 p-3 bg-background-darkest border border-border-subtle rounded-2xl">
            {/* Preview Box */}
            <div
              className={`w-16 h-16 rounded-xl shrink-0 flex items-center justify-center p-2 shadow-inner ${
                customIconDataUrl
                  ? 'bg-gradient-to-br from-slate-800 to-zinc-900'
                  : `bg-gradient-to-br ${getMinecraftIconById(iconId).bg}`
              }`}
            >
              <img
                src={customIconDataUrl || getMinecraftIconById(iconId).dataUrl}
                alt="Instance Icon"
                className="w-12 h-12 object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white truncate">
                {customIconDataUrl ? 'Custom Uploaded Icon' : getMinecraftIconById(iconId).name}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Default Minecraft icon, randomize from blocks & items, or upload custom art.
              </p>

              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    const random = getRandomMinecraftIcon()
                    setIconId(random.id)
                    setCustomIconDataUrl(null)
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Dices size={14} />
                  <span>Randomize</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-border-subtle text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload size={14} />
                  <span>Upload Custom</span>
                </button>

                {(customIconDataUrl || iconId !== 'minecraft_grass') && (
                  <button
                    type="button"
                    onClick={() => {
                      setIconId('minecraft_grass')
                      setCustomIconDataUrl(null)
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-300 ml-1 cursor-pointer"
                  >
                    Reset
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          setCustomIconDataUrl(reader.result)
                        }
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Instance Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Survival 1.21"
            className="w-full px-3.5 py-2.5 rounded-xl bg-background-darkest border border-border-subtle focus:border-emerald-500 focus:outline-none text-slate-100 text-sm placeholder-slate-500"
            autoFocus
          />
        </div>

        {/* Group (Optional) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Group (Optional)
            </label>
            <span className="text-[11px] text-slate-500">
              For collapsible folder organization
            </span>
          </div>
          <input
            type="text"
            placeholder="e.g. Modpacks, Survival SMP, Testing..."
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            list="create-modal-group-suggestions"
            className="w-full px-3.5 py-2.5 rounded-xl bg-background-darkest border border-border-subtle focus:border-emerald-500 focus:outline-none text-slate-100 text-sm placeholder-slate-500"
          />
          <datalist id="create-modal-group-suggestions">
            {existingGroups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>


        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Minecraft Version
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-400 hover:text-slate-200 select-none">
                <input
                  type="checkbox"
                  checked={showSnapshots}
                  onChange={(e) => setShowSnapshots(e.target.checked)}
                  className="rounded border-border-subtle bg-background-darkest text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span>Snapshots</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-400 hover:text-slate-200 select-none">
                <input
                  type="checkbox"
                  checked={showHistorical}
                  onChange={(e) => setShowHistorical(e.target.checked)}
                  className="rounded border-border-subtle bg-background-darkest text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span>Historical</span>
              </label>
            </div>
          </div>

          <select
            value={minecraftVersion}
            onChange={(e) => setMinecraftVersion(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-background-darkest border border-border-subtle focus:border-emerald-500 focus:outline-none text-slate-100 text-sm font-mono"
          >
            {filteredVersions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id} {v.type === 'snapshot' ? '• [Snapshot]' : v.type === 'old_beta' ? '• [Beta]' : v.type === 'old_alpha' ? '• [Alpha]' : ''}
              </option>
            ))}
          </select>

          {selectedVersionEntry?.type === 'snapshot' && (loaderType === 'forge' || loaderType === 'neoforge') && (
            <p className="text-[11px] text-amber-400/90 mt-1.5 flex items-center gap-1">
              <span>Notice: Forge and NeoForge primarily target official releases. Vanilla or Fabric are recommended for snapshots.</span>
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Mod Loader
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MOD_LOADERS.map((loader) => {
              const isSelected = loaderType === loader.id
              return (
                <button
                  type="button"
                  key={loader.id}
                  onClick={() => setLoaderType(loader.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500 text-slate-100 shadow-sm'
                      : 'bg-background-darkest border-border-subtle text-slate-400 hover:border-border-strong hover:text-slate-200'
                  }`}
                >
                  <div className="text-xs font-semibold">{loader.label}</div>
                  <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">{loader.description}</div>
                </button>
              )
            })}
          </div>
        </div>

        {loaderType !== 'vanilla' && (
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Loader Version
            </label>
            {isLoadingLoaderVersions ? (
              <div className="px-3.5 py-2.5 rounded-xl bg-background-darkest border border-border-subtle text-slate-400 text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Loading compatible {loaderType} versions...
              </div>
            ) : availableLoaderVersions.length > 0 ? (
              <select
                value={loaderVersion || availableLoaderVersions[0]}
                onChange={(e) => setLoaderVersion(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background-darkest border border-border-subtle focus:border-emerald-500 focus:outline-none text-slate-100 text-sm font-mono"
              >
                {availableLoaderVersions.map((ver, index) => (
                  <option key={ver} value={ver}>
                    {ver} {index === 0 ? '(Recommended / Latest)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                No compatible {loaderType} versions found for Minecraft {minecraftVersion}.
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Allocated RAM
            </label>
            <span className="text-xs font-mono text-emerald-400">
              {(ramAllocationMb / 1024).toFixed(1)} GB ({ramAllocationMb} MB)
            </span>
          </div>
          <input
            type="range"
            min={1024}
            max={16384}
            step={512}
            value={ramAllocationMb}
            onChange={(e) => setRamAllocationMb(Number(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
            <span>1 GB</span>
            <span>Recommended: 4 GB</span>
            <span>16 GB</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={Plus}
            isLoading={isSubmitting}
          >
            Create Instance
          </Button>
        </div>
      </form>
    </Modal>
  )
}
