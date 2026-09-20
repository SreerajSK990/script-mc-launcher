import { createHash } from 'node:crypto'
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
  if (expectedSha1 && (await doesPathExist(destinationPath))) {
    const existingFileBuffer = await fs.readFile(destinationPath)
    const existingSha1 = createHash('sha1').update(existingFileBuffer).digest('hex')
    if (existingSha1.toLowerCase() === expectedSha1.toLowerCase()) {
      return
    }
  }

  await ensureDirectoryExists(dirname(destinationPath))
  const temporaryFilePath = `${destinationPath}.downloading`

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
    await fs.rm(temporaryFilePath, { force: true }).catch(() => {})
    throw new Error(
      `SHA-1 mismatch for ${url}. Expected ${expectedSha1}, computed ${computedSha1}`
    )
  }

  await fs.rename(temporaryFilePath, destinationPath).catch(async () => {
    await fs.copyFile(temporaryFilePath, destinationPath)
    await fs.rm(temporaryFilePath, { force: true }).catch(() => {})
  })
}

export async function downloadBatch(
  tasks: DownloadTask[],
  maxConcurrency = 12,
  onProgress?: (completed: number, total: number, currentUrl: string) => void
): Promise<void> {
  const total = tasks.length
  let completed = 0

  if (total === 0) {
    return
  }

  let taskIndex = 0

  async function worker(): Promise<void> {
    while (taskIndex < tasks.length) {
      const currentTaskIndex = taskIndex++
      const task = tasks[currentTaskIndex]
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
