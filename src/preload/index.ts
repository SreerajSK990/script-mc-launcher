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
  system: {
    getEnvironment: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_ENVIRONMENT),
    openExternalUrl: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, url),
    openDirectory: (directoryPath: string) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_DIRECTORY, directoryPath)
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
