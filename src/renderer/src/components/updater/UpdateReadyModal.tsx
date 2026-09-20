import React from 'react'
import { Sparkles, RotateCcw, X, ArrowRight } from 'lucide-react'
import type { UpdateInfo } from '@shared/types/updater'
import { Modal } from '@renderer/components/common/Modal'
import { Button } from '@renderer/components/common/Button'

interface UpdateReadyModalProps {
  isOpen: boolean
  info: UpdateInfo | null
  onClose: () => void
  onRestart: () => void
}

export const UpdateReadyModal: React.FC<UpdateReadyModalProps> = ({
  isOpen,
  info,
  onClose,
  onRestart
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Update Ready to Install"
      description="A new version of Script Minecraft Launcher has been downloaded"
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4">
        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-start gap-3.5">
          <div className="p-2 rounded-xl bg-primary/20 text-primary shrink-0 mt-0.5">
            <Sparkles size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Version {info?.version || 'Update'}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">
                Ready
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              The update is downloaded and verified. Would you like to restart the launcher now to apply the changes?
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-400 bg-background-darkest border border-border-subtle p-3 rounded-xl">
          If you choose <span className="text-slate-200 font-semibold">Later</span>, the update will be kept safely in cache and applied automatically when you next open the launcher.
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Later
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={RotateCcw}
            onClick={onRestart}
            className="shadow-lg shadow-primary/25"
          >
            Restart Now
          </Button>
        </div>
      </div>
    </Modal>
  )
}
