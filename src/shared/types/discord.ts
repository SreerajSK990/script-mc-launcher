export type DiscordPageType =
  | 'dashboard'
  | 'instances'
  | 'instance-detail'
  | 'mods'
  | 'skins'
  | 'settings'
  | 'logs'

export interface SetDiscordActivityPayload {
  page?: DiscordPageType
  instanceName?: string
  minecraftVersion?: string
  loaderType?: string
  serverName?: string
  serverIp?: string
  isPlaying?: boolean
  startTime?: number
}
