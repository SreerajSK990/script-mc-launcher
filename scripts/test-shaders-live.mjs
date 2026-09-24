import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

const sandbox = await mkdtemp(join(tmpdir(), 'script-shaders-live-'))
process.env.LAUNCHER_DATA_DIR = sandbox
const { createNewInstance } = await import('../src/main/services/instances.ts')
const { getModrinthProjectVersions, searchModrinth } = await import('../src/main/core/mods/modrinth.ts')
const { installModToInstance } = await import('../src/main/core/mods/manager.ts')
const { installShader, getShaderEnvironment, listShaders } = await import(
  '../src/main/core/shaders/manager.ts'
)
const { listSnapshots } = await import('../src/main/services/recovery.ts')

try {
  for (const [loaderType, project, detected] of [
    ['fabric', 'iris', 'Iris'],
    ['forge', 'oculus', 'Oculus']
  ]) {
    const instance = await createNewInstance({
      name: `Live shader ${loaderType}`,
      minecraftVersion: '1.20.1',
      loaderType
    })
    const versions = await getModrinthProjectVersions(project, instance.minecraftVersion, loaderType)
    const version = versions.find((item) => item.releaseType === 'release') || versions[0]
    assert.ok(version, `No compatible ${project} version returned`)
    await installModToInstance({
      instanceId: instance.id,
      versionFile: version,
      modMetadata: { id: version.projectId, name: project, source: 'modrinth' }
    })
    const environment = await getShaderEnvironment(instance.id)
    assert.ok(environment.installed.includes(detected))
    const projects = await searchModrinth({
      query: 'BSL',
      projectType: 'shader',
      minecraftVersion: instance.minecraftVersion,
      limit: 5
    })
    assert.ok(projects.length)
    const pack = projects[0]
    const shaderVersions = await getModrinthProjectVersions(pack.id, instance.minecraftVersion)
    const shader = shaderVersions.find((item) => item.downloadUrl)
    assert.ok(shader, 'No downloadable shader version returned')
    await installShader({
      instanceId: instance.id,
      versionFile: shader,
      modMetadata: { id: pack.id, name: pack.name, source: 'modrinth' }
    })
    assert.equal((await listShaders(instance.id)).length, 1)
    assert.ok((await listSnapshots(instance.id)).length)
    console.log(
      `PASS ${loaderType}: ${detected} ${version.versionNumber}, required dependencies, and ${pack.name} ${shader.versionNumber}`
    )
  }
  console.log(
    'Live download, checksum, archive, and loader-detection checks passed. Minecraft was not launched.'
  )
} finally {
  if (!resolve(sandbox).startsWith(resolve(tmpdir()) + sep))
    throw new Error('Refusing cleanup outside the test directory')
  await rm(sandbox, { recursive: true, force: true })
}
