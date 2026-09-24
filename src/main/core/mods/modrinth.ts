import { getTransferSignal } from '@main/utils/download'
import type { ModLoaderType } from '@shared/types/instance'
import type { ModSearchResult, ModVersionFile, ModSearchParams, ModDetail } from '@shared/types/mods'

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2'
const USER_AGENT = 'ScriptLauncher/0.2.0 (github.com/SreerajSK990/script-mc-launcher)'

interface ModrinthSearchHit {
  project_id: string
  slug: string
  title: string
  description: string
  categories: string[]
  client_side: 'required' | 'optional' | 'unsupported'
  server_side: 'required' | 'optional' | 'unsupported'
  downloads: number
  icon_url: string | null
  author: string
  versions: string[]
  latest_version?: string
}

interface ModrinthSearchResponse {
  hits: ModrinthSearchHit[]
  offset: number
  limit: number
  total_hits: number
}

interface ModrinthVersionFileEntry {
  hashes: {
    sha512?: string
    sha1?: string
  }
  url: string
  filename: string
  primary: boolean
  size: number
}

interface ModrinthVersionResponse {
  id: string
  project_id: string
  name: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  version_type: 'release' | 'beta' | 'alpha'
  date_published: string
  changelog?: string
  dependencies?: {
    project_id: string | null
    version_id: string | null
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
  }[]
  files: ModrinthVersionFileEntry[]
}

import { getCachedData, setCachedData } from './cache'

const SEARCH_CACHE_TTL = 15 * 60 * 1000
const VERSIONS_CACHE_TTL = 30 * 60 * 1000

export async function searchModrinth(params: ModSearchParams): Promise<ModSearchResult[]> {
  let projectType = params.projectType || 'mod'
  if (params.projectType === 'modpack') {
    projectType = 'modpack'
  } else if (params.projectType === 'resourcepack') {
    projectType = 'resourcepack'
  }
  const facets: string[][] = [[`project_type:${projectType}`]]

  if (params.loader && projectType === 'mod') {
    facets.push([`categories:${params.loader.toLowerCase()}`])
  }

  if (params.minecraftVersion) {
    facets.push([`versions:${params.minecraftVersion}`])
  }

  if (params.category && params.category !== 'all') {
    facets.push([`categories:${params.category.toLowerCase()}`])
  }

  const queryParams = new URLSearchParams()
  if (params.query?.trim()) {
    queryParams.set('query', params.query.trim())
  }
  queryParams.set('facets', JSON.stringify(facets))
  queryParams.set('limit', String(params.limit || 24))
  queryParams.set('offset', String(params.offset || 0))
  queryParams.set('index', params.query?.trim() ? 'relevance' : 'downloads')

  const cacheKey = `modrinth_search_${queryParams.toString()}`
  const cached = await getCachedData<ModSearchResult[]>(cacheKey, SEARCH_CACHE_TTL)
  if (cached) {
    return cached
  }

  const url = `${MODRINTH_API_BASE}/search?${queryParams.toString()}`

  const response = await fetch(url, {
    signal: getTransferSignal(),
    headers: {
      'User-Agent': USER_AGENT
    }
  })

  if (!response.ok) {
    throw new Error(`Modrinth search failed with status ${response.status}: ${response.statusText}`)
  }

  const data = (await response.json()) as ModrinthSearchResponse

  const results: ModSearchResult[] = data.hits.map((hit) => {
    const matchedLoaders: ModLoaderType[] = []
    for (const cat of hit.categories) {
      const lower = cat.toLowerCase()
      if (lower === 'fabric' || lower === 'forge' || lower === 'neoforge' || lower === 'quilt') {
        matchedLoaders.push(lower as ModLoaderType)
      }
    }

    const nonLoaderCategories = hit.categories.filter(
      (cat) => !['fabric', 'forge', 'neoforge', 'quilt'].includes(cat.toLowerCase())
    )

    return {
      id: hit.project_id,
      slug: hit.slug,
      name: hit.title,
      author: hit.author,
      description: hit.description,
      iconUrl: hit.icon_url || undefined,
      downloads: hit.downloads,
      source: 'modrinth',
      categories: nonLoaderCategories,
      loaders: matchedLoaders,
      projectType: projectType as 'mod' | 'modpack' | 'resourcepack' | 'shader',
      latestVersion: hit.latest_version,
      clientSide: hit.client_side,
      serverSide: hit.server_side
    }
  })

  await setCachedData(cacheKey, results)
  return results
}

export async function getModrinthProjectVersions(
  projectId: string,
  minecraftVersion?: string,
  loader?: ModLoaderType
): Promise<ModVersionFile[]> {
  const queryParams = new URLSearchParams()

  if (loader) {
    queryParams.set('loaders', JSON.stringify([loader.toLowerCase()]))
  }

  if (minecraftVersion) {
    queryParams.set('game_versions', JSON.stringify([minecraftVersion]))
  }

  const cacheKey = `modrinth_versions_v2_${projectId}_${queryParams.toString()}`
  const cached = await getCachedData<ModVersionFile[]>(cacheKey, VERSIONS_CACHE_TTL)
  if (cached) {
    return cached
  }

  const url = `${MODRINTH_API_BASE}/project/${projectId}/version?${queryParams.toString()}`

  const response = await fetch(url, {
    signal: getTransferSignal(),
    headers: {
      'User-Agent': USER_AGENT
    }
  })

  if (!response.ok) {
    if (response.status === 404 || response.status === 400) {
      return []
    }
    throw new Error(`Failed to fetch Modrinth versions: ${response.status}`)
  }

  const data = (await response.json()) as ModrinthVersionResponse[]

  const result: ModVersionFile[] = []

  for (const item of data) {
    result.push(normalizeModrinthVersion(item))
  }

  await setCachedData(cacheKey, result)
  return result
}

