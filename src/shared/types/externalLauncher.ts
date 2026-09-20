import type { ModLoaderType } from './instance'

export type ExternalLauncherType =
  | 'prism'
  | 'curseforge'
  | 'modrinth'
  | 'vanilla'
  | 'multimc'
  | 'custom'

export interface DiscoveredExternalInstance {
  id: string
  name: string
  launcherType: ExternalLauncherType
  launcherName: string
  minecraftVersion: string
  loaderType: ModLoaderType
  loaderVersion?: string | null
  sourcePath: string
  gameDirectory: string
  iconDataUrl?: string
  totalModCount: number
  hasSaves: boolean
  savesCount: number
  ramAllocationMegabytes?: number
  jvmArguments?: string[]
}

export interface CloneInstancePayload {
  sourceInstance: DiscoveredExternalInstance
  customName?: string
  copySaves: boolean
}

export interface CloneProgressEvent {
  step:
    | 'reading'
    | 'copying-configs'
    | 'copying-mods'
    | 'copying-saves'
    | 'finalizing'
    | 'completed'
    | 'failed'
  message: string
  current: number
  total: number
  percentage: number
}
