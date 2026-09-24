import { basename } from 'node:path'
import { promises as fs } from 'node:fs'
import { getInstanceConfigPath } from './paths'

const operations = new Map<string, string>()

export function validateFilename(filename: string): string {
  if (
    !filename ||
    filename !== basename(filename) ||
    /[\\/:\x00-\x1f]/.test(filename) ||
    filename === '.' ||
    filename === '..'
  ) {
    throw new Error('Invalid filename')
  }
  return filename
}

export function assertInstanceIdle(instanceId: string): void {
  validateFilename(instanceId)
  const operation = operations.get(instanceId)
  if (operation) throw new Error(`This instance is busy: ${operation}. Please wait or close Minecraft.`)
}

export function reserveInstance(instanceId: string, operation: string): () => void {
  assertInstanceIdle(instanceId)
  operations.set(instanceId, operation)
  let released = false
  return () => {
    if (!released) operations.delete(instanceId)
    released = true
  }
}

export async function withInstanceOperation<T>(
  instanceId: string,
  operation: string,
  work: () => Promise<T>
): Promise<T> {
  const release = reserveInstance(instanceId, operation)
  try {
    await fs.access(getInstanceConfigPath(instanceId))
    return await work()
  } finally {
    release()
  }
}
