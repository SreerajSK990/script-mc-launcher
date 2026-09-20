import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import type {
  VanillaGameOptions,
  SodiumGameOptions,
  OptiFineGameOptions,
  GameSettingsPayload
} from '@shared/types/settings'
import { getInstanceMinecraftPath } from '@main/services/paths'
import { ensureDirectoryExists, doesPathExist } from '@main/utils/filesystem'

export const DEFAULT_VANILLA_OPTIONS: VanillaGameOptions = {
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

export const DEFAULT_SODIUM_OPTIONS: SodiumGameOptions = {
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

export const DEFAULT_OPTIFINE_OPTIONS: OptiFineGameOptions = {
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

function parseFov(raw: string): number {
  const val = parseFloat(raw)
  if (isNaN(val)) return 70
  if (val <= 1.0 && val >= 0.0) {
    return Math.round(70 + val * 40)
  }
  return Math.min(110, Math.max(30, Math.round(val)))
}

function parseBool(raw: string, fallback = false): boolean {
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return fallback
}

function parseNumber(raw: string, fallback: number): number {
  const parsed = parseFloat(raw)
  return isNaN(parsed) ? fallback : parsed
}

export async function readGameSettings(instanceId: string): Promise<GameSettingsPayload> {
  const mcPath = getInstanceMinecraftPath(instanceId)
  await ensureDirectoryExists(mcPath)

  const optionsPath = join(mcPath, 'options.txt')
  const optifinePath = join(mcPath, 'optionsof.txt')
  const sodiumConfigPath = join(mcPath, 'config', 'sodium-options.json')
  const sodiumRootPath = join(mcPath, 'sodium-options.json')
  const modsPath = join(mcPath, 'mods')

  let hasOptionsTxt = false
  let isSodiumInstalled = false
  let isOptiFineInstalled = false

  if (await doesPathExist(modsPath)) {
    try {
      const files = await fs.readdir(modsPath)
      for (const file of files) {
        const lower = file.toLowerCase()
        if (lower.includes('sodium') || lower.includes('rubidium') || lower.includes('embeddium')) {
          isSodiumInstalled = true
        }
        if (lower.includes('optifine')) {
          isOptiFineInstalled = true
        }
      }
    } catch {}
  }

  const vanilla: VanillaGameOptions = { ...DEFAULT_VANILLA_OPTIONS }

  if (await doesPathExist(optionsPath)) {
    hasOptionsTxt = true
    try {
      const content = await fs.readFile(optionsPath, 'utf8')
      const lines = content.split(/\r?\n/)
      for (const line of lines) {
        const idx = line.indexOf(':')
        if (idx === -1) continue
        const key = line.slice(0, idx).trim()
        const val = line.slice(idx + 1).trim()

        switch (key) {
          case 'renderDistance':
            vanilla.renderDistance = parseNumber(val, vanilla.renderDistance)
            break
          case 'simulationDistance':
            vanilla.simulationDistance = parseNumber(val, vanilla.simulationDistance)
            break
          case 'maxFps':
            vanilla.maxFps = parseNumber(val, vanilla.maxFps)
            break
          case 'fov':
            vanilla.fov = parseFov(val)
            break
          case 'graphicsMode':
            if (val === 'fast' || val === 'fancy' || val === 'fabulous') {
              vanilla.graphicsMode = val
            }
            break
          case 'enableVsync':
            vanilla.enableVsync = parseBool(val, vanilla.enableVsync)
            break
          case 'fullscreen':
            vanilla.fullscreen = parseBool(val, vanilla.fullscreen)
            break
          case 'gamma':
            vanilla.gamma = parseNumber(val, vanilla.gamma)
            break
          case 'guiScale':
            vanilla.guiScale = parseNumber(val, vanilla.guiScale)
            break
          case 'smoothLighting':
            vanilla.smoothLighting = parseBool(val, vanilla.smoothLighting)
            break
          case 'viewBobbing':
            vanilla.viewBobbing = parseBool(val, vanilla.viewBobbing)
            break
          case 'entityShadows':
            vanilla.entityShadows = parseBool(val, vanilla.entityShadows)
            break
          case 'entityDistanceScaling':
            vanilla.entityDistanceScaling = parseNumber(val, vanilla.entityDistanceScaling)
            break
          case 'particles':
            if (val === 'all' || val === 'decreased' || val === 'minimal') {
              vanilla.particles = val
            }
            break
          case 'renderClouds':
            if (val === 'false' || val === 'off') vanilla.renderClouds = 'off'
            else if (val === 'fast') vanilla.renderClouds = 'fast'
            else vanilla.renderClouds = 'fancy'
            break
          case 'mipmapLevels':
            vanilla.mipmapLevels = parseNumber(val, vanilla.mipmapLevels)
            break
          case 'attackIndicator':
            if (val === 'crosshair' || val === 'hotbar' || val === 'off') {
              vanilla.attackIndicator = val
            }
            break
          case 'soundCategory_master':
            vanilla.soundCategory_master = parseNumber(val, vanilla.soundCategory_master)
            break
          case 'soundCategory_music':
            vanilla.soundCategory_music = parseNumber(val, vanilla.soundCategory_music)
            break
          case 'soundCategory_weather':
            vanilla.soundCategory_weather = parseNumber(val, vanilla.soundCategory_weather)
            break
          case 'soundCategory_block':
            vanilla.soundCategory_block = parseNumber(val, vanilla.soundCategory_block)
            break
          case 'soundCategory_hostile':
            vanilla.soundCategory_hostile = parseNumber(val, vanilla.soundCategory_hostile)
            break
          case 'soundCategory_neutral':
            vanilla.soundCategory_neutral = parseNumber(val, vanilla.soundCategory_neutral)
            break
          case 'soundCategory_player':
            vanilla.soundCategory_player = parseNumber(val, vanilla.soundCategory_player)
            break
          case 'soundCategory_ambient':
            vanilla.soundCategory_ambient = parseNumber(val, vanilla.soundCategory_ambient)
            break
          case 'soundCategory_voice':
            vanilla.soundCategory_voice = parseNumber(val, vanilla.soundCategory_voice)
            break
          case 'showSubtitles':
            vanilla.showSubtitles = parseBool(val, vanilla.showSubtitles)
            break
          case 'mouseSensitivity':
            vanilla.mouseSensitivity = parseNumber(val, vanilla.mouseSensitivity)
            break
          case 'invertYMouse':
            vanilla.invertYMouse = parseBool(val, vanilla.invertYMouse)
            break
          case 'autoJump':
            vanilla.autoJump = parseBool(val, vanilla.autoJump)
            break
          case 'rawMouseInput':
            vanilla.rawMouseInput = parseBool(val, vanilla.rawMouseInput)
            break
          case 'pauseOnLostFocus':
            vanilla.pauseOnLostFocus = parseBool(val, vanilla.pauseOnLostFocus)
            break
        }
      }
    } catch {}
  }

  let sodium: SodiumGameOptions | undefined
  const actualSodiumPath = (await doesPathExist(sodiumConfigPath))
    ? sodiumConfigPath
    : (await doesPathExist(sodiumRootPath))
      ? sodiumRootPath
      : null

  if (actualSodiumPath) {
    isSodiumInstalled = true
    try {
      const rawJson = await fs.readFile(actualSodiumPath, 'utf8')
      const parsed = JSON.parse(rawJson)
      sodium = {
        ...DEFAULT_SODIUM_OPTIONS,
        smooth_lighting: parsed.quality?.smooth_lighting || DEFAULT_SODIUM_OPTIONS.smooth_lighting,
        biome_blend: parsed.quality?.biome_blend ?? DEFAULT_SODIUM_OPTIONS.biome_blend,
        entity_distance_scaling:
          parsed.quality?.entity_distance_scaling ?? DEFAULT_SODIUM_OPTIONS.entity_distance_scaling,
        entity_shadows: parsed.quality?.entity_shadows ?? DEFAULT_SODIUM_OPTIONS.entity_shadows,
        vignette: parsed.quality?.vignette ?? DEFAULT_SODIUM_OPTIONS.vignette,
        leaves_quality: parsed.quality?.leaves_quality || DEFAULT_SODIUM_OPTIONS.leaves_quality,
        weather_quality: parsed.quality?.weather_quality || DEFAULT_SODIUM_OPTIONS.weather_quality,
        particle_quality: parsed.quality?.particle_quality || DEFAULT_SODIUM_OPTIONS.particle_quality,

        chunk_builder_threads:
          parsed.performance?.chunk_builder_threads ?? DEFAULT_SODIUM_OPTIONS.chunk_builder_threads,
        always_defer_chunk_updates:
          parsed.performance?.always_defer_chunk_updates ??
          DEFAULT_SODIUM_OPTIONS.always_defer_chunk_updates,
        use_block_face_culling:
          parsed.performance?.use_block_face_culling ?? DEFAULT_SODIUM_OPTIONS.use_block_face_culling,
        use_fog_occlusion:
          parsed.performance?.use_fog_occlusion ?? DEFAULT_SODIUM_OPTIONS.use_fog_occlusion,
        use_entity_culling:
          parsed.performance?.use_entity_culling ?? DEFAULT_SODIUM_OPTIONS.use_entity_culling,
        use_compact_vertex_format:
          parsed.performance?.use_compact_vertex_format ??
          DEFAULT_SODIUM_OPTIONS.use_compact_vertex_format,
        animate_only_visible_textures:
          parsed.performance?.animate_only_visible_textures ??
          DEFAULT_SODIUM_OPTIONS.animate_only_visible_textures,

        cpu_render_ahead_limit:
          parsed.advanced?.cpu_render_ahead_limit ?? DEFAULT_SODIUM_OPTIONS.cpu_render_ahead_limit,
        allow_direct_memory_access:
          parsed.advanced?.allow_direct_memory_access ??
          DEFAULT_SODIUM_OPTIONS.allow_direct_memory_access
      }
    } catch {}
  } else if (isSodiumInstalled) {
    sodium = { ...DEFAULT_SODIUM_OPTIONS }
  }

  let optifine: OptiFineGameOptions | undefined
  if (await doesPathExist(optifinePath)) {
    isOptiFineInstalled = true
    try {
      const content = await fs.readFile(optifinePath, 'utf8')
      const lines = content.split(/\r?\n/)
      optifine = { ...DEFAULT_OPTIFINE_OPTIONS }
      for (const line of lines) {
        const idx = line.indexOf(':')
        if (idx === -1) continue
        const key = line.slice(0, idx).trim()
        const val = line.slice(idx + 1).trim()

        switch (key) {
          case 'ofSmoothFps':
            optifine.ofSmoothFps = parseBool(val, optifine.ofSmoothFps)
            break
          case 'ofSmoothWorld':
            optifine.ofSmoothWorld = parseBool(val, optifine.ofSmoothWorld)
            break
          case 'ofFastRender':
            optifine.ofFastRender = parseBool(val, optifine.ofFastRender)
            break
          case 'ofFastMath':
            optifine.ofFastMath = parseBool(val, optifine.ofFastMath)
            break
          case 'ofDynamicLights':
            optifine.ofDynamicLights = val === '3' ? 'fancy' : val === '2' ? 'fast' : 'off'
            break
          case 'ofDynamicFov':
            optifine.ofDynamicFov = parseBool(val, optifine.ofDynamicFov)
            break
          case 'ofConnectedTextures':
            optifine.ofConnectedTextures = val === '3' ? 'fancy' : val === '2' ? 'fast' : 'off'
            break
          case 'ofCustomSky':
            optifine.ofCustomSky = parseBool(val, optifine.ofCustomSky)
            break
          case 'ofCustomFonts':
            optifine.ofCustomFonts = parseBool(val, optifine.ofCustomFonts)
            break
          case 'ofCustomColors':
            optifine.ofCustomColors = parseBool(val, optifine.ofCustomColors)
            break
          case 'ofBetterGrass':
            optifine.ofBetterGrass = val === '3' ? 'fancy' : val === '2' ? 'fast' : 'off'
            break
          case 'ofBetterSnow':
            optifine.ofBetterSnow = parseBool(val, optifine.ofBetterSnow)
            break
          case 'ofClearWater':
            optifine.ofClearWater = parseBool(val, optifine.ofClearWater)
            break
          case 'ofShowFps':
            optifine.ofShowFps = parseBool(val, optifine.ofShowFps)
            break
          case 'ofFogType':
            optifine.ofFogType = val === '2' ? 'fancy' : val === '1' ? 'fast' : 'off'
            break
        }
      }
    } catch {}
  } else if (isOptiFineInstalled) {
    optifine = { ...DEFAULT_OPTIFINE_OPTIONS }
  }

  return {
    vanilla,
    sodium,
    optifine,
    hasOptionsTxt,
    isSodiumInstalled,
    isOptiFineInstalled
  }
}

export async function saveGameSettings(
  instanceId: string,
  payload: GameSettingsPayload
): Promise<boolean> {
  const mcPath = getInstanceMinecraftPath(instanceId)
  await ensureDirectoryExists(mcPath)

  const optionsPath = join(mcPath, 'options.txt')

  const managedKeys: Record<string, string> = {
    renderDistance: String(payload.vanilla.renderDistance),
    simulationDistance: String(payload.vanilla.simulationDistance),
    maxFps: String(payload.vanilla.maxFps),
    fov: String(payload.vanilla.fov.toFixed(1)),
    graphicsMode: payload.vanilla.graphicsMode,
    enableVsync: String(payload.vanilla.enableVsync),
    fullscreen: String(payload.vanilla.fullscreen),
    gamma: String(payload.vanilla.gamma.toFixed(2)),
    guiScale: String(payload.vanilla.guiScale),
    smoothLighting: String(payload.vanilla.smoothLighting),
    viewBobbing: String(payload.vanilla.viewBobbing),
    entityShadows: String(payload.vanilla.entityShadows),
    entityDistanceScaling: String(payload.vanilla.entityDistanceScaling.toFixed(2)),
    particles: payload.vanilla.particles,
    renderClouds: payload.vanilla.renderClouds,
    mipmapLevels: String(payload.vanilla.mipmapLevels),
    attackIndicator: payload.vanilla.attackIndicator,

    soundCategory_master: String(payload.vanilla.soundCategory_master.toFixed(2)),
    soundCategory_music: String(payload.vanilla.soundCategory_music.toFixed(2)),
    soundCategory_weather: String(payload.vanilla.soundCategory_weather.toFixed(2)),
    soundCategory_block: String(payload.vanilla.soundCategory_block.toFixed(2)),
    soundCategory_hostile: String(payload.vanilla.soundCategory_hostile.toFixed(2)),
    soundCategory_neutral: String(payload.vanilla.soundCategory_neutral.toFixed(2)),
    soundCategory_player: String(payload.vanilla.soundCategory_player.toFixed(2)),
    soundCategory_ambient: String(payload.vanilla.soundCategory_ambient.toFixed(2)),
    soundCategory_voice: String(payload.vanilla.soundCategory_voice.toFixed(2)),
    showSubtitles: String(payload.vanilla.showSubtitles),

    mouseSensitivity: String(payload.vanilla.mouseSensitivity.toFixed(2)),
    invertYMouse: String(payload.vanilla.invertYMouse),
    autoJump: String(payload.vanilla.autoJump),
    rawMouseInput: String(payload.vanilla.rawMouseInput),
    pauseOnLostFocus: String(payload.vanilla.pauseOnLostFocus)
  }

  const writtenKeys = new Set<string>()
  let newOptionsLines: string[] = []

  if (await doesPathExist(optionsPath)) {
    try {
      const existing = await fs.readFile(optionsPath, 'utf8')
      const lines = existing.split(/\r?\n/)
      for (const line of lines) {
        const idx = line.indexOf(':')
        if (idx === -1) {
          if (line.trim().length > 0) newOptionsLines.push(line)
          continue
        }
        const key = line.slice(0, idx).trim()
        if (key in managedKeys) {
          newOptionsLines.push(`${key}:${managedKeys[key]}`)
          writtenKeys.add(key)
        } else {
          newOptionsLines.push(line)
        }
      }
    } catch {
      newOptionsLines = []
    }
  }

  for (const [key, val] of Object.entries(managedKeys)) {
    if (!writtenKeys.has(key)) {
      newOptionsLines.push(`${key}:${val}`)
    }
  }

  await fs.writeFile(optionsPath, newOptionsLines.join('\n'), 'utf8')

  if (payload.sodium) {
    const configDir = join(mcPath, 'config')
    await ensureDirectoryExists(configDir)
    const targetSodiumPath = join(configDir, 'sodium-options.json')

    let existingSodiumJson: any = {}
    if (await doesPathExist(targetSodiumPath)) {
      try {
        existingSodiumJson = JSON.parse(await fs.readFile(targetSodiumPath, 'utf8'))
      } catch {}
    }

    const mergedSodiumJson = {
      ...existingSodiumJson,
      quality: {
        ...(existingSodiumJson.quality || {}),
        smooth_lighting: payload.sodium.smooth_lighting,
        biome_blend: payload.sodium.biome_blend,
        entity_distance_scaling: payload.sodium.entity_distance_scaling,
        entity_shadows: payload.sodium.entity_shadows,
        vignette: payload.sodium.vignette,
        leaves_quality: payload.sodium.leaves_quality,
        weather_quality: payload.sodium.weather_quality,
        particle_quality: payload.sodium.particle_quality
      },
      performance: {
        ...(existingSodiumJson.performance || {}),
        chunk_builder_threads: payload.sodium.chunk_builder_threads,
        always_defer_chunk_updates: payload.sodium.always_defer_chunk_updates,
        use_block_face_culling: payload.sodium.use_block_face_culling,
        use_fog_occlusion: payload.sodium.use_fog_occlusion,
        use_entity_culling: payload.sodium.use_entity_culling,
        use_compact_vertex_format: payload.sodium.use_compact_vertex_format,
        animate_only_visible_textures: payload.sodium.animate_only_visible_textures
      },
      advanced: {
        ...(existingSodiumJson.advanced || {}),
        cpu_render_ahead_limit: payload.sodium.cpu_render_ahead_limit,
        allow_direct_memory_access: payload.sodium.allow_direct_memory_access
      }
    }

    await fs.writeFile(targetSodiumPath, JSON.stringify(mergedSodiumJson, null, 2), 'utf8')
  }

  if (payload.optifine) {
    const optifinePath = join(mcPath, 'optionsof.txt')
    const ofManaged: Record<string, string> = {
      ofSmoothFps: String(payload.optifine.ofSmoothFps),
      ofSmoothWorld: String(payload.optifine.ofSmoothWorld),
      ofFastRender: String(payload.optifine.ofFastRender),
      ofFastMath: String(payload.optifine.ofFastMath),
      ofDynamicLights:
        payload.optifine.ofDynamicLights === 'fancy'
          ? '3'
          : payload.optifine.ofDynamicLights === 'fast'
            ? '2'
            : '1',
      ofDynamicFov: String(payload.optifine.ofDynamicFov),
      ofConnectedTextures:
        payload.optifine.ofConnectedTextures === 'fancy'
          ? '3'
          : payload.optifine.ofConnectedTextures === 'fast'
            ? '2'
            : '1',
      ofCustomSky: String(payload.optifine.ofCustomSky),
      ofCustomFonts: String(payload.optifine.ofCustomFonts),
      ofCustomColors: String(payload.optifine.ofCustomColors),
      ofBetterGrass:
        payload.optifine.ofBetterGrass === 'fancy'
          ? '3'
          : payload.optifine.ofBetterGrass === 'fast'
            ? '2'
            : '1',
      ofBetterSnow: String(payload.optifine.ofBetterSnow),
      ofClearWater: String(payload.optifine.ofClearWater),
      ofShowFps: String(payload.optifine.ofShowFps),
      ofFogType:
        payload.optifine.ofFogType === 'fancy'
          ? '2'
          : payload.optifine.ofFogType === 'fast'
            ? '1'
            : '3'
    }

    const ofWritten = new Set<string>()
    let ofLines: string[] = []

    if (await doesPathExist(optifinePath)) {
      try {
        const existing = await fs.readFile(optifinePath, 'utf8')
        for (const line of existing.split(/\r?\n/)) {
          const idx = line.indexOf(':')
          if (idx === -1) {
            if (line.trim().length > 0) ofLines.push(line)
            continue
          }
          const key = line.slice(0, idx).trim()
          if (key in ofManaged) {
            ofLines.push(`${key}:${ofManaged[key]}`)
            ofWritten.add(key)
          } else {
            ofLines.push(line)
          }
        }
      } catch {
        ofLines = []
      }
    }

    for (const [key, val] of Object.entries(ofManaged)) {
      if (!ofWritten.has(key)) {
        ofLines.push(`${key}:${val}`)
      }
    }

    await fs.writeFile(optifinePath, ofLines.join('\n'), 'utf8')
  }

  return true
}
