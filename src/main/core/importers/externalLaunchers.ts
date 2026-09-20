import { join, basename, dirname } from 'node:path'
import { promises as fs } from 'node:fs'
import type {
  DiscoveredExternalInstance,
  ExternalLauncherType,
  CloneInstancePayload,
  CloneProgressEvent
} from '@shared/types/externalLauncher'
import type { InstanceConfiguration, ModLoaderType } from '@shared/types/instance'
import type { InstalledModRecord } from '@shared/types/mods'
import { createNewInstance } from '@main/services/instances'
import { getInstanceMinecraftPath } from '@main/services/paths'
import {
  ensureDirectoryExists,
  doesPathExist,
  readJsonFile,
  writeJsonFileAtomic
} from '@main/utils/filesystem'
import { getModsMetadataPath } from '@main/core/mods/manager'

export function getLauncherDefaultPaths(): Record<ExternalLauncherType, string[]> {
  const appData = process.env.APPDATA || ''
  const userProfile = process.env.USERPROFILE || ''
  const localAppData = process.env.LOCALAPPDATA || ''

  return {
    prism: [
      join(appData, 'PrismLauncher', 'instances'),
      join(localAppData, 'Programs', 'PrismLauncher', 'instances')
    ],
    multimc: [
      join(appData, 'MultiMC', 'instances')
    ],
    modrinth: [
      join(appData, 'ModrinthApp', 'profiles'),
      join(appData, 'com.modrinth.theseus', 'profiles'),
      join(localAppData, 'ModrinthApp', 'profiles'),
      join(userProfile, '.modrinth', 'profiles')
    ],
    curseforge: [
      join(userProfile, 'curseforge', 'minecraft', 'Instances'),
      join(appData, 'CurseForge', 'minecraft', 'Instances')
    ],
    vanilla: [
      join(appData, '.minecraft')
    ],
    custom: []
  }
}

async function countFilesAndCheckSaves(gameDir: string): Promise<{ modCount: number; hasSaves: boolean; savesCount: number }> {
  let modCount = 0
  let hasSaves = false
  let savesCount = 0

  const modsDir = join(gameDir, 'mods')
  if (await doesPathExist(modsDir)) {
    try {
      const files = await fs.readdir(modsDir)
      modCount = files.filter((f) => f.endsWith('.jar') || f.endsWith('.jar.disabled')).length
    } catch {
      modCount = 0
    }
  }

  const savesDir = join(gameDir, 'saves')
  if (await doesPathExist(savesDir)) {
    try {
      const saves = await fs.readdir(savesDir, { withFileTypes: true })
      const validSaves = saves.filter((s) => s.isDirectory())
      hasSaves = validSaves.length > 0
      savesCount = validSaves.length
    } catch {
      hasSaves = false
    }
  }

  return { modCount, hasSaves, savesCount }
}

