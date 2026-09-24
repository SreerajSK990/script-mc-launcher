import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'
import type { InstallModPayload } from '@shared/types/mods'
import type { ShaderPack, ShaderEnvironment } from '@shared/types/operations'
import { getInstanceMinecraftPath, getInstancePath } from '@main/services/paths'
import { getInstanceById } from '@main/services/instances'
import { validateFilename, withInstanceOperation } from '@main/services/instanceOperations'
import { readJsonFile, writeJsonFileAtomic, doesPathExist } from '@main/utils/filesystem'
import { downloadFileWithHash } from '@main/utils/download'
import { listInstalledMods } from '@main/core/mods/manager'

export function shaderDirectory(instanceId: string): string {
  validateFilename(instanceId)
  return join(getInstanceMinecraftPath(instanceId), 'shaderpacks')
}

function metadataPath(instanceId: string): string {
  return join(getInstancePath(instanceId), 'shaders.json')
}

export function validateShaderArchive(path: string): void {
  const archive = new AdmZip(path)
  const entries = archive.getEntries()
  if (
    entries.length > 20000 ||
    !entries.some((entry) => /^shaders\/.+\.(vsh|fsh|glsl|properties)$/i.test(entry.entryName))
  )
    throw new Error('This ZIP is not a shader pack: it needs a shaders folder at the archive root')
  if (
    entries.some((entry) => entry.entryName.split(/[\\/]/).includes('..') || /^[\\/]/.test(entry.entryName))
  )
    throw new Error('Shader archive contains unsafe paths')
}

export async function listShaders(instanceId: string): Promise<ShaderPack[]> {
  const directory = shaderDirectory(instanceId)
  await fs.mkdir(directory, { recursive: true })
  const saved = (await readJsonFile<ShaderPack[]>(metadataPath(instanceId))) || []
  const result: ShaderPack[] = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.zip')) continue
    const previous = saved.find((pack) => pack.filename === entry.name)
    const stats = await fs.stat(join(directory, entry.name))
    result.push(
      previous
        ? { ...previous, sizeBytes: stats.size }
        : {
            id: `local-${entry.name}`,
            name: entry.name.replace(/\.zip$/i, ''),
            filename: entry.name,
            version: 'Local',
            sizeBytes: stats.size
          }
    )
  }
  return result
}

async function commitShader(
  instanceId: string,
  staged: string,
  record: ShaderPack,
  oldFilename?: string
): Promise<ShaderPack> {
  const directory = shaderDirectory(instanceId)
  validateFilename(record.filename)
  if (oldFilename) validateFilename(oldFilename)
  const saved = await listShaders(instanceId)
  const previous = saved.find(
    (pack) => record.source && pack.source === record.source && pack.id === record.id
  )
  const oldFiles = new Set(
    [record.filename, previous?.filename, oldFilename].filter((name): name is string => Boolean(name))
  )
  const displaced: { original: string; backup: string }[] = []
  let placed = false
  try {
    for (const filename of oldFiles) {
      validateFilename(filename)
      const original = join(directory, filename)
      if (await doesPathExist(original)) {
        const backup = join(directory, `.previous-${randomUUID()}`)
        await fs.rename(original, backup)
        displaced.push({ original, backup })
      }
    }
    await fs.rename(staged, join(directory, record.filename))
    placed = true
    await writeJsonFileAtomic(metadataPath(instanceId), [
      ...saved.filter((pack) => !oldFiles.has(pack.filename)),
      record
    ])
  } catch (error) {
    if (placed) await fs.rm(join(directory, record.filename), { force: true })
    for (const file of displaced) await fs.rename(file.backup, file.original)
    throw error
  }
  for (const file of displaced) await fs.rm(file.backup, { force: true })
  return record
}

export async function installShader(payload: InstallModPayload): Promise<ShaderPack> {
  return withInstanceOperation(payload.instanceId, 'installing shader', async () => {
    const version = payload.versionFile
    validateFilename(version.filename)
    if (!version.filename.toLowerCase().endsWith('.zip') || !version.downloadUrl)
      throw new Error('Select a downloadable shader ZIP')
    const directory = shaderDirectory(payload.instanceId)
    await fs.mkdir(directory, { recursive: true })
    const staging = join(directory, `.download-${randomUUID()}`)
    try {
      await downloadFileWithHash(
        version.downloadUrl,
        staging,
        version.sha512 || version.sha1,
        version.sha512 ? 'sha512' : 'sha1'
      )
      validateShaderArchive(staging)
      const record: ShaderPack = {
        shaderLoaders: version.shaderLoaders,
        id: version.projectId,
        name: payload.modMetadata.name,
        filename: version.filename,
        version: version.versionNumber,
        source: payload.modMetadata.source,
        sizeBytes: (await fs.stat(staging)).size
      }
      return await commitShader(payload.instanceId, staging, record, payload.oldFilename)
    } finally {
      await fs.rm(staging, { force: true })
    }
  })
}

