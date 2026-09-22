export interface VersionManifestEntry {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  url: string
  time: string
  releaseTime: string
  sha1: string
  complianceLevel: number
}

export interface MinecraftVersionEntry {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releaseTime: string
}

export interface VersionManifest {
  latest: {
    release: string
    snapshot: string
  }
  versions: VersionManifestEntry[]
}

export interface DownloadArtifact {
  path?: string
  sha1: string
  size: number
  url: string
}

export interface LibraryRuleOs {
  name?: 'windows' | 'osx' | 'linux'
  version?: string
  arch?: string
}

export interface LibraryRule {
  action: 'allow' | 'disallow'
  os?: LibraryRuleOs
  features?: Record<string, boolean>
}

export interface LibraryDownload {
  name: string
  url?: string
  downloads?: {
    artifact?: DownloadArtifact
    classifiers?: Record<string, DownloadArtifact>
  }
  rules?: LibraryRule[]
  natives?: Record<string, string>
}

export interface AssetIndexInfo {
  id: string
  sha1: string
  size: number
  totalSize: number
  url: string
}

export interface VersionDownloads {
  client: DownloadArtifact
  server?: DownloadArtifact
  client_mappings?: DownloadArtifact
  server_mappings?: DownloadArtifact
}

export type ArgumentValue = string | {
  rules: LibraryRule[]
  value: string | string[]
}

export interface VersionArguments {
  game?: ArgumentValue[]
  jvm?: ArgumentValue[]
}

export interface VersionPackage {
  id: string
  mainClass: string
  arguments?: VersionArguments
  minecraftArguments?: string
  assetIndex: AssetIndexInfo
  assets: string
  downloads: VersionDownloads
  libraries: LibraryDownload[]
  complianceLevel: number
  releaseTime: string
  time: string
  type: string
  javaVersion?: {
    component: string
    majorVersion: number
  }
}

export interface AssetObject {
  hash: string
  size: number
}

export interface AssetIndexMap {
  objects: Record<string, AssetObject>
}
