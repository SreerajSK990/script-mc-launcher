import type { ModLoaderType } from './instance'

export type ModSource = 'modrinth' | 'curseforge'

export interface ModSearchResult {
  id: string
  slug: string
  name: string
  author: string
  description: string
  iconUrl?: string
  downloads: number
  source: ModSource
  categories: string[]
  loaders: ModLoaderType[]
  projectType?: 'mod' | 'modpack'
  latestVersion?: string
  clientSide?: 'required' | 'optional' | 'unsupported'
  serverSide?: 'required' | 'optional' | 'unsupported'
}

export interface ModVersionFile {
  id: string
  projectId: string
  name: string
  versionNumber: string
  gameVersions: string[]
  loaders: ModLoaderType[]
  downloadUrl: string
  filename: string
  sizeBytes: number
  sha512?: string
  sha1?: string
  releaseType: 'release' | 'beta' | 'alpha'
  datePublished: string
  changelog?: string
}

export interface InstalledModRecord {
  id: string
  name: string
  version: string
  filename: string
  source: ModSource
  iconUrl?: string
  installedAt: string
  enabled: boolean
  fileSizeBytes: number
  gameVersion?: string
  loader?: ModLoaderType
}

export interface ModSearchParams {
  query?: string
  minecraftVersion?: string
  loader?: ModLoaderType
  projectType?: 'mod' | 'modpack'
  source?: 'all' | 'modrinth' | 'curseforge'
  category?: string
  limit?: number
  offset?: number
}

export interface InstallModPayload {
  instanceId: string
  versionFile: ModVersionFile
  modMetadata: {
    id: string
    name: string
    source: ModSource
    iconUrl?: string
  }
}
