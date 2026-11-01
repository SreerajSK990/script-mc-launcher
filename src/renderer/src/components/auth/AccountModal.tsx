import React, { useEffect, useRef, useState } from 'react'
import { UserPlus, Plus, ShieldCheck, User, KeyRound, Copy } from 'lucide-react'
import type { AuthState, DeviceCodeInfo } from '@shared/types/auth'
import { Modal } from '@renderer/components/common/Modal'
import { Button } from '@renderer/components/common/Button'
import { AccountCard } from '@renderer/components/auth/AccountCard'

interface AccountModalProps {
  isOpen: boolean
  onClose: () => void
  authState: AuthState
  onLoginMicrosoft: () => Promise<void>
  onLoginOffline: (username: string) => Promise<void>
  onSwitchAccount: (accountId: string) => Promise<void>
  onLogout: (accountId: string) => Promise<void>
  onAccountsChanged?: () => Promise<void>
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  authState,
  onLoginMicrosoft,
  onLoginOffline,
  onSwitchAccount,
  onLogout,
  onAccountsChanged
}) => {
  const [deviceCode, setDeviceCode] = useState<DeviceCodeInfo | null>(null)
  const [isDeviceCodeLoading, setIsDeviceCodeLoading] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = () => {
    if (pollTimer.current) clearTimeout(pollTimer.current)
    pollTimer.current = null
  }

  useEffect(() => {
    if (!isOpen) {
      stopPolling()
      setDeviceCode(null)
    }
    return stopPolling
  }, [isOpen])

  const handleDeviceCodeLogin = async () => {
    try {
      setIsDeviceCodeLoading(true)
      setErrorMessage(null)
      const info = await window.launcherAPI.auth.startDeviceCode()
      setDeviceCode(info)
      const deadline = Date.now() + info.expiresIn * 1000
      const poll = async () => {
        try {
          const account = await window.launcherAPI.auth.pollDeviceCode(info.deviceCode)
          if (account) {
            stopPolling()
            setDeviceCode(null)
            await onAccountsChanged?.()
            return
          }
          if (Date.now() < deadline) {
            pollTimer.current = setTimeout(poll, Math.max(info.interval, 5) * 1000)
          } else {
            setDeviceCode(null)
            setErrorMessage('The sign-in code expired. Request a new one and try again.')
          }
        } catch (error) {
          stopPolling()
          setDeviceCode(null)
          setErrorMessage(error instanceof Error ? error.message : 'Code sign-in failed.')
        }
      }
      pollTimer.current = setTimeout(poll, Math.max(info.interval, 5) * 1000)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not request a sign-in code.')
    } finally {
      setIsDeviceCodeLoading(false)
    }
  }

  const [offlineName, setOfflineName] = useState('')
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false)
  const [isOfflineLoading, setIsOfflineLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleMicrosoftLogin = async () => {
    try {
      setIsMicrosoftLoading(true)
      setErrorMessage(null)
      await onLoginMicrosoft()
    } catch (error) {
      const message = typeof error === 'string' ? error : error instanceof Error ? error.message : 'Microsoft login failed.'
      setErrorMessage(message)
    } finally {
      setIsMicrosoftLoading(false)
    }
  }

  const handleOfflineSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!offlineName.trim()) {
      setErrorMessage('Please enter a valid player name.')
      return
    }

    try {
      setIsOfflineLoading(true)
      setErrorMessage(null)
      await onLoginOffline(offlineName.trim())
      setOfflineName('')
    } catch (error) {
      const message = typeof error === 'string' ? error : error instanceof Error ? error.message : 'Failed to add offline player.'
      setErrorMessage(message)
    } finally {
      setIsOfflineLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Minecraft Accounts"
      description="Manage your Microsoft accounts or create local offline profiles for development."
      maxWidthClass="max-w-lg"
    >
      <div className="flex flex-col gap-6">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            {errorMessage}
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Stored Accounts ({authState.accounts.length})
          </h3>

          {authState.accounts.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-border-subtle rounded-xl bg-background-darkest/40">
              <User size={28} className="mx-auto text-slate-500 mb-2" />
              <p className="text-xs text-slate-400">
                No accounts connected yet. Add a Microsoft account or create an offline profile below.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-60 overflow-y-auto pr-1">
              {authState.accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  isActive={account.id === authState.activeAccount?.id}
                  onSelect={onSwitchAccount}
                  onRemove={onLogout}
                />
              ))}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-border-subtle flex flex-col gap-4">
          <Button
            variant="primary"
            size="md"
            icon={ShieldCheck}
            isLoading={isMicrosoftLoading}
            onClick={handleMicrosoftLogin}
            className="w-full justify-center"
          >
            Sign in with Microsoft
          </Button>

          {deviceCode ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2 text-xs text-slate-300">
              <p>
                Open{' '}
                <button
                  type="button"
                  className="text-emerald-300 underline"
                  onClick={() => void window.launcherAPI.system.openExternalUrl(deviceCode.verificationUri)}
                >
                  {deviceCode.verificationUri}
                </button>{' '}
                in any browser and enter this code:
              </p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xl tracking-[0.3em] text-white">{deviceCode.userCode}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Copy}
                  onClick={() => void navigator.clipboard.writeText(deviceCode.userCode)}
                >
                  Copy
                </Button>
              </div>
              <p className="text-slate-400">Waiting for you to finish signing in. This window updates automatically.</p>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="md"
              icon={KeyRound}
              isLoading={isDeviceCodeLoading}
              onClick={handleDeviceCodeLogin}
              className="w-full justify-center"
            >
              Sign in with a code instead
            </Button>
          )}

          <form onSubmit={handleOfflineSubmit} className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">Or create a local dev player:</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Offline player name (e.g. Steve)"
                value={offlineName}
                onChange={(e) => setOfflineName(e.target.value)}
                className="flex-1 px-3.5 py-2 rounded-xl bg-background-darkest border border-border-subtle text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                icon={Plus}
                isLoading={isOfflineLoading}
              >
                Add Player
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  )
}
