import React, { useState } from 'react'
import { Search, Download, ExternalLink, Sparkles, CheckCircle2 } from 'lucide-react'
import { Button } from '@renderer/components/common/Button'

export const ModBrowserPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSource, setSelectedSource] = useState<'all' | 'modrinth' | 'curseforge'>('all')

  const sampleMods = [
    {
      id: 'sodium',
      name: 'Sodium',
      author: 'jellysquid3',
      description: 'Modern rendering engine and client-side optimization mod for Minecraft.',
      downloads: '38.4M',
      source: 'modrinth' as const,
      categories: ['Optimization'],
      loaders: ['fabric', 'neoforge']
    },
    {
      id: 'iris',
      name: 'Iris Shaders',
      author: 'Iris-Shaders',
      description: 'A modern shaders mod for Minecraft compatible with existing OptiFine shader packs.',
      downloads: '29.1M',
      source: 'modrinth' as const,
      categories: ['Shaders', 'Optimization'],
      loaders: ['fabric', 'quilt', 'neoforge']
    },
    {
      id: 'jei',
      name: 'Just Enough Items (JEI)',
      author: 'mezz',
      description: 'Item and recipe viewing mod for Minecraft, built from the ground up for stability and performance.',
      downloads: '254M',
      source: 'curseforge' as const,
      categories: ['Utility'],
      loaders: ['forge', 'fabric', 'neoforge']
    },
    {
      id: 'appleskin',
      name: 'AppleSkin',
      author: 'squeek502',
      description: 'Adds useful food and hunger tooltips, visualization of saturation and exhaustion.',
      downloads: '112M',
      source: 'modrinth' as const,
      categories: ['UI', 'Quality of Life'],
      loaders: ['fabric', 'forge', 'quilt', 'neoforge']
    }
  ]

  const filteredMods = sampleMods.filter((mod) => {
    const matchesSource = selectedSource === 'all' || mod.source === selectedSource
    const matchesQuery =
      mod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mod.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSource && matchesQuery
  })

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Mod Browser</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Discover and install mods directly from Modrinth and CurseForge
          </p>
        </div>

        <div className="flex items-center gap-2 bg-background-card p-1 rounded-xl border border-border-subtle">
          <button
            onClick={() => setSelectedSource('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedSource === 'all'
                ? 'bg-emerald-500 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Unified (Both)
          </button>
          <button
            onClick={() => setSelectedSource('modrinth')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedSource === 'modrinth'
                ? 'bg-emerald-500 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Modrinth
          </button>
          <button
            onClick={() => setSelectedSource('curseforge')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedSource === 'curseforge'
                ? 'bg-emerald-500 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            CurseForge
          </button>
        </div>
      </div>

      <div className="bg-background-card border border-border-subtle p-3 rounded-2xl">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            placeholder="Search mods by name or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background-darkest rounded-xl text-sm text-slate-100 placeholder-slate-500 border border-border-subtle focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="bg-gradient-to-r from-emerald-950/20 via-background-card to-background-card border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Sparkles size={18} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200">Unified Mod Browser Engine</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Phase 7 will connect live search, dependency resolution, and one-click installation into your instance mods folder.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredMods.map((mod) => (
          <div
            key={mod.id}
            className="bg-background-card hover:bg-background-surface/80 border border-border-subtle hover:border-border-strong rounded-2xl p-5 flex flex-col justify-between transition-all"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">{mod.name}</h3>
                  <span className="text-xs text-slate-400">by {mod.author}</span>
                </div>

                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded uppercase border ${
                    mod.source === 'modrinth'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {mod.source}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed mb-4 line-clamp-2">
                {mod.description}
              </p>

              <div className="flex flex-wrap items-center gap-1.5 mb-4">
                {mod.loaders.map((loader) => (
                  <span
                    key={loader}
                    className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-background-darkest text-slate-400 border border-border-subtle"
                  >
                    {loader}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border-subtle/60 text-xs">
              <span className="text-slate-500 font-mono">{mod.downloads} downloads</span>
              <Button
                variant="secondary"
                size="sm"
                icon={Download}
                onClick={() => alert(`Installing ${mod.name} will be active in Phase 7.`)}
              >
                Get Mod
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
