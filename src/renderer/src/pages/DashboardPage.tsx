import React, { useState, useEffect, useCallback } from 'react'
import {
  Play,
  Plus,
  Compass,
  Users,
  RefreshCw,
  Loader2
} from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { SystemEnvironment } from '@shared/types/system'
import type { QuickPlayTarget, ServerPingStatus } from '@shared/types/servers'
import { Button } from '@renderer/components/common/Button'
import { InstanceGrid } from '@renderer/components/instances/InstanceGrid'
import { DEFAULT_MINECRAFT_ICON } from '@shared/constants/minecraftIcons'

interface DashboardPageProps {
  instances: InstanceConfiguration[]
  systemEnv: SystemEnvironment | null
  onPlay: (instance: InstanceConfiguration) => void
  onQuickPlay: (target: QuickPlayTarget) => void
  onOpenFolder: (instanceId: string) => void
  onDelete: (instanceId: string) => void
  onCreateClick: () => void
  onManage?: (instance: InstanceConfiguration) => void
  onRefreshInstances?: () => void
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  instances,
  onPlay,
  onQuickPlay,
  onOpenFolder,
  onDelete,
  onCreateClick,
  onManage,
  onRefreshInstances
}) => {
  const [quickPlayTargets, setQuickPlayTargets] = useState<QuickPlayTarget[]>([])
  const [pingStatuses, setPingStatuses] = useState<Record<string, ServerPingStatus>>({})
  const [isPinging, setIsPinging] = useState(false)

  const loadQuickPlayTargets = useCallback(async () => {
    if (!window.launcherAPI?.servers) return
    try {
      const targets = await window.launcherAPI.servers.listAll()
      setQuickPlayTargets(targets)

      // Ping servers in background
      const servers = targets.filter(
        (t): t is import('@shared/types/servers').MinecraftServerEntry => t.type === 'server'
      )
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

  const handleSetGroup = async (instanceId: string, group: string | null) => {
    try {
      if (window.launcherAPI?.instances?.setGroup) {
        await window.launcherAPI.instances.setGroup(instanceId, group)
        onRefreshInstances?.()
      }
    } catch (err) {
      console.error('Failed to set group:', err)
    }
  }

  const handleRenameGroup = async (oldName: string, newName: string) => {
    try {
      if (window.launcherAPI?.instances?.renameGroup) {
        await window.launcherAPI.instances.renameGroup(oldName, newName)
        onRefreshInstances?.()
      }
    } catch (err) {
      console.error('Failed to rename group:', err)
    }
  }

  const handleDisbandGroup = async (groupName: string) => {
    try {
      if (window.launcherAPI?.instances?.disbandGroup) {
        await window.launcherAPI.instances.disbandGroup(groupName)
        onRefreshInstances?.()
      }
    } catch (err) {
      console.error('Failed to disband group:', err)
    }
  }

  const handleDeleteGroup = async (groupName: string) => {
    try {
      if (window.launcherAPI?.instances?.deleteGroup) {
        await window.launcherAPI.instances.deleteGroup(groupName)
        onRefreshInstances?.()
      }
    } catch (err) {
      console.error('Failed to delete group:', err)
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 1. "Jump In" Container is First at the Top! */}
      <div className="bg-background-card border border-border-subtle rounded-3xl p-5 md:p-6 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
              <Compass className="text-emerald-400" size={20} />
              Jump In
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
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

        {quickPlayTargets.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-border-subtle rounded-2xl bg-background-card/40 text-xs text-slate-400">
            No servers or singleplayer worlds detected yet across your instances. Launch an instance to add servers or create worlds!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {quickPlayTargets.map((target) => {
              if (target.type === 'server') {
                const ping = pingStatuses[target.id]
                // Fallback to classic Minecraft icon if server has no icon
                const iconSrc = ping?.favicon || target.icon || DEFAULT_MINECRAFT_ICON.dataUrl

                return (
                  <div
                    key={target.id}
                    className="bg-background-darkest/70 border border-border-subtle hover:border-border-strong rounded-2xl p-3.5 flex flex-col justify-between gap-3 shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      {/* Server Icon with Minecraft Grass fallback */}
                      <div className="w-12 h-12 rounded-xl bg-background-card border border-white/10 shrink-0 overflow-hidden flex items-center justify-center p-1">
                        <img
                          src={iconSrc}
                          alt={target.name}
                          className="w-full h-full object-contain"
                          style={{ imageRendering: 'pixelated' }}
                          onError={(e) => {
                            // Fallback to Minecraft default icon on image load error
                            ;(e.target as HTMLImageElement).src = DEFAULT_MINECRAFT_ICON.dataUrl
                          }}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-sm font-bold text-white truncate">{target.name}</h4>
                          {ping ? (
                            ping.online ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {ping.latencyMs}ms
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                Offline
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                              Pinging...
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
                          {target.ip}
                          {target.port !== 25565 ? `:${target.port}` : ''}
                        </p>

                        {ping?.motd && (
                          <p className="text-[11px] text-slate-400 truncate mt-1">
                            {ping.motd}
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
                  className="bg-background-darkest/70 border border-border-subtle hover:border-border-strong rounded-2xl p-3.5 flex flex-col justify-between gap-3 shadow-md transition-all group"
                >
                  <div className="flex items-start gap-3">
                    {/* World Icon with Minecraft Grass fallback */}
                    <div className="w-12 h-12 rounded-xl bg-background-card border border-white/10 shrink-0 overflow-hidden flex items-center justify-center">
                      <img
                        src={target.icon || DEFAULT_MINECRAFT_ICON.dataUrl}
                        alt={target.name}
                        className="w-full h-full object-cover"
                        style={{ imageRendering: 'pixelated' }}
                      />
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
                      <p className="text-[10px] text-slate-500 mt-0.5">
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
        )}
      </div>

      {/* 2. All Instances Showcase (Modrinth Layout + Grouping) */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-100">All Instances</h3>
            <p className="text-xs text-slate-400">Manage and launch your installed Minecraft setups</p>
          </div>
          <Button variant="secondary" size="sm" icon={Plus} onClick={onCreateClick}>
            New Instance
          </Button>
        </div>

        <InstanceGrid
          instances={instances}
          onPlay={onPlay}
          onOpenFolder={onOpenFolder}
          onDelete={onDelete}
          onCreateClick={onCreateClick}
          onManage={onManage}
          onSetGroup={handleSetGroup}
          onRenameGroup={handleRenameGroup}
          onDisbandGroup={handleDisbandGroup}
          onDeleteGroup={handleDeleteGroup}
        />
      </div>
    </div>
  )
}
