import electron, { type BrowserWindow } from 'electron'
import { MICROSOFT_AUTH_CONFIG } from '@shared/constants/auth'

function getBrowserWindowConstructor(): typeof import('electron').BrowserWindow | null {
  if (typeof electron === 'object' && electron !== null && 'BrowserWindow' in electron) {
    return (electron as { BrowserWindow: typeof import('electron').BrowserWindow }).BrowserWindow
  }
  return null
}

export async function captureMicrosoftAuthorizationCode(parentWindow?: BrowserWindow): Promise<string> {
  const BrowserWindowClass = getBrowserWindowConstructor()
  if (!BrowserWindowClass) {
    throw new Error('Electron runtime is required to open the interactive Microsoft authentication window.')
  }

  const queryParameters = new URLSearchParams({
    client_id: MICROSOFT_AUTH_CONFIG.CLIENT_ID,
    response_type: 'code',
    redirect_uri: MICROSOFT_AUTH_CONFIG.REDIRECT_URI,
    scope: MICROSOFT_AUTH_CONFIG.SCOPE,
    prompt: 'select_account'
  })

  const authorizationUrl = `${MICROSOFT_AUTH_CONFIG.AUTHORIZE_URL}?${queryParameters.toString()}`

  return new Promise((resolve, reject) => {
    let hasResolved = false

    const authWindow = new BrowserWindowClass({
      width: 540,
      height: 680,
      parent: parentWindow,
      modal: Boolean(parentWindow),
      show: true,
      title: 'Sign in to Microsoft',
      backgroundColor: '#11141D',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    const handleNavigation = (navigationUrl: string) => {
      if (navigationUrl.startsWith(MICROSOFT_AUTH_CONFIG.REDIRECT_URI)) {
        try {
          const parsedUrl = new URL(navigationUrl)
          const code = parsedUrl.searchParams.get('code')
          const error = parsedUrl.searchParams.get('error')

          if (code) {
            hasResolved = true
            authWindow.destroy()
            resolve(code)
            return
          }

          if (error) {
            hasResolved = true
            authWindow.destroy()
            reject(new Error(`Microsoft authentication error: ${error}`))
            return
          }
        } catch (error) {
          hasResolved = true
          authWindow.destroy()
          reject(error)
          return
        }
      }
    }

    authWindow.webContents.on('will-navigate', (_event, url) => {
      handleNavigation(url)
    })

    authWindow.webContents.on('will-redirect', (_event, url) => {
      handleNavigation(url)
    })

    authWindow.on('closed', () => {
      if (!hasResolved) {
        reject(new Error('Microsoft login window was closed by the user.'))
      }
    })

    authWindow.loadURL(authorizationUrl)
  })
}
