import { join } from 'node:path'
import type { VersionPackage, LibraryDownload } from '@shared/types/manifest'
import { getLibrariesDirectory } from '@main/services/paths'
import { isRuleAllowed, getCurrentLauncherOsName, getCurrentLauncherArch } from '@main/core/minecraft/rules'
import { downloadBatch, type DownloadTask } from '@main/utils/download'
import { extractNativeLibraries } from '@main/utils/zip'
import { ensureDirectoryExists } from '@main/utils/filesystem'

export function convertMavenCoordinateToPath(coordinate: string, classifier?: string, extension = 'jar'): string {
  const parts = coordinate.split(':')
  if (parts.length < 3) {
    throw new Error(`Invalid Maven coordinate: ${coordinate}`)
  }

  const [groupId, artifactId, version, inlineClassifier] = parts
  let resolvedClassifier = classifier || inlineClassifier
  let resolvedExtension = extension
  let resolvedVersion = version

  if (resolvedClassifier && resolvedClassifier.includes('@')) {
    const [c, ext] = resolvedClassifier.split('@')
    resolvedClassifier = c
    resolvedExtension = ext
  } else if (resolvedVersion && resolvedVersion.includes('@')) {
    const [v, ext] = resolvedVersion.split('@')
    resolvedVersion = v
    resolvedExtension = ext
  }

  const groupDirectory = groupId.replace(/\./g, '/')
  const fileName = resolvedClassifier
    ? `${artifactId}-${resolvedVersion}-${resolvedClassifier}.${resolvedExtension}`
    : `${artifactId}-${resolvedVersion}.${resolvedExtension}`

  return `${groupDirectory}/${artifactId}/${resolvedVersion}/${fileName}`
}

function resolveNativeClassifierKey(
  library: LibraryDownload,
  os = getCurrentLauncherOsName(),
  arch = getCurrentLauncherArch()
): string | null {
  if (!library.natives) {
    return null
  }

  const nativeKey = library.natives[os]
  if (!nativeKey) {
    return null
  }

  const archBitString = arch === 'x64' ? '64' : '32'
  return nativeKey.replace('${arch}', archBitString)
}

export async function prepareMinecraftLibraries(
  versionPackage: VersionPackage,
  nativesDirectory: string,
  onProgress?: (completed: number, total: number, currentItem: string) => void,
  extraDownloadTasks?: DownloadTask[]
): Promise<string[]> {
  const librariesRoot = getLibrariesDirectory()
  await ensureDirectoryExists(librariesRoot)
  await ensureDirectoryExists(nativesDirectory)

  const downloadTasks: DownloadTask[] = []
  const classpathJars: string[] = []
  const nativeJarPathsToExtract: string[] = []

  const currentOs = getCurrentLauncherOsName()
  const currentArch = getCurrentLauncherArch()

  for (const library of versionPackage.libraries) {
    if (!isRuleAllowed(library.rules, currentOs, currentArch)) {
      continue
    }

    const addClasspathJar = (jarPath: string) => {
      if (!classpathJars.includes(jarPath)) {
        classpathJars.push(jarPath)
      }
    }

    if (library.downloads?.artifact) {
      const artifact = library.downloads.artifact
      const relativePath = artifact.path || convertMavenCoordinateToPath(library.name)
      const destination = join(librariesRoot, relativePath)

      downloadTasks.push({
        url: artifact.url,
        destination,
        sha1: artifact.sha1,
        size: artifact.size
      })
      addClasspathJar(destination)
    } else if (library.url && library.name) {
      const relativePath = convertMavenCoordinateToPath(library.name)
      const destination = join(librariesRoot, relativePath)
      const baseUrl = library.url.endsWith('/') ? library.url : `${library.url}/`

      downloadTasks.push({
        url: `${baseUrl}${relativePath}`,
        destination
      })
      addClasspathJar(destination)
    } else if (library.name && !library.natives) {
      const relativePath = convertMavenCoordinateToPath(library.name)
      const destination = join(librariesRoot, relativePath)
      addClasspathJar(destination)
    }

    const nativeClassifierKey = resolveNativeClassifierKey(library, currentOs, currentArch)
    if (nativeClassifierKey && library.downloads?.classifiers) {
      const nativeArtifact = library.downloads.classifiers[nativeClassifierKey]
      if (nativeArtifact) {
        const relativePath = nativeArtifact.path || convertMavenCoordinateToPath(library.name, nativeClassifierKey)
        const destination = join(librariesRoot, relativePath)

        downloadTasks.push({
          url: nativeArtifact.url,
          destination,
          sha1: nativeArtifact.sha1,
          size: nativeArtifact.size
        })
        if (!nativeJarPathsToExtract.includes(destination)) {
          nativeJarPathsToExtract.push(destination)
        }
      }
    }
  }

  if (extraDownloadTasks && extraDownloadTasks.length > 0) {
    downloadTasks.push(...extraDownloadTasks)
  }

  const clientDownload = versionPackage.downloads.client
  const clientJarPath = join(
    librariesRoot,
    'com',
    'mojang',
    'minecraft',
    versionPackage.id,
    `minecraft-${versionPackage.id}-client.jar`
  )

  downloadTasks.push({
    url: clientDownload.url,
    destination: clientJarPath,
    sha1: clientDownload.sha1,
    size: clientDownload.size
  })
  if (!classpathJars.includes(clientJarPath)) {
    classpathJars.push(clientJarPath)
  }

  await downloadBatch(downloadTasks, 12, onProgress)

  for (const nativeJar of nativeJarPathsToExtract) {
    await extractNativeLibraries(nativeJar, nativesDirectory)
  }

  return classpathJars
}
