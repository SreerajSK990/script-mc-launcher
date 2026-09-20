import React from 'react'
import { Check, LogOut, User, ShieldCheck } from 'lucide-react'
import type { StoredAccount } from '@shared/types/auth'
import { Button } from '@renderer/components/common/Button'

interface AccountCardProps {
  account: StoredAccount
  isActive: boolean
  onSelect: (accountId: string) => void
  onRemove: (accountId: string) => void
}

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  isActive,
  onSelect,
  onRemove
}) => {
  const isMicrosoft = account.accountType === 'microsoft'
  const avatarUrl = `https://mc-heads.net/avatar/${account.username}/48`

  return (
    <div
      className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
        isActive
          ? 'bg-emerald-950/20 border-emerald-500/50 shadow-sm'
          : 'bg-background-darkest border-border-subtle hover:border-border-strong'
      }`}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="relative shrink-0">
          <img
            src={avatarUrl}
            alt={account.username}
            className="w-10 h-10 rounded-lg bg-background-surface border border-border-subtle object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const fallback = e.currentTarget.nextElementSibling as HTMLElement
              if (fallback) fallback.style.display = 'flex'
            }}
          />
          <div className="hidden w-10 h-10 rounded-lg bg-background-surface border border-border-subtle items-center justify-center text-slate-400">
            <User size={20} />
          </div>

          {isActive && (
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-background-dark flex items-center justify-center text-white">
              <Check size={10} strokeWidth={3} />
            </div>
          )}
        </div>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100 truncate">
              {account.username}
            </span>
            {isActive && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                Active
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-0.5">
            {isMicrosoft ? (
              <span className="text-[11px] text-cyan-400 flex items-center gap-1">
                <ShieldCheck size={12} />
                Microsoft
              </span>
            ) : (
              <span className="text-[11px] text-amber-400 font-mono">
                Offline Dev
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!isActive && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onSelect(account.id)}
          >
            Select
          </Button>
        )}

        <button
          onClick={() => onRemove(account.id)}
          className="p-2 rounded-lg bg-background-surface hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-border-subtle hover:border-rose-900/40 transition-colors"
          title="Sign Out / Remove"
          aria-label="Sign Out / Remove"
        >
          <LogOut size={14} />
        </button>
      </div>
    </div>
  )
}
