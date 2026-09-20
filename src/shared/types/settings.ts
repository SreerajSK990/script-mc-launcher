export interface VanillaGameOptions {
  renderDistance: number
  simulationDistance: number
  maxFps: number
  fov: number
  graphicsMode: 'fast' | 'fancy' | 'fabulous'
  enableVsync: boolean
  fullscreen: boolean
  gamma: number
  guiScale: number
  smoothLighting: boolean
  viewBobbing: boolean
  entityShadows: boolean
  entityDistanceScaling: number
  particles: 'all' | 'decreased' | 'minimal'
  renderClouds: 'off' | 'fast' | 'fancy'
  mipmapLevels: number
  attackIndicator: 'crosshair' | 'hotbar' | 'off'

  soundCategory_master: number
  soundCategory_music: number
  soundCategory_weather: number
  soundCategory_block: number
  soundCategory_hostile: number
  soundCategory_neutral: number
  soundCategory_player: number
  soundCategory_ambient: number
  soundCategory_voice: number
  showSubtitles: boolean

  mouseSensitivity: number
  invertYMouse: boolean
  autoJump: boolean
  rawMouseInput: boolean
  pauseOnLostFocus: boolean
}

export interface SodiumGameOptions {
  smooth_lighting: 'OFF' | 'LOW' | 'HIGH'
  biome_blend: number
  entity_distance_scaling: number
  entity_shadows: boolean
  vignette: boolean
  leaves_quality: 'DEFAULT' | 'LOW' | 'MEDIUM' | 'HIGH'
  weather_quality: 'DEFAULT' | 'LOW' | 'MEDIUM' | 'HIGH'
  particle_quality: 'LOW' | 'MEDIUM' | 'HIGH'

  chunk_builder_threads: number
  always_defer_chunk_updates: boolean
  use_block_face_culling: boolean
  use_fog_occlusion: boolean
  use_entity_culling: boolean
  use_compact_vertex_format: boolean
  animate_only_visible_textures: boolean

  cpu_render_ahead_limit: number
  allow_direct_memory_access: boolean
}

export interface OptiFineGameOptions {
  ofSmoothFps: boolean
  ofSmoothWorld: boolean
  ofFastRender: boolean
  ofFastMath: boolean
  ofDynamicLights: 'off' | 'fast' | 'fancy'
  ofDynamicFov: boolean
  ofConnectedTextures: 'off' | 'fast' | 'fancy'
  ofCustomSky: boolean
  ofCustomFonts: boolean
  ofCustomColors: boolean
  ofBetterGrass: 'off' | 'fast' | 'fancy'
  ofBetterSnow: boolean
  ofClearWater: boolean
  ofShowFps: boolean
  ofFogType: 'off' | 'fast' | 'fancy'
}

export interface GameSettingsPayload {
  vanilla: VanillaGameOptions
  sodium?: SodiumGameOptions
  optifine?: OptiFineGameOptions
  hasOptionsTxt: boolean
  isSodiumInstalled: boolean
  isOptiFineInstalled: boolean
}
