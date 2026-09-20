import React, { useState } from 'react'
import { Plus, Box, Layers } from 'lucide-react'
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
  onDeleteGroup
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

  // Extract all existing groups
  const allGroups = Array.from(
    new Set(
      instances
        .map((i) => i.group?.trim())
        .filter((g): g is string => Boolean(g && g.length > 0))
    )
  ).sort((a, b) => a.localeCompare(b))

  const hasGroups = allGroups.length > 0

  // Grouped instances map
  const groupedMap: Record<string, InstanceConfiguration[]> = {}
  for (const group of allGroups) {
    groupedMap[group] = instances.filter((i) => i.group?.trim() === group)
  }

  // Ungrouped instances
  const ungroupedInstances = instances.filter((i) => !i.group || !i.group.trim())

  const handleDropIntoUngroup = (e: React.DragEvent) => {
    e.preventDefault()
    setIsUngroupDraggingOver(false)
    const instanceId = e.dataTransfer.getData('text/instance-id')
    if (instanceId) {
      onSetGroup?.(instanceId, null)
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Priority: Render all collapsible groups FIRST at the top */}
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
            />
          ))}
        </div>
      )}

      {/* Ungrouped Instances section */}
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
              All your instances are organized in groups.
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
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* No groups at all: simple clean grid */
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
