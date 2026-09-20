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

  console.log('--- All Phase 1 & Phase 2 Verifications Passed! ---')
}

runTests().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
