import type { ModLoaderType } from '@shared/types/instance'
import type { ModSearchResult, ModVersionFile, ModSearchParams } from '@shared/types/mods'

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
  files: ModrinthVersionFileEntry[]
}

export async function searchModrinth(params: ModSearchParams): Promise<ModSearchResult[]> {
  const projectType = params.projectType === 'modpack' ? 'modpack' : 'mod'
  const facets: string[][] = [[`project_type:${projectType}`]]

  if (params.loader) {
    facets.push([`categories:${params.loader.toLowerCase()}`])
  }

  if (params.minecraftVersion) {
    facets.push([`versions:${params.minecraftVersion}`])
  }

  if (params.category) {
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

  const url = `${MODRINTH_API_BASE}/search?${queryParams.toString()}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  })

  if (!response.ok) {
    throw new Error(`Modrinth search failed with status ${response.status}: ${response.statusText}`)
  }

  const data = (await response.json()) as ModrinthSearchResponse

  return data.hits.map((hit) => {
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
      projectType,
      latestVersion: hit.latest_version,
      clientSide: hit.client_side,
      serverSide: hit.server_side
    }
  })
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

  const url = `${MODRINTH_API_BASE}/project/${projectId}/version?${queryParams.toString()}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Modrinth versions: ${response.status}`)
  }

  const data = (await response.json()) as ModrinthVersionResponse[]

  const result: ModVersionFile[] = []

  for (const item of data) {
    const primaryFile = item.files.find((f) => f.primary) || item.files[0]
    if (!primaryFile) continue

    const validLoaders: ModLoaderType[] = []
    for (const l of item.loaders) {
      const lower = l.toLowerCase()
      if (lower === 'fabric' || lower === 'forge' || lower === 'neoforge' || lower === 'quilt') {
        validLoaders.push(lower as ModLoaderType)
      }
    }

    result.push({
      id: item.id,
      projectId: item.project_id,
      name: item.name,
      versionNumber: item.version_number,
      gameVersions: item.game_versions,
      loaders: validLoaders,
      downloadUrl: primaryFile.url,
      filename: primaryFile.filename,
      sizeBytes: primaryFile.size,
      sha512: primaryFile.hashes.sha512,
      sha1: primaryFile.hashes.sha1,
      releaseType: item.version_type,
      datePublished: item.date_published,
      changelog: item.changelog
    })
  }

  return result
}
