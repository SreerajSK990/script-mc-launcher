import React, { useState, useEffect, useCallback } from 'react'
import type { InstanceConfiguration, CreateInstancePayload } from '@shared/types/instance'
import type { SystemEnvironment } from '@shared/types/system'
import type { AuthState } from '@shared/types/auth'
import type { LaunchProgressEvent, LaunchLogEvent } from '@shared/types/launch'
import { TitleBar } from '@renderer/components/layout/TitleBar'
import { Sidebar, type ActivePageTab } from '@renderer/components/layout/Sidebar'
import { DashboardPage } from '@renderer/pages/DashboardPage'
import { InstancesPage } from '@renderer/pages/InstancesPage'
import { InstanceDetailPage } from '@renderer/pages/InstanceDetailPage'
import { ModBrowserPage } from '@renderer/pages/ModBrowserPage'
import { LogsPage } from '@renderer/pages/LogsPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { SkinSelectorPage } from '@renderer/pages/SkinSelectorPage'
import type { QuickPlayTarget, QuickPlayLaunchOptions } from '@shared/types/servers'
import { CreateInstanceModal } from '@renderer/components/instances/CreateInstanceModal'
import { ImportModpackModal } from '@renderer/components/instances/ImportModpackModal'
import { ImportFromLauncherModal } from '@renderer/components/instances/ImportFromLauncherModal'
import { AccountModal } from '@renderer/components/auth/AccountModal'
import { ConfirmModal } from '@renderer/components/common/ConfirmModal'
import { ToastNotification } from '@renderer/components/common/ToastNotification'
import { applyLauncherFont } from '@renderer/components/settings/FontSettingsSection'
import { UpdateReadyModal } from '@renderer/components/updater/UpdateReadyModal'
import type { UpdateInfo } from '@shared/types/updater'

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActivePageTab>('dashboard')
  const [instances, setInstances] = useState<InstanceConfiguration[]>([])
  const [selectedDetailInstance, setSelectedDetailInstance] = useState<InstanceConfiguration | null>(null)
  const [modBrowserTargetInstanceId, setModBrowserTargetInstanceId] = useState<string | undefined>(undefined)
  const [modBrowserInitialType, setModBrowserInitialType] = useState<'mod' | 'modpack' | 'resourcepack'>('mod')
  const [systemEnv, setSystemEnv] = useState<SystemEnvironment | null>(null)
  const [authState, setAuthState] = useState<AuthState>({ activeAccount: null, accounts: [] })
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isImportModpackModalOpen, setIsImportModpackModalOpen] = useState(false)
  const [isImportLauncherModalOpen, setIsImportLauncherModalOpen] = useState(false)
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [activeNotification, setActiveNotification] = useState<{ id: number; message: string } | null>(null)

  const [activeLaunchingInstance, setActiveLaunchingInstance] = useState<InstanceConfiguration | null>(null)
  const [launchProgress, setLaunchProgress] = useState<LaunchProgressEvent | null>(null)
  const [launchLogs, setLaunchLogs] = useState<LaunchLogEvent[]>([])
  const [downloadedUpdate, setDownloadedUpdate] = useState<UpdateInfo | null>(null)
  const [gameStartTime, setGameStartTime] = useState<number | null>(null)

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmLabel?: string
    variant?: 'danger' | 'warning' | 'primary'
    onConfirm: () => void | Promise<void>
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  })

  const closeConfirmDialog = () => {
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
  }

  const showNotification = useCallback((message: string) => {
    setActiveNotification({ id: Date.now(), message })
  }, [])

  const handleCloseNotification = useCallback(() => {
    setActiveNotification(null)
  }, [])

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

  const handleToggleFavorite = useCallback(async (instanceId: string) => {
    setInstances((prev) =>
      prev.map((inst) =>
        inst.id === instanceId ? { ...inst, isFavorite: !Boolean(inst.isFavorite) } : inst
      )
    )
    if (window.launcherAPI?.instances?.toggleFavorite) {
      try {
        const updated = await window.launcherAPI.instances.toggleFavorite(instanceId)
        setInstances((prev) =>
          prev.map((inst) => (inst.id === updated.id ? updated : inst))
        )
      } catch (error) {
        console.error('Failed to toggle favorite:', error)
        fetchInstances()
      }
    }
  }, [fetchInstances])

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

  useEffect(() => {
    const saved = localStorage.getItem('launcher_selected_font') || 'plus-jakarta'
    if (saved === 'plus-jakarta') {
      applyLauncherFont(
        '"Plus Jakarta Sans", sans-serif',
        "@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');"
      )
    } else if (saved === 'geist') {
      applyLauncherFont(
        '"Geist", system-ui, sans-serif',
        "@import url('https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/core/font.css');"
      )
    } else if (saved === 'inter') {
      applyLauncherFont(
        '"Inter", sans-serif',
        "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');"
      )
    } else if (saved === 'pixel') {
      applyLauncherFont(
        '"VT323", monospace',
        "@import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');"
      )
    } else if (window.launcherAPI?.fonts) {
      window.launcherAPI.fonts.list().then((list) => {
        const found = list.find((f) => f.fileName === saved)
        if (found) {
          const css = `
            @font-face {
              font-family: "${found.name}";
              src: url("${found.dataUrl}") format("${found.format}");
              font-weight: 100 900;
              font-style: normal;
              font-display: swap;
            }
          `
          applyLauncherFont(`"${found.name}", sans-serif`, css)
        }
      })
    }
  }, [])

  useEffect(() => {
    if (!window.launcherAPI?.launch) {
      return
    }

    const unsubProgress = window.launcherAPI.launch.onProgress((event) => {
      setLaunchProgress(event)
      if (event.step === 'RUNNING') {
        setGameStartTime((prev) => prev || Date.now())
      } else if (event.step === 'COMPLETED' || event.step === 'CRASHED' || event.step === 'CANCELLED') {
        setGameStartTime(null)
      }
      if (event.step === 'RUNNING' || event.step === 'STARTING_JAVA') {
        fetchInstances()
      }
    })

    const unsubLogs = window.launcherAPI.launch.onLog((log) => {
      setLaunchLogs((prev) => [...prev.slice(-1000), log])
    })

    return () => {
      unsubProgress()
      unsubLogs()
    }
  }, [fetchInstances])

  useEffect(() => {
    if (!window.launcherAPI?.updater) return
    const unsub = window.launcherAPI.updater.onDownloaded((info) => {
      setDownloadedUpdate(info)
    })
    return () => {
      unsub()
    }
  }, [])

  useEffect(() => {
    if (!window.launcherAPI?.discord) return

    if (activeLaunchingInstance && launchProgress?.step === 'RUNNING') {
      window.launcherAPI.discord.setActivity({
        isPlaying: true,
        instanceName: activeLaunchingInstance.name,
        minecraftVersion: activeLaunchingInstance.minecraftVersion,
        loaderType: activeLaunchingInstance.loaderType,
        startTime: gameStartTime || Date.now()
      })
    } else if (activeTab === 'instances' && selectedDetailInstance) {
      window.launcherAPI.discord.setActivity({
        page: 'instance-detail',
        instanceName: selectedDetailInstance.name,
        minecraftVersion: selectedDetailInstance.minecraftVersion,
        loaderType: selectedDetailInstance.loaderType
      })
    } else {
      window.launcherAPI.discord.setActivity({
        page: activeTab
      })
    }
  }, [activeTab, selectedDetailInstance, activeLaunchingInstance, launchProgress?.step, gameStartTime])

  const handleCreateInstance = async (payload: CreateInstancePayload) => {
    if (window.launcherAPI?.instances) {
      await window.launcherAPI.instances.create(payload)
      await fetchInstances()
      showNotification(`Instance "${payload.name}" created successfully.`)
    }
  }

  const handleDeleteInstance = (instanceId: string) => {
    const target = instances.find((inst) => inst.id === instanceId)
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Instance',
      message: `Are you sure you want to delete "${target?.name || 'this instance'}"? All files, mods, and local worlds will be permanently removed.`,
      confirmLabel: 'Delete Instance',
      variant: 'danger',
      onConfirm: async () => {
        closeConfirmDialog()
        if (window.launcherAPI?.instances) {
          await window.launcherAPI.instances.delete(instanceId)
          await fetchInstances()
          showNotification('Instance deleted.')
        }
      }
    })
  }

  const handleOpenFolder = async (instanceId: string) => {
    if (window.launcherAPI?.instances) {
      await window.launcherAPI.instances.openFolder(instanceId)
    }
  }

  const handlePlayInstance = async (instance: InstanceConfiguration) => {
    if (!window.launcherAPI?.launch) return

    try {
      setActiveLaunchingInstance(instance)
      setActiveTab('logs')
      setLaunchLogs([])
      setLaunchProgress({
        instanceId: instance.id,
        step: 'FETCHING_METADATA',
        statusText: 'Preparing to launch...'
      })

      await window.launcherAPI.launch.start(instance.id)
    } catch (launchError) {
      const message = launchError instanceof Error ? launchError.message : 'Launch failed'
      showNotification(message)
      setLaunchProgress({
        instanceId: instance.id,
        step: 'CRASHED',
        statusText: message
      })
    }
  }

  const handleQuickPlay = async (target: QuickPlayTarget) => {
    const instance = instances.find((i) => i.id === target.instanceId)
    if (!instance) {
      showNotification(`Associated instance "${target.instanceName}" not found.`)
      return
    }

    if (!window.launcherAPI?.launch) return

    const options: QuickPlayLaunchOptions =
      target.type === 'server'
        ? { type: 'server', host: target.ip, port: target.port }
        : { type: 'world', worldFolder: target.folderName }

    setActiveLaunchingInstance(instance)
    setLaunchLogs([])
    setActiveTab('logs')

    try {
      await window.launcherAPI.launch.quickPlay(instance.id, options)
    } catch (launchError) {
      const message = launchError instanceof Error ? launchError.message : 'Quick play launch failed'
      showNotification(message)
      setLaunchProgress({
        instanceId: instance.id,
        step: 'CRASHED',
        statusText: message
      })
    }
  }

  const handleStopGame = async () => {
    if (activeLaunchingInstance && window.launcherAPI?.launch) {
      await window.launcherAPI.launch.stop(activeLaunchingInstance.id)
      showNotification('Stopping game process...')
    }
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
      const state = await window.launcherAPI.auth.switchAccount(accountId)
      await fetchAuthState()
      if (state?.activeAccount) {
        showNotification(`Switched to ${state.activeAccount.username}`)
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
          onSelectTab={(tab) => {
            if (tab === 'instances') {
              setSelectedDetailInstance(null)
            }
            setActiveTab(tab)
          }}
          onOpenCreateModal={() => setIsCreateModalOpen(true)}
          onOpenAccountModal={() => setIsAccountModalOpen(true)}
          activeAccount={authState.activeAccount}
          instanceCount={instances.length}
          isProcessRunning={launchProgress?.step === 'RUNNING'}
        />

        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-background-dark/50">
          <div className="w-full max-w-[1600px] min-h-full mx-auto pb-16 flex flex-col">
            {activeTab === 'dashboard' && (
              <DashboardPage
                instances={instances}
                systemEnv={systemEnv}
                onPlay={handlePlayInstance}
                onQuickPlay={handleQuickPlay}
                onOpenFolder={handleOpenFolder}
                onDelete={handleDeleteInstance}
                onCreateClick={() => setIsCreateModalOpen(true)}
                onManage={(inst) => {
                  setSelectedDetailInstance(inst)
                  setActiveTab('instances')
                }}
                onRefreshInstances={fetchInstances}
                onToggleFavorite={handleToggleFavorite}
              />
            )}

            {activeTab === 'instances' && (
              selectedDetailInstance ? (
                <InstanceDetailPage
                  instance={selectedDetailInstance}
                  onBack={() => setSelectedDetailInstance(null)}
                  onLaunch={handlePlayInstance}
                  onQuickPlay={handleQuickPlay}
                  onOpenFolder={handleOpenFolder}
                  onBrowseMods={(inst) => {
                    setModBrowserTargetInstanceId(inst.id)
                    setModBrowserInitialType('mod')
                    setActiveTab('mods')
                  }}
                  onBrowseResourcePacks={(inst) => {
                    setModBrowserTargetInstanceId(inst.id)
                    setModBrowserInitialType('resourcepack')
                    setActiveTab('mods')
                  }}
                  onInstanceUpdated={(updated) => {
                    setSelectedDetailInstance(updated)
                    setInstances((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
                  }}
                  onNotification={showNotification}
                />
              ) : (
                <InstancesPage
                  instances={instances}
                  onPlay={handlePlayInstance}
                  onOpenFolder={handleOpenFolder}
                  onDelete={handleDeleteInstance}
                  onCreateClick={() => setIsCreateModalOpen(true)}
                  onImportClick={() => setIsImportModpackModalOpen(true)}
                  onCloneLauncherClick={() => setIsImportLauncherModalOpen(true)}
                  onManage={(inst) => setSelectedDetailInstance(inst)}
                  onRefreshInstances={fetchInstances}
                  onToggleFavorite={handleToggleFavorite}
                />
              )
            )}


            {activeTab === 'mods' && (
              <ModBrowserPage
                instances={instances}
                onOpenFolder={handleOpenFolder}
                onNotification={showNotification}
                initialInstanceId={modBrowserTargetInstanceId}
                initialProjectType={modBrowserInitialType}
                onInstanceCreated={(newInstance) => {
                  fetchInstances()
                  setSelectedDetailInstance(newInstance)
                  setActiveTab('instances')
                }}
              />
            )}

            {activeTab === 'skins' && <SkinSelectorPage onNotification={showNotification} />}

            {activeTab === 'logs' && (
              <LogsPage
                instanceName={activeLaunchingInstance?.name}
                progress={launchProgress}
                logs={launchLogs}
                onClearLogs={() => setLaunchLogs([])}
                onStopGame={handleStopGame}
                isGameRunning={launchProgress?.step === 'RUNNING'}
              />
            )}

            {activeTab === 'settings' && <SettingsPage systemEnv={systemEnv} />}
          </div>
        </main>
      </div>

      <CreateInstanceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateInstance}
      />

      <ImportModpackModal
        isOpen={isImportModpackModalOpen}
        onClose={() => setIsImportModpackModalOpen(false)}
        onSuccess={(newInstance) => {
          fetchInstances()
          showNotification(`Successfully imported ${newInstance.name}!`)
          setSelectedDetailInstance(newInstance)
          setActiveTab('instances')
        }}
      />

      <ImportFromLauncherModal
        isOpen={isImportLauncherModalOpen}
        onClose={() => setIsImportLauncherModalOpen(false)}
        onSuccess={(newInstance) => {
          fetchInstances()
          showNotification(`Successfully cloned ${newInstance.name}!`)
          setSelectedDetailInstance(newInstance)
          setActiveTab('instances')
        }}
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

      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirmDialog}
      />

      <ToastNotification
        id={activeNotification?.id}
        message={activeNotification?.message ?? null}
        durationMs={5000}
        onClose={handleCloseNotification}
      />

      <UpdateReadyModal
        isOpen={Boolean(downloadedUpdate)}
        info={downloadedUpdate}
        onClose={() => setDownloadedUpdate(null)}
        onRestart={() => window.launcherAPI?.updater?.quitAndInstall()}
      />
    </div>
  )
}

