import React, { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import type { CreateInstancePayload, ModLoaderType } from '@shared/types/instance'
import { Modal } from '@renderer/components/common/Modal'
import { Button } from '@renderer/components/common/Button'

interface CreateInstanceModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (payload: CreateInstancePayload) => Promise<void>
}

const FALLBACK_MINECRAFT_VERSIONS = [
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.1',
  '1.19.4',
  '1.18.2',
  '1.16.5',
  '1.12.2',
  '1.8.9'
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
  const [availableVersions, setAvailableVersions] = useState<string[]>(FALLBACK_MINECRAFT_VERSIONS)
  const [loaderType, setLoaderType] = useState<ModLoaderType>('vanilla')
  const [loaderVersion, setLoaderVersion] = useState<string | null>(null)
  const [availableLoaderVersions, setAvailableLoaderVersions] = useState<string[]>([])
  const [isLoadingLoaderVersions, setIsLoadingLoaderVersions] = useState(false)
  const [ramAllocationMb, setRamAllocationMb] = useState(4096)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadVersions = async () => {
      if (window.launcherAPI?.meta) {
        try {
          const versions = await window.launcherAPI.meta.getVersions()
          if (versions && versions.length > 0) {
            setAvailableVersions(versions)
            if (!versions.includes(minecraftVersion)) {
              setMinecraftVersion(versions[0])
            }
          }
        } catch {
          // Fallback to defaults if offline
        }
      }
    }
    loadVersions()
  }, [])

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
        ramAllocationMegabytes: ramAllocationMb
      })
      setName('')
      setMinecraftVersion('1.21.1')
      setLoaderType('vanilla')
      setLoaderVersion(null)
      setRamAllocationMb(4096)
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

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Minecraft Version
          </label>
          <select
            value={minecraftVersion}
            onChange={(e) => setMinecraftVersion(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-background-darkest border border-border-subtle focus:border-emerald-500 focus:outline-none text-slate-100 text-sm font-mono"
          >
            {availableVersions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>
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
