import React from 'react'
import type { ModUpdateResult } from '@shared/types/operations'
import { Button } from '@renderer/components/common/Button'

export const UpdateReport: React.FC<{ result: ModUpdateResult; busy: boolean; onRetry: () => void }> = ({
  result,
  busy,
  onRetry
}) => (
  <div role="status" className="rounded-xl border border-border-subtle p-4 space-y-2 text-sm text-slate-300">
    <p>
      {result.updatedCount} updated · {result.failures.length} failed
    </p>
    {result.error && <p className="text-amber-300">{result.error}</p>}
    {result.failures.map((failure) => (
      <p key={`${failure.source}:${failure.modId}`} className="text-amber-300">
        {failure.name}: {failure.error}
      </p>
    ))}
    {result.failures.length > 0 && (
      <Button disabled={busy} onClick={onRetry}>
        Retry failed
      </Button>
    )}
  </div>
)
