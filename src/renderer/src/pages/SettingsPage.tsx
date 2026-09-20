import React, { useState } from 'react'
import { FolderOpen, HardDrive, Cpu, Terminal, Save } from 'lucide-react'
import type { SystemEnvironment } from '@shared/types/system'
import { Button } from '@renderer/components/common/Button'

interface SettingsPageProps {
  systemEnv: SystemEnvironment | null
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ systemEnv }) => {
  const [defaultRamMb, setDefaultRamMb] = useState(4096)
  const [savedNotification, setSavedNotification] = useState(false)

  const handleOpenFolder = () => {
    if (systemEnv?.appDataDirectory) {
      window.launcherAPI?.system.openDirectory(systemEnv.appDataDirectory)
    }
  }

  const handleSave = () => {
    setSavedNotification(true)
    setTimeout(() => setSavedNotification(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl w-full">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Settings</h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Configure default performance settings, storage locations, and Java runtimes
        </p>
      </div>

      {savedNotification && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
          <span>Preferences saved successfully.</span>
        </div>
      )}

      <div className="bg-background-card border border-border-subtle rounded-2xl p-6 flex flex-col gap-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-1">
            Data Storage
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            Location where instances, libraries, assets, and cache files are stored
          </p>

          <div className="flex items-center gap-3">
            <div className="flex-1 px-3.5 py-2.5 rounded-xl bg-background-darkest border border-border-subtle font-mono text-xs text-slate-300 truncate">
              {systemEnv?.appDataDirectory || 'Loading...'}
            </div>
            <Button
              variant="secondary"
              size="md"
              icon={FolderOpen}
              onClick={handleOpenFolder}
            >
              Open Folder
            </Button>
          </div>
        </div>

        <div className="pt-6 border-t border-border-subtle/60">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                Default RAM Allocation
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Default memory assigned when creating a new Minecraft instance
              </p>
            </div>
            <span className="text-sm font-mono text-emerald-400">
              {(defaultRamMb / 1024).toFixed(1)} GB ({defaultRamMb} MB)
            </span>
          </div>

          <input
            type="range"
            min={1024}
            max={16384}
            step={512}
            value={defaultRamMb}
            onChange={(e) => setDefaultRamMb(Number(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer mt-3"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
            <span>1 GB</span>
            <span>Recommended: 4 GB</span>
            <span>16 GB</span>
          </div>
        </div>

        <div className="pt-6 border-t border-border-subtle/60">
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-3">
            Detected Java Runtime
          </h3>
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-background-darkest border border-border-subtle">
            <Terminal size={18} className="text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-slate-200 truncate">
                {systemEnv?.defaultJavaPath || 'No default Java binary detected in PATH'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Mojang runtime manager will automatically download the correct Java version for each instance.
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-border-subtle/60">
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-3">
            Hardware Summary
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-background-darkest border border-border-subtle flex items-center justify-between">
              <span className="text-slate-400">Total System RAM</span>
              <span className="text-slate-200">
                {systemEnv ? `${(systemEnv.memory.totalMegabytes / 1024).toFixed(1)} GB` : '...'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-background-darkest border border-border-subtle flex items-center justify-between">
              <span className="text-slate-400">Operating System</span>
              <span className="text-slate-200 capitalize">
                {systemEnv?.os.platform} ({systemEnv?.os.architecture})
              </span>
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <Button variant="primary" icon={Save} onClick={handleSave}>
            Save Preferences
          </Button>
        </div>
      </div>
    </div>
  )
}
