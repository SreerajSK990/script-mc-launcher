export const MICROSOFT_AUTH_CONFIG = {
  CLIENT_ID: '00000000402b5328',
  REDIRECT_URI: 'https://login.microsoftonline.com/common/oauth2/nativeclient',
  SCOPE: 'XboxLive.signin offline_access',
  AUTHORIZE_URL: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
  TOKEN_URL: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
  XBOX_AUTH_URL: 'https://user.auth.xboxlive.com/user/authenticate',
  XSTS_AUTH_URL: 'https://xsts.auth.xboxlive.com/xsts/authorize',
  MINECRAFT_LOGIN_URL: 'https://api.minecraftservices.com/authentication/login_with_xbox',
  MINECRAFT_PROFILE_URL: 'https://api.minecraftservices.com/minecraft/profile',
  MINECRAFT_ENTITLEMENTS_URL: 'https://api.minecraftservices.com/entitlements/mcstore'
} as const
