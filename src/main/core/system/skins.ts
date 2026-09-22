import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type {
  SkinEntry,
  SkinModelType,
  PlayerSkinSearchResult,
  ApplySkinResult,
  CapeEntry,
  ApplyCapeResult
} from '@shared/types/skins'
import { getSkinsDirectory, getCapesDirectory } from '@main/services/paths'
import { readJsonFile, writeJsonFileAtomic } from '@main/utils/filesystem'
import { PRESET_SKINS } from './presetSkins'
import { PRESET_CAPES } from './presetCapes'
import { getCurrentAuthState } from '@main/services/auth'
import { saveStoredAccounts } from '@main/core/auth/storage'
import {
  uploadSkinToMojang,
  fetchMinecraftProfile,
  equipMojangCape,
  unequipMojangCape
} from '@main/core/auth/tokens'

interface SkinsConfigFile {
  activeSkinId: string | null
  skins: SkinEntry[]
}

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

export async function setActiveSkin(skinId: string): Promise<ApplySkinResult> {
  const cfg = await loadConfig()
  const allSkins = [...PRESET_SKINS, ...cfg.skins]
  const targetSkin = allSkins.find((s) => s.id === skinId)
  if (!targetSkin) {
    return {
      success: false,
      uploadedToMojang: false,
      message: 'Selected skin not found in library.'
    }
  }

  cfg.activeSkinId = skinId
  await saveConfig(cfg)

  try {
    const authState = await getCurrentAuthState()
    const activeAcc = authState.activeAccount

    if (activeAcc && activeAcc.accountType === 'microsoft' && activeAcc.accessToken) {
      let imageBuffer: Buffer

      if (targetSkin.textureUrl.startsWith('data:image/')) {
        const b64 = targetSkin.textureUrl.split(',')[1] || ''
        imageBuffer = Buffer.from(b64, 'base64')
      } else if (targetSkin.textureUrl.startsWith('http://') || targetSkin.textureUrl.startsWith('https://')) {
        const resp = await fetch(targetSkin.textureUrl)
        if (!resp.ok) {
          throw new Error(`Failed to fetch skin texture: HTTP ${resp.status}`)
        }
        imageBuffer = Buffer.from(await resp.arrayBuffer())
      } else {
        imageBuffer = await fs.readFile(targetSkin.textureUrl)
      }

      await uploadSkinToMojang(activeAcc.accessToken, imageBuffer, targetSkin.model)

      try {
        const freshProfile = await fetchMinecraftProfile(activeAcc.accessToken)
        const newActiveSkin = freshProfile.skins.find((s) => s.state === 'ACTIVE')
        activeAcc.skinUrl = newActiveSkin?.url || targetSkin.textureUrl
        await saveStoredAccounts(activeAcc.id, authState.accounts)
      } catch {
      }

      return {
        success: true,
        uploadedToMojang: true,
        message: `Skin "${targetSkin.name}" uploaded to your Minecraft account! Changes will appear in-game.`
      }
    }

    return {
      success: true,
      uploadedToMojang: false,
      message: `Skin "${targetSkin.name}" set locally. Sign in with a Microsoft account to sync skins to Minecraft servers.`
    }
  } catch (error) {
    return {
      success: false,
      uploadedToMojang: false,
      message: error instanceof Error ? error.message : 'Failed to sync skin with Mojang.'
    }
  }
}

export async function deleteSkin(skinId: string): Promise<boolean> {
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

  const skinFilePath = join(getSkinsDirectory(), `${skinId}.png`)
  try {
    await fs.unlink(skinFilePath)
  } catch {
  }

  return true
}

export interface SaveSkinParams {
  name: string
  textureData: string
  model: SkinModelType
  source: 'custom' | 'player'
  author?: string
}

