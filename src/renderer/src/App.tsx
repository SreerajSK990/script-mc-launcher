import React, { useState, useEffect, useCallback } from 'react'
import type { InstanceConfiguration, CreateInstancePayload } from '@shared/types/instance'
import type { SystemEnvironment } from '@shared/types/system'
import type { AuthState } from '@shared/types/auth'
import { TitleBar } from '@renderer/components/layout/TitleBar'
import { Sidebar, type ActivePageTab } from '@renderer/components/layout/Sidebar'
import { DashboardPage } from '@renderer/pages/DashboardPage'
import { InstancesPage } from '@renderer/pages/InstancesPage'
import { ModBrowserPage } from '@renderer/pages/ModBrowserPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { CreateInstanceModal } from '@renderer/components/instances/CreateInstanceModal'
import { AccountModal } from '@renderer/components/auth/AccountModal'

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActivePageTab>('dashboard')
  const [instances, setInstances] = useState<InstanceConfiguration[]>([])
  const [systemEnv, setSystemEnv] = useState<SystemEnvironment | null>(null)
  const [authState, setAuthState] = useState<AuthState>({ activeAccount: null, accounts: [] })
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [activeNotification, setActiveNotification] = useState<string | null>(null)

  const showNotification = (message: string) => {
    setActiveNotification(message)
    setTimeout(() => setActiveNotification(null), 3000)
  }

  const fetchInstances = useCallback(async () => {
    if (window.launcherAPI?.instances) {
      try {
        const list = await window.launcherAPI.instances.list()
        setInstances(list)
      } catch (error) {
        console.error('Failed to list instances:', error)
      }
    }
  }, [])

  const fetchEnvironment = useCallback(async () => {
    if (window.launcherAPI?.system) {
      try {
        const env = await window.launcherAPI.system.getEnvironment()
        setSystemEnv(env)
      } catch (error) {
        console.error('Failed to get environment:', error)
      }
    }
  }, [])

  const fetchAuthState = useCallback(async () => {
    if (window.launcherAPI?.auth) {
      try {
        const state = await window.launcherAPI.auth.getState()
        setAuthState(state)
      } catch (error) {
        console.error('Failed to get auth state:', error)
      }
    }
  }, [])

  useEffect(() => {
    fetchInstances()
    fetchEnvironment()
    fetchAuthState()
  }, [fetchInstances, fetchEnvironment, fetchAuthState])

  const handleCreateInstance = async (payload: CreateInstancePayload) => {
    if (window.launcherAPI?.instances) {
      await window.launcherAPI.instances.create(payload)
      await fetchInstances()
      showNotification(`Instance "${payload.name}" created successfully.`)
    }
  }

  const handleDeleteInstance = async (instanceId: string) => {
    const target = instances.find((inst) => inst.id === instanceId)
    const confirmed = window.confirm(
      `Are you sure you want to delete "${target?.name || 'this instance'}"? This action cannot be undone.`
    )
    if (!confirmed) return

    if (window.launcherAPI?.instances) {
      await window.launcherAPI.instances.delete(instanceId)
      await fetchInstances()
      showNotification('Instance deleted.')
    }
  }

  const handleOpenFolder = async (instanceId: string) => {
    if (window.launcherAPI?.instances) {
      await window.launcherAPI.instances.openFolder(instanceId)
    }
  }

  const handlePlayInstance = (instance: InstanceConfiguration) => {
    const playerName = authState.activeAccount?.username || 'Player'
    showNotification(`Launching ${instance.name} as ${playerName} (Launch engine in Phase 3)`)
  }

  const handleLoginMicrosoft = async () => {
    if (window.launcherAPI?.auth) {
      const account = await window.launcherAPI.auth.loginMicrosoft()
      await fetchAuthState()
      showNotification(`Signed in as ${account.username}`)
    }
  }

  const handleLoginOffline = async (username: string) => {
    if (window.launcherAPI?.auth) {
      const account = await window.launcherAPI.auth.loginOffline(username)
      await fetchAuthState()
      showNotification(`Created offline player ${account.username}`)
    }
  }

  const handleSwitchAccount = async (accountId: string) => {
    if (window.launcherAPI?.auth) {
      const account = await window.launcherAPI.auth.switchAccount(accountId)
      await fetchAuthState()
      if (account) {
        showNotification(`Switched to ${account.username}`)
      }
    }
  }

  const handleLogout = async (accountId: string) => {
    if (window.launcherAPI?.auth) {
      await window.launcherAPI.auth.logout(accountId)
      await fetchAuthState()
      showNotification('Account removed.')
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background-darkest text-slate-100 overflow-hidden select-none">
      <TitleBar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenCreateModal={() => setIsCreateModalOpen(true)}
          onOpenAccountModal={() => setIsAccountModalOpen(true)}
          activeAccount={authState.activeAccount}
          instanceCount={instances.length}
        />

        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-background-dark/50">
          <div className="w-full max-w-[1600px] mx-auto">
            {activeNotification && (
              <div className="mb-6 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between shadow-lg">
                <span>{activeNotification}</span>
                <button
                  onClick={() => setActiveNotification(null)}
                  className="text-emerald-400 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            )}

            {activeTab === 'dashboard' && (
              <DashboardPage
                instances={instances}
                systemEnv={systemEnv}
                onPlay={handlePlayInstance}
                onOpenFolder={handleOpenFolder}
                onDelete={handleDeleteInstance}
                onCreateClick={() => setIsCreateModalOpen(true)}
              />
            )}

            {activeTab === 'instances' && (
              <InstancesPage
                instances={instances}
                onPlay={handlePlayInstance}
                onOpenFolder={handleOpenFolder}
                onDelete={handleDeleteInstance}
                onCreateClick={() => setIsCreateModalOpen(true)}
              />
            )}

            {activeTab === 'mods' && <ModBrowserPage />}

            {activeTab === 'settings' && <SettingsPage systemEnv={systemEnv} />}
          </div>
        </main>
      </div>

      <CreateInstanceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateInstance}
      />

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        authState={authState}
        onLoginMicrosoft={handleLoginMicrosoft}
        onLoginOffline={handleLoginOffline}
        onSwitchAccount={handleSwitchAccount}
        onLogout={handleLogout}
      />
    </div>
  )
}
