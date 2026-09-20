import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { SkinEntry, SkinModelType, PlayerSkinSearchResult } from '@shared/types/skins'
import { getSkinsDirectory } from '@main/services/paths'
import { readJsonFile, writeJsonFileAtomic } from '@main/utils/filesystem'

interface SkinsConfigFile {
  activeSkinId: string | null
  skins: SkinEntry[]
}

const PRESET_SKINS: SkinEntry[] = [
  {
    id: 'preset_steve',
    name: 'Steve',
    textureUrl: 'https://textures.minecraft.net/texture/1aab223847e090a18ab8cf52199b4566c3e721e35dd74fb85ff3934484c8a',
    model: 'classic',
    source: 'preset',
    author: 'Mojang',
    category: 'Official Default'
  },
  {
    id: 'preset_alex',
    name: 'Alex',
    textureUrl: 'https://textures.minecraft.net/texture/6e10825f385c7c29013327d53b519e685f0ef7a8eb8d5856ebbeec8ca2345e5',
    model: 'slim',
    source: 'preset',
    author: 'Mojang',
    category: 'Official Default'
  },
  {
    id: 'preset_ari',
    name: 'Ari',
    textureUrl: 'https://textures.minecraft.net/texture/4ab908359f1d4ebca5342a78489beba5b3648eb129759c9428ea87de6478953f',
    model: 'slim',
    source: 'preset',
    author: 'Mojang',
    category: 'Official'
  },
  {
    id: 'preset_efe',
    name: 'Efe',
    textureUrl: 'https://textures.minecraft.net/texture/bbabeb6e4a2e5d95dcaec29528f8fbf0f05807ea8693c4e36502ff2c974c2081',
    model: 'slim',
    source: 'preset',
    author: 'Mojang',
    category: 'Official'
  },
  {
    id: 'preset_kai',
    name: 'Kai',
    textureUrl: 'https://textures.minecraft.net/texture/831518fdf1ca1029c54625b5a7ceea5582f34842b4776100236a28795777161b',
    model: 'classic',
    source: 'preset',
    author: 'Mojang',
    category: 'Official'
  },
  {
    id: 'preset_makena',
    name: 'Makena',
    textureUrl: 'https://textures.minecraft.net/texture/96c56784d1421689252328103c8b417e4a7ecf385a81e3c837ea9604aa2ae07b',
    model: 'classic',
    source: 'preset',
    author: 'Mojang',
    category: 'Official'
  },
  {
    id: 'preset_noor',
    name: 'Noor',
    textureUrl: 'https://textures.minecraft.net/texture/e5585043d9370df44719266e70bf410886c99c750b322a36b3060c239d2caefb',
    model: 'slim',
    source: 'preset',
    author: 'Mojang',
    category: 'Official'
  },
  {
    id: 'preset_sunny',
    name: 'Sunny',
    textureUrl: 'https://textures.minecraft.net/texture/b5853f938f328a6f33aa3b34b6b1fcb4decf1abef329431835bc456ab3a49281',
    model: 'classic',
    source: 'preset',
    author: 'Mojang',
    category: 'Official'
  },
  {
    id: 'preset_zuri',
    name: 'Zuri',
    textureUrl: 'https://textures.minecraft.net/texture/90f8ce82110c710dfb47702e0df4aaee7ccb5e408ecda44a86f9f52f3e8248c8',
    model: 'classic',
    source: 'preset',
    author: 'Mojang',
    category: 'Official'
  }
]

function getConfigFile(): string {
  return join(getSkinsDirectory(), 'skins.json')
}

async function loadConfig(): Promise<SkinsConfigFile> {
  const configFile = getConfigFile()
  const data = await readJsonFile<SkinsConfigFile>(configFile)
  if (data && Array.isArray(data.skins)) {
    return data
  }
  return {
    activeSkinId: 'preset_steve',
    skins: []
  }
}

async function saveConfig(cfg: SkinsConfigFile): Promise<void> {
  await writeJsonFileAtomic(getConfigFile(), cfg)
}

export async function listAllSkins(): Promise<{ activeSkinId: string | null; skins: SkinEntry[] }> {
  const cfg = await loadConfig()
  const allSkins = [...PRESET_SKINS, ...cfg.skins]
  return {
    activeSkinId: cfg.activeSkinId || 'preset_steve',
    skins: allSkins
  }
}

