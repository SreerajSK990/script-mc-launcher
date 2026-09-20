import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

export async function ensureDirectoryExists(directoryPath: string): Promise<void> {
  await fs.mkdir(directoryPath, { recursive: true })
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const rawContent = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(rawContent) as T
  } catch (error) {
    const errorWithCode = error as NodeJS.ErrnoException
    if (errorWithCode.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function writeJsonFileAtomic<T>(filePath: string, data: T): Promise<void> {
  const targetDirectory = dirname(filePath)
  await ensureDirectoryExists(targetDirectory)

  const temporaryFileName = `.${randomBytes(6).toString('hex')}.tmp`
  const temporaryFilePath = join(targetDirectory, temporaryFileName)

  const serializedContent = JSON.stringify(data, null, 2)
  await fs.writeFile(temporaryFilePath, serializedContent, 'utf-8')
  await fs.rename(temporaryFilePath, filePath)
}

export async function removeDirectorySafely(directoryPath: string): Promise<void> {
  await fs.rm(directoryPath, { recursive: true, force: true })
}

export async function doesPathExist(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}
