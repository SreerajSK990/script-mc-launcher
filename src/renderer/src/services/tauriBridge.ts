import { invoke } from '@tauri-apps/api/core'
import type { LauncherAPI } from '@shared/types/ipc'

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
      renameGroup: async () => {},
      disbandGroup: async () => {},
      deleteGroup: async () => {},
      saveCustomIcon: async () => '',
      toggleFavorite: (instanceId: string) => invoke('instances_toggle_favorite', { instanceId }),
      repair: async () => ({ success: true, message: 'Repaired' }),
      backupSaves: async () => ({ success: true, backupPath: '' }),
      clone: async () => invoke('instances_get', { instanceId: '' })
    },
    auth: {
      getState: async () => ({ accounts: [], activeAccountId: null, activeAccount: null }),
      loginMicrosoft: async () => {
        throw new Error('Microsoft authentication will be enabled in next migration step.')
      },
      loginOffline: async (username: string) => ({
        id: `offline-${username.toLowerCase()}`,
        username,
        uuid: '00000000-0000-0000-0000-000000000000',
        accessToken: 'offline',
        accountType: 'offline',
        refreshToken: null,
        expiresAt: 0,
        createdAt: new Date().toISOString()
      }),
      logout: async () => ({ accounts: [], activeAccountId: null, activeAccount: null }),
      switchAccount: async () => ({ accounts: [], activeAccountId: null, activeAccount: null })
    },
    launch: {
      start: async () => {},
      quickPlay: async () => true,
      stop: async () => {},
      onProgress: () => () => {},
      onStatus: () => () => {},
      onLog: () => () => {}
    },
    meta: {
      getVersions: async () => [],
      getLoaderVersions: async () => []
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
      list: async () => [],
      delete: async () => true,
      openFolder: async () => {}
    },
    externalLaunchers: {
      scanAll: async () => [],
      scanDirectory: async () => [],
      selectDirectory: async () => null,
      clone: async () => ({} as unknown as import('@shared/types/instance').InstanceConfiguration),
      onProgress: () => () => {}
    },
    java: {
      getRuntimes: async () => [],
      downloadRuntime: async () => ''
    },
    fonts: {
      list: async () => [],
      install: async () => ({} as unknown as import('@shared/types/fonts').CustomFontEntry),
      delete: async () => true
    },
    servers: {
      listAll: async () => [],
      listForInstance: async () => [],
      add: async () => [],
      remove: async () => [],
      ping: async () => ({
        online: false,
        latencyMs: 0,
        version: '',
        protocol: 0,
        players: { max: 0, online: 0 },
        motd: ''
      })
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
      get: async () => ({} as unknown as import('@shared/types/settings').GameSettingsPayload),
      save: async () => true,
      openFile: async () => {}
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