export async function importShaders(instanceId: string, paths: string[]): Promise<ShaderPack[]> {
  return withInstanceOperation(instanceId, 'importing shaders', async () => {
    const directory = shaderDirectory(instanceId)
    await fs.mkdir(directory, { recursive: true })
    const result: ShaderPack[] = []
    for (const path of paths) {
      if (!path.toLowerCase().endsWith('.zip')) throw new Error('Select shader ZIP files')
      validateShaderArchive(path)
    }
    for (const path of paths) {
      const filename = validateFilename(basename(path))
      const staging = join(directory, `.import-${randomUUID()}`)
      try {
        await fs.copyFile(path, staging)
        const record: ShaderPack = {
          id: `local-${filename}`,
          name: filename.replace(/\.zip$/i, ''),
          filename,
          version: 'Local',
          sizeBytes: (await fs.stat(staging)).size
        }
        result.push(await commitShader(instanceId, staging, record))
      } finally {
        await fs.rm(staging, { force: true })
      }
    }
    return result
  })
}

export async function deleteShader(instanceId: string, filename: string): Promise<void> {
  await withInstanceOperation(instanceId, 'deleting shader', async () => {
    validateFilename(filename)
    await fs.rm(join(shaderDirectory(instanceId), filename), { force: true })
    await writeJsonFileAtomic(
      metadataPath(instanceId),
      (await listShaders(instanceId)).filter((pack) => pack.filename !== filename)
    )
  })
}

export async function getShaderEnvironment(instanceId: string): Promise<ShaderEnvironment> {
  const instance = await getInstanceById(instanceId)
  if (!instance) throw new Error('Instance not found')
  const mods = await listInstalledMods(instanceId)
  const installed = new Set<string>()
  for (const mod of mods.filter((mod) => mod.enabled)) {
    const nameLower = (mod.name || '').toLowerCase()
    const idLower = (mod.id || '').toLowerCase()
    const fileLower = (mod.filename || '').toLowerCase()

    if (nameLower.includes('iris') || idLower === 'iris' || fileLower.includes('iris')) {
      installed.add('Iris')
      continue
    }
    if (nameLower.includes('oculus') || idLower === 'oculus' || fileLower.includes('oculus')) {
      installed.add('Oculus')
      continue
    }
    if (nameLower.includes('optifine') || idLower.includes('optifine') || fileLower.includes('optifine')) {
      installed.add('OptiFine')
      continue
    }

    if (
      fileLower.includes('shader') ||
      fileLower.includes('opti') ||
      fileLower.includes('ocu') ||
      fileLower.includes('iri')
    ) {
      try {
        const archive = new AdmZip(
          join(getInstanceMinecraftPath(instanceId), 'mods', validateFilename(mod.filename))
        )
        const fabric = archive.getEntry('fabric.mod.json')
        if (fabric) {
          const metadata = JSON.parse(archive.readAsText(fabric)) as { id?: string }
          if (metadata.id === 'iris') installed.add('Iris')
        }
        const forge = archive.getEntry('META-INF/mods.toml') || archive.getEntry('META-INF/neoforge.mods.toml')
        if (forge) {
          const content = archive.readAsText(forge)
          if (/modId\s*=\s*["']oculus["']/.test(content)) installed.add('Oculus')
          if (/modId\s*=\s*["']iris["']/.test(content)) installed.add('Iris')
        }
        if (archive.getEntry('optifine/OptiFineClassTransformer.class')) installed.add('OptiFine')
      } catch {}
    }
  }
  const recommendedProject =
    instance.loaderType === 'fabric' || instance.loaderType === 'neoforge'
      ? 'iris'
      : instance.loaderType === 'forge'
        ? 'oculus'
        : undefined
  return {
    installed: [...installed],
    recommendedProject,
    message: installed.size
      ? `${[...installed].join(', ')} detected. Select a shader in Minecraft's video settings. Pack compatibility may vary.`
      : instance.loaderType === 'vanilla'
        ? 'Shader loader required. Use Installation settings to choose a compatible mod loader first; back up your instance before changing platforms.'
        : 'Shader loader required. Compatible loader versions will be checked before installation.'
  }
}