export async function parsePrismInstance(instanceDir: string): Promise<DiscoveredExternalInstance | null> {
  const packJsonPath = join(instanceDir, 'mmc-pack.json')
  if (!(await doesPathExist(packJsonPath))) {
    return null
  }

  try {
    const packJson = await readJsonFile<{
      components?: Array<{
        uid: string
        version?: string
        cachedVersion?: string
        disabled?: boolean
      }>
    }>(packJsonPath)

    if (!packJson || !packJson.components) {
      return null
    }

    let minecraftVersion = '1.20.1'
    let loaderType: ModLoaderType = 'vanilla'
    let loaderVersion: string | null = null

    for (const comp of packJson.components) {
      if (comp.uid === 'net.minecraft') {
        minecraftVersion = comp.version || comp.cachedVersion || minecraftVersion
      } else if (comp.uid === 'net.fabricmc.fabric-loader') {
        loaderType = 'fabric'
        loaderVersion = comp.version || comp.cachedVersion || null
      } else if (comp.uid === 'org.quiltmc.quilt-loader') {
        loaderType = 'quilt'
        loaderVersion = comp.version || comp.cachedVersion || null
      } else if (comp.uid === 'net.minecraftforge') {
        loaderType = 'forge'
        loaderVersion = comp.version || comp.cachedVersion || null
      } else if (comp.uid === 'net.neoforged') {
        loaderType = 'neoforge'
        loaderVersion = comp.version || comp.cachedVersion || null
      }
    }

    let name = basename(instanceDir)
    let ramAllocationMegabytes: number | undefined = undefined
    let jvmArguments: string[] | undefined = undefined

    const cfgPath = join(instanceDir, 'instance.cfg')
    if (await doesPathExist(cfgPath)) {
      try {
        const cfgText = await fs.readFile(cfgPath, 'utf-8')
        const nameMatch = cfgText.match(/^name=(.+)$/m)
        if (nameMatch && nameMatch[1].trim()) {
          name = nameMatch[1].trim()
        }

        const maxMemMatch = cfgText.match(/^MaxMemAlloc=(\d+)$/m)
        if (maxMemMatch) {
          ramAllocationMegabytes = parseInt(maxMemMatch[1], 10)
        }

        const jvmArgsMatch = cfgText.match(/^JvmArgs=(.+)$/m)
        if (jvmArgsMatch && jvmArgsMatch[1].trim()) {
          jvmArguments = jvmArgsMatch[1].trim().split(/\s+/).filter(Boolean)
        }
      } catch {
        // Continue with defaults
      }
    }

    const dotMinecraft = join(instanceDir, '.minecraft')
    const gameDirectory = (await doesPathExist(dotMinecraft)) ? dotMinecraft : instanceDir

    const { modCount, hasSaves, savesCount } = await countFilesAndCheckSaves(gameDirectory)

    return {
      id: `prism-${basename(instanceDir)}`,
      name,
      launcherType: 'prism',
      launcherName: 'Prism Launcher',
      minecraftVersion,
      loaderType,
      loaderVersion,
      sourcePath: instanceDir,
      gameDirectory,
      totalModCount: modCount,
      hasSaves,
      savesCount,
      ramAllocationMegabytes,
      jvmArguments
    }
  } catch {
    return null
  }
}

