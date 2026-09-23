import { join, dirname, basename } from 'node:path'
import { promises as fs } from 'node:fs'
import AdmZip from 'adm-zip'
import type { InstanceConfiguration, ModLoaderType } from '@shared/types/instance'
import type { ModpackManifestInfo, ModpackImportProgressEvent } from '@shared/types/modpack'
import type { InstalledModRecord } from '@shared/types/mods'
import { createNewInstance } from '@main/services/instances'
import { getInstanceMinecraftPath, getLauncherRootDirectory } from '@main/services/paths'
import { ensureDirectoryExists, writeJsonFileAtomic, doesPathExist } from '@main/utils/filesystem'
import { downloadBatch, downloadFileWithHash, type DownloadTask } from '@main/utils/download'
import { batchGetCurseForgeFiles, getCurseForgeApiKey } from '@main/core/mods/curseforge'
import { getModsMetadataPath } from '@main/core/mods/manager'

interface ModrinthIndexJson {
  formatVersion: number
  game: string
  versionId: string
  name: string
  summary?: string
  files: Array<{
    path: string
    hashes: {
      sha512?: string
      sha1?: string
    }
    env?: {
      client?: string
      server?: string
    }
    downloads: string[]
    fileSize: number
  }>
  dependencies: Record<string, string>
}

interface CurseForgeManifestJson {
  minecraft: {
    version: string
    modLoaders: Array<{
      id: string
      primary?: boolean
    }>
  }
  manifestType: string
  manifestVersion: number
  name: string
  version?: string
  author?: string
  files: Array<{
    projectID: number
    fileID: number
    required: boolean
  }>
  overrides?: string
}

export async function parseModpackArchive(archivePath: string): Promise<ModpackManifestInfo> {
  const exists = await doesPathExist(archivePath)
  if (!exists) {
    throw new Error(`Modpack file not found: ${archivePath}`)
  }

  const zip = new AdmZip(archivePath)

  const modrinthEntry = zip.getEntry('modrinth.index.json')
  if (modrinthEntry) {
    const content = zip.readAsText(modrinthEntry)
    const data = JSON.parse(content) as ModrinthIndexJson

    let loaderType: ModLoaderType = 'vanilla'
    let loaderVersion: string | undefined = undefined

    if (data.dependencies['fabric-loader']) {
      loaderType = 'fabric'
      loaderVersion = data.dependencies['fabric-loader']
    } else if (data.dependencies['quilt-loader']) {
      loaderType = 'quilt'
      loaderVersion = data.dependencies['quilt-loader']
    } else if (data.dependencies['neoforge']) {
      loaderType = 'neoforge'
      loaderVersion = data.dependencies['neoforge']
    } else if (data.dependencies['forge']) {
      loaderType = 'forge'
      loaderVersion = data.dependencies['forge']
    }

    return {
      name: data.name,
      versionName: data.versionId,
      summary: data.summary,
      minecraftVersion: data.dependencies['minecraft'] || '1.20.1',
      loaderType,
      loaderVersion,
      fileCount: data.files?.length || 0,
      format: 'modrinth'
    }
  }

  const curseforgeEntry = zip.getEntry('manifest.json')
  if (curseforgeEntry) {
    const content = zip.readAsText(curseforgeEntry)
    const data = JSON.parse(content) as CurseForgeManifestJson

    let loaderType: ModLoaderType = 'vanilla'
    let loaderVersion: string | undefined = undefined

    const primaryLoader = data.minecraft?.modLoaders?.find((l) => l.primary) || data.minecraft?.modLoaders?.[0]
    if (primaryLoader?.id) {
      const id = primaryLoader.id.toLowerCase()
      if (id.startsWith('forge-')) {
        loaderType = 'forge'
        loaderVersion = id.replace('forge-', '')
      } else if (id.startsWith('neoforge-')) {
        loaderType = 'neoforge'
        loaderVersion = id.replace('neoforge-', '')
      } else if (id.startsWith('fabric-')) {
        loaderType = 'fabric'
        loaderVersion = id.replace('fabric-', '')
      } else if (id.startsWith('quilt-')) {
        loaderType = 'quilt'
        loaderVersion = id.replace('quilt-', '')
      }
    }

    return {
      name: data.name,
      versionName: data.version,
      summary: data.author ? `By ${data.author}` : undefined,
      minecraftVersion: data.minecraft?.version || '1.20.1',
      loaderType,
      loaderVersion,
      fileCount: data.files?.length || 0,
      format: 'curseforge'
    }
  }

  throw new Error('Unsupported modpack archive format. Missing modrinth.index.json or manifest.json.')
}

