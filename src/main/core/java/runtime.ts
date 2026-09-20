import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { getJavaRuntimesDirectory, getMetaCacheDirectory } from '@main/services/paths'
import {
  doesPathExist,
  ensureDirectoryExists,
  readJsonFile,
  writeJsonFileAtomic
} from '@main/utils/filesystem'
import { downloadBatch, type DownloadTask } from '@main/utils/download'
import type { VersionPackage } from '@shared/types/manifest'
import type {
  MojangJavaAllProducts,
  MojangJavaFilesManifest,
  ManagedJavaRuntimeInfo
} from './types'

const MOJANG_JAVA_ALL_PRODUCTS_URL =
  'https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'

export function resolveMojangPlatform(): string {
  if (process.platform === 'win32') {
    if (process.arch === 'arm64') return 'windows-arm64'
    if (process.arch === 'ia32') return 'windows-x86'
    return 'windows-x64'
  }

  if (process.platform === 'darwin') {
    if (process.arch === 'arm64') return 'mac-os-arm64'
    return 'mac-os'
  }

  if (process.arch === 'ia32') return 'linux-i386'
  return 'linux'
}

export function resolveJavaComponentForVersion(
  versionPackage?: Partial<VersionPackage> | null,
  minecraftVersion?: string
): string {
  if (versionPackage?.javaVersion?.component) {
    return versionPackage.javaVersion.component
  }

  const ver = minecraftVersion || versionPackage?.id || '1.20.1'

  const parts = ver.split('.').map((p: string) => parseInt(p, 10) || 0)
  const minor = parts[1] || 0
  const patch = parts[2] || 0

  if (minor < 17) {
    return 'jre-legacy'
  }
  if (minor === 17) {
    return 'java-runtime-alpha'
  }
  if (minor < 20 || (minor === 20 && patch < 5)) {
    return 'java-runtime-gamma'
  }

  return 'java-runtime-delta'
}

export function getJavaComponentDirectory(component: string): string {
  return join(getJavaRuntimesDirectory(), component)
}

export function getJavaExecutablePath(component: string): string {
  const compDir = getJavaComponentDirectory(component)
  if (process.platform === 'win32') {
    return join(compDir, 'bin', 'java.exe')
  }
  return join(compDir, 'bin', 'java')
}

export async function isJavaRuntimeInstalled(component: string): Promise<boolean> {
  const exePath = getJavaExecutablePath(component)
  if (!(await doesPathExist(exePath))) {
    return false
  }
  try {
    const stats = await fs.stat(exePath)
    return stats.isFile() && stats.size > 0
  } catch {
    return false
  }
}

export async function fetchMojangJavaProducts(): Promise<MojangJavaAllProducts> {
  const cachePath = join(getMetaCacheDirectory(), 'mojang-java-runtimes.json')

  try {
    const cached = await readJsonFile<MojangJavaAllProducts>(cachePath)
    if (cached) {
      const stats = await fs.stat(cachePath)
      const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60)
      if (ageHours < 24) {
        return cached
      }
    }
  } catch {
    // Continue to fetch online
  }

  const response = await fetch(MOJANG_JAVA_ALL_PRODUCTS_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch Mojang Java runtimes list: HTTP ${response.status}`)
  }

  const data = (await response.json()) as MojangJavaAllProducts
  await writeJsonFileAtomic(cachePath, data).catch(() => {})
  return data
}

export async function ensureJavaRuntime(
  versionPackage?: Partial<VersionPackage> | null,
  minecraftVersion?: string,
  onProgress?: (step: string, current: number, total: number, percentage: number) => void
): Promise<string> {
  const component = resolveJavaComponentForVersion(versionPackage, minecraftVersion)
  const executablePath = getJavaExecutablePath(component)

  if (await isJavaRuntimeInstalled(component)) {
    return executablePath
  }

  if (onProgress) {
    onProgress('Resolving Java runtime manifest...', 0, 100, 0)
  }

  const allProducts = await fetchMojangJavaProducts()
  const platform = resolveMojangPlatform()

  const platformProducts = allProducts[platform]
  if (!platformProducts) {
    throw new Error(`No Mojang Java runtimes available for platform "${platform}"`)
  }

  const componentVersions = platformProducts[component]
  if (!componentVersions || componentVersions.length === 0) {
    throw new Error(
      `No runtime versions found for component "${component}" on platform "${platform}"`
    )
  }

  const chosenProduct = componentVersions[0]
  const manifestResponse = await fetch(chosenProduct.manifest.url)
  if (!manifestResponse.ok) {
    throw new Error(
      `Failed to download Java runtime manifest: HTTP ${manifestResponse.status}`
    )
  }

  const filesManifest = (await manifestResponse.json()) as MojangJavaFilesManifest
  const componentDirectory = getJavaComponentDirectory(component)
  await ensureDirectoryExists(componentDirectory)

  const downloadTasks: DownloadTask[] = []
  const executablePathsToChmod: string[] = []

  for (const [relativePath, fileEntry] of Object.entries(filesManifest.files)) {
    const destinationPath = join(componentDirectory, relativePath)

    if (fileEntry.type === 'directory') {
      await ensureDirectoryExists(destinationPath)
      continue
    }

    if (fileEntry.type === 'file' && fileEntry.downloads?.raw) {
      downloadTasks.push({
        url: fileEntry.downloads.raw.url,
        destination: destinationPath,
        sha1: fileEntry.downloads.raw.sha1,
        size: fileEntry.downloads.raw.size
      })

      if (fileEntry.executable && process.platform !== 'win32') {
        executablePathsToChmod.push(destinationPath)
      }
    }
  }

  if (onProgress) {
    onProgress(`Downloading Java runtime (${component})...`, 0, downloadTasks.length, 0)
  }

  await downloadBatch(downloadTasks, 12, (completed, total) => {
    if (onProgress) {
      const percentage = Math.round((completed / total) * 100)
      onProgress(`Downloading Java files: ${completed}/${total}`, completed, total, percentage)
    }
  })

  for (const chmodPath of executablePathsToChmod) {
    await fs.chmod(chmodPath, 0o755).catch(() => {})
  }

  if (await isJavaRuntimeInstalled(component)) {
    return executablePath
  }

  throw new Error(`Java runtime downloaded but binary was not found at: ${executablePath}`)
}

export async function getManagedJavaRuntimesSummary(): Promise<ManagedJavaRuntimeInfo[]> {
  const components = [
    { component: 'jre-legacy', versionName: 'Java 8', majorVersion: 8 },
    { component: 'java-runtime-alpha', versionName: 'Java 16', majorVersion: 16 },
    { component: 'java-runtime-gamma', versionName: 'Java 17', majorVersion: 17 },
    { component: 'java-runtime-delta', versionName: 'Java 21', majorVersion: 21 }
  ]

  const results: ManagedJavaRuntimeInfo[] = []

  for (const item of components) {
    const isInstalled = await isJavaRuntimeInstalled(item.component)
    results.push({
      ...item,
      isInstalled,
      executablePath: getJavaExecutablePath(item.component)
    })
  }

  return results
}
