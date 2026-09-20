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

  console.log('--- All Phase 1, Phase 2 & Phase 3 Verifications Passed! ---')
}

runTests().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
