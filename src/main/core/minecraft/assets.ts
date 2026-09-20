import { join } from 'node:path'
import { MOJANG_METADATA_CONFIG } from '@shared/constants/mojang'
import type { VersionPackage, AssetIndexMap } from '@shared/types/manifest'
import { getAssetsDirectory } from '@main/services/paths'
import { downloadFileWithSha1, downloadBatch, type DownloadTask } from '@main/utils/download'
import { readJsonFile, doesPathExist, ensureDirectoryExists } from '@main/utils/filesystem'

export async function prepareMinecraftAssets(
  versionPackage: VersionPackage,
  onProgress?: (completed: number, total: number, currentItem: string) => void
): Promise<string> {
  const assetsRoot = getAssetsDirectory()
  const indexesDirectory = join(assetsRoot, 'indexes')
  const objectsDirectory = join(assetsRoot, 'objects')

  await ensureDirectoryExists(indexesDirectory)
  await ensureDirectoryExists(objectsDirectory)

  const assetIndexInfo = versionPackage.assetIndex
  const indexFilePath = join(indexesDirectory, `${assetIndexInfo.id}.json`)

  await downloadFileWithSha1(assetIndexInfo.url, indexFilePath, assetIndexInfo.sha1)

  const assetIndexMap = await readJsonFile<AssetIndexMap>(indexFilePath)
  if (!assetIndexMap || !assetIndexMap.objects) {
    throw new Error(`Failed to parse asset index JSON for ${assetIndexInfo.id}`)
  }

  const downloadTasks: DownloadTask[] = []
  const uniqueHashes = new Set<string>()

  for (const asset of Object.values(assetIndexMap.objects)) {
    if (uniqueHashes.has(asset.hash)) {
      continue
    }
    uniqueHashes.add(asset.hash)

    const prefix = asset.hash.slice(0, 2)
    const destinationPath = join(objectsDirectory, prefix, asset.hash)

    downloadTasks.push({
      url: `${MOJANG_METADATA_CONFIG.ASSETS_RESOURCE_ROOT_URL}/${prefix}/${asset.hash}`,
      destination: destinationPath,
      sha1: asset.hash,
      size: asset.size
    })
  }

  await downloadBatch(downloadTasks, 16, onProgress)

  return indexFilePath
}
