import { getLauncherRootDirectory, initializeLauncherDirectories, getInstancesDirectory } from '../src/main/services/paths.ts'
import { createNewInstance, listAllInstances, getInstanceById, deleteInstanceById } from '../src/main/services/instances.ts'
import { getSystemEnvironment } from '../src/main/services/system.ts'

async function runTests() {
  console.log('Running Phase 1 Services Verification...')

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

  const remaining = await listAllInstances()
  console.log('Remaining instances count:', remaining.length)

  console.log('All Phase 1 Services Passed with flying colors!')
}

runTests().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
