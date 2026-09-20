import React from 'react'
import type { LucideIcon } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  iconPosition?: 'left' | 'right'
  isLoading?: boolean
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  isLoading = false,
  className = '',
  disabled,
  ...rest
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-xl focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]'

  const variantClasses: Record<ButtonVariant, string> = {
    primary: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-950/40',
    secondary: 'bg-background-surface hover:bg-slate-700 text-slate-100 border border-border-subtle',
    outline: 'bg-transparent hover:bg-background-surface text-slate-300 hover:text-white border border-border-subtle',
    ghost: 'bg-transparent hover:bg-background-surface text-slate-400 hover:text-slate-100',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white'
  }

  const sizeClasses: Record<ButtonSize, string> = {
    xs: 'text-[11px] px-2 py-1 gap-1',
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-3.5 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5'
  }

  const iconSizes: Record<ButtonSize, number> = {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18
  }

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading && (
        <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
      )}
      {!isLoading && Icon && iconPosition === 'left' && (
        <Icon size={iconSizes[size]} className="shrink-0" />
      )}
      {children && <span>{children}</span>}
      {!isLoading && Icon && iconPosition === 'right' && (
        <Icon size={iconSizes[size]} className="shrink-0" />
      )}
    </button>
  )
}
