import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'

export interface LaunchProcessOptions {
  javaExecutable: string
  workingDirectory: string
  jvmArguments: string[]
  mainClass: string
  gameArguments: string[]
  onLog: (line: string, level: 'info' | 'warn' | 'error') => void
  onExit: (exitCode: number | null) => void
}

export interface RunningProcessHandle {
  process: ChildProcess
  kill: () => void
}

function determineLogLevel(line: string): 'info' | 'warn' | 'error' {
  const upper = line.toUpperCase()
  if (upper.includes('/ERROR') || upper.includes('FATAL') || upper.includes('EXCEPTION')) {
    return 'error'
  }
  if (upper.includes('/WARN')) {
    return 'warn'
  }
  return 'info'
}

export function spawnMinecraftProcess(options: LaunchProcessOptions): RunningProcessHandle {
  const allArguments = [
    ...options.jvmArguments,
    options.mainClass,
    ...options.gameArguments
  ]

  const child = spawn(options.javaExecutable, allArguments, {
    cwd: options.workingDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  })

  if (child.stdout) {
    const stdoutLineReader = createInterface({ input: child.stdout })
    stdoutLineReader.on('line', (line) => {
      options.onLog(line, determineLogLevel(line))
    })
  }

  if (child.stderr) {
    const stderrLineReader = createInterface({ input: child.stderr })
    stderrLineReader.on('line', (line) => {
      options.onLog(line, determineLogLevel(line))
    })
  }

  let exitReported = false
  const reportExit = (code: number | null) => {
    if (exitReported) return
    exitReported = true
    options.onExit(code)
  }

  child.on('error', (err) => {
    options.onLog(`Failed to start Java process: ${err.message}`, 'error')
    reportExit(-1)
  })

  child.on('close', (code) => {
    reportExit(code)
  })

  return {
    process: child,
    kill: () => {
      try {
        child.kill()
      } catch {
        // Ignored
      }
    }
  }
}