export async function getActiveSkinId(): Promise<string | null> {
  const cfg = await loadConfig()
  return cfg.activeSkinId || 'preset_steve'
}

export async function setActiveSkin(skinId: string): Promise<boolean> {
  const cfg = await loadConfig()
  cfg.activeSkinId = skinId
  await saveConfig(cfg)
  return true
}

export async function deleteSkin(skinId: string): Promise<boolean> {
  // Preset skins cannot be deleted
  if (skinId.startsWith('preset_')) {
    return false
  }

  const cfg = await loadConfig()
  const skin = cfg.skins.find((s) => s.id === skinId)
  if (!skin) {
    return false
  }

  cfg.skins = cfg.skins.filter((s) => s.id !== skinId)
  if (cfg.activeSkinId === skinId) {
    cfg.activeSkinId = 'preset_steve'
  }

  await saveConfig(cfg)

  // Try to remove local png file if it was custom
  const skinFilePath = join(getSkinsDirectory(), `${skinId}.png`)
  try {
    await fs.unlink(skinFilePath)
  } catch {
    // File might not exist
  }

  return true
}

export interface SaveSkinParams {
  name: string
  textureData: string // file path, base64 dataUrl, or remote URL
  model: SkinModelType
  source: 'custom' | 'player'
  author?: string
}

export async function saveSkin(params: SaveSkinParams): Promise<SkinEntry> {
  const id = `skin_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  let imageBuffer: Buffer

  if (params.textureData.startsWith('data:image/')) {
    // Base64 data URL
    const base64Content = params.textureData.split(',')[1] || ''
    imageBuffer = Buffer.from(base64Content, 'base64')
  } else if (params.textureData.startsWith('http://') || params.textureData.startsWith('https://')) {
    // Remote URL download
    const response = await fetch(params.textureData)
    if (!response.ok) {
      throw new Error(`Failed to download skin texture: HTTP ${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    imageBuffer = Buffer.from(arrayBuffer)
  } else {
    // Local file path
    imageBuffer = await fs.readFile(params.textureData)
  }

  const targetPath = join(getSkinsDirectory(), `${id}.png`)
  await fs.writeFile(targetPath, imageBuffer)

  const dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`

  const newSkin: SkinEntry = {
    id,
    name: params.name || 'Custom Skin',
    textureUrl: dataUrl,
    model: params.model || 'classic',
    source: params.source,
    author: params.author,
    createdAt: new Date().toISOString()
  }

  const cfg = await loadConfig()
  cfg.skins.unshift(newSkin)
  await saveConfig(cfg)

  return newSkin
}

export async function searchPlayerSkin(username: string): Promise<PlayerSkinSearchResult> {
  const trimmed = username.trim()
  if (!trimmed) {
    throw new Error('Please enter a valid Minecraft player username.')
  }

  // 1. Fetch Mojang profile (UUID)
  const profileRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(trimmed)}`)
  if (profileRes.status === 404 || profileRes.status === 204) {
    throw new Error(`Player "${trimmed}" not found.`)
  }
  if (!profileRes.ok) {
    throw new Error(`Mojang API error (${profileRes.status}): ${profileRes.statusText}`)
  }

  const profile = (await profileRes.json()) as { id: string; name: string }

  // 2. Fetch session profile with textures
  const sessionRes = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`)
  if (!sessionRes.ok) {
    throw new Error(`Could not load player skin profile: HTTP ${sessionRes.status}`)
  }

  const sessionData = (await sessionRes.json()) as {
    id: string
    name: string
    properties?: Array<{ name: string; value: string }>
  }

  const texturesProperty = sessionData.properties?.find((p) => p.name === 'textures')
  if (!texturesProperty || !texturesProperty.value) {
    throw new Error(`Player "${profile.name}" has no custom skin set.`)
  }

  const decodedJson = Buffer.from(texturesProperty.value, 'base64').toString('utf-8')
  const texturesObj = JSON.parse(decodedJson) as {
    textures?: {
      SKIN?: {
        url?: string
        metadata?: {
          model?: string
        }
      }
    }
  }

  const skinUrl = texturesObj.textures?.SKIN?.url
  if (!skinUrl) {
    throw new Error(`Player "${profile.name}" has no active skin URL.`)
  }

  const model: SkinModelType = texturesObj.textures?.SKIN?.metadata?.model === 'slim' ? 'slim' : 'classic'

  return {
    username: profile.name,
    uuid: profile.id,
    skinUrl,
    model
  }
}
