import React, { useCallback, useEffect, useState } from 'react'
import { Archive, Download, FolderOpen, Globe, Layers, Pencil, Play, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { DatapackEntry, ManagedWorldEntry, QuickPlayTarget } from '@shared/types/servers'
import type { ModSearchResult } from '@shared/types/mods'
import { Button } from '@renderer/components/common/Button'
import { ConfirmModal } from '@renderer/components/common/ConfirmModal'

interface WorldsPanelProps {
  instance: InstanceConfiguration
  onQuickPlay?: (target: QuickPlayTarget) => void
  onNotification?: (message: string) => void
}

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatLastPlayed(timestamp: number): string {
  if (!timestamp) return 'Never played'
  return new Date(timestamp).toLocaleString()
}

const DatapackSection: React.FC<{
  instance: InstanceConfiguration
  world: ManagedWorldEntry
  onNotification?: (message: string) => void
}> = ({ instance, world, onNotification }) => {
  const [packs, setPacks] = useState<DatapackEntry[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ModSearchResult[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const loadPacks = useCallback(async () => {
    try {
      setPacks(await window.launcherAPI.worlds.listDatapacks(instance.id, world.folderName))
    } catch (error) {
      onNotification?.(error instanceof Error ? error.message : 'Could not load datapacks.')
    }
  }, [instance.id, world.folderName, onNotification])

  useEffect(() => {
    void loadPacks()
  }, [loadPacks])

  const search = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy('search')
    try {
      setResults(
        await window.launcherAPI.mods.search({
          query: query.trim(),
          projectType: 'datapack',
          source: 'modrinth',
          minecraftVersion: instance.minecraftVersion,
          limit: 8
        })
      )
    } catch (error) {
      onNotification?.(error instanceof Error ? error.message : 'Datapack search failed.')
    } finally {
      setBusy(null)
    }
  }

  const install = async (project: ModSearchResult) => {
    setBusy(project.id)
    try {
      const versions = await window.launcherAPI.mods.getVersions(
        project.id,
        'modrinth',
        instance.minecraftVersion,
        'datapack' as never
      )
      const chosen = versions.find((version) => version.releaseType === 'release') ?? versions[0]
      if (!chosen) {
        onNotification?.(`${project.name} has no datapack build for Minecraft ${instance.minecraftVersion}.`)
        return
      }
      await window.launcherAPI.worlds.installDatapack(instance.id, world.folderName, chosen)
      onNotification?.(`Installed ${project.name} into "${world.name}".`)
      await loadPacks()
    } catch (error) {
      onNotification?.(error instanceof Error ? error.message : 'Datapack install failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border-subtle bg-background-surface/40 p-3">
      {packs.length === 0 ? (
        <p className="text-xs text-slate-400">No datapacks in this world yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {packs.map((pack) => (
            <li key={pack.fileName} className="flex items-center justify-between gap-2 text-xs text-slate-300">
              <span className="truncate font-mono">{pack.fileName}</span>
              <span className="flex items-center gap-2 shrink-0 text-slate-500">
                {formatSize(pack.sizeBytes)}
                <button
                  className="text-rose-400 hover:text-rose-300"
                  title="Remove datapack"
                  onClick={async () => {
                    await window.launcherAPI.worlds.deleteDatapack(instance.id, world.folderName, pack.fileName)
                    await loadPacks()
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search Modrinth datapacks for ${instance.minecraftVersion}`}
          className="flex-1 rounded-lg bg-background-surface border border-border-subtle px-3 py-1.5 text-xs text-white outline-none focus:border-primary"
        />
        <Button type="submit" variant="secondary" size="sm" icon={Search} disabled={busy === 'search'}>
          Search
        </Button>
      </form>
      {results.length > 0 && (
        <ul className="space-y-1.5">
          {results.map((project) => (
            <li key={project.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0">
                <span className="text-slate-200">{project.name}</span>
                <span className="block truncate text-slate-500">{project.description}</span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={Download}
                disabled={busy === project.id}
                onClick={() => void install(project)}
              >
                {busy === project.id ? 'Installing...' : 'Install'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-slate-500">Datapacks load the next time the world is opened.</p>
    </div>
  )
}

export const WorldsPanel: React.FC<WorldsPanelProps> = ({ instance, onQuickPlay, onNotification }) => {
  const [worlds, setWorlds] = useState<ManagedWorldEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [busyFolder, setBusyFolder] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ folderName: string; value: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ManagedWorldEntry | null>(null)
  const [expandedDatapacks, setExpandedDatapacks] = useState<string | null>(null)

  const loadWorlds = useCallback(async () => {
    setIsLoading(true)
    try {
      setWorlds(await window.launcherAPI.worlds.list(instance.id))
    } catch (error) {
      onNotification?.(error instanceof Error ? error.message : 'Could not load worlds.')
    } finally {
      setIsLoading(false)
    }
  }, [instance.id, onNotification])

  useEffect(() => {
    void loadWorlds()
  }, [loadWorlds])

  const runAction = async (folderName: string, action: () => Promise<string | void>, success: string) => {
    setBusyFolder(folderName)
    try {
      await action()
      onNotification?.(success)
      await loadWorlds()
    } catch (error) {
      onNotification?.(error instanceof Error ? error.message : 'World action failed.')
    } finally {
      setBusyFolder(null)
    }
  }

  const supportsQuickPlay = (() => {
    const [major, minor] = instance.minecraftVersion.split('.').map((part) => parseInt(part, 10))
    return major > 1 || (major === 1 && minor >= 20)
  })()

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-background-card px-4 py-3">
        <span className="text-sm text-slate-300">
          {worlds.length} world{worlds.length === 1 ? '' : 's'} in this instance
        </span>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void loadWorlds()} disabled={isLoading}>
          Refresh
        </Button>
      </div>

      {worlds.length === 0 && !isLoading && (
        <div className="rounded-xl border border-dashed border-border-subtle p-10 text-center text-sm text-slate-400">
          No singleplayer worlds yet. Create one in game and it will show up here.
        </div>
      )}

      <div className="grid gap-3">
        {worlds.map((world) => {
          const isBusy = busyFolder === world.folderName
          const isRenaming = renaming?.folderName === world.folderName
          return (
            <div
              key={world.folderName}
              className="flex flex-col md:flex-row md:items-center gap-4 rounded-xl border border-border-subtle bg-background-card p-4"
            >
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-background-surface border border-border-subtle flex items-center justify-center shrink-0">
                {world.icon ? (
                  <img src={world.icon} alt="" className="w-full h-full object-cover [image-rendering:pixelated]" />
                ) : (
                  <Globe size={28} className="text-slate-500" />
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                {isRenaming ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const value = renaming.value.trim()
                      setRenaming(null)
                      if (value && value !== world.name) {
                        void runAction(
                          world.folderName,
                          () => window.launcherAPI.worlds.rename(instance.id, world.folderName, value),
                          `Renamed world to "${value}".`
                        )
                      }
                    }}
                  >
                    <input
                      autoFocus
                      maxLength={64}
                      value={renaming.value}
                      onChange={(event) => setRenaming({ folderName: world.folderName, value: event.target.value })}
                      onBlur={() => setRenaming(null)}
                      className="flex-1 rounded-lg bg-background-surface border border-border-subtle px-3 py-1.5 text-sm text-white outline-none focus:border-primary"
                    />
                  </form>
                ) : (
                  <h3 className="text-sm font-semibold text-white truncate">{world.name}</h3>
                )}
                <p className="text-xs text-slate-400 truncate">
                  {world.gameMode} · {formatSize(world.sizeBytes)} · {formatLastPlayed(world.lastPlayed)}
                </p>
                <p className="text-[11px] text-slate-500 font-mono truncate">saves/{world.folderName}</p>
                {expandedDatapacks === world.folderName && (
                  <DatapackSection instance={instance} world={world} onNotification={onNotification} />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {supportsQuickPlay && onQuickPlay && (
                  <Button variant="primary" size="sm" icon={Play} disabled={isBusy} onClick={() => onQuickPlay(world)}>
                    Play
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Pencil}
                  disabled={isBusy}
                  onClick={() => setRenaming({ folderName: world.folderName, value: world.name })}
                >
                  Rename
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Archive}
                  disabled={isBusy}
                  onClick={() =>
                    void runAction(
                      world.folderName,
                      () => window.launcherAPI.worlds.backup(instance.id, world.folderName),
                      `Backed up "${world.name}" to the instance backups folder.`
                    )
                  }
                >
                  {isBusy ? 'Working...' : 'Back Up'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Layers}
                  onClick={() =>
                    setExpandedDatapacks((current) => (current === world.folderName ? null : world.folderName))
                  }
                >
                  Datapacks
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={FolderOpen}
                  onClick={() => void window.launcherAPI.worlds.openFolder(instance.id, world.folderName)}
                >
                  Folder
                </Button>
                <Button variant="danger" size="sm" icon={Trash2} disabled={isBusy} onClick={() => setPendingDelete(world)}>
                  Remove
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <ConfirmModal
        isOpen={pendingDelete !== null}
        title="Remove world"
        message={`Move "${pendingDelete?.name ?? ''}" out of this instance? It will be kept in the instance's deleted-worlds folder so you can bring it back later.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) {
            void runAction(
              target.folderName,
              () => window.launcherAPI.worlds.remove(instance.id, target.folderName),
              `Moved "${target.name}" to deleted-worlds.`
            )
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  )
}
