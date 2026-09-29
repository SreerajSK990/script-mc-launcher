use crate::core::auth::{self, AuthState, StoredAccount};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn auth_get_state() -> Result<AuthState, String> {
    auth::get_auth_state()
}

#[tauri::command]
pub async fn auth_login_offline(username: String) -> Result<StoredAccount, String> {
    auth::login_offline(&username)
}

#[tauri::command]
pub async fn auth_switch_account(account_id: String) -> Result<AuthState, String> {
    auth::switch_account(&account_id)
}

#[tauri::command]
pub async fn auth_logout(account_id: String) -> Result<AuthState, String> {
    auth::logout_account(&account_id)
}

#[tauri::command]
pub async fn auth_login_microsoft(app: AppHandle) -> Result<StoredAccount, String> {
    let auth_url_str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=00000000402b5328&response_type=code&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient&scope=XboxLive.signin%20offline_access&prompt=select_account";
    let parsed_url = Url::parse(auth_url_str).map_err(|e| e.to_string())?;

    for (label, window) in app.webview_windows() {
        if label.starts_with("ms-login") {
            let _ = window.destroy();
        }
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let window_label = format!("ms-login-{timestamp}");

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let tx_mutex = Arc::new(Mutex::new(Some(tx)));

    let win = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::External(parsed_url))
        .title("Sign in to your Microsoft Account")
        .inner_size(520.0, 680.0)
        .resizable(false)
        .on_navigation(move |url| {
            let url_str = url.as_str();
            if url_str.starts_with("https://login.microsoftonline.com/common/oauth2/nativeclient") {
                let mut captured_code: Option<String> = None;
                let mut captured_error: Option<String> = None;

                for (k, v) in url.query_pairs() {
                    if k == "code" {
                        captured_code = Some(v.into_owned());
                        break;
                    } else if k == "error" || k == "error_description" {
                        captured_error = Some(v.into_owned());
                    }
                }

                if let Some(code) = captured_code {
                    if let Ok(mut lock) = tx_mutex.lock() {
                        if let Some(sender) = lock.take() {
                            let _ = sender.send(Ok(code));
                        }
                    }
                    return false;
                }

                if let Some(err) = captured_error {
                    if let Ok(mut lock) = tx_mutex.lock() {
                        if let Some(sender) = lock.take() {
                            let _ = sender.send(Err(format!("Microsoft authentication error: {err}")));
                        }
                    }
                    return false;
                }
            }
            true
        })
        .build()
        .map_err(|e| e.to_string())?;

    let code = match rx.await {
        Ok(result) => result?,
        Err(_) => return Err("Login was cancelled".to_string()),
    };
    let _ = win.destroy();
    auth::exchange_code_for_minecraft_account(&code).await
}
