import type { LibraryDownload, VersionArguments } from './manifest'

export interface PrismVersionRequirement {
  uid: string
  equals?: string
  suggests?: string
}

export interface PrismVersionListItem {
  version: string
  releaseTime: string
  requires?: PrismVersionRequirement[]
  type?: string
  recommended?: boolean
  sha256?: string
}

export interface PrismComponentIndex {
  formatVersion: number
  name: string
  uid: string
  versions: PrismVersionListItem[]
}

export interface PrismMavenFile {
  name: string
  downloads: {
    artifact: {
      path?: string
      sha1: string
      size: number
      url: string
    }
  }
}

export interface PrismComponentVersion {
  uid: string
  version: string
  name: string
  mainClass?: string
  libraries?: LibraryDownload[]
  mavenFiles?: PrismMavenFile[]
  minecraftArguments?: string
  arguments?: VersionArguments
  order?: number
  releaseTime?: string
  requires?: PrismVersionRequirement[]
}
