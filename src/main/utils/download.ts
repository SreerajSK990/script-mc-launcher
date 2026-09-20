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

export async function downloadFileWithHash(
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
    const response = await fetch(url)
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download ${url}: HTTP ${response.status}`)
    }

    const hashCalculator = createHash(hashAlgorithm)
    const fileWriteStream = createWriteStream(temporaryFilePath)

    const nodeReadable = Readable.fromWeb(response.body as import('stream/web').ReadableStream)

    nodeReadable.on('data', (chunk: Buffer) => {
      hashCalculator.update(chunk)
    })

    await pipeline(nodeReadable, fileWriteStream)

    const computedHash = hashCalculator.digest('hex')

    if (expectedHash && computedHash.toLowerCase() !== expectedHash.toLowerCase()) {
      throw new Error(
        `${hashAlgorithm.toUpperCase()} mismatch for ${url}. Expected ${expectedHash}, computed ${computedHash}`
      )
    }

    try {
      await fs.rename(temporaryFilePath, destinationPath)
    } catch {
      await fs.copyFile(temporaryFilePath, destinationPath)
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
