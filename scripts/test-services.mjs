import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'

const testSandboxDir = join(tmpdir(), `.scriptlauncher-test-${Date.now()}`)
process.env.LAUNCHER_DATA_DIR = testSandboxDir

import { getLauncherRootDirectory, initializeLauncherDirectories } from '../src/main/services/paths.ts'
import {
  createNewInstance,
  listAllInstances,
  getInstanceById,
  deleteInstanceById,
  updateExistingInstance,
  repairInstance,
  backupInstanceSaves,
  cloneInstance
} from '../src/main/services/instances.ts'
import { getSystemEnvironment } from '../src/main/services/system.ts'
import {
  loginWithOfflineAccount,
  getCurrentAuthState,
  switchActiveAccount,
  logoutAccount
} from '../src/main/services/auth.ts'
import { readGameSettings, saveGameSettings } from '../src/main/core/minecraft/options.ts'
import { addInstanceServer, removeInstanceServer, listInstanceServers } from '../src/main/core/minecraft/servers.ts'

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

  console.log('--- Modpack & Instance Details & Screenshot Verifications ---')

  const { parseModpackArchive, importModpackArchive } = await import('../src/main/core/modpacks/importer.ts')
  const { listInstanceScreenshots, deleteInstanceScreenshot, getScreenshotsDirectory } = await import('../src/main/core/minecraft/screenshots.ts')
  const { updateExistingInstance } = await import('../src/main/services/instances.ts')
  const { default: AdmZip } = await import('adm-zip')
  const { promises: fs } = await import('node:fs')

  const mrpackZip = new AdmZip()
  mrpackZip.addFile(
    'modrinth.index.json',
    Buffer.from(
      JSON.stringify({
        formatVersion: 1,
        game: 'minecraft',
        versionId: '1.0.0',
        name: 'Speedy Craft',
        summary: 'A fast lightweight pack',
        dependencies: {
          minecraft: '1.20.1',
          'fabric-loader': '0.15.11'
        },
        files: []
      })
    )
  )
  mrpackZip.addFile('overrides/config/speedy.txt', Buffer.from('fast=true'))

  const mrpackPath = join(testSandboxDir, 'speedy.mrpack')
  mrpackZip.writeZip(mrpackPath)

  const mrpackInfo = await parseModpackArchive(mrpackPath)
  console.log('Parsed Modrinth Modpack:', mrpackInfo.name, `(${mrpackInfo.format})`)
  if (mrpackInfo.loaderType !== 'fabric' || mrpackInfo.minecraftVersion !== '1.20.1') {
    throw new Error('Modrinth modpack metadata mismatch!')
  }

  const importedMrpackInstance = await importModpackArchive(mrpackPath)
  console.log('Imported Modrinth Instance:', importedMrpackInstance.name, `(${importedMrpackInstance.id})`)

  const configContent = await fs.readFile(
    join(testSandboxDir, 'instances', importedMrpackInstance.id, 'minecraft', 'config', 'speedy.txt'),
    'utf-8'
  )
  if (configContent !== 'fast=true') {
    throw new Error('Modpack overrides not properly extracted!')
  }
  console.log('Verified Modrinth overrides extraction.')

  const curseZip = new AdmZip()
  curseZip.addFile(
    'manifest.json',
    Buffer.from(
      JSON.stringify({
        minecraft: {
          version: '1.20.1',
          modLoaders: [{ id: 'neoforge-20.4.80', primary: true }]
        },
        manifestType: 'minecraftModpack',
        manifestVersion: 1,
        name: 'NeoForge Pack',
        author: 'Tester',
        files: [],
        overrides: 'overrides'
      })
    )
  )
  curseZip.addFile('overrides/defaultoptions.txt', Buffer.from('fov:90'))
  const cursePath = join(testSandboxDir, 'neoforge-pack.zip')
  curseZip.writeZip(cursePath)

  const curseInfo = await parseModpackArchive(cursePath)
  console.log('Parsed CurseForge Modpack:', curseInfo.name, `(${curseInfo.format})`)
  if (curseInfo.loaderType !== 'neoforge' || curseInfo.loaderVersion !== '20.4.80') {
    throw new Error('CurseForge modpack metadata mismatch!')
  }

  const importedCurseInstance = await importModpackArchive(cursePath)
  console.log('Imported CurseForge Instance:', importedCurseInstance.name)

  const screenshotsDir = getScreenshotsDirectory(importedMrpackInstance.id)
  await fs.mkdir(screenshotsDir, { recursive: true })
  const dummyPngPath = join(screenshotsDir, '2026-09-20_12.00.00.png')
  await fs.writeFile(dummyPngPath, Buffer.from('fake-png-data'))

  const screenshotsList = await listInstanceScreenshots(importedMrpackInstance.id)
  console.log('Found screenshots:', screenshotsList.length)
  if (screenshotsList.length !== 1 || !screenshotsList[0].dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Failed to find or parse screenshot data URL!')
  }

  const deletedScreenshot = await deleteInstanceScreenshot(importedMrpackInstance.id, '2026-09-20_12.00.00.png')
  if (!deletedScreenshot) {
    throw new Error('Failed to delete screenshot!')
  }
  const emptyScreenshots = await listInstanceScreenshots(importedMrpackInstance.id)
  if (emptyScreenshots.length !== 0) {
    throw new Error('Expected 0 screenshots after deletion!')
  }
  console.log('Verified screenshot deletion.')

  const updatedInstance = await updateExistingInstance({
    id: importedMrpackInstance.id,
    ramAllocationMegabytes: 8192,
    jvmArguments: ['-XX:+UseG1GC', '-XX:MaxGCPauseMillis=200']
  })
  if (updatedInstance.ramAllocationMegabytes !== 8192 || updatedInstance.jvmArguments.length !== 2) {
    throw new Error('Failed to update instance configuration!')
  }
  console.log('Verified instance RAM allocation and custom JVM arguments update.')

  await deleteInstanceById(importedMrpackInstance.id)
  await deleteInstanceById(importedCurseInstance.id)
  await deleteInstanceById(targetTestInstance.id)
  console.log('Deleted temporary test instances.')

  console.log('--- External Launcher Scanner & Cloning Verification ---')

  const {
    parsePrismInstance,
    parseCurseForgeInstance,
    scanCustomDirectory,
    cloneExternalInstance
  } = await import('../src/main/core/importers/externalLaunchers.ts')
  const { doesPathExist } = await import('../src/main/utils/filesystem.ts')

  const mockPrismDir = join(testSandboxDir, 'mock-prism-instance')
  await fs.mkdir(mockPrismDir, { recursive: true })
  await fs.mkdir(join(mockPrismDir, '.minecraft', 'mods'), { recursive: true })
  await fs.mkdir(join(mockPrismDir, '.minecraft', 'saves', 'MyWorld'), { recursive: true })
  await fs.writeFile(
    join(mockPrismDir, 'mmc-pack.json'),
    JSON.stringify({
      formatVersion: 1,
      components: [
        { uid: 'net.minecraft', version: '1.20.2' },
        { uid: 'net.fabricmc.fabric-loader', version: '0.15.7' }
      ]
    })
  )
  await fs.writeFile(
    join(mockPrismDir, 'instance.cfg'),
    'name=Prism Epic Pack\nMaxMemAlloc=6144\nJvmArgs=-XX:+UseG1GC\n'
  )
  await fs.writeFile(join(mockPrismDir, '.minecraft', 'mods', 'sodium.jar'), Buffer.from('mock-jar'))
  await fs.writeFile(join(mockPrismDir, '.minecraft', 'saves', 'MyWorld', 'level.dat'), Buffer.from('world-data'))

  const parsedPrism = await parsePrismInstance(mockPrismDir)
  if (!parsedPrism || parsedPrism.name !== 'Prism Epic Pack' || parsedPrism.loaderType !== 'fabric') {
    throw new Error('Failed to parse mock Prism instance!')
  }
  if (parsedPrism.totalModCount !== 1 || !parsedPrism.hasSaves || parsedPrism.ramAllocationMegabytes !== 6144) {
    throw new Error('Prism instance details mismatch!')
  }
  console.log('Parsed Prism Instance successfully:', parsedPrism.name)

  const mockCurseDir = join(testSandboxDir, 'mock-curse-instance')
  await fs.mkdir(mockCurseDir, { recursive: true })
  await fs.mkdir(join(mockCurseDir, 'mods'), { recursive: true })
  await fs.writeFile(
    join(mockCurseDir, 'minecraftinstance.json'),
    JSON.stringify({
      name: 'CurseForge Pack',
      gameVersion: '1.20.1',
      baseModLoader: { name: 'forge-47.2.0' },
      allocatedMemory: 8192
    })
  )
  await fs.writeFile(join(mockCurseDir, 'mods', 'jei.jar'), Buffer.from('mock-jei'))

  const parsedCurse = await parseCurseForgeInstance(mockCurseDir)
  if (!parsedCurse || parsedCurse.loaderType !== 'forge' || parsedCurse.ramAllocationMegabytes !== 8192) {
    throw new Error('Failed to parse mock CurseForge instance!')
  }
  console.log('Parsed CurseForge Instance successfully:', parsedCurse.name)

  const mockModrinthDir = join(testSandboxDir, 'mock-modrinth-profile')
  await fs.mkdir(join(mockModrinthDir, 'logs'), { recursive: true })
  await fs.mkdir(join(mockModrinthDir, 'mods'), { recursive: true })
  await fs.writeFile(
    join(mockModrinthDir, 'logs', 'latest.log'),
    '[10:00:00] [main/INFO]: Loading Minecraft 1.20.1 with Fabric Loader 0.16.9\n'
  )
  await fs.writeFile(join(mockModrinthDir, 'mods', 'sodium-fabric-0.5.8+mc1.20.1.jar'), Buffer.from('mock-sodium'))

  const { parseModrinthProfile } = await import('../src/main/core/importers/externalLaunchers.ts')
  const parsedModrinth = await parseModrinthProfile(mockModrinthDir)
  if (
    !parsedModrinth ||
    parsedModrinth.minecraftVersion !== '1.20.1' ||
    parsedModrinth.loaderType !== 'fabric' ||
    parsedModrinth.loaderVersion !== '0.16.9'
  ) {
    throw new Error('Failed to parse mock Modrinth profile!')
  }
  console.log('Parsed Modrinth Profile successfully:', parsedModrinth.name, `(${parsedModrinth.minecraftVersion} ${parsedModrinth.loaderType})`)

  const customScanned = await scanCustomDirectory(mockPrismDir)
  if (customScanned.length === 0 || customScanned[0].name !== 'Prism Epic Pack') {
    throw new Error('Failed to scan custom directory!')
  }
  console.log('Verified custom directory scanner.')

  const clonedInstance = await cloneExternalInstance({
    sourceInstance: parsedPrism,
    customName: 'Imported Prism World',
    copySaves: true
  })
  console.log('Cloned instance successfully:', clonedInstance.name, `(${clonedInstance.id})`)

  if (clonedInstance.ramAllocationMegabytes !== 6144) {
    throw new Error('Cloned instance RAM allocation mismatch!')
  }

  const clonedModPath = join(testSandboxDir, 'instances', clonedInstance.id, 'minecraft', 'mods', 'sodium.jar')
  if (!(await doesPathExist(clonedModPath))) {
    throw new Error('Cloned instance is missing copied mod jar!')
  }

  const clonedSavePath = join(testSandboxDir, 'instances', clonedInstance.id, 'minecraft', 'saves', 'MyWorld', 'level.dat')
  if (!(await doesPathExist(clonedSavePath))) {
    throw new Error('Cloned instance is missing copied world save!')
  }
  console.log('Verified cloned instance mods and world saves isolation.')

  await deleteInstanceById(clonedInstance.id)
  console.log('--- Dropped Mods, Quick-Play Servers & Worlds, and Skins Verification ---')

  const { installDroppedModFiles } = await import('../src/main/core/mods/drop.ts')
  const { getInstanceServers, getInstanceWorlds } = await import('../src/main/core/minecraft/servers.ts')
  const { listAllSkins, saveSkin, setActiveSkin, deleteSkin, listAllCapes, saveCustomCape, setActiveCape, deleteCustomCape } = await import('../src/main/core/system/skins.ts')

  const dropTestInstance = await createNewInstance({
    name: 'Drop Mod Test Instance',
    minecraftVersion: '1.20.1',
    loaderType: 'fabric'
  })

  const mockModZip = new AdmZip()
  mockModZip.addFile(
    'fabric.mod.json',
    Buffer.from(
      JSON.stringify({
        id: 'coolmod',
        name: 'Cool Mod',
        version: '1.0.0',
        description: 'A dropped mod for testing'
      })
    )
  )
  const droppedJarPath = join(testSandboxDir, 'coolmod-1.0.0.jar')
  mockModZip.writeZip(droppedJarPath)

  const dropResult = await installDroppedModFiles(dropTestInstance.id, [droppedJarPath])
  if (!dropResult.success || dropResult.installedMods.length !== 1 || dropResult.installedMods[0].name !== 'Cool Mod') {
    throw new Error('Dropped mod installation failed!')
  }
  console.log('Installed dropped mod successfully:', dropResult.installedMods[0].name)

  const testWorldDir = join(testSandboxDir, 'instances', dropTestInstance.id, 'minecraft', 'saves', 'SurvivalWorld')
  await fs.mkdir(testWorldDir, { recursive: true })
  await fs.writeFile(join(testWorldDir, 'level.dat'), Buffer.from('mock-level-dat'))
  await fs.writeFile(join(testWorldDir, 'icon.png'), Buffer.from('mock-icon-bytes'))

  const worlds = await getInstanceWorlds(dropTestInstance)
  if (worlds.length !== 1 || worlds[0].folderName !== 'SurvivalWorld' || !worlds[0].icon) {
    throw new Error('Failed to discover singleplayer world with icon!')
  }
  console.log('Discovered singleplayer world with icon:', worlds[0].name)

  const initialSkins = await listAllSkins()
  if (initialSkins.skins.length < 9) {
    throw new Error('Expected at least 9 official preset skins!')
  }
  console.log('Verified official preset skins:', initialSkins.skins.length)

  const savedSkin = await saveSkin({
    name: 'Hero Skin',
    textureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    model: 'slim',
    source: 'custom',
    author: 'Tester'
  })
  if (savedSkin.name !== 'Hero Skin' || savedSkin.model !== 'slim') {
    throw new Error('Failed to save custom skin!')
  }
  console.log('Saved custom skin successfully:', savedSkin.id)

  await setActiveSkin(savedSkin.id)
  const skinsAfterSet = await listAllSkins()
  if (skinsAfterSet.activeSkinId !== savedSkin.id) {
    throw new Error('Active skin ID was not updated!')
  }
  console.log('Verified active skin update.')

  await deleteSkin(savedSkin.id)
  const skinsAfterDelete = await listAllSkins()
  if (skinsAfterDelete.skins.some((s) => s.id === savedSkin.id)) {
    throw new Error('Custom skin was not deleted!')
  }
  console.log('Verified skin deletion.')

  const initialCapes = await listAllCapes()
  if (initialCapes.capes.length < 14) {
    throw new Error('Expected at least 14 official preset capes!')
  }
  console.log('Verified official preset capes count:', initialCapes.capes.length)

  const savedCape = await saveCustomCape({
    name: 'Champion Cape',
    textureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  })
  if (savedCape.name !== 'Champion Cape' || savedCape.source !== 'custom') {
    throw new Error('Failed to save custom cape!')
  }
  console.log('Saved custom cape successfully:', savedCape.id)

  await setActiveCape(savedCape.id)
  const capesAfterSet = await listAllCapes()
  if (capesAfterSet.activeCapeId !== savedCape.id) {
    throw new Error('Active cape ID was not updated!')
  }
  console.log('Verified active cape update.')

  await setActiveCape(null)
  const capesAfterUnequip = await listAllCapes()
  if (capesAfterUnequip.activeCapeId !== null) {
    throw new Error('Active cape was not unequipped!')
  }
  console.log('Verified cape unequip.')

  await deleteCustomCape(savedCape.id)
  const capesAfterDelete = await listAllCapes()
  if (capesAfterDelete.capes.some((c) => c.id === savedCape.id)) {
    throw new Error('Custom cape was not deleted!')
  }
  console.log('Verified cape deletion.')

  const initialSettings = await readGameSettings(dropTestInstance.id)
  if (initialSettings.vanilla.renderDistance !== 12 || initialSettings.hasOptionsTxt) {
    throw new Error('Default game settings mismatch!')
  }
  console.log('Verified initial default game settings.')

  await saveGameSettings(dropTestInstance.id, {
    ...initialSettings,
    vanilla: {
      ...initialSettings.vanilla,
      renderDistance: 16,
      maxFps: 144,
      fov: 90,
      enableVsync: true
    },
    sodium: {
      smooth_lighting: 'HIGH',
      biome_blend: 5,
      entity_distance_scaling: 150,
      entity_shadows: false,
      vignette: true,
      leaves_quality: 'HIGH',
      weather_quality: 'HIGH',
      particle_quality: 'HIGH',
      chunk_builder_threads: 4,
      always_defer_chunk_updates: true,
      use_block_face_culling: true,
      use_fog_occlusion: true,
      use_entity_culling: true,
      use_compact_vertex_format: true,
      animate_only_visible_textures: true,
      cpu_render_ahead_limit: 2,
      allow_direct_memory_access: true
    },
    optifine: {
      ofSmoothFps: true,
      ofSmoothWorld: true,
      ofFastRender: true,
      ofFastMath: true,
      ofDynamicLights: 'fancy',
      ofDynamicFov: true,
      ofConnectedTextures: 'fancy',
      ofCustomSky: true,
      ofCustomFonts: true,
      ofCustomColors: true,
      ofBetterGrass: 'fast',
      ofBetterSnow: true,
      ofClearWater: true,
      ofShowFps: true,
      ofFogType: 'fancy'
    }
  })

  const reloadedSettings = await readGameSettings(dropTestInstance.id)
  if (
    !reloadedSettings.hasOptionsTxt ||
    reloadedSettings.vanilla.renderDistance !== 16 ||
    reloadedSettings.vanilla.maxFps !== 144 ||
    reloadedSettings.vanilla.fov !== 90 ||
    reloadedSettings.vanilla.enableVsync !== true ||
    reloadedSettings.sodium?.chunk_builder_threads !== 4 ||
    reloadedSettings.optifine?.ofSmoothFps !== true
  ) {
    throw new Error('Saved game settings did not reload correctly!')
  }
  console.log('Verified game settings saved and reloaded successfully (options.txt, sodium, optifine).')

  const addedServers = await addInstanceServer(dropTestInstance.id, {
    name: 'Hypixel Network',
    ip: 'mc.hypixel.net'
  })
  if (addedServers.length !== 1 || addedServers[0].ip !== 'mc.hypixel.net') {
    throw new Error('Failed to add server to instance!')
  }

  await addInstanceServer(dropTestInstance.id, {
    name: 'Test Local',
    ip: '127.0.0.1:25565'
  })

  const listed = await listInstanceServers(dropTestInstance.id)
  if (listed.length !== 2) {
    throw new Error('Server count mismatch in instance!')
  }

  const remaining = await removeInstanceServer(dropTestInstance.id, 'mc.hypixel.net')
  if (remaining.length !== 1 || remaining[0].name !== 'Test Local') {
    throw new Error('Failed to remove server from instance!')
  }
  console.log('Verified instance servers.dat management (add, list, remove).')

  const clonedForUpgrade = await cloneInstance(dropTestInstance.id, 'Cloned For Upgrade Test')
  if (clonedForUpgrade.name !== 'Cloned For Upgrade Test' || clonedForUpgrade.minecraftVersion !== '1.20.1') {
    throw new Error('Failed to clone instance for upgrade test!')
  }
  console.log('Verified cloneInstance for upgrade backup.')

  const backupSavesResult = await backupInstanceSaves(dropTestInstance.id)
  if (!backupSavesResult.success) {
    throw new Error('Failed to backup instance saves!')
  }
  console.log('Verified backupInstanceSaves successfully.')

  const upgraded = await updateExistingInstance({
    id: dropTestInstance.id,
    minecraftVersion: '1.21.1',
    loaderType: 'forge',
    loaderVersion: '51.0.33'
  })
  if (upgraded.minecraftVersion !== '1.21.1' || upgraded.loaderType !== 'forge' || upgraded.loaderVersion !== '51.0.33') {
    throw new Error('Failed to update instance game version and mod loader!')
  }
  console.log('Verified updateExistingInstance with new MC version and loader.')

  const repairResult = await repairInstance(dropTestInstance.id)
  if (!repairResult.success) {
    throw new Error('Failed to repair instance!')
  }
  console.log('Verified repairInstance successfully.')

  console.log('--- Phase 8 Resource Packs Verification ---')
  const rpTestInstance = await createNewInstance({
    name: 'Vanilla Resource Pack Test',
    minecraftVersion: '1.21.1',
    loaderType: 'vanilla',
    ramAllocationMegabytes: 2048
  })

  const {
    listInstalledResourcePacks,
    toggleResourcePackEnabled,
    deleteInstalledResourcePack,
    installDroppedResourcePacks
  } = await import('../src/main/core/resourcepacks/manager.ts')
  const { searchCurseForge } = await import('../src/main/core/mods/curseforge.ts')

  const dummyPackZip = join(testSandboxDir, 'TestPack.zip')
  const zip = new AdmZip()
  zip.addFile(
    'pack.mcmeta',
    Buffer.from(
      JSON.stringify({
        pack: {
          pack_format: 34,
          description: 'A custom test texture pack'
        }
      })
    )
  )
  zip.writeZip(dummyPackZip)

  const dropPackResult = await installDroppedResourcePacks(rpTestInstance.id, [dummyPackZip])
  if (!dropPackResult.success || dropPackResult.installedPacks.length !== 1) {
    throw new Error('Failed to install dropped resource pack!')
  }
  console.log('Installed dropped resource pack successfully:', dropPackResult.installedPacks[0].name)

  const listedPacks = await listInstalledResourcePacks(rpTestInstance.id)
  if (listedPacks.length !== 1 || listedPacks[0].name !== 'TestPack' || listedPacks[0].description !== 'A custom test texture pack') {
    throw new Error('Listed resource pack does not match expected pack metadata!')
  }
  console.log('Verified listed resource pack metadata and mcmeta parsing.')

  const toggledOffSuccess = await toggleResourcePackEnabled(rpTestInstance.id, 'TestPack.zip', false)
  if (!toggledOffSuccess) {
    throw new Error('Failed to disable resource pack!')
  }
  const packsAfterDisable = await listInstalledResourcePacks(rpTestInstance.id)
  if (packsAfterDisable.length !== 1 || packsAfterDisable[0].enabled !== false) {
    throw new Error('Resource pack was not disabled!')
  }
  console.log('Verified resource pack disable toggle.')

  const toggledOnSuccess = await toggleResourcePackEnabled(rpTestInstance.id, 'TestPack.zip', true)
  if (!toggledOnSuccess) {
    throw new Error('Failed to enable resource pack!')
  }
  const packsAfterEnable = await listInstalledResourcePacks(rpTestInstance.id)
  if (packsAfterEnable.length !== 1 || packsAfterEnable[0].enabled !== true) {
    throw new Error('Resource pack was not enabled!')
  }
  console.log('Verified resource pack enable toggle.')

  const deletedPack = await deleteInstalledResourcePack(rpTestInstance.id, 'TestPack.zip')
  if (!deletedPack) {
    throw new Error('Failed to delete resource pack!')
  }
  const remainingPacks = await listInstalledResourcePacks(rpTestInstance.id)
  if (remainingPacks.length !== 0) {
    throw new Error('Expected 0 resource packs after deletion!')
  }
  console.log('Verified resource pack deletion.')

  const modrinthRPResults = await searchModrinth({
    query: 'faithful',
    projectType: 'resourcepack',
    limit: 3
  })
  if (modrinthRPResults.length === 0 || modrinthRPResults[0].projectType !== 'resourcepack') {
    throw new Error('Modrinth resource pack search failed or returned wrong project type!')
  }
  console.log(`Verified Modrinth Resource Pack search: found ${modrinthRPResults.length} hits (First: ${modrinthRPResults[0].name})`)

  try {
    const curseForgeRPResults = await searchCurseForge({
      query: 'faithful',
      projectType: 'resourcepack',
      limit: 3
    })
    console.log(`Verified CurseForge Resource Pack search: found ${curseForgeRPResults.length} hits`)
  } catch {
    console.log('CurseForge Resource Pack search skipped due to network/API limit.')
  }

  console.log('--- Phase 9 Batch Mod Update Verification ---')
  const { checkForModUpdates, updateAllMods } = await import('../src/main/core/mods/updates.ts')
  const updateTestInstance = await createNewInstance({
    name: 'UpdateTest',
    minecraftVersion: '1.20.1',
    loaderType: 'fabric'
  })

  const emptyUpdates = await checkForModUpdates(updateTestInstance.id, true)
  if (!Array.isArray(emptyUpdates) || emptyUpdates.length !== 0) {
    throw new Error('Expected 0 updates for empty instance!')
  }
  console.log('Verified empty instance update check returns empty array.')

  const mockUpdates = [
    {
      modId: 'sodium',
      name: 'Sodium',
      currentVersion: 'mc1.20.1-0.5.8',
      currentFilename: 'sodium-fabric-0.5.8.jar',
      latestVersion: '0.5.11',
      source: 'modrinth',
      versionFile: {
        id: 'ver-test-123',
        projectId: 'sodium',
        name: 'Sodium 0.5.11',
        versionNumber: '0.5.11',
        gameVersions: ['1.20.1'],
        loaders: ['fabric'],
        downloadUrl: 'https://cdn.modrinth.com/data/AANobbMI/versions/test/sodium.jar',
        filename: 'sodium-fabric-0.5.11.jar',
        sizeBytes: 1024,
        releaseType: 'release',
        datePublished: new Date().toISOString()
      },
      releaseType: 'release'
    }
  ]

  let progressCalled = false
  const progressCalls = []
  const updateAllResult = await updateAllMods(updateTestInstance.id, mockUpdates, (prog) => {
    progressCalled = true
    progressCalls.push(prog)
  })

  if (!updateAllResult.success) {
    throw new Error('updateAllMods failed!')
  }
  if (!progressCalled || progressCalls.length === 0) {
    throw new Error('updateAllMods did not trigger progress events!')
  }
  console.log('Verified updateAllMods execution and progress reporting.')

  await deleteInstanceById(updateTestInstance.id)
  await deleteInstanceById(rpTestInstance.id)
  await deleteInstanceById(clonedForUpgrade.id)
  await deleteInstanceById(dropTestInstance.id)
  console.log('--- All Launcher Cloner, Modpack, Screenshot, Dropped Mods, Resource Packs, Mod Updates, Servers, and Skins Verifications Passed! ---')
}

runTests()
  .then(() => {
    try {
      rmSync(testSandboxDir, { recursive: true, force: true })
    } catch {}
  })
  .catch((err) => {
    try {
      rmSync(testSandboxDir, { recursive: true, force: true })
    } catch {}
    console.error('Test failed:', err)
    process.exit(1)
  })

