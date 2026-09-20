import { join } from 'node:path'
import electron from 'electron'
import type { StoredAccount } from '@shared/types/auth'
import { getLauncherRootDirectory } from '@main/services/paths'
import { readJsonFile, writeJsonFileAtomic } from '@main/utils/filesystem'

interface SerializedAccountData {
  id: string
  username: string
  uuid: string
  accountType: 'microsoft' | 'offline'
  encryptedAccessToken: string
  encryptedRefreshToken: string | null
  expiresAt: number
  skinUrl?: string
  createdAt: string
}

interface EncryptedAuthDatabase {
  activeAccountId: string | null
  accounts: SerializedAccountData[]
}

function getAuthDatabasePath(): string {
  return join(getLauncherRootDirectory(), 'auth.json')
}

function getSafeStorageApi(): typeof import('electron').safeStorage | null {
  if (typeof electron === 'object' && electron !== null && 'safeStorage' in electron) {
    return (electron as { safeStorage: typeof import('electron').safeStorage }).safeStorage
  }
  return null
}

function isSystemEncryptionReady(): boolean {
  try {
    const storage = getSafeStorageApi()
    return Boolean(storage && storage.isEncryptionAvailable && storage.isEncryptionAvailable())
  } catch {
    return false
  }
}

function encryptSecret(plaintext: string): string {
  const storage = getSafeStorageApi()
  if (storage && isSystemEncryptionReady()) {
    const encryptedBuffer = storage.encryptString(plaintext)
    return `enc:${encryptedBuffer.toString('base64')}`
  }
  return `plain:${Buffer.from(plaintext, 'utf-8').toString('base64')}`
}

function decryptSecret(cipherText: string): string {
  const storage = getSafeStorageApi()
  if (cipherText.startsWith('enc:') && storage && isSystemEncryptionReady()) {
    const base64Data = cipherText.slice(4)
    const buffer = Buffer.from(base64Data, 'base64')
    return storage.decryptString(buffer)
  }

  if (cipherText.startsWith('plain:')) {
    const base64Data = cipherText.slice(6)
    return Buffer.from(base64Data, 'base64').toString('utf-8')
  }

  return cipherText
}

export async function loadStoredAccounts(): Promise<{ activeAccountId: string | null; accounts: StoredAccount[] }> {
  const filePath = getAuthDatabasePath()
  const data = await readJsonFile<EncryptedAuthDatabase>(filePath)

  if (!data || !Array.isArray(data.accounts)) {
    return { activeAccountId: null, accounts: [] }
  }

  const decryptedAccounts: StoredAccount[] = []

  for (const item of data.accounts) {
    try {
      const accessToken = decryptSecret(item.encryptedAccessToken)
      const refreshToken = item.encryptedRefreshToken ? decryptSecret(item.encryptedRefreshToken) : null

      decryptedAccounts.push({
        id: item.id,
        username: item.username,
        uuid: item.uuid,
        accountType: item.accountType,
        accessToken,
        refreshToken,
        expiresAt: item.expiresAt,
        skinUrl: item.skinUrl,
        createdAt: item.createdAt
      })
    } catch (decryptError) {
      console.error(`Failed to decrypt credentials for account ${item.username}:`, decryptError)
    }
  }

  return {
    activeAccountId: data.activeAccountId,
    accounts: decryptedAccounts
  }
}

export async function saveStoredAccounts(activeAccountId: string | null, accounts: StoredAccount[]): Promise<void> {
  const filePath = getAuthDatabasePath()

  const serializedAccounts: SerializedAccountData[] = accounts.map((acc) => ({
    id: acc.id,
    username: acc.username,
    uuid: acc.uuid,
    accountType: acc.accountType,
    encryptedAccessToken: encryptSecret(acc.accessToken),
    encryptedRefreshToken: acc.refreshToken ? encryptSecret(acc.refreshToken) : null,
    expiresAt: acc.expiresAt,
    skinUrl: acc.skinUrl,
    createdAt: acc.createdAt
  }))

  const databasePayload: EncryptedAuthDatabase = {
    activeAccountId,
    accounts: serializedAccounts
  }

  await writeJsonFileAtomic(filePath, databasePayload)
}
