import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { ModSearchResult, ModVersionFile } from '@shared/types/mods'
import type { ShaderPack, ShaderEnvironment } from '@shared/types/operations'
import { Button } from '@renderer/components/common/Button'
import { ConfirmModal } from '@renderer/components/common/ConfirmModal'
import { ModDetailModal } from './ModDetailModal'
import { installModWithPreview, unwrapResult } from './DependencyInstallHost'

export const ShadersPanel: React.FC<{ instance?: InstanceConfiguration }> = ({ instance }) => {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [results, setResults] = useState<ModSearchResult[]>([])
  const [packs, setPacks] = useState<ShaderPack[]>([])
  const [environment, setEnvironment] = useState<ShaderEnvironment | null>(null)
  const [detail, setDetail] = useState<ModSearchResult | null>(null)
  const [remove, setRemove] = useState<ShaderPack | null>(null)
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(0)
  const [more, setMore] = useState(false)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    if (!instance) return
    const [installed, loader] = await Promise.all([
      window.launcherAPI.content.listShaders(instance.id),
      window.launcherAPI.content.shaderEnvironment(instance.id)
    ])
    setPacks(unwrapResult(installed))
    setEnvironment(unwrapResult(loader))
  }, [instance?.id])
  useEffect(() => {
    setPacks([])
    setEnvironment(null)
    setDetail(null)
    refresh().catch((error) => setMessage(String(error)))
  }, [refresh])
  useEffect(() => {
    const current = ++generation.current
    setResults([])
    setPage(0)
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const hits = await window.launcherAPI.mods.search({
          query,
          source,
          projectType: 'shader',
          minecraftVersion: instance?.minecraftVersion,
          limit: 24
        })
        if (current === generation.current) {
          setResults(hits)
          setMore(hits.length === 24)
        }
      } catch (error) {
        if (current === generation.current) setMessage(String(error))
      } finally {
        if (current === generation.current) setSearching(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      generation.current++
    }
  }, [query, source, instance?.minecraftVersion])
  const perform = async (work: () => Promise<void>) => {
    setBusy(true)
    setMessage('')
    try {
      await work()
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const install = async (project: ModSearchResult, version: ModVersionFile) => {
    if (!instance) throw new Error('Select an instance first')
    if (busy) throw new Error('Another operation is in progress')
    setBusy(true)
    try {
      const previous = packs.find((pack) => pack.source === project.source && pack.id === project.id)
      unwrapResult(
        await window.launcherAPI.content.installShader({
          instanceId: instance.id,
          versionFile: version,
          modMetadata: { id: project.id, name: project.name, source: project.source },
          oldFilename: previous?.filename
        })
      )
      setMessage(`${project.name} installed. Select it in Minecraft's shader settings.`)
      await refresh()
    } finally {
      setBusy(false)
    }
  }
  const setupLoader = () =>
    perform(async () => {
      if (!instance || !environment?.recommendedProject) return
      const versions = await window.launcherAPI.mods.getVersions(
        environment.recommendedProject,
        'modrinth',
        instance.minecraftVersion,
        instance.loaderType
      )
      const version = versions.find((item) => item.releaseType === 'release') || versions[0]
      if (!version)
        throw new Error(
          'No compatible shader-loader version is available for this Minecraft version and platform'
        )
      await installModWithPreview({
        instanceId: instance.id,
        versionFile: version,
        modMetadata: {
          id: version.projectId,
          name: environment.recommendedProject === 'iris' ? 'Iris' : 'Oculus',
          source: 'modrinth'
        }
      })
      setMessage('Shader loader installed. Launch Minecraft and select your shader in video settings.')
    })
  const importPaths = (paths: string[]) =>
    perform(async () => {
      if (!instance) throw new Error('Select an instance first')
      unwrapResult(await window.launcherAPI.content.importShaders(instance.id, paths))
      setMessage('Shader packs imported')
    })
  return (
    <section
      className="space-y-5 text-sm text-slate-300"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!busy)
          void importPaths(
            Array.from(event.dataTransfer.files)
              .map((file) => window.launcherAPI.system.pathForFile(file))
              .filter(Boolean)
          )
      }}
    >
      <div>
        <h2 className="text-xl font-semibold text-white">Shaders</h2>
        <p>Browse shader packs and install them into {instance?.name || 'a selected instance'}.</p>
      </div>
      <div className="rounded-xl border border-border-subtle bg-background-card p-4 space-y-3">
        <p>{environment?.message || 'Select an instance to check shader-loader support.'}</p>
        {environment && !environment.installed.length && environment.recommendedProject && (
          <Button disabled={busy} onClick={setupLoader}>
            Set up compatible shader loader
          </Button>
        )}
        <p className="text-xs text-slate-400">
          Installed packs are available to the game. The active shader is selected in Minecraft; availability
          does not guarantee compatibility with every GPU or loader.
        </p>
      </div>
      {message && (
        <p role="status" className="rounded-lg bg-white/5 p-3">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Search shaders"
          placeholder="Search shaders…"
          className="flex-1 min-w-40 rounded-lg bg-background-darkest border border-border-subtle p-2"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Shader provider"
          className="rounded-lg bg-background-darkest p-2"
          value={source}
          onChange={(event) => setSource(event.target.value as typeof source)}
        >
          <option value="modrinth">Modrinth</option>
          <option value="curseforge">CurseForge</option>
        </select>
        <Button
          disabled={!instance || busy}
          variant="ghost"
          onClick={async () => {
            const path = await window.launcherAPI.system.selectFile({
              title: 'Import shader pack',
              filters: [{ name: 'Shader ZIP', extensions: ['zip'] }]
            })
            if (path) void importPaths([path])
          }}
        >
          Import ZIP
        </Button>
        <Button
          disabled={!instance}
          variant="ghost"
          onClick={() =>
            perform(async () => {
              if (instance) unwrapResult(await window.launcherAPI.content.openShaderFolder(instance.id))
            })
          }
        >
          Open folder
        </Button>
      </div>
      <div>
        <h3 className="font-semibold text-white mb-3">Installed ({packs.length})</h3>
        {!packs.length && (
          <p className="text-slate-400">
            No shader packs installed. You can also drop shader ZIP files here.
          </p>
        )}
        <div className="space-y-2">
          {packs.map((pack) => (
            <div
              key={pack.filename}
              className="flex justify-between items-center gap-3 rounded-lg bg-white/5 p-3"
            >
              <div>
                <p>
                  {pack.name} <span className="text-xs text-emerald-400">Installed</span>
                </p>
                <p className="text-xs text-slate-400">
                  {pack.version} · {(pack.sizeBytes / 1048576).toFixed(1)} MB
                </p>
              </div>
              <div className="flex gap-2">
                {pack.source && (
                  <Button
                    disabled={busy}
                    variant="ghost"
                    onClick={() =>
                      setDetail({
                        id: pack.id,
                        name: pack.name,
                        source: pack.source!,
                        slug: pack.id,
                        author: '',
                        description: '',
                        downloads: 0,
                        categories: [],
                        loaders: [],
                        projectType: 'shader'
                      })
                    }
                  >
                    Versions
                  </Button>
                )}
                <Button disabled={busy} variant="ghost" onClick={() => setRemove(pack)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <h3 className="font-semibold text-white">Browse shaders</h3>
      {searching && <p>Loading shaders…</p>}
      {!searching && !results.length && (
        <p>No matching shaders found. CurseForge requires an API key in Settings.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {results.map((project) => (
          <button
            key={`${project.source}:${project.id}`}
            onClick={() => setDetail(project)}
            className="text-left rounded-xl border border-border-subtle bg-background-card p-4 hover:border-primary space-y-2"
          >
            <div className="flex gap-3 items-center">
              {project.iconUrl && (
                <img loading="lazy" src={project.iconUrl} alt="" className="w-10 h-10 rounded-lg" />
              )}
              <h4 className="font-semibold text-white">{project.name}</h4>
            </div>
            <p className="text-xs text-slate-400 line-clamp-2">{project.description}</p>
            {packs.some((pack) => pack.source === project.source && pack.id === project.id) && (
              <span className="text-xs text-emerald-400">Installed</span>
            )}
          </button>
        ))}
      </div>
      {more && (
        <Button
          disabled={searching}
          variant="ghost"
          onClick={async () => {
            const current = generation.current
            setSearching(true)
            try {
              const hits = await window.launcherAPI.mods.search({
                query,
                source,
                projectType: 'shader',
                minecraftVersion: instance?.minecraftVersion,
                limit: 24,
                offset: (page + 1) * 24
              })
              if (current === generation.current) {
                setResults((previous) => [
                  ...previous,
                  ...hits.filter(
                    (hit) => !previous.some((item) => item.id === hit.id && item.source === hit.source)
                  )
                ])
                setPage(page + 1)
                setMore(hits.length === 24)
              }
            } catch (error) {
              setMessage(String(error))
            } finally {
              setSearching(false)
            }
          }}
        >
          Load more
        </Button>
      )}
      <ModDetailModal
        isOpen={Boolean(detail)}
        onClose={() => setDetail(null)}
        mod={detail}
        currentInstance={instance}
        onInstallVersion={install}
      />
      <ConfirmModal
        isOpen={Boolean(remove)}
        title="Delete shader pack?"
        message={`Remove ${remove?.name || 'this shader'} from this instance?`}
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          const selected = remove
          setRemove(null)
          if (instance && selected)
            void perform(async () => {
              unwrapResult(await window.launcherAPI.content.deleteShader(instance.id, selected.filename))
            })
        }}
      />
    </section>
  )
}
