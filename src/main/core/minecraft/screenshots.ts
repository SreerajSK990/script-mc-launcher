import { join, basename, extname } from 'node:path'
import { promises as fs } from 'node:fs'
import type { ScreenshotEntry } from '@shared/types/screenshot'
import { getInstanceMinecraftPath } from '@main/services/paths'
import { ensureDirectoryExists, doesPathExist } from '@main/utils/filesystem'

export function getScreenshotsDirectory(instanceId: string): string {
  return join(getInstanceMinecraftPath(instanceId), 'screenshots')
}

export async function listInstanceScreenshots(instanceId: string): Promise<ScreenshotEntry[]> {
  const screenshotsDir = getScreenshotsDirectory(instanceId)
  await ensureDirectoryExists(screenshotsDir)

  let entries: string[] = []
  try {
    entries = await fs.readdir(screenshotsDir)
  } catch {
    return []
  }

  const validExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])
  const results: ScreenshotEntry[] = []

  for (const entry of entries) {
    const ext = extname(entry).toLowerCase()
    if (!validExtensions.has(ext)) continue

    const fullPath = join(screenshotsDir, entry)
    try {
      const stats = await fs.stat(fullPath)
      if (!stats.isFile()) continue

      const fileBuffer = await fs.readFile(fullPath)
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      const dataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`

      results.push({
        filename: entry,
        sizeBytes: stats.size,
        createdAt: stats.mtime.toISOString(),
        dataUrl
      })
    } catch {
      // Ignore unreadable images
    }
  }

  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function deleteInstanceScreenshot(instanceId: string, filename: string): Promise<boolean> {
  const screenshotsDir = getScreenshotsDirectory(instanceId)
  const safeFilename = basename(filename)
  const fullPath = join(screenshotsDir, safeFilename)

  if (!(await doesPathExist(fullPath))) {
    return false
  }

  await fs.unlink(fullPath)
  return true
}
