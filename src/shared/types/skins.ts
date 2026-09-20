export type SkinModelType = 'classic' | 'slim'

export interface SkinEntry {
  id: string
  name: string
  textureUrl: string // base64 dataUrl or remote URL
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
