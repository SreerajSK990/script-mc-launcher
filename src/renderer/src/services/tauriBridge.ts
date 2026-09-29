import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { LauncherAPI } from '@shared/types/ipc'
import type { LaunchProgressEvent, LaunchLogEvent } from '@shared/types/launch'

export function isRunningInTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
}

export function createTauriBridge(): LauncherAPI {
  return {
    window: {
      minimize: () => invoke('window_minimize'),
      maximize: () => invoke('window_maximize'),
      isMaximized: () => invoke('window_is_maximized'),
      close: () => invoke('window_close')
    },
    system: {
      pathForFile: (file: File) => (file as { path?: string }).path || file.name,
      getEnvironment: () => invoke('system_get_environment'),
      openExternal: (url: string) => invoke('system_open_external', { url }),
      openExternalUrl: (url: string) => invoke('system_open_external', { url }),
      openDirectory: (path: string) => invoke('system_open_directory', { dirPath: path }),
      selectFile: async () => null
    },
    instances: {
      list: () => invoke('instances_list'),
      get: (instanceId: string) => invoke('instances_get', { instanceId }),
      create: (payload) => invoke('instances_create', { payload }),
      update: (payload) => invoke('instances_update', { payload }),
      delete: (instanceId: string) => invoke('instances_delete', { instanceId }),
      openFolder: (instanceId: string) => invoke('instances_open_folder', { instanceId }),
      setGroup: (instanceId: string, group: string | null) =>
        invoke('instances_set_group', { instanceId, group }),
      renameGroup: (oldName: string, newName: string) =>
        invoke('instances_rename_group', { oldName, newName }),
      disbandGroup: (groupName: string) =>
        invoke('instances_disband_group', { groupName }),
      deleteGroup: (groupName: string) =>
        invoke('instances_delete_group', { groupName }),
      saveCustomIcon: (instanceId: string, dataUrl: string) =>
        invoke('instances_save_custom_icon', { instanceId, dataUrl }),
      toggleFavorite: (instanceId: string) =>
        invoke('instances_toggle_favorite', { instanceId }),
      repair: (instanceId: string) =>
        invoke('instances_repair', { instanceId }),
      backupSaves: (instanceId: string) =>
        invoke('instances_backup_saves', { instanceId }),
      clone: (instanceId: string, customName?: string) =>
        invoke('instances_clone', { instanceId, customName })
    },
    auth: {
      getState: () => invoke('auth_get_state'),
      loginMicrosoft: () => invoke('auth_login_microsoft'),
      loginOffline: (username: string) => invoke('auth_login_offline', { username }),
      logout: (accountId: string) => invoke('auth_logout', { accountId }),
      switchAccount: (accountId: string) => invoke('auth_switch_account', { accountId })
    },
    launch: {
      start: (instanceId: string) => invoke('launch_start', { instanceId }),
      quickPlay: (instanceId: string, options) =>
        invoke('launch_quick_play', { instanceId, options }),
      stop: (instanceId: string) => invoke('launch_stop', { instanceId }),
      onProgress: (callback) => {
        let unlisten: (() => void) | null = null
        listen<LaunchProgressEvent>('launch:status', (event) => callback(event.payload)).then(
          (fn) => {
            unlisten = fn
          }
        )
        return () => {
          if (unlisten) unlisten()
        }
      },
      onStatus: (callback) => {
        let unlisten: (() => void) | null = null
        listen<LaunchProgressEvent>('launch:status', (event) => callback(event.payload)).then(
          (fn) => {
            unlisten = fn
          }
        )
        return () => {
          if (unlisten) unlisten()
        }
      },
      onLog: (callback) => {
        let unlisten: (() => void) | null = null
        listen<LaunchLogEvent>('launch:log', (event) => callback(event.payload)).then((fn) => {
          unlisten = fn
        })
        return () => {
          if (unlisten) unlisten()
        }
      }
    },
    meta: {
      getVersions: () => invoke('meta_get_versions'),
      getLoaderVersions: (loaderType: string, minecraftVersion: string) =>
        invoke('meta_get_loader_versions', { loaderType, minecraftVersion })
    },
    mods: {
      search: async () => [],
      getDetail: async () => ({} as unknown as import('@shared/types/mods').ModDetail),
      getVersions: async () => [],
      install: async () => ({} as unknown as import('@shared/types/mods').InstalledModRecord),
      listInstalled: async () => [],
      toggleInstalled: async () => true,
      deleteInstalled: async () => true,
      setCurseForgeKey: async () => true,
      getCurseForgeKey: async () => null,
      checkUpdates: async () => [],
      updateAll: async () => ({ success: true, updatedCount: 0, failedCount: 0, errors: [], failures: [] }),
      installDropped: async () => ({ success: true, installedMods: [] }),
      onUpdateProgress: () => () => {}
    },
    modpacks: {
      selectFile: async () => null,
      inspect: async () => ({} as unknown as import('@shared/types/modpack').ModpackManifestInfo),
      import: async () => ({} as unknown as import('@shared/types/instance').InstanceConfiguration),
      installRemote: async () => ({} as unknown as import('@shared/types/instance').InstanceConfiguration),
      onProgress: () => () => {}
    },
    resourcepacks: {
      listInstalled: async () => [],
      install: async () => ({} as unknown as import('@shared/types/mods').InstalledResourcePackRecord),
      toggleInstalled: async () => true,
      deleteInstalled: async () => true,
      installDropped: async () => ({ success: true, installedPacks: [] }),
      openFolder: async () => {}
    },
    screenshots: {
      list: (instanceId: string) => invoke('screenshots_list', { instanceId }),
      delete: (instanceId: string, filename: string) =>
        invoke('screenshots_delete', { instanceId, filename }),
      openFolder: (instanceId: string) =>
        invoke('screenshots_open_folder', { instanceId })
    },
    externalLaunchers: {
      scanAll: async () => [],
      scanDirectory: async () => [],
      selectDirectory: async () => null,
      clone: async () => ({} as unknown as import('@shared/types/instance').InstanceConfiguration),
      onProgress: () => () => {}
    },
    java: {
      getRuntimes: () => invoke('java_get_runtimes'),
      downloadRuntime: (componentOrVersion: string) =>
        invoke('java_download_runtime', { componentOrVersion })
    },
    fonts: {
      list: () => invoke('fonts_list'),
      install: (filePath: string) => invoke('fonts_install', { filePath }),
      delete: (fileName: string) => invoke('fonts_delete', { fileName })
    },
    servers: {
      listAll: () => invoke('servers_list_all'),
      listForInstance: (instanceId: string) =>
        invoke('servers_list_instance', { instanceId }),
      add: (payload) => invoke('servers_add', { payload }),
      remove: (payload) => invoke('servers_remove', { payload }),
      ping: (host: string, port?: number) =>
        invoke('servers_ping', { host, port })
    },
    skins: {
      list: async () => ({ activeSkinId: null, skins: [] }),
      getActive: async () => null,
      apply: async () => ({} as unknown as import('@shared/types/skins').ApplySkinResult),
      save: async () => ({} as unknown as import('@shared/types/skins').SkinEntry),
      delete: async () => true,
      searchPlayer: async () => ({} as unknown as import('@shared/types/skins').PlayerSkinSearchResult),
      listCapes: async () => ({ activeCapeId: null, capes: [] }),
      applyCape: async () => ({} as unknown as import('@shared/types/skins').ApplyCapeResult),
      saveCape: async () => ({} as unknown as import('@shared/types/skins').CapeEntry),
      deleteCape: async () => true,
      searchOptifineCape: async () => null
    },
    gameSettings: {
      get: (instanceId: string) => invoke('game_settings_get', { instanceId }),
      save: (instanceId: string, payload) =>
        invoke('game_settings_save', { instanceId, payload }),
      openFile: (instanceId: string, fileType: 'options' | 'sodium' | 'optifine') =>
        invoke('game_settings_open_file', { instanceId, fileType })
    },
    updater: {
      checkForUpdates: async () => ({} as unknown as import('@shared/types/updater').UpdateCheckResult),
      quitAndInstall: async () => {},
      onStatus: () => () => {},
      onProgress: () => () => {},
      onDownloaded: () => () => {}
    },
    discord: {
      setActivity: async () => {},
      clearActivity: async () => {}
    },
    content: {
      planMods: async () => ({} as unknown as import('@shared/types/operations').OperationResult<import('@shared/types/operations').DependencyPlan>),
      listBackups: async () => ({ success: true, data: [] }),
      backupSaves: async () => ({} as unknown as import('@shared/types/operations').OperationResult<import('@shared/types/operations').BackupEntry>),
      restoreBackup: async () => ({ success: true, data: undefined }),
      getRecoverySettings: async () => ({} as unknown as import('@shared/types/operations').OperationResult<import('@shared/types/operations').RecoverySettings>),
      saveRecoverySettings: async () => ({ success: true, data: undefined }),
      listShaders: async () => ({ success: true, data: [] }),
      installShader: async () => ({} as unknown as import('@shared/types/operations').OperationResult<import('@shared/types/operations').ShaderPack>),
      importShaders: async () => ({ success: true, data: [] }),
      deleteShader: async () => ({ success: true, data: undefined }),
      shaderEnvironment: async () => ({} as unknown as import('@shared/types/operations').OperationResult<import('@shared/types/operations').ShaderEnvironment>),
      openShaderFolder: async () => ({ success: true, data: undefined }),
      cancelTransfer: async () => ({ success: true, data: undefined }),
      onTransfer: () => () => {}
    }
  }
}

export function initTauriBridge(): void {
  if (typeof window !== 'undefined' && !window.launcherAPI) {
    if (isRunningInTauri()) {
      window.launcherAPI = createTauriBridge()
    }
  }
}
