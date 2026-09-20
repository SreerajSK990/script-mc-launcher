import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Save,
  RotateCcw,
  Search,
  Check,
  HelpCircle,
  FolderOpen,
  Sliders,
  Volume2,
  Gamepad2,
  Zap,
  Sparkles,
  Loader2,
  Eye,
  Monitor
} from 'lucide-react'
import type {
  GameSettingsPayload,
  VanillaGameOptions,
  SodiumGameOptions,
  OptiFineGameOptions
} from '@shared/types/settings'
import { Button } from '@renderer/components/common/Button'
import { ConfirmModal } from '@renderer/components/common/ConfirmModal'

interface MinecraftSettingsEditorProps {
  instanceId: string
  onOpenFolder?: () => void
}

type CategoryTab = 'all' | 'video' | 'audio' | 'controls' | 'sodium' | 'optifine'

export const MinecraftSettingsEditor: React.FC<MinecraftSettingsEditorProps> = ({
  instanceId,
  onOpenFolder
}) => {
  const [settings, setSettings] = useState<GameSettingsPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false)

  const loadSettings = useCallback(async () => {
    if (!window.launcherAPI?.gameSettings) return
    setIsLoading(true)
    try {
      const data = await window.launcherAPI.gameSettings.get(instanceId)
      setSettings(data)
    } catch (err) {
      console.error('Failed to load game settings:', err)
    } finally {
      setIsLoading(false)
    }
  }, [instanceId])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSave = async () => {
    if (!settings || !window.launcherAPI?.gameSettings) return
    setIsSaving(true)
    try {
      await window.launcherAPI.gameSettings.save(instanceId, settings)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err) {
      console.error('Failed to save game settings:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    setIsResetConfirmOpen(false)
    if (!window.launcherAPI?.gameSettings) return
    setIsLoading(true)
    try {
      const data = await window.launcherAPI.gameSettings.get(instanceId)
      setSettings({
        ...data,
        vanilla: {
          renderDistance: 12,
          simulationDistance: 12,
          maxFps: 120,
          fov: 70,
          graphicsMode: 'fancy',
          enableVsync: false,
          fullscreen: false,
          gamma: 0.5,
          guiScale: 0,
          smoothLighting: true,
          viewBobbing: true,
          entityShadows: true,
          entityDistanceScaling: 1.0,
          particles: 'all',
          renderClouds: 'fancy',
          mipmapLevels: 4,
          attackIndicator: 'crosshair',
          soundCategory_master: 1.0,
          soundCategory_music: 0.5,
          soundCategory_weather: 1.0,
          soundCategory_block: 1.0,
          soundCategory_hostile: 1.0,
          soundCategory_neutral: 1.0,
          soundCategory_player: 1.0,
          soundCategory_ambient: 1.0,
          soundCategory_voice: 1.0,
          showSubtitles: false,
          mouseSensitivity: 0.5,
          invertYMouse: false,
          autoJump: false,
          rawMouseInput: true,
          pauseOnLostFocus: true
        }
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err) {
      console.error('Failed to reset settings:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const updateVanilla = <K extends keyof VanillaGameOptions>(key: K, value: VanillaGameOptions[K]) => {
    setSettings((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        vanilla: {
          ...prev.vanilla,
          [key]: value
        }
      }
    })
  }

  const updateSodium = <K extends keyof SodiumGameOptions>(key: K, value: SodiumGameOptions[K]) => {
    setSettings((prev) => {
      if (!prev) return prev
      const currentSodium = prev.sodium || {
        smooth_lighting: 'HIGH',
        biome_blend: 7,
        entity_distance_scaling: 100,
        entity_shadows: true,
        vignette: true,
        leaves_quality: 'HIGH',
        weather_quality: 'HIGH',
        particle_quality: 'HIGH',
        chunk_builder_threads: 0,
        always_defer_chunk_updates: true,
        use_block_face_culling: true,
        use_fog_occlusion: true,
        use_entity_culling: true,
        use_compact_vertex_format: true,
        animate_only_visible_textures: true,
        cpu_render_ahead_limit: 3,
        allow_direct_memory_access: true
      }
      return {
        ...prev,
        sodium: {
          ...currentSodium,
          [key]: value
        }
      }
    })
  }

  const updateOptiFine = <K extends keyof OptiFineGameOptions>(
    key: K,
    value: OptiFineGameOptions[K]
  ) => {
    setSettings((prev) => {
      if (!prev) return prev
      const currentOptiFine = prev.optifine || {
        ofSmoothFps: false,
        ofSmoothWorld: false,
        ofFastRender: false,
        ofFastMath: false,
        ofDynamicLights: 'off',
        ofDynamicFov: true,
        ofConnectedTextures: 'fancy',
        ofCustomSky: true,
        ofCustomFonts: true,
        ofCustomColors: true,
        ofBetterGrass: 'off',
        ofBetterSnow: false,
        ofClearWater: false,
        ofShowFps: false,
        ofFogType: 'fast'
      }
      return {
        ...prev,
        optifine: {
          ...currentOptiFine,
          [key]: value
        }
      }
    })
  }

  const q = searchQuery.toLowerCase().trim()

  const matchesSearch = (text: string, desc: string) => {
    if (!q) return true
    return text.toLowerCase().includes(q) || desc.toLowerCase().includes(q)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
        <Loader2 size={32} className="animate-spin text-primary" />
        <span className="text-sm font-medium">Loading Minecraft settings...</span>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2 border border-dashed border-border-subtle rounded-2xl">
        <Sliders size={32} className="text-slate-600 mb-1" />
        <p className="text-sm font-medium text-slate-400">Unable to load settings</p>
        <Button variant="secondary" size="sm" onClick={loadSettings}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-background-card border border-border-subtle rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Sliders size={18} className="text-primary" />
            <span>Minecraft Game Settings</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure in-game options, graphics, sound, controls, and mod-specific optimizations before launching
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            icon={FolderOpen}
            onClick={() => window.launcherAPI?.gameSettings.openFile(instanceId, 'options')}
            title="Open options.txt"
          >
            Open File
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={RotateCcw}
            onClick={() => setIsResetConfirmOpen(true)}
          >
            Defaults
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={saveSuccess ? Check : Save}
            isLoading={isSaving}
            onClick={handleSave}
            className={saveSuccess ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
          >
            {saveSuccess ? 'Saved Settings' : 'Save Settings'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeCategory === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-background-card text-slate-400 hover:text-slate-200 border border-border-subtle'
            }`}
          >
            <span>All Settings</span>
          </button>

          <button
            onClick={() => setActiveCategory('video')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeCategory === 'video'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-background-card text-slate-400 hover:text-slate-200 border border-border-subtle'
            }`}
          >
            <Monitor size={14} />
            <span>Video & Graphics</span>
          </button>

          <button
            onClick={() => setActiveCategory('audio')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeCategory === 'audio'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-background-card text-slate-400 hover:text-slate-200 border border-border-subtle'
            }`}
          >
            <Volume2 size={14} />
            <span>Audio & Volumes</span>
          </button>

          <button
            onClick={() => setActiveCategory('controls')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeCategory === 'controls'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-background-card text-slate-400 hover:text-slate-200 border border-border-subtle'
            }`}
          >
            <Gamepad2 size={14} />
            <span>Controls</span>
          </button>

          <button
            onClick={() => setActiveCategory('sodium')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeCategory === 'sodium'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-background-card text-slate-400 hover:text-slate-200 border border-border-subtle'
            }`}
          >
            <Zap size={14} className="text-emerald-400" />
            <span>Sodium</span>
            {settings.isSodiumInstalled && (
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                Detected
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveCategory('optifine')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeCategory === 'optifine'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-background-card text-slate-400 hover:text-slate-200 border border-border-subtle'
            }`}
          >
            <Sparkles size={14} className="text-amber-400" />
            <span>OptiFine</span>
            {settings.isOptiFineInstalled && (
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 font-mono">
                Detected
              </span>
            )}
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search game settings..."
            className="w-full bg-background-card border border-border-subtle focus:border-primary rounded-xl pl-8.5 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {(activeCategory === 'all' || activeCategory === 'video') && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <Monitor size={14} className="text-primary" />
            <span>Video & Display Options</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {matchesSearch('Render Distance', 'View distance in chunks') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">Render Distance</span>
                    <div className="group relative">
                      <HelpCircle size={13} className="text-slate-500 cursor-help" />
                      <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block w-48 p-2 bg-background-darkest border border-border-subtle text-[11px] text-slate-300 rounded-lg shadow-xl z-50">
                        Distance of world chunks loaded and rendered. Lower values boost FPS significantly.
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                    {settings.vanilla.renderDistance} Chunks
                  </span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="32"
                  step="1"
                  value={settings.vanilla.renderDistance}
                  onChange={(e) => updateVanilla('renderDistance', parseInt(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {matchesSearch('Simulation Distance', 'Active entity and ticking distance') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">Simulation Distance</span>
                    <div className="group relative">
                      <HelpCircle size={13} className="text-slate-500 cursor-help" />
                      <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block w-48 p-2 bg-background-darkest border border-border-subtle text-[11px] text-slate-300 rounded-lg shadow-xl z-50">
                        Distance in chunks where mobs, redstone, and crops are actively ticked.
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                    {settings.vanilla.simulationDistance} Chunks
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="32"
                  step="1"
                  value={settings.vanilla.simulationDistance}
                  onChange={(e) => updateVanilla('simulationDistance', parseInt(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {matchesSearch('Max Framerate', 'FPS limit cap or unlimited') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">Max Framerate (FPS)</span>
                    <div className="group relative">
                      <HelpCircle size={13} className="text-slate-500 cursor-help" />
                      <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block w-48 p-2 bg-background-darkest border border-border-subtle text-[11px] text-slate-300 rounded-lg shadow-xl z-50">
                        Maximum allowed frames per second. 260 indicates Unlimited FPS.
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                    {settings.vanilla.maxFps >= 260 ? 'Unlimited' : `${settings.vanilla.maxFps} FPS`}
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="260"
                  step="10"
                  value={settings.vanilla.maxFps}
                  onChange={(e) => updateVanilla('maxFps', parseInt(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {matchesSearch('Field of View', 'FOV angle in degrees') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">Field of View (FOV)</span>
                    <div className="group relative">
                      <HelpCircle size={13} className="text-slate-500 cursor-help" />
                      <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block w-48 p-2 bg-background-darkest border border-border-subtle text-[11px] text-slate-300 rounded-lg shadow-xl z-50">
                        Camera perspective angle. 70 is Normal, 110 is Quake Pro.
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                    {settings.vanilla.fov === 70
                      ? 'Normal (70°)'
                      : settings.vanilla.fov === 110
                        ? 'Quake Pro (110°)'
                        : `${settings.vanilla.fov}°`}
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="110"
                  step="1"
                  value={settings.vanilla.fov}
                  onChange={(e) => updateVanilla('fov', parseInt(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {matchesSearch('Brightness', 'Gamma lighting level') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">Brightness (Gamma)</span>
                    <div className="group relative">
                      <HelpCircle size={13} className="text-slate-500 cursor-help" />
                      <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block w-48 p-2 bg-background-darkest border border-border-subtle text-[11px] text-slate-300 rounded-lg shadow-xl z-50">
                        Visual brightness in dark environments and caves.
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                    {settings.vanilla.gamma <= 0
                      ? 'Moody (0%)'
                      : settings.vanilla.gamma >= 1
                        ? 'Bright (100%)'
                        : `${Math.round(settings.vanilla.gamma * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.vanilla.gamma}
                  onChange={(e) => updateVanilla('gamma', parseFloat(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {matchesSearch('Entity Distance Scaling', 'Distance mobs remain visible') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">Entity Distance Scaling</span>
                    <div className="group relative">
                      <HelpCircle size={13} className="text-slate-500 cursor-help" />
                      <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block w-48 p-2 bg-background-darkest border border-border-subtle text-[11px] text-slate-300 rounded-lg shadow-xl z-50">
                        Adjusts how far away entities and mobs remain rendered.
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                    {Math.round(settings.vanilla.entityDistanceScaling * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.25"
                  value={settings.vanilla.entityDistanceScaling}
                  onChange={(e) => updateVanilla('entityDistanceScaling', parseFloat(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {matchesSearch('Graphics Mode', 'Fast, Fancy or Fabulous graphics') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Graphics Mode</span>
                  <span className="text-[11px] text-slate-400">Controls leaf transparency and weather effects</span>
                </div>
                <select
                  value={settings.vanilla.graphicsMode}
                  onChange={(e) => updateVanilla('graphicsMode', e.target.value as any)}
                  className="bg-background-surface border border-border-subtle text-xs text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-primary font-medium"
                >
                  <option value="fast">Fast</option>
                  <option value="fancy">Fancy</option>
                  <option value="fabulous">Fabulous!</option>
                </select>
              </div>
            )}

            {matchesSearch('Particles', 'Particle density and animations') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Particles</span>
                  <span className="text-[11px] text-slate-400">Controls torch smoke, potion swirls and sparks</span>
                </div>
                <select
                  value={settings.vanilla.particles}
                  onChange={(e) => updateVanilla('particles', e.target.value as any)}
                  className="bg-background-surface border border-border-subtle text-xs text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-primary font-medium"
                >
                  <option value="all">All</option>
                  <option value="decreased">Decreased</option>
                  <option value="minimal">Minimal</option>
                </select>
              </div>
            )}

            {matchesSearch('Render Clouds', 'Cloud display mode') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Render Clouds</span>
                  <span className="text-[11px] text-slate-400">3D fancy clouds or flat fast clouds</span>
                </div>
                <select
                  value={settings.vanilla.renderClouds}
                  onChange={(e) => updateVanilla('renderClouds', e.target.value as any)}
                  className="bg-background-surface border border-border-subtle text-xs text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-primary font-medium"
                >
                  <option value="fancy">Fancy</option>
                  <option value="fast">Fast</option>
                  <option value="off">Off</option>
                </select>
              </div>
            )}

            {matchesSearch('GUI Scale', 'Size of user interface elements') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">GUI Scale</span>
                  <span className="text-[11px] text-slate-400">0 is Automatic based on resolution</span>
                </div>
                <select
                  value={settings.vanilla.guiScale}
                  onChange={(e) => updateVanilla('guiScale', parseInt(e.target.value))}
                  className="bg-background-surface border border-border-subtle text-xs text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-primary font-medium"
                >
                  <option value="0">Auto (0)</option>
                  <option value="1">Small (1)</option>
                  <option value="2">Normal (2)</option>
                  <option value="3">Large (3)</option>
                  <option value="4">Very Large (4)</option>
                </select>
              </div>
            )}

            {matchesSearch('VSync', 'Vertical synchronization with monitor refresh') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">VSync</span>
                  <span className="text-[11px] text-slate-400">Synchronize framerate with display refresh rate</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateVanilla('enableVsync', !settings.vanilla.enableVsync)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.vanilla.enableVsync ? 'bg-primary' : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      settings.vanilla.enableVsync ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Fullscreen', 'Launch game in borderless or exclusive fullscreen') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Fullscreen</span>
                  <span className="text-[11px] text-slate-400">Run game in full screen mode</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateVanilla('fullscreen', !settings.vanilla.fullscreen)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.vanilla.fullscreen ? 'bg-primary' : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      settings.vanilla.fullscreen ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Smooth Lighting', 'Gradual shadow gradients across blocks') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Smooth Lighting</span>
                  <span className="text-[11px] text-slate-400">Enable realistic illumination and shadows</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateVanilla('smoothLighting', !settings.vanilla.smoothLighting)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.vanilla.smoothLighting ? 'bg-primary' : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      settings.vanilla.smoothLighting ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Entity Shadows', 'Render shadows beneath mobs and players') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Entity Shadows</span>
                  <span className="text-[11px] text-slate-400">Renders circular ground shadows below mobs</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateVanilla('entityShadows', !settings.vanilla.entityShadows)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.vanilla.entityShadows ? 'bg-primary' : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      settings.vanilla.entityShadows ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('View Bobbing', 'Head bobbing animation while walking') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">View Bobbing</span>
                  <span className="text-[11px] text-slate-400">Walking motion view oscillation</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateVanilla('viewBobbing', !settings.vanilla.viewBobbing)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.vanilla.viewBobbing ? 'bg-primary' : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      settings.vanilla.viewBobbing ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {(activeCategory === 'all' || activeCategory === 'audio') && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <Volume2 size={14} className="text-primary" />
            <span>Audio & Sound Levels</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[
              { key: 'soundCategory_master', label: 'Master Volume', desc: 'Overall game audio volume' },
              { key: 'soundCategory_music', label: 'Music', desc: 'In-game soundtrack and jukeboxes' },
              { key: 'soundCategory_weather', label: 'Weather', desc: 'Rain, wind, and thunder' },
              { key: 'soundCategory_block', label: 'Blocks', desc: 'Breaking, placing, and stepping sounds' },
              { key: 'soundCategory_hostile', label: 'Hostile Creatures', desc: 'Zombies, skeletons, creepers' },
              { key: 'soundCategory_neutral', label: 'Friendly Creatures', desc: 'Cows, pigs, villagers, sheep' },
              { key: 'soundCategory_player', label: 'Players', desc: 'Footsteps, eating, and player combat' },
              { key: 'soundCategory_ambient', label: 'Ambient / Environment', desc: 'Cave sounds and biome ambiance' },
              { key: 'soundCategory_voice', label: 'Voice / Speech', desc: 'Voice chat and narrator speech' }
            ].map((snd) => {
              const k = snd.key as keyof VanillaGameOptions
              if (!matchesSearch(snd.label, snd.desc)) return null
              const val = (settings.vanilla[k] as number) || 0
              return (
                <div key={snd.key} className="bg-background-card border border-border-subtle rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">{snd.label}</span>
                      <span className="text-[11px] text-slate-400">{snd.desc}</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                      {Math.round(val * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={val}
                    onChange={(e) => updateVanilla(k, parseFloat(e.target.value) as any)}
                    className="w-full accent-primary h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              )
            })}

            {matchesSearch('Show Subtitles', 'Directional visual audio subtitles') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Show Subtitles</span>
                  <span className="text-[11px] text-slate-400">Directional captions for all game sounds</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateVanilla('showSubtitles', !settings.vanilla.showSubtitles)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.vanilla.showSubtitles ? 'bg-primary' : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      settings.vanilla.showSubtitles ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {(activeCategory === 'all' || activeCategory === 'controls') && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <Gamepad2 size={14} className="text-primary" />
            <span>Controls & Gameplay Options</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {matchesSearch('Mouse Sensitivity', 'Look speed and aiming speed') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Mouse Sensitivity</span>
                    <span className="text-[11px] text-slate-400">Aim and camera turning speed</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                    {Math.round(settings.vanilla.mouseSensitivity * 200)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.02"
                  value={settings.vanilla.mouseSensitivity}
                  onChange={(e) => updateVanilla('mouseSensitivity', parseFloat(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {matchesSearch('Auto-Jump', 'Automatically jump up step blocks') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Auto-Jump</span>
                  <span className="text-[11px] text-slate-400">Step up 1-block obstacles automatically</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateVanilla('autoJump', !settings.vanilla.autoJump)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.vanilla.autoJump ? 'bg-primary' : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      settings.vanilla.autoJump ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Invert Mouse Y', 'Invert vertical look direction') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Invert Mouse (Y Axis)</span>
                  <span className="text-[11px] text-slate-400">Moving mouse up looks down</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateVanilla('invertYMouse', !settings.vanilla.invertYMouse)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.vanilla.invertYMouse ? 'bg-primary' : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      settings.vanilla.invertYMouse ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Raw Mouse Input', 'Direct hardware mouse polling') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Raw Mouse Input</span>
                  <span className="text-[11px] text-slate-400">Bypasses OS pointer acceleration</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateVanilla('rawMouseInput', !settings.vanilla.rawMouseInput)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.vanilla.rawMouseInput ? 'bg-primary' : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      settings.vanilla.rawMouseInput ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Pause on Lost Focus', 'Pause singleplayer when alt-tabbed') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Pause on Lost Focus</span>
                  <span className="text-[11px] text-slate-400">Pauses game when window is not focused</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateVanilla('pauseOnLostFocus', !settings.vanilla.pauseOnLostFocus)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.vanilla.pauseOnLostFocus ? 'bg-primary' : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      settings.vanilla.pauseOnLostFocus ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {(activeCategory === 'all' || activeCategory === 'sodium') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
              <Zap size={14} />
              <span>Sodium Optimization Options</span>
            </div>
            {settings.isSodiumInstalled ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                Sodium Mod Installed
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-border-subtle text-slate-400">
                Pre-configure for Sodium
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {matchesSearch('Block Face Culling', 'Skip hidden geometry inside blocks') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Block Face Culling</span>
                  <span className="text-[11px] text-slate-400">Skips rendering hidden block faces</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateSodium(
                      'use_block_face_culling',
                      !(settings.sodium?.use_block_face_culling ?? true)
                    )
                  }
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    (settings.sodium?.use_block_face_culling ?? true)
                      ? 'bg-emerald-500'
                      : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      (settings.sodium?.use_block_face_culling ?? true) ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Entity Culling', 'Skip entities outside camera frustum') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Entity Culling</span>
                  <span className="text-[11px] text-slate-400">Skips rendering occluded entities behind walls</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateSodium(
                      'use_entity_culling',
                      !(settings.sodium?.use_entity_culling ?? true)
                    )
                  }
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    (settings.sodium?.use_entity_culling ?? true)
                      ? 'bg-emerald-500'
                      : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      (settings.sodium?.use_entity_culling ?? true) ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Fog Occlusion', 'Occlude chunks concealed by dense fog') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Fog Occlusion</span>
                  <span className="text-[11px] text-slate-400">Prevents rendering chunks hidden behind fog</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateSodium('use_fog_occlusion', !(settings.sodium?.use_fog_occlusion ?? true))
                  }
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    (settings.sodium?.use_fog_occlusion ?? true)
                      ? 'bg-emerald-500'
                      : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      (settings.sodium?.use_fog_occlusion ?? true) ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Compact Vertex Format', 'Compress vertex data in VRAM') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Compact Vertex Format</span>
                  <span className="text-[11px] text-slate-400">Reduces GPU VRAM bandwidth usage</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateSodium(
                      'use_compact_vertex_format',
                      !(settings.sodium?.use_compact_vertex_format ?? true)
                    )
                  }
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    (settings.sodium?.use_compact_vertex_format ?? true)
                      ? 'bg-emerald-500'
                      : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      (settings.sodium?.use_compact_vertex_format ?? true) ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Chunk Builder Threads', 'Parallel threads for chunk meshing') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Chunk Builder Threads</span>
                    <span className="text-[11px] text-slate-400">0 for automatic thread allocation</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                    {(settings.sodium?.chunk_builder_threads ?? 0) === 0
                      ? 'Auto (0)'
                      : `${settings.sodium?.chunk_builder_threads} Threads`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="8"
                  step="1"
                  value={settings.sodium?.chunk_builder_threads ?? 0}
                  onChange={(e) => updateSodium('chunk_builder_threads', parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {matchesSearch('CPU Render Ahead Limit', 'Max frames CPU can prepare ahead') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">CPU Render Ahead Limit</span>
                    <span className="text-[11px] text-slate-400">Lower values reduce input latency</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                    {settings.sodium?.cpu_render_ahead_limit ?? 3} Frames
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="9"
                  step="1"
                  value={settings.sodium?.cpu_render_ahead_limit ?? 3}
                  onChange={(e) => updateSodium('cpu_render_ahead_limit', parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {(activeCategory === 'all' || activeCategory === 'optifine') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <Sparkles size={14} />
              <span>OptiFine Options</span>
            </div>
            {settings.isOptiFineInstalled ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                OptiFine Mod Installed
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-border-subtle text-slate-400">
                Pre-configure for OptiFine
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {matchesSearch('Smooth FPS', 'Stabilize framerate spikes') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Smooth FPS</span>
                  <span className="text-[11px] text-slate-400">Stabilizes framerate by flushing graphics driver</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateOptiFine('ofSmoothFps', !(settings.optifine?.ofSmoothFps ?? false))
                  }
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    (settings.optifine?.ofSmoothFps ?? false)
                      ? 'bg-amber-500'
                      : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      (settings.optifine?.ofSmoothFps ?? false) ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Fast Render', 'Optimized rendering algorithm') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Fast Render</span>
                  <span className="text-[11px] text-slate-400">Optimized rendering pipeline for GPU performance</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateOptiFine('ofFastRender', !(settings.optifine?.ofFastRender ?? false))
                  }
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    (settings.optifine?.ofFastRender ?? false)
                      ? 'bg-amber-500'
                      : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      (settings.optifine?.ofFastRender ?? false) ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Fast Math', 'Optimized trigonometric math functions') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Fast Math</span>
                  <span className="text-[11px] text-slate-400">Uses fast lookup tables for sin and cos</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateOptiFine('ofFastMath', !(settings.optifine?.ofFastMath ?? false))
                  }
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    (settings.optifine?.ofFastMath ?? false)
                      ? 'bg-amber-500'
                      : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      (settings.optifine?.ofFastMath ?? false) ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {matchesSearch('Dynamic Lights', 'Held torches and items emit real-time light') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Dynamic Lights</span>
                  <span className="text-[11px] text-slate-400">Torches and glowstone emit light when held</span>
                </div>
                <select
                  value={settings.optifine?.ofDynamicLights || 'off'}
                  onChange={(e) => updateOptiFine('ofDynamicLights', e.target.value as any)}
                  className="bg-background-surface border border-border-subtle text-xs text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-primary font-medium"
                >
                  <option value="off">Off</option>
                  <option value="fast">Fast</option>
                  <option value="fancy">Fancy</option>
                </select>
              </div>
            )}

            {matchesSearch('Connected Textures', 'Seamless glass and connected block textures') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Connected Textures</span>
                  <span className="text-[11px] text-slate-400">Connects glass, sandstone, and bookshelves</span>
                </div>
                <select
                  value={settings.optifine?.ofConnectedTextures || 'fancy'}
                  onChange={(e) => updateOptiFine('ofConnectedTextures', e.target.value as any)}
                  className="bg-background-surface border border-border-subtle text-xs text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-primary font-medium"
                >
                  <option value="off">Off</option>
                  <option value="fast">Fast</option>
                  <option value="fancy">Fancy</option>
                </select>
              </div>
            )}

            {matchesSearch('Custom Sky', 'Custom skybox textures from resource packs') && (
              <div className="bg-background-card border border-border-subtle rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Custom Sky</span>
                  <span className="text-[11px] text-slate-400">Enables custom resource pack sky textures</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateOptiFine('ofCustomSky', !(settings.optifine?.ofCustomSky ?? true))
                  }
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    (settings.optifine?.ofCustomSky ?? true)
                      ? 'bg-amber-500'
                      : 'bg-slate-800 border border-border-subtle'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      (settings.optifine?.ofCustomSky ?? true) ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isResetConfirmOpen}
        title="Reset Game Settings"
        message="Are you sure you want to reset all Minecraft game settings to their default recommended values? This will update options.txt."
        confirmLabel="Reset to Defaults"
        variant="warning"
        onConfirm={handleReset}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </div>
  )
}
