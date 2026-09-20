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

