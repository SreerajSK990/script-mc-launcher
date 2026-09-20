export interface SystemMemoryInfo {
  totalMegabytes: number
  freeMegabytes: number
  recommendedAllocationMegabytes: number
}

export interface OperatingSystemInfo {
  platform: 'windows' | 'macos' | 'linux'
  architecture: string
  release: string
}

export interface SystemEnvironment {
  memory: SystemMemoryInfo
  os: OperatingSystemInfo
  defaultJavaPath: string | null
  appDataDirectory: string
}
