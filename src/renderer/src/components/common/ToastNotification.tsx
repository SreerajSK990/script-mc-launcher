import React, { useEffect, useState, useRef } from 'react'
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastNotificationProps {
  id?: string | number
  message: string | null
  type?: ToastType
  durationMs?: number
  onClose: () => void
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({
  id,
  message,
  type = 'success',
  durationMs = 5000,
  onClose
}) => {
  const [progress, setProgress] = useState(100)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!message) return

    setProgress(100)
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const remainingPct = Math.max(0, 100 - (elapsed / durationMs) * 100)
      setProgress(remainingPct)
      if (remainingPct <= 0) {
        clearInterval(interval)
        onCloseRef.current()
      }
    }, 50)

    return () => clearInterval(interval)
  }, [id, message, durationMs])

  if (!message) return null

  const icons = {
    success: <CheckCircle2 className="text-emerald-400 shrink-0" size={18} />,
    error: <AlertCircle className="text-rose-400 shrink-0" size={18} />,
    warning: <AlertTriangle className="text-amber-400 shrink-0" size={18} />,
    info: <Info className="text-sky-400 shrink-0" size={18} />
  }

  const borderColors = {
    success: 'border-emerald-500/30 shadow-emerald-950/40',
    error: 'border-rose-500/30 shadow-rose-950/40',
    warning: 'border-amber-500/30 shadow-amber-950/40',
    info: 'border-sky-500/30 shadow-sky-950/40'
  }

  const barColors = {
    success: 'bg-emerald-400',
    error: 'bg-rose-400',
    warning: 'bg-amber-400',
    info: 'bg-sky-400'
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full animate-in fade-in slide-in-from-bottom-5 duration-200 select-none">
      <div className={`bg-background-card/95 backdrop-blur-md border ${borderColors[type]} rounded-2xl shadow-2xl overflow-hidden p-4 flex flex-col gap-3`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {icons[type]}
            <p className="text-xs font-medium text-slate-200 leading-relaxed break-words">
              {message}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColors[type]} transition-all duration-75 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