const DETAIL_CACHE_TTL = 30 * 60 * 1000

export async function getModrinthProjectDetail(projectIdOrSlug: string): Promise<ModDetail> {
  const cacheKey = `modrinth_detail_${projectIdOrSlug}`
  const cached = await getCachedData<ModDetail>(cacheKey, DETAIL_CACHE_TTL)
  if (cached) {
    return cached
  }

  const projectUrl = `${MODRINTH_API_BASE}/project/${encodeURIComponent(projectIdOrSlug)}`
  const resp = await fetch(projectUrl, {
    signal: getTransferSignal(),
    headers: { 'User-Agent': USER_AGENT }
  })

  if (!resp.ok) {
    throw new Error(`Failed to fetch Modrinth project ${projectIdOrSlug}: ${resp.status}`)
  }

  const data = await resp.json()

  let creators: Array<{ name: string; role?: string; avatarUrl?: string }> = []
  try {
    const membersUrl = `${MODRINTH_API_BASE}/project/${encodeURIComponent(projectIdOrSlug)}/members`
    const memResp = await fetch(membersUrl, {
      signal: getTransferSignal(),
      headers: { 'User-Agent': USER_AGENT }
    })
    if (memResp.ok) {
      const membersData = await memResp.json()
      if (Array.isArray(membersData)) {
        creators = membersData.map((m: any) => ({
          name: m.user?.username || m.user?.name || 'Creator',
          role: m.role || 'Member',
          avatarUrl: m.user?.avatar_url
        }))
      }
    }
  } catch {}

  const validLoaders: ModLoaderType[] = []
  if (Array.isArray(data.loaders)) {
    for (const l of data.loaders) {
      const lower = String(l).toLowerCase()
      if (lower === 'fabric' || lower === 'forge' || lower === 'neoforge' || lower === 'quilt') {
        validLoaders.push(lower as ModLoaderType)
      }
    }
  }

  const galleryItems = Array.isArray(data.gallery)
    ? data.gallery.map((g: any) => ({
        url: g.url,
        title: g.title || undefined,
        description: g.description || undefined
      }))
    : []

  const donationUrl =
    Array.isArray(data.donation_urls) && data.donation_urls.length > 0 ? data.donation_urls[0].url : undefined

  const detail: ModDetail = {
    id: data.id,
    slug: data.slug,
    name: data.title,
    summary: data.description,
    description: data.body || '',
    iconUrl: data.icon_url || undefined,
    downloads: data.downloads || 0,
    followers: data.followers || 0,
    source: 'modrinth',
    categories: Array.isArray(data.categories) ? data.categories : [],
    loaders: validLoaders,
    gameVersions: Array.isArray(data.game_versions) ? data.game_versions : [],
    clientSide: data.client_side,
    serverSide: data.server_side,
    links: {
      issues: data.issues_url || undefined,
      source: data.source_url || undefined,
      wiki: data.wiki_url || undefined,
      discord: data.discord_url || undefined,
      donate: donationUrl
    },
    license: data.license
      ? {
          id: data.license.id || data.license.name || 'Custom',
          name: data.license.name,
          url: data.license.url
        }
      : undefined,
    creators,
    gallery: galleryItems,
    publishedAt: data.published,
    updatedAt: data.updated
  }

  await setCachedData(cacheKey, detail)
  return detail
}

function normalizeModrinthVersion(item: ModrinthVersionResponse): ModVersionFile {
  const primaryFile = item.files.find((f) => f.primary) || item.files[0]
  if (!primaryFile) throw new Error('Version has no downloadable files')

  const validLoaders: ModLoaderType[] = []
  for (const l of item.loaders) {
    const lower = l.toLowerCase()
    if (lower === 'fabric' || lower === 'forge' || lower === 'neoforge' || lower === 'quilt') {
      validLoaders.push(lower as ModLoaderType)
    }
  }

  return {
    dependencies: (item.dependencies || []).map((d) => ({
      projectId: d.project_id,
      versionId: d.version_id,
      type: d.dependency_type
    })),
    shaderLoaders: item.loaders.filter((l) => ['iris', 'optifine', 'canvas', 'vanilla'].includes(l)),
    id: item.id,
    projectId: item.project_id,
    name: item.name,
    versionNumber: item.version_number,
    gameVersions: item.game_versions,
    loaders: validLoaders,
    downloadUrl: primaryFile ? primaryFile.url : null,
    websiteUrl: `https://modrinth.com/${item.loaders.some((loader) => ['iris', 'optifine', 'canvas'].includes(loader)) ? 'shader' : 'mod'}/${item.project_id}/version/${item.id}`,
    filename: primaryFile.filename,
    sizeBytes: primaryFile.size,
    sha512: primaryFile.hashes.sha512,
    sha1: primaryFile.hashes.sha1,
    releaseType: item.version_type,
    datePublished: item.date_published,
    changelog: item.changelog
  }
}

export async function getModrinthVersion(versionId: string): Promise<ModVersionFile> {
  const response = await fetch(`${MODRINTH_API_BASE}/version/${encodeURIComponent(versionId)}`, {
    signal: getTransferSignal(),
    headers: { 'User-Agent': USER_AGENT }
  })
  if (!response.ok) throw new Error(`Cannot resolve Modrinth version: ${response.status}`)
  return normalizeModrinthVersion((await response.json()) as ModrinthVersionResponse)
}
