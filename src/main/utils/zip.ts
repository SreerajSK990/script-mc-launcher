import AdmZip from 'adm-zip'
import { join } from 'node:path'
import { ensureDirectoryExists } from '@main/utils/filesystem'

export async function extractNativeLibraries(jarPath: string, destinationDirectory: string): Promise<void> {
  await ensureDirectoryExists(destinationDirectory)

  const zip = new AdmZip(jarPath)
  const zipEntries = zip.getEntries()

  for (const entry of zipEntries) {
    if (entry.isDirectory) {
      continue
    }

    const entryName = entry.entryName
    if (entryName.startsWith('META-INF/') || entryName.startsWith('META-INF\\')) {
      continue
    }

    const isNativeBinary =
      entryName.endsWith('.dll') ||
      entryName.endsWith('.so') ||
      entryName.endsWith('.dylib')

    if (isNativeBinary) {
      const fileName = entry.name
      const targetFilePath = join(destinationDirectory, fileName)
      zip.extractEntryTo(entry, destinationDirectory, false, true)
    }
  }
}
