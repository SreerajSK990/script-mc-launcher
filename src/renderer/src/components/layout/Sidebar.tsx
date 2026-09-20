import React from 'react'
import {
  LayoutDashboard,
  Layers,
  Boxes,
  Terminal,
  Settings,
  Plus,
  User,
  ShieldCheck,
  ChevronRight
} from 'lucide-react'
import type { StoredAccount } from '@shared/types/auth'
import { Button } from '@renderer/components/common/Button'

export type ActivePageTab = 'dashboard' | 'instances' | 'mods' | 'logs' | 'settings'

interface SidebarProps {
  activeTab: ActivePageTab
  onSelectTab: (tab: ActivePageTab) => void
  onOpenCreateModal: () => void
  onOpenAccountModal: () => void
  activeAccount: StoredAccount | null
  instanceCount: number
  isProcessRunning?: boolean
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  onOpenCreateModal,
  onOpenAccountModal,
  activeAccount,
  instanceCount,
  isProcessRunning
}) => {
  const navigationItems = [
    {
      id: 'dashboard' as const,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
      badgeStyle: undefined
    },
    {
      id: 'instances' as const,
      label: 'Instances',
      icon: Layers,
      badge: instanceCount > 0 ? instanceCount.toString() : null,
      badgeStyle: undefined
    },
    {
      id: 'mods' as const,
      label: 'Mod Browser',
      icon: Boxes,
      badge: null,
      badgeStyle: undefined
    },
    {
      id: 'logs' as const,
      label: 'Logs',
      icon: Terminal,
      badge: isProcessRunning ? 'Live' : null,
      badgeStyle: isProcessRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold animate-pulse' : undefined
    },
    {
      id: 'settings' as const,
      label: 'Settings',
      icon: Settings,
      badge: null,
      badgeStyle: undefined
    }
  ]

  return (
    <aside className="w-64 bg-background-dark border-r border-border-subtle flex flex-col justify-between p-4 select-none shrink-0 h-full">
      <div className="flex flex-col gap-6">
        <div>
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            className="w-full justify-center"
            onClick={onOpenCreateModal}
          >
            New Instance
          </Button>
        </div>

        <nav className="flex flex-col gap-1.5">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id

            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-background-surface text-white shadow-sm border border-border-strong/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-background-surface/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    size={18}
                    className={isActive ? 'text-emerald-400' : 'text-slate-500'}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${item.badgeStyle || 'bg-background-darkest text-slate-400'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="pt-4 border-t border-border-subtle">
        <button
          onClick={onOpenAccountModal}
          className="w-full flex items-center justify-between p-2.5 rounded-xl bg-background-darkest/60 hover:bg-background-surface/80 border border-border-subtle hover:border-border-strong transition-all text-left group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {activeAccount ? (
              <img
                src={`https://mc-heads.net/avatar/${activeAccount.username}/32`}
                alt={activeAccount.username}
                className="w-8 h-8 rounded-lg bg-background-surface border border-border-subtle shrink-0 object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement
                  if (fallback) fallback.style.display = 'flex'
                }}
              />
            ) : null}

            <div
              className={`w-8 h-8 rounded-lg bg-background-surface border border-border-subtle flex items-center justify-center text-slate-400 shrink-0 ${
                activeAccount ? 'hidden' : 'flex'
              }`}
            >
              <User size={16} />
            </div>

            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                {activeAccount ? activeAccount.username : 'No Account'}
              </span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                {activeAccount?.accountType === 'microsoft' ? (
                  <>
                    <ShieldCheck size={11} className="text-cyan-400" />
                    <span className="text-cyan-400">Microsoft</span>
                  </>
                ) : (
                  <span>{activeAccount ? 'Offline Dev' : 'Click to sign in'}</span>
                )}
              </span>
            </div>
          </div>

          <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300 transition-colors shrink-0" />
        </button>
      </div>
    </aside>
  )
}
