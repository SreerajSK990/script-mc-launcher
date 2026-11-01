use crate::core::fs_util::write_json_atomic;
use crate::core::paths;
use crate::core::secrets;
use chrono::Utc;
use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const CLIENT_ID: &str = "00000000402b5328";
const REDIRECT_URI: &str = "https://login.microsoftonline.com/common/oauth2/nativeclient";
const SCOPE: &str = "XboxLive.signin offline_access";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const COMMON_TOKEN_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const XBOX_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MINECRAFT_LOGIN_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MINECRAFT_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const LIVE_DEVICE_CODE_URL: &str = "https://login.live.com/oauth20_connect.srf";
const LIVE_TOKEN_URL: &str = "https://login.live.com/oauth20_token.srf";
const LIVE_SCOPE: &str = "service::user.auth.xboxlive.com::MBI_SSL";
const DEVICE_CODE_GRANT: &str = "urn:ietf:params:oauth:grant-type:device_code";
pub const AUTH_FLOW_DEVICE_CODE: &str = "device-code";

fn create_auth_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn format_reqwest_error(prefix: &str, err: &reqwest::Error) -> String {
    let mut details = format!("{prefix}: {err}");
    let mut source = std::error::Error::source(err);
    while let Some(s) = source {
        details.push_str(&format!(" -> {s}"));
        source = std::error::Error::source(s);
    }
    details
}

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
    #[serde(default)]
    pub auth_flow: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeInfo {
    #[serde(alias = "user_code")]
    pub user_code: String,
    #[serde(alias = "device_code")]
    pub device_code: String,
    #[serde(alias = "verification_uri")]
    pub verification_uri: String,
    pub interval: u64,
    #[serde(alias = "expires_in")]
    pub expires_in: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthState {
    pub active_account_id: Option<String>,
    pub active_account: Option<StoredAccount>,
    pub accounts: Vec<StoredAccount>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct SerializedAccountData {
    pub id: String,
    pub username: String,
    pub uuid: String,
    pub account_type: String,
    pub encrypted_access_token: String,
    pub encrypted_refresh_token: Option<String>,
    #[serde(deserialize_with = "deserialize_timestamp")]
    pub expires_at: u64,
    pub skin_url: Option<String>,
    pub created_at: String,
    pub auth_flow: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
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

fn deserialize_timestamp<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(match value {
        Some(serde_json::Value::Number(number)) => number
            .as_u64()
            .or_else(|| number.as_f64().filter(|v| v.is_finite() && *v >= 0.0).map(|v| v as u64))
            .unwrap_or(0),
        _ => 0,
    })
}

#[derive(Debug, Clone)]
pub struct ActiveAccountResolution {
    pub account: StoredAccount,
    pub warning: Option<String>,
}

fn quarantine_unreadable_auth_file(path: &std::path::Path, reason: &str) -> String {
    let backup = path.with_file_name(format!("auth.json.unreadable-{}", Utc::now().format("%Y%m%d-%H%M%S")));
    match fs::rename(path, &backup) {
        Ok(()) => format!(
            "Saved accounts could not be read ({reason}). The file was kept as {} and you may need to sign in again.",
            backup.display()
        ),
        Err(_) => format!("Saved accounts could not be read ({reason})."),
    }
}

fn get_auth_file_path() -> PathBuf {
    paths::get_launcher_root_directory().join("auth.json")
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
    let db: EncryptedAuthDatabase = match serde_json::from_str(&content) {
        Ok(db) => db,
        Err(error) => return Err(quarantine_unreadable_auth_file(&path, &error.to_string())),
    };

    let mut needs_resealing = false;
    let mut all_secrets_opened = true;
    let mut open_secret = |stored: &str| -> String {
        if !secrets::is_sealed_with_current_scheme(stored) {
            needs_resealing = true;
        }
        secrets::open(stored).unwrap_or_else(|| {
            all_secrets_opened = false;
            String::new()
        })
    };

    let accounts: Vec<StoredAccount> = db
        .accounts
        .into_iter()
        .map(|item| StoredAccount {
            id: item.id,
            username: item.username,
            uuid: item.uuid,
            account_type: item.account_type,
            access_token: open_secret(&item.encrypted_access_token),
            refresh_token: item.encrypted_refresh_token.map(|t| open_secret(&t)),
            expires_at: item.expires_at,
            skin_url: item.skin_url,
            created_at: item.created_at,
            auth_flow: item.auth_flow,
        })
        .collect();

    if needs_resealing && all_secrets_opened {
        let _ = save_stored_accounts(db.active_account_id.clone(), &accounts);
    }

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
                encrypted_access_token: secrets::seal(&acc.access_token),
                encrypted_refresh_token: acc.refresh_token.as_ref().map(|t| secrets::seal(t)),
                expires_at: acc.expires_at,
                skin_url: acc.skin_url.clone(),
                created_at: acc.created_at.clone(),
                auth_flow: acc.auth_flow.clone(),
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
        auth_flow: None,
    };

    let (_, mut accounts) = load_stored_accounts()?;
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

struct MinecraftSession {
    access_token: String,
    expires_in: u64,
    profile: MinecraftProfile,
}

async fn post_token_request(client: &reqwest::Client, endpoints: &[&str], params: &[(&str, &str)]) -> Result<MicrosoftTokenResponse, String> {
    let mut last_error = String::from("No token endpoint was tried");
    for endpoint in endpoints {
        let response = match client
            .post(*endpoint)
            .header(USER_AGENT, crate::core::net::USER_AGENT)
            .form(params)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                last_error = format_reqwest_error("Token request failed", &error);
                continue;
            }
        };
        let status = response.status();
        if status.is_success() {
            return response
                .json::<MicrosoftTokenResponse>()
                .await
                .map_err(|e| format_reqwest_error("Failed to parse Microsoft token response", &e));
        }
        last_error = format!("Microsoft token request HTTP {status}: {}", response.text().await.unwrap_or_default());
    }
    Err(last_error)
}

