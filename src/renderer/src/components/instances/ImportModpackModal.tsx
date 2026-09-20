import React, { useState, useEffect } from 'react'
import {
  X,
  Upload,
  FolderOpen,
  Package,
  Layers,
  Check,
  AlertCircle,
  Loader2,
  FileArchive,
  Download
} from 'lucide-react'
import type { ModpackManifestInfo, ModpackImportProgressEvent } from '@shared/types/modpack'
import type { InstanceConfiguration } from '@shared/types/instance'
import { Button } from '@renderer/components/common/Button'

interface ImportModpackModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (instance: InstanceConfiguration) => void
}

export const ImportModpackModal: React.FC<ImportModpackModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [manifest, setManifest] = useState<ModpackManifestInfo | null>(null)
  const [instanceName, setInstanceName] = useState<string>('')
  const [isInspecting, setIsInspecting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState<ModpackImportProgressEvent | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setFilePath(null)
      setManifest(null)
      setInstanceName('')
      setIsInspecting(false)
      setIsImporting(false)
      setProgress(null)
      setErrorMessage(null)
      return
    }

    if (!window.launcherAPI?.modpacks) return

    const unsub = window.launcherAPI.modpacks.onProgress((event) => {
      setProgress(event)
    })

    return () => {
      unsub()
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSelectFile = async () => {
    setErrorMessage(null)
    try {
      const selected = await window.launcherAPI.modpacks.selectFile()
      if (!selected) return

      setFilePath(selected)
      setIsInspecting(true)

      const info = await window.launcherAPI.modpacks.inspect(selected)
      setManifest(info)
      setInstanceName(info.name)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to inspect modpack archive')
    } finally {
      setIsInspecting(false)
    }
  }

  const handleStartImport = async () => {
    if (!filePath || !manifest) return

    setErrorMessage(null)
    setIsImporting(true)

    try {
      const instance = await window.launcherAPI.modpacks.import(filePath, instanceName.trim())
      onSuccess(instance)
      onClose()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to import modpack')
      setIsImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background-card border border-border-subtle rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-subtle bg-background-surface/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Upload size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Import Modpack</h3>
              <p className="text-xs text-slate-400">
                Install a local .mrpack (Modrinth) or .zip (CurseForge) archive
              </p>
            </div>
          </div>

          {!isImporting && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* File Picker Section */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Modpack Archive
            </label>
            <div className="flex gap-2">
              <div className="flex-1 bg-background-surface border border-border-subtle rounded-xl px-3.5 py-2.5 text-xs text-slate-300 truncate font-mono">
                {filePath ? filePath : 'No file selected (.mrpack or .zip)'}
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={FolderOpen}
                onClick={handleSelectFile}
                disabled={isImporting || isInspecting}
              >
                Browse...
              </Button>
            </div>
          </div>

          {isInspecting && (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-sm">
              <Loader2 size={18} className="animate-spin text-primary" />
              <span>Reading modpack contents...</span>
            </div>
          )}

          {/* Manifest Preview */}
          {manifest && !isInspecting && (
            <div className="bg-background-surface border border-border-subtle rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-border-subtle/60 pb-3">
                <div className="flex items-center gap-2">
                  <FileArchive size={16} className="text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Detected Format
                  </span>
                </div>
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-border-subtle capitalize">
                  {manifest.format}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Instance Name
                </label>
                <input
                  type="text"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  disabled={isImporting}
                  placeholder="Enter instance name"
                  className="w-full bg-background-card border border-border-subtle focus:border-primary/60 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-background-card p-3 rounded-lg border border-border-subtle/60">
                  <span className="text-slate-500 block text-[11px] mb-1">Game Version</span>
                  <span className="font-semibold text-slate-200">
                    Minecraft {manifest.minecraftVersion}
                  </span>
                </div>

                <div className="bg-background-card p-3 rounded-lg border border-border-subtle/60">
                  <span className="text-slate-500 block text-[11px] mb-1">Mod Loader</span>
                  <span className="font-semibold text-slate-200 capitalize">
                    {manifest.loaderType} {manifest.loaderVersion ? `(${manifest.loaderVersion})` : ''}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <span>Total Mod Files</span>
                <span className="font-semibold text-slate-200">{manifest.fileCount} files</span>
              </div>

              {manifest.summary && (
                <p className="text-xs text-slate-400 line-clamp-2 pt-1 border-t border-border-subtle/40">
                  {manifest.summary}
                </p>
              )}
            </div>
          )}

          {/* Progress Bar */}
          {isImporting && progress && (
            <div className="bg-background-surface border border-border-subtle rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 capitalize flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin text-primary" />
                  {progress.step}
                </span>
                <span className="text-primary font-mono">{progress.percentage}%</span>
              </div>

              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>

              <p className="text-xs text-slate-400 truncate font-mono">{progress.message}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border-subtle bg-background-surface/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isImporting}
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={isImporting ? Loader2 : Download}
            onClick={handleStartImport}
            disabled={!manifest || isImporting || !instanceName.trim()}
          >
            {isImporting ? 'Importing Modpack...' : 'Import Modpack'}
          </Button>
        </div>
      </div>
    </div>
  )
}
