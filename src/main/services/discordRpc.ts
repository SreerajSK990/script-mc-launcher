import * as discordRpc from '@xhayper/discord-rpc'
import type { SetDiscordActivityPayload } from '@shared/types/discord'

const ClientConstructor = discordRpc.Client || (discordRpc as any).default?.Client

let client: any = null
let isConnected = false
let lastPayload: SetDiscordActivityPayload | null = null
let reconnectTimer: NodeJS.Timeout | null = null

export function initializeDiscordRpc(): void {
  if (client) return
  try {
    client = new ClientConstructor({
      clientId: '1551298504155201598'
    })

    client.on('ready', () => {
      isConnected = true
      if (lastPayload) {
        updateDiscordActivity(lastPayload)
      }
    })

    client.on('disconnected', () => {
      isConnected = false
      scheduleReconnect()
    })

    client.login().catch(() => {
      isConnected = false
      scheduleReconnect()
    })
  } catch {
    scheduleReconnect()
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (!isConnected && client) {
      client.login().catch(() => {
        scheduleReconnect()
      })
    }
  }, 15000)
}

export function updateDiscordActivity(payload: SetDiscordActivityPayload): void {
  lastPayload = payload
  if (!client || !isConnected || !client.user) return

  try {
    if (payload.isPlaying) {
      const loader = payload.loaderType || 'Vanilla'
      const loaderName = loader.charAt(0).toUpperCase() + loader.slice(1)
      const version = payload.minecraftVersion || 'Latest'

      let stateText = `${version} • ${loaderName}`
      if (payload.serverName) {
        stateText = `On ${payload.serverName}`
      }

      client.user
        .setActivity({
          details: `Playing ${payload.instanceName || 'Minecraft'}`,
          state: stateText,
          startTimestamp: payload.startTime || Date.now(),
          largeImageKey: 'app_icon',
          largeImageText: payload.instanceName || 'Script Launcher',
          smallImageKey: (payload.loaderType || 'vanilla').toLowerCase(),
          smallImageText: `${loaderName} Loader`,
          buttons: [
            {
              label: 'Get Launcher',
              url: 'https://github.com/SreerajSK990/script-mc-launcher'
            }
          ]
        })
        .catch(() => {})
    } else {
      let details = 'Exploring Dashboard'
      let state = 'In Launcher'

      switch (payload.page) {
        case 'dashboard':
          details = 'Exploring Dashboard'
          state = 'In Launcher'
          break
        case 'instances':
          details = 'Browsing Instances'
          state = 'Selecting Instance'
          break
        case 'instance-detail':
          details = `Managing ${payload.instanceName || 'Instance'}`
          state = payload.minecraftVersion
            ? `${payload.minecraftVersion} (${(payload.loaderType || 'vanilla').toUpperCase()})`
            : 'Configuring Instance'
          break
        case 'mods':
          details = 'Browsing Mods & Packs'
          state = 'Searching Modrinth & CurseForge'
          break
        case 'skins':
          details = 'Customizing Player Skin'
          state = 'In Skin Studio'
          break
        case 'settings':
          details = 'Configuring Launcher'
          state = 'Tweaking Settings'
          break
        case 'logs':
          details = 'Viewing Live Logs'
          state = 'In Console'
          break
      }

      client.user
        .setActivity({
          details,
          state,
          largeImageKey: 'app_icon',
          largeImageText: 'Script Minecraft Launcher',
          buttons: [
            {
              label: 'Get Launcher',
              url: 'https://github.com/SreerajSK990/script-mc-launcher'
            }
          ]
        })
        .catch(() => {})
    }
  } catch {
  }
}

export function clearDiscordActivity(): void {
  lastPayload = null
  if (!client || !isConnected || !client.user) return
  try {
    client.user.clearActivity().catch(() => {})
  } catch {
  }
}
