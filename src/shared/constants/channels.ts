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
  SYSTEM_SELECT_FILE: 'system:select-file',

  MODS_SEARCH: 'mods:search',
  MODS_GET_VERSIONS: 'mods:get-versions',
  MODS_INSTALL: 'mods:install',
  MODS_LIST_INSTALLED: 'mods:list-installed',
  MODS_TOGGLE_INSTALLED: 'mods:toggle-installed',
  MODS_DELETE_INSTALLED: 'mods:delete-installed',
  MODS_SET_CURSEFORGE_KEY: 'mods:set-curseforge-key',
  MODS_GET_CURSEFORGE_KEY: 'mods:get-curseforge-key',

  MODPACKS_SELECT_FILE: 'modpacks:select-file',
  MODPACKS_INSPECT: 'modpacks:inspect',
  MODPACKS_IMPORT: 'modpacks:import',
  MODPACKS_INSTALL_REMOTE: 'modpacks:install-remote',
  MODPACKS_PROGRESS_EVENT: 'modpacks:progress',

  SCREENSHOTS_LIST: 'screenshots:list',
  SCREENSHOTS_DELETE: 'screenshots:delete',
  SCREENSHOTS_OPEN_FOLDER: 'screenshots:open-folder',

  JAVA_GET_RUNTIMES: 'java:get-runtimes',
  JAVA_DOWNLOAD_RUNTIME: 'java:download-runtime',

  LAUNCHERS_SCAN_ALL: 'launchers:scan-all',
  LAUNCHERS_SCAN_DIRECTORY: 'launchers:scan-directory',
  LAUNCHERS_SELECT_DIRECTORY: 'launchers:select-directory',
  LAUNCHERS_CLONE: 'launchers:clone',
  LAUNCHERS_CLONE_PROGRESS_EVENT: 'launchers:clone-progress',

  FONTS_LIST: 'fonts:list',
  FONTS_INSTALL: 'fonts:install',
  FONTS_DELETE: 'fonts:delete',

  MODS_CHECK_UPDATES: 'mods:check-updates',
  MODS_UPDATE_ALL: 'mods:update-all',
  MODS_UPDATE_PROGRESS_EVENT: 'mods:update-progress'
} as const
