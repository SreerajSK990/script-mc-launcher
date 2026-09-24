import { AsyncLocalStorage } from 'node:async_hooks'
import type { TransferProgress } from '@shared/types/operations'
import { createHash, randomBytes } from 'node:crypto'
import { createWriteStream, promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { ensureDirectoryExists, doesPathExist } from '@main/utils/filesystem'

export interface DownloadTask {
  url: string
  destination: string
  sha1?: string
  sha512?: string
  size?: number
}

async function downloadFileAttempt(
  url: string,
  destinationPath: string,
  expectedHash?: string,
  hashAlgorithm: 'sha1' | 'sha512' = 'sha1'
): Promise<void> {
  if (await doesPathExist(destinationPath)) {
    if (expectedHash) {
      try {
        const existingFileBuffer = await fs.readFile(destinationPath)
        const existingHash = createHash(hashAlgorithm).update(existingFileBuffer).digest('hex')
        if (existingHash.toLowerCase() === expectedHash.toLowerCase()) {
          return
        }
      } catch {
        // Continue to download if reading fails
      }
    } else {
      try {
        const stats = await fs.stat(destinationPath)
        if (stats.size > 0) {
          return
        }
      } catch {
        // Continue to download
      }
    }
  }

  await ensureDirectoryExists(dirname(destinationPath))
  const randomSuffix = randomBytes(4).toString('hex')
  const temporaryFilePath = `${destinationPath}.${randomSuffix}.tmp`

  try {
    const context = transferContext.getStore()
    const controller = new AbortController()
    let timeout = setTimeout(() => controller.abort(new Error('Download stalled for 30 seconds')), 30000)
    const signal = context
      ? AbortSignal.any([controller.signal, context.controller.signal])
      : controller.signal
    const started = Date.now()
    let transferred = 0
    try {
      const response = await fetch(url, { signal })
      if (!response.ok || !response.body) {
        throw new DownloadHttpError(response.status)
      }

      const hashCalculator = createHash(hashAlgorithm)
      const fileWriteStream = createWriteStream(temporaryFilePath)

      const nodeReadable = Readable.fromWeb(response.body as import('stream/web').ReadableStream)

      nodeReadable.on('data', (chunk: Buffer) => {
        hashCalculator.update(chunk)
        transferred += chunk.length
        clearTimeout(timeout)
        timeout = setTimeout(() => controller.abort(new Error('Download stalled for 30 seconds')), 30000)
        if (context && Date.now() - context.lastProgress >= 150) {
          context.lastProgress = Date.now()
          context.onProgress({
            instanceId: context.instanceId,
            transferred,
            total: Number(response.headers.get('content-length')) || undefined,
            bytesPerSecond: transferred / Math.max(0.1, (Date.now() - started) / 1000)
          })
        }
      })

      await pipeline(nodeReadable, fileWriteStream, { signal })

      const computedHash = hashCalculator.digest('hex')

      if (expectedHash && computedHash.toLowerCase() !== expectedHash.toLowerCase()) {
        throw new Error(
          `${hashAlgorithm.toUpperCase()} mismatch for ${url}. Expected ${expectedHash}, computed ${computedHash}`
        )
      }

      signal.throwIfAborted()
      await fs.rename(temporaryFilePath, destinationPath)
    } finally {
      clearTimeout(timeout)
    }
  } finally {
    await fs.rm(temporaryFilePath, { force: true }).catch(() => {})
  }
}

export async function downloadFileWithSha1(
  url: string,
  destinationPath: string,
  expectedSha1?: string
): Promise<void> {
  return await downloadFileWithHash(url, destinationPath, expectedSha1, 'sha1')
}

export async function downloadBatch(
  tasks: DownloadTask[],
  maxConcurrency = 12,
  onProgress?: (completed: number, total: number, currentUrl: string) => void
): Promise<void> {
  const uniqueTasks: DownloadTask[] = []
  const seenDestinations = new Set<string>()

  for (const task of tasks) {
    if (!seenDestinations.has(task.destination)) {
      seenDestinations.add(task.destination)
      uniqueTasks.push(task)
    }
  }

  const total = uniqueTasks.length
  let completed = 0

  if (total === 0) {
    return
  }

  let taskIndex = 0

  async function worker(): Promise<void> {
    while (taskIndex < uniqueTasks.length) {
      const currentTaskIndex = taskIndex++
      const task = uniqueTasks[currentTaskIndex]
      if (!task) break

      if (task.sha512) {
        await downloadFileWithHash(task.url, task.destination, task.sha512, 'sha512')
      } else {
        await downloadFileWithSha1(task.url, task.destination, task.sha1)
      }
      completed++
      if (onProgress) {
        onProgress(completed, total, task.url)
      }
    }
  }

  const workerCount = Math.min(maxConcurrency, total)
  const workerPromises: Promise<void>[] = []

  for (let i = 0; i < workerCount; i++) {
    workerPromises.push(worker())
  }

  await Promise.all(workerPromises)
}

interface TransferContext {
  instanceId: string
  controller: AbortController
  onProgress: (progress: TransferProgress) => void
  lastProgress: number
}

const transferContext = new AsyncLocalStorage<TransferContext>()
const activeTransfers = new Map<string, AbortController>()

class DownloadHttpError extends Error {
  constructor(readonly status: number) {
    super(`Download failed: HTTP ${status}`)
  }
}

export async function withTransfer<T>(
  instanceId: string,
  onProgress: (progress: TransferProgress) => void,
  work: () => Promise<T>
): Promise<T> {
  if (activeTransfers.has(instanceId))
    throw new Error('Another download operation is active for this instance')
  const controller = new AbortController()
  activeTransfers.set(instanceId, controller)
  onProgress({ instanceId, transferred: 0, bytesPerSecond: 0 })
  try {
    return await transferContext.run({ instanceId, controller, onProgress, lastProgress: 0 }, work)
  } finally {
    activeTransfers.delete(instanceId)
    onProgress({ instanceId, transferred: 0, bytesPerSecond: 0, completed: true })
  }
}

export function cancelTransfer(instanceId: string): void {
  activeTransfers.get(instanceId)?.abort(new Error('Download cancelled'))
}

export async function downloadFileWithHash(
  url: string,
  destinationPath: string,
  expectedHash?: string,
  hashAlgorithm: 'sha1' | 'sha512' = 'sha1'
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    transferContext.getStore()?.controller.signal.throwIfAborted()
    try {
      return await downloadFileAttempt(url, destinationPath, expectedHash, hashAlgorithm)
    } catch (error) {
      transferContext.getStore()?.controller.signal.throwIfAborted()
      if (
        attempt === 2 ||
        (error instanceof DownloadHttpError &&
          error.status < 500 &&
          error.status !== 429 &&
          error.status !== 408)
      )
        throw error
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
}

export function getTransferSignal(): AbortSignal {
  const timeout = AbortSignal.timeout(20000)
  const context = transferContext.getStore()
  return context ? AbortSignal.any([timeout, context.controller.signal]) : timeout
}
