import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import { updateDiscordActivity, clearDiscordActivity } from '@main/services/discordRpc'
import type { SetDiscordActivityPayload } from '@shared/types/discord'

export function registerDiscordIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.DISCORD_SET_ACTIVITY,
    async (_event, payload: SetDiscordActivityPayload) => {
      try {
        updateDiscordActivity(payload)
      } catch (err) {
        console.error('Failed to set Discord activity:', err)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.DISCORD_CLEAR_ACTIVITY, async () => {
    try {
      clearDiscordActivity()
    } catch (err) {
      console.error('Failed to clear Discord activity:', err)
    }
  })
}
