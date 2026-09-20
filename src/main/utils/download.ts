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
  size?: number
}

export async function downloadFileWithSha1(
  url: string,
  destinationPath: string,
  expectedSha1?: string
): Promise<void> {
  if (await doesPathExist(destinationPath)) {
    if (expectedSha1) {
      try {
        const existingFileBuffer = await fs.readFile(destinationPath)
        const existingSha1 = createHash('sha1').update(existingFileBuffer).digest('hex')
        if (existingSha1.toLowerCase() === expectedSha1.toLowerCase()) {
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

    const hashCalculator = createHash('sha1')
    const fileWriteStream = createWriteStream(temporaryFilePath)

    const nodeReadable = Readable.fromWeb(response.body as import('stream/web').ReadableStream)

    nodeReadable.on('data', (chunk: Buffer) => {
      hashCalculator.update(chunk)
    })

    await pipeline(nodeReadable, fileWriteStream)

    const computedSha1 = hashCalculator.digest('hex')

    if (expectedSha1 && computedSha1.toLowerCase() !== expectedSha1.toLowerCase()) {
      throw new Error(
        `SHA-1 mismatch for ${url}. Expected ${expectedSha1}, computed ${computedSha1}`
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

      await downloadFileWithSha1(task.url, task.destination, task.sha1)
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
