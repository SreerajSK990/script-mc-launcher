export type LaunchProgressStep =
  | 'IDLE'
  | 'FETCHING_METADATA'
  | 'VERIFYING_LIBRARIES'
  | 'DOWNLOADING_LIBRARIES'
  | 'EXTRACTING_NATIVES'
  | 'VERIFYING_ASSETS'
  | 'DOWNLOADING_ASSETS'
  | 'BUILDING_ARGUMENTS'
  | 'STARTING_JAVA'
  | 'RUNNING'
  | 'COMPLETED'
  | 'CRASHED'
  | 'CANCELLED'

export interface LaunchProgressEvent {
  instanceId: string
  step: LaunchProgressStep
  statusText: string
  currentItems?: number
  totalItems?: number
  percentage?: number
}

export interface LaunchLogEvent {
  instanceId: string
  text: string
  level: 'info' | 'warn' | 'error'
  timestamp: string
}

export interface LaunchActiveState {
  instanceId: string
  isRunning: boolean
  step: LaunchProgressStep
  processId: number | null
}
