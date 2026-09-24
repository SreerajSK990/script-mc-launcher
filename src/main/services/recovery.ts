import { promises as fs, createReadStream } from 'node:fs'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import type { BackupEntry, RecoverySettings } from '@shared/types/operations'
import type { InstallModPayload, InstalledModRecord } from '@shared/types/mods'
import { getInstancePath, getInstanceMinecraftPath } from './paths'
import { validateFilename, withInstanceOperation } from './instanceOperations'
import { doesPathExist, readJsonFile, writeJsonFileAtomic } from '@main/utils/filesystem'

interface Snapshot extends BackupEntry {
  files: { path: string; hash: string }[]
  mods?: InstalledModRecord[]
}

function recoveryDirectory(instanceId: string): string {
  validateFilename(instanceId)
  return join(getInstancePath(instanceId), 'recovery')
}

async function inspectFiles(
  directory: string,
  relative = ''
): Promise<{ path: string; hash: string; size: number }[]> {
  const result: { path: string; hash: string; size: number }[] = []
  if (!(await doesPathExist(directory))) return result
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Backups cannot contain symbolic links')
    const path = join(relative, entry.name)
    if (entry.isDirectory()) result.push(...(await inspectFiles(join(directory, entry.name), path)))
    else if (entry.isFile()) {
      const fullPath = join(directory, entry.name)
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(fullPath)) hash.update(chunk)
      result.push({ path, hash: hash.digest('hex'), size: (await fs.stat(fullPath)).size })
    }
  }
  return result
}

export async function getRecoverySettings(instanceId: string): Promise<RecoverySettings> {
  return (
    (await readJsonFile<RecoverySettings>(join(recoveryDirectory(instanceId), 'settings.json'))) || {
      keepBackups: 5,
      backupAfterPlay: false
    }
  )
}

export async function saveRecoverySettings(instanceId: string, settings: RecoverySettings): Promise<void> {
  if (
    !Number.isInteger(settings.keepBackups) ||
    settings.keepBackups < 1 ||
    settings.keepBackups > 50 ||
    typeof settings.backupAfterPlay !== 'boolean'
  )
    throw new Error('Keep between 1 and 50 backups')
  await withInstanceOperation(instanceId, 'saving backup settings', async () => {
    await writeJsonFileAtomic(join(recoveryDirectory(instanceId), 'settings.json'), settings)
    await pruneSnapshots(instanceId)
  })
}

