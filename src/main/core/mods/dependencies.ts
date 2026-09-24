import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { getInstanceMinecraftPath } from '@main/services/paths'
import { validateFilename } from '@main/services/instanceOperations'
import type { DependencyPlan } from '@shared/types/operations'
import type { InstallModPayload, InstalledModRecord, ModSource, ModVersionFile } from '@shared/types/mods'
import type { InstanceConfiguration } from '@shared/types/instance'
import { getInstanceById } from '@main/services/instances'
import { listInstalledMods } from './manager'
import { getModrinthProjectVersions, getModrinthVersion } from './modrinth'
import { getCurseForgeFiles, getCurseForgeVersion } from './curseforge'

export interface DependencyProvider {
  verifyInstalled?: (
    mod: InstalledModRecord,
    version: ModVersionFile,
    instance: InstanceConfiguration
  ) => Promise<boolean>
  version: (source: ModSource, projectId: string, versionId: string) => Promise<ModVersionFile>
  versions: (
    source: ModSource,
    projectId: string,
    instance: InstanceConfiguration
  ) => Promise<ModVersionFile[]>
}

export const dependencyProvider: DependencyProvider = {
  verifyInstalled: async (mod, version, instance) => {
    const expected = version.sha512 || version.sha1
    if (!expected) return false
    const hash = createHash(version.sha512 ? 'sha512' : 'sha1')
    const filename = validateFilename(mod.filename)
    for await (const chunk of createReadStream(
      join(getInstanceMinecraftPath(instance.id), 'mods', mod.enabled ? filename : `${filename}.disabled`)
    ))
      hash.update(chunk)
    return hash.digest('hex').toLowerCase() === expected.toLowerCase()
  },
  version: (source, projectId, versionId) =>
    source === 'modrinth' ? getModrinthVersion(versionId) : getCurseForgeVersion(projectId, versionId),
  versions: (source, projectId, instance) =>
    source === 'modrinth'
      ? getModrinthProjectVersions(projectId, instance.minecraftVersion, instance.loaderType)
      : getCurseForgeFiles(projectId, instance.minecraftVersion, instance.loaderType)
}

