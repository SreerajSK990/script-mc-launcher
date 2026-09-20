import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Shirt,
  Search,
  Check,
  Plus,
  Trash2,
  RotateCw,
  Eye,
  Upload,
  User,
  Sparkles,
  Loader2,
  RefreshCw,
  AlertCircle
} from 'lucide-react'
import type { SkinEntry, SkinModelType, PlayerSkinSearchResult } from '@shared/types/skins'
import { Button } from '@renderer/components/common/Button'
import { ConfirmModal } from '@renderer/components/common/ConfirmModal'
import { SkinViewer3D, type SkinAnimationType } from '@renderer/components/skins/SkinViewer3D'

interface SkinSelectorPageProps {
  onNotification: (message: string) => void
}

export const SkinSelectorPage: React.FC<SkinSelectorPageProps> = ({ onNotification }) => {
  const [activeSkinId, setActiveSkinId] = useState<string>('preset_steve')
  const [skins, setSkins] = useState<SkinEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Currently previewed skin in 3D viewer
  const [previewSkin, setPreviewSkin] = useState<SkinEntry | null>(null)
  const [previewModel, setPreviewModel] = useState<SkinModelType>('classic')
  const [animation, setAnimation] = useState<SkinAnimationType>('walk')
  const [autoRotate, setAutoRotate] = useState(false)

  // Subtab for right pane
  const [activeSubTab, setActiveSubTab] = useState<'library' | 'presets'>('library')
  const [presetFilter, setPresetFilter] = useState<'all' | 'official' | 'events'>('all')
  const [activeAccountUsername, setActiveAccountUsername] = useState<string | null>(null)

  // Search state
  const [searchUsername, setSearchUsername] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<PlayerSkinSearchResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Drag and drop / file upload state
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Delete modal state
  const [skinToDelete, setSkinToDelete] = useState<SkinEntry | null>(null)

  const loadSkins = useCallback(async () => {
    setIsLoading(true)
    try {
      if (window.launcherAPI?.skins) {
        const res = await window.launcherAPI.skins.list()
        let currentActive = res.activeSkinId || 'preset_steve'

        // Check if user is logged into an active account
        let activeUserSkin: SkinEntry | null = null
        try {
          const authState = await window.launcherAPI?.auth?.getState?.()
          const activeAccount = authState?.activeAccount

          if (activeAccount?.username) {
            setActiveAccountUsername(activeAccount.username)

            // Look for user's skin in existing skins
            const existing = res.skins.find(
              (s) =>
                s.name.toLowerCase() === activeAccount.username.toLowerCase() ||
                s.name.toLowerCase() === `${activeAccount.username.toLowerCase()} (active)`
            )

            if (existing) {
              activeUserSkin = existing
              if (!res.activeSkinId || res.activeSkinId.startsWith('preset_')) {
                currentActive = existing.id
              }
            } else if (activeAccount.skinUrl) {
              const saved = await window.launcherAPI.skins.save({
                name: `${activeAccount.username} (Active)`,
                model: 'classic',
                textureData: activeAccount.skinUrl,
                source: 'player'
              })
              activeUserSkin = saved
              res.skins.push(saved)
              currentActive = saved.id
              await window.launcherAPI.skins.apply(saved.id)
            } else {
              // Automatically resolve player's real skin from Mojang
              try {
                const searched = await window.launcherAPI.skins.searchPlayer(activeAccount.username)
                if (searched && searched.skinUrl) {
                  const saved = await window.launcherAPI.skins.save({
                    name: `${activeAccount.username} (Active)`,
                    model: searched.model,
                    textureData: searched.skinUrl,
                    source: 'player'
                  })
                  activeUserSkin = saved
                  res.skins.push(saved)
                  currentActive = saved.id
                  await window.launcherAPI.skins.apply(saved.id)
                }
              } catch {
                // Ignore if offline
              }
            }

          }
        } catch (authErr) {
          console.warn('Could not auto-resolve active player skin:', authErr)
        }

        setSkins(res.skins)
        setActiveSkinId(currentActive)

        // Set initial preview skin (prioritize user's active skin!)
        const found =
          activeUserSkin ||
          res.skins.find((s) => s.id === currentActive) ||
          res.skins[0]

        if (found) {
          setPreviewSkin(found)
          setPreviewModel(found.model)
        }
      }
    } catch (err) {
      console.error('Failed to load skins:', err)
      onNotification('Could not load skins library.')
    } finally {
      setIsLoading(false)
    }
  }, [onNotification])


  useEffect(() => {
    loadSkins()
  }, [loadSkins])

  const handleApplySkin = async (skin: SkinEntry) => {
    try {
      if (window.launcherAPI?.skins) {
        await window.launcherAPI.skins.apply(skin.id)
        setActiveSkinId(skin.id)
        onNotification(`Skin "${skin.name}" is now active!`)
      }
    } catch (err) {
      console.error('Failed to apply skin:', err)
      onNotification('Failed to apply skin.')
    }
  }

  const handleDeleteSkin = async () => {
    if (!skinToDelete || !window.launcherAPI?.skins) return
    try {
      await window.launcherAPI.skins.delete(skinToDelete.id)
      onNotification(`Skin "${skinToDelete.name}" deleted.`)
      setSkinToDelete(null)
      await loadSkins()
    } catch (err) {
      console.error('Failed to delete skin:', err)
      onNotification('Failed to delete skin.')
    }
  }

  const handleSearchPlayer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = searchUsername.trim()
    if (!trimmed) return

    setIsSearching(true)
    setSearchError(null)
    setSearchResult(null)

    try {
      if (window.launcherAPI?.skins) {
        const result = await window.launcherAPI.skins.searchPlayer(trimmed)
        setSearchResult(result)
        // Automatically show preview in 3D
        setPreviewSkin({
          id: `temp_${result.uuid}`,
          name: `${result.username}'s Skin`,
          textureUrl: result.skinUrl,
          model: result.model,
          source: 'player',
          author: result.username
        })
        setPreviewModel(result.model)
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Player not found.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSaveSearchedSkin = async () => {
    if (!searchResult || !window.launcherAPI?.skins) return
    try {
      const saved = await window.launcherAPI.skins.save({
        name: `${searchResult.username}'s Skin`,
        textureData: searchResult.skinUrl,
        model: searchResult.model,
        source: 'player',
        author: searchResult.username
      })
      onNotification(`Saved "${saved.name}" to your library!`)
      setSearchResult(null)
      setSearchUsername('')
      await loadSkins()
      setPreviewSkin(saved)
      setPreviewModel(saved.model)
      setActiveSubTab('library')
    } catch (err) {
      console.error('Failed to save searched skin:', err)
      onNotification('Failed to save player skin.')
    }
  }

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)

    const files = Array.from(e.dataTransfer.files)
    const pngFile = files.find((f) => f.name.toLowerCase().endsWith('.png'))
    if (!pngFile) {
      onNotification('Please drop a valid .png Minecraft skin file.')
      return
    }

    await processSkinFile(pngFile)
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processSkinFile(file)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const processSkinFile = async (file: File) => {
    try {
      const filePath = (file as any).path
      const skinName = file.name.replace(/\.png$/i, '').replace(/[-_]/g, ' ')

      let textureData: string
      if (filePath) {
        textureData = filePath
      } else {
        // Read file as base64 dataUrl
        const buffer = await file.arrayBuffer()
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )
        textureData = `data:image/png;base64,${base64}`
      }

      if (window.launcherAPI?.skins) {
        const saved = await window.launcherAPI.skins.save({
          name: skinName || 'Custom Skin',
          textureData,
          model: previewModel,
          source: 'custom'
        })

        onNotification(`Skin "${saved.name}" added to library!`)
        await loadSkins()
        setPreviewSkin(saved)
        setPreviewModel(saved.model)
        setActiveSubTab('library')
      }
    } catch (err) {
      console.error('Failed to import skin file:', err)
      onNotification('Failed to import skin file.')
    }
  }

  const userLibrarySkins = skins.filter((s) => s.source !== 'preset')
  const presetSkins = skins.filter((s) => s.source === 'preset')

  const isCurrentActive = Boolean(previewSkin && activeSkinId === previewSkin.id)

  return (
    <div className="flex flex-col gap-6 w-full h-[calc(100vh-4rem)]">
      {/* Page Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shirt className="text-primary" size={22} />
            Skin Customizer
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Preview, manage, and apply 3D Minecraft player skins across all instances
          </p>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        {/* Left / Center 3D Preview Column (7 cols) */}
        <div className="lg:col-span-7 flex flex-col bg-background-card border border-border-subtle rounded-2xl overflow-hidden shadow-xl">
          {/* Top Preview Bar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-background-dark/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">
                {previewSkin?.name || 'No Skin Selected'}
              </span>
              {previewSkin?.author && (
                <span className="text-[11px] text-slate-500 font-mono">by {previewSkin.author}</span>
              )}
              {isCurrentActive && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Check size={10} /> Active
                </span>
              )}
            </div>

            {/* Model Toggle */}
            <div className="flex items-center gap-1 bg-background-surface border border-border-subtle rounded-xl p-0.5">
              <button
                onClick={() => setPreviewModel('classic')}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  previewModel === 'classic'
                    ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Classic (4px)
              </button>
              <button
                onClick={() => setPreviewModel('slim')}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  previewModel === 'slim'
                    ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Slim (3px)
              </button>
            </div>
          </div>

          {/* 3D Canvas Area */}
          <div className="flex-1 relative flex items-center justify-center bg-radial-gradient from-slate-900/60 to-background-card overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 size={32} className="text-primary animate-spin" />
                <span className="text-xs">Loading 3D skin customizer...</span>
              </div>
            ) : previewSkin ? (
              <SkinViewer3D
                skinUrl={previewSkin.textureUrl}
                model={previewModel}
                animation={animation}
                autoRotate={autoRotate}
                width={360}
                height={460}
                className="w-full h-full"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                <Shirt size={48} className="opacity-40" />
                <span className="text-sm">Select a skin to preview</span>
              </div>
            )}

            {/* Floating Quick Controls Bar */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background-dark/80 backdrop-blur-md border border-border-subtle rounded-2xl p-1.5 shadow-2xl">
              {/* Animation Switcher */}
              <div className="flex items-center gap-1">
                {(['walk', 'run', 'idle', 'fly', 'wave', 'none'] as SkinAnimationType[]).map((anim) => (
                  <button
                    key={anim}
                    onClick={() => setAnimation(anim)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg capitalize transition-colors ${
                      animation === anim
                        ? 'bg-white/10 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {anim}
                  </button>
                ))}
              </div>

              <div className="w-[1px] h-4 bg-white/10" />

              {/* Auto Rotate Toggle */}
              <button
                onClick={() => setAutoRotate(!autoRotate)}
                title={autoRotate ? 'Stop rotation' : 'Auto-rotate'}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  autoRotate
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <RotateCw size={14} className={autoRotate ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Bottom Action Footer */}
          <div className="flex items-center justify-between p-4 border-t border-border-subtle bg-background-dark/30">
            <div className="text-xs text-slate-400">
              {previewSkin?.source === 'preset'
                ? 'Official Minecraft default model'
                : previewSkin?.source === 'player'
                ? 'Imported from Minecraft player'
                : 'Custom skin file'}
            </div>

            <div className="flex items-center gap-3">
              {previewSkin && previewSkin.source !== 'preset' && (
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  onClick={() => setSkinToDelete(previewSkin)}
                >
                  Delete Skin
                </Button>
              )}

              {previewSkin && (
                <Button
                  variant={isCurrentActive ? 'secondary' : 'primary'}
                  size="sm"
                  icon={Check}
                  disabled={isCurrentActive}
                  onClick={() => handleApplySkin(previewSkin)}
                >
                  {isCurrentActive ? 'Currently Active' : 'Apply Skin'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Right Pane (5 cols): Library, Player Search & Presets */}
        <div className="lg:col-span-5 flex flex-col gap-4 min-h-0">
          {/* Player Search Section */}
          <div className="bg-background-card border border-border-subtle rounded-2xl p-4 shrink-0 space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Search size={14} className="text-primary" />
              Player Skin Search
            </h3>

            <form onSubmit={handleSearchPlayer} className="flex gap-2">
              <input
                type="text"
                value={searchUsername}
                onChange={(e) => setSearchUsername(e.target.value)}
                placeholder="Enter Minecraft username..."
                className="flex-1 bg-background-surface border border-border-subtle focus:border-primary/60 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
              />
              <Button
                variant="primary"
                size="sm"
                icon={isSearching ? Loader2 : Search}
                isLoading={isSearching}
                type="submit"
              >
                Search
              </Button>
            </form>

            {searchError && (
              <div className="text-xs text-rose-400 flex items-center gap-1.5 pt-1">
                <AlertCircle size={13} />
                <span>{searchError}</span>
              </div>
            )}

            {searchResult && (
              <div className="p-3 rounded-xl bg-background-surface border border-border-subtle flex items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden">
                    <img
                      src={`https://mc-heads.net/avatar/${searchResult.username}/32`}
                      alt={searchResult.username}
                      className="w-8 h-8 rounded"
                      onError={(e) => {
                        ;(e.target as HTMLElement).style.display = 'none'
                      }}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{searchResult.username}</div>
                    <div className="text-[10px] text-slate-400 capitalize">{searchResult.model} model</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Plus}
                    onClick={handleSaveSearchedSkin}
                  >
                    Add to Library
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Library / Presets Tabs Container */}
          <div className="flex-1 bg-background-card border border-border-subtle rounded-2xl flex flex-col min-h-0 overflow-hidden">
            {/* Tabs Header */}
            <div className="flex items-center justify-between border-b border-border-subtle px-4 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveSubTab('library')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                    activeSubTab === 'library'
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Shirt size={13} />
                  My Skins
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10">
                    {userLibrarySkins.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveSubTab('presets')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                    activeSubTab === 'presets'
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles size={13} />
                  Official Presets
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".png"
                className="hidden"
                onChange={handleFileInputChange}
              />

              {activeSubTab === 'library' && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Upload}
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload .png skin"
                >
                  Upload
                </Button>
              )}
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {activeSubTab === 'library' && (
                <div className="flex flex-col gap-3">
                  {/* Drag and Drop Zone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setIsDraggingOver(true)
                    }}
                    onDragLeave={() => setIsDraggingOver(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                      isDraggingOver
                        ? 'border-primary bg-primary/10 scale-[0.99]'
                        : 'border-border-subtle hover:border-primary/50 bg-background-surface/40'
                    }`}
                  >
                    <Upload size={20} className="mx-auto text-primary mb-1.5" />
                    <div className="text-xs font-semibold text-slate-200">
                      Drop .png skin file here or browse
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Standard 64x64 or 64x32 Minecraft skin format
                    </div>
                  </div>

                  {userLibrarySkins.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No custom skins added yet. Drop a .png file or search a player above.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5">
                      {userLibrarySkins.map((skin) => {
                        const isSelected = previewSkin?.id === skin.id
                        const isActive = activeSkinId === skin.id

                        return (
                          <div
                            key={skin.id}
                            onClick={() => {
                              setPreviewSkin(skin)
                              setPreviewModel(skin.model)
                            }}
                            className={`p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-2 group ${
                              isSelected
                                ? 'bg-primary/10 border-primary shadow-md'
                                : 'bg-background-surface border-border-subtle hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                                {skin.name}
                              </span>
                              {isActive && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                              )}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span className="capitalize">{skin.model}</span>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleApplySkin(skin)
                                  }}
                                  className="p-1 hover:text-emerald-400"
                                  title="Apply"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSkinToDelete(skin)
                                  }}
                                  className="p-1 hover:text-rose-400"
                                  title="Delete"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeSubTab === 'presets' && (
                <div className="flex flex-col gap-3">
                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    <button
                      type="button"
                      onClick={() => setPresetFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                        presetFilter === 'all'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      All Presets ({presetSkins.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPresetFilter('official')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                        presetFilter === 'official'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      Official Characters
                    </button>
                    <button
                      type="button"
                      onClick={() => setPresetFilter('events')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 flex items-center gap-1 ${
                        presetFilter === 'events'
                          ? 'bg-purple-600 text-white'
                          : 'bg-white/5 text-purple-300 hover:text-purple-200'
                      }`}
                    >
                      <Sparkles size={12} />
                      <span>Events & Special</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {presetSkins
                      .filter((s) => {
                        if (presetFilter === 'official') return s.category === 'Official' || !s.category
                        if (presetFilter === 'events') return s.category === 'Events & Special Editions'
                        return true
                      })
                      .map((skin) => {
                        const isSelected = previewSkin?.id === skin.id
                        const isActive = activeSkinId === skin.id

                        return (
                          <div
                            key={skin.id}
                            onClick={() => {
                              setPreviewSkin(skin)
                              setPreviewModel(skin.model)
                            }}
                            className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-2 group ${
                              isSelected
                                ? 'bg-primary/10 border-primary shadow-md'
                                : 'bg-background-surface border-border-subtle hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-white">{skin.name}</span>
                              {isActive ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">
                                  ACTIVE
                                </span>
                              ) : skin.category === 'Events & Special Editions' ? (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-purple-500/20 text-purple-300">
                                  EVENT
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span className="capitalize">{skin.model} model</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleApplySkin(skin)
                                }}
                                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-200 text-[10px] font-medium cursor-pointer"
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(skinToDelete)}
        title="Delete Custom Skin"
        message={`Are you sure you want to remove "${skinToDelete?.name}" from your skins library?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteSkin}
        onCancel={() => setSkinToDelete(null)}
      />
    </div>
  )
}
