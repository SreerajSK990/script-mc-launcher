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
    openFolder: (instanceId: string) => ipcRenderer.invoke(IPC_CHANNELS.INSTANCES_OPEN_FOLDER, instanceId)
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
    stop: (instanceId: string) => ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_STOP, instanceId),
    onProgress: (callback) => {
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
    openExternalUrl: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, url),
    openDirectory: (directoryPath: string) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_DIRECTORY, directoryPath)
  },
  mods: {
    search: (params) => ipcRenderer.invoke(IPC_CHANNELS.MODS_SEARCH, params),
    getVersions: (projectId, source, minecraftVersion, loader) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODS_GET_VERSIONS, projectId, source, minecraftVersion, loader),
    install: (payload) => ipcRenderer.invoke(IPC_CHANNELS.MODS_INSTALL, payload),
    listInstalled: (instanceId) => ipcRenderer.invoke(IPC_CHANNELS.MODS_LIST_INSTALLED, instanceId),
    toggleInstalled: (instanceId, filename, enable) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODS_TOGGLE_INSTALLED, instanceId, filename, enable),
    deleteInstalled: (instanceId, filename) =>
      ipcRenderer.invoke(IPC_CHANNELS.MODS_DELETE_INSTALLED, instanceId, filename),
    setCurseForgeKey: (key) => ipcRenderer.invoke(IPC_CHANNELS.MODS_SET_CURSEFORGE_KEY, key),
    getCurseForgeKey: () => ipcRenderer.invoke(IPC_CHANNELS.MODS_GET_CURSEFORGE_KEY)
  },
  java: {
    getRuntimes: () => ipcRenderer.invoke(IPC_CHANNELS.JAVA_GET_RUNTIMES),
    downloadRuntime: (componentOrVersion: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.JAVA_DOWNLOAD_RUNTIME, componentOrVersion)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('launcherAPI', launcherAPI)
  } catch (error) {
    console.error('Failed to expose launcherAPI in main world:', error)
  }
} else {
  // @ts-expect-error fallback when context isolation is disabled
  window.launcherAPI = launcherAPI
}
