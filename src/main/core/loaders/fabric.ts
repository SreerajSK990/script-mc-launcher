import type { VersionPackage } from '@shared/types/manifest'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { DownloadTask } from '@main/utils/download'
import { fetchPrismComponentVersion, getCompatibleLoaderVersions } from '@main/core/meta/prism'

export interface LoaderLaunchConfiguration {
  versionPackage: VersionPackage
  extraDownloadTasks: DownloadTask[]
  extraJvmArguments: string[]
}

export async function prepareFabricLaunchConfiguration(
  instance: InstanceConfiguration,
  baseVersionPackage: VersionPackage
): Promise<LoaderLaunchConfiguration> {
  let loaderVersion = instance.loaderVersion

  if (!loaderVersion) {
    const compatible = await getCompatibleLoaderVersions('fabric', instance.minecraftVersion)
    loaderVersion = compatible[0]
  }

  if (!loaderVersion) {
    throw new Error(`No compatible Fabric loader version found for Minecraft ${instance.minecraftVersion}`)
  }

  const fabricComponent = await fetchPrismComponentVersion('net.fabricmc.fabric-loader', loaderVersion)

  const mergedLibraries = [
    ...baseVersionPackage.libraries,
    ...(fabricComponent.libraries || [])
  ]

  const mergedPackage: VersionPackage = {
    ...baseVersionPackage,
    mainClass: fabricComponent.mainClass || 'net.fabricmc.loader.impl.launch.knot.KnotClient',
    libraries: mergedLibraries
  }

  return {
    versionPackage: mergedPackage,
    extraDownloadTasks: [],
    extraJvmArguments: []
  }
}
