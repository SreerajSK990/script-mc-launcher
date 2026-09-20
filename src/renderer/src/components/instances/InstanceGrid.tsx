import React from 'react'
import { Plus, Box } from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import { InstanceCard } from '@renderer/components/instances/InstanceCard'
import { Button } from '@renderer/components/common/Button'

interface InstanceGridProps {
  instances: InstanceConfiguration[]
  onPlay: (instance: InstanceConfiguration) => void
  onOpenFolder: (instanceId: string) => void
  onDelete: (instanceId: string) => void
  onCreateClick: () => void
}

export const InstanceGrid: React.FC<InstanceGridProps> = ({
  instances,
  onPlay,
  onOpenFolder,
  onDelete,
  onCreateClick
}) => {
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
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
  )
}
