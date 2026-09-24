import type { InstallModPayload, ModSource } from './mods'

export type OperationResult<T> = { success: true; data: T } | { success: false; error: string }

export interface DependencyPlan {
  items: InstallModPayload[]
  reused: string[]
  reusedItems: InstallModPayload[]
  warnings: string[]
}

export interface ModUpdateResult {
  success: boolean
  updatedCount: number
  failures: { modId: string; source: ModSource; name: string; error: string }[]
  error?: string
}

export interface BackupEntry {
  id: string
  kind: 'mods' | 'saves'
  createdAt: string
  label: string
  sizeBytes: number
}

export interface RecoverySettings {
  keepBackups: number
  backupAfterPlay: boolean
}

export interface TransferProgress {
  completed?: boolean
  instanceId: string
  transferred: number
  total?: number
  bytesPerSecond: number
}

export interface ShaderPack {
  shaderLoaders?: string[]
  id: string
  name: string
  filename: string
  version: string
  source?: ModSource
  sizeBytes: number
}

export interface ShaderEnvironment {
  installed: string[]
  recommendedProject?: string
  message: string
}
