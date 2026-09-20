import React, { useEffect } from 'react'
import { AlertTriangle, Trash2, HelpCircle, X, LucideIcon } from 'lucide-react'
import { Button } from './Button'

export interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'primary'
  icon?: LucideIcon
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  icon: CustomIcon,
  isLoading = false,
  onConfirm,
  onCancel
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading) {
        onCancel()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel, isLoading])

  if (!isOpen) return null

  const Icon = CustomIcon || (variant === 'danger' ? Trash2 : variant === 'warning' ? AlertTriangle : HelpCircle)

  const variantStyles = {
    danger: {
      iconBg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      buttonVariant: 'danger' as const,
      borderGlow: 'border-rose-500/30'
    },
    warning: {
      iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      buttonVariant: 'secondary' as const,
      borderGlow: 'border-amber-500/30'
    },
    primary: {
      iconBg: 'bg-primary/10 text-primary border-primary/20',
      buttonVariant: 'primary' as const,
      borderGlow: 'border-primary/30'
    }
  }

  const currentStyle = variantStyles[variant] || variantStyles.danger

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn app-no-drag">
      <div className="fixed inset-0" onClick={isLoading ? undefined : onCancel} aria-hidden="true" />

      <div
        className={`relative w-full max-w-md bg-background-card border ${currentStyle.borderGlow} rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col p-6 app-no-drag`}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-background-surface transition-colors"
          aria-label="Close dialog"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-4 mb-5">
          <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${currentStyle.iconBg}`}>
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed break-words">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border-subtle/50">
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={currentStyle.buttonVariant}
            size="sm"
            isLoading={isLoading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
