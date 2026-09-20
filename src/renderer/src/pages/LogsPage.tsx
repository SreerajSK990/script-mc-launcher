import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Terminal,
  Search,
  Copy,
  Check,
  Trash2,
  ArrowDown,
  Square,
  Activity,
  AlertTriangle,
  AlertCircle,
  Info,
  X
} from 'lucide-react'
import type { LaunchProgressEvent, LaunchLogEvent } from '@shared/types/launch'
import { Button } from '@renderer/components/common/Button'

type LogFilterLevel = 'all' | 'info' | 'warn' | 'error'

interface LogsPageProps {
  instanceName?: string
  progress: LaunchProgressEvent | null
  logs: LaunchLogEvent[]
  onClearLogs: () => void
  onStopGame: () => void
  isGameRunning: boolean
}

export const LogsPage: React.FC<LogsPageProps> = ({
  instanceName,
  progress,
  logs,
  onClearLogs,
  onStopGame,
  isGameRunning
}) => {
  const [filterLevel, setFilterLevel] = useState<LogFilterLevel>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [hasCopied, setHasCopied] = useState(false)
  const logTerminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const counts = useMemo(() => {
    let info = 0
    let warn = 0
    let error = 0
    for (const log of logs) {
      if (log.level === 'error') error++
      else if (log.level === 'warn') warn++
      else info++
    }
    return { all: logs.length, info, warn, error }
  }, [logs])

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return logs.filter((log) => {
      if (filterLevel !== 'all' && log.level !== filterLevel) {
        return false
      }
      if (query && !log.text.toLowerCase().includes(query)) {
        return false
      }
      return true
    })
  }, [logs, filterLevel, searchQuery])

  const handleCopyLogs = async () => {
    const lines = filteredLogs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.text}`)
    await navigator.clipboard.writeText(lines.join('\n'))
    setHasCopied(true)
    setTimeout(() => setHasCopied(false), 2000)
  }

  const isCrashed = progress?.step === 'CRASHED'
  const isCompleted = progress?.step === 'COMPLETED'
  const hasPercentage = typeof progress?.percentage === 'number'

  return (
    <div className="flex flex-col h-full w-full gap-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-background-surface border border-border-subtle flex items-center justify-center text-emerald-400 shrink-0">
            <Terminal size={20} />
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white tracking-tight truncate">
                {instanceName ? `${instanceName} Logs` : 'Console Logs'}
              </h2>
              {isGameRunning ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Running
                </span>
              ) : isCrashed ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono">
                  Process Crashed
                </span>
              ) : isCompleted ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/15 text-slate-300 border border-slate-500/30 font-mono">
                  Completed
                </span>
              ) : progress ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono truncate">
                  {progress.statusText}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-background-surface text-slate-400 border border-border-subtle font-mono">
                  Idle
                </span>
              )}
            </div>
            <span className="text-xs text-slate-400 mt-0.5">
              Live JVM, loader, and game stdout/stderr output stream
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isGameRunning && (
            <Button
              variant="danger"
              size="sm"
              icon={Square}
              onClick={onStopGame}
            >
              Stop Game
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            icon={hasCopied ? Check : Copy}
            onClick={handleCopyLogs}
          >
            {hasCopied ? 'Copied' : 'Copy Logs'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            onClick={onClearLogs}
            title="Clear Console"
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-background-card border border-border-subtle p-2.5 rounded-xl">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterLevel('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              filterLevel === 'all'
                ? 'bg-background-surface text-white border border-border-strong'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity size={13} />
            <span>All</span>
            <span className="text-[10px] text-slate-500 font-mono">({counts.all})</span>
          </button>

          <button
            onClick={() => setFilterLevel('info')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              filterLevel === 'info'
                ? 'bg-background-surface text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Info size={13} />
            <span>Info</span>
            <span className="text-[10px] text-slate-500 font-mono">({counts.info})</span>
          </button>

          <button
            onClick={() => setFilterLevel('warn')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              filterLevel === 'warn'
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle size={13} />
            <span>Warn</span>
            <span className="text-[10px] text-slate-500 font-mono">({counts.warn})</span>
          </button>

          <button
            onClick={() => setFilterLevel('error')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              filterLevel === 'error'
                ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertCircle size={13} />
            <span>Error</span>
            <span className="text-[10px] text-slate-500 font-mono">({counts.error})</span>
          </button>
        </div>

        <div className="flex items-center gap-2 min-w-[260px] flex-1 max-w-md">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search in logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-background-darkest border border-border-subtle rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors shrink-0 ${
              autoScroll
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-background-darkest border-border-subtle text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Auto Scroll"
          >
            <ArrowDown size={13} />
            <span className="text-[11px] font-medium">Auto-scroll</span>
          </button>
        </div>
      </div>

      {hasPercentage && !isGameRunning && !isCompleted && !isCrashed && (
        <div className="w-full bg-background-surface rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-emerald-500 h-full transition-all duration-200"
            style={{ width: `${progress?.percentage || 0}%` }}
          />
        </div>
      )}

      <div
        ref={logTerminalRef}
        className="flex-1 min-h-[400px] bg-[#080A0F] border border-border-subtle rounded-2xl p-4 overflow-y-auto font-mono text-xs select-text flex flex-col gap-1 shadow-inner"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2 py-16 select-none">
            <Terminal size={32} className="text-slate-600 mb-1" />
            <p className="text-xs">
              {logs.length === 0
                ? 'No console output. Launch an instance to view live stdout and stderr.'
                : 'No log lines match the current search filter.'}
            </p>
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            let badgeColor = 'text-slate-400'
            let textColor = 'text-slate-300'

            if (log.level === 'error') {
              badgeColor = 'text-rose-400 font-semibold'
              textColor = 'text-rose-300'
            } else if (log.level === 'warn') {
              badgeColor = 'text-amber-400 font-semibold'
              textColor = 'text-amber-200'
            } else if (log.text.includes('[INFO]') || log.text.includes('INFO:')) {
              badgeColor = 'text-cyan-400'
            }

            return (
              <div key={index} className="flex items-start gap-2.5 leading-relaxed hover:bg-white/[0.02] px-1 py-0.5 rounded">
                <span className="text-slate-600 select-none shrink-0 font-mono text-[11px]">
                  {log.timestamp}
                </span>
                <span className={`select-none shrink-0 text-[11px] uppercase ${badgeColor}`}>
                  [{log.level}]
                </span>
                <span className={`break-all ${textColor}`}>
                  {log.text}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
