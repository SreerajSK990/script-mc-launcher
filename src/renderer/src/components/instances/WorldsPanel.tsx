import React, { useCallback, useEffect, useState } from 'react'
import { Archive, FolderOpen, Globe, Pencil, Play, RefreshCw, Trash2 } from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { ManagedWorldEntry, QuickPlayTarget } from '@shared/types/servers'
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

export const WorldsPanel: React.FC<WorldsPanelProps> = ({ instance, onQuickPlay, onNotification }) => {
  const [worlds, setWorlds] = useState<ManagedWorldEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [busyFolder, setBusyFolder] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ folderName: string; value: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ManagedWorldEntry | null>(null)

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
