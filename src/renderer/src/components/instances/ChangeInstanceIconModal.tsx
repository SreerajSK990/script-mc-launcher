import React, { useState, useRef } from 'react'
import { Dices, Upload, Check, X, Image as ImageIcon } from 'lucide-react'
import type { InstanceConfiguration } from '@shared/types/instance'
import {
  PRESET_MINECRAFT_ICONS,
  getMinecraftIconById,
  getRandomMinecraftIcon
} from '@shared/constants/minecraftIcons'
import { Button } from '@renderer/components/common/Button'

interface ChangeInstanceIconModalProps {
  isOpen: boolean
  instance: InstanceConfiguration | null
  onClose: () => void
  onIconSaved: (newIcon: string) => void
}

export const ChangeInstanceIconModal: React.FC<ChangeInstanceIconModalProps> = ({
  isOpen,
  instance,
  onClose,
  onIconSaved
}) => {
  if (!isOpen || !instance) return null

  const [selectedIcon, setSelectedIcon] = useState<string>(instance.icon || 'minecraft_grass')
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleRandomize = () => {
    const random = getRandomMinecraftIcon()
    setSelectedIcon(random.id)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedIcon(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      if (selectedIcon.startsWith('data:image/')) {
        await window.launcherAPI.instances.saveCustomIcon(instance.id, selectedIcon)
      } else {
        await window.launcherAPI.instances.update({
          id: instance.id,
          icon: selectedIcon
        })
      }
      onIconSaved(selectedIcon)
      onClose()
    } catch (err) {
      console.error('Failed to change instance icon:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const isCustomImage = selectedIcon.startsWith('data:') || selectedIcon.startsWith('http')
  const currentPreviewDataUrl = isCustomImage ? selectedIcon : getMinecraftIconById(selectedIcon).dataUrl
  const currentPreviewBg = isCustomImage
    ? 'bg-gradient-to-br from-slate-800 to-zinc-900'
    : `bg-gradient-to-br ${getMinecraftIconById(selectedIcon).bg}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-background-card border border-border-subtle rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-background-dark/50">
          <div className="flex items-center gap-2">
            <ImageIcon size={18} className="text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Change Instance Icon</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[75vh]">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-background-dark/50 border border-border-subtle">
            <div
              className={`w-20 h-20 rounded-2xl shrink-0 flex items-center justify-center p-2.5 shadow-inner border border-white/10 ${currentPreviewBg}`}
            >
              <img
                src={currentPreviewDataUrl}
                alt="Selected Icon"
                className="w-14 h-14 object-contain drop-shadow"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <span className="text-sm font-bold text-white truncate">{instance.name}</span>
              <span className="text-xs text-slate-400 truncate">
                {isCustomImage ? 'Custom Uploaded Icon' : getMinecraftIconById(selectedIcon).name}
              </span>

              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={handleRandomize}
                  className="px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Dices size={14} />
                  <span>Randomize</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-background-surface hover:bg-slate-700 text-slate-200 border border-border-subtle text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload size={14} />
                  <span>Upload Image</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Minecraft Texture Presets
            </span>

            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 p-2 rounded-xl bg-background-dark/30 border border-border-subtle">
              {PRESET_MINECRAFT_ICONS.map((preset) => {
                const isSelected = selectedIcon === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.name}
                    onClick={() => setSelectedIcon(preset.id)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center p-1 transition-all cursor-pointer relative ${
                      isSelected
                        ? 'ring-2 ring-emerald-400 scale-105 shadow-md shadow-emerald-950/60'
                        : 'opacity-70 hover:opacity-100 hover:scale-105'
                    } bg-gradient-to-br ${preset.bg}`}
                  >
                    <img
                      src={preset.dataUrl}
                      alt={preset.name}
                      className="w-7 h-7 object-contain"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border-subtle bg-background-dark/30">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Check}
            isLoading={isSaving}
            onClick={handleSave}
          >
            Save Icon
          </Button>
        </div>
      </div>
    </div>
  )
}
