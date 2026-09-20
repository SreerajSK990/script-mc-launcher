import React from 'react'
import { Play, Plus, HardDrive, Cpu, ShieldCheck } from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { SystemEnvironment } from '@shared/types/system'
import { Button } from '@renderer/components/common/Button'
import { InstanceCard } from '@renderer/components/instances/InstanceCard'

interface DashboardPageProps {
  instances: InstanceConfiguration[]
  systemEnv: SystemEnvironment | null
  onPlay: (instance: InstanceConfiguration) => void
  onOpenFolder: (instanceId: string) => void
  onDelete: (instanceId: string) => void
  onCreateClick: () => void
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  instances,
  systemEnv,
  onPlay,
  onOpenFolder,
  onDelete,
  onCreateClick
}) => {
  const latestInstance = instances[0] || null

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
