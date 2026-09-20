export type ModLoaderType = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

export interface InstanceConfiguration {
  id: string
  name: string
  minecraftVersion: string
  loaderType: ModLoaderType
  loaderVersion: string | null
  javaPath: string | null
  jvmArguments: string[]
  ramAllocationMegabytes: number
  iconPath?: string
  bannerPath?: string
  createdAt: string
  lastPlayedAt: string | null
  totalPlayTimeMinutes: number
}

export interface CreateInstancePayload {
  name: string
  minecraftVersion: string
  loaderType: ModLoaderType
  loaderVersion?: string | null
  ramAllocationMegabytes?: number
  javaPath?: string | null
  jvmArguments?: string[]
}

export interface UpdateInstancePayload {
  id: string
  name?: string
  minecraftVersion?: string
  loaderType?: ModLoaderType
  loaderVersion?: string | null
  javaPath?: string | null
  jvmArguments?: string[]
  ramAllocationMegabytes?: number
  lastPlayedAt?: string | null
  totalPlayTimeMinutes?: number
}
