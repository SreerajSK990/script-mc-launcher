import React, { useState } from 'react'
import { Search, Plus, Filter, Upload, Copy } from 'lucide-react'
import type { InstanceConfiguration, ModLoaderType } from '@shared/types/instance'
import { Button } from '@renderer/components/common/Button'
import { InstanceGrid } from '@renderer/components/instances/InstanceGrid'

interface InstancesPageProps {
  instances: InstanceConfiguration[]
  onPlay: (instance: InstanceConfiguration) => void
  onOpenFolder: (instanceId: string) => void
  onDelete: (instanceId: string) => void
  onCreateClick: () => void
  onImportClick?: () => void
  onCloneLauncherClick?: () => void
  onManage?: (instance: InstanceConfiguration) => void
  onRefreshInstances?: () => void
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
  onCreateClick,
  onImportClick,
  onCloneLauncherClick,
  onManage,
  onRefreshInstances
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLoader, setSelectedLoader] = useState<LoaderFilter>('all')

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

  const handleToggleFavorite = async (instanceId: string) => {
    try {
      if (window.launcherAPI?.instances?.toggleFavorite) {
        await window.launcherAPI.instances.toggleFavorite(instanceId)
        onRefreshInstances?.()
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
    }
  }

  const handleIconUpdated = async () => {
    onRefreshInstances?.()
  }


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

        <div className="flex flex-wrap items-center gap-2.5">
          {onCloneLauncherClick && (
            <Button variant="secondary" icon={Copy} onClick={onCloneLauncherClick}>
              Import from Launcher
            </Button>
          )}
          {onImportClick && (
            <Button variant="secondary" icon={Upload} onClick={onImportClick}>
              Import Modpack
            </Button>
          )}
          <Button variant="primary" icon={Plus} onClick={onCreateClick}>
            New Instance
          </Button>
        </div>
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
        onManage={onManage}
        onSetGroup={handleSetGroup}
        onRenameGroup={handleRenameGroup}
        onDisbandGroup={handleDisbandGroup}
        onDeleteGroup={handleDeleteGroup}
        onToggleFavorite={handleToggleFavorite}
        onIconUpdated={handleIconUpdated}
      />
    </div>
  )
}