export async function resolveDependencies(
  roots: InstallModPayload[],
  instance: InstanceConfiguration,
  installed: InstalledModRecord[],
  provider: DependencyProvider = dependencyProvider
): Promise<DependencyPlan> {
  const chosen = new Map<string, InstallModPayload>()
  const pending = new Set<string>()
  const visited = new Set<string>()
  const items: InstallModPayload[] = []
  const reused = new Set<string>()
  const warnings = new Set<string>()
  const key = (source: ModSource, projectId: string) => `${source}:${projectId}`
  const existingFor = (source: ModSource, projectId: string) =>
    installed.find((mod) => mod.source === source && mod.id === projectId)
  const compatible = (version: ModVersionFile) =>
    version.gameVersions.includes(instance.minecraftVersion) && version.loaders.includes(instance.loaderType)

  for (const root of roots) {
    const version = await provider.version(
      root.modMetadata.source,
      root.versionFile.projectId,
      root.versionFile.id
    )
    const id = key(root.modMetadata.source, version.projectId)
    if (chosen.has(id) && chosen.get(id)?.versionFile.id !== version.id)
      throw new Error(`Conflicting versions requested for ${root.modMetadata.name}`)
    chosen.set(id, {
      ...root,
      versionFile: version,
      modMetadata: { ...root.modMetadata, id: version.projectId }
    })
  }

  async function visit(payload: InstallModPayload): Promise<void> {
    const { versionFile: version, modMetadata: metadata } = payload
    const id = key(metadata.source, version.projectId)
    if (visited.has(id) || pending.has(id)) return
    if (chosen.size > 200) throw new Error('Dependency graph exceeds 200 projects')
    if (!compatible(version))
      throw new Error(
        `${metadata.name} is not compatible with Minecraft ${instance.minecraftVersion} / ${instance.loaderType}`
      )
    if (!version.downloadUrl && !reused.has(id))
      throw new Error(
        `${metadata.name} requires a manual download from ${version.websiteUrl || 'its project website'}. Install that file before continuing.`
      )
    pending.add(id)
    for (const dependency of version.dependencies || []) {
      if (dependency.type === 'optional') {
        warnings.add(
          `Optional dependency ${dependency.projectId || dependency.versionId || 'unknown'} is not installed automatically`
        )
        continue
      }
      if (dependency.type !== 'required') continue
      let target: ModVersionFile | undefined
      if (dependency.versionId)
        target = await provider.version(metadata.source, dependency.projectId || '', dependency.versionId)
      const projectId = target?.projectId || dependency.projectId
      if (!projectId) throw new Error(`${metadata.name} has a required dependency with no resolvable project`)
      const dependencyKey = key(metadata.source, projectId)
      let existing = existingFor(metadata.source, projectId)
      if (existing && !existing.enabled)
        throw new Error(
          `Required dependency ${existing.name} is disabled. Enable it explicitly before installing ${metadata.name}.`
        )
      const selected = chosen.get(dependencyKey)
      if (selected) {
        if (target && selected.versionFile.id !== target.id)
          throw new Error(`Conflicting dependency versions for ${projectId}`)
        await visit(selected)
        continue
      }
      const candidates = target
        ? [target]
        : (await provider.versions(metadata.source, projectId, instance)).filter(compatible)
      let matching = candidates.find(
        (candidate) =>
          existing &&
          (existing.versionId === candidate.id ||
            (existing.filename === candidate.filename && existing.version === candidate.versionNumber))
      )
      if (!matching && provider.verifyInstalled) {
        for (const candidate of candidates) {
          const local = installed.find((mod) => mod.filename === candidate.filename)
          if (local && (await provider.verifyInstalled(local, candidate, instance))) {
            if (!local.enabled)
              throw new Error(`Required dependency ${local.name} is disabled. Enable it before continuing.`)
            existing = local
            matching = candidate
            break
          }
        }
      }
      target =
        matching ||
        target ||
        candidates.find((candidate) => candidate.releaseType === 'release') ||
        candidates[0]
      if (!target)
        throw new Error(
          `No compatible version of required dependency ${projectId} is available for ${metadata.name}`
        )
      const next: InstallModPayload = {
        instanceId: instance.id,
        versionFile: target,
        modMetadata: { id: projectId, name: existing?.name || target.name, source: metadata.source },
        oldFilename: existing?.filename
      }
      chosen.set(dependencyKey, next)
      if (matching) reused.add(dependencyKey)
      await visit(next)
    }
    pending.delete(id)
    visited.add(id)
    items.push(payload)
  }

  for (const root of [...chosen.values()]) await visit(root)
  const finalVersions = [...chosen.values()].map((item) => ({
    source: item.modMetadata.source,
    id: item.versionFile.projectId,
    versionId: item.versionFile.id,
    dependencies: item.versionFile.dependencies
  }))
  for (const mod of installed.filter((mod) => mod.enabled && !chosen.has(key(mod.source, mod.id)))) {
    finalVersions.push({
      source: mod.source,
      id: mod.id,
      versionId: mod.versionId || '',
      dependencies: mod.dependencies
    })
  }
  for (const mod of finalVersions) {
    for (const dependency of mod.dependencies || []) {
      const match = finalVersions.find(
        (other) =>
          other.source === mod.source &&
          (dependency.projectId
            ? other.id === dependency.projectId
            : other.versionId === dependency.versionId)
      )
      if (
        dependency.type === 'incompatible' &&
        match &&
        (!dependency.versionId || dependency.versionId === match.versionId)
      )
        throw new Error(`${mod.id} declares an incompatibility with ${match.id}`)
      if (
        dependency.type === 'required' &&
        dependency.versionId &&
        match &&
        dependency.versionId !== match.versionId
      )
        throw new Error(`${mod.id} requires a different version of ${match.id}`)
    }
  }
  return {
    items: items.filter((item) => !reused.has(key(item.modMetadata.source, item.versionFile.projectId))),
    reused: [...reused],
    reusedItems: items.filter((item) => reused.has(key(item.modMetadata.source, item.versionFile.projectId))),
    warnings: [...warnings]
  }
}

export async function planModInstallation(payloads: InstallModPayload[]): Promise<DependencyPlan> {
  const instanceId = payloads[0]?.instanceId
  if (!instanceId || payloads.some((payload) => payload.instanceId !== instanceId))
    throw new Error('Select one target instance')
  validateFilename(instanceId)
  const instance = await getInstanceById(instanceId)
  if (!instance) throw new Error('Instance not found')
  return resolveDependencies(payloads, instance, await listInstalledMods(instanceId))
}

export function findManagedDependencyIssues(mods: InstalledModRecord[]): string[] {
  const issues: string[] = []
  for (const mod of mods.filter((item) => item.enabled)) {
    for (const dependency of mod.dependencies || []) {
      if (dependency.type !== 'required' && dependency.type !== 'incompatible') continue
      const target = mods.find(
        (item) =>
          item.source === mod.source &&
          (dependency.projectId ? item.id === dependency.projectId : item.versionId === dependency.versionId)
      )
      if (
        dependency.type === 'required' &&
        (!target?.enabled || (dependency.versionId && target.versionId !== dependency.versionId))
      )
        issues.push(
          `${mod.name} requires ${target?.name || dependency.projectId || dependency.versionId}, which is missing, disabled, or has a different version.`
        )
      if (
        dependency.type === 'incompatible' &&
        target?.enabled &&
        (!dependency.versionId || target.versionId === dependency.versionId)
      )
        issues.push(`${mod.name} declares an incompatibility with ${target.name}.`)
    }
  }
  return issues
}
