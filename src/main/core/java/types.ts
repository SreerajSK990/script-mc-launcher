export type MojangJavaComponent =
  | 'java-runtime-alpha'
  | 'java-runtime-beta'
  | 'java-runtime-gamma'
  | 'java-runtime-delta'
  | 'java-runtime-epsilon'
  | 'jre-legacy'

export interface MojangJavaManifestEntry {
  sha1: string
  size: number
  url: string
}

export interface MojangJavaProductVersion {
  availability: {
    group: number
    progress: number
  }
  manifest: MojangJavaManifestEntry
  version: {
    name: string
    released: string
  }
}

export interface MojangJavaAllProducts {
  [platform: string]: {
    [component: string]: MojangJavaProductVersion[]
  }
}

export interface MojangJavaFileDownload {
  sha1: string
  size: number
  url: string
}

export interface MojangJavaFileEntry {
  type: 'file' | 'directory'
  executable?: boolean
  downloads?: {
    raw?: MojangJavaFileDownload
    lzma?: MojangJavaFileDownload
  }
}

export interface MojangJavaFilesManifest {
  files: {
    [path: string]: MojangJavaFileEntry
  }
}

export interface ManagedJavaRuntimeInfo {
  component: string
  versionName: string
  majorVersion: number
  isInstalled: boolean
  executablePath: string
}
