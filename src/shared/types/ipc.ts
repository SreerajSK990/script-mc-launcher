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
  ModSource,
  ModUpdateInfo
} from './mods'
import type {
  ModpackManifestInfo,
  ModpackImportProgressEvent,
  InstallRemoteModpackPayload
} from './modpack'
import type { ScreenshotEntry } from './screenshot'
import type {
  DiscoveredExternalInstance,
  CloneInstancePayload,
  CloneProgressEvent
} from './externalLauncher'
import type { CustomFontEntry } from './fonts'
import type { QuickPlayTarget, ServerPingStatus, QuickPlayLaunchOptions } from './servers'
import type { SkinEntry, SkinModelType, PlayerSkinSearchResult, ApplySkinResult } from './skins'

export interface WindowControlActions {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  isMaximized: () => Promise<boolean>
  close: () => Promise<void>
}

export interface InstanceActions {
  list: () => Promise<InstanceConfiguration[]>
  get: (id: string) => Promise<InstanceConfiguration | null>
  create: (payload: CreateInstancePayload) => Promise<InstanceConfiguration>
  update: (payload: UpdateInstancePayload) => Promise<InstanceConfiguration>
  delete: (id: string) => Promise<boolean>
  openFolder: (id: string) => Promise<void>
  setGroup: (instanceId: string, group: string | null) => Promise<InstanceConfiguration>
  renameGroup: (oldName: string, newName: string) => Promise<void>
  disbandGroup: (groupName: string) => Promise<void>
  deleteGroup: (groupName: string) => Promise<void>
  saveCustomIcon: (instanceId: string, dataUrl: string) => Promise<string>
  toggleFavorite: (instanceId: string) => Promise<InstanceConfiguration>
}



export interface AuthActions {
  getState: () => Promise<AuthState>
  loginMicrosoft: () => Promise<StoredAccount>
  loginOffline: (username: string) => Promise<StoredAccount>
  logout: (accountId: string) => Promise<AuthState>
  switchAccount: (accountId: string) => Promise<AuthState>
}

export interface LaunchActions {
  start: (instanceId: string) => Promise<void>
  quickPlay: (instanceId: string, options: QuickPlayLaunchOptions) => Promise<boolean>
  stop: (instanceId: string) => Promise<void>
  onProgress: (callback: (event: LaunchProgressEvent) => void) => () => void
  onStatus: (callback: (event: LaunchProgressEvent) => void) => () => void
  onLog: (callback: (event: LaunchLogEvent) => void) => () => void
}

export interface MetaActions {
  getVersions: () => Promise<string[]>
  getLoaderVersions: (loader: ModLoaderType, minecraftVersion: string) => Promise<string[]>
}

export interface SystemActions {
  getEnvironment: () => Promise<SystemEnvironment>
  openExternal: (url: string) => Promise<void>
  openExternalUrl: (url: string) => Promise<void>
  openDirectory: (path: string) => Promise<void>
  selectFile: (options?: {
    title?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }) => Promise<string | null>
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
  checkUpdates: (instanceId: string) => Promise<ModUpdateInfo[]>
  updateAll: (
    instanceId: string,
    updates: ModUpdateInfo[]
  ) => Promise<{ success: boolean; updatedCount: number }>
  installDropped: (
    instanceId: string,
    filePaths: string[]
  ) => Promise<{ success: boolean; installedMods: InstalledModRecord[] }>
  onUpdateProgress: (
    callback: (event: { message: string; current: number; total: number }) => void
  ) => () => void
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

export interface ExternalLauncherActions {
  scanAll: () => Promise<DiscoveredExternalInstance[]>
  scanDirectory: (directoryPath: string) => Promise<DiscoveredExternalInstance[]>
  selectDirectory: () => Promise<string | null>
  clone: (payload: CloneInstancePayload) => Promise<InstanceConfiguration>
  onProgress: (callback: (event: CloneProgressEvent) => void) => () => void
}

export interface FontActions {
  list: () => Promise<CustomFontEntry[]>
  install: (filePath: string) => Promise<CustomFontEntry>
  delete: (fileName: string) => Promise<boolean>
}

export interface ServerActions {
  listAll: () => Promise<QuickPlayTarget[]>
  ping: (host: string, port?: number) => Promise<ServerPingStatus>
}

export interface SkinActions {
  list: () => Promise<{ activeSkinId: string | null; skins: SkinEntry[] }>
  getActive: () => Promise<string | null>
  apply: (skinId: string) => Promise<ApplySkinResult>
  save: (params: {
    name: string
    textureData: string
    model: SkinModelType
    source: 'custom' | 'player'
    author?: string
  }) => Promise<SkinEntry>
  delete: (skinId: string) => Promise<boolean>
  searchPlayer: (username: string) => Promise<PlayerSkinSearchResult>
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
  externalLaunchers: ExternalLauncherActions
  java: JavaActions
  fonts: FontActions
  servers: ServerActions
  skins: SkinActions
}
