import React, { useState } from 'react'
import { Plus, Box, Layers, Star } from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import { InstanceCard } from '@renderer/components/instances/InstanceCard'
import { InstanceGroupSection } from '@renderer/components/instances/InstanceGroupSection'
import { Button } from '@renderer/components/common/Button'

interface InstanceGridProps {
  instances: InstanceConfiguration[]
  onPlay: (instance: InstanceConfiguration) => void
  onOpenFolder: (instanceId: string) => void
  onDelete: (instanceId: string) => void
  onCreateClick: () => void
  onManage?: (instance: InstanceConfiguration) => void
  onSetGroup?: (instanceId: string, group: string | null) => void
  onRenameGroup?: (oldName: string, newName: string) => void
  onDisbandGroup?: (groupName: string) => void
  onDeleteGroup?: (groupName: string) => void
  onToggleFavorite?: (instanceId: string) => void
  onIconUpdated?: (instanceId: string, newIcon: string) => void
}

export const InstanceGrid: React.FC<InstanceGridProps> = ({
  instances,
  onPlay,
  onOpenFolder,
  onDelete,
  onCreateClick,
  onManage,
  onSetGroup,
  onRenameGroup,
  onDisbandGroup,
  onDeleteGroup,
  onToggleFavorite,
  onIconUpdated
}) => {
  const [isUngroupDraggingOver, setIsUngroupDraggingOver] = useState(false)

  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-dashed border-border-subtle rounded-2xl bg-background-card/40 my-4">
        <div className="w-14 h-14 rounded-2xl bg-background-surface border border-border-subtle flex items-center justify-center text-slate-400 mb-4">
          <Box size={28} />
        </div>
        <h3 className="text-lg font-semibold text-slate-100">No Instances Yet</h3>
        <p className="text-sm text-slate-400 max-w-sm mt-1 mb-6">
          Create an isolated Minecraft environment to start playing vanilla or install mods with Fabric, Quilt, or Forge.
        </p>
        <Button variant="primary" icon={Plus} onClick={onCreateClick}>
          Create First Instance
        </Button>
      </div>
    )
  }

  const favoriteInstances = instances.filter((i) => Boolean(i.isFavorite))
  const hasFavorites = favoriteInstances.length > 0

  const allGroups = Array.from(
    new Set(
      instances
        .map((i) => i.group?.trim())
        .filter((g): g is string => Boolean(g && g.length > 0))
    )
  ).sort((a, b) => a.localeCompare(b))

  const hasGroups = allGroups.length > 0

  const groupedMap: Record<string, InstanceConfiguration[]> = {}
  for (const group of allGroups) {
    groupedMap[group] = instances.filter((i) => i.group?.trim() === group)
  }

  const ungroupedInstances = instances.filter(
    (i) => (!i.group || !i.group.trim()) && (!hasFavorites || !i.isFavorite)
  )

  const handleDropIntoUngroup = (e: React.DragEvent) => {
    e.preventDefault()
    setIsUngroupDraggingOver(false)
    const instanceId = e.dataTransfer.getData('text/instance-id')
    if (instanceId) {
      onSetGroup?.(instanceId, null)
    }
  }

  return (
    <div className="flex flex-col gap-7 w-full">
      {hasFavorites && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 pb-1.5 px-1 border-b border-amber-500/20">
            <Star size={16} className="text-amber-400 fill-amber-400" />
            <h4 className="text-sm font-bold text-white tracking-wide uppercase">Favorites</h4>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-mono font-semibold border border-amber-500/20">
              {favoriteInstances.length}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
            {favoriteInstances.map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                availableGroups={allGroups}
                onPlay={onPlay}
                onOpenFolder={onOpenFolder}
                onDelete={onDelete}
                onManage={onManage}
                onSetGroup={onSetGroup}
                onToggleFavorite={onToggleFavorite}
                onIconUpdated={onIconUpdated}
              />
            ))}
          </div>
        </div>
      )}

      {hasGroups && (
        <div className="flex flex-col gap-5">
          {allGroups.map((groupName) => (
            <InstanceGroupSection
              key={groupName}
              groupName={groupName}
              instances={groupedMap[groupName] || []}
              availableGroups={allGroups}
              onPlay={onPlay}
              onOpenFolder={onOpenFolder}
              onDelete={onDelete}
              onManage={onManage}
              onSetGroup={onSetGroup}
              onRenameGroup={(oldName, newName) => onRenameGroup?.(oldName, newName)}
              onDisbandGroup={(name) => onDisbandGroup?.(name)}
              onDeleteGroup={(name) => onDeleteGroup?.(name)}
              onDropInstance={(instId, grp) => onSetGroup?.(instId, grp)}
              onToggleFavorite={onToggleFavorite}
              onIconUpdated={onIconUpdated}
            />
          ))}
        </div>
      )}

      {hasGroups ? (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setIsUngroupDraggingOver(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsUngroupDraggingOver(false)
            }
          }}
          onDrop={handleDropIntoUngroup}
          className={`flex flex-col gap-3 rounded-2xl transition-all ${
            isUngroupDraggingOver
              ? 'bg-amber-500/10 border-2 border-dashed border-amber-500/50 p-3'
              : ''
          }`}
        >
          <div className="flex items-center justify-between pt-2 pb-1 px-1 border-b border-border-subtle/50">
            <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Layers size={15} className="text-slate-500" />
              <span>Other Instances</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-400 font-mono">
                {ungroupedInstances.length}
              </span>
            </h4>
            <span className="text-[11px] text-slate-500">
              Drag here to remove from a group
            </span>
          </div>

          {ungroupedInstances.length === 0 ? (
            <div className="py-6 text-center border border-dashed border-border-subtle rounded-2xl bg-background-card/20 text-xs text-slate-500">
              All your instances are organized in groups or favorites.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
              {ungroupedInstances.map((instance) => (
                <InstanceCard
                  key={instance.id}
                  instance={instance}
                  availableGroups={allGroups}
                  onPlay={onPlay}
                  onOpenFolder={onOpenFolder}
                  onDelete={onDelete}
                  onManage={onManage}
                  onSetGroup={onSetGroup}
                  onToggleFavorite={onToggleFavorite}
                  onIconUpdated={onIconUpdated}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        !hasFavorites && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
            {instances.map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                availableGroups={allGroups}
                onPlay={onPlay}
                onOpenFolder={onOpenFolder}
                onDelete={onDelete}
                onManage={onManage}
                onSetGroup={onSetGroup}
                onToggleFavorite={onToggleFavorite}
                onIconUpdated={onIconUpdated}
              />
            ))}
          </div>
        )
      )}

      {!hasGroups && hasFavorites && ungroupedInstances.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 pb-1.5 px-1 border-b border-border-subtle/50">
            <h4 className="text-sm font-semibold text-slate-300">Other Instances</h4>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-400 font-mono">
              {ungroupedInstances.length}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
            {ungroupedInstances.map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                availableGroups={allGroups}
                onPlay={onPlay}
                onOpenFolder={onOpenFolder}
                onDelete={onDelete}
                onManage={onManage}
                onSetGroup={onSetGroup}
                onToggleFavorite={onToggleFavorite}
                onIconUpdated={onIconUpdated}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
