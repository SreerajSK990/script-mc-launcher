import React, { useEffect, useState } from 'react'
import type { DependencyPlan, OperationResult } from '@shared/types/operations'
import type { InstallModPayload } from '@shared/types/mods'
import { Modal } from '@renderer/components/common/Modal'
import { Button } from '@renderer/components/common/Button'

export function unwrapResult<T>(result: OperationResult<T>): T {
  if (!result.success) throw new Error(result.error)
  return result.data
}

interface Request {
  plan: DependencyPlan
  resolve: (approved: boolean) => void
}

let showRequest: ((request: Request) => void) | undefined
let pending = false

export async function previewModInstallation(payloads: InstallModPayload[]): Promise<boolean> {
  if (pending) throw new Error('Another installation preview is open')
  pending = true
  try {
    const plan = unwrapResult(await window.launcherAPI.content.planMods(payloads))
    if (!showRequest) throw new Error('Installation preview is unavailable')
    return await new Promise<boolean>((resolve) => showRequest?.({ plan, resolve }))
  } finally {
    pending = false
  }
}

export async function installModWithPreview(payload: InstallModPayload) {
  if (!(await previewModInstallation([payload]))) throw new Error('Installation cancelled')
  return window.launcherAPI.mods.install(payload)
}

export const DependencyInstallHost: React.FC = () => {
  const [request, setRequest] = useState<Request | null>(null)
  useEffect(() => {
    showRequest = setRequest
    return () => {
      showRequest = undefined
    }
  }, [])
  const finish = (approved: boolean) => {
    request?.resolve(approved)
    setRequest(null)
  }
  return (
    <Modal isOpen={Boolean(request)} onClose={() => finish(false)} title="Review mod installation">
      <div className="space-y-4 text-sm text-slate-300">
        <p>
          These mods and required dependencies will be installed together. A recoverable mod backup is created
          before files change.
        </p>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {request?.plan.items.map((item) => (
            <div
              key={`${item.modMetadata.source}:${item.versionFile.projectId}`}
              className="flex justify-between gap-4 rounded-lg bg-white/5 p-3 break-words"
            >
              <span className="min-w-0">{item.modMetadata.name}</span>
              <span className="min-w-0 text-right">{item.versionFile.versionNumber}</span>
            </div>
          ))}
        </div>
        {Boolean(request?.plan.reused.length) && (
          <p>{request?.plan.reused.length} compatible installed dependencies will be reused.</p>
        )}
        {request?.plan.warnings.map((warning) => (
          <p key={warning} className="text-amber-300">
            {warning}
          </p>
        ))}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => finish(false)}>
            Cancel
          </Button>
          <Button onClick={() => finish(true)}>Install all</Button>
        </div>
      </div>
    </Modal>
  )
}