async fn post_json(client: &reqwest::Client, url: &str, payload: &serde_json::Value) -> Result<reqwest::Response, String> {
    client
        .post(url)
        .header(USER_AGENT, crate::core::net::USER_AGENT)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(payload)
        .send()
        .await
        .map_err(|e| format_reqwest_error(&format!("Request to {url} failed"), &e))
}

async fn authenticate_xbox_live(client: &reqwest::Client, microsoft_access_token: &str, auth_flow: Option<&str>) -> Result<XboxLiveAuthResponse, String> {
    let tickets: Vec<String> = if auth_flow == Some(AUTH_FLOW_DEVICE_CODE) {
        vec![microsoft_access_token.to_string(), format!("t={microsoft_access_token}")]
    } else {
        vec![format!("d={microsoft_access_token}")]
    };
    let mut last_error = String::from("Xbox Live authentication was not attempted");
    for ticket in tickets {
        let payload = serde_json::json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": ticket
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        });
        let response = post_json(client, XBOX_AUTH_URL, &payload).await?;
        let status = response.status();
        if status.is_success() {
            return response
                .json::<XboxLiveAuthResponse>()
                .await
                .map_err(|e| format_reqwest_error("Failed to parse Xbox Live response", &e));
        }
        last_error = format!("Xbox Live auth HTTP {status}: {}", response.text().await.unwrap_or_default());
    }
    Err(last_error)
}

async fn sign_in_to_minecraft(microsoft_access_token: &str, auth_flow: Option<&str>) -> Result<MinecraftSession, String> {
    let client = create_auth_http_client();
    let xbl_data = authenticate_xbox_live(&client, microsoft_access_token, auth_flow).await?;
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
    let xsts_resp = post_json(&client, XSTS_AUTH_URL, &xsts_payload).await?;
    let xsts_status = xsts_resp.status();
    if !xsts_status.is_success() {
        let err_body = xsts_resp.text().await.unwrap_or_default();
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&err_body) {
            match error_json.get("XErr").and_then(|v| v.as_i64()) {
                Some(2148916233) => {
                    return Err("This Microsoft account does not have an active Xbox account. Please create one on xbox.com.".to_string())
                }
                Some(2148916238) => {
                    return Err("This account is a child account and requires adult verification in Microsoft Family Safety.".to_string())
                }
                _ => {}
            }
        }
        return Err(format!("XSTS authorization HTTP {xsts_status}: {err_body}"));
    }
    let xsts_data = xsts_resp
        .json::<XboxLiveAuthResponse>()
        .await
        .map_err(|e| format_reqwest_error("Failed to parse XSTS response", &e))?;

    let mc_payload = serde_json::json!({
        "identityToken": format!("XBL3.0 x={};{}", user_hash, xsts_data.token)
    });
    let mc_resp = post_json(&client, MINECRAFT_LOGIN_URL, &mc_payload).await?;
    let mc_status = mc_resp.status();
    if !mc_status.is_success() {
        return Err(format!("Minecraft login HTTP {mc_status}: {}", mc_resp.text().await.unwrap_or_default()));
    }
    let mc_data = mc_resp
        .json::<MinecraftAuthResponse>()
        .await
        .map_err(|e| format_reqwest_error("Failed to parse Minecraft auth response", &e))?;

    let profile_resp = client
        .get(MINECRAFT_PROFILE_URL)
        .header(USER_AGENT, crate::core::net::USER_AGENT)
        .header("Authorization", format!("Bearer {}", mc_data.access_token))
        .send()
        .await
        .map_err(|e| format_reqwest_error("Profile request failed", &e))?;
    let profile_status = profile_resp.status();
    if !profile_status.is_success() {
        if profile_status.as_u16() == 404 {
            return Err("This Microsoft account does not own Minecraft Java Edition.".to_string());
        }
        return Err(format!("Profile request HTTP {profile_status}: {}", profile_resp.text().await.unwrap_or_default()));
    }
    let profile = profile_resp
        .json::<MinecraftProfile>()
        .await
        .map_err(|e| format_reqwest_error("Failed to parse Minecraft profile", &e))?;

    Ok(MinecraftSession {
        access_token: mc_data.access_token,
        expires_in: mc_data.expires_in,
        profile,
    })
}