export async function listSnapshots(instanceId: string): Promise<BackupEntry[]> {
  const root = recoveryDirectory(instanceId)
  const result: BackupEntry[] = []
  for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const snapshot = await readJsonFile<Snapshot>(join(root, entry.name, 'snapshot.json'))
    if (snapshot && snapshot.id === entry.name) {
      const { files, mods, ...summary } = snapshot
      result.push(summary)
    }
  }
  const legacyDirectory = join(getInstancePath(instanceId), 'backups')
  for (const entry of await fs.readdir(legacyDirectory, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || !/^saves-backup-.+\.zip$/.test(entry.name)) continue
    const stats = await fs.stat(join(legacyDirectory, entry.name))
    result.push({
      id: entry.name,
      kind: 'saves',
      label: 'Version-upgrade save backup',
      createdAt: stats.mtime.toISOString(),
      sizeBytes: stats.size
    })
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createSnapshot(
  instanceId: string,
  kind: 'mods' | 'saves',
  label: string
): Promise<BackupEntry> {
  const root = recoveryDirectory(instanceId)
  const id = randomUUID()
  const staging = join(root, `.${id}`)
  const source = join(getInstanceMinecraftPath(instanceId), kind)
  await inspectFiles(source)
  await fs.mkdir(join(staging, 'files'), { recursive: true })
  try {
    if (await doesPathExist(source)) await fs.cp(source, join(staging, 'files'), { recursive: true })
    const files = await inspectFiles(join(staging, 'files'))
    const snapshot: Snapshot = {
      id,
      kind,
      label,
      createdAt: new Date().toISOString(),
      sizeBytes: files.reduce((sum, file) => sum + file.size, 0),
      files: files.map(({ path, hash }) => ({ path, hash })),
      mods:
        kind === 'mods'
          ? (await readJsonFile<InstalledModRecord[]>(join(getInstancePath(instanceId), 'mods.json'))) || []
          : undefined
    }
    await writeJsonFileAtomic(join(staging, 'snapshot.json'), snapshot)
    await fs.rename(staging, join(root, id))
    return snapshot
  } finally {
    await fs.rm(staging, { recursive: true, force: true })
  }
}

export async function pruneSnapshots(instanceId: string): Promise<void> {
  const settings = await getRecoverySettings(instanceId)
  const snapshots = await listSnapshots(instanceId)
  for (const kind of ['mods', 'saves'] as const) {
    for (const old of snapshots
      .filter((item) => item.kind === kind && !item.id.endsWith('.zip'))
      .slice(settings.keepBackups)) {
      await fs.rm(join(recoveryDirectory(instanceId), validateFilename(old.id)), {
        recursive: true,
        force: true
      })
    }
  }
}

export async function restoreSnapshotFiles(instanceId: string, id: string): Promise<void> {
  validateFilename(id)
  if (/^saves-backup-.+\.zip$/.test(id)) {
    const stagingId = randomUUID()
    const stagingRoot = join(recoveryDirectory(instanceId), stagingId)
    const archive = new AdmZip(join(getInstancePath(instanceId), 'backups', id))
    const entries = archive.getEntries()
    if (entries.length > 500000) throw new Error('Backup archive has too many entries')
    for (const entry of entries) {
      const segments = entry.entryName.replace(/\/$/, '').split(/[\\/]/)
      for (const segment of segments) validateFilename(segment)
      if (((entry.attr >>> 16) & 0xf000) === 0xa000) throw new Error('Backup contains a symbolic link')
    }
    try {
      await fs.mkdir(join(stagingRoot, 'files'), { recursive: true })
      for (const entry of entries) {
        if (entry.isDirectory) continue
        const segments = entry.entryName.split(/[\\/]/)
        await fs.mkdir(join(stagingRoot, 'files', ...segments.slice(0, -1)), { recursive: true })
        await fs.writeFile(join(stagingRoot, 'files', ...segments), entry.getData())
      }
      const files = await inspectFiles(join(stagingRoot, 'files'))
      await writeJsonFileAtomic(join(stagingRoot, 'snapshot.json'), {
        id: stagingId,
        kind: 'saves',
        label: 'Imported archive',
        createdAt: new Date().toISOString(),
        sizeBytes: files.reduce((sum, file) => sum + file.size, 0),
        files
      })
      await restoreSnapshotFiles(instanceId, stagingId)
    } finally {
      await fs.rm(stagingRoot, { recursive: true, force: true })
    }
    return
  }
  const root = join(recoveryDirectory(instanceId), id)
  const snapshot = await readJsonFile<Snapshot>(join(root, 'snapshot.json'))
  if (!snapshot || snapshot.id !== id || !['mods', 'saves'].includes(snapshot.kind))
    throw new Error('Backup is missing or invalid')
  const files = await inspectFiles(join(root, 'files'))
  if (
    files.length !== snapshot.files.length ||
    files.some(
      (file) => !snapshot.files.some((expected) => expected.path === file.path && expected.hash === file.hash)
    )
  )
    throw new Error('Backup verification failed; no files were restored')
  const target = join(getInstanceMinecraftPath(instanceId), snapshot.kind)
  const staging = join(getInstanceMinecraftPath(instanceId), `.restore-${randomUUID()}`)
  const previous = `${staging}-previous`
  const metadataPath = join(getInstancePath(instanceId), 'mods.json')
  const previousMetadata =
    snapshot.kind === 'mods' ? (await readJsonFile<InstalledModRecord[]>(metadataPath)) || [] : undefined
  let moved = false
  let replaced = false
  await fs.cp(join(root, 'files'), staging, { recursive: true })
  try {
    if (await doesPathExist(target)) {
      await fs.rename(target, previous)
      moved = true
    }
    await fs.rename(staging, target)
    replaced = true
    if (snapshot.kind === 'mods') await writeJsonFileAtomic(metadataPath, snapshot.mods || [])
  } catch (error) {
    if (replaced) await fs.rm(target, { recursive: true, force: true })
    if (moved) await fs.rename(previous, target)
    if (previousMetadata) await writeJsonFileAtomic(metadataPath, previousMetadata)
    throw error
  } finally {
    await fs.rm(staging, { recursive: true, force: true })
  }
  await fs.rm(previous, { recursive: true, force: true })
}

export async function restoreSnapshot(instanceId: string, id: string): Promise<void> {
  await withInstanceOperation(instanceId, 'restoring backup', async () => {
    const selected = (await listSnapshots(instanceId)).find((entry) => entry.id === id)
    if (!selected) throw new Error('Backup not found')
    await createSnapshot(instanceId, selected.kind, 'Before restore')
    await restoreSnapshotFiles(instanceId, id)
    await pruneSnapshots(instanceId)
  })
}

export async function backupSaves(instanceId: string): Promise<BackupEntry> {
  return withInstanceOperation(instanceId, 'backing up saves', async () => {
    const backup = await createSnapshot(instanceId, 'saves', 'World saves')
    await pruneSnapshots(instanceId)
    return backup
  })
}

export async function withModSnapshot<T>(
  instanceId: string,
  label: string,
  work: () => Promise<T>,
  keepSnapshot = true
): Promise<T> {
  const snapshot = await createSnapshot(instanceId, 'mods', label)
  let disposable = false
  try {
    const result = await work()
    disposable = true
    if (keepSnapshot) await pruneSnapshots(instanceId)
    return result
  } catch (error) {
    await restoreSnapshotFiles(instanceId, snapshot.id)
    disposable = true
    throw error
  } finally {
    if (!keepSnapshot && disposable)
      await fs.rm(join(recoveryDirectory(instanceId), snapshot.id), { recursive: true, force: true })
  }
}

export async function withModFileTransaction<T>(
  instanceId: string,
  items: InstallModPayload[],
  work: () => Promise<T>
): Promise<T> {
  const metadataPath = join(getInstancePath(instanceId), 'mods.json')
  const metadata = (await readJsonFile<InstalledModRecord[]>(metadataPath)) || []
  const directory = join(getInstanceMinecraftPath(instanceId), 'mods')
  const staging = join(recoveryDirectory(instanceId), `.transaction-${randomUUID()}`)
  const filenames = new Set<string>()
  for (const item of items) {
    const previous = metadata.find(
      (mod) => mod.id === item.modMetadata.id && mod.source === item.modMetadata.source
    )
    for (const filename of [item.versionFile.filename, item.oldFilename, previous?.filename]) {
      if (!filename) continue
      validateFilename(filename)
      filenames.add(filename)
      filenames.add(`${filename}.disabled`)
    }
  }
  await fs.mkdir(staging, { recursive: true })
  let disposable = false
  try {
    for (const filename of filenames) {
      if (await doesPathExist(join(directory, filename)))
        await fs.copyFile(join(directory, filename), join(staging, filename))
    }
    await writeJsonFileAtomic(join(staging, 'metadata.json'), metadata)
    try {
      const result = await work()
      disposable = true
      return result
    } catch (error) {
      for (const filename of filenames) {
        await fs.rm(join(directory, filename), { force: true })
        if (await doesPathExist(join(staging, filename)))
          await fs.copyFile(join(staging, filename), join(directory, filename))
      }
      await writeJsonFileAtomic(metadataPath, metadata)
      disposable = true
      throw error
    }
  } finally {
    if (disposable) await fs.rm(staging, { recursive: true, force: true })
  }
}
