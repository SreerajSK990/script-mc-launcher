import { join, basename, extname } from 'node:path'
import { promises as fs } from 'node:fs'
import { getFontsDirectory } from '@main/services/paths'
import { ensureDirectoryExists, doesPathExist } from '@main/utils/filesystem'
import type { CustomFontEntry } from '@shared/types/fonts'

function getFontFormat(ext: string): 'truetype' | 'opentype' | 'woff2' {
  const lower = ext.toLowerCase()
  if (lower === '.otf') return 'opentype'
  if (lower === '.woff2') return 'woff2'
  return 'truetype'
}

function getMimeType(format: 'truetype' | 'opentype' | 'woff2'): string {
  if (format === 'opentype') return 'font/otf'
  if (format === 'woff2') return 'font/woff2'
  return 'font/ttf'
}

export async function listInstalledFonts(): Promise<CustomFontEntry[]> {
  const fontsDir = getFontsDirectory()
  await ensureDirectoryExists(fontsDir)

  let entries: string[] = []
  try {
    entries = await fs.readdir(fontsDir)
  } catch {
    return []
  }

  const results: CustomFontEntry[] = []

  for (const entry of entries) {
    const ext = extname(entry).toLowerCase()
    if (ext !== '.ttf' && ext !== '.otf' && ext !== '.woff2') {
      continue
    }

    const fullPath = join(fontsDir, entry)
    try {
      const stats = await fs.stat(fullPath)
      if (!stats.isFile()) continue

      const buffer = await fs.readFile(fullPath)
      const format = getFontFormat(ext)
      const mime = getMimeType(format)
      const base64 = buffer.toString('base64')
      const dataUrl = `data:${mime};base64,${base64}`
      const cleanName = basename(entry, ext).replace(/[-_]/g, ' ')

      results.push({
        name: cleanName,
        fileName: entry,
        path: fullPath,
        format,
        dataUrl
      })
    } catch {
      // Ignore unreadable font files
    }
  }

  return results
}

export async function installCustomFont(sourcePath: string): Promise<CustomFontEntry> {
  const fontsDir = getFontsDirectory()
  await ensureDirectoryExists(fontsDir)

  const ext = extname(sourcePath).toLowerCase()
  if (ext !== '.ttf' && ext !== '.otf' && ext !== '.woff2') {
    throw new Error('Unsupported font format. Please select a .ttf, .otf, or .woff2 file.')
  }

  const fileName = basename(sourcePath)
  const targetPath = join(fontsDir, fileName)

  await fs.copyFile(sourcePath, targetPath)

  const buffer = await fs.readFile(targetPath)
  const format = getFontFormat(ext)
  const mime = getMimeType(format)
  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mime};base64,${base64}`
  const cleanName = basename(fileName, ext).replace(/[-_]/g, ' ')

  return {
    name: cleanName,
    fileName,
    path: targetPath,
    format,
    dataUrl
  }
}

export async function deleteCustomFont(fileName: string): Promise<boolean> {
  const fontsDir = getFontsDirectory()
  const targetPath = join(fontsDir, fileName)

  if (await doesPathExist(targetPath)) {
    await fs.unlink(targetPath)
    return true
  }
  return false
}
