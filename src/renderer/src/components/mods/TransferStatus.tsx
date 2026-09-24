import React, { useEffect, useState } from 'react'
import type { TransferProgress } from '@shared/types/operations'
import { Button } from '@renderer/components/common/Button'

export const TransferStatus: React.FC = () => {
  const [transfers, setTransfers] = useState<Record<string, TransferProgress>>({})
  useEffect(
    () =>
      window.launcherAPI.content.onTransfer((progress) =>
        setTransfers((previous) => {
          const next = { ...previous }
          if (progress.completed) delete next[progress.instanceId]
          else next[progress.instanceId] = progress
          return next
        })
      ),
    []
  )
  return (
    <div className="fixed bottom-4 right-4 z-[70] space-y-2">
      {Object.values(transfers).map((progress) => (
        <div
          key={progress.instanceId}
          className="rounded-xl border border-border-subtle bg-background-darkest p-4 shadow-xl text-xs text-slate-300 flex items-center gap-4"
        >
          <div>
            <p>Installing content</p>
            <p>
              {(progress.transferred / 1048576).toFixed(1)}
              {progress.total ? ` / ${(progress.total / 1048576).toFixed(1)}` : ''} MB ·{' '}
              {(progress.bytesPerSecond / 1048576).toFixed(1)} MB/s
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => window.launcherAPI.content.cancelTransfer(progress.instanceId)}
          >
            Cancel
          </Button>
        </div>
      ))}
    </div>
  )
}
