import type { ModLoaderType } from './instance'
import type { ModVersionFile } from './mods'

export type ModpackFormat = 'modrinth' | 'curseforge'

export interface ModpackManifestInfo {
  name: string
  versionName?: string
  summary?: string
  minecraftVersion: string
  loaderType: ModLoaderType
  loaderVersion?: string
  fileCount: number
  format: ModpackFormat
}

export interface ModpackImportProgressEvent {
  step: 'extracting' | 'resolving' | 'downloading' | 'finalizing' | 'completed' | 'failed'
  message: string
  current: number
  total: number
  percentage: number
}

export interface InstallRemoteModpackPayload {
  source: 'modrinth' | 'curseforge'
  projectId: string
  versionFile: ModVersionFile
  customInstanceName?: string
}
