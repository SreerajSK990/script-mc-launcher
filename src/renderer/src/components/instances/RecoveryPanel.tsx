import React, { useCallback, useEffect, useState } from 'react'
import type { BackupEntry, RecoverySettings } from '@shared/types/operations'
import { Button } from '@renderer/components/common/Button'
import { ConfirmModal } from '@renderer/components/common/ConfirmModal'
import { unwrapResult } from '@renderer/components/mods/DependencyInstallHost'

export const RecoveryPanel: React.FC<{ instanceId: string }> = ({ instanceId }) => {
  const [entries, setEntries] = useState<BackupEntry[]>([])
  const [settings, setSettings] = useState<RecoverySettings>({ keepBackups: 5, backupAfterPlay: false })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [restore, setRestore] = useState<BackupEntry | null>(null)
  const refresh = useCallback(async () => {
    const [history, preferences] = await Promise.all([
      window.launcherAPI.content.listBackups(instanceId),
      window.launcherAPI.content.getRecoverySettings(instanceId)
    ])
    setEntries(unwrapResult(history))
    setSettings(unwrapResult(preferences))
  }, [instanceId])
  useEffect(() => {
    refresh().catch((error) => setMessage(String(error)))
  }, [refresh])
  const perform = async (work: () => Promise<void>, success: string) => {
    setBusy(true)
    setMessage('')
    try {
      await work()
      await refresh()
      setMessage(success)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-5 text-sm text-slate-300">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-white">Backups and recovery</h3>
          <p>Restore world saves or a previous mod setup while Minecraft is closed.</p>
        </div>
        <Button
          disabled={busy}
          onClick={() =>
            perform(async () => {
              unwrapResult(await window.launcherAPI.content.backupSaves(instanceId))
            }, 'World saves backed up')
          }
        >
          Back up saves
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border-subtle p-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.backupAfterPlay}
            onChange={(event) => setSettings({ ...settings, backupAfterPlay: event.target.checked })}
          />
          Back up saves after a clean game exit
        </label>
        <label>
          Keep{' '}
          <input
            className="w-16 rounded bg-background-darkest p-2"
            type="number"
            min={1}
            max={50}
            value={settings.keepBackups}
            onChange={(event) => setSettings({ ...settings, keepBackups: Number(event.target.value) })}
          />{' '}
          backups of each kind
        </label>
        <Button
          disabled={busy}
          onClick={() =>
            perform(async () => {
              unwrapResult(await window.launcherAPI.content.saveRecoverySettings(instanceId, settings))
            }, 'Backup settings saved; older backups pruned')
          }
        >
          Save settings
        </Button>
      </div>
      <p className="text-xs text-slate-400">
        Saving a lower retention limit removes older recovery backups. Existing version-upgrade ZIP backups
        are kept. Mod backups include JAR files, disabled states, and managed metadata; they do not include
        worlds or configuration files.
      </p>
      {message && (
        <p role="status" className="rounded-lg bg-white/5 p-3">
          {message}
        </p>
      )}
      {!entries.length && <p>No recovery backups yet. Mod installation creates them automatically.</p>}
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle p-4"
        >
          <div>
            <p className="font-semibold text-white">{entry.label}</p>
            <p className="text-xs text-slate-400">
              {entry.kind === 'mods' ? 'Mod setup' : 'World saves'} ·{' '}
              {new Date(entry.createdAt).toLocaleString()} · {(entry.sizeBytes / 1048576).toFixed(1)} MB
            </p>
          </div>
          <Button variant="ghost" disabled={busy} onClick={() => setRestore(entry)}>
            Restore
          </Button>
        </div>
      ))}
      <ConfirmModal
        isOpen={Boolean(restore)}
        title="Restore backup?"
        message={`Restore ${restore?.label || 'this backup'}? The current ${restore?.kind === 'mods' ? 'mod setup' : 'world saves'} will be backed up first, then replaced.`}
        confirmLabel="Restore"
        variant="warning"
        onCancel={() => setRestore(null)}
        onConfirm={() => {
          const selected = restore
          setRestore(null)
          if (selected)
            void perform(async () => {
              unwrapResult(await window.launcherAPI.content.restoreBackup(instanceId, selected.id))
            }, 'Backup restored')
        }}
      />
    </section>
  )
}
