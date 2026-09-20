import React, { useState, useEffect, useCallback } from 'react'
import {
  Play,
  Plus,
  HardDrive,
  Cpu,
  ShieldCheck,
  Server,
  Compass,
  Users,
  Wifi,
  RefreshCw,
  Loader2
} from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { SystemEnvironment } from '@shared/types/system'
import type { QuickPlayTarget, ServerPingStatus } from '@shared/types/servers'
import { Button } from '@renderer/components/common/Button'
import { InstanceCard } from '@renderer/components/instances/InstanceCard'

interface DashboardPageProps {
  instances: InstanceConfiguration[]
  systemEnv: SystemEnvironment | null
  onPlay: (instance: InstanceConfiguration) => void
  onQuickPlay: (target: QuickPlayTarget) => void
  onOpenFolder: (instanceId: string) => void
  onDelete: (instanceId: string) => void
  onCreateClick: () => void
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  instances,
  systemEnv,
  onPlay,
  onQuickPlay,
  onOpenFolder,
  onDelete,
  onCreateClick
}) => {
  const latestInstance = instances[0] || null
  const [quickPlayTargets, setQuickPlayTargets] = useState<QuickPlayTarget[]>([])
  const [pingStatuses, setPingStatuses] = useState<Record<string, ServerPingStatus>>({})
  const [isPinging, setIsPinging] = useState(false)

  const loadQuickPlayTargets = useCallback(async () => {
    if (!window.launcherAPI?.servers) return
    try {
      const targets = await window.launcherAPI.servers.listAll()
      setQuickPlayTargets(targets)

      // Ping servers in background
      const servers = targets.filter((t): t is import('@shared/types/servers').MinecraftServerEntry => t.type === 'server')
      if (servers.length > 0) {
        setIsPinging(true)
        const pingResults: Record<string, ServerPingStatus> = {}
        await Promise.all(
          servers.map(async (server) => {
            try {
              const res = await window.launcherAPI.servers.ping(server.ip, server.port)
              pingResults[server.id] = res
            } catch {
              pingResults[server.id] = { online: false, latencyMs: -1 }
            }
          })
        )
        setPingStatuses((prev) => ({ ...prev, ...pingResults }))
        setIsPinging(false)
      }
    } catch (err) {
      console.error('Failed to load quick play targets:', err)
    }
  }, [])

  useEffect(() => {
    loadQuickPlayTargets()
  }, [loadQuickPlayTargets])

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row items-stretch gap-4">
        <div className="flex-1 bg-gradient-to-br from-emerald-950/40 via-background-card to-background-card border border-emerald-500/20 rounded-2xl p-6 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-medium text-emerald-400 uppercase tracking-widest">
                Quick Play
              </span>
              {latestInstance && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono uppercase">
                  {latestInstance.loaderType}
                </span>
              )}
            </div>

            {latestInstance ? (
              <>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  {latestInstance.name}
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Ready to launch Minecraft {latestInstance.minecraftVersion} with{' '}
                  {(latestInstance.ramAllocationMegabytes / 1024).toFixed(1)} GB RAM
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Welcome to Script Launcher
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  No instances created yet. Start by creating a vanilla or modded Minecraft profile.
                </p>
              </>
            )}
          </div>

          <div className="pt-6 mt-4 flex items-center gap-3">
            {latestInstance ? (
              <Button
                variant="primary"
                size="lg"
                icon={Play}
                onClick={() => onPlay(latestInstance)}
              >
                Launch Game
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                icon={Plus}
                onClick={onCreateClick}
              >
                Create First Instance
              </Button>
            )}
          </div>
        </div>

        <div className="w-full md:w-80 bg-background-card border border-border-subtle rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              System Health
            </h3>

            <div className="flex flex-col gap-3.5 text-xs font-mono">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <Cpu size={15} />
                  <span>Memory</span>
                </div>
                <span className="text-slate-200">
                  {systemEnv ? `${(systemEnv.memory.totalMegabytes / 1024).toFixed(0)} GB Total` : 'Detecting...'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <HardDrive size={15} />
                  <span>Platform</span>
                </div>
                <span className="text-slate-200 capitalize">
                  {systemEnv?.os.platform ?? 'Desktop'} ({systemEnv?.os.architecture ?? 'x64'})
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <ShieldCheck size={15} />
                  <span>Isolation</span>
                </div>
                <span className="text-emerald-400">Enabled</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border-subtle text-[11px] text-slate-500">
            Each instance operates in its own isolated filesystem folder.
          </div>
        </div>
      </div>

      {/* "Jump in" Quick-Play Section (Servers & Worlds) */}
      {quickPlayTargets.length > 0 && (
        <div className="mt-1">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Compass className="text-primary" size={18} />
                Jump In
              </h3>
              <p className="text-xs text-slate-400">
                1-click auto-join into saved multiplayer servers and singleplayer worlds
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              icon={isPinging ? Loader2 : RefreshCw}
              isLoading={isPinging}
              onClick={loadQuickPlayTargets}
              title="Refresh server status"
            >
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickPlayTargets.map((target) => {
              if (target.type === 'server') {
                const ping = pingStatuses[target.id]
                const iconSrc = ping?.favicon || target.icon

                return (
                  <div
                    key={target.id}
                    className="bg-background-card border border-border-subtle hover:border-border-subtle/80 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      {/* Server Icon */}
                      <div className="w-12 h-12 rounded-xl bg-background-surface border border-white/10 shrink-0 overflow-hidden flex items-center justify-center">
                        {iconSrc ? (
                          <img
                            src={iconSrc}
                            alt={target.name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              ;(e.target as HTMLElement).style.display = 'none'
                            }}
                          />
                        ) : (
                          <Server size={22} className="text-emerald-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-sm font-bold text-white truncate">{target.name}</h4>
                          {ping ? (
                            ping.online ? (
                              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {ping.latencyMs}ms
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                Offline
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] font-mono text-slate-500">Pinging...</span>
                          )}
                        </div>

                        <p className="text-xs font-mono text-slate-400 truncate mt-0.5">
                          {target.ip}
                          {target.port && target.port !== 25565 ? `:${target.port}` : ''}
                        </p>

                        {ping?.cleanMotd && (
                          <p className="text-[11px] text-slate-300 line-clamp-1 mt-1 font-sans">
                            {ping.cleanMotd}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border-subtle/50 text-xs">
                      <div className="flex items-center gap-2 text-slate-400">
                        <span className="text-[11px] truncate max-w-[140px]" title={target.instanceName}>
                          {target.instanceName}
                        </span>
                        {ping?.players && (
                          <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                            <Users size={10} />
                            {ping.players.online.toLocaleString()}
                          </span>
                        )}
                      </div>

                      <Button
                        variant="primary"
                        size="sm"
                        icon={Play}
                        onClick={() => onQuickPlay(target)}
                      >
                        Join
                      </Button>
                    </div>
                  </div>
                )
              }

              // Singleplayer World Card
              return (
                <div
                  key={target.id}
                  className="bg-background-card border border-border-subtle hover:border-border-subtle/80 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-md transition-all group"
                >
                  <div className="flex items-start gap-3">
                    {/* World Icon */}
                    <div className="w-12 h-12 rounded-xl bg-background-surface border border-white/10 shrink-0 overflow-hidden flex items-center justify-center">
                      {target.icon ? (
                        <img
                          src={target.icon}
                          alt={target.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Compass size={22} className="text-primary" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-sm font-bold text-white truncate">{target.name}</h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-slate-300 capitalize shrink-0">
                          {target.gameMode}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        Folder: {target.folderName}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Played {new Date(target.lastPlayed).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border-subtle/50 text-xs">
                    <span className="text-[11px] text-slate-400 truncate max-w-[150px]" title={target.instanceName}>
                      {target.instanceName}
                    </span>

                    <Button
                      variant="primary"
                      size="sm"
                      icon={Play}
                      onClick={() => onQuickPlay(target)}
                    >
                      Play World
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100">All Instances</h3>
            <p className="text-xs text-slate-400">Manage and launch your installed Minecraft setups</p>
          </div>
          <Button variant="secondary" size="sm" icon={Plus} onClick={onCreateClick}>
            New Instance
          </Button>
        </div>

        {instances.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-border-subtle rounded-2xl bg-background-card/40">
            <p className="text-sm text-slate-400">Your instance library is currently empty.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {instances.map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                onPlay={onPlay}
                onOpenFolder={onOpenFolder}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
