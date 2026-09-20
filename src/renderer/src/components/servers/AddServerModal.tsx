import React, { useState, useEffect } from 'react'
import { Server, Wifi, WifiOff, Loader2, Check, AlertCircle } from 'lucide-react'
import { Modal } from '@renderer/components/common/Modal'
import { Button } from '@renderer/components/common/Button'
import type { ServerPingStatus } from '@shared/types/servers'

interface AddServerModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string, ip: string) => Promise<void>
  initialData?: { name: string; ip: string } | null
  instanceName: string
}

export const AddServerModal: React.FC<AddServerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  instanceName
}) => {
  const [name, setName] = useState('')
  const [ip, setIp] = useState('')
  const [pingResult, setPingResult] = useState<ServerPingStatus | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name)
        setIp(initialData.ip)
      } else {
        setName('')
        setIp('')
      }
      setPingResult(null)
      setError(null)
      setIsTesting(false)
      setIsSaving(false)
    }
  }, [isOpen, initialData])

  const handleTestConnection = async () => {
    const target = ip.trim()
    if (!target) {
      setError('Please enter a server address')
      return
    }
    setError(null)
    setIsTesting(true)
    setPingResult(null)

    let host = target
    let port = 25565
    if (target.includes(':')) {
      const parts = target.split(':')
      host = parts[0]
      port = parseInt(parts[1], 10) || 25565
    }

    try {
      if (window.launcherAPI?.servers) {
        const res = await window.launcherAPI.servers.ping(host, port)
        setPingResult(res)
      }
    } catch {
      setPingResult({ online: false, latencyMs: -1 })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedIp = ip.trim()
    const trimmedName = name.trim() || trimmedIp
    if (!trimmedIp) {
      setError('Server address is required')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await onSave(trimmedName, trimmedIp)
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to save server')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Server' : 'Add Multiplayer Server'}
      description={`Add a multiplayer server directly to ${instanceName}'s servers list`}
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Server Name
          </label>
          <div className="relative">
            <Server size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="e.g. Hypixel Network"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background-darkest rounded-xl text-sm text-slate-100 placeholder-slate-500 border border-border-subtle focus:border-primary focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Server Address
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. mc.hypixel.net or play.example.com:25565"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-background-darkest rounded-xl text-sm text-slate-100 placeholder-slate-500 border border-border-subtle focus:border-primary focus:outline-none font-mono transition-colors"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={isTesting ? Loader2 : Wifi}
              onClick={handleTestConnection}
              disabled={isTesting || !ip.trim()}
            >
              {isTesting ? 'Pinging...' : 'Test Ping'}
            </Button>
          </div>
        </div>

        {pingResult && (
          <div
            className={`p-3 rounded-xl border flex flex-col gap-1 text-xs transition-all ${
              pingResult.online
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
            }`}
          >
            <div className="flex items-center justify-between font-semibold">
              <div className="flex items-center gap-1.5">
                {pingResult.online ? <Wifi size={14} /> : <WifiOff size={14} />}
                <span>{pingResult.online ? 'Server is Online' : 'Server is Offline / Unreachable'}</span>
              </div>
              {pingResult.online && (
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                  {pingResult.latencyMs} ms
                </span>
              )}
            </div>

            {pingResult.online && (
              <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono pt-1">
                <span>{pingResult.versionName || 'Minecraft Server'}</span>
                {pingResult.players && (
                  <span>
                    {pingResult.players.online.toLocaleString()} / {pingResult.players.max.toLocaleString()} players
                  </span>
                )}
              </div>
            )}

            {pingResult.cleanMotd && (
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 italic">
                {pingResult.cleanMotd}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            icon={isSaving ? Loader2 : Check}
            disabled={isSaving || !ip.trim()}
          >
            {isSaving ? 'Saving...' : initialData ? 'Save Changes' : 'Add Server'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
