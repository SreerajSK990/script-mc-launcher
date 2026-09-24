import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'

const sandbox = await mkdtemp(join(tmpdir(), 'script-content-tests-'))
process.env.LAUNCHER_DATA_DIR = sandbox
const originalFetch = globalThis.fetch
const { createNewInstance } = await import('../src/main/services/instances.ts')
const { resolveDependencies, findManagedDependencyIssues } = await import(
  '../src/main/core/mods/dependencies.ts'
)
const { installModToInstance, listInstalledMods, toggleModEnabled } = await import(
  '../src/main/core/mods/manager.ts'
)
const { updateAllMods } = await import('../src/main/core/mods/updates.ts')
const {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  getRecoverySettings,
  saveRecoverySettings,
  backupSaves
} = await import('../src/main/services/recovery.ts')
const { reserveInstance, withInstanceOperation, validateFilename } = await import(
  '../src/main/services/instanceOperations.ts'
)
const { installShader, importShaders, listShaders, validateShaderArchive } = await import(
  '../src/main/core/shaders/manager.ts'
)
const { downloadFileWithHash, withTransfer, cancelTransfer } = await import('../src/main/utils/download.ts')
const { diagnoseCrash } = await import('../src/shared/crashDiagnosis.ts')
const { searchModrinth, getModrinthVersion } = await import('../src/main/core/mods/modrinth.ts')
const { getCurseForgeVersion, initCurseForgeApiKey, searchCurseForge } = await import(
  '../src/main/core/mods/curseforge.ts'
)

let checks = 0
async function check(name, work) {
  await work()
  checks++
  console.log(`PASS ${name}`)
}

const bytes = Buffer.from('verified mod content')
const hash = createHash('sha512').update(bytes).digest('hex')
const instance = await createNewInstance({
  name: 'Content tests',
  minecraftVersion: '1.20.1',
  loaderType: 'fabric'
})
const instanceRoot = join(sandbox, 'instances', instance.id)
const modsDirectory = join(instanceRoot, 'minecraft', 'mods')
const makeVersion = (projectId, id = `${projectId}-1`, dependencies = []) => ({
  id,
  projectId,
  name: projectId,
  versionNumber: id,
  dependencies,
  gameVersions: ['1.20.1'],
  loaders: ['fabric'],
  downloadUrl: `https://fixture.invalid/${id}.jar`,
  filename: `${id}.jar`,
  sizeBytes: bytes.length,
  sha512: hash,
  releaseType: 'release',
  datePublished: '2026-01-01T00:00:00Z'
})
const required = (projectId, versionId) => ({ projectId, versionId, type: 'required' })
const versions = new Map()
const add = (version) => {
  versions.set(version.id, version)
  return version
}
const payload = (version) => ({
  instanceId: instance.id,
  versionFile: version,
  modMetadata: { id: version.projectId, name: version.projectId, source: 'modrinth' }
})
const provider = {
  version: async (_source, _projectId, id) => {
    const version = versions.get(id)
    if (!version) throw new Error('Missing fixture version')
    return version
  },
  versions: async (_source, projectId) =>
    [...versions.values()].filter((version) => version.projectId === projectId)
}
const apiVersion = (version) => ({
  id: version.id,
  project_id: version.projectId,
  name: version.name,
  version_number: version.versionNumber,
  game_versions: version.gameVersions,
  loaders: version.loaders,
  version_type: version.releaseType,
  date_published: version.datePublished,
  dependencies: version.dependencies.map((item) => ({
    project_id: item.projectId,
    version_id: item.versionId || null,
    dependency_type: item.type
  })),
  files: [
    {
      primary: true,
      url: version.downloadUrl,
      filename: version.filename,
      size: version.sizeBytes,
      hashes: { sha512: version.sha512 }
    }
  ]
})
const network = async (input) => {
  const url = new URL(String(input))
  if (url.hostname === 'fixture.invalid') return new Response(bytes)
  if (url.pathname.startsWith('/v2/version/')) {
    const version = versions.get(url.pathname.split('/').at(-1))
    return version ? Response.json(apiVersion(version)) : new Response('Missing', { status: 404 })
  }
  const projectId = url.pathname.split('/')[3]
  if (url.pathname.endsWith('/version'))
    return Response.json(
      [...versions.values()].filter((version) => version.projectId === projectId).map(apiVersion)
    )
  throw new Error(`Unexpected test network request: ${url}`)
}