fn store_microsoft_account(
    session: MinecraftSession,
    refresh_token: Option<String>,
    auth_flow: Option<String>,
    previous: Option<&StoredAccount>,
    make_active: bool,
) -> Result<StoredAccount, String> {
    let skin_url = session
        .profile
        .skins
        .as_ref()
        .and_then(|skins| skins.iter().find(|s| s.state == "ACTIVE").map(|s| s.url.clone()));
    let account = StoredAccount {
        id: previous.map(|p| p.id.clone()).unwrap_or_else(|| session.profile.id.clone()),
        username: session.profile.name,
        uuid: session.profile.id,
        account_type: "microsoft".to_string(),
        access_token: session.access_token,
        refresh_token: refresh_token.or_else(|| previous.and_then(|p| p.refresh_token.clone())),
        expires_at: Utc::now().timestamp_millis() as u64 + session.expires_in * 1000,
        skin_url,
        created_at: previous.map(|p| p.created_at.clone()).unwrap_or_else(|| Utc::now().to_rfc3339()),
        auth_flow,
    };

    let (active_id, mut accounts) = load_stored_accounts()?;
    match accounts.iter_mut().find(|existing| existing.id == account.id) {
        Some(existing) if !make_active => *existing = account.clone(),
        _ => {
            accounts.retain(|existing| existing.id != account.id);
            accounts.insert(0, account.clone());
        }
    }
    let next_active = if make_active { Some(account.id.clone()) } else { active_id };
    save_stored_accounts(next_active, &accounts)?;
    Ok(account)
}

pub async fn exchange_code_for_minecraft_account(code: &str) -> Result<StoredAccount, String> {
    let client = create_auth_http_client();
    let params = [
        ("client_id", CLIENT_ID),
        ("code", code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", REDIRECT_URI),
        ("scope", SCOPE),
    ];
    let tokens = post_token_request(&client, &[TOKEN_URL, COMMON_TOKEN_URL], &params).await?;
    let session = sign_in_to_minecraft(&tokens.access_token, None).await?;
    store_microsoft_account(session, tokens.refresh_token, None, None, true)
}

pub async fn refresh_microsoft_account(account: &StoredAccount) -> Result<StoredAccount, String> {
    let refresh_token = account
        .refresh_token
        .as_deref()
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "No refresh token available".to_string())?;
    let client = create_auth_http_client();
    let auth_flow = account.auth_flow.as_deref();
    let tokens = if auth_flow == Some(AUTH_FLOW_DEVICE_CODE) {
        let params = [
            ("client_id", CLIENT_ID),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
            ("scope", LIVE_SCOPE),
        ];
        post_token_request(&client, &[LIVE_TOKEN_URL], &params).await?
    } else {
        let params = [
            ("client_id", CLIENT_ID),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
            ("redirect_uri", REDIRECT_URI),
            ("scope", SCOPE),
        ];
        post_token_request(&client, &[TOKEN_URL, COMMON_TOKEN_URL], &params).await?
    };
    let session = sign_in_to_minecraft(&tokens.access_token, auth_flow).await?;
    store_microsoft_account(session, tokens.refresh_token, account.auth_flow.clone(), Some(account), false)
}

