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

  SYSTEM_GET_ENVIRONMENT: 'system:get-environment',
  SYSTEM_OPEN_EXTERNAL: 'system:open-external',
  SYSTEM_OPEN_DIRECTORY: 'system:open-directory'
} as const
