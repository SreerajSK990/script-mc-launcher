import React, { useState, useRef, useEffect } from 'react'
import {
  Play,
  FolderOpen,
  Trash2,
  SlidersHorizontal,
  MoreVertical,
  Layers,
  FolderMinus
} from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import { getMinecraftIconById } from '@shared/constants/minecraftIcons'

interface InstanceCardProps {
  instance: InstanceConfiguration
  availableGroups?: string[]
  onPlay: (instance: InstanceConfiguration) => void
  onOpenFolder: (instanceId: string) => void
  onDelete: (instanceId: string) => void
  onManage?: (instance: InstanceConfiguration) => void
  onSetGroup?: (instanceId: string, group: string | null) => void
}

export const InstanceCard: React.FC<InstanceCardProps> = ({
  instance,
  availableGroups = [],
  onPlay,
  onOpenFolder,
  onDelete,
  onManage,
  onSetGroup
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
  const [targetGroupInput, setTargetGroupInput] = useState(instance.group || '')
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  // Resolve icon definition
  const iconDef = getMinecraftIconById(instance.icon)
  const isCustomDataUrl =
    instance.icon?.startsWith('data:') ||
    instance.icon?.startsWith('http:') ||
    instance.icon?.startsWith('https:') ||
    instance.icon?.startsWith('/')

  const iconSrc = isCustomDataUrl ? instance.icon! : iconDef.dataUrl
  const bgClass = isCustomDataUrl
    ? 'bg-gradient-to-br from-slate-800 to-zinc-900'
    : `bg-gradient-to-br ${iconDef.bg}`

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/instance-id', instance.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleApplyGroup = (e: React.FormEvent) => {
    e.preventDefault()
    onSetGroup?.(instance.id, targetGroupInput.trim() || null)
    setIsGroupModalOpen(false)
    setIsMenuOpen(false)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onManage?.(instance)}
      className="group relative flex flex-col bg-background-card hover:bg-background-surface/70 border border-border-subtle hover:border-border-strong rounded-2xl p-2.5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/5 active:scale-[0.99] cursor-pointer select-none"
    >
      {/* Top Square Icon Banner matching Modrinth layout */}
      <div
        className={`w-full aspect-square rounded-xl ${bgClass} flex items-center justify-center relative overflow-hidden shadow-inner`}
      >
        <img
          src={iconSrc}
          alt={instance.name}
          className="w-20 h-20 object-contain drop-shadow-md transition-transform duration-200 group-hover:scale-105"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Hover Play Button (Bottom-Right Circular Green Button matching Screenshot 3) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onPlay(instance)
          }}
          className="absolute right-2.5 bottom-2.5 w-10 h-10 rounded-full bg-emerald-400 hover:bg-emerald-300 text-black shadow-lg shadow-emerald-950/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150 transform scale-90 hover:scale-105 active:scale-95 cursor-pointer z-10"
          title="Launch Game"
          aria-label="Launch Game"
        >
          <Play size={18} className="fill-black text-black ml-0.5" />
        </button>
      </div>

      {/* Bottom Info: Bold Title & Version Subtitle */}
      <div className="flex items-center justify-between gap-1.5 mt-2.5 px-1 min-w-0">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
            {instance.name}
          </h4>
          <p className="text-xs text-slate-400 truncate mt-0.5 capitalize">
            {instance.loaderType} {instance.loaderVersion || instance.minecraftVersion}
          </p>
        </div>

        {/* Card Options / Kebab Menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsMenuOpen((prev) => !prev)
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
            title="More Options"
            aria-label="More Options"
          >
            <MoreVertical size={16} />
          </button>

          {isMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 bottom-full mb-1.5 w-44 bg-background-darkest/95 backdrop-blur-md border border-border-subtle rounded-xl p-1.5 shadow-2xl z-30 flex flex-col gap-0.5 text-xs text-slate-300"
            >
              {onManage && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    onManage(instance)
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors text-left w-full"
                >
                  <SlidersHorizontal size={13} className="text-slate-400" />
                  <span>Manage Instance</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setTargetGroupInput(instance.group || '')
                  setIsGroupModalOpen(true)
                  setIsMenuOpen(false)
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors text-left w-full"
              >
                <Layers size={13} className="text-emerald-400" />
                <span>{instance.group ? 'Change Group' : 'Add to Group'}</span>
              </button>

              {instance.group && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    onSetGroup?.(instance.id, null)
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors text-left w-full"
                >
                  <FolderMinus size={13} className="text-amber-400" />
                  <span>Remove from Group</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false)
                  onOpenFolder(instance.id)
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors text-left w-full"
              >
                <FolderOpen size={13} className="text-slate-400" />
                <span>Open Folder</span>
              </button>

              <div className="h-px bg-border-subtle my-0.5" />

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false)
                  onDelete(instance.id)
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors text-left w-full"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline Group Picker Modal */}
      {isGroupModalOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
        >
          <div className="bg-background-card border border-border-subtle rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Set Instance Group</h3>
            <p className="text-xs text-slate-400 mb-4">
              Organize <span className="text-white font-medium">{instance.name}</span> into a collapsible folder group.
            </p>

            <form onSubmit={handleApplyGroup} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Modpacks, Survival SMP, Testing..."
                  value={targetGroupInput}
                  onChange={(e) => setTargetGroupInput(e.target.value)}
                  list={`groups-list-${instance.id}`}
                  autoFocus
                  className="w-full px-3 py-2 bg-background-darkest border border-border-subtle rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <datalist id={`groups-list-${instance.id}`}>
                  {availableGroups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>

              {availableGroups.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400 w-full">Quick Pick:</span>
                  {availableGroups.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setTargetGroupInput(g)}
                      className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                        targetGroupInput === g
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-white/5 text-slate-300 border-border-subtle hover:bg-white/10'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition-colors"
                >
                  Save Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
