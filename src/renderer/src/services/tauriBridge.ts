import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { LauncherAPI } from '@shared/types/ipc'
import type { LaunchProgressEvent, LaunchLogEvent } from '@shared/types/launch'

export function isRunningInTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
}

async function wrapOp<T>(promise: Promise<T>): Promise<import('@shared/types/operations').OperationResult<T>> {
  try {
    return { success: true, data: await promise }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
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
      search: (params) => invoke('mods_search', { params }),
      getDetail: (source, id) => invoke('mods_get_detail', { source, id }),
      getVersions: (projectId, source, minecraftVersion, loader) =>
        invoke('mods_get_versions', { projectId, source, minecraftVersion, loader }),
      install: (payload) => invoke('mods_install', { payload }),
      listInstalled: (instanceId) => invoke('mods_list_installed', { instanceId }),
      toggleInstalled: (instanceId, filename, enable) =>
        invoke('mods_toggle_installed', { instanceId, filename, enable }),
      deleteInstalled: (instanceId, filename) =>
        invoke('mods_delete_installed', { instanceId, filename }),
      setCurseForgeKey: (key) => invoke('mods_set_curseforge_key', { key }),
      getCurseForgeKey: () => invoke('mods_get_curseforge_key'),
      checkUpdates: (instanceId, forceRefresh) =>
        invoke('mods_check_updates', { instanceId, forceRefresh }),
      updateAll: (instanceId, updates) =>
        invoke('mods_update_all', { instanceId, updates }),
      installDropped: (instanceId, filePaths) =>
        invoke('mods_install_dropped', { instanceId, filePaths }),
      onUpdateProgress: () => () => {}
    },
    modpacks: {
      selectFile: () =>
        new Promise<string | null>((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.mrpack,.zip'
          input.onchange = () => {
            const file = input.files?.[0]
            if (!file) return resolve(null)
            const filePath = (file as { path?: string }).path
            resolve(filePath || null)
          }
          input.oncancel = () => resolve(null)
          input.click()
        }),
      inspect: (filePath: string) => invoke('modpacks_inspect', { filePath }),
      import: (filePath: string, customName?: string) =>
        invoke('modpacks_import', { filePath, customName }),
      installRemote: (payload) => invoke('modpacks_install_remote', { payload }),
      onProgress: (callback) => {
        let unlisten: (() => void) | undefined
        listen<import('@shared/types/modpack').ModpackImportProgressEvent>(
          'modpacks:progress-event',
          (event) => callback(event.payload)
        ).then((u) => {
          unlisten = u
        })
        return () => {
          unlisten?.()
        }
      }
    },
    resourcepacks: {
      listInstalled: (instanceId) => invoke('resourcepacks_list_installed', { instanceId }),
      install: (payload) => invoke('resourcepacks_install', { payload }),
      toggleInstalled: (instanceId, filename, enable) =>
        invoke('resourcepacks_toggle_installed', { instanceId, filename, enable }),
      deleteInstalled: (instanceId, filename) =>
        invoke('resourcepacks_delete_installed', { instanceId, filename }),
      installDropped: (instanceId, filePaths) =>
        invoke('resourcepacks_install_dropped', { instanceId, filePaths }),
      openFolder: (instanceId) => invoke('resourcepacks_open_folder', { instanceId })
    },
    screenshots: {
      list: (instanceId: string) => invoke('screenshots_list', { instanceId }),
      delete: (instanceId: string, filename: string) =>
        invoke('screenshots_delete', { instanceId, filename }),
      openFolder: (instanceId: string) =>
        invoke('screenshots_open_folder', { instanceId })
    },
    externalLaunchers: {
      scanAll: () => invoke('launchers_scan_all'),
      scanDirectory: (directoryPath: string) =>
        invoke('launchers_scan_directory', { directoryPath }),
      selectDirectory: () =>
        new Promise<string | null>((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.setAttribute('webkitdirectory', 'true')
          input.onchange = () => {
            const file = input.files?.[0]
            if (!file) return resolve(null)
            const filePath = (file as { path?: string }).path
            if (!filePath) return resolve(null)
            const parent = filePath.replace(/[\\/][^\\/]+$/, '')
            resolve(parent || filePath)
          }
          input.oncancel = () => resolve(null)
          input.click()
        }),
      clone: (payload) => invoke('launchers_clone', { payload }),
      onProgress: (callback) => {
        let unlisten: (() => void) | undefined
        listen<import('@shared/types/externalLauncher').CloneProgressEvent>(
          'launchers:clone-progress-event',
          (event) => callback(event.payload)
        ).then((u) => {
          unlisten = u
        })
        return () => {
          unlisten?.()
        }
      }
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
      list: () => invoke('skins_list'),
      getActive: () => invoke('skins_get_active'),
      apply: (skinId: string) => invoke('skins_apply', { skinId }),
      save: (params) => invoke('skins_save', { params }),
      delete: (skinId: string) => invoke('skins_delete', { skinId }),
      searchPlayer: (username: string) => invoke('skins_search_player', { username }),
      listCapes: () => invoke('skins_list_capes'),
      applyCape: (capeId: string | null) => invoke('skins_apply_cape', { capeId }),
      saveCape: (params: { name: string; textureData: string }) =>
        invoke('skins_save_cape', { name: params.name, textureData: params.textureData }),
      deleteCape: (capeId: string) => invoke('skins_delete_cape', { capeId }),
      searchOptifineCape: (username: string) =>
        invoke('skins_search_optifine_cape', { username })
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
      planMods: (payloads) => wrapOp(invoke('content_plan_mods', { payloads })),
      listBackups: (instanceId: string) => wrapOp(invoke('content_list_backups', { instanceId })),
      backupSaves: (instanceId: string) => wrapOp(invoke('content_backup_saves', { instanceId })),
      restoreBackup: (instanceId: string, id: string) => wrapOp(invoke('content_restore_backup', { instanceId, backupId: id })),
      getRecoverySettings: (instanceId: string) => wrapOp(invoke('content_get_recovery_settings', { instanceId })),
      saveRecoverySettings: (instanceId: string, settings) => wrapOp(invoke('content_save_recovery_settings', { instanceId, settings })),
      listShaders: (instanceId: string) => wrapOp(invoke('content_list_shaders', { instanceId })),
      installShader: (payload) => wrapOp(invoke('content_install_shader', { payload })),
      importShaders: (instanceId: string, paths: string[]) => wrapOp(invoke('content_import_shaders', { instanceId, filePaths: paths })),
      deleteShader: (instanceId: string, filename: string) => wrapOp(invoke('content_delete_shader', { instanceId, filename })),
      shaderEnvironment: (instanceId: string) => wrapOp(invoke('content_shader_environment', { instanceId })),
      openShaderFolder: (instanceId: string) => wrapOp(invoke('content_open_shader_folder', { instanceId })),
      cancelTransfer: async (_instanceId: string) => ({ success: true, data: undefined }),
      onTransfer: (callback) => {
        let unlisten: (() => void) | undefined
        listen<import('@shared/types/operations').TransferProgress>('content:transfer-progress', (event) => callback(event.payload)).then((u) => {
          unlisten = u
        })
        return () => {
          unlisten?.()
        }
      }
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
