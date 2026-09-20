export const LAUNCHER_METADATA = {
  NAME: 'Script Launcher',
  VERSION: '0.9.0',
  DATA_DIRECTORY_NAME: '.scriptlauncher'
} as const

export const DEFAULT_INSTANCE_SETTINGS = {
  MINECRAFT_VERSION: '1.21.1',
  LOADER_TYPE: 'vanilla' as const,
  RAM_ALLOCATION_MB: 4096,
  MIN_RAM_ALLOCATION_MB: 1024,
  MAX_RAM_ALLOCATION_MB: 32768,
  JVM_ARGUMENTS: [
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    '-XX:G1NewSizePercent=30',
    '-XX:G1MaxNewSizePercent=40',
    '-XX:G1ReservePercent=20',
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:InitiatingHeapOccupancyPercent=15',
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1'
  ]
} as const