export async function saveSkin(params: SaveSkinParams): Promise<SkinEntry> {
  const id = `skin_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  let imageBuffer: Buffer

  if (params.textureData.startsWith('data:image/')) {
    const base64Content = params.textureData.split(',')[1] || ''
    imageBuffer = Buffer.from(base64Content, 'base64')
  } else if (params.textureData.startsWith('http://') || params.textureData.startsWith('https://')) {
    const response = await fetch(params.textureData)
    if (!response.ok) {
      throw new Error(`Failed to download skin texture: HTTP ${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    imageBuffer = Buffer.from(arrayBuffer)
  } else {
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

  const profileRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(trimmed)}`)
  if (profileRes.status === 404 || profileRes.status === 204) {
    throw new Error(`Player "${trimmed}" not found.`)
  }
  if (!profileRes.ok) {
    throw new Error(`Mojang API error (${profileRes.status}): ${profileRes.statusText}`)
  }

  const profile = (await profileRes.json()) as { id: string; name: string }

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

  const rawSkinUrl = texturesObj.textures?.SKIN?.url?.replace(/^http:/, 'https:')
  if (!rawSkinUrl) {
    throw new Error(`Player "${profile.name}" has no active skin URL.`)
  }

  let finalSkinUrl = rawSkinUrl
  try {
    const skinRes = await fetch(rawSkinUrl)
    if (skinRes.ok) {
      const buf = Buffer.from(await skinRes.arrayBuffer())
      finalSkinUrl = `data:image/png;base64,${buf.toString('base64')}`
    }
  } catch {
  }

  const model: SkinModelType = texturesObj.textures?.SKIN?.metadata?.model === 'slim' ? 'slim' : 'classic'

  return {
    username: profile.name,
    uuid: profile.id,
    skinUrl: finalSkinUrl,
    model
  }
}

interface CapesConfigFile {
  activeCapeId: string | null
  capes: CapeEntry[]
}

function getCapesConfigFile(): string {
  return join(getCapesDirectory(), 'capes.json')
}

async function loadCapesConfig(): Promise<CapesConfigFile> {
  const configFile = getCapesConfigFile()
  const data = await readJsonFile<CapesConfigFile>(configFile)
  if (data && Array.isArray(data.capes)) {
    return data
  }
  return {
    activeCapeId: null,
    capes: []
  }
}

async function saveCapesConfig(cfg: CapesConfigFile): Promise<void> {
  await writeJsonFileAtomic(getCapesConfigFile(), cfg)
}

export async function listAllCapes(): Promise<{ activeCapeId: string | null; capes: CapeEntry[] }> {
  const cfg = await loadCapesConfig()
  const mojangCapes: CapeEntry[] = []

  try {
    const authState = await getCurrentAuthState()
    const activeAcc = authState.activeAccount
    if (activeAcc && activeAcc.accountType === 'microsoft' && activeAcc.accessToken) {
      const profile = await fetchMinecraftProfile(activeAcc.accessToken)
      if (profile.capes && Array.isArray(profile.capes)) {
        for (const c of profile.capes) {
          const isActive = c.state === 'ACTIVE'
          if (isActive && !cfg.activeCapeId) {
            cfg.activeCapeId = c.id
          }
          mojangCapes.push({
            id: c.id,
            name: (c as { alias?: string }).alias ? `${(c as { alias?: string }).alias} Cape` : 'Mojang Cape',
            alias: (c as { alias?: string }).alias,
            textureUrl: c.url.replace(/^http:/, 'https:'),
            source: 'mojang',
            active: isActive
          })
        }
      }
    }
  } catch {
  }

  const allCapes = [...mojangCapes, ...PRESET_CAPES, ...cfg.capes]
  return {
    activeCapeId: cfg.activeCapeId,
    capes: allCapes
  }
}

export async function setActiveCape(capeId: string | null): Promise<ApplyCapeResult> {
  const cfg = await loadCapesConfig()

  if (!capeId) {
    cfg.activeCapeId = null
    await saveCapesConfig(cfg)

    try {
      const authState = await getCurrentAuthState()
      const activeAcc = authState.activeAccount
      if (activeAcc && activeAcc.accountType === 'microsoft' && activeAcc.accessToken) {
        await unequipMojangCape(activeAcc.accessToken)
      }
    } catch {
    }

    return {
      success: true,
      equippedToMojang: true,
      message: 'Cape unequipped successfully.'
    }
  }

  const { capes } = await listAllCapes()
  const targetCape = capes.find((c) => c.id === capeId)
  if (!targetCape) {
    return {
      success: false,
      equippedToMojang: false,
      message: 'Selected cape not found.'
    }
  }

  cfg.activeCapeId = capeId
  await saveCapesConfig(cfg)

  if (targetCape.source === 'mojang') {
    try {
      const authState = await getCurrentAuthState()
      const activeAcc = authState.activeAccount
      if (activeAcc && activeAcc.accountType === 'microsoft' && activeAcc.accessToken) {
        await equipMojangCape(activeAcc.accessToken, targetCape.id)
        return {
          success: true,
          equippedToMojang: true,
          message: `Cape "${targetCape.name}" equipped to your Minecraft account!`
        }
      }
    } catch (err: any) {
      return {
        success: true,
        equippedToMojang: false,
        message: `Cape selected locally, but Mojang equip failed: ${err.message}`
      }
    }
  }

  return {
    success: true,
    equippedToMojang: false,
    message: `Cape "${targetCape.name}" selected for preview.`
  }
}

export async function saveCustomCape(params: {
  name: string
  textureData: string
}): Promise<CapeEntry> {
  const capesDir = getCapesDirectory()
  const id = `custom_cape_${randomUUID().replace(/-/g, '')}`
  const filename = `${id}.png`
  const targetPath = join(capesDir, filename)

  if (params.textureData.startsWith('data:image/')) {
    const base64Data = params.textureData.split(',')[1]
    const buffer = Buffer.from(base64Data, 'base64')
    await fs.writeFile(targetPath, buffer)
  } else if (params.textureData.startsWith('http://') || params.textureData.startsWith('https://')) {
    const res = await fetch(params.textureData)
    if (!res.ok) {
      throw new Error(`Failed to download cape: HTTP ${res.status}`)
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    await fs.writeFile(targetPath, buffer)
  } else {
    await fs.copyFile(params.textureData, targetPath)
  }

  const newCape: CapeEntry = {
    id,
    name: params.name.trim() || 'Custom Cape',
    textureUrl: targetPath,
    source: 'custom',
    createdAt: new Date().toISOString()
  }

  const cfg = await loadCapesConfig()
  cfg.capes.push(newCape)
  await saveCapesConfig(cfg)

  return newCape
}

export async function deleteCustomCape(capeId: string): Promise<boolean> {
  const cfg = await loadCapesConfig()
  const targetIndex = cfg.capes.findIndex((c) => c.id === capeId)
  if (targetIndex === -1) {
    return false
  }

  const targetCape = cfg.capes[targetIndex]
  if (targetCape.textureUrl && !targetCape.textureUrl.startsWith('http')) {
    try {
      await fs.unlink(targetCape.textureUrl)
    } catch {
    }
  }

  cfg.capes.splice(targetIndex, 1)
  if (cfg.activeCapeId === capeId) {
    cfg.activeCapeId = null
  }
  await saveCapesConfig(cfg)
  return true
}

export async function fetchOptifineCape(username: string): Promise<CapeEntry | null> {
  const trimmed = username.trim()
  if (!trimmed) {
    return null
  }

  const optifineUrl = `http://optifine.net/capes/${encodeURIComponent(trimmed)}.png`
  try {
    const resp = await fetch(optifineUrl)
    if (!resp.ok) {
      return null
    }

    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length < 50) {
      return null
    }

    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`
    return {
      id: `optifine_${trimmed.toLowerCase()}`,
      name: `${trimmed}'s OptiFine Cape`,
      textureUrl: dataUrl,
      source: 'optifine'
    }
  } catch {
    return null
  }
}


