use crate::core::instances::write_json_atomic;
use crate::core::paths;
use base64::Engine;
use chrono::Utc;
use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const CLIENT_ID: &str = "00000000402b5328";
const REDIRECT_URI: &str = "https://login.microsoftonline.com/common/oauth2/nativeclient";
const SCOPE: &str = "XboxLive.signin offline_access";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBOX_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MINECRAFT_LOGIN_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MINECRAFT_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAccount {
    pub id: String,
    pub username: String,
    pub uuid: String,
    pub account_type: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: u64,
    pub skin_url: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthState {
    pub active_account_id: Option<String>,
    pub active_account: Option<StoredAccount>,
    pub accounts: Vec<StoredAccount>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SerializedAccountData {
    pub id: String,
    pub username: String,
    pub uuid: String,
    pub account_type: String,
    pub encrypted_access_token: String,
    pub encrypted_refresh_token: Option<String>,
    pub expires_at: u64,
    pub skin_url: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptedAuthDatabase {
    pub active_account_id: Option<String>,
    pub accounts: Vec<SerializedAccountData>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct MicrosoftTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct XboxXui {
    pub uhs: String,
}

#[derive(Debug, Deserialize)]
struct XboxDisplayClaims {
    pub xui: Vec<XboxXui>,
}

#[derive(Debug, Deserialize)]
struct XboxLiveAuthResponse {
    #[serde(rename = "Token")]
    pub token: String,
    #[serde(rename = "DisplayClaims")]
    pub display_claims: XboxDisplayClaims,
}

#[derive(Debug, Deserialize)]
struct MinecraftAuthResponse {
    pub access_token: String,
    pub expires_in: u64,
}

#[derive(Debug, Deserialize)]
struct MinecraftProfileSkin {
    pub state: String,
    pub url: String,
}

#[derive(Debug, Deserialize)]
struct MinecraftProfile {
    pub id: String,
    pub name: String,
    pub skins: Option<Vec<MinecraftProfileSkin>>,
}

fn get_auth_file_path() -> PathBuf {
    paths::get_launcher_root_directory().join("auth.json")
}

fn encrypt_secret(plaintext: &str) -> String {
    let b64 = base64::engine::general_purpose::STANDARD.encode(plaintext.as_bytes());
    format!("plain:{b64}")
}

fn decrypt_secret(ciphertext: &str) -> String {
    if let Some(stripped) = ciphertext.strip_prefix("plain:") {
        if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(stripped) {
            if let Ok(utf8) = String::from_utf8(decoded) {
                return utf8;
            }
        }
    }
    ciphertext.to_string()
}

pub fn generate_offline_player_uuid(username: &str) -> String {
    let hash = md5::compute(format!("OfflinePlayer:{username}"));
    let mut bytes = hash.0;
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    uuid::Uuid::from_bytes(bytes).to_string()
}

pub fn load_stored_accounts() -> Result<(Option<String>, Vec<StoredAccount>), String> {
    let path = get_auth_file_path();
    if !path.exists() {
        return Ok((None, Vec::new()));
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let db: EncryptedAuthDatabase = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let accounts = db
        .accounts
        .into_iter()
        .map(|item| StoredAccount {
            id: item.id,
            username: item.username,
            uuid: item.uuid,
            account_type: item.account_type,
            access_token: decrypt_secret(&item.encrypted_access_token),
            refresh_token: item.encrypted_refresh_token.map(|t| decrypt_secret(&t)),
            expires_at: item.expires_at,
            skin_url: item.skin_url,
            created_at: item.created_at,
        })
        .collect();

    Ok((db.active_account_id, accounts))
}

pub fn save_stored_accounts(
    active_account_id: Option<String>,
    accounts: &[StoredAccount],
) -> Result<(), String> {
    let path = get_auth_file_path();
    let serialized = EncryptedAuthDatabase {
        active_account_id,
        accounts: accounts
            .iter()
            .map(|acc| SerializedAccountData {
                id: acc.id.clone(),
                username: acc.username.clone(),
                uuid: acc.uuid.clone(),
                account_type: acc.account_type.clone(),
                encrypted_access_token: encrypt_secret(&acc.access_token),
                encrypted_refresh_token: acc.refresh_token.as_ref().map(|t| encrypt_secret(t)),
                expires_at: acc.expires_at,
                skin_url: acc.skin_url.clone(),
                created_at: acc.created_at.clone(),
            })
            .collect(),
    };

    write_json_atomic(&path, &serialized)
}

pub fn get_auth_state() -> Result<AuthState, String> {
    let (active_id, accounts) = load_stored_accounts()?;
    let active_account = active_id
        .as_ref()
        .and_then(|id| accounts.iter().find(|a| &a.id == id).cloned())
        .or_else(|| accounts.first().cloned());

    Ok(AuthState {
        active_account_id: active_account.as_ref().map(|a| a.id.clone()),
        active_account,
        accounts,
    })
}

pub fn login_offline(username: &str) -> Result<StoredAccount, String> {
    let trimmed = username.trim();
    if trimmed.is_empty() {
        return Err("Username cannot be empty.".to_string());
    }

    let uuid_str = generate_offline_player_uuid(trimmed);
    let account_id = format!("offline-{}", trimmed.to_lowercase());

    let new_account = StoredAccount {
        id: account_id.clone(),
        username: trimmed.to_string(),
        uuid: uuid_str,
        account_type: "offline".to_string(),
        access_token: "0".to_string(),
        refresh_token: None,
        expires_at: u64::MAX,
        skin_url: None,
        created_at: Utc::now().to_rfc3339(),
    };

    let (_, mut accounts) = load_stored_accounts().unwrap_or((None, Vec::new()));
    accounts.retain(|a| a.id != account_id);
    accounts.insert(0, new_account.clone());

    save_stored_accounts(Some(account_id), &accounts)?;
    Ok(new_account)
}

pub fn switch_account(account_id: &str) -> Result<AuthState, String> {
    let (_, accounts) = load_stored_accounts()?;
    let target = accounts
        .iter()
        .find(|a| a.id == account_id)
        .cloned()
        .ok_or_else(|| format!("Account not found: {account_id}"))?;

    save_stored_accounts(Some(target.id.clone()), &accounts)?;
    Ok(AuthState {
        active_account_id: Some(target.id.clone()),
        active_account: Some(target),
        accounts,
    })
}

pub fn logout_account(account_id: &str) -> Result<AuthState, String> {
    let (active_id, mut accounts) = load_stored_accounts()?;
    accounts.retain(|a| a.id != account_id);

    let next_active = if active_id.as_deref() == Some(account_id) {
        accounts.first().map(|a| a.id.clone())
    } else {
        active_id
    };

    save_stored_accounts(next_active.clone(), &accounts)?;

    let active_account = next_active
        .as_ref()
        .and_then(|id| accounts.iter().find(|a| &a.id == id).cloned());

    Ok(AuthState {
        active_account_id: next_active,
        active_account,
        accounts,
    })
}

pub async fn exchange_code_for_minecraft_account(code: &str) -> Result<StoredAccount, String> {
    let client = reqwest::Client::new();

    let token_params = [
        ("client_id", CLIENT_ID),
        ("code", code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", REDIRECT_URI),
        ("scope", SCOPE),
    ];

    let ms_resp = client
        .post(TOKEN_URL)
        .header(USER_AGENT, "ScriptLauncher/0.18.7")
        .form(&token_params)
        .send()
        .await
        .map_err(|e| format!("Token request failed: {e}"))?;

    let ms_status = ms_resp.status();
    if !ms_status.is_success() {
        let err_body = ms_resp.text().await.unwrap_or_default();
        return Err(format!("Microsoft token exchange HTTP {ms_status}: {err_body}"));
    }

    let ms_tokens = ms_resp
        .json::<MicrosoftTokenResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let xbl_payload = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={}", ms_tokens.access_token)
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });

    let xbl_resp = client
        .post(XBOX_AUTH_URL)
        .header(USER_AGENT, "ScriptLauncher/0.18.7")
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&xbl_payload)
        .send()
        .await
        .map_err(|e| format!("Xbox Live auth failed: {e}"))?;

    let xbl_status = xbl_resp.status();
    if !xbl_status.is_success() {
        let err_body = xbl_resp.text().await.unwrap_or_default();
        return Err(format!("Xbox Live auth HTTP {xbl_status}: {err_body}"));
    }

    let xbl_data = xbl_resp
        .json::<XboxLiveAuthResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let user_hash = xbl_data
        .display_claims
        .xui
        .first()
        .map(|x| x.uhs.clone())
        .ok_or_else(|| "No user hash in Xbox response".to_string())?;

    let xsts_payload = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbl_data.token]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
    });

    let xsts_resp = client
        .post(XSTS_AUTH_URL)
        .header(USER_AGENT, "ScriptLauncher/0.18.7")
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&xsts_payload)
        .send()
        .await
        .map_err(|e| format!("XSTS auth failed: {e}"))?;

    let xsts_status = xsts_resp.status();
    if !xsts_status.is_success() {
        let err_body = xsts_resp.text().await.unwrap_or_default();
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&err_body) {
            if let Some(err_code) = error_json.get("XErr").and_then(|v| v.as_i64()) {
                if err_code == 2148916233 {
                    return Err("This Microsoft account does not have an active Xbox account. Please create one on xbox.com.".to_string());
                }
                if err_code == 2148916238 {
                    return Err("This account is a child account and requires adult verification in Microsoft Family Safety.".to_string());
                }
            }
        }
        return Err(format!("XSTS authorization HTTP {xsts_status}: {err_body}"));
    }

    let xsts_data = xsts_resp
        .json::<XboxLiveAuthResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let mc_payload = serde_json::json!({
        "identityToken": format!("XBL3.0 x={};{}", user_hash, xsts_data.token)
    });

    let mc_resp = client
        .post(MINECRAFT_LOGIN_URL)
        .header(USER_AGENT, "ScriptLauncher/0.18.7")
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&mc_payload)
        .send()
        .await
        .map_err(|e| format!("Minecraft login failed: {e}"))?;

    let mc_status = mc_resp.status();
    if !mc_status.is_success() {
        let err_body = mc_resp.text().await.unwrap_or_default();
        return Err(format!("Minecraft login HTTP {mc_status}: {err_body}"));
    }

    let mc_data = mc_resp
        .json::<MinecraftAuthResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let profile_resp = client
        .get(MINECRAFT_PROFILE_URL)
        .header(USER_AGENT, "ScriptLauncher/0.18.7")
        .header("Authorization", format!("Bearer {}", mc_data.access_token))
        .send()
        .await
        .map_err(|e| format!("Profile request failed: {e}"))?;

    let profile_status = profile_resp.status();
    if !profile_status.is_success() {
        let err_body = profile_resp.text().await.unwrap_or_default();
        if profile_status.as_u16() == 404 {
            return Err("This Microsoft account does not own Minecraft Java Edition.".to_string());
        }
        return Err(format!("Profile request HTTP {profile_status}: {err_body}"));
    }

    let profile = profile_resp
        .json::<MinecraftProfile>()
        .await
        .map_err(|e| e.to_string())?;

    let skin_url = profile.skins.as_ref().and_then(|skins| {
        skins.iter().find(|s| s.state == "ACTIVE").map(|s| s.url.clone())
    });

    let now_ms = Utc::now().timestamp_millis() as u64;
    let expires_at = now_ms + mc_data.expires_in * 1000;

    let new_account = StoredAccount {
        id: profile.id.clone(),
        username: profile.name,
        uuid: profile.id,
        account_type: "microsoft".to_string(),
        access_token: mc_data.access_token,
        refresh_token: ms_tokens.refresh_token,
        expires_at,
        skin_url,
        created_at: Utc::now().to_rfc3339(),
    };

    let (_, mut accounts) = load_stored_accounts().unwrap_or((None, Vec::new()));
    accounts.retain(|a| a.id != new_account.id);
    accounts.insert(0, new_account.clone());

    save_stored_accounts(Some(new_account.id.clone()), &accounts)?;
    Ok(new_account)
}

