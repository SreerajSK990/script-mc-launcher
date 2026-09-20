import React from 'react'
import {
  LayoutDashboard,
  Layers,
  Boxes,
  Settings,
  Plus,
  UserCheck
} from 'lucide-react'
import { Button } from '@renderer/components/common/Button'

export type ActivePageTab = 'dashboard' | 'instances' | 'mods' | 'settings'

interface SidebarProps {
  activeTab: ActivePageTab
  onSelectTab: (tab: ActivePageTab) => void
  onOpenCreateModal: () => void
  instanceCount: number
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  onOpenCreateModal,
  instanceCount
}) => {
  const navigationItems = [
    {
      id: 'dashboard' as const,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'instances' as const,
      label: 'Instances',
      icon: Layers,
      badge: instanceCount > 0 ? instanceCount.toString() : null
    },
    {
      id: 'mods' as const,
      label: 'Mod Browser',
      icon: Boxes,
      badge: null
    },
    {
      id: 'settings' as const,
      label: 'Settings',
      icon: Settings,
      badge: null
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
                  <span className="text-xs px-2 py-0.5 rounded-full bg-background-darkest text-slate-400 font-mono">
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="pt-4 border-t border-border-subtle">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-background-darkest/60 border border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <UserCheck size={16} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-slate-200">Dev Player</span>
              <span className="text-[10px] text-emerald-400">Ready to Launch</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
