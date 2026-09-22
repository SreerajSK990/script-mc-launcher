export type SkinModelType = 'classic' | 'slim'

export interface SkinEntry {
  id: string
  name: string
  textureUrl: string
  model: SkinModelType
  source: 'preset' | 'custom' | 'player'
  author?: string
  category?: string
  createdAt?: string
}

export interface PlayerSkinSearchResult {
  username: string
  uuid: string
  skinUrl: string
  model: SkinModelType
}

export interface ApplySkinResult {
  success: boolean
  uploadedToMojang: boolean
  message: string
}

export type BackEquipmentType = 'none' | 'cape' | 'elytra'

export interface CapeEntry {
  id: string
  name: string
  textureUrl: string
  source: 'mojang' | 'preset' | 'optifine' | 'custom'
  active?: boolean
  alias?: string
  createdAt?: string
}

export interface ApplyCapeResult {
  success: boolean
  equippedToMojang: boolean
  message: string
}