export async function importModpackArchive(
  archivePath: string,
  customName?: string,
  onProgress?: (event: ModpackImportProgressEvent) => void
): Promise<InstanceConfiguration> {
  onProgress?.({
    step: 'extracting',
    message: 'Analyzing modpack archive structure...',
    current: 0,
    total: 100,
    percentage: 5
  })

  const manifest = await parseModpackArchive(archivePath)
  const zip = new AdmZip(archivePath)

  const instanceName = customName?.trim() || manifest.name
  const instance = await createNewInstance({
    name: instanceName,
    minecraftVersion: manifest.minecraftVersion,
    loaderType: manifest.loaderType,
    loaderVersion: manifest.loaderVersion || null,
    ramAllocationMegabytes: 4096
  })

  const minecraftDir = getInstanceMinecraftPath(instance.id)

  onProgress?.({
    step: 'extracting',
    message: 'Extracting configurations and game overrides...',
    current: 10,
    total: 100,
    percentage: 15
  })

  const entries = zip.getEntries()

  if (manifest.format === 'modrinth') {
    for (const entry of entries) {
      let relPath = entry.entryName
      if (relPath.startsWith('overrides/')) {
        relPath = relPath.slice('overrides/'.length)
      } else if (relPath.startsWith('client-overrides/')) {
        relPath = relPath.slice('client-overrides/'.length)
      } else {
        continue
      }

      if (!relPath.trim()) continue

      const targetPath = join(minecraftDir, relPath)
      if (entry.isDirectory) {
        await ensureDirectoryExists(targetPath)
      } else {
        await ensureDirectoryExists(dirname(targetPath))
        await fs.writeFile(targetPath, entry.getData())
      }
    }
  } else if (manifest.format === 'curseforge') {
    const rawManifest = JSON.parse(zip.readAsText('manifest.json')) as CurseForgeManifestJson
    const overridesFolder = rawManifest.overrides || 'overrides'
    const prefix = overridesFolder.endsWith('/') ? overridesFolder : `${overridesFolder}/`

    for (const entry of entries) {
      if (entry.entryName.startsWith(prefix)) {
        const relPath = entry.entryName.slice(prefix.length)
        if (!relPath.trim()) continue

        const targetPath = join(minecraftDir, relPath)
        if (entry.isDirectory) {
          await ensureDirectoryExists(targetPath)
        } else {
          await ensureDirectoryExists(dirname(targetPath))
          await fs.writeFile(targetPath, entry.getData())
        }
      }
    }
  }

  onProgress?.({
    step: 'resolving',
    message: 'Resolving mod download links and dependencies...',
    current: 25,
    total: 100,
    percentage: 25
  })

  const downloadTasks: DownloadTask[] = []
  const installedMods: InstalledModRecord[] = []

  if (manifest.format === 'modrinth') {
    const rawIndex = JSON.parse(zip.readAsText('modrinth.index.json')) as ModrinthIndexJson
    for (const file of rawIndex.files || []) {
      if (file.env?.client === 'unsupported') continue
      const targetPath = join(minecraftDir, file.path)
      const downloadUrl = file.downloads && file.downloads[0]
      if (!downloadUrl) continue

      downloadTasks.push({
        url: downloadUrl,
        destination: targetPath,
        sha512: file.hashes?.sha512,
        sha1: file.hashes?.sha1,
        size: file.fileSize
      })

      if (file.path.startsWith('mods/')) {
        const filename = basename(file.path)
        installedMods.push({
          id: file.hashes?.sha1 || filename,
          name: filename.replace(/\.jar$/i, ''),
          version: rawIndex.versionId || '1.0.0',
          filename,
          source: 'modrinth',
          installedAt: new Date().toISOString(),
          enabled: true,
          fileSizeBytes: file.fileSize || 0,
          gameVersion: manifest.minecraftVersion,
          loader: manifest.loaderType
        })
      }
    }
  } else if (manifest.format === 'curseforge') {
    const rawManifest = JSON.parse(zip.readAsText('manifest.json')) as CurseForgeManifestJson
    const fileIds = (rawManifest.files || []).map((f) => f.fileID)

    const apiKey = getCurseForgeApiKey()
    if (!apiKey && fileIds.length > 0) {
      throw new Error('A CurseForge API key is required in Settings to download CurseForge modpack files.')
    }

    const fetchedFiles = await batchGetCurseForgeFiles(fileIds)

    for (const file of fetchedFiles) {
      if (file.downloadUrl) {
        const targetPath = join(minecraftDir, 'mods', file.fileName)
        downloadTasks.push({
          url: file.downloadUrl,
          destination: targetPath,
          sha1: file.hashes?.find((h) => h.algo === 1)?.value,
          size: file.fileLength
        })

        installedMods.push({
          id: String(file.modId || file.id),
          name: file.displayName || file.fileName.replace(/\.jar$/i, ''),
          version: file.fileName,
          filename: file.fileName,
          source: 'curseforge',
          installedAt: new Date().toISOString(),
          enabled: true,
          fileSizeBytes: file.fileLength,
          gameVersion: manifest.minecraftVersion,
          loader: manifest.loaderType
        })
      }
    }
  }

  const totalModCount = downloadTasks.length

  if (totalModCount > 0) {
    onProgress?.({
      step: 'downloading',
      message: `Downloading ${totalModCount} mod files...`,
      current: 0,
      total: totalModCount,
      percentage: 30
    })

    await downloadBatch(downloadTasks, 8, (completed, total, currentUrl) => {
      const percentage = 30 + Math.round((completed / total) * 65)
      onProgress?.({
        step: 'downloading',
        message: `Downloaded mod (${completed}/${total}): ${basename(currentUrl)}`,
        current: completed,
        total,
        percentage
      })
    })
  }

  onProgress?.({
    step: 'finalizing',
    message: 'Saving instance metadata and registered mods...',
    current: 95,
    total: 100,
    percentage: 95
  })

  await writeJsonFileAtomic(getModsMetadataPath(instance.id), installedMods)

  onProgress?.({
    step: 'completed',
    message: `Successfully installed ${instance.name}!`,
    current: 100,
    total: 100,
    percentage: 100
  })

  return instance
}

export async function downloadAndInstallRemoteModpack(
  url: string,
  filename: string,
  customName?: string,
  onProgress?: (event: ModpackImportProgressEvent) => void
): Promise<InstanceConfiguration> {
  const tempDir = join(getLauncherRootDirectory(), 'temp', 'modpacks')
  await ensureDirectoryExists(tempDir)

  const tempFilePath = join(tempDir, `${Date.now()}_${filename}`)

  try {
    onProgress?.({
      step: 'extracting',
      message: `Downloading modpack package (${filename})...`,
      current: 0,
      total: 100,
      percentage: 5
    })

    await downloadFileWithHash(url, tempFilePath)

    return await importModpackArchive(tempFilePath, customName, onProgress)
  } finally {
    await fs.rm(tempFilePath, { force: true }).catch(() => {})
  }
}
