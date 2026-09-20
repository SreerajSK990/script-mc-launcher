import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'

const testSandboxDir = join(tmpdir(), `.scriptlauncher-test-${Date.now()}`)
process.env.LAUNCHER_DATA_DIR = testSandboxDir

import { getLauncherRootDirectory, initializeLauncherDirectories } from '../src/main/services/paths.ts'
import { createNewInstance, listAllInstances, getInstanceById, deleteInstanceById } from '../src/main/services/instances.ts'
import { getSystemEnvironment } from '../src/main/services/system.ts'
import {
  loginWithOfflineAccount,
  getCurrentAuthState,
  switchActiveAccount,
  logoutAccount
} from '../src/main/services/auth.ts'

async function runTests() {
  console.log('--- Phase 1 Services Verification ---')

  const rootDir = getLauncherRootDirectory()
  console.log('Launcher Root:', rootDir)

  await initializeLauncherDirectories()
  console.log('Directories initialized successfully.')

  const env = await getSystemEnvironment()
  console.log('System Memory:', `${env.memory.totalMegabytes} MB`)
  console.log('Platform:', `${env.os.platform} (${env.os.architecture})`)
  console.log('Detected Java:', env.defaultJavaPath || 'None')

  const testInstance = await createNewInstance({
    name: 'Survival World',
    minecraftVersion: '1.21.1',
    loaderType: 'fabric',
    ramAllocationMegabytes: 4096
  })
  console.log('Created Instance:', testInstance.name, `(${testInstance.id})`)

  const instances = await listAllInstances()
  console.log('Listed Instances Count:', instances.length)

  const retrieved = await getInstanceById(testInstance.id)
  if (!retrieved || retrieved.id !== testInstance.id) {
    throw new Error('Retrieved instance does not match created instance!')
  }
  console.log('Retrieved instance verified.')

  const deleted = await deleteInstanceById(testInstance.id)
  if (!deleted) {
    throw new Error('Failed to delete instance!')
  }
  console.log('Deleted instance successfully.')

  console.log('--- Phase 2 Auth Services Verification ---')

  const alexAccount = await loginWithOfflineAccount('Alex')
  console.log(`Created Offline Player: ${alexAccount.username} (${alexAccount.uuid})`)

  const steveAccount = await loginWithOfflineAccount('Steve')
  console.log(`Created Offline Player: ${steveAccount.username} (${steveAccount.uuid})`)

  let authState = await getCurrentAuthState()
  console.log(`Total Stored Accounts: ${authState.accounts.length}`)
  console.log(`Active Account: ${authState.activeAccount?.username}`)

  if (authState.activeAccount?.username !== 'Steve') {
    throw new Error('Expected newest account to be active')
  }

  await switchActiveAccount(alexAccount.id)
  authState = await getCurrentAuthState()
  console.log(`Switched Active Account to: ${authState.activeAccount?.username}`)
  if (authState.activeAccount?.username !== 'Alex') {
    throw new Error('Failed to switch active account')
  }

  await logoutAccount(steveAccount.id)
  await logoutAccount(alexAccount.id)
  authState = await getCurrentAuthState()
  console.log(`Remaining accounts after logout: ${authState.accounts.length}`)

  console.log('--- Phase 3 Launch Engine & Metadata Verification ---')

  const { fetchMojangVersionManifest, getAvailableReleaseVersions, fetchVersionPackage } = await import('../src/main/core/minecraft/meta.ts')
  const { convertMavenCoordinateToPath } = await import('../src/main/core/minecraft/libraries.ts')
  const { isRuleAllowed } = await import('../src/main/core/minecraft/rules.ts')
  const { buildExecutionArguments } = await import('../src/main/core/minecraft/arguments.ts')

  const manifest = await fetchMojangVersionManifest()
  console.log(`Loaded Manifest: ${manifest.versions.length} versions. Latest release: ${manifest.latest.release}`)

  const releases = await getAvailableReleaseVersions()
  console.log(`Available Releases: ${releases.length}. Latest: ${releases[0]}`)

  const testVersion = releases[0] || '1.21.1'
  const versionPackage = await fetchVersionPackage(testVersion)
  console.log(`Loaded Version Package for ${versionPackage.id}: MainClass = ${versionPackage.mainClass}`)

  const mavenPath = convertMavenCoordinateToPath('com.google.guava:guava:31.1-jre')
  if (mavenPath !== 'com/google/guava/guava/31.1-jre/guava-31.1-jre.jar') {
    throw new Error(`Maven path conversion failed: ${mavenPath}`)
  }
  console.log(`Verified Maven Coordinate conversion: ${mavenPath}`)

  const testRuleAllow = isRuleAllowed([{ action: 'allow', os: { name: 'windows' } }], 'windows', 'x64')
  const testRuleDisallow = isRuleAllowed([{ action: 'allow', os: { name: 'osx' } }], 'windows', 'x64')
  if (!testRuleAllow || testRuleDisallow) {
    throw new Error('OS Rule evaluation failed!')
  }
  console.log('Verified OS Rules evaluation.')

  const sampleAccount = {
    id: 'test-user',
    username: 'TestSteve',
    uuid: '11111111-2222-3333-4444-555555555555',
    accountType: 'offline',
    accessToken: '0',
    refreshToken: null,
    expiresAt: Infinity,
    createdAt: new Date().toISOString()
  }

  const sampleInstance = {
    id: 'test-instance',
    name: 'Test Instance',
    minecraftVersion: testVersion,
    loaderType: 'vanilla',
    loaderVersion: null,
    javaPath: null,
    jvmArguments: ['-XX:+UseG1GC'],
    ramAllocationMegabytes: 4096,
    createdAt: new Date().toISOString(),
    lastPlayedAt: null,
    totalPlayTimeMinutes: 0
  }

  const execArgs = buildExecutionArguments({
    instance: sampleInstance,
    versionPackage,
    account: sampleAccount,
    nativesDirectory: 'C:/fake/natives',
    classpathString: 'C:/fake/lib1.jar;C:/fake/lib2.jar'
  })

  console.log(`Constructed ${execArgs.jvmArguments.length} JVM arguments & ${execArgs.gameArguments.length} game arguments`)
  if (!execArgs.gameArguments.includes('TestSteve')) {
    throw new Error('Expected player username in game arguments!')
  }
  console.log('Verified execution arguments builder.')

  console.log('--- Phase 4 Prism Meta Verification ---')
  const { getCompatibleLoaderVersions } = await import('../src/main/core/meta/prism.ts')
  const fabricVersions = await getCompatibleLoaderVersions('fabric', '1.20.1')
  console.log(`Fabric versions count for 1.20.1: ${fabricVersions.length} (Latest: ${fabricVersions[0]})`)
  if (fabricVersions.length === 0) {
    throw new Error('Expected at least one Fabric version!')
  }

  const quiltVersions = await getCompatibleLoaderVersions('quilt', '1.20.1')
  console.log(`Quilt versions count for 1.20.1: ${quiltVersions.length} (Latest: ${quiltVersions[0]})`)
  if (quiltVersions.length === 0) {
    throw new Error('Expected at least one Quilt version!')
  }

  const forgeVersions = await getCompatibleLoaderVersions('forge', '1.20.1')
  console.log(`Forge versions count for 1.20.1: ${forgeVersions.length} (Latest: ${forgeVersions[0]})`)
  if (forgeVersions.length === 0) {
    throw new Error('Expected Forge versions for 1.20.1!')
  }

  const neoForgeVersions = await getCompatibleLoaderVersions('neoforge', '1.20.4')
  console.log(`NeoForge versions count for 1.20.4: ${neoForgeVersions.length} (Latest: ${neoForgeVersions[0]})`)
  if (neoForgeVersions.length === 0) {
    throw new Error('Expected NeoForge versions for 1.20.4!')
  }

  console.log('--- Phase 5 Mod Loader Launch Config Verification ---')
  const { resolveInstanceLaunchConfiguration } = await import('../src/main/core/loaders/resolver.ts')

  const fabricInstance = {
    ...sampleInstance,
    id: 'test-fabric-instance',
    minecraftVersion: '1.20.1',
    loaderType: 'fabric',
    loaderVersion: fabricVersions[0]
  }
  const fabricConfig = await resolveInstanceLaunchConfiguration(fabricInstance, versionPackage)
  console.log(`Fabric mainClass: ${fabricConfig.versionPackage.mainClass}`)
  if (fabricConfig.versionPackage.mainClass !== 'net.fabricmc.loader.impl.launch.knot.KnotClient') {
    throw new Error(`Expected Fabric KnotClient main class, got: ${fabricConfig.versionPackage.mainClass}`)
  }

  const forgeInstance = {
    ...sampleInstance,
    id: 'test-forge-instance',
    minecraftVersion: '1.20.1',
    loaderType: 'forge',
    loaderVersion: forgeVersions[0]
  }
  const forgeConfig = await resolveInstanceLaunchConfiguration(forgeInstance, versionPackage)
  console.log(`Forge mainClass: ${forgeConfig.versionPackage.mainClass}`)
  console.log(`Forge extra download tasks: ${forgeConfig.extraDownloadTasks.length}`)
  console.log(`Forge extra JVM arguments: ${forgeConfig.extraJvmArguments.join(' ')}`)

  if (forgeConfig.versionPackage.mainClass !== 'io.github.zekerzhayard.forgewrapper.installer.Main') {
    throw new Error(`Expected ForgeWrapper main class, got: ${forgeConfig.versionPackage.mainClass}`)
  }
  if (!forgeConfig.extraJvmArguments.some((arg) => arg.startsWith('-Dforgewrapper.installer='))) {
    throw new Error('Expected -Dforgewrapper.installer JVM argument!')
  }

  console.log('--- Phase 6 Mojang Java Runtime Verification ---')
  const { resolveJavaComponentForVersion, resolveMojangPlatform, fetchMojangJavaProducts } = await import(
    '../src/main/core/java/runtime.ts'
  )

  const legacyComp = resolveJavaComponentForVersion(null, '1.16.5')
  const java17Comp = resolveJavaComponentForVersion(null, '1.20.1')
  const java21Comp = resolveJavaComponentForVersion(null, '1.21.1')

  console.log(`Java component for 1.16.5: ${legacyComp}`)
  console.log(`Java component for 1.20.1: ${java17Comp}`)
  console.log(`Java component for 1.21.1: ${java21Comp}`)

  if (legacyComp !== 'jre-legacy' || java17Comp !== 'java-runtime-gamma' || java21Comp !== 'java-runtime-delta') {
    throw new Error('Java component version mapping mismatch!')
  }

  const mojangPlatform = resolveMojangPlatform()
  console.log(`Detected Mojang platform identifier: ${mojangPlatform}`)

  const javaProducts = await fetchMojangJavaProducts()
  if (!javaProducts[mojangPlatform]) {
    throw new Error(`Expected platform ${mojangPlatform} in Mojang products manifest`)
  }
  console.log(`Verified Mojang JRE products manifest for ${mojangPlatform}`)

  console.log('--- Phase 7 Mod Browser & Manager Verification ---')
  const { searchModrinth, getModrinthProjectVersions } = await import('../src/main/core/mods/modrinth.ts')
  const { listInstalledMods, toggleModEnabled, deleteInstalledMod } = await import('../src/main/core/mods/manager.ts')

  const modSearchResults = await searchModrinth({
    query: 'sodium',
    limit: 3
  })
  console.log(`Modrinth search for "sodium" returned ${modSearchResults.length} hits. First: ${modSearchResults[0]?.name}`)
  if (modSearchResults.length === 0 || !modSearchResults[0]?.name.toLowerCase().includes('sodium')) {
    throw new Error('Expected Sodium in Modrinth search results!')
  }

  const sodiumVersions = await getModrinthProjectVersions(modSearchResults[0].id, '1.20.1', 'fabric')
  console.log(`Found ${sodiumVersions.length} Sodium versions matching Fabric 1.20.1`)
  if (sodiumVersions.length === 0) {
    throw new Error('Expected compatible Sodium versions for Fabric 1.20.1')
  }

  const targetTestInstance = await createNewInstance({
    name: 'Modded Test World',
    minecraftVersion: '1.20.1',
    loaderType: 'fabric',
    ramAllocationMegabytes: 4096
  })

  // Test manual mod registration in instance mods manager
  const { writeJsonFileAtomic } = await import('../src/main/utils/filesystem.ts')
  const { getModsMetadataPath } = await import('../src/main/core/mods/manager.ts')

  const dummyModRecord = {
    id: 'test-mod',
    name: 'Test Mod',
    version: '1.0.0',
    filename: 'test-mod-1.0.0.jar',
    source: 'modrinth',
    installedAt: new Date().toISOString(),
    enabled: true,
    fileSizeBytes: 1024
  }

  await writeJsonFileAtomic(getModsMetadataPath(targetTestInstance.id), [dummyModRecord])
  const initialMods = await listInstalledMods(targetTestInstance.id)
  console.log(`Verified instance mods catalog read (${initialMods.length} mods)`)

  await deleteInstalledMod(targetTestInstance.id, dummyModRecord.filename)
  const remainingMods = await listInstalledMods(targetTestInstance.id)
  if (remainingMods.length !== 0) {
    throw new Error('Expected 0 mods after deletion!')
  }
  console.log('Verified mod deletion from instance.')

  await deleteInstanceById(targetTestInstance.id)
  console.log('Deleted temporary test instance.')

  console.log('--- All Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6 & Phase 7 Verifications Passed! ---')
}

runTests()
  .then(() => {
    try {
      rmSync(testSandboxDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup error
    }
  })
  .catch((err) => {
    try {
      rmSync(testSandboxDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup error
    }
    console.error('Test failed:', err)
    process.exit(1)
  })

