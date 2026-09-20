import React, { useState, useEffect } from 'react'
import {
  Folder,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Edit2,
  FolderMinus,
  Trash2,
  FolderPlus
} from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import { InstanceCard } from '@renderer/components/instances/InstanceCard'
import { ConfirmModal } from '@renderer/components/common/ConfirmModal'

interface InstanceGroupSectionProps {
  groupName: string
  instances: InstanceConfiguration[]
  availableGroups?: string[]
  onPlay: (instance: InstanceConfiguration) => void
  onOpenFolder: (instanceId: string) => void
  onDelete: (instanceId: string) => void
  onManage?: (instance: InstanceConfiguration) => void
  onSetGroup?: (instanceId: string, group: string | null) => void
  onRenameGroup: (oldName: string, newName: string) => void
  onDisbandGroup: (groupName: string) => void
  onDeleteGroup: (groupName: string) => void
  onDropInstance: (instanceId: string, targetGroup: string) => void
  onToggleFavorite?: (instanceId: string) => void
  onIconUpdated?: (instanceId: string, newIcon: string) => void
}

export const InstanceGroupSection: React.FC<InstanceGroupSectionProps> = ({
  groupName,
  instances,
  availableGroups = [],
  onPlay,
  onOpenFolder,
  onDelete,
  onManage,
  onSetGroup,
  onRenameGroup,
  onDisbandGroup,
  onDeleteGroup,
  onDropInstance,
  onToggleFavorite,
  onIconUpdated
}) => {
  const storageKey = `scriptlauncher_group_collapsed_${groupName}`
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true'
    } catch {
      return false
    }
  })

  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
  const [newGroupNameInput, setNewGroupNameInput] = useState(groupName)
  const [isDisbandModalOpen, setIsDisbandModalOpen] = useState(false)
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false)

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(storageKey, String(next))
      } catch {
      }
      return next
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!isDraggingOver) setIsDraggingOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(false)
    const instanceId = e.dataTransfer.getData('text/instance-id')
    if (instanceId) {
      onDropInstance(instanceId, groupName)
    }
  }

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newGroupNameInput.trim()
    if (trimmed && trimmed !== groupName) {
      onRenameGroup(groupName, trimmed)
    }
    setIsRenameModalOpen(false)
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-2xl transition-all duration-200 ${
        isDraggingOver
          ? 'bg-emerald-500/10 border-2 border-dashed border-emerald-500/60 p-3'
          : 'bg-transparent'
      }`}
    >
      <div className="flex items-center justify-between gap-3 py-2 px-1 mb-2 border-b border-border-subtle/50">
        <div
          onClick={toggleCollapse}
          className="flex items-center gap-2.5 cursor-pointer select-none group"
        >
          <button
            type="button"
            className="p-1 rounded-md text-slate-400 group-hover:text-white transition-colors"
            title={isCollapsed ? 'Expand group' : 'Collapse group'}
            aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
          </button>

          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Folder size={16} />
          </div>

          <h3 className="text-base font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">
            {groupName}
          </h3>

          <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 font-mono">
            {instances.length}
          </span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            title="Group Actions"
            aria-label="Group Actions"
          >
            <MoreVertical size={16} />
          </button>

          {isMenuOpen && (
            <div
              onClick={() => setIsMenuOpen(false)}
              className="absolute right-0 top-full mt-1 w-48 bg-background-darkest/95 backdrop-blur-md border border-border-subtle rounded-xl p-1 shadow-2xl z-30 flex flex-col gap-0.5 text-xs text-slate-300"
            >
              <button
                type="button"
                onClick={() => {
                  setNewGroupNameInput(groupName)
                  setIsRenameModalOpen(true)
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors text-left w-full"
              >
                <Edit2 size={13} className="text-slate-400" />
                <span>Rename Group</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDisbandModalOpen(true)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors text-left w-full"
              >
                <FolderMinus size={13} className="text-amber-400" />
                <span>Disband Group</span>
              </button>

              <div className="h-px bg-border-subtle my-0.5" />

              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(true)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors text-left w-full"
              >
                <Trash2 size={13} />
                <span>Delete All Instances</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="pt-1 pb-3">
          {instances.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-border-subtle rounded-2xl bg-background-card/20 text-xs text-slate-500">
              Drag and drop instance cards here to add them to "{groupName}"
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
              {instances.map((instance) => (
                <InstanceCard
                  key={instance.id}
                  instance={instance}
                  availableGroups={availableGroups}
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
      )}

      {isRenameModalOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
        >
          <div className="bg-background-card border border-border-subtle rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Rename Group</h3>
            <p className="text-xs text-slate-400 mb-4">
              All instances in this group will be updated with the new name.
            </p>

            <form onSubmit={handleRenameSubmit} className="flex flex-col gap-3">
              <input
                type="text"
                value={newGroupNameInput}
                onChange={(e) => setNewGroupNameInput(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 bg-background-darkest border border-border-subtle rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
              />

              <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsRenameModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newGroupNameInput.trim()}
                  className="px-4 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition-colors disabled:opacity-50"
                >
                  Save Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isDisbandModalOpen}
        title="Disband Group"
        message={`Are you sure you want to disband the group "${groupName}"? All ${instances.length} instance(s) will become ungrouped, but no game data will be deleted.`}
        confirmLabel="Disband Group"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => {
          setIsDisbandModalOpen(false)
          onDisbandGroup(groupName)
        }}
        onCancel={() => setIsDisbandModalOpen(false)}
      />

      <ConfirmModal
        isOpen={isDeleteAllModalOpen}
        title={`Delete All Instances in "${groupName}"?`}
        message={`WARNING: This will permanently delete all ${instances.length} instance(s) in this group from your hard drive, including world saves and installed mods. This action cannot be undone.`}
        confirmLabel="Delete All Instances"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          setIsDeleteAllModalOpen(false)
          onDeleteGroup(groupName)
        }}
        onCancel={() => setIsDeleteAllModalOpen(false)}
      />

    </div>
  )
}
