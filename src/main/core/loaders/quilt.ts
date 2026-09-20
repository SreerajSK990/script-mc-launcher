import type { VersionPackage } from '@shared/types/manifest'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { LoaderLaunchConfiguration } from './fabric'
import { fetchPrismComponentVersion, getCompatibleLoaderVersions } from '@main/core/meta/prism'

export async function prepareQuiltLaunchConfiguration(
  instance: InstanceConfiguration,
  baseVersionPackage: VersionPackage
): Promise<LoaderLaunchConfiguration> {
  let loaderVersion = instance.loaderVersion

  if (!loaderVersion) {
    const compatible = await getCompatibleLoaderVersions('quilt', instance.minecraftVersion)
    loaderVersion = compatible[0]
  }

  if (!loaderVersion) {
    throw new Error(`No compatible Quilt loader version found for Minecraft ${instance.minecraftVersion}`)
  }

  const quiltComponent = await fetchPrismComponentVersion('org.quiltmc.quilt-loader', loaderVersion)

  const mergedLibraries = [
    ...baseVersionPackage.libraries,
    ...(quiltComponent.libraries || [])
  ]

  const mergedPackage: VersionPackage = {
    ...baseVersionPackage,
    mainClass: quiltComponent.mainClass || 'org.quiltmc.loader.impl.launch.knot.KnotClient',
    libraries: mergedLibraries
  }

  return {
    versionPackage: mergedPackage,
    extraDownloadTasks: [],
    extraJvmArguments: []
  }
}
