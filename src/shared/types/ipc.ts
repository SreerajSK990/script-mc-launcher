import type { InstanceConfiguration, CreateInstancePayload, UpdateInstancePayload } from './instance'
import type { SystemEnvironment } from './system'

export interface WindowControlActions {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  isMaximized: () => Promise<boolean>
  close: () => Promise<void>
}

export interface InstanceActions {
  list: () => Promise<InstanceConfiguration[]>
  get: (instanceId: string) => Promise<InstanceConfiguration | null>
  create: (payload: CreateInstancePayload) => Promise<InstanceConfiguration>
  update: (payload: UpdateInstancePayload) => Promise<InstanceConfiguration>
  delete: (instanceId: string) => Promise<boolean>
  openFolder: (instanceId: string) => Promise<void>
}

export interface SystemActions {
  getEnvironment: () => Promise<SystemEnvironment>
  openExternalUrl: (url: string) => Promise<void>
  openDirectory: (directoryPath: string) => Promise<void>
}

export interface LauncherAPI {
  window: WindowControlActions
  instances: InstanceActions
  system: SystemActions
}
