import React, { useState, useEffect } from 'react'
import { Type, Upload, Trash2, Check, Sparkles, FolderOpen, Loader2 } from 'lucide-react'
import type { CustomFontEntry } from '@shared/types/fonts'
import { Button } from '@renderer/components/common/Button'

const BUILT_IN_PRESETS = [
  {
    id: 'plus-jakarta',
    name: 'Plus Jakarta Sans',
    category: 'Modern Gaming',
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    importUrl: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
  },
  {
    id: 'geist',
    name: 'Geist Sans',
    category: 'Clean Technical',
    fontFamily: '"Geist", system-ui, sans-serif',
    importUrl: 'https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/core/font.css'
  },
  {
    id: 'inter',
    name: 'Inter',
    category: 'Neutral Standard',
    fontFamily: '"Inter", sans-serif',
    importUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
  },
  {
    id: 'pixel',
    name: 'Minecraftia (Pixel)',
    category: 'Retro Gaming',
    fontFamily: '"VT323", monospace',
    importUrl: 'https://fonts.googleapis.com/css2?family=VT323&display=swap'
  }
]

export function applyLauncherFont(fontFamily: string, customCss?: string) {
  let styleEl = document.getElementById('launcher-font-style') as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'launcher-font-style'
    document.head.appendChild(styleEl)
  }

  if (customCss) {
    styleEl.textContent = customCss
  } else {
    styleEl.textContent = ''
  }

  document.documentElement.style.setProperty('--font-sans', fontFamily)
}

export const FontSettingsSection: React.FC = () => {
  const [installedFonts, setInstalledFonts] = useState<CustomFontEntry[]>([])
  const [selectedFontId, setSelectedFontId] = useState<string>('plus-jakarta')
  const [isLoading, setIsLoading] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const loadFonts = async () => {
    try {
      setIsLoading(true)
      if (window.launcherAPI?.fonts) {
        const list = await window.launcherAPI.fonts.list()
        setInstalledFonts(list)
      }
    } catch (err) {
      console.error('Failed to load fonts:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadFonts()
    const saved = localStorage.getItem('launcher_selected_font') || 'plus-jakarta'
    setSelectedFontId(saved)
  }, [])

  const handleSelectPreset = (preset: (typeof BUILT_IN_PRESETS)[0]) => {
    setSelectedFontId(preset.id)
    localStorage.setItem('launcher_selected_font', preset.id)

    const css = `@import url('${preset.importUrl}');`
    applyLauncherFont(preset.fontFamily, css)

    setFeedback(`Applied font: ${preset.name}`)
    setTimeout(() => setFeedback(null), 2500)
  }

  const handleSelectCustomFont = (font: CustomFontEntry) => {
    setSelectedFontId(font.fileName)
    localStorage.setItem('launcher_selected_font', font.fileName)

    const css = `
      @font-face {
        font-family: "${font.name}";
        src: url("${font.dataUrl}") format("${font.format}");
        font-weight: 100 900;
        font-style: normal;
        font-display: swap;
      }
    `
    applyLauncherFont(`"${font.name}", sans-serif`, css)

    setFeedback(`Applied custom font: ${font.name}`)
    setTimeout(() => setFeedback(null), 2500)
  }

  const handleInstallFont = async () => {
    if (!window.launcherAPI?.system || !window.launcherAPI?.fonts) return

    try {
      const selected = await window.launcherAPI.system.selectFile({
        title: 'Select Custom Font File (.ttf, .otf, .woff2)',
        filters: [{ name: 'Font Files (*.ttf, *.otf, *.woff2)', extensions: ['ttf', 'otf', 'woff2'] }]
      })

      if (!selected) return

      setIsInstalling(true)
      const installed = await window.launcherAPI.fonts.install(selected)
      await loadFonts()
      handleSelectCustomFont(installed)
    } catch (err: any) {
      console.error('Failed to install font:', err)
      alert(err.message || 'Failed to install custom font.')
    } finally {
      setIsInstalling(false)
    }
  }

  const handleDeleteFont = async (fileName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this custom font?')) return

    try {
      await window.launcherAPI?.fonts.delete(fileName)
      if (selectedFontId === fileName) {
        handleSelectPreset(BUILT_IN_PRESETS[0])
      }
      await loadFonts()
    } catch (err) {
      console.error('Failed to delete font:', err)
    }
  }

  return (
    <div className="bg-background-card border border-border-subtle rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Type size={20} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Appearance & Typography</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Customize launcher typography or install custom font files (.ttf, .otf, .woff2)
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          icon={isInstalling ? Loader2 : Upload}
          isLoading={isInstalling}
          onClick={handleInstallFont}
        >
          Install Custom Font
        </Button>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
          <Check size={14} className="shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Built-in Presets */}
      <div>
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-3">
          Built-in Presets
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BUILT_IN_PRESETS.map((preset) => {
            const isSelected = selectedFontId === preset.id
            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex items-center justify-between ${
                  isSelected
                    ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-950/20'
                    : 'bg-background-surface/50 border-border-subtle hover:bg-background-surface hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white" style={{ fontFamily: preset.fontFamily }}>
                      {preset.name}
                    </span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-border-subtle">
                      {preset.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    The quick brown fox jumps over the lazy dog
                  </p>
                </div>
                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0 ml-3">
                    <Check size={14} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Installed Custom Fonts */}
      {installedFonts.length > 0 && (
        <div className="pt-2 border-t border-border-subtle">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-3">
            Installed Custom Fonts ({installedFonts.length})
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {installedFonts.map((font) => {
              const isSelected = selectedFontId === font.fileName
              return (
                <div
                  key={font.fileName}
                  onClick={() => handleSelectCustomFont(font)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex items-center justify-between group ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-950/20'
                      : 'bg-background-surface/50 border-border-subtle hover:bg-background-surface hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white truncate">{font.name}</span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-border-subtle shrink-0">
                        {font.format}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 font-mono truncate">{font.fileName}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                        <Check size={14} />
                      </div>
                    )}
                    <button
                      onClick={(e) => handleDeleteFont(font.fileName, e)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete font"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
