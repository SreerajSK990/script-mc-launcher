export interface MinecraftServerEntry {
  id: string
  instanceId: string
  instanceName: string
  loaderType: string
  minecraftVersion: string
  name: string
  ip: string
  port: number
  icon?: string
  type: 'server'
}

export interface SingleplayerWorldEntry {
  id: string
  instanceId: string
  instanceName: string
  loaderType: string
  minecraftVersion: string
  name: string
  folderName: string
  gameMode: string
  lastPlayed: number
  icon?: string
  type: 'world'
}

export type QuickPlayTarget = MinecraftServerEntry | SingleplayerWorldEntry

export interface ServerPingStatus {
  online: boolean
  latencyMs: number
  motd?: string
  cleanMotd?: string
  versionName?: string
  protocolVersion?: number
  players?: {
    online: number
    max: number
  }
  favicon?: string
}

export interface QuickPlayLaunchOptions {
  type: 'server' | 'world'
  host?: string
  port?: number
  worldFolder?: string
}

export interface AddServerPayload {
  instanceId: string
  name: string
  ip: string
}

export interface RemoveServerPayload {
  instanceId: string
  serverIp: string
}
