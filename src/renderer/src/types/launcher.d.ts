import type { LauncherAPI } from '@shared/types/ipc'

declare global {
  interface Window {
    launcherAPI: LauncherAPI
  }
}

export {}
