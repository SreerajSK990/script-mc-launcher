import type { ModLoaderType } from '@shared/types/instance'
import type { ModSearchResult, ModVersionFile, ModSearchParams } from '@shared/types/mods'

const CURSEFORGE_API_BASE = 'https://api.curseforge.com/v1'
const MINECRAFT_GAME_ID = 432
const MODS_CLASS_ID = 6
const MODPACKS_CLASS_ID = 4471

let customCurseForgeApiKey: string | null = null

export function setCurseForgeApiKey(key: string | null): void {
  customCurseForgeApiKey = key?.trim() || null
}

export function getCurseForgeApiKey(): string | null {
  return customCurseForgeApiKey || process.env.CURSEFORGE_API_KEY || null
}

function convertLoaderToCurseForgeEnum(loader?: ModLoaderType): number | undefined {
  if (!loader) return undefined
  switch (loader) {
    case 'forge':
      return 1
    case 'fabric':
      return 4
    case 'quilt':
      return 5
    case 'neoforge':
      return 6
    default:
      return undefined
  }
}

function convertCurseForgeEnumToLoader(modLoaderType: number): ModLoaderType | undefined {
  switch (modLoaderType) {
    case 1:
      return 'forge'
    case 4:
      return 'fabric'
    case 5:
      return 'quilt'
    case 6:
      return 'neoforge'
    default:
      return undefined
  }
}

interface CurseForgeMod {
  id: number
  gameId: number
  name: string
  slug: string
  summary: string
  downloadCount: number
  logo?: {
    thumbnailUrl: string
    url: string
  }
  authors: { name: string }[]
  categories: { name: string }[]
  latestFilesIndexes: {
    gameVersion: string
    fileId: number
    filename: string
    releaseType: number
    modLoader?: number
  }[]
}

export interface CurseForgeFile {
  id: number
  gameId: number
  modId: number
  displayName: string
  fileName: string
  releaseType: number
  fileDate: string
  fileLength: number
  downloadUrl: string | null
  gameVersions: string[]
  hashes: { value: string; algo: number }[]
}

export async function batchGetCurseForgeFiles(fileIds: number[]): Promise<CurseForgeFile[]> {
  const apiKey = getCurseForgeApiKey()
  if (!apiKey || fileIds.length === 0) {
    return []
  }

  const results: CurseForgeFile[] = []
  for (let i = 0; i < fileIds.length; i += 50) {
    const chunk = fileIds.slice(i, i + 50)
    try {
      const response = await fetch(`${CURSEFORGE_API_BASE}/mods/files`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileIds: chunk })
      })

      if (response.ok) {
        const json = (await response.json()) as { data: CurseForgeFile[] }
        if (json.data) {
          results.push(...json.data)
        }
      }
    } catch {
      // Ignore and continue
    }
  }

  return results
}

export async function searchCurseForge(params: ModSearchParams): Promise<ModSearchResult[]> {
  const apiKey = getCurseForgeApiKey()
  if (!apiKey) {
    return []
  }

  const queryParams = new URLSearchParams()
  queryParams.set('gameId', String(MINECRAFT_GAME_ID))
  const classId = params.projectType === 'modpack' ? MODPACKS_CLASS_ID : MODS_CLASS_ID
  queryParams.set('classId', String(classId))

  if (params.query?.trim()) {
    queryParams.set('searchFilter', params.query.trim())
  }

  if (params.minecraftVersion) {
    queryParams.set('gameVersion', params.minecraftVersion)
  }

  const loaderEnum = convertLoaderToCurseForgeEnum(params.loader)
  if (loaderEnum) {
    queryParams.set('modLoaderType', String(loaderEnum))
  }

  queryParams.set('pageSize', String(params.limit || 24))
  queryParams.set('index', String(params.offset || 0))

  const url = `${CURSEFORGE_API_BASE}/mods/search?${queryParams.toString()}`

  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': apiKey
      }
    })

    if (!response.ok) {
      return []
    }

    const json = (await response.json()) as { data: CurseForgeMod[] }
    const mods = json.data || []

    return mods.map((mod) => {
      const loaders = new Set<ModLoaderType>()
      for (const index of mod.latestFilesIndexes || []) {
        if (typeof index.modLoader === 'number') {
          const l = convertCurseForgeEnumToLoader(index.modLoader)
          if (l) loaders.add(l)
        }
      }

      return {
        id: String(mod.id),
        slug: mod.slug,
        name: mod.name,
        author: mod.authors[0]?.name || 'Unknown',
        description: mod.summary,
        iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url,
        downloads: mod.downloadCount,
        source: 'curseforge',
        categories: mod.categories.map((c) => c.name),
        loaders: Array.from(loaders),
        projectType: params.projectType === 'modpack' ? 'modpack' : 'mod'
      }
    })
  } catch {
    return []
  }
}

export async function getCurseForgeFiles(
  modId: string,
  minecraftVersion?: string,
  loader?: ModLoaderType
): Promise<ModVersionFile[]> {
  const apiKey = getCurseForgeApiKey()
  if (!apiKey) {
    return []
  }

  const queryParams = new URLSearchParams()
  if (minecraftVersion) {
    queryParams.set('gameVersion', minecraftVersion)
  }
  const loaderEnum = convertLoaderToCurseForgeEnum(loader)
  if (loaderEnum) {
    queryParams.set('modLoaderType', String(loaderEnum))
  }

  const url = `${CURSEFORGE_API_BASE}/mods/${modId}/files?${queryParams.toString()}`

  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': apiKey
      }
    })

    if (!response.ok) {
      return []
    }

    const json = (await response.json()) as { data: CurseForgeFile[] }
    const files = json.data || []

    return files
      .filter((file) => file.downloadUrl)
      .map((file) => {
        const sha1Obj = file.hashes?.find((h) => h.algo === 1)

        let releaseType: 'release' | 'beta' | 'alpha' = 'release'
        if (file.releaseType === 2) releaseType = 'beta'
        else if (file.releaseType === 3) releaseType = 'alpha'

        return {
          id: String(file.id),
          projectId: modId,
          name: file.displayName,
          versionNumber: file.fileName,
          gameVersions: file.gameVersions,
          loaders: loader ? [loader] : ['forge', 'fabric'],
          downloadUrl: file.downloadUrl!,
          filename: file.fileName,
          sizeBytes: file.fileLength,
          sha1: sha1Obj?.value,
          releaseType,
          datePublished: file.fileDate
        }
      })
  } catch {
    return []
  }
}
