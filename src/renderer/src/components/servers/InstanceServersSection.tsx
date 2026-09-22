import React, { useState, useEffect, useCallback } from 'react'
import {
  Server,
  Plus,
  Play,
  Trash2,
  Edit2,
  Wifi,
  WifiOff,
  RefreshCw,
  Loader2,
  Eye,
  EyeOff
} from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { MinecraftServerEntry, ServerPingStatus } from '@shared/types/servers'
import { Button } from '@renderer/components/common/Button'
import { ConfirmModal } from '@renderer/components/common/ConfirmModal'
import { AddServerModal } from './AddServerModal'
import { DEFAULT_MINECRAFT_ICON } from '@shared/constants/minecraftIcons'

interface InstanceServersSectionProps {
  instance: InstanceConfiguration
  onLaunchServer: (server: MinecraftServerEntry) => void
  isLaunching?: boolean
}

export const InstanceServersSection: React.FC<InstanceServersSectionProps> = ({
  instance,
  onLaunchServer,
  isLaunching = false
}) => {
  const [servers, setServers] = useState<MinecraftServerEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pingStatuses, setPingStatuses] = useState<Record<string, ServerPingStatus>>({})
  const [isPinging, setIsPinging] = useState(false)

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<MinecraftServerEntry | null>(null)
  const [serverToDelete, setServerToDelete] = useState<MinecraftServerEntry | null>(null)
  const [redactIps, setRedactIps] = useState(() => {
    return localStorage.getItem('script_launcher_redact_ips') !== 'false'
  })
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())

  const toggleRedactIps = () => {
    setRedactIps((prev) => {
      const next = !prev
      localStorage.setItem('script_launcher_redact_ips', String(next))
      return next
    })
    setRevealedIds(new Set())
  }

  const toggleRevealServer = (serverId: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(serverId)) {
        next.delete(serverId)
      } else {
        next.add(serverId)
      }
      return next
    })
  }

  const loadServers = useCallback(async () => {
    if (!window.launcherAPI?.servers) return
    setIsLoading(true)
    try {
      const list = await window.launcherAPI.servers.listForInstance(instance.id)
      setServers(list)

      if (list.length > 0) {
        setIsPinging(true)
        const pings: Record<string, ServerPingStatus> = {}
        await Promise.all(
          list.map(async (s) => {
            try {
              const res = await window.launcherAPI.servers.ping(s.ip, s.port)
              pings[s.id] = res
            } catch {
              pings[s.id] = { online: false, latencyMs: -1 }
            }
          })
        )
        setPingStatuses(pings)
        setIsPinging(false)
      }
    } catch (err) {
      console.error('Failed to load servers for instance:', err)
    } finally {
      setIsLoading(false)
    }
  }, [instance.id])

  useEffect(() => {
    loadServers()
  }, [loadServers])

  const handleSaveServer = async (name: string, ip: string) => {
    if (!window.launcherAPI?.servers) return
    if (editingServer) {
      if (editingServer.ip !== ip) {
        await window.launcherAPI.servers.remove({
          instanceId: instance.id,
          serverIp: editingServer.ip
        })
      }
    }
    const updated = await window.launcherAPI.servers.add({
      instanceId: instance.id,
      name,
      ip
    })
    setServers(updated)
    setEditingServer(null)
    loadServers()
  }

  const handleDeleteServer = async () => {
    if (!serverToDelete || !window.launcherAPI?.servers) return
    try {
      const updated = await window.launcherAPI.servers.remove({
        instanceId: instance.id,
        serverIp: serverToDelete.ip
      })
      setServers(updated)
    } catch (err) {
      console.error('Failed to remove server:', err)
    } finally {
      setServerToDelete(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-background-card border border-border-subtle p-5 rounded-2xl">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Server size={18} className="text-primary" />
            Multiplayer Servers
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Manage multiplayer servers saved in this instance's servers list
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            icon={redactIps ? EyeOff : Eye}
            onClick={toggleRedactIps}
            title={redactIps ? 'Show all server IPs' : 'Redact all server IPs (Streamer Mode)'}
          >
            {redactIps ? 'IPs Hidden' : 'Show IPs'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            icon={isPinging ? Loader2 : RefreshCw}
            onClick={loadServers}
            disabled={isLoading || isPinging}
          >
            {isPinging ? 'Pinging...' : 'Refresh'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => {
              setEditingServer(null)
              setIsAddModalOpen(true)
            }}
          >
            Add Server
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-background-card border border-border-subtle rounded-2xl">
          <Loader2 size={28} className="animate-spin text-primary mb-3" />
          <p className="text-sm font-medium">Loading multiplayer servers...</p>
        </div>
      ) : servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-background-card border border-border-subtle rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3.5">
            <Server size={26} />
          </div>
          <h4 className="text-base font-semibold text-white">No Servers Added</h4>
          <p className="text-xs text-slate-400 max-w-sm mt-1 mb-5">
            Add your favorite Minecraft multiplayer servers here to launch directly into them or view real-time player counts
          </p>
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={() => {
              setEditingServer(null)
              setIsAddModalOpen(true)
            }}
          >
            Add First Server
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servers.map((server) => {
            const ping = pingStatuses[server.id]
            const isOnline = ping?.online

            return (
              <div
                key={server.id}
                className="flex flex-col justify-between p-4 rounded-2xl bg-background-card border border-border-subtle hover:border-border-muted transition-all group"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-background-surface border border-border-subtle shrink-0 p-1 flex items-center justify-center overflow-hidden">
                    <img
                      src={server.icon || DEFAULT_MINECRAFT_ICON.dataUrl}
                      alt={server.name}
                      className="w-full h-full object-contain [image-rendering:pixelated]"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).src = DEFAULT_MINECRAFT_ICON.dataUrl
                      }}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
                        {server.name}
                      </h4>
                      <div>
                        {ping === undefined ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                            Checking...
                          </span>
                        ) : isOnline ? (
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <Wifi size={10} />
                            {ping.latencyMs} ms
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                            <WifiOff size={10} />
                            Offline
                          </span>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const isHidden = redactIps ? !revealedIds.has(server.id) : false
                      return (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs font-mono text-slate-400 truncate">
                            {isHidden ? (
                              <span className="tracking-widest text-slate-500 select-none">••••••••••••</span>
                            ) : (
                              server.port && server.port !== 25565 ? `${server.ip}:${server.port}` : server.ip
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleRevealServer(server.id)
                            }}
                            className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 rounded focus:outline-none shrink-0"
                            title={isHidden ? 'Reveal server IP' : 'Hide server IP'}
                          >
                            {isHidden ? <Eye size={11} /> : <EyeOff size={11} />}
                          </button>
                        </div>
                      )
                    })()}

                    {isOnline && (
                      <div className="mt-2 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                        <span>{ping.versionName || 'Minecraft'}</span>
                        {ping.players && (
                          <span className="text-slate-300">
                            {ping.players.online.toLocaleString()} / {ping.players.max.toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}

                    {ping?.cleanMotd && (
                      <p className="text-[11px] text-slate-400/90 mt-1 line-clamp-1 italic">
                        {ping.cleanMotd}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-border-subtle/50">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingServer(server)
                        setIsAddModalOpen(true)
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-background-surface transition-colors"
                      title="Edit server"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setServerToDelete(server)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete server"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    icon={Play}
                    onClick={() => onLaunchServer(server)}
                    disabled={isLaunching}
                  >
                    Join Server
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AddServerModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false)
          setEditingServer(null)
        }}
        onSave={handleSaveServer}
        initialData={
          editingServer
            ? {
                name: editingServer.name,
                ip:
                  editingServer.port && editingServer.port !== 25565
                    ? `${editingServer.ip}:${editingServer.port}`
                    : editingServer.ip
              }
            : null
        }
        instanceName={instance.name}
      />

      <ConfirmModal
        isOpen={Boolean(serverToDelete)}
        title="Delete Server"
        message={`Are you sure you want to remove "${serverToDelete?.name}" from this instance? It will be deleted from servers.dat.`}
        confirmLabel="Delete Server"
        variant="danger"
        onConfirm={handleDeleteServer}
        onCancel={() => setServerToDelete(null)}
      />
    </div>
  )
}
