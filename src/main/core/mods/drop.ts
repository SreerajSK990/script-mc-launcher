import { withInstanceOperation } from '@main/services/instanceOperations'
import { withModSnapshot } from '@main/services/recovery'
import { basename, join } from 'node:path'
import { promises as fs } from 'node:fs'
import AdmZip from 'adm-zip'
import type { InstalledModRecord } from '@shared/types/mods'
import { getInstanceMinecraftPath, getInstanceConfigPath } from '@main/services/paths'
import { readJsonFile, writeJsonFileAtomic, ensureDirectoryExists } from '@main/utils/filesystem'
import type { InstanceConfiguration } from '@shared/types/instance'

interface ParsedModMetadata {
  id: string
  name: string
  version: string
}

function extractModMetadata(jarPath: string): ParsedModMetadata {
  const fallbackName = basename(jarPath).replace(/\.jar$/i, '')
  const fallback: ParsedModMetadata = {
    id: fallbackName.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
    name: fallbackName,
    version: '1.0.0'
  }

  try {
    const zip = new AdmZip(jarPath)

    // 1. Check fabric.mod.json
    const fabricEntry = zip.getEntry('fabric.mod.json')
    if (fabricEntry) {
      try {
        const text = zip.readAsText(fabricEntry)
        const json = JSON.parse(text)
        return {
          id: json.id || fallback.id,
          name: json.name || json.id || fallback.name,
          version: typeof json.version === 'string' ? json.version : fallback.version
        }
      } catch {
        // Continue fallback
      }
    }

    // 2. Check quilt.mod.json
    const quiltEntry = zip.getEntry('quilt.mod.json')
    if (quiltEntry) {
      try {
        const text = zip.readAsText(quiltEntry)
        const json = JSON.parse(text)
        const ql = json.quilt_loader || {}
        return {
          id: ql.id || fallback.id,
          name: ql.metadata?.name || ql.id || fallback.name,
          version: typeof ql.version === 'string' ? ql.version : fallback.version
        }
      } catch {
        // Continue fallback
      }
    }

    // 3. Check META-INF/mods.toml (Forge & NeoForge)
    const tomlEntry = zip.getEntry('META-INF/mods.toml')
    if (tomlEntry) {
      try {
        const text = zip.readAsText(tomlEntry)
        const modIdMatch = text.match(/modId\s*=\s*["']([^"']+)["']/)
        const nameMatch = text.match(/displayName\s*=\s*["']([^"']+)["']/)
        const verMatch = text.match(/version\s*=\s*["']([^"']+)["']/)

        return {
          id: modIdMatch ? modIdMatch[1] : fallback.id,
          name: nameMatch ? nameMatch[1] : (modIdMatch ? modIdMatch[1] : fallback.name),
          version: verMatch ? verMatch[1] : fallback.version
        }
      } catch {
        // Continue fallback
      }
    }

    // 4. Check mcmod.info (Legacy Forge)
    const mcmodEntry = zip.getEntry('mcmod.info')
    if (mcmodEntry) {
      try {
        const text = zip.readAsText(mcmodEntry)
        const json = JSON.parse(text)
        const info = Array.isArray(json) ? json[0] : json.modList?.[0]
        if (info) {
          return {
            id: info.modid || fallback.id,
            name: info.name || info.modid || fallback.name,
            version: info.version || fallback.version
          }
        }
      } catch {
        // Continue fallback
      }
    }
  } catch (err) {
    console.warn(`Could not inspect JAR ${jarPath}:`, err)
  }

  return fallback
}

async function installDroppedModFilesInternal(
  instanceId: string,
  filePaths: string[]
): Promise<{ success: boolean; installedMods: InstalledModRecord[] }> {
  const instanceDir = getInstanceMinecraftPath(instanceId)
  const modsDir = join(instanceDir, 'mods')
  await ensureDirectoryExists(modsDir)

  // Read instance config
  const config = await readJsonFile<InstanceConfiguration>(getInstanceConfigPath(instanceId))
  const mcVersion = config?.minecraftVersion || 'Unknown'
  const loader = config?.loaderType || 'vanilla'

  const modsMetadataPath = join(getInstanceMinecraftPath(instanceId), '..', 'mods.json')
  let existingRecords = (await readJsonFile<InstalledModRecord[]>(modsMetadataPath)) || []

  const newlyInstalled: InstalledModRecord[] = []

  for (const filePath of filePaths) {
    if (!filePath.toLowerCase().endsWith('.jar') && !filePath.toLowerCase().endsWith('.zip')) {
      continue
    }

    try {
      const stats = await fs.stat(filePath)
      if (!stats.isFile()) continue

      const filename = basename(filePath)
      const targetPath = join(modsDir, filename)

      // Copy file to instance mods directory
      await fs.copyFile(filePath, targetPath)

      const meta = extractModMetadata(filePath)

      const record: InstalledModRecord = {
        id: meta.id,
        name: meta.name,
        version: meta.version,
        filename,
        source: 'modrinth',
        installedAt: new Date().toISOString(),
        enabled: !filename.endsWith('.disabled'),
        fileSizeBytes: stats.size,
        gameVersion: mcVersion,
        loader
      }

      existingRecords = existingRecords.filter((r) => r.filename !== filename)
      existingRecords.push(record)
      newlyInstalled.push(record)
    } catch (err) {
      console.error(`Failed to install dropped file ${filePath}:`, err)
    }
  }

  await writeJsonFileAtomic(modsMetadataPath, existingRecords)

  return {
    success: newlyInstalled.length > 0,
    installedMods: newlyInstalled
  }
}

export async function installDroppedModFiles(instanceId: string, filePaths: string[]) {
  return withInstanceOperation(instanceId, 'importing mods', () => withModSnapshot(instanceId, 'Before importing mods', () => installDroppedModFilesInternal(instanceId, filePaths)))
}
