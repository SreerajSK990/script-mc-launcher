import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/channels'
import type { LauncherAPI } from '@shared/types/ipc'
import type { CreateInstancePayload, UpdateInstancePayload } from '@shared/types/instance'

const launcherAPI: LauncherAPI = {
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE)
  },
  instances: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_LIST),
    get: (instanceId: string) => ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_GET, instanceId),
    create: (payload: CreateInstancePayload) => ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_CREATE, payload),
    update: (payload: UpdateInstancePayload) => ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_UPDATE, payload),
    delete: (instanceId: string) => ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_DELETE, instanceId),
    openFolder: (instanceId: string) => ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_OPEN_FOLDER, instanceId),
    setGroup: (instanceId: string, group: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_SET_GROUP, instanceId, group),
    renameGroup: (oldName: string, newName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_RENAME_GROUP, oldName, newName),
    disbandGroup: (groupName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_DISBAND_GROUP, groupName),
    deleteGroup: (groupName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_DELETE_GROUP, groupName),
    saveCustomIcon: (instanceId: string, dataUrl: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_SAVE_CUSTOM_ICON, instanceId, dataUrl),
    toggleFavorite: (instanceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_TOGGLE_FAVORITE, instanceId),
    repair: (instanceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_REPAIR, instanceId),
    backupSaves: (instanceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_BACKUP_SAVES, instanceId),
    clone: (instanceId: string, customName?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_CLONE, instanceId, customName)
  },


  auth: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_STATE),
    loginMicrosoft: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN_MICROSOFT),
    loginOffline: (username: string) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN_OFFLINE, username),
    logout: (accountId: string) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT, accountId),
    switchAccount: (accountId: string) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_SWITCH_ACCOUNT, accountId)
  },
  launch: {
    start: (instanceId: string) => ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_START, instanceId),
    quickPlay: (instanceId: string, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_QUICK_PLAY, instanceId, options),
    stop: (instanceId: string) => ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_STOP, instanceId),
    onProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.LAUNCH_STATUS_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.LAUNCH_STATUS_EVENT, handler)
      }
    },
    onStatus: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.LAUNCH_STATUS_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.LAUNCH_STATUS_EVENT, handler)
      }
    },
    onLog: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.LAUNCH_LOG_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.LAUNCH_LOG_EVENT, handler)
      }
    }
  },
  meta: {
    getVersions: () => ipcRenderer.invoke(IPC_CHANNELS.META_GET_VERSIONS),
    getLoaderVersions: (loaderType, minecraftVersion) =>
      ipcRenderer.invoke(IPC_CHANNELS.META_GET_LOADER_VERSIONS, loaderType, minecraftVersion)
  },
  system: {
    getEnvironment: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_ENVIRONMENT),
    openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, url),
    openExternalUrl: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, url),
    openDirectory: (directoryPath: string) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_DIRECTORY, directoryPath),
    selectFile: (options) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_SELECT_FILE, options)
  },
  mods: {
    search: (params) => ipcRenderer.invoke(IPC_CHANNELS.MODS_SEARCH, params),
    getDetail: (source, id) => ipcRenderer.invoke(IPC_CHANNELS.MODS_GET_DETAIL, source, id),
    getVersions: (projectId, source, minecraftVersion, loader) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODS_GET_VERSIONS, projectId, source, minecraftVersion, loader),
    install: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MODS_INSTALL, payload),
    listInstalled: (instanceId) => ipcRenderer.invoke(IPC_CHANNELS.MODS_LIST_INSTALLED, instanceId),
    toggleInstalled: (instanceId, filename, enable) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODS_TOGGLE_INSTALLED, instanceId, filename, enable),
    deleteInstalled: (instanceId, filename) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODS_DELETE_INSTALLED, instanceId, filename),
    setCurseForgeKey: (key) => ipcRenderer.invoke(IPC_CHANNELS.MODS_SET_CURSEFORGE_KEY, key),
    getCurseForgeKey: () => ipcRenderer.invoke(IPC_CHANNELS.MODS_GET_CURSEFORGE_KEY),
    checkUpdates: (instanceId, forceRefresh) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODS_CHECK_UPDATES, instanceId, forceRefresh),
    updateAll: (instanceId, updates) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODS_UPDATE_ALL, instanceId, updates),
    installDropped: (instanceId, filePaths) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODS_INSTALL_DROPPED, instanceId, filePaths),
    onUpdateProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.MODS_UPDATE_PROGRESS_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MODS_UPDATE_PROGRESS_EVENT, handler)
      }
    }
  },
  modpacks: {
    selectFile: () => ipcRenderer.invoke(IPC_CHANNELS.MODPACKS_SELECT_FILE),
    inspect: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.MODPACKS_INSPECT, filePath),
    import: (filePath, customName) => ipcRenderer.invoke(IPC_CHANNELS.MODPACKS_IMPORT, filePath, customName),
    installRemote: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MODPACKS_INSTALL_REMOTE, payload),
    onProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.MODPACKS_PROGRESS_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MODPACKS_PROGRESS_EVENT, handler)
      }
    }
  },
  resourcepacks: {
    listInstalled: (instanceId) => ipcRenderer.invoke(IPC_CHANNELS.RESOURCEPACKS_LIST_INSTALLED, instanceId),
    install: (payload) => ipcRenderer.invoke(IPC_CHANNELS.RESOURCEPACKS_INSTALL, payload),
    toggleInstalled: (instanceId, filename, enable) =>
      ipcRenderer.invoke(IPC_CHANNELS.RESOURCEPACKS_TOGGLE_INSTALLED, instanceId, filename, enable),
    deleteInstalled: (instanceId, filename) =>
      ipcRenderer.invoke(IPC_CHANNELS.RESOURCEPACKS_DELETE_INSTALLED, instanceId, filename),
    installDropped: (instanceId, filePaths) =>
      ipcRenderer.invoke(IPC_CHANNELS.RESOURCEPACKS_INSTALL_DROPPED, instanceId, filePaths),
    openFolder: (instanceId) => ipcRenderer.invoke(IPC_CHANNELS.RESOURCEPACKS_OPEN_FOLDER, instanceId)
  },
  screenshots: {
    list: (instanceId) => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_LIST, instanceId),
    delete: (instanceId, filename) => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_DELETE, instanceId, filename),
    openFolder: (instanceId) => ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOTS_OPEN_FOLDER, instanceId)
  },
  externalLaunchers: {
    scanAll: () => ipcRenderer.invoke(IPC_CHANNELS.LAUNCHERS_SCAN_ALL),
    scanDirectory: (directoryPath) =>
      ipcRenderer.invoke(IPC_CHANNELS.LAUNCHERS_SCAN_DIRECTORY, directoryPath),
    selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.LAUNCHERS_SELECT_DIRECTORY),
    clone: (payload) => ipcRenderer.invoke(IPC_CHANNELS.LAUNCHERS_CLONE, payload),
    onProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.LAUNCHERS_CLONE_PROGRESS_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.LAUNCHERS_CLONE_PROGRESS_EVENT, handler)
      }
    }
  },
  java: {
    getRuntimes: () => ipcRenderer.invoke(IPC_CHANNELS.JAVA_GET_RUNTIMES),
    downloadRuntime: (componentOrVersion: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.JAVA_DOWNLOAD_RUNTIME, componentOrVersion)
  },
  fonts: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.FONTS_LIST),
    install: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FONTS_INSTALL, filePath),
    delete: (fileName: string) => ipcRenderer.invoke(IPC_CHANNELS.FONTS_DELETE, fileName)
  },
  servers: {
    listAll: () => ipcRenderer.invoke(IPC_CHANNELS.SERVERS_LIST_ALL),
    listForInstance: (instanceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SERVERS_LIST_INSTANCE, instanceId),
    add: (payload: any) => ipcRenderer.invoke(IPC_CHANNELS.SERVERS_ADD, payload),
    remove: (payload: any) => ipcRenderer.invoke(IPC_CHANNELS.SERVERS_REMOVE, payload),
    ping: (host: string, port?: number) => ipcRenderer.invoke(IPC_CHANNELS.SERVERS_PING, host, port)
  },
  skins: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.SKINS_LIST),
    getActive: () => ipcRenderer.invoke(IPC_CHANNELS.SKINS_GET_ACTIVE),
    apply: (skinId: string) => ipcRenderer.invoke(IPC_CHANNELS.SKINS_APPLY, skinId),
    save: (params: any) => ipcRenderer.invoke(IPC_CHANNELS.SKINS_SAVE, params),
    delete: (skinId: string) => ipcRenderer.invoke(IPC_CHANNELS.SKINS_DELETE, skinId),
    searchPlayer: (username: string) => ipcRenderer.invoke(IPC_CHANNELS.SKINS_SEARCH_PLAYER, username),
    listCapes: () => ipcRenderer.invoke(IPC_CHANNELS.SKINS_LIST_CAPES),
    applyCape: (capeId: string | null) => ipcRenderer.invoke(IPC_CHANNELS.SKINS_APPLY_CAPE, capeId),
    saveCape: (params: any) => ipcRenderer.invoke(IPC_CHANNELS.SKINS_SAVE_CAPE, params),
    deleteCape: (capeId: string) => ipcRenderer.invoke(IPC_CHANNELS.SKINS_DELETE_CAPE, capeId),
    searchOptifineCape: (username: string) => ipcRenderer.invoke(IPC_CHANNELS.SKINS_SEARCH_OPTIFINE_CAPE, username)
  },
  gameSettings: {
    get: (instanceId: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_GAME, instanceId),
    save: (instanceId: string, payload: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE_GAME, instanceId, payload),
    openFile: (instanceId: string, fileType: 'options' | 'sodium' | 'optifine') =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_OPEN_FILE, instanceId, fileType)
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK),
    quitAndInstall: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_QUIT_AND_INSTALL),
    onStatus: (callback: any) => {
      const handler = (_event: Electron.IpcRendererEvent, status: any, message?: string) =>
        callback(status, message)
      ipcRenderer.on(IPC_CHANNELS.UPDATER_STATUS_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_STATUS_EVENT, handler)
      }
    },
    onProgress: (callback: any) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress)
      ipcRenderer.on(IPC_CHANNELS.UPDATER_PROGRESS_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_PROGRESS_EVENT, handler)
      }
    },
    onDownloaded: (callback: any) => {
      const handler = (_event: Electron.IpcRendererEvent, info: any) => callback(info)
      ipcRenderer.on(IPC_CHANNELS.UPDATER_DOWNLOADED_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_DOWNLOADED_EVENT, handler)
      }
    }
  },
  discord: {
    setActivity: (payload: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.DISCORD_SET_ACTIVITY, payload),
    clearActivity: () => ipcRenderer.invoke(IPC_CHANNELS.DISCORD_CLEAR_ACTIVITY)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('launcherAPI', launcherAPI)
  } catch (error) {
    console.error('Failed to expose launcherAPI in main world:', error)
  }
} else {
  ;(window as unknown as { launcherAPI: unknown }).launcherAPI = launcherAPI
}

