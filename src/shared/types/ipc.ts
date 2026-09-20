import type { InstanceConfiguration, CreateInstancePayload, UpdateInstancePayload, ModLoaderType } from './instance'
import type { SystemEnvironment } from './system'
import type { AuthState, StoredAccount } from './auth'
import type { LaunchProgressEvent, LaunchLogEvent } from './launch'

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

export interface AuthActions {
  getState: () => Promise<AuthState>
  loginMicrosoft: () => Promise<StoredAccount>
  loginOffline: (username: string) => Promise<StoredAccount>
  logout: (accountId: string) => Promise<boolean>
  switchAccount: (accountId: string) => Promise<StoredAccount | null>
}

export interface LaunchActions {
  start: (instanceId: string) => Promise<boolean>
  stop: (instanceId: string) => Promise<boolean>
  onProgress: (callback: (event: LaunchProgressEvent) => void) => () => void
  onLog: (callback: (event: LaunchLogEvent) => void) => () => void
}

export interface MetaActions {
  getVersions: () => Promise<string[]>
  getLoaderVersions: (loaderType: ModLoaderType, minecraftVersion: string) => Promise<string[]>
}

export interface SystemActions {
  getEnvironment: () => Promise<SystemEnvironment>
  openExternalUrl: (url: string) => Promise<void>
  openDirectory: (directoryPath: string) => Promise<void>
}

export interface LauncherAPI {
  window: WindowControlActions
  instances: InstanceActions
  auth: AuthActions
  launch: LaunchActions
  meta: MetaActions
  system: SystemActions
}
