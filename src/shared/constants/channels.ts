export const IPC_CHANNELS = {
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_CLOSE: 'window:close',

  INSTANCES_LIST: 'instances:list',
  INSTANCES_GET: 'instances:get',
  INSTANCES_CREATE: 'instances:create',
  INSTANCES_UPDATE: 'instances:update',
  INSTANCES_DELETE: 'instances:delete',
  INSTANCES_OPEN_FOLDER: 'instances:open-folder',

  AUTH_GET_STATE: 'auth:get-state',
  AUTH_LOGIN_MICROSOFT: 'auth:login-microsoft',
  AUTH_LOGIN_OFFLINE: 'auth:login-offline',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_SWITCH_ACCOUNT: 'auth:switch-account',

  LAUNCH_START: 'launch:start',
  LAUNCH_STOP: 'launch:stop',
  LAUNCH_STATUS_EVENT: 'launch:status',
  LAUNCH_LOG_EVENT: 'launch:log',

  META_GET_VERSIONS: 'meta:get-versions',
  META_GET_LOADER_VERSIONS: 'meta:get-loader-versions',

  SYSTEM_GET_ENVIRONMENT: 'system:get-environment',
  SYSTEM_OPEN_EXTERNAL: 'system:open-external',
  SYSTEM_OPEN_DIRECTORY: 'system:open-directory',

  MODS_SEARCH: 'mods:search',
  MODS_GET_VERSIONS: 'mods:get-versions',
  MODS_INSTALL: 'mods:install',
  MODS_LIST_INSTALLED: 'mods:list-installed',
  MODS_TOGGLE_INSTALLED: 'mods:toggle-installed',
  MODS_DELETE_INSTALLED: 'mods:delete-installed',
  MODS_SET_CURSEFORGE_KEY: 'mods:set-curseforge-key',
  MODS_GET_CURSEFORGE_KEY: 'mods:get-curseforge-key',

  JAVA_GET_RUNTIMES: 'java:get-runtimes',
  JAVA_DOWNLOAD_RUNTIME: 'java:download-runtime'
} as const