async function detectMinecraftAndLoaderFromDirectory(dir: string): Promise<{
  minecraftVersion: string
  loaderType: ModLoaderType
  loaderVersion: string | null
}> {
  let minecraftVersion = ''
  let loaderType: ModLoaderType = 'vanilla'
  let loaderVersion: string | null = null

  // 1. Inspect logs/latest.log if available
  const logPath = join(dir, 'logs', 'latest.log')
  if (await doesPathExist(logPath)) {
    try {
      const handle = await fs.open(logPath, 'r')
      const buffer = Buffer.alloc(16384)
      const { bytesRead } = await handle.read(buffer, 0, 16384, 0)
      await handle.close()
      const logContent = buffer.toString('utf8', 0, bytesRead)

      const fabricMatch = logContent.match(/Loading Minecraft ([0-9a-zA-Z._-]+) with Fabric Loader ([0-9a-zA-Z._-]+)/i)
      if (fabricMatch) {
        minecraftVersion = fabricMatch[1]
        loaderType = 'fabric'
        loaderVersion = fabricMatch[2]
      } else {
        const quiltMatch = logContent.match(/Loading Minecraft ([0-9a-zA-Z._-]+) with Quilt Loader ([0-9a-zA-Z._-]+)/i)
        if (quiltMatch) {
          minecraftVersion = quiltMatch[1]
          loaderType = 'quilt'
          loaderVersion = quiltMatch[2]
        } else {
          const neoMatch = logContent.match(/--fml\.neoForgeVersion[,\s]+([0-9a-zA-Z._-]+)/i)
          const versionMatch = logContent.match(/--version[,\s]+([0-9a-zA-Z._-]+)/i)
          if (versionMatch) minecraftVersion = versionMatch[1]
          if (neoMatch) {
            loaderType = 'neoforge'
            loaderVersion = neoMatch[1]
          } else if (logContent.includes('forge') || logContent.includes('Forge')) {
            loaderType = 'forge'
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // 2. If loader or version not yet known, inspect mods directory
  const modsDir = join(dir, 'mods')
  if (await doesPathExist(modsDir)) {
    try {
      const files = await fs.readdir(modsDir)
      for (const file of files) {
        const lower = file.toLowerCase()
        if (loaderType === 'vanilla') {
          if (lower.includes('neoforge')) loaderType = 'neoforge'
          else if (lower.includes('fabric')) loaderType = 'fabric'
          else if (lower.includes('quilt')) loaderType = 'quilt'
          else if (lower.includes('forge')) loaderType = 'forge'
        }

        if (!minecraftVersion) {
          const vMatch = file.match(/(?:\+|mc|minecraft-?)([0-9]{1,2}\.[0-9]+(?:\.[0-9]+)?(?:-snapshot-[0-9]+)?)/i)
          if (vMatch && !['1.0', '2.0'].includes(vMatch[1])) {
            minecraftVersion = vMatch[1]
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // 3. Check for .fabric directory
  if (loaderType === 'vanilla' && (await doesPathExist(join(dir, '.fabric')))) {
    loaderType = 'fabric'
  }

  // 4. Check folder name hints
  const folderName = basename(dir).toLowerCase()
  if (loaderType === 'vanilla') {
    if (folderName.includes('fabric')) loaderType = 'fabric'
    else if (folderName.includes('neoforge')) loaderType = 'neoforge'
    else if (folderName.includes('forge')) loaderType = 'forge'
    else if (folderName.includes('quilt')) loaderType = 'quilt'
  }

  if (!minecraftVersion) {
    const fv = basename(dir).match(/([0-9]{1,2}\.[0-9]+(?:\.[0-9]+)?(?:-snapshot-[0-9]+)?)/)
    if (fv && !['1.0', '2.0'].includes(fv[1])) {
      minecraftVersion = fv[1]
    }
  }

  return { minecraftVersion: minecraftVersion || '1.20.1', loaderType, loaderVersion }
}

export async function parseModrinthProfile(profileDir: string): Promise<DiscoveredExternalInstance | null> {
  // 1. Check profile.json (legacy Modrinth format)
  const profileJsonPath = join(profileDir, 'profile.json')
  if (await doesPathExist(profileJsonPath)) {
    try {
      const profileJson = await readJsonFile<{
        name?: string
        game_version?: string
        loader?: string
        loader_version?: string
        memory?: number
        java_arguments?: string | string[]
      }>(profileJsonPath)

      if (profileJson) {
        let loaderType: ModLoaderType = 'vanilla'
        const l = (profileJson.loader || '').toLowerCase()
        if (l === 'fabric' || l === 'forge' || l === 'neoforge' || l === 'quilt') {
          loaderType = l as ModLoaderType
        }

        let jvmArgs: string[] | undefined = undefined
        if (typeof profileJson.java_arguments === 'string') {
          jvmArgs = profileJson.java_arguments.split(/\s+/).filter(Boolean)
        } else if (Array.isArray(profileJson.java_arguments)) {
          jvmArgs = profileJson.java_arguments
        }

        const { modCount, hasSaves, savesCount } = await countFilesAndCheckSaves(profileDir)

        return {
          id: `modrinth-${basename(profileDir)}`,
          name: profileJson.name || basename(profileDir),
          launcherType: 'modrinth',
          launcherName: 'Modrinth App',
          minecraftVersion: profileJson.game_version || '1.20.1',
          loaderType,
          loaderVersion: profileJson.loader_version || null,
          sourcePath: profileDir,
          gameDirectory: profileDir,
          totalModCount: modCount,
          hasSaves,
          savesCount,
          ramAllocationMegabytes: profileJson.memory,
          jvmArguments: jvmArgs
        }
      }
    } catch {
      // Continue
    }
  }

  // 2. Check app.db in parent or grandparent (modern Modrinth Theseus format)
  const candidateDbs = [
    join(profileDir, '..', 'app.db'),
    join(profileDir, '..', '..', 'app.db')
  ]

  for (const appDbPath of candidateDbs) {
    if (await doesPathExist(appDbPath)) {
      try {
        const { DatabaseSync } = await import('node:sqlite')
        const db = new DatabaseSync(appDbPath, { readOnly: true, open: true })
        const folderName = basename(profileDir)
        const row = db.prepare(`
          SELECT i.id, i.path, i.name, i.icon_path, ics.game_version, ics.loader, ics.loader_version
          FROM instances i
          LEFT JOIN instance_content_sets ics ON i.id = ics.instance_id
          WHERE LOWER(i.path) = LOWER(?) OR LOWER(i.name) = LOWER(?)
          LIMIT 1
        `).get(folderName, folderName) as {
          id: string
          path: string
          name: string
          icon_path?: string
          game_version?: string
          loader?: string
          loader_version?: string
        } | undefined

        if (row) {
          let loaderType: ModLoaderType = 'vanilla'
          const l = (row.loader || '').toLowerCase()
          if (l === 'fabric' || l === 'forge' || l === 'neoforge' || l === 'quilt') {
            loaderType = l as ModLoaderType
          }

          const { modCount, hasSaves, savesCount } = await countFilesAndCheckSaves(profileDir)

          return {
            id: `modrinth-${row.path || folderName}`,
            name: row.name || folderName,
            launcherType: 'modrinth',
            launcherName: 'Modrinth App',
            minecraftVersion: row.game_version || '1.20.1',
            loaderType,
            loaderVersion: row.loader_version || null,
            sourcePath: profileDir,
            gameDirectory: profileDir,
            iconPath: row.icon_path && (await doesPathExist(row.icon_path)) ? row.icon_path : undefined,
            totalModCount: modCount,
            hasSaves,
            savesCount
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // 3. Inspect directory structure for Minecraft indicators
  const hasMods = await doesPathExist(join(profileDir, 'mods'))
  const hasConfig = await doesPathExist(join(profileDir, 'config'))
  const hasSaves = await doesPathExist(join(profileDir, 'saves'))
  const hasOptions = await doesPathExist(join(profileDir, 'options.txt'))
  const hasFabric = await doesPathExist(join(profileDir, '.fabric'))
  const hasLog = await doesPathExist(join(profileDir, 'logs', 'latest.log'))

  // Must have at least one Minecraft indicator to be an instance
  if (!hasMods && !hasConfig && !hasSaves && !hasOptions && !hasFabric && !hasLog) {
    return null
  }

  const { minecraftVersion, loaderType, loaderVersion } = await detectMinecraftAndLoaderFromDirectory(profileDir)
  const { modCount, hasSaves: savesExist, savesCount } = await countFilesAndCheckSaves(profileDir)

  return {
    id: `modrinth-${basename(profileDir)}`,
    name: basename(profileDir),
    launcherType: 'modrinth',
    launcherName: 'Modrinth App',
    minecraftVersion,
    loaderType,
    loaderVersion,
    sourcePath: profileDir,
    gameDirectory: profileDir,
    totalModCount: modCount,
    hasSaves: savesExist,
    savesCount
  }
}

export async function parseCurseForgeInstance(instanceDir: string): Promise<DiscoveredExternalInstance | null> {
  const manifestPath = join(instanceDir, 'minecraftinstance.json')
  if (!(await doesPathExist(manifestPath))) {
    return null
  }

  try {
    const manifest = await readJsonFile<{
      name?: string
      gameVersion?: string
      baseModLoader?: {
        name?: string
      }
      allocatedMemory?: number
    }>(manifestPath)

    if (!manifest) return null

    let loaderType: ModLoaderType = 'vanilla'
    let loaderVersion: string | null = null

    const loaderStr = (manifest.baseModLoader?.name || '').toLowerCase()
    if (loaderStr.startsWith('forge-')) {
      loaderType = 'forge'
      loaderVersion = loaderStr.replace('forge-', '')
    } else if (loaderStr.startsWith('neoforge-')) {
      loaderType = 'neoforge'
      loaderVersion = loaderStr.replace('neoforge-', '')
    } else if (loaderStr.startsWith('fabric-')) {
      loaderType = 'fabric'
      loaderVersion = loaderStr.replace('fabric-', '')
    } else if (loaderStr.startsWith('quilt-')) {
      loaderType = 'quilt'
      loaderVersion = loaderStr.replace('quilt-', '')
    }

    const { modCount, hasSaves, savesCount } = await countFilesAndCheckSaves(instanceDir)

    return {
      id: `curseforge-${basename(instanceDir)}`,
      name: manifest.name || basename(instanceDir),
      launcherType: 'curseforge',
      launcherName: 'CurseForge App',
      minecraftVersion: manifest.gameVersion || '1.20.1',
      loaderType,
      loaderVersion,
      sourcePath: instanceDir,
      gameDirectory: instanceDir,
      totalModCount: modCount,
      hasSaves,
      savesCount,
      ramAllocationMegabytes: manifest.allocatedMemory
    }
  } catch {
    return null
  }
}

export async function parseVanillaProfiles(dotMinecraftDir: string): Promise<DiscoveredExternalInstance[]> {
  const profilesJsonPath = join(dotMinecraftDir, 'launcher_profiles.json')
  if (!(await doesPathExist(profilesJsonPath))) {
    return []
  }

  try {
    const profilesData = await readJsonFile<{
      profiles?: Record<
        string,
        {
          name?: string
          lastVersionId?: string
          gameDir?: string
          javaArgs?: string
        }
      >
    }>(profilesJsonPath)

    if (!profilesData || !profilesData.profiles) {
      return []
    }

    const results: DiscoveredExternalInstance[] = []

    for (const [key, profile] of Object.entries(profilesData.profiles)) {
      const gameDir = profile.gameDir && (await doesPathExist(profile.gameDir))
        ? profile.gameDir
        : dotMinecraftDir

      const versionId = profile.lastVersionId || 'latest-release'

      let loaderType: ModLoaderType = 'vanilla'
      let loaderVersion: string | null = null
      let minecraftVersion = '1.20.1'

      const lowerVer = versionId.toLowerCase()
      if (lowerVer.includes('fabric')) {
        loaderType = 'fabric'
      } else if (lowerVer.includes('forge')) {
        loaderType = 'forge'
      } else if (lowerVer.includes('neoforge')) {
        loaderType = 'neoforge'
      } else if (lowerVer.includes('quilt')) {
        loaderType = 'quilt'
      }

      const versionMatch = versionId.match(/(\d+\.\d+(\.\d+)?)/)
      if (versionMatch) {
        minecraftVersion = versionMatch[1]
      }

      const { modCount, hasSaves, savesCount } = await countFilesAndCheckSaves(gameDir)

      results.push({
        id: `vanilla-${key}`,
        name: profile.name || key,
        launcherType: 'vanilla',
        launcherName: 'Official Launcher',
        minecraftVersion,
        loaderType,
        loaderVersion,
        sourcePath: gameDir,
        gameDirectory: gameDir,
        totalModCount: modCount,
        hasSaves,
        savesCount,
        jvmArguments: profile.javaArgs ? profile.javaArgs.split(/\s+/).filter(Boolean) : undefined
      })
    }

    return results
  } catch {
    return []
  }
}

export async function scanExternalInstances(): Promise<DiscoveredExternalInstance[]> {
  const launcherPaths = getLauncherDefaultPaths()
  const instances: DiscoveredExternalInstance[] = []

  // 1. Scan Prism Launcher
  for (const path of launcherPaths.prism) {
    if (await doesPathExist(path)) {
      try {
        const entries = await fs.readdir(path, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const parsed = await parsePrismInstance(join(path, entry.name))
            if (parsed) instances.push(parsed)
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // 2. Scan MultiMC
  for (const path of launcherPaths.multimc) {
    if (await doesPathExist(path)) {
      try {
        const entries = await fs.readdir(path, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const parsed = await parsePrismInstance(join(path, entry.name))
            if (parsed) {
              parsed.launcherType = 'multimc'
              parsed.launcherName = 'MultiMC'
              parsed.id = `multimc-${entry.name}`
              instances.push(parsed)
            }
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // 3. Scan Modrinth App
  const seenModrinthPaths = new Set<string>()
  for (const path of launcherPaths.modrinth) {
    if (await doesPathExist(path)) {
      // 3a. Try reading app.db if available
      try {
        const candidateDbPaths = [
          join(path, '..', 'app.db'),
          join(path, '..', '..', 'app.db')
        ]
        for (const appDbPath of candidateDbPaths) {
          if (await doesPathExist(appDbPath)) {
            const { DatabaseSync } = await import('node:sqlite')
            const db = new DatabaseSync(appDbPath, { readOnly: true, open: true })
            const rows = db.prepare(`
              SELECT i.id, i.path, i.name, i.icon_path, ics.game_version, ics.loader, ics.loader_version
              FROM instances i
              LEFT JOIN instance_content_sets ics ON i.id = ics.instance_id
            `).all() as Array<{
              id: string
              path: string
              name: string
              icon_path?: string
              game_version?: string
              loader?: string
              loader_version?: string
            }>

            for (const r of rows) {
              const folder = join(path, r.path)
              if (await doesPathExist(folder)) {
                seenModrinthPaths.add(folder.toLowerCase())
                const { modCount, hasSaves, savesCount } = await countFilesAndCheckSaves(folder)
                let loaderType: ModLoaderType = 'vanilla'
                const l = (r.loader || '').toLowerCase()
                if (l === 'fabric' || l === 'forge' || l === 'neoforge' || l === 'quilt') {
                  loaderType = l as ModLoaderType
                }
                instances.push({
                  id: `modrinth-${r.path}`,
                  name: r.name || r.path,
                  launcherType: 'modrinth',
                  launcherName: 'Modrinth App',
                  minecraftVersion: r.game_version || '1.20.1',
                  loaderType,
                  loaderVersion: r.loader_version || null,
                  sourcePath: folder,
                  gameDirectory: folder,
                  iconPath: r.icon_path && (await doesPathExist(r.icon_path)) ? r.icon_path : undefined,
                  totalModCount: modCount,
                  hasSaves,
                  savesCount
                })
              }
            }
            break
          }
        }
      } catch {
        // Continue if SQLite fails or is unavailable
      }

      // 3b. Scan remaining profile directories in this path
      try {
        const entries = await fs.readdir(path, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullDir = join(path, entry.name)
            if (!seenModrinthPaths.has(fullDir.toLowerCase())) {
              const parsed = await parseModrinthProfile(fullDir)
              if (parsed) {
                seenModrinthPaths.add(fullDir.toLowerCase())
                instances.push(parsed)
              }
            }
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // 4. Scan CurseForge App
  for (const path of launcherPaths.curseforge) {
    if (await doesPathExist(path)) {
      try {
        const entries = await fs.readdir(path, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const parsed = await parseCurseForgeInstance(join(path, entry.name))
            if (parsed) instances.push(parsed)
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // 5. Scan Vanilla Official Launcher
  for (const path of launcherPaths.vanilla) {
    if (await doesPathExist(path)) {
      const vanillaList = await parseVanillaProfiles(path)
      instances.push(...vanillaList)
    }
  }

  return instances
}

export async function scanCustomDirectory(targetPath: string): Promise<DiscoveredExternalInstance[]> {
  if (!(await doesPathExist(targetPath))) {
    return []
  }

  // Try direct parsers
  const prism = await parsePrismInstance(targetPath)
  if (prism) return [{ ...prism, launcherType: 'custom', launcherName: 'Custom Instance' }]

  const modrinth = await parseModrinthProfile(targetPath)
  if (modrinth) return [{ ...modrinth, launcherType: 'custom', launcherName: 'Custom Instance' }]

  const curse = await parseCurseForgeInstance(targetPath)
  if (curse) return [{ ...curse, launcherType: 'custom', launcherName: 'Custom Instance' }]

  // If target contains subdirectories with instances, scan them
  const results: DiscoveredExternalInstance[] = []
  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sub = join(targetPath, entry.name)
        const p = (await parsePrismInstance(sub)) ||
                  (await parseModrinthProfile(sub)) ||
                  (await parseCurseForgeInstance(sub))
        if (p) {
          results.push({ ...p, launcherType: 'custom', launcherName: 'Custom Instance' })
        }
      }
    }
  } catch {
    // Continue
  }

  if (results.length > 0) return results

  // Fallback: check if targetPath looks like a game directory (has mods or options.txt or saves)
  const { modCount, hasSaves, savesCount } = await countFilesAndCheckSaves(targetPath)
  if (modCount > 0 || hasSaves || (await doesPathExist(join(targetPath, 'options.txt')))) {
    return [
      {
        id: `custom-${basename(targetPath)}`,
        name: basename(targetPath),
        launcherType: 'custom',
        launcherName: 'Custom Minecraft Folder',
        minecraftVersion: '1.20.1',
        loaderType: 'vanilla',
        sourcePath: targetPath,
        gameDirectory: targetPath,
        totalModCount: modCount,
        hasSaves,
        savesCount
      }
    ]
  }

  return []
}

export async function cloneExternalInstance(
  payload: CloneInstancePayload,
  onProgress?: (event: CloneProgressEvent) => void
): Promise<InstanceConfiguration> {
  const { sourceInstance, customName, copySaves } = payload

  onProgress?.({
    step: 'reading',
    message: `Initializing clone of ${sourceInstance.name}...`,
    current: 0,
    total: 100,
    percentage: 5
  })

  const instanceName = customName?.trim() || `${sourceInstance.name} (Copy)`
  const newInstance = await createNewInstance({
    name: instanceName,
    minecraftVersion: sourceInstance.minecraftVersion,
    loaderType: sourceInstance.loaderType,
    loaderVersion: sourceInstance.loaderVersion || null,
    ramAllocationMegabytes: sourceInstance.ramAllocationMegabytes || 4096,
    jvmArguments: sourceInstance.jvmArguments || []
  })

  const targetMinecraftDir = getInstanceMinecraftPath(newInstance.id)
  const sourceGameDir = sourceInstance.gameDirectory

  // 1. Copy config folder
  onProgress?.({
    step: 'copying-configs',
    message: 'Copying configurations and options...',
    current: 15,
    total: 100,
    percentage: 15
  })

  const configDirsToCopy = [
    'config',
    'defaultconfigs',
    'resourcepacks',
    'shaderpacks',
    'datapacks',
    'kubejs',
    'fancymenu_data',
    'schematics',
    'openloader'
  ]
  for (const dirName of configDirsToCopy) {
    const srcDir = join(sourceGameDir, dirName)
    if (await doesPathExist(srcDir)) {
      const destDir = join(targetMinecraftDir, dirName)
      await ensureDirectoryExists(destDir)
      await fs.cp(srcDir, destDir, { recursive: true })
    }
  }

  // Copy individual config files if present
  const singleFilesToCopy = [
    'options.txt',
    'optionsof.txt',
    'servers.dat',
    'servers.dat_old',
    'hotbar.nbt',
    'usercache.json'
  ]
  for (const file of singleFilesToCopy) {
    const srcFile = join(sourceGameDir, file)
    if (await doesPathExist(srcFile)) {
      await fs.copyFile(srcFile, join(targetMinecraftDir, file))
    }
  }

  // 2. Copy mods folder
  onProgress?.({
    step: 'copying-mods',
    message: `Copying ${sourceInstance.totalModCount} mod files...`,
    current: 40,
    total: 100,
    percentage: 40
  })

  const sourceModsDir = join(sourceGameDir, 'mods')
  const targetModsDir = join(targetMinecraftDir, 'mods')
  await ensureDirectoryExists(targetModsDir)

  const installedMods: InstalledModRecord[] = []

  if (await doesPathExist(sourceModsDir)) {
    await fs.cp(sourceModsDir, targetModsDir, { recursive: true })

    try {
      const copiedMods = await fs.readdir(targetModsDir)
      for (const file of copiedMods) {
        if (!file.endsWith('.jar') && !file.endsWith('.jar.disabled')) continue

        const fullPath = join(targetModsDir, file)
        const stats = await fs.stat(fullPath)
        const isEnabled = file.endsWith('.jar')
        const rawName = file.replace(/\.jar(\.disabled)?$/i, '')

        installedMods.push({
          id: rawName,
          name: rawName,
          version: '1.0.0',
          filename: file,
          source: sourceInstance.launcherType === 'curseforge' ? 'curseforge' : 'modrinth',
          installedAt: new Date().toISOString(),
          enabled: isEnabled,
          fileSizeBytes: stats.size,
          gameVersion: sourceInstance.minecraftVersion,
          loader: sourceInstance.loaderType
        })
      }
    } catch {
      // Ignore scan error
    }
  }

  // 3. Copy world saves (if requested)
  if (copySaves) {
    onProgress?.({
      step: 'copying-saves',
      message: `Copying ${sourceInstance.savesCount} world saves...`,
      current: 70,
      total: 100,
      percentage: 70
    })

    const sourceSavesDir = join(sourceGameDir, 'saves')
    const targetSavesDir = join(targetMinecraftDir, 'saves')
    if (await doesPathExist(sourceSavesDir)) {
      await ensureDirectoryExists(targetSavesDir)
      await fs.cp(sourceSavesDir, targetSavesDir, { recursive: true })
    }
  }

  // 4. Finalize
  onProgress?.({
    step: 'finalizing',
    message: 'Registering instance and synchronizing mod catalog...',
    current: 90,
    total: 100,
    percentage: 90
  })

  await writeJsonFileAtomic(getModsMetadataPath(newInstance.id), installedMods)

  onProgress?.({
    step: 'completed',
    message: `Successfully cloned ${newInstance.name}!`,
    current: 100,
    total: 100,
    percentage: 100
  })

  return newInstance
}
