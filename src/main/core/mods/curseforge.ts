import { getTransferSignal } from '@main/utils/download'
import type { ModLoaderType } from '@shared/types/instance'
import type { ModSearchResult, ModVersionFile, ModSearchParams, ModDetail } from '@shared/types/mods'

const CURSEFORGE_API_BASE = 'https://api.curseforge.com/v1'
const MINECRAFT_GAME_ID = 432
const MODS_CLASS_ID = 6
const RESOURCEPACKS_CLASS_ID = 12
const MODPACKS_CLASS_ID = 4471

import { updateLauncherSettings } from '@main/services/settings'

let customCurseForgeApiKey: string | null = null

export function initCurseForgeApiKey(key: string | null): void {
  customCurseForgeApiKey = key?.trim() || null
}

export function setCurseForgeApiKey(key: string | null): void {
  customCurseForgeApiKey = key?.trim() || null
  updateLauncherSettings({ curseForgeApiKey: customCurseForgeApiKey }).catch((err) => {
    console.error('Failed to save curseForgeApiKey to settings:', err)
  })
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
  dependencies?: { modId: number; relationType: number }[]
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
        signal: getTransferSignal(),
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
    } catch {}
  }

  return results
}

import { getCachedData, setCachedData } from './cache'

const CF_SEARCH_CACHE_TTL = 15 * 60 * 1000
const CF_VERSIONS_CACHE_TTL = 30 * 60 * 1000

export async function searchCurseForge(params: ModSearchParams): Promise<ModSearchResult[]> {
  const apiKey = getCurseForgeApiKey()
  if (!apiKey) {
    return []
  }

  const queryParams = new URLSearchParams()
  queryParams.set('gameId', String(MINECRAFT_GAME_ID))
  let classId = MODS_CLASS_ID
  if (params.projectType === 'shader') {
    const response = await fetch(`${CURSEFORGE_API_BASE}/categories?gameId=${MINECRAFT_GAME_ID}`, {
      signal: getTransferSignal(),
      headers: { 'x-api-key': apiKey }
    })
    if (!response.ok) throw new Error('Could not load CurseForge shader categories')
    const categories = (await response.json()) as {
      data: { id: number; name: string; slug: string; isClass: boolean }[]
    }
    const shaders = categories.data.find(
      (category) => category.isClass && /shaders/i.test(category.slug || category.name)
    )
    if (!shaders) throw new Error('CurseForge shader catalog is unavailable')
    classId = shaders.id
  } else if (params.projectType === 'modpack') {
    classId = MODPACKS_CLASS_ID
  } else if (params.projectType === 'resourcepack') {
    classId = RESOURCEPACKS_CLASS_ID
  }
  queryParams.set('classId', String(classId))

  if (params.query?.trim()) {
    queryParams.set('searchFilter', params.query.trim())
  }

  if (params.minecraftVersion) {
    queryParams.set('gameVersion', params.minecraftVersion)
  }

  if (!params.projectType || params.projectType === 'mod' || params.projectType === 'modpack') {
    const loaderEnum = convertLoaderToCurseForgeEnum(params.loader)
    if (loaderEnum) {
      queryParams.set('modLoaderType', String(loaderEnum))
    }
  }

  queryParams.set('pageSize', String(params.limit || 24))
  queryParams.set('index', String(params.offset || 0))

  const cacheKey = `curseforge_search_${queryParams.toString()}`
  const cached = await getCachedData<ModSearchResult[]>(cacheKey, CF_SEARCH_CACHE_TTL)
  if (cached) {
    return cached
  }

  const url = `${CURSEFORGE_API_BASE}/mods/search?${queryParams.toString()}`

  try {
    const response = await fetch(url, {
      signal: getTransferSignal(),
      headers: {
        'x-api-key': apiKey
      }
    })

    if (!response.ok) {
      return []
    }

    const json = (await response.json()) as { data: CurseForgeMod[] }
    const mods = json.data || []

    const results = mods.map((mod) => {
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
        source: 'curseforge' as const,
        categories: mod.categories.map((c) => c.name),
        loaders: Array.from(loaders) as ModLoaderType[],
        projectType: (params.projectType || 'mod') as 'mod' | 'modpack' | 'resourcepack' | 'shader'
      }
    })

    await setCachedData(cacheKey, results)
    return results
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

  const cacheKey = `curseforge_files_v2_${modId}_${queryParams.toString()}`
  const cached = await getCachedData<ModVersionFile[]>(cacheKey, CF_VERSIONS_CACHE_TTL)
  if (cached) {
    return cached
  }

  const url = `${CURSEFORGE_API_BASE}/mods/${modId}/files?${queryParams.toString()}`

  try {
    const response = await fetch(url, {
      signal: getTransferSignal(),
      headers: {
        'x-api-key': apiKey
      }
    })

    if (!response.ok) {
      if (/^\d+$/.test(modId)) {
        try {
          const fileCheck = await fetch(`${CURSEFORGE_API_BASE}/mods/files`, {
            signal: getTransferSignal(),
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fileIds: [Number(modId)] })
          })
          if (fileCheck.ok) {
            const fileJson = (await fileCheck.json()) as { data: CurseForgeFile[] }
            const realModId = fileJson.data?.[0]?.modId
            if (realModId && String(realModId) !== modId) {
              return await getCurseForgeFiles(String(realModId), minecraftVersion, loader)
            }
          }
        } catch {
          return []
        }
      }
      return []
    }

    const json = (await response.json()) as { data: CurseForgeFile[] }
    const files = json.data || []

    const results: ModVersionFile[] = files.map((file) => {
      return normalizeCurseForgeFile(file, modId, loader)
    })

    await setCachedData(cacheKey, results)
    return results
  } catch {
    return []
  }
}

