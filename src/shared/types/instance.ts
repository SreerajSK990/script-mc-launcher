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
  icon?: string
  bannerPath?: string
  group?: string | null
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
  icon?: string
  group?: string | null
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
  icon?: string
  group?: string | null
  lastPlayedAt?: string | null
  totalPlayTimeMinutes?: number
}