try {
  await check('dependency chains deduplicate shared requirements and ignore optional mods', async () => {
    const common = add(makeVersion('common'))
    const left = add(makeVersion('left', undefined, [required('common')]))
    const right = add(makeVersion('right', undefined, [required('common')]))
    const root = add(
      makeVersion('root', undefined, [
        required('left'),
        required('right'),
        { projectId: 'optional', type: 'optional' }
      ])
    )
    const plan = await resolveDependencies([payload(root)], instance, [], provider)
    assert.deepEqual(
      plan.items.map((item) => item.versionFile.id),
      [common.id, left.id, right.id, root.id]
    )
    assert.equal(plan.warnings.length, 1)
  })
  await check('dependency cycles terminate and exact-version conflicts fail before mutation', async () => {
    const a = add(makeVersion('cycle-a', undefined, [required('cycle-b')]))
    add(makeVersion('cycle-b', undefined, [required('cycle-a')]))
    assert.equal((await resolveDependencies([payload(a)], instance, [], provider)).items.length, 2)
    add(makeVersion('common', 'common-2'))
    const strict = add(makeVersion('strict', undefined, [required('common', 'common-2')]))
    await assert.rejects(
      resolveDependencies([payload(strict), payload(versions.get('common-1'))], instance, [], provider),
      /Conflicting/
    )
  })
  await check('disabled dependencies and declared incompatibilities block installation', async () => {
    const installed = [
      {
        id: 'common',
        name: 'Common',
        source: 'modrinth',
        enabled: false,
        versionId: 'common-1',
        filename: 'common-1.jar'
      }
    ]
    await assert.rejects(
      resolveDependencies([payload(versions.get('left-1'))], instance, installed, provider),
      /disabled/
    )
    const bad = add(makeVersion('bad', undefined, [{ projectId: 'common', type: 'incompatible' }]))
    await assert.rejects(
      resolveDependencies([payload(bad), payload(versions.get('common-1'))], instance, [], provider),
      /incompatibility/
    )
  })
  await check('compatible installed dependencies are reused and unknown requirements fail', async () => {
    const existing = {
      id: 'common',
      name: 'Common',
      source: 'modrinth',
      enabled: true,
      versionId: 'common-1',
      filename: 'common-1.jar'
    }
    const plan = await resolveDependencies([payload(versions.get('left-1'))], instance, [existing], provider)
    assert.equal(plan.items.length, 1)
    assert.equal(plan.reused.length, 1)
    const missing = add(makeVersion('missing', undefined, [required('nonexistent')]))
    await assert.rejects(
      resolveDependencies([payload(missing)], instance, [], provider),
      /No compatible version/
    )
  })
  await check('manually downloaded dependencies are reused only after hash verification', async () => {
    const restricted = add({ ...makeVersion('restricted'), downloadUrl: null })
    const root = add(makeVersion('requires-restricted', undefined, [required('restricted')]))
    const local = {
      id: 'manual-file',
      name: 'Local',
      source: 'modrinth',
      enabled: true,
      filename: restricted.filename
    }
    const plan = await resolveDependencies([payload(root)], instance, [local], {
      ...provider,
      verifyInstalled: async () => true
    })
    assert.equal(plan.reused.length, 1)
    await assert.rejects(
      resolveDependencies([payload(root)], instance, [local], {
        ...provider,
        verifyInstalled: async () => false
      }),
      /manual download/
    )
  })
  await check('loader mismatch and manual-download requirements are actionable', async () => {
    const mismatch = add({ ...makeVersion('mismatch'), loaders: ['forge'] })
    await assert.rejects(resolveDependencies([payload(mismatch)], instance, [], provider), /not compatible/)
    const manual = add({ ...makeVersion('manual'), downloadUrl: null })
    await assert.rejects(resolveDependencies([payload(manual)], instance, [], provider), /manual download/)
  })
  globalThis.fetch = network
  await check('real provider normalization retains exact dependency information', async () => {
    assert.equal((await getModrinthVersion('strict-1')).dependencies[0].versionId, 'common-2')
  })
  await check('installation resolves dependencies and update preserves disabled state', async () => {
    await installModToInstance(payload(versions.get('left-1')))
    assert.equal((await listInstalledMods(instance.id)).length, 2)
    await toggleModEnabled(instance.id, 'left-1.jar', false)
    const updated = add(makeVersion('left', 'left-2', [required('common')]))
    const record = await installModToInstance({ ...payload(updated), oldFilename: 'left-1.jar' })
    assert.equal(record.enabled, false)
    await access(join(modsDirectory, 'left-2.jar.disabled'))
    await assert.rejects(access(join(modsDirectory, 'left-1.jar.disabled')))
  })
  await check('manual required files gain verified provider identity for pre-launch checks', async () => {
    await writeFile(join(modsDirectory, 'restricted-1.jar'), bytes)
    await installModToInstance(payload(versions.get('requires-restricted-1')))
    const mods = await listInstalledMods(instance.id)
    assert.ok(mods.some((mod) => mod.id === 'restricted' && mod.versionId === 'restricted-1'))
    assert.deepEqual(findManagedDependencyIssues(mods), [])
    await toggleModEnabled(instance.id, 'restricted-1.jar', false)
    assert.ok(
      findManagedDependencyIssues(await listInstalledMods(instance.id)).some((issue) =>
        issue.includes('disabled')
      )
    )
    await toggleModEnabled(instance.id, 'restricted-1.jar', true)
  })
  await check('failed downloads restore files and metadata', async () => {
    const prior = await readFile(join(instanceRoot, 'mods.json'), 'utf8')
    const corrupt = add({ ...makeVersion('left', 'left-corrupt'), sha512: '0'.repeat(128) })
    await assert.rejects(installModToInstance({ ...payload(corrupt), oldFilename: 'left-2.jar' }), /mismatch/)
    assert.equal(await readFile(join(instanceRoot, 'mods.json'), 'utf8'), prior)
    assert.deepEqual(await readFile(join(modsDirectory, 'left-2.jar.disabled')), bytes)
    await assert.rejects(access(join(modsDirectory, 'left-corrupt.jar.disabled')))
  })
  await check('partial batch failures report the failed mod and preserve a batch backup', async () => {
    const good = add(makeVersion('independent'))
    const absent = makeVersion('absent')
    const updates = [good, absent].map((version) => ({
      modId: version.projectId,
      source: 'modrinth',
      name: version.name,
      currentFilename: `${version.projectId}-old.jar`,
      versionFile: version,
      latestVersion: version.versionNumber
    }))
    const result = await updateAllMods(instance.id, updates)
    assert.equal(result.updatedCount, 1)
    assert.equal(result.success, false)
    assert.equal(result.failures[0].modId, 'absent')
    assert.ok((await listSnapshots(instance.id)).some((entry) => entry.label === 'Before batch update'))
  })
  await check('instance reservations prevent launch and content modification races', async () => {
    const release = reserveInstance(instance.id, 'Minecraft is running')
    try {
      await assert.rejects(installModToInstance(payload(versions.get('left-2'))), /busy/)
      await assert.rejects(backupSaves(instance.id), /busy/)
      assert.throws(() => reserveInstance(instance.id, 'launch'), /busy/)
    } finally {
      release()
    }
    await withInstanceOperation(instance.id, 'test', async () => {})
    assert.throws(() => validateFilename('../outside'), /Invalid/)
  })
  await check('save backup restore verifies contents and preserves current data first', async () => {
    const world = join(instanceRoot, 'minecraft', 'saves', 'World')
    await mkdir(world, { recursive: true })
    await writeFile(join(world, 'level.dat'), 'old world')
    const snapshot = await backupSaves(instance.id)
    await writeFile(join(world, 'level.dat'), 'new world')
    await restoreSnapshot(instance.id, snapshot.id)
    assert.equal(await readFile(join(world, 'level.dat'), 'utf8'), 'old world')
    assert.ok((await listSnapshots(instance.id)).some((entry) => entry.label === 'Before restore'))
    await writeFile(join(instanceRoot, 'recovery', snapshot.id, 'files', 'World', 'level.dat'), 'tampered')
    await assert.rejects(restoreSnapshot(instance.id, snapshot.id), /verification failed/)
    assert.equal(await readFile(join(world, 'level.dat'), 'utf8'), 'old world')
  })
  await check('existing version-upgrade save archives appear in history and restore', async () => {
    const archive = new AdmZip()
    archive.addFile('ArchivedWorld/level.dat', Buffer.from('archived world'))
    const directory = join(instanceRoot, 'backups')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'saves-backup-fixture.zip'), archive.toBuffer())
    assert.ok((await listSnapshots(instance.id)).some((entry) => entry.id === 'saves-backup-fixture.zip'))
    await restoreSnapshot(instance.id, 'saves-backup-fixture.zip')
    assert.equal(
      await readFile(join(instanceRoot, 'minecraft', 'saves', 'ArchivedWorld', 'level.dat'), 'utf8'),
      'archived world'
    )
  })
  await check('backup retention is per kind and rejects invalid preferences', async () => {
    await assert.rejects(
      saveRecoverySettings(instance.id, { keepBackups: 0, backupAfterPlay: false }),
      /between/
    )
    await saveRecoverySettings(instance.id, { keepBackups: 2, backupAfterPlay: true })
    const history = await listSnapshots(instance.id)
    assert.ok(history.filter((entry) => entry.kind === 'mods').length <= 2)
    assert.ok(history.filter((entry) => entry.kind === 'saves' && !entry.id.endsWith('.zip')).length <= 2)
    assert.equal((await getRecoverySettings(instance.id)).backupAfterPlay, true)
  })
  const shaderZip = new AdmZip()
  shaderZip.addFile('shaders/test.fsh', Buffer.from('void main() {}'))
  const shaderFile = join(sandbox, 'shader.zip')
  await writeFile(shaderFile, shaderZip.toBuffer())
  await check('shader ZIP validation rejects ordinary resource packs', async () => {
    validateShaderArchive(shaderFile)
    const resource = new AdmZip()
    resource.addFile('pack.mcmeta', Buffer.from('{}'))
    const path = join(sandbox, 'resource.zip')
    await writeFile(path, resource.toBuffer())
    assert.throws(() => validateShaderArchive(path), /not a shader pack/)
  })
  await check('shader imports are isolated and version replacement updates metadata', async () => {
    await importShaders(instance.id, [shaderFile])
    assert.equal((await listShaders(instance.id)).length, 1)
    const shaderBytes = shaderZip.toBuffer()
    globalThis.fetch = async () => new Response(shaderBytes)
    const version = {
      ...makeVersion('shader'),
      filename: 'shader-v2.zip',
      sha512: createHash('sha512').update(shaderBytes).digest('hex')
    }
    await installShader({ ...payload(version), oldFilename: 'shader.zip' })
    const installed = await listShaders(instance.id)
    assert.equal(installed.length, 1)
    assert.equal(installed[0].filename, 'shader-v2.zip')
    assert.equal(installed[0].source, 'modrinth')
    await assert.rejects(access(join(modsDirectory, 'shader-v2.zip')))
  })
  await check('download retries transient errors and cancellation removes temporary files', async () => {
    let attempts = 0
    globalThis.fetch = async () => (++attempts < 2 ? new Response('', { status: 503 }) : new Response(bytes))
    await downloadFileWithHash('https://fixture.invalid/retry', join(sandbox, 'retry.jar'), hash, 'sha512')
    assert.equal(attempts, 2)
    const events = []
    globalThis.fetch = async (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      )
    const downloading = withTransfer(
      instance.id,
      (progress) => events.push(progress),
      () => downloadFileWithHash('https://fixture.invalid/cancel', join(sandbox, 'cancel.jar'))
    )
    setTimeout(() => cancelTransfer(instance.id), 20)
    await assert.rejects(downloading, /cancelled/)
    await assert.rejects(access(join(sandbox, 'cancel.jar')))
    assert.equal(events.at(-1).completed, true)
  })
  await check('shader provider requests use shader categories without mod-loader filtering', async () => {
    let requestUrl = ''
    globalThis.fetch = async (input) => {
      requestUrl = String(input)
      return Response.json({ hits: [] })
    }
    await searchModrinth({ projectType: 'shader', loader: 'fabric', query: 'fixture' })
    assert.ok(decodeURIComponent(requestUrl).includes('project_type:shader'))
    assert.ok(!decodeURIComponent(requestUrl).includes('categories:fabric'))
    initCurseForgeApiKey('fixture-key')
    globalThis.fetch = async (input) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/categories'))
        return Response.json({ data: [{ id: 6552, name: 'Shaders', slug: 'shaders', isClass: true }] })
      requestUrl = String(input)
      return Response.json({ data: [] })
    }
    await searchCurseForge({ projectType: 'shader', loader: 'fabric', query: 'fixture' })
    assert.ok(requestUrl.includes('classId=6552'))
    assert.ok(!requestUrl.includes('modLoaderType'))
  })
  await check('CurseForge relation types preserve required and incompatible dependencies', async () => {
    globalThis.fetch = async () =>
      Response.json({
        data: {
          id: 1,
          modId: 2,
          fileName: 'test.jar',
          displayName: 'Test',
          gameVersions: ['1.20.1', 'Fabric'],
          dependencies: [
            { modId: 3, relationType: 3 },
            { modId: 4, relationType: 5 }
          ],
          hashes: [],
          fileLength: 1,
          releaseType: 1,
          fileDate: '2026-01-01'
        }
      })
    const version = await getCurseForgeVersion('2', '1')
    assert.deepEqual(
      version.dependencies.map((dependency) => dependency.type),
      ['required', 'incompatible']
    )
  })
  await check('crash explanations include evidence and an unknown-cause fallback', async () => {
    assert.match(diagnoseCrash(['java.lang.OutOfMemoryError: Java heap space']).title, /memory/)
    assert.match(diagnoseCrash(['UnsupportedClassVersionError: test']).title, /Java/)
    assert.ok(diagnoseCrash(['Found duplicate mods']).evidence)
    assert.equal(diagnoseCrash(['unrecognized failure']).evidence, undefined)
  })
  console.log(`All ${checks} content reliability checks passed`)
} finally {
  globalThis.fetch = originalFetch
  initCurseForgeApiKey(null)
  if (!resolve(sandbox).startsWith(resolve(tmpdir()) + sep))
    throw new Error('Refusing cleanup outside test directory')
  await rm(sandbox, { recursive: true, force: true })
}
