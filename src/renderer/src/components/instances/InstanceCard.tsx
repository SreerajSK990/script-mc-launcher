import React from 'react'
import { Play, FolderOpen, Trash2, Cpu, Clock, SlidersHorizontal } from 'lucide-react'
import type { InstanceConfiguration, ModLoaderType } from '@shared/types/instance'
import { Button } from '@renderer/components/common/Button'

interface InstanceCardProps {
  instance: InstanceConfiguration
  onPlay: (instance: InstanceConfiguration) => void
  onOpenFolder: (instanceId: string) => void
  onDelete: (instanceId: string) => void
  onManage?: (instance: InstanceConfiguration) => void
}

function getLoaderBadgeColor(loader: ModLoaderType): string {
  switch (loader) {
    case 'fabric':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    case 'quilt':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
    case 'forge':
      return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
    case 'neoforge':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    case 'vanilla':
    default:
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  }
}

function formatPlayTime(minutes: number): string {
  if (!minutes || minutes <= 0) {
    return '0m played'
  }
  if (minutes < 60) {
    return `${minutes}m played`
  }
  const hours = (minutes / 60).toFixed(1)
  return `${hours}h played`
}

export const InstanceCard: React.FC<InstanceCardProps> = ({
  instance,
  onPlay,
  onOpenFolder,
  onDelete,
  onManage
}) => {
  const ramGigabytes = (instance.ramAllocationMegabytes / 1024).toFixed(1)

  return (
    <div className="group relative bg-background-card hover:bg-background-surface/80 border border-border-subtle hover:border-border-strong rounded-2xl p-5 transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-xl hover:shadow-black/20">
      <div
        className={onManage ? 'cursor-pointer' : undefined}
        onClick={() => onManage?.(instance)}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-100 truncate group-hover:text-primary transition-colors">
              {instance.name}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Minecraft {instance.minecraftVersion}
            </p>
          </div>

          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-wider border shrink-0 uppercase ${getLoaderBadgeColor(
              instance.loaderType
            )}`}
          >
            {instance.loaderType}
            {instance.loaderVersion && instance.loaderType !== 'vanilla' ? ` ${instance.loaderVersion}` : ''}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 my-4 pt-3 border-t border-border-subtle/60 text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-1.5">
            <Cpu size={14} className="text-slate-500" />
            <span>{ramGigabytes} GB RAM</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-slate-500" />
            <span>{formatPlayTime(instance.totalPlayTimeMinutes)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border-subtle/60">
        <Button
          variant="primary"
          size="sm"
          icon={Play}
          onClick={() => onPlay(instance)}
          className="flex-1 justify-center"
        >
          Launch
        </Button>

        {onManage && (
          <button
            onClick={() => onManage(instance)}
            className="p-2 rounded-lg bg-background-surface hover:bg-slate-700 text-slate-400 hover:text-slate-100 border border-border-subtle transition-colors"
            title="Manage Instance & Settings"
            aria-label="Manage Instance & Settings"
          >
            <SlidersHorizontal size={15} />
          </button>
        )}

        <button
          onClick={() => onOpenFolder(instance.id)}
          className="p-2 rounded-lg bg-background-surface hover:bg-slate-700 text-slate-400 hover:text-slate-100 border border-border-subtle transition-colors"
          title="Open Instance Folder"
          aria-label="Open Instance Folder"
        >
          <FolderOpen size={15} />
        </button>

        <button
          onClick={() => onDelete(instance.id)}
          className="p-2 rounded-lg bg-background-surface hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-border-subtle hover:border-rose-900/50 transition-colors"
          title="Delete Instance"
          aria-label="Delete Instance"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