pub async fn refresh_microsoft_account(account: &StoredAccount) -> Result<StoredAccount, String> {
    let refresh_token = account
        .refresh_token
        .as_deref()
        .ok_or_else(|| "No refresh token available".to_string())?;

    let client = reqwest::Client::new();
    let token_params = [
        ("client_id", CLIENT_ID),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
        ("redirect_uri", REDIRECT_URI),
        ("scope", SCOPE),
    ];

    let ms_resp = client
        .post(TOKEN_URL)
        .header(USER_AGENT, "ScriptLauncher/0.18.9")
        .form(&token_params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {e}"))?;

    let ms_status = ms_resp.status();
    if !ms_status.is_success() {
        let err_body = ms_resp.text().await.unwrap_or_default();
        return Err(format!("Microsoft token refresh HTTP {ms_status}: {err_body}"));
    }

    let ms_tokens = ms_resp
        .json::<MicrosoftTokenResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let xbl_payload = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={}", ms_tokens.access_token)
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });

    let xbl_resp = client
        .post(XBOX_AUTH_URL)
        .header(USER_AGENT, "ScriptLauncher/0.18.9")
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&xbl_payload)
        .send()
        .await
        .map_err(|e| format!("Xbox Live auth failed: {e}"))?;

    let xbl_status = xbl_resp.status();
    if !xbl_status.is_success() {
        let err_body = xbl_resp.text().await.unwrap_or_default();
        return Err(format!("Xbox Live auth HTTP {xbl_status}: {err_body}"));
    }

    let xbl_data = xbl_resp
        .json::<XboxLiveAuthResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let user_hash = xbl_data
        .display_claims
        .xui
        .first()
        .map(|x| x.uhs.clone())
        .ok_or_else(|| "No user hash in Xbox response".to_string())?;

    let xsts_payload = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbl_data.token]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
    });

    let xsts_resp = client
        .post(XSTS_AUTH_URL)
        .header(USER_AGENT, "ScriptLauncher/0.18.9")
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&xsts_payload)
        .send()
        .await
        .map_err(|e| format!("XSTS auth failed: {e}"))?;

    let xsts_status = xsts_resp.status();
    if !xsts_status.is_success() {
        let err_body = xsts_resp.text().await.unwrap_or_default();
        return Err(format!("XSTS authorization HTTP {xsts_status}: {err_body}"));
    }

    let xsts_data = xsts_resp
        .json::<XboxLiveAuthResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let mc_payload = serde_json::json!({
        "identityToken": format!("XBL3.0 x={};{}", user_hash, xsts_data.token)
    });

    let mc_resp = client
        .post(MINECRAFT_LOGIN_URL)
        .header(USER_AGENT, "ScriptLauncher/0.18.9")
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&mc_payload)
        .send()
        .await
        .map_err(|e| format!("Minecraft login failed: {e}"))?;

    let mc_status = mc_resp.status();
    if !mc_status.is_success() {
        let err_body = mc_resp.text().await.unwrap_or_default();
        return Err(format!("Minecraft login HTTP {mc_status}: {err_body}"));
    }

    let mc_data = mc_resp
        .json::<MinecraftAuthResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let profile_resp = client
        .get(MINECRAFT_PROFILE_URL)
        .header(USER_AGENT, "ScriptLauncher/0.18.9")
        .header("Authorization", format!("Bearer {}", mc_data.access_token))
        .send()
        .await
        .map_err(|e| format!("Profile request failed: {e}"))?;

    let profile_status = profile_resp.status();
    if !profile_status.is_success() {
        let err_body = profile_resp.text().await.unwrap_or_default();
        return Err(format!("Profile request HTTP {profile_status}: {err_body}"));
    }

    let profile = profile_resp
        .json::<MinecraftProfile>()
        .await
        .map_err(|e| e.to_string())?;

    let skin_url = profile.skins.as_ref().and_then(|skins| {
        skins.iter().find(|s| s.state == "ACTIVE").map(|s| s.url.clone())
    });

    let now_ms = Utc::now().timestamp_millis() as u64;
    let expires_at = now_ms + mc_data.expires_in * 1000;

    let updated_account = StoredAccount {
        id: account.id.clone(),
        username: profile.name,
        uuid: profile.id,
        account_type: "microsoft".to_string(),
        access_token: mc_data.access_token,
        refresh_token: ms_tokens.refresh_token.or_else(|| account.refresh_token.clone()),
        expires_at,
        skin_url,
        created_at: account.created_at.clone(),
    };

    let (_, mut accounts) = load_stored_accounts().unwrap_or((None, Vec::new()));
    for acc in &mut accounts {
        if acc.id == updated_account.id {
            *acc = updated_account.clone();
        }
    }

    save_stored_accounts(Some(updated_account.id.clone()), &accounts)?;
    Ok(updated_account)
}

pub async fn get_valid_active_account() -> StoredAccount {
    let auth_state = get_auth_state().unwrap_or(AuthState {
        active_account_id: None,
        active_account: None,
        accounts: Vec::new(),
    });

    let active_account = auth_state
        .active_account
        .or_else(|| auth_state.accounts.first().cloned());

    if let Some(acc) = active_account {
        if acc.account_type == "microsoft" {
            let now_ms = Utc::now().timestamp_millis() as u64;
            if now_ms + 5 * 60 * 1000 >= acc.expires_at {
                if let Ok(refreshed) = refresh_microsoft_account(&acc).await {
                    return refreshed;
                }
            }
        }
        return acc;
    }

    login_offline("Player").unwrap_or_else(|_| StoredAccount {
        id: "offline-player".to_string(),
        username: "Player".to_string(),
        uuid: generate_offline_player_uuid("Player"),
        account_type: "offline".to_string(),
        access_token: "0".to_string(),
        refresh_token: None,
        expires_at: u64::MAX,
        skin_url: None,
        created_at: Utc::now().to_rfc3339(),
    })
}
