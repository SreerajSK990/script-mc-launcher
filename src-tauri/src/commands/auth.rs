use crate::core::auth::{self, AuthState, StoredAccount};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Url, WebviewUrl, WebviewWindowBuilder};

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
    let auth_url_str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=00000000402b5328&response_type=code&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient&scope=XboxLive.signin%20offline_access";
    let parsed_url = Url::parse(auth_url_str).map_err(|e| e.to_string())?;

    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let tx_mutex = Arc::new(Mutex::new(Some(tx)));

    let win = WebviewWindowBuilder::new(&app, "ms-login", WebviewUrl::External(parsed_url))
        .title("Sign in to your Microsoft Account")
        .inner_size(520.0, 680.0)
        .resizable(false)
        .on_navigation(move |url| {
            let url_str = url.as_str();
            if url_str.starts_with("https://login.microsoftonline.com/common/oauth2/nativeclient") {
                if let Some(query) = url.query() {
                    for pair in query.split('&') {
                        if let Some((k, v)) = pair.split_once('=') {
                            if k == "code" {
                                if let Ok(mut lock) = tx_mutex.lock() {
                                    if let Some(sender) = lock.take() {
                                        let _ = sender.send(v.to_string());
                                    }
                                }
                                return false;
                            }
                        }
                    }
                }
            }
            true
        })
        .build()
        .map_err(|e| e.to_string())?;

    let code = rx.await.map_err(|_| "Login was cancelled".to_string())?;
    let _ = win.close();
    auth::exchange_code_for_minecraft_account(&code).await
}
