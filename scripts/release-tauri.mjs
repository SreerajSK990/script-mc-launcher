import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'))
const version = packageJson.version
const tauriConfig = JSON.parse(readFileSync(join(projectRoot, 'src-tauri', 'tauri.conf.json'), 'utf-8'))
const cargoManifest = readFileSync(join(projectRoot, 'src-tauri', 'Cargo.toml'), 'utf-8')
const defaultsSource = readFileSync(join(projectRoot, 'src', 'shared', 'constants', 'defaults.ts'), 'utf-8')

const versionSources = {
  'src-tauri/tauri.conf.json': tauriConfig.version,
  'src-tauri/Cargo.toml': cargoManifest.match(/^version = "([^"]+)"/m)?.[1],
  'src/shared/constants/defaults.ts': defaultsSource.match(/VERSION: '([^']+)'/)?.[1]
}

for (const [file, found] of Object.entries(versionSources)) {
  if (found !== version) {
    throw new Error(`${file} has version ${found}, expected ${version} from package.json`)
  }
}

const skipBuild = process.argv.includes('--skip-build')
if (!skipBuild) {
  execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })
  execSync('npx tauri build --bundles nsis', { cwd: projectRoot, stdio: 'inherit' })
}

const releaseDirectory = join(projectRoot, 'src-tauri', 'target', 'release')
const nsisDirectory = join(releaseDirectory, 'bundle', 'nsis')
const bundledInstaller = readdirSync(nsisDirectory).find(
  (name) => name.includes(`_${version}_`) && name.endsWith('-setup.exe')
)
if (!bundledInstaller) {
  throw new Error(`No NSIS installer for ${version} found in ${nsisDirectory}`)
}

const distDirectory = join(projectRoot, 'dist')
if (existsSync(distDirectory)) {
  rmSync(distDirectory, { recursive: true, force: true })
}
mkdirSync(distDirectory, { recursive: true })

const installerName = `Script-Minecraft-Launcher-Setup-${version}.exe`
const portableName = `Script.Minecraft.Launcher.${version}.exe`
const installerPath = join(distDirectory, installerName)
copyFileSync(join(nsisDirectory, bundledInstaller), installerPath)
copyFileSync(join(releaseDirectory, 'script-mc-launcher.exe'), join(distDirectory, portableName))

const installerBytes = readFileSync(installerPath)
const sha512 = createHash('sha512').update(installerBytes).digest('base64')
const size = statSync(installerPath).size

const manifest = [
  `version: ${version}`,
  'files:',
  `  - url: ${installerName}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${installerName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  ''
].join('\n')
writeFileSync(join(distDirectory, 'latest.yml'), manifest)

console.log(`Release artifacts for v${version}:`)
for (const name of readdirSync(distDirectory)) {
  console.log(`  ${name} (${(statSync(join(distDirectory, name)).size / 1024 / 1024).toFixed(1)} MB)`)
}
