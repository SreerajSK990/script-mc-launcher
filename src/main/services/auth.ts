import { createHash } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { AuthState, StoredAccount } from '@shared/types/auth'
import { loadStoredAccounts, saveStoredAccounts } from '@main/core/auth/storage'
import { captureMicrosoftAuthorizationCode } from '@main/core/auth/oauth-window'
import {
  exchangeAuthorizationCode,
  refreshMicrosoftToken,
  authenticateXboxLive,
  authorizeXsts,
  loginWithMinecraftServices,
  fetchMinecraftProfile
} from '@main/core/auth/tokens'

let cachedAuthState: AuthState = {
  activeAccount: null,
  accounts: []
}

function generateOfflinePlayerUuid(playerName: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${playerName}`).digest('hex')
  const formattedUuid = [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `3${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join('-')
  return formattedUuid
}

let authenticationInitializationPromise: Promise<AuthState> | null = null

export async function initializeAuthenticationState(): Promise<AuthState> {
  if (authenticationInitializationPromise) {
    return await authenticationInitializationPromise
  }

  authenticationInitializationPromise = (async () => {
    const { activeAccountId, accounts } = await loadStoredAccounts()
    const refreshedAccounts: StoredAccount[] = []
    let hasTokensBeenRefreshed = false

    for (const account of accounts) {
      if (account.accountType === 'microsoft' && account.refreshToken) {
        const isExpired = Date.now() >= account.expiresAt - 5 * 60 * 1000
        if (isExpired) {
          try {
            const msTokens = await refreshMicrosoftToken(account.refreshToken)
            const xbl = await authenticateXboxLive(msTokens.access_token)
            const xsts = await authorizeXsts(xbl.token)
            const mcAuth = await loginWithMinecraftServices(xsts.userHash, xsts.token)
            const profile = await fetchMinecraftProfile(mcAuth.accessToken)

            refreshedAccounts.push({
              ...account,
              username: profile.username,
              accessToken: mcAuth.accessToken,
              refreshToken: msTokens.refresh_token || account.refreshToken,
              expiresAt: Date.now() + mcAuth.expiresIn * 1000,
              skinUrl: profile.skins.find((s) => s.state === 'ACTIVE')?.url
            })
            hasTokensBeenRefreshed = true
            continue
          } catch (refreshError) {
            console.error(`Silent refresh failed for account ${account.username}:`, refreshError)
          }
        }
      }

      refreshedAccounts.push(account)
    }

    const activeAccount =
      refreshedAccounts.find((acc) => acc.id === activeAccountId) || refreshedAccounts[0] || null

    cachedAuthState = {
      activeAccount,
      accounts: refreshedAccounts
    }

    if (hasTokensBeenRefreshed) {
      await saveStoredAccounts(activeAccount?.id || null, refreshedAccounts)
    }

    return cachedAuthState
  })()

  try {
    return await authenticationInitializationPromise
  } finally {
    authenticationInitializationPromise = null
  }
}

export async function getCurrentAuthState(): Promise<AuthState> {
  if (cachedAuthState.accounts.length === 0 && !authenticationInitializationPromise) {
    return await initializeAuthenticationState()
  }
  if (authenticationInitializationPromise) {
    return await authenticationInitializationPromise
  }
  return cachedAuthState
}

export async function loginWithMicrosoftAccount(parentWindow?: BrowserWindow): Promise<StoredAccount> {
  const code = await captureMicrosoftAuthorizationCode(parentWindow)
  const msTokens = await exchangeAuthorizationCode(code)
  const xbl = await authenticateXboxLive(msTokens.access_token)
  const xsts = await authorizeXsts(xbl.token)
  const mcAuth = await loginWithMinecraftServices(xsts.userHash, xsts.token)
  const profile = await fetchMinecraftProfile(mcAuth.accessToken)

  const activeSkin = profile.skins.find((s) => s.state === 'ACTIVE')

  const newAccount: StoredAccount = {
    id: profile.uuid,
    username: profile.username,
    uuid: profile.uuid,
    accountType: 'microsoft',
    accessToken: mcAuth.accessToken,
    refreshToken: msTokens.refresh_token || null,
    expiresAt: Date.now() + mcAuth.expiresIn * 1000,
    skinUrl: activeSkin?.url,
    createdAt: new Date().toISOString()
  }

  const updatedAccounts = cachedAuthState.accounts.filter((acc) => acc.id !== newAccount.id)
  updatedAccounts.unshift(newAccount)

  cachedAuthState = {
    activeAccount: newAccount,
    accounts: updatedAccounts
  }

  await saveStoredAccounts(newAccount.id, updatedAccounts)
  return newAccount
}

export async function loginWithOfflineAccount(username: string): Promise<StoredAccount> {
  const trimmedName = username.trim()
  if (!trimmedName) {
    throw new Error('Username cannot be empty.')
  }

  const uuid = generateOfflinePlayerUuid(trimmedName)
  const accountId = `offline-${trimmedName.toLowerCase()}`

  const offlineAccount: StoredAccount = {
    id: accountId,
    username: trimmedName,
    uuid,
    accountType: 'offline',
    accessToken: '0',
    refreshToken: null,
    expiresAt: Number.MAX_SAFE_INTEGER,
    skinUrl: undefined,
    createdAt: new Date().toISOString()
  }

  const updatedAccounts = cachedAuthState.accounts.filter((acc) => acc.id !== offlineAccount.id)
  updatedAccounts.unshift(offlineAccount)

  cachedAuthState = {
    activeAccount: offlineAccount,
    accounts: updatedAccounts
  }

  await saveStoredAccounts(offlineAccount.id, updatedAccounts)
  return offlineAccount
}

export async function switchActiveAccount(accountId: string): Promise<StoredAccount | null> {
  const target = cachedAuthState.accounts.find((acc) => acc.id === accountId) || null
  if (!target) {
    return null
  }

  cachedAuthState.activeAccount = target
  await saveStoredAccounts(target.id, cachedAuthState.accounts)
  return target
}

export async function logoutAccount(accountId: string): Promise<boolean> {
  const filteredAccounts = cachedAuthState.accounts.filter((acc) => acc.id !== accountId)
  const nextActive =
    cachedAuthState.activeAccount?.id === accountId
      ? filteredAccounts[0] || null
      : cachedAuthState.activeAccount

  cachedAuthState = {
    activeAccount: nextActive,
    accounts: filteredAccounts
  }

  await saveStoredAccounts(nextActive?.id || null, filteredAccounts)
  return true
}
