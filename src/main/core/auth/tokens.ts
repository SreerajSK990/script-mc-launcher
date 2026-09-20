import { MICROSOFT_AUTH_CONFIG } from '@shared/constants/auth'
import type {
  MicrosoftTokenResponse,
  XboxLiveAuthResponse,
  MinecraftAuthResponse,
  MinecraftProfile
} from '@shared/types/auth'

export async function exchangeAuthorizationCode(code: string): Promise<MicrosoftTokenResponse> {
  const parameters = new URLSearchParams({
    client_id: MICROSOFT_AUTH_CONFIG.CLIENT_ID,
    code,
    grant_type: 'authorization_code',
    redirect_uri: MICROSOFT_AUTH_CONFIG.REDIRECT_URI,
    scope: MICROSOFT_AUTH_CONFIG.SCOPE
  })

  const response = await fetch(MICROSOFT_AUTH_CONFIG.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: parameters.toString()
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Failed to exchange Microsoft authorization code: ${response.status} - ${errorBody}`)
  }

  return (await response.json()) as MicrosoftTokenResponse
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<MicrosoftTokenResponse> {
  const parameters = new URLSearchParams({
    client_id: MICROSOFT_AUTH_CONFIG.CLIENT_ID,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    redirect_uri: MICROSOFT_AUTH_CONFIG.REDIRECT_URI,
    scope: MICROSOFT_AUTH_CONFIG.SCOPE
  })

  const response = await fetch(MICROSOFT_AUTH_CONFIG.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: parameters.toString()
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Failed to refresh Microsoft token: ${response.status} - ${errorBody}`)
  }

  return (await response.json()) as MicrosoftTokenResponse
}

export async function authenticateXboxLive(msAccessToken: string): Promise<{ token: string; userHash: string }> {
  const requestPayload = {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: `d=${msAccessToken}`
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  }

  const response = await fetch(MICROSOFT_AUTH_CONFIG.XBOX_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(requestPayload)
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Xbox Live authentication failed: ${response.status} - ${errorBody}`)
  }

  const data = (await response.json()) as XboxLiveAuthResponse
  const userHash = data.DisplayClaims.xui[0]?.uhs

  if (!userHash) {
    throw new Error('Xbox Live response did not contain a valid user hash.')
  }

  return {
    token: data.Token,
    userHash
  }
}

export async function authorizeXsts(xblToken: string): Promise<{ token: string; userHash: string }> {
  const requestPayload = {
    Properties: {
      SandboxId: 'RETAIL',
      UserTokens: [xblToken]
    },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  }

  const response = await fetch(MICROSOFT_AUTH_CONFIG.XSTS_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(requestPayload)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    const errorCode = errorData?.XErr

    if (errorCode === 2148916233) {
      throw new Error('This Microsoft account does not have an active Xbox account. Please create one on xbox.com.')
    }
    if (errorCode === 2148916238) {
      throw new Error('This account is a child account and requires adult verification in Microsoft Family Safety.')
    }

    throw new Error(`XSTS authorization failed with status ${response.status}: ${JSON.stringify(errorData)}`)
  }

  const data = (await response.json()) as XboxLiveAuthResponse
  const userHash = data.DisplayClaims.xui[0]?.uhs

  if (!userHash) {
    throw new Error('XSTS response did not contain a valid user hash.')
  }

  return {
    token: data.Token,
    userHash
  }
}

export async function loginWithMinecraftServices(
  userHash: string,
  xstsToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const requestPayload = {
    identityToken: `XBL3.0 x=${userHash};${xstsToken}`
  }

  const response = await fetch(MICROSOFT_AUTH_CONFIG.MINECRAFT_LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(requestPayload)
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Minecraft Services login failed: ${response.status} - ${errorBody}`)
  }

  const data = (await response.json()) as MinecraftAuthResponse
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in
  }
}

export async function fetchMinecraftProfile(mcAccessToken: string): Promise<MinecraftProfile> {
  const response = await fetch(MICROSOFT_AUTH_CONFIG.MINECRAFT_PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${mcAccessToken}`
    }
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Failed to fetch Minecraft profile: ${response.status} - ${errorBody}`)
  }

  const rawData = await response.json()
  return {
    uuid: rawData.id,
    username: rawData.name,
    skins: rawData.skins || [],
    capes: rawData.capes || []
  }
}

export async function checkGameOwnership(mcAccessToken: string): Promise<boolean> {
  try {
    const response = await fetch(MICROSOFT_AUTH_CONFIG.MINECRAFT_ENTITLEMENTS_URL, {
      headers: {
        Authorization: `Bearer ${mcAccessToken}`
      }
    })

    if (!response.ok) {
      return false
    }

    const data = await response.json()
    const items = data.items || []
    return items.some((item: { name: string }) => item.name === 'product_minecraft' || item.name === 'game_minecraft')
  } catch {
    return false
  }
}
