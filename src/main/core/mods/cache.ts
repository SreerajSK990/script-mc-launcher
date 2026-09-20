import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { getMetaCacheDirectory } from '@main/services/paths'
import {
  readJsonFile,
  writeJsonFileAtomic,
  ensureDirectoryExists
} from '@main/utils/filesystem'

interface CacheEntry<T> {
  timestamp: number
  data: T
}

const memoryCache = new Map<string, CacheEntry<any>>()

function getModsCacheDirectory(): string {
  return join(getMetaCacheDirectory(), 'mods')
}

function sanitizeKey(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex')
  const prefix = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)
  return `${prefix}_${hash}`
}

function getCacheFilePath(key: string): string {
  return join(getModsCacheDirectory(), `${sanitizeKey(key)}.json`)
}

export async function getCachedData<T>(cacheKey: string, maxAgeMs: number): Promise<T | null> {
  const now = Date.now()

  // 1. Check memory cache
  const mem = memoryCache.get(cacheKey)
  if (mem) {
    if (now - mem.timestamp < maxAgeMs) {
      return mem.data as T
    }
    memoryCache.delete(cacheKey)
  }

  // 2. Check disk cache
  try {
    const filePath = getCacheFilePath(cacheKey)
    const diskEntry = await readJsonFile<CacheEntry<T>>(filePath)
    if (diskEntry && typeof diskEntry.timestamp === 'number') {
      if (now - diskEntry.timestamp < maxAgeMs) {
        memoryCache.set(cacheKey, diskEntry)
        return diskEntry.data
      }
      // Expired on disk, delete asynchronously
      fs.unlink(filePath).catch(() => {})
    }
  } catch {
    // Ignore read errors
  }

  return null
}

export async function setCachedData<T>(cacheKey: string, data: T): Promise<void> {
  const entry: CacheEntry<T> = {
    timestamp: Date.now(),
    data
  }

  memoryCache.set(cacheKey, entry)

  try {
    const dir = getModsCacheDirectory()
    await ensureDirectoryExists(dir)
    const filePath = getCacheFilePath(cacheKey)
    await writeJsonFileAtomic(filePath, entry)
  } catch (err) {
    console.warn(`Failed to persist cache key ${cacheKey} to disk:`, err)
  }
}

export async function clearModsCache(): Promise<void> {
  memoryCache.clear()
  try {
    const dir = getModsCacheDirectory()
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    // Ignore
  }
}
