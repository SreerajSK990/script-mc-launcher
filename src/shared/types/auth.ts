export type AccountType = 'microsoft' | 'offline'

export interface MinecraftSkin {
  id: string
  state: 'ACTIVE' | 'INACTIVE'
  url: string
  variant: 'CLASSIC' | 'SLIM'
}

export interface MinecraftCape {
  id: string
  state: string
  url: string
}

export interface MinecraftProfile {
  uuid: string
  username: string
  skins: MinecraftSkin[]
  capes: MinecraftCape[]
}

export interface StoredAccount {
  id: string
  username: string
  uuid: string
  accountType: AccountType
  accessToken: string
  refreshToken: string | null
  expiresAt: number
  skinUrl?: string
  createdAt: string
}

export interface AuthState {
  activeAccount: StoredAccount | null
  accounts: StoredAccount[]
}

export interface MicrosoftTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export interface XboxLiveAuthResponse {
  IssueInstant: string
  NotAfter: string
  Token: string
  DisplayClaims: {
    xui: Array<{
      uhs: string
    }>
  }
}

export interface MinecraftAuthResponse {
  username: string
  roles: string[]
  access_token: string
  token_type: string
  expires_in: number
}
