import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Shirt,
  Search,
  Check,
  Plus,
  Trash2,
  RotateCw,
  Upload,
  Sparkles,
  Loader2,
  AlertCircle,
  Shield,
  Layers,
  X
} from 'lucide-react'
import type {
  SkinEntry,
  SkinModelType,
  PlayerSkinSearchResult,
  CapeEntry,
  BackEquipmentType
} from '@shared/types/skins'
import { Button } from '@renderer/components/common/Button'
import { ConfirmModal } from '@renderer/components/common/ConfirmModal'
import { SkinViewer3D, type SkinAnimationType } from '@renderer/components/skins/SkinViewer3D'

interface SkinSelectorPageProps {
  onNotification: (message: string) => void
}

export const SkinSelectorPage: React.FC<SkinSelectorPageProps> = ({ onNotification }) => {
  const notifyRef = useRef(onNotification)
  useEffect(() => {
    notifyRef.current = onNotification
  }, [onNotification])

  const [activeTab, setActiveTab] = useState<'skins' | 'capes'>('skins')

  const [activeSkinId, setActiveSkinId] = useState<string>('preset_steve')
  const [skins, setSkins] = useState<SkinEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [previewSkin, setPreviewSkin] = useState<SkinEntry | null>(null)
  const [previewModel, setPreviewModel] = useState<SkinModelType>('classic')
  const [animation, setAnimation] = useState<SkinAnimationType>('walk')
  const [autoRotate, setAutoRotate] = useState(false)

  const [activeSkinSubTab, setActiveSkinSubTab] = useState<'library' | 'presets'>('library')
  const [activeAccountUsername, setActiveAccountUsername] = useState<string | null>(null)

  const [searchUsername, setSearchUsername] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<PlayerSkinSearchResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [skinToDelete, setSkinToDelete] = useState<SkinEntry | null>(null)

  const [activeCapeId, setActiveCapeId] = useState<string | null>(null)
  const [capes, setCapes] = useState<CapeEntry[]>([])
  const [previewCape, setPreviewCape] = useState<CapeEntry | null>(null)
  const [backEquipment, setBackEquipment] = useState<BackEquipmentType>('cape')
  const [activeCapeSubTab, setActiveCapeSubTab] = useState<'library' | 'presets'>('library')
  const [optifineUsername, setOptifineUsername] = useState('')
  const [isSearchingOptifine, setIsSearchingOptifine] = useState(false)
  const [optifineResult, setOptifineResult] = useState<{ username: string; capeUrl: string } | null>(null)
  const [optifineError, setOptifineError] = useState<string | null>(null)
  const [capeToDelete, setCapeToDelete] = useState<CapeEntry | null>(null)
  const fileCapeInputRef = useRef<HTMLInputElement | null>(null)
  const [isDraggingCapeOver, setIsDraggingCapeOver] = useState(false)

  const loadCapes = useCallback(async () => {
    try {
      if (window.launcherAPI?.skins) {
        const res = await window.launcherAPI.skins.listCapes()
        setCapes(res.capes)
        setActiveCapeId(res.activeCapeId)
        if (res.activeCapeId) {
          const activeCape = res.capes.find((c) => c.id === res.activeCapeId)
          if (activeCape) {
            setPreviewCape((prev) => prev || activeCape)
          }
        }
      }
    } catch (err) {
      console.error('Failed to load capes:', err)
    }
  }, [])

  const loadSkins = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setIsLoading(true)
    }
    try {
      if (window.launcherAPI?.skins) {
        const res = await window.launcherAPI.skins.list()
        let currentActive = res.activeSkinId || 'preset_steve'

        const sanitizedSkins = res.skins.map((s) => ({
          ...s,
          name: s.name.replace(/\s*\(Active\)$/i, "'s Skin")
        }))

        try {
          const authState = await window.launcherAPI?.auth?.getState?.()
          const activeAccount = authState?.activeAccount

          if (activeAccount?.username) {
            setActiveAccountUsername(activeAccount.username)

            const existing = sanitizedSkins.find(
              (s) =>
                s.name.toLowerCase() === activeAccount.username.toLowerCase() ||
                s.name.toLowerCase() === `${activeAccount.username.toLowerCase()}'s skin`
            )

            if (!res.activeSkinId) {
              if (existing) {
                currentActive = existing.id
              } else if (activeAccount.skinUrl) {
                const saved = await window.launcherAPI.skins.save({
                  name: `${activeAccount.username}'s Skin`,
                  model: 'classic',
                  textureData: activeAccount.skinUrl,
                  source: 'player'
                })
                sanitizedSkins.push(saved)
                currentActive = saved.id
                await window.launcherAPI.skins.apply(saved.id)
              } else {
                try {
                  const searched = await window.launcherAPI.skins.searchPlayer(activeAccount.username)
                  if (searched && searched.skinUrl) {
                    const saved = await window.launcherAPI.skins.save({
                      name: `${activeAccount.username}'s Skin`,
                      model: searched.model,
                      textureData: searched.skinUrl,
                      source: 'player'
                    })
                    sanitizedSkins.push(saved)
                    currentActive = saved.id
                    await window.launcherAPI.skins.apply(saved.id)
                  }
                } catch {
                }
              }
            }
          }
        } catch (authErr) {
          console.warn('Could not auto-resolve active player skin:', authErr)
        }

        setSkins(sanitizedSkins)
        setActiveSkinId(currentActive)

        const activeSkinFound = sanitizedSkins.find((s) => s.id === currentActive)
        const initialSkin = activeSkinFound || sanitizedSkins[0]

        if (initialSkin) {
          setPreviewSkin((prev) => {
            if (!prev) return initialSkin
            const stillExists = sanitizedSkins.find((s) => s.id === prev.id)
            return stillExists || initialSkin
          })
          setPreviewModel((prev) => {
            const currentSkin = sanitizedSkins.find((s) => s.id === (previewSkin?.id || initialSkin.id))
            return currentSkin ? currentSkin.model : prev
          })
        }
      }
    } catch (err) {
      console.error('Failed to load skins:', err)
      notifyRef.current('Could not load skins library.')
    } finally {
      if (showLoader) {
        setIsLoading(false)
      }
    }
  }, [previewSkin?.id])

  useEffect(() => {
    loadSkins(true)
    loadCapes()
  }, [loadSkins, loadCapes])

  const handleApplySkin = async (skin: SkinEntry) => {
    try {
      if (window.launcherAPI?.skins) {
        const res = await window.launcherAPI.skins.apply(skin.id)
        if (res.success) {
          setActiveSkinId(skin.id)
          setPreviewSkin(skin)
          setPreviewModel(skin.model)
          notifyRef.current(res.message || `Skin "${skin.name}" is now active!`)
        } else {
          notifyRef.current(res.message || 'Failed to apply skin.')
        }
      }
    } catch (err) {
      console.error('Failed to apply skin:', err)
      notifyRef.current('Failed to apply skin.')
    }
  }

  const handleDeleteSkin = async () => {
    if (!skinToDelete || !window.launcherAPI?.skins) return
    try {
      await window.launcherAPI.skins.delete(skinToDelete.id)
      notifyRef.current(`Skin "${skinToDelete.name}" deleted.`)
      setSkinToDelete(null)
      await loadSkins(false)
    } catch (err) {
      console.error('Failed to delete skin:', err)
      notifyRef.current('Failed to delete skin.')
    }
  }

  const handleApplyCape = async (cape: CapeEntry | null) => {
    try {
      if (window.launcherAPI?.skins) {
        const capeIdToApply = cape ? cape.id : ''
        const res = await window.launcherAPI.skins.applyCape(capeIdToApply)
        if (res.success) {
          setActiveCapeId(cape ? cape.id : null)
          if (cape) {
            setPreviewCape(cape)
            if (backEquipment === 'none') {
              setBackEquipment('cape')
            }
          }
          notifyRef.current(res.message)
        } else {
          notifyRef.current(res.message)
        }
      }
    } catch (err) {
      console.error('Failed to apply cape:', err)
      notifyRef.current('Failed to apply cape.')
    }
  }

  const handleDeleteCape = async () => {
    if (!capeToDelete || !window.launcherAPI?.skins) return
    try {
      await window.launcherAPI.skins.deleteCape(capeToDelete.id)
      notifyRef.current(`Cape "${capeToDelete.name}" deleted.`)
      setCapeToDelete(null)
      if (previewCape?.id === capeToDelete.id) {
        setPreviewCape(null)
      }
      await loadCapes()
    } catch (err) {
      console.error('Failed to delete cape:', err)
      notifyRef.current('Failed to delete cape.')
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
      notifyRef.current(`Saved "${saved.name}" to your library!`)
      setSearchResult(null)
      setSearchUsername('')
      await loadSkins(false)
      setPreviewSkin(saved)
      setPreviewModel(saved.model)
      setActiveSkinSubTab('library')
    } catch (err) {
      console.error('Failed to save searched skin:', err)
      notifyRef.current('Failed to save player skin.')
    }
  }

  const handleSearchOptifine = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = optifineUsername.trim()
    if (!trimmed) return

    setIsSearchingOptifine(true)
    setOptifineError(null)
    setOptifineResult(null)

    try {
      if (window.launcherAPI?.skins) {
        const res = await window.launcherAPI.skins.searchOptifineCape(trimmed)
        if (res) {
          setOptifineResult({ username: trimmed, capeUrl: res.textureUrl })
          setPreviewCape(res)
          if (backEquipment === 'none') {
            setBackEquipment('cape')
          }
        } else {
          setOptifineError(`No OptiFine cape found for "${trimmed}".`)
        }
      }
    } catch (err) {
      setOptifineError(err instanceof Error ? err.message : 'Failed to search OptiFine cape.')
    } finally {
      setIsSearchingOptifine(false)
    }
  }

  const handleSaveOptifineCape = async () => {
    if (!optifineResult || !window.launcherAPI?.skins) return
    try {
      const saved = await window.launcherAPI.skins.saveCape({
        name: `${optifineResult.username}'s OptiFine Cape`,
        textureData: optifineResult.capeUrl
      })
      notifyRef.current(`Saved "${saved.name}" to library!`)
      setOptifineResult(null)
      setOptifineUsername('')
      await loadCapes()
      setPreviewCape(saved)
      if (backEquipment === 'none') {
        setBackEquipment('cape')
      }
      setActiveCapeSubTab('library')
    } catch (err) {
      console.error('Failed to save OptiFine cape:', err)
      notifyRef.current('Failed to save OptiFine cape.')
    }
  }

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)

    const files = Array.from(e.dataTransfer.files)
    const pngFile = files.find((f) => f.name.toLowerCase().endsWith('.png'))
    if (!pngFile) {
      notifyRef.current('Please drop a valid .png Minecraft skin file.')
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
      const filePath = (file as unknown as { path?: string }).path
      const skinName = file.name.replace(/\.png$/i, '').replace(/[-_]/g, ' ')

      let textureData: string
      if (filePath) {
        textureData = filePath
      } else {
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

        notifyRef.current(`Skin "${saved.name}" added to library!`)
        await loadSkins(false)
        setPreviewSkin(saved)
        setPreviewModel(saved.model)
        setActiveSkinSubTab('library')
      }
    } catch (err) {
      console.error('Failed to import skin file:', err)
      notifyRef.current('Failed to import skin file.')
    }
  }

  const handleCapeFileDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingCapeOver(false)

    const files = Array.from(e.dataTransfer.files)
    const pngFile = files.find((f) => f.name.toLowerCase().endsWith('.png'))
    if (!pngFile) {
      notifyRef.current('Please drop a valid .png Minecraft cape file.')
      return
    }

    await processCapeFile(pngFile)
  }

  const handleCapeFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processCapeFile(file)
    if (fileCapeInputRef.current) {
      fileCapeInputRef.current.value = ''
    }
  }

  const processCapeFile = async (file: File) => {
    try {
      const filePath = (file as unknown as { path?: string }).path
      const capeName = file.name.replace(/\.png$/i, '').replace(/[-_]/g, ' ')

      let textureData: string
      if (filePath) {
        textureData = filePath
      } else {
        const buffer = await file.arrayBuffer()
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )
        textureData = `data:image/png;base64,${base64}`
      }

      if (window.launcherAPI?.skins) {
        const saved = await window.launcherAPI.skins.saveCape({
          name: capeName || 'Custom Cape',
          textureData
        })

        notifyRef.current(`Cape "${saved.name}" added to library!`)
        await loadCapes()
        setPreviewCape(saved)
        if (backEquipment === 'none') {
          setBackEquipment('cape')
        }
        setActiveCapeSubTab('library')
      }
    } catch (err) {
      console.error('Failed to import cape file:', err)
      notifyRef.current('Failed to import cape file.')
    }
  }

  const userLibrarySkins = skins.filter((s) => s.source !== 'preset')
  const presetSkins = skins.filter((s) => s.source === 'preset')
  const isSkinActive = Boolean(previewSkin && activeSkinId === previewSkin.id)

  const userLibraryCapes = capes.filter((c) => c.source !== 'preset')
  const presetCapes = capes.filter((c) => c.source === 'preset')
  const isCapeActive = Boolean(previewCape && activeCapeId === previewCape.id)

  return (
    <div className="flex flex-col gap-6 w-full h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shirt className="text-primary" size={22} />
            Skin & Cape Studio
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Preview, customize, and equip 3D Minecraft skins and capes across all instances
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-background-card border border-border-subtle rounded-xl p-1 shadow-md">
          <button
            onClick={() => setActiveTab('skins')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'skins'
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shirt size={14} />
            Skins
          </button>
          <button
            onClick={() => {
              setActiveTab('capes')
              if (!previewCape && capes.length > 0) {
                setPreviewCape(capes[0])
              }
              if (backEquipment === 'none') {
                setBackEquipment('cape')
              }
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'capes'
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield size={14} />
            Capes
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        <div className="lg:col-span-7 flex flex-col bg-background-card border border-border-subtle rounded-2xl overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-background-dark/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">
                {activeTab === 'skins'
                  ? previewSkin?.name || 'No Skin Selected'
                  : previewCape?.name || 'No Cape Selected'}
              </span>
              {activeTab === 'skins' && previewSkin?.author && (
                <span className="text-[11px] text-slate-500 font-mono">by {previewSkin.author}</span>
              )}
              {activeTab === 'skins' && isSkinActive && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Check size={10} /> Active Skin
                </span>
              )}
              {activeTab === 'capes' && isCapeActive && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Check size={10} /> Active Cape
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-background-surface border border-border-subtle rounded-xl p-0.5">
                <button
                  onClick={() => setPreviewModel('classic')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    previewModel === 'classic'
                      ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Classic
                </button>
                <button
                  onClick={() => setPreviewModel('slim')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    previewModel === 'slim'
                      ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Slim
                </button>
              </div>

              <div className="flex items-center gap-1 bg-background-surface border border-border-subtle rounded-xl p-0.5">
                {(['none', 'cape', 'elytra'] as BackEquipmentType[]).map((equip) => (
                  <button
                    key={equip}
                    onClick={() => setBackEquipment(equip)}
                    className={`px-2 py-1 text-xs font-medium rounded-lg capitalize transition-colors ${
                      backEquipment === equip
                        ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {equip}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 relative flex items-center justify-center bg-radial-gradient from-slate-900/60 to-background-card overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 size={32} className="text-primary animate-spin" />
                <span className="text-xs">Loading 3D studio...</span>
              </div>
            ) : previewSkin ? (
              <SkinViewer3D
                skinUrl={previewSkin.textureUrl}
                capeUrl={previewCape?.textureUrl}
                backEquipment={backEquipment}
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
                <span className="text-sm">Select an item to preview</span>
              </div>
            )}

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background-dark/80 backdrop-blur-md border border-border-subtle rounded-2xl p-1.5 shadow-2xl">
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

          <div className="flex items-center justify-between p-4 border-t border-border-subtle bg-background-dark/30">
            <div className="text-xs text-slate-400">
              {activeTab === 'skins' ? (
                previewSkin?.source === 'preset'
                  ? 'Official Minecraft default model'
                  : previewSkin?.source === 'player'
                  ? 'Imported from Minecraft player'
                  : 'Custom skin file'
              ) : (
                previewCape?.source === 'mojang'
                  ? 'Official Mojang account cape'
                  : previewCape?.source === 'preset'
                  ? 'Official Minecon/event preset cape'
                  : previewCape?.source === 'optifine'
                  ? 'OptiFine community cape'
                  : previewCape
                  ? 'Custom cape file'
                  : 'No cape selected'
              )}
            </div>

            <div className="flex items-center gap-3">
              {activeTab === 'skins' ? (
                <>
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
                      variant={isSkinActive ? 'secondary' : 'primary'}
                      size="sm"
                      icon={Check}
                      disabled={isSkinActive}
                      onClick={() => handleApplySkin(previewSkin)}
                    >
                      {isSkinActive ? 'Currently Active' : 'Apply Skin'}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {previewCape && previewCape.source !== 'preset' && previewCape.source !== 'mojang' && (
                    <Button
                      variant="danger"
                      size="sm"
                      icon={Trash2}
                      onClick={() => setCapeToDelete(previewCape)}
                    >
                      Delete Cape
                    </Button>
                  )}

                  {activeCapeId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={X}
                      onClick={() => handleApplyCape(null)}
                    >
                      Unequip Cape
                    </Button>
                  )}

                  {previewCape && (
                    <Button
                      variant={isCapeActive ? 'secondary' : 'primary'}
                      size="sm"
                      icon={Check}
                      disabled={isCapeActive}
                      onClick={() => handleApplyCape(previewCape)}
                    >
                      {isCapeActive ? 'Currently Equipped' : 'Equip Cape'}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-4 min-h-0">
          {activeTab === 'skins' ? (
            <>
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

              <div className="flex-1 bg-background-card border border-border-subtle rounded-2xl flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between border-b border-border-subtle px-4 pt-3 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveSkinSubTab('library')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                        activeSkinSubTab === 'library'
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
                      onClick={() => setActiveSkinSubTab('presets')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                        activeSkinSubTab === 'presets'
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

                  {activeSkinSubTab === 'library' && (
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

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  {activeSkinSubTab === 'library' && (
                    <div className="flex flex-col gap-3">
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

                  {activeSkinSubTab === 'presets' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between px-1 pb-1">
                        <span className="text-xs font-semibold text-slate-300">
                          Official Mojang Characters ({presetSkins.length})
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        {presetSkins.map((skin) => {
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
                                {isActive && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">
                                    ACTIVE
                                  </span>
                                )}
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
            </>
          ) : (
            <>
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 shrink-0 space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Shield size={14} className="text-primary" />
                  OptiFine Cape Lookup
                </h3>

                <form onSubmit={handleSearchOptifine} className="flex gap-2">
                  <input
                    type="text"
                    value={optifineUsername}
                    onChange={(e) => setOptifineUsername(e.target.value)}
                    placeholder="Enter player's OptiFine username..."
                    className="flex-1 bg-background-surface border border-border-subtle focus:border-primary/60 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    icon={isSearchingOptifine ? Loader2 : Search}
                    isLoading={isSearchingOptifine}
                    type="submit"
                  >
                    Search
                  </Button>
                </form>

                {optifineError && (
                  <div className="text-xs text-rose-400 flex items-center gap-1.5 pt-1">
                    <AlertCircle size={13} />
                    <span>{optifineError}</span>
                  </div>
                )}

                {optifineResult && (
                  <div className="p-3 rounded-xl bg-background-surface border border-border-subtle flex items-center justify-between gap-3 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden p-1">
                        <img
                          src={optifineResult.capeUrl}
                          alt={optifineResult.username}
                          className="h-full object-contain pixelated"
                          onError={(e) => {
                            ;(e.target as HTMLElement).style.display = 'none'
                          }}
                        />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{optifineResult.username}</div>
                        <div className="text-[10px] text-primary">OptiFine Cape Found</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Plus}
                        onClick={handleSaveOptifineCape}
                      >
                        Add to Library
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 bg-background-card border border-border-subtle rounded-2xl flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between border-b border-border-subtle px-4 pt-3 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveCapeSubTab('library')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                        activeCapeSubTab === 'library'
                          ? 'bg-primary/20 text-primary border border-primary/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Shield size={13} />
                      My Capes
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10">
                        {userLibraryCapes.length}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveCapeSubTab('presets')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                        activeCapeSubTab === 'presets'
                          ? 'bg-primary/20 text-primary border border-primary/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Sparkles size={13} />
                      Historic Presets
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10">
                        {presetCapes.length}
                      </span>
                    </button>
                  </div>

                  <input
                    ref={fileCapeInputRef}
                    type="file"
                    accept=".png"
                    className="hidden"
                    onChange={handleCapeFileInputChange}
                  />

                  {activeCapeSubTab === 'library' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Upload}
                      onClick={() => fileCapeInputRef.current?.click()}
                      title="Upload .png cape"
                    >
                      Upload
                    </Button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  {activeCapeSubTab === 'library' && (
                    <div className="flex flex-col gap-3">
                      <div
                        onDragOver={(e) => {
                          e.preventDefault()
                          setIsDraggingCapeOver(true)
                        }}
                        onDragLeave={() => setIsDraggingCapeOver(false)}
                        onDrop={handleCapeFileDrop}
                        onClick={() => fileCapeInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                          isDraggingCapeOver
                            ? 'border-primary bg-primary/10 scale-[0.99]'
                            : 'border-border-subtle hover:border-primary/50 bg-background-surface/40'
                        }`}
                      >
                        <Upload size={20} className="mx-auto text-primary mb-1.5" />
                        <div className="text-xs font-semibold text-slate-200">
                          Drop .png cape file here or browse
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Standard 64x32 or 128x64 Minecraft cape format
                        </div>
                      </div>

                      {userLibraryCapes.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-500">
                          No capes in your personal collection yet. Connect your Microsoft account, search OptiFine, or upload custom files.
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                          {userLibraryCapes.map((cape) => {
                            const isSelected = previewCape?.id === cape.id
                            const isActive = activeCapeId === cape.id

                            return (
                              <div
                                key={cape.id}
                                onClick={() => {
                                  setPreviewCape(cape)
                                  if (backEquipment === 'none') {
                                    setBackEquipment('cape')
                                  }
                                }}
                                className={`p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-2 group ${
                                  isSelected
                                    ? 'bg-primary/10 border-primary shadow-md'
                                    : 'bg-background-surface border-border-subtle hover:border-white/20'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-6 h-8 rounded bg-black/40 border border-white/10 shrink-0 overflow-hidden flex items-center justify-center p-0.5">
                                      <img
                                        src={cape.textureUrl}
                                        alt={cape.name}
                                        className="h-full object-contain pixelated"
                                      />
                                    </div>
                                    <span className="text-xs font-semibold text-white truncate">
                                      {cape.name}
                                    </span>
                                  </div>
                                  {isActive && (
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] shrink-0" />
                                  )}
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                  <span className="capitalize text-[10px] px-1.5 py-0.5 rounded bg-white/5 font-mono">
                                    {cape.source}
                                  </span>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleApplyCape(cape)
                                      }}
                                      className="p-1 hover:text-emerald-400"
                                      title="Equip"
                                    >
                                      <Check size={12} />
                                    </button>
                                    {cape.source !== 'mojang' && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setCapeToDelete(cape)
                                        }}
                                        className="p-1 hover:text-rose-400"
                                        title="Delete"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {activeCapeSubTab === 'presets' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between px-1 pb-1">
                        <span className="text-xs font-semibold text-slate-300">
                          Minecon & Mojang Event Capes ({presetCapes.length})
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        {presetCapes.map((cape) => {
                          const isSelected = previewCape?.id === cape.id
                          const isActive = activeCapeId === cape.id

                          return (
                            <div
                              key={cape.id}
                              onClick={() => {
                                setPreviewCape(cape)
                                if (backEquipment === 'none') {
                                  setBackEquipment('cape')
                                }
                              }}
                              className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-2 group ${
                                isSelected
                                  ? 'bg-primary/10 border-primary shadow-md'
                                  : 'bg-background-surface border-border-subtle hover:border-white/20'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-8 rounded bg-black/40 border border-white/10 shrink-0 overflow-hidden flex items-center justify-center p-0.5">
                                    <img
                                      src={cape.textureUrl}
                                      alt={cape.name}
                                      className="h-full object-contain pixelated"
                                    />
                                  </div>
                                  <span className="text-xs font-semibold text-white truncate">
                                    {cape.name}
                                  </span>
                                </div>
                                {isActive && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 shrink-0">
                                    ACTIVE
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="text-slate-400 text-[10px]">Historic</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleApplyCape(cape)
                                  }}
                                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-200 text-[10px] font-medium cursor-pointer"
                                >
                                  Equip
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
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(skinToDelete)}
        title="Delete Custom Skin"
        message={`Are you sure you want to remove "${skinToDelete?.name}" from your skins library?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteSkin}
        onCancel={() => setSkinToDelete(null)}
      />

      <ConfirmModal
        isOpen={Boolean(capeToDelete)}
        title="Delete Custom Cape"
        message={`Are you sure you want to remove "${capeToDelete?.name}" from your capes library?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteCape}
        onCancel={() => setCapeToDelete(null)}
      />
    </div>
  )
}
