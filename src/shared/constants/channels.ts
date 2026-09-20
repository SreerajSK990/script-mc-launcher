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

  SYSTEM_GET_ENVIRONMENT: 'system:get-environment',
  SYSTEM_OPEN_EXTERNAL: 'system:open-external',
  SYSTEM_OPEN_DIRECTORY: 'system:open-directory'
} as const
