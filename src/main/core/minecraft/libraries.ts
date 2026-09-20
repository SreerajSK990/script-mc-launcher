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
  const resolvedClassifier = classifier || inlineClassifier
  const groupDirectory = groupId.replace(/\./g, '/')

  const fileName = resolvedClassifier
    ? `${artifactId}-${version}-${resolvedClassifier}.${extension}`
    : `${artifactId}-${version}.${extension}`

  return `${groupDirectory}/${artifactId}/${version}/${fileName}`
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
  onProgress?: (completed: number, total: number, currentItem: string) => void
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
      classpathJars.push(destination)
    } else if (library.name && !library.natives) {
      const relativePath = convertMavenCoordinateToPath(library.name)
      const destination = join(librariesRoot, relativePath)
      classpathJars.push(destination)
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
        nativeJarPathsToExtract.push(destination)
      }
    }
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
  classpathJars.push(clientJarPath)

  await downloadBatch(downloadTasks, 12, onProgress)

  for (const nativeJar of nativeJarPathsToExtract) {
    await extractNativeLibraries(nativeJar, nativesDirectory)
  }

  return classpathJars
}
