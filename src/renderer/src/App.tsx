import React, { useState, useEffect, useCallback } from 'react'
import type { InstanceConfiguration, CreateInstancePayload } from '@shared/types/instance'
import type { SystemEnvironment } from '@shared/types/system'
import { TitleBar } from '@renderer/components/layout/TitleBar'
import { Sidebar, type ActivePageTab } from '@renderer/components/layout/Sidebar'
import { DashboardPage } from '@renderer/pages/DashboardPage'
import { InstancesPage } from '@renderer/pages/InstancesPage'
import { ModBrowserPage } from '@renderer/pages/ModBrowserPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { CreateInstanceModal } from '@renderer/components/instances/CreateInstanceModal'

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActivePageTab>('dashboard')
  const [instances, setInstances] = useState<InstanceConfiguration[]>([])
  const [systemEnv, setSystemEnv] = useState<SystemEnvironment | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
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

  useEffect(() => {
    fetchInstances()
    fetchEnvironment()
  }, [fetchInstances, fetchEnvironment])

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
    showNotification(`Launching ${instance.name} (Launch engine will link in Phase 3)`)
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background-darkest text-slate-100 overflow-hidden select-none">
      <TitleBar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenCreateModal={() => setIsCreateModalOpen(true)}
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
    </div>
  )
}
