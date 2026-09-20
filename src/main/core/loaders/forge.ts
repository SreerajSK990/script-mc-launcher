import { join } from 'node:path'
import type { VersionPackage } from '@shared/types/manifest'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { DownloadTask } from '@main/utils/download'
import type { LoaderLaunchConfiguration } from './fabric'
import { getLibrariesDirectory } from '@main/services/paths'
import { fetchPrismComponentVersion, getCompatibleLoaderVersions } from '@main/core/meta/prism'
import { convertMavenCoordinateToPath } from '@main/core/minecraft/libraries'

export async function prepareForgeLaunchConfiguration(
  instance: InstanceConfiguration,
  baseVersionPackage: VersionPackage
): Promise<LoaderLaunchConfiguration> {
  let loaderVersion = instance.loaderVersion

  if (!loaderVersion) {
    const compatible = await getCompatibleLoaderVersions('forge', instance.minecraftVersion)
    loaderVersion = compatible[0]
  }

  if (!loaderVersion) {
    throw new Error(`No compatible Forge version found for Minecraft ${instance.minecraftVersion}`)
  }

  const forgeComponent = await fetchPrismComponentVersion('net.minecraftforge', loaderVersion)
  const librariesRoot = getLibrariesDirectory()

  const extraDownloadTasks: DownloadTask[] = []
  let installerJarPath: string | null = null

  if (forgeComponent.mavenFiles && Array.isArray(forgeComponent.mavenFiles)) {
    for (const mavenItem of forgeComponent.mavenFiles) {
      const artifact = mavenItem.downloads?.artifact
      if (!artifact || !artifact.url) {
        continue
      }

      const relativePath = artifact.path || convertMavenCoordinateToPath(mavenItem.name)
      const destination = join(librariesRoot, relativePath)

      extraDownloadTasks.push({
        url: artifact.url,
        destination,
        sha1: artifact.sha1,
        size: artifact.size
      })

      if (mavenItem.name.endsWith(':installer') || destination.endsWith('-installer.jar')) {
        installerJarPath = destination
      }
    }
  }

  const clientJarPath = join(
    librariesRoot,
    'com',
    'mojang',
    'minecraft',
    instance.minecraftVersion,
    `minecraft-${instance.minecraftVersion}-client.jar`
  )

  const extraJvmArguments: string[] = []

  if (installerJarPath) {
    extraJvmArguments.push(`-Dforgewrapper.installer=${installerJarPath}`)
  }
  extraJvmArguments.push(`-Dforgewrapper.minecraft=${clientJarPath}`)
  extraJvmArguments.push(`-Dforgewrapper.librariesDir=${librariesRoot}`)

  const mergedLibraries = [
    ...baseVersionPackage.libraries,
    ...(forgeComponent.libraries || [])
  ]

  const mergedPackage: VersionPackage = {
    ...baseVersionPackage,
    mainClass: forgeComponent.mainClass || 'io.github.zekerzhayard.forgewrapper.installer.Main',
    minecraftArguments: forgeComponent.minecraftArguments || baseVersionPackage.minecraftArguments,
    arguments: forgeComponent.arguments || baseVersionPackage.arguments,
    libraries: mergedLibraries
  }

  return {
    versionPackage: mergedPackage,
    extraDownloadTasks,
    extraJvmArguments
  }
}
