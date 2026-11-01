import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
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

const signingKeyPath = join(homedir(), '.tauri', 'script-mc-launcher.key')
const signingPasswordPath = `${signingKeyPath}.password`
if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  if (!existsSync(signingKeyPath)) {
    throw new Error(`Updater signing key not found at ${signingKeyPath}`)
  }
  process.env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(signingKeyPath, 'utf-8').trim()
}
if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD && existsSync(signingPasswordPath)) {
  process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = readFileSync(signingPasswordPath, 'utf-8').trim()
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

const signaturePath = join(nsisDirectory, `${bundledInstaller}.sig`)
if (!existsSync(signaturePath)) {
  throw new Error(`Updater signature ${signaturePath} was not produced; check the signing key`)
}
const releaseNotesPath = join(projectRoot, 'release-notes', `v${version}.md`)
const updaterManifest = {
  version,
  notes: existsSync(releaseNotesPath) ? readFileSync(releaseNotesPath, 'utf-8') : `Script Minecraft Launcher v${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: readFileSync(signaturePath, 'utf-8').trim(),
      url: `https://github.com/SreerajSK990/script-mc-launcher/releases/download/v${version}/${installerName}`
    }
  }
}
writeFileSync(join(distDirectory, 'latest.json'), `${JSON.stringify(updaterManifest, null, 2)}\n`)

console.log(`Release artifacts for v${version}:`)
for (const name of readdirSync(distDirectory)) {
  console.log(`  ${name} (${(statSync(join(distDirectory, name)).size / 1024 / 1024).toFixed(1)} MB)`)
}
