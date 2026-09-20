import React, { useState } from 'react'
import { Search, Plus, Filter } from 'lucide-react'
import type { InstanceConfiguration, ModLoaderType } from '@shared/types/instance'
import { Button } from '@renderer/components/common/Button'
import { InstanceGrid } from '@renderer/components/instances/InstanceGrid'

interface InstancesPageProps {
  instances: InstanceConfiguration[]
  onPlay: (instance: InstanceConfiguration) => void
  onOpenFolder: (instanceId: string) => void
  onDelete: (instanceId: string) => void
  onCreateClick: () => void
}

type LoaderFilter = 'all' | ModLoaderType

const FILTER_OPTIONS: Array<{ id: LoaderFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'vanilla', label: 'Vanilla' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'quilt', label: 'Quilt' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' }
]

export const InstancesPage: React.FC<InstancesPageProps> = ({
  instances,
  onPlay,
  onOpenFolder,
  onDelete,
  onCreateClick
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLoader, setSelectedLoader] = useState<LoaderFilter>('all')

  const filteredInstances = instances.filter((instance) => {
    const matchesSearch =
      instance.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      instance.minecraftVersion.includes(searchQuery)

    const matchesLoader =
      selectedLoader === 'all' || instance.loaderType === selectedLoader

    return matchesSearch && matchesLoader
  })

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Your Instances</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {instances.length} {instances.length === 1 ? 'instance' : 'instances'} configured
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={onCreateClick}>
          New Instance
        </Button>
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-background-card border border-border-subtle p-3 rounded-2xl">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            placeholder="Search by instance name or Minecraft version..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background-darkest rounded-xl text-sm text-slate-100 placeholder-slate-500 border border-border-subtle focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Filter size={15} className="text-slate-500 ml-1 mr-1 shrink-0" />
          {FILTER_OPTIONS.map((filter) => {
            const isSelected = selectedLoader === filter.id
            return (
              <button
                key={filter.id}
                onClick={() => setSelectedLoader(filter.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-background-darkest text-slate-400 hover:text-slate-200 border border-border-subtle'
                }`}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
      </div>

      <InstanceGrid
        instances={filteredInstances}
        onPlay={onPlay}
        onOpenFolder={onOpenFolder}
        onDelete={onDelete}
        onCreateClick={onCreateClick}
      />
    </div>
  )
}
