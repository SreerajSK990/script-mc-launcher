import React, { useState, useEffect, useRef } from 'react'
import {
  Terminal,
  Copy,
  Trash2,
  Square,
  ChevronDown,
  Maximize2,
  Check,
  ArrowDown
} from 'lucide-react'
import type { LaunchProgressEvent, LaunchLogEvent } from '@shared/types/launch'
import { Button } from '@renderer/components/common/Button'

interface ConsoleLogDrawerProps {
  isOpen: boolean
  onClose: () => void
  onStop: () => void
  instanceName: string
  progress: LaunchProgressEvent | null
  logs: LaunchLogEvent[]
  onClearLogs: () => void
}

export const ConsoleLogDrawer: React.FC<ConsoleLogDrawerProps> = ({
  isOpen,
  onClose,
  onStop,
  instanceName,
  progress,
  logs,
  onClearLogs
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [hasCopied, setHasCopied] = useState(false)
  const logTerminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const handleCopyLogs = async () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.text}`).join('\n')
    await navigator.clipboard.writeText(text)
    setHasCopied(true)
    setTimeout(() => setHasCopied(false), 2000)
  }

  if (!isOpen) {
    return null
  }

  const isGameRunning = progress?.step === 'RUNNING'
  const isCrashed = progress?.step === 'CRASHED'
  const isCompleted = progress?.step === 'COMPLETED'
  const hasPercentage = typeof progress?.percentage === 'number'

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 bg-background-darkest/95 border-t border-border-strong backdrop-blur-md shadow-2xl transition-all duration-300 flex flex-col ${
        isExpanded ? 'h-[85vh]' : 'h-80'
      }`}
    >
      <div className="h-12 px-4 bg-background-dark/90 border-b border-border-subtle flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Terminal size={15} />
          </div>

          <div className="flex items-center gap-2 truncate">
            <span className="text-xs font-semibold text-slate-100 truncate">{instanceName}</span>
            <span className="text-slate-500 text-xs">•</span>
            <span
              className={`text-xs font-mono font-medium truncate ${
                isCrashed
                  ? 'text-rose-400'
                  : isGameRunning
                  ? 'text-emerald-400'
                  : 'text-cyan-400'
              }`}
            >
              {progress?.statusText || 'Initializing...'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isGameRunning && (
            <Button
              variant="danger"
              size="sm"
              icon={Square}
              onClick={onStop}
            >
              Stop Game
            </Button>
          )}

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
              autoScroll
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-background-surface border-border-subtle text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Auto Scroll"
          >
            <ArrowDown size={13} />
            <span className="hidden sm:inline text-[11px]">Auto-scroll</span>
          </button>

          <button
            onClick={handleCopyLogs}
            className="p-1.5 rounded-lg bg-background-surface hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-border-subtle transition-colors"
            title="Copy Logs"
          >
            {hasCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>

          <button
            onClick={onClearLogs}
            className="p-1.5 rounded-lg bg-background-surface hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-border-subtle transition-colors"
            title="Clear Console"
          >
            <Trash2 size={14} />
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-background-surface hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-border-subtle transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            <Maximize2 size={14} />
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-background-surface hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-border-subtle transition-colors"
            title="Hide Drawer"
          >
            <ChevronDown size={15} />
          </button>
        </div>
      </div>

      {hasPercentage && !isGameRunning && !isCompleted && !isCrashed && (
        <div className="h-1 w-full bg-background-darkest relative shrink-0">
          <div
            className="h-full bg-emerald-500 transition-all duration-150"
            style={{ width: `${progress?.percentage || 0}%` }}
          />
        </div>
      )}

      <div
        ref={logTerminalRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs flex flex-col gap-1 bg-black/60 select-text"
      >
        {logs.length === 0 ? (
          <span className="text-slate-600 italic">Waiting for process output...</span>
        ) : (
          logs.map((log, index) => {
            let textColor = 'text-slate-300'
            if (log.level === 'error') {
              textColor = 'text-rose-400'
            } else if (log.level === 'warn') {
              textColor = 'text-amber-300'
            }

            return (
              <div key={index} className="flex items-start gap-2 leading-relaxed">
                <span className="text-slate-600 select-none shrink-0">{log.timestamp}</span>
                <span className={`break-all ${textColor}`}>{log.text}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