export async function getCurseForgeModDetail(modId: string): Promise<ModDetail> {
  const apiKey = getCurseForgeApiKey()
  if (!apiKey) {
    throw new Error('CurseForge API key is required')
  }

  const cacheKey = `curseforge_detail_${modId}`
  const cached = await getCachedData<ModDetail>(cacheKey, CF_VERSIONS_CACHE_TTL)
  if (cached) {
    return cached
  }

  const modUrl = `${CURSEFORGE_API_BASE}/mods/${modId}`
  const descUrl = `${CURSEFORGE_API_BASE}/mods/${modId}/description`

  const [modResp, descResp] = await Promise.all([
    fetch(modUrl, { headers: { 'x-api-key': apiKey } }),
    fetch(descUrl, { headers: { 'x-api-key': apiKey } })
  ])

  if (!modResp.ok) {
    throw new Error(`Failed to fetch CurseForge mod ${modId}: ${modResp.status}`)
  }

  const modJson = (await modResp.json()) as { data: any }
  const modData = modJson.data

  let htmlDescription = ''
  if (descResp.ok) {
    const descJson = (await descResp.json()) as { data: string }
    htmlDescription = descJson.data || ''
  }

  const loaders = new Set<ModLoaderType>()
  const gameVersions = new Set<string>()

  if (Array.isArray(modData.latestFilesIndexes)) {
    for (const idx of modData.latestFilesIndexes) {
      if (idx.gameVersion) gameVersions.add(idx.gameVersion)
      if (idx.modLoader) {
        const l = convertCurseForgeEnumToLoader(idx.modLoader)
        if (l) loaders.add(l)
      }
    }
  }

  const creators = Array.isArray(modData.authors)
    ? modData.authors.map((a: any) => ({
        name: a.name,
        role: 'Author'
      }))
    : []

  const gallery = Array.isArray(modData.screenshots)
    ? modData.screenshots.map((s: any) => ({
        url: s.url,
        title: s.title || undefined,
        description: s.description || undefined
      }))
    : []

  const detail: ModDetail = {
    id: String(modData.id),
    slug: modData.slug || String(modData.id),
    name: modData.name,
    summary: modData.summary || '',
    description: htmlDescription || modData.summary || '',
    iconUrl: modData.logo?.url || modData.logo?.thumbnailUrl,
    downloads: modData.downloadCount || 0,
    followers: modData.thumbsUpCount || 0,
    source: 'curseforge',
    categories: Array.isArray(modData.categories) ? modData.categories.map((c: any) => c.name) : [],
    loaders: Array.from(loaders),
    gameVersions: Array.from(gameVersions),
    links: {
      issues: modData.links?.issuesUrl,
      source: modData.links?.sourceUrl,
      wiki: modData.links?.wikiUrl,
      discord: undefined,
      donate: modData.links?.websiteUrl
    },
    creators,
    gallery,
    publishedAt: modData.dateCreated,
    updatedAt: modData.dateModified
  }

  await setCachedData(cacheKey, detail)
  return detail
}

function normalizeCurseForgeFile(
  file: CurseForgeFile,
  modId: string,
  loader?: ModLoaderType
): ModVersionFile {
  const sha1Obj = file.hashes?.find((h) => h.algo === 1)

  let releaseType: 'release' | 'beta' | 'alpha' = 'release'
  if (file.releaseType === 2) releaseType = 'beta'
  else if (file.releaseType === 3) releaseType = 'alpha'

  const fileLoaders: ModLoaderType[] = []
  for (const gv of file.gameVersions || []) {
    const lower = gv.toLowerCase()
    if (lower === 'fabric' && !fileLoaders.includes('fabric')) fileLoaders.push('fabric')
    if (lower === 'forge' && !fileLoaders.includes('forge')) fileLoaders.push('forge')
    if (lower === 'neoforge' && !fileLoaders.includes('neoforge')) fileLoaders.push('neoforge')
    if (lower === 'quilt' && !fileLoaders.includes('quilt')) fileLoaders.push('quilt')
  }

  const loaders = fileLoaders.length > 0 ? fileLoaders : loader ? [loader] : ([] as ModLoaderType[])

  return {
    dependencies: (file.dependencies || [])
      .filter((d) => [2, 3, 5, 6].includes(d.relationType))
      .map((d) => ({
        projectId: String(d.modId),
        type:
          d.relationType === 3
            ? ('required' as const)
            : d.relationType === 5
              ? ('incompatible' as const)
              : d.relationType === 6
                ? ('embedded' as const)
                : ('optional' as const)
      })),
    id: String(file.id),
    projectId: String(file.modId || modId),
    name: file.displayName,
    versionNumber: file.fileName,
    gameVersions: file.gameVersions,
    loaders,
    downloadUrl: file.downloadUrl || null,
    websiteUrl: `https://www.curseforge.com/projects/${file.modId || modId}/files/${file.id}`,
    filename: file.fileName,
    sizeBytes: file.fileLength,
    sha1: sha1Obj?.value,
    releaseType,
    datePublished: file.fileDate
  }
}

export async function getCurseForgeVersion(projectId: string, versionId: string): Promise<ModVersionFile> {
  const apiKey = getCurseForgeApiKey()
  if (!apiKey) throw new Error('CurseForge API key is required')
  const response = await fetch(
    `${CURSEFORGE_API_BASE}/mods/${encodeURIComponent(projectId)}/files/${encodeURIComponent(versionId)}`,
    { headers: { 'x-api-key': apiKey }, signal: getTransferSignal() }
  )
  if (!response.ok) throw new Error(`Cannot resolve CurseForge version: ${response.status}`)
  const result = (await response.json()) as { data: CurseForgeFile }
  return normalizeCurseForgeFile(result.data, projectId)
}
