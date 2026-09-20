import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type { ModSearchParams, InstallModPayload, ModSource } from '@shared/types/mods'
import type { ModLoaderType } from '@shared/types/instance'
import {
  searchAllMods,
  fetchModVersions,
  installMod,
  listMods,
  toggleMod,
  deleteMod,
  setCurseForgeApiKey,
  getCurseForgeApiKey
} from '@main/services/mods'

export function registerModsIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.MODS_SEARCH, async (_event, params: ModSearchParams) => {
    return await searchAllMods(params)
  })

  ipcMain.handle(
    IPC_CHANNELS.MODS_GET_VERSIONS,
    async (
      _event,
      projectId: string,
      source: ModSource,
      minecraftVersion?: string,
      loader?: ModLoaderType
    ) => {
      return await fetchModVersions(projectId, source, minecraftVersion, loader)
    }
  )

  ipcMain.handle(IPC_CHANNELS.MODS_INSTALL, async (_event, payload: InstallModPayload) => {
    return await installMod(payload)
  })

  ipcMain.handle(IPC_CHANNELS.MODS_LIST_INSTALLED, async (_event, instanceId: string) => {
    return await listMods(instanceId)
  })

  ipcMain.handle(
    IPC_CHANNELS.MODS_TOGGLE_INSTALLED,
    async (_event, instanceId: string, filename: string, enable: boolean) => {
      return await toggleMod(instanceId, filename, enable)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MODS_DELETE_INSTALLED,
    async (_event, instanceId: string, filename: string) => {
      return await deleteMod(instanceId, filename)
    }
  )

  ipcMain.handle(IPC_CHANNELS.MODS_SET_CURSEFORGE_KEY, async (_event, key: string | null) => {
    setCurseForgeApiKey(key)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.MODS_GET_CURSEFORGE_KEY, async () => {
    return getCurseForgeApiKey()
  })
}
