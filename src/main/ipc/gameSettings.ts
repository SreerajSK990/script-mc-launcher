import { ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type { GameSettingsPayload } from '@shared/types/settings'
import { readGameSettings, saveGameSettings } from '@main/core/minecraft/options'
import { getInstanceMinecraftPath } from '@main/services/paths'
import { doesPathExist, ensureDirectoryExists } from '@main/utils/filesystem'

export function registerGameSettingsIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_GAME, async (_event, instanceId: string) => {
    return await readGameSettings(instanceId)
  })

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SAVE_GAME,
    async (_event, instanceId: string, payload: GameSettingsPayload) => {
      return await saveGameSettings(instanceId, payload)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_OPEN_FILE,
    async (_event, instanceId: string, fileType: 'options' | 'sodium' | 'optifine') => {
      const mcPath = getInstanceMinecraftPath(instanceId)
      await ensureDirectoryExists(mcPath)

      let targetPath = join(mcPath, 'options.txt')
      if (fileType === 'sodium') {
        const configPath = join(mcPath, 'config', 'sodium-options.json')
        targetPath = (await doesPathExist(configPath)) ? configPath : join(mcPath, 'config')
      } else if (fileType === 'optifine') {
        targetPath = join(mcPath, 'optionsof.txt')
      }

      if (await doesPathExist(targetPath)) {
        await shell.showItemInFolder(targetPath)
      } else {
        await shell.openPath(mcPath)
      }
    }
  )
}
