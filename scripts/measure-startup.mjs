import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

if (process.versions.electron) {
  const { app } = await import('electron')
  const profile = join(process.env.LAUNCHER_DATA_DIR, 'electron-profile')
  await mkdir(profile, { recursive: true })
  app.setPath('userData', profile)
  app.on('browser-window-created', (_event, window) => {
    window.once('ready-to-show', () => {
      console.log('STARTUP_READY')
      setTimeout(() => app.quit(), 0)
    })
  })
  await import(pathToFileURL(resolve('out/main/index.js')).href)
} else {
  const { default: electronPath } = await import('electron')
  const samples = []
  for (let sample = 0; sample < 3; sample++) {
    const sandbox = await mkdtemp(join(tmpdir(), 'script-startup-'))
    try {
      const milliseconds = await new Promise((accept, reject) => {
        const start = performance.now()
        const env = { ...process.env, LAUNCHER_DATA_DIR: sandbox, ELECTRON_RENDERER_URL: '' }
        delete env.ELECTRON_RUN_AS_NODE
        const child = spawn(electronPath, [resolve('scripts/measure-startup.mjs')], {
          env,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        let output = ''
        let ready
        let errors = ''
        const timeout = setTimeout(() => {
          child.kill()
          reject(new Error('Launcher did not become ready in 20 seconds'))
        }, 20000)
        child.stdout.on('data', (chunk) => {
          output += chunk.toString()
          if (ready === undefined && output.includes('STARTUP_READY')) ready = performance.now() - start
        })
        child.stderr.on('data', (chunk) => {
          errors += chunk.toString()
        })
        child.on('error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })
        child.on('exit', () => {
          clearTimeout(timeout)
          if (ready === undefined) reject(new Error(`Launcher exited before showing its window: ${errors}`))
          else accept(ready)
        })
      })
      samples.push(Math.round(milliseconds))
    } finally {
      if (!resolve(sandbox).startsWith(resolve(tmpdir()) + sep))
        throw new Error('Refusing cleanup outside the test directory')
      await rm(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }
  console.log(
    JSON.stringify({
      samplesMs: samples,
      medianMs: [...samples].sort((a, b) => a - b)[1],
      measurement: 'Process spawn to ready-to-show, new temporary profile per sample'
    })
  )
}
