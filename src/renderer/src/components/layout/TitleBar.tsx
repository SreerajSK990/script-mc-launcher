import React, { useState, useEffect } from 'react'
import { Minus, Square, Copy, X, Terminal } from 'lucide-react'

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const checkMaximized = async () => {
      if (window.launcherAPI?.window) {
        const state = await window.launcherAPI.window.isMaximized()
        setIsMaximized(state)
      }
    }
    checkMaximized()
  }, [])

  const handleMinimize = () => {
    window.launcherAPI?.window.minimize()
  }

  const handleMaximize = async () => {
    await window.launcherAPI?.window.maximize()
    if (window.launcherAPI?.window) {
      const state = await window.launcherAPI.window.isMaximized()
      setIsMaximized(state)
    }
  }

  const handleClose = () => {
    window.launcherAPI?.window.close()
  }

  return (
    <header className="h-10 w-full bg-background-darkest/90 border-b border-border-subtle flex items-center justify-between px-3 select-none app-drag z-40 shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
          <Terminal size={12} strokeWidth={2.5} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold tracking-wide text-slate-200">SCRIPT LAUNCHER</span>
          <span className="text-[10px] text-slate-500 font-mono">v0.1.0</span>
        </div>
      </div>

      <div className="flex items-center app-no-drag">
        <button
          onClick={handleMinimize}
          className="h-8 w-10 inline-flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-background-surface transition-colors"
          title="Minimize"
          aria-label="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleMaximize}
          className="h-8 w-10 inline-flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-background-surface transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          onClick={handleClose}
          className="h-8 w-10 inline-flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-600 transition-colors"
          title="Close"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  )
}