pub async fn start_device_code_login() -> Result<DeviceCodeInfo, String> {
    let response = create_auth_http_client()
        .post(LIVE_DEVICE_CODE_URL)
        .header(USER_AGENT, crate::core::net::USER_AGENT)
        .form(&[("client_id", CLIENT_ID), ("scope", LIVE_SCOPE), ("response_type", "device_code")])
        .send()
        .await
        .map_err(|e| format_reqwest_error("Could not request a sign-in code", &e))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("Microsoft refused to issue a sign-in code: HTTP {status}"));
    }
    response
        .json::<DeviceCodeInfo>()
        .await
        .map_err(|e| format_reqwest_error("Failed to read the sign-in code", &e))
}

pub async fn poll_device_code_login(device_code: &str) -> Result<Option<StoredAccount>, String> {
    let response = create_auth_http_client()
        .post(LIVE_TOKEN_URL)
        .header(USER_AGENT, crate::core::net::USER_AGENT)
        .form(&[("client_id", CLIENT_ID), ("grant_type", DEVICE_CODE_GRANT), ("device_code", device_code)])
        .send()
        .await
        .map_err(|e| format_reqwest_error("Could not check the sign-in status", &e))?;
    let status = response.status();
    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return match body.get("error").and_then(|e| e.as_str()) {
            Some("authorization_pending") | Some("slow_down") => Ok(None),
            Some("expired_token") => Err("The sign-in code expired. Request a new one and try again.".to_string()),
            Some("access_denied") | Some("authorization_declined") => Err("Sign-in was declined.".to_string()),
            _ => Err(format!(
                "Microsoft sign-in failed: {}",
                body.get("error_description").and_then(|d| d.as_str()).unwrap_or("unknown error")
            )),
        };
    }
    let tokens: MicrosoftTokenResponse = serde_json::from_value(body).map_err(|e| e.to_string())?;
    let session = sign_in_to_minecraft(&tokens.access_token, Some(AUTH_FLOW_DEVICE_CODE)).await?;
    store_microsoft_account(session, tokens.refresh_token, Some(AUTH_FLOW_DEVICE_CODE.to_string()), None, true).map(Some)
}

pub async fn get_valid_active_account() -> Result<ActiveAccountResolution, String> {
    let auth_state = get_auth_state()?;
    let active_account = auth_state
        .active_account
        .or_else(|| auth_state.accounts.first().cloned());

    let Some(account) = active_account else {
        return Ok(ActiveAccountResolution {
            account: login_offline("Player")?,
            warning: Some("No player account connected. Created a default \"Player\" offline profile.".to_string()),
        });
    };

    if account.account_type != "microsoft" {
        return Ok(ActiveAccountResolution { account, warning: None });
    }

    let now_ms = Utc::now().timestamp_millis() as u64;
    let token_missing = account.access_token.is_empty();
    let token_expiring = now_ms + 5 * 60 * 1000 >= account.expires_at;
    if !token_missing && !token_expiring {
        return Ok(ActiveAccountResolution { account, warning: None });
    }

    match refresh_microsoft_account(&account).await {
        Ok(refreshed) => Ok(ActiveAccountResolution { account: refreshed, warning: None }),
        Err(error) => Ok(ActiveAccountResolution {
            warning: Some(format!(
                "Could not refresh the Microsoft session for {} ({error}). Singleplayer still works, but servers may reject the login until you sign in again.",
                account.username
            )),
            account,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn live_device_code_is_issued() {
        let info = start_device_code_login().await.unwrap();
        assert_eq!(info.user_code.len(), 8);
        assert!(info.verification_uri.contains("microsoft.com"));
        assert!(poll_device_code_login(&info.device_code).await.unwrap().is_none());
    }

    #[tokio::test]
    #[ignore]
    async fn live_refresh_of_active_microsoft_account() {
        let state = get_auth_state().unwrap();
        let account = state
            .accounts
            .iter()
            .find(|account| account.account_type == "microsoft")
            .cloned()
            .expect("no Microsoft account saved");
        let refreshed = refresh_microsoft_account(&account).await.unwrap();
        assert_eq!(refreshed.id, account.id);
        assert!(refreshed.expires_at > account.expires_at.min(u64::MAX - 1));
        assert_eq!(get_auth_state().unwrap().active_account_id, state.active_account_id);
        println!("refreshed {} until {}", refreshed.username, refreshed.expires_at);
    }
}
