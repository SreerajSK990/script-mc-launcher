import type { VersionPackage } from '@shared/types/manifest'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { LoaderLaunchConfiguration } from './fabric'
import { prepareFabricLaunchConfiguration } from './fabric'
import { prepareQuiltLaunchConfiguration } from './quilt'
import { prepareForgeLaunchConfiguration } from './forge'
import { prepareNeoForgeLaunchConfiguration } from './neoforge'

export async function resolveInstanceLaunchConfiguration(
  instance: InstanceConfiguration,
  baseVersionPackage: VersionPackage
): Promise<LoaderLaunchConfiguration> {
  switch (instance.loaderType) {
    case 'fabric':
      return await prepareFabricLaunchConfiguration(instance, baseVersionPackage)
    case 'quilt':
      return await prepareQuiltLaunchConfiguration(instance, baseVersionPackage)
    case 'forge':
      return await prepareForgeLaunchConfiguration(instance, baseVersionPackage)
    case 'neoforge':
      return await prepareNeoForgeLaunchConfiguration(instance, baseVersionPackage)
    case 'vanilla':
    default:
      return {
        versionPackage: baseVersionPackage,
        extraDownloadTasks: [],
        extraJvmArguments: []
      }
  }
}
