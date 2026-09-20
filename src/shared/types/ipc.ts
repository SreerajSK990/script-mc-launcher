import type { InstanceConfiguration, CreateInstancePayload, UpdateInstancePayload, ModLoaderType } from './instance'
import type { SystemEnvironment } from './system'
import type { AuthState, StoredAccount } from './auth'
import type { LaunchProgressEvent, LaunchLogEvent } from './launch'
import type {
  ModSearchResult,
  ModVersionFile,
  ModSearchParams,
  InstallModPayload,
  InstalledModRecord,
  ModSource
} from './mods'
import type {
  ModpackManifestInfo,
  ModpackImportProgressEvent,
  InstallRemoteModpackPayload
} from './modpack'
import type { ScreenshotEntry } from './screenshot'

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
  selectFile: (options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>
}

export interface ModActions {
  search: (params: ModSearchParams) => Promise<ModSearchResult[]>
  getVersions: (
    projectId: string,
    source: ModSource,
    minecraftVersion?: string,
    loader?: ModLoaderType
  ) => Promise<ModVersionFile[]>
  install: (payload: InstallModPayload) => Promise<InstalledModRecord>
  listInstalled: (instanceId: string) => Promise<InstalledModRecord[]>
  toggleInstalled: (instanceId: string, filename: string, enable: boolean) => Promise<boolean>
  deleteInstalled: (instanceId: string, filename: string) => Promise<boolean>
  setCurseForgeKey: (key: string | null) => Promise<boolean>
  getCurseForgeKey: () => Promise<string | null>
}

export interface ModpackActions {
  selectFile: () => Promise<string | null>
  inspect: (filePath: string) => Promise<ModpackManifestInfo>
  import: (filePath: string, customName?: string) => Promise<InstanceConfiguration>
  installRemote: (payload: InstallRemoteModpackPayload) => Promise<InstanceConfiguration>
  onProgress: (callback: (event: ModpackImportProgressEvent) => void) => () => void
}

export interface ScreenshotActions {
  list: (instanceId: string) => Promise<ScreenshotEntry[]>
  delete: (instanceId: string, filename: string) => Promise<boolean>
  openFolder: (instanceId: string) => Promise<void>
}

export interface JavaActions {
  getRuntimes: () => Promise<
    Array<{
      component: string
      versionName: string
      majorVersion: number
      isInstalled: boolean
      executablePath: string
    }>
  >
  downloadRuntime: (componentOrVersion: string) => Promise<string>
}

export interface LauncherAPI {
  window: WindowControlActions
  instances: InstanceActions
  auth: AuthActions
  launch: LaunchActions
  meta: MetaActions
  system: SystemActions
  mods: ModActions
  modpacks: ModpackActions
  screenshots: ScreenshotActions
  java: JavaActions
}
