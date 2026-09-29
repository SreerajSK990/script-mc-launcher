use crate::core::auth;
use crate::core::instances::write_json_atomic;
use crate::core::paths;
use crate::core::skins_presets;
use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinEntry {
    pub id: String,
    pub name: String,
    pub texture_url: String,
    pub model: String,
    pub source: String,
    pub author: Option<String>,
    pub category: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinsListResponse {
    pub active_skin_id: Option<String>,
    pub skins: Vec<SkinEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSkinSearchResult {
    pub username: String,
    pub uuid: String,
    pub skin_url: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplySkinResult {
    pub success: bool,
    pub uploaded_to_mojang: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapeEntry {
    pub id: String,
    pub name: String,
    pub texture_url: String,
    pub source: String,
    pub active: Option<bool>,
    pub alias: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapesListResponse {
    pub active_cape_id: Option<String>,
    pub capes: Vec<CapeEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyCapeResult {
    pub success: bool,
    pub equipped_to_mojang: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveSkinParams {
    pub name: String,
    pub texture_data: String,
    pub model: String,
    pub source: String,
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkinsConfigFile {
    pub active_skin_id: Option<String>,
    pub skins: Vec<SkinEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapesConfigFile {
    pub active_cape_id: Option<String>,
    pub capes: Vec<CapeEntry>,
}

fn get_skins_config_path() -> PathBuf {
    paths::get_skins_directory().join("skins.json")
}

fn get_capes_config_path() -> PathBuf {
    paths::get_capes_directory().join("capes.json")
}

fn load_skins_config() -> SkinsConfigFile {
    let path = get_skins_config_path();
    if path.is_file() {
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str::<SkinsConfigFile>(&raw) {
                return cfg;
            }
        }
    }
    SkinsConfigFile {
        active_skin_id: Some("preset_steve".to_string()),
        skins: Vec::new(),
    }
}

fn save_skins_config(cfg: &SkinsConfigFile) -> Result<(), String> {
    write_json_atomic(&get_skins_config_path(), cfg)
}

fn load_capes_config() -> CapesConfigFile {
    let path = get_capes_config_path();
    if path.is_file() {
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str::<CapesConfigFile>(&raw) {
                return cfg;
            }
        }
    }
    CapesConfigFile {
        active_cape_id: None,
        capes: Vec::new(),
    }
}

fn save_capes_config(cfg: &CapesConfigFile) -> Result<(), String> {
    write_json_atomic(&get_capes_config_path(), cfg)
}

async fn resolve_image_bytes(input: &str) -> Result<Vec<u8>, String> {
    if let Some(stripped) = input.strip_prefix("data:image/") {
        let b64 = stripped.split_once(',').map(|(_, b)| b).unwrap_or(stripped);
        base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| e.to_string())
    } else if input.starts_with("http://") || input.starts_with("https://") {
        let client = reqwest::Client::new();
        let resp = client.get(input).send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("HTTP error {}", resp.status()));
        }
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        Ok(bytes.to_vec())
    } else {
        fs::read(input).map_err(|e| e.to_string())
    }
}

pub async fn list_all_skins() -> Result<SkinsListResponse, String> {
    let cfg = load_skins_config();
    let mut all_skins = skins_presets::get_preset_skins();
    all_skins.extend(cfg.skins);
    Ok(SkinsListResponse {
        active_skin_id: cfg.active_skin_id.or_else(|| Some("preset_steve".to_string())),
        skins: all_skins,
    })
}

pub async fn get_active_skin_id() -> Result<Option<String>, String> {
    let cfg = load_skins_config();
    Ok(cfg.active_skin_id.or_else(|| Some("preset_steve".to_string())))
}

pub async fn set_active_skin(skin_id: &str) -> Result<ApplySkinResult, String> {
    let mut cfg = load_skins_config();
    let all = list_all_skins().await?.skins;
    let target = all.into_iter().find(|s| s.id == skin_id).ok_or_else(|| {
        "Selected skin not found in library.".to_string()
    })?;

    cfg.active_skin_id = Some(skin_id.to_string());
    save_skins_config(&cfg)?;

    let auth_state = auth::get_auth_state()?;
    if let Some(active_acc) = auth_state.active_account {
        if active_acc.account_type == "microsoft" && !active_acc.access_token.is_empty() {
            let image_bytes = resolve_image_bytes(&target.texture_url).await?;
            let part = reqwest::multipart::Part::bytes(image_bytes)
                .file_name("skin.png")
                .mime_str("image/png")
                .map_err(|e| e.to_string())?;

            let form = reqwest::multipart::Form::new()
                .text("variant", if target.model == "slim" { "slim" } else { "classic" })
                .part("file", part);

            let client = reqwest::Client::new();
            let resp = client
                .post("https://api.minecraftservices.com/minecraft/profile/skins")
                .header(reqwest::header::AUTHORIZATION, format!("Bearer {}", active_acc.access_token))
                .multipart(form)
                .send()
                .await;

            match resp {
                Ok(r) if r.status().is_success() => {
                    return Ok(ApplySkinResult {
                        success: true,
                        uploaded_to_mojang: true,
                        message: format!("Skin \"{}\" uploaded to your Minecraft account! Changes will appear in-game.", target.name),
                    });
                }
                Ok(r) => {
                    let err = r.text().await.unwrap_or_default();
                    return Ok(ApplySkinResult {
                        success: false,
                        uploaded_to_mojang: false,
                        message: format!("Failed to upload skin to Mojang: {err}"),
                    });
                }
                Err(e) => {
                    return Ok(ApplySkinResult {
                        success: false,
                        uploaded_to_mojang: false,
                        message: e.to_string(),
                    });
                }
            }
        }
    }

    Ok(ApplySkinResult {
        success: true,
        uploaded_to_mojang: false,
        message: format!("Skin \"{}\" set locally. Sign in with a Microsoft account to sync skins to Minecraft servers.", target.name),
    })
}

pub async fn save_skin(params: SaveSkinParams) -> Result<SkinEntry, String> {
    let id = format!("skin_{}", uuid::Uuid::new_v4().simple());
    let image_bytes = resolve_image_bytes(&params.texture_data).await?;

    let skins_dir = paths::get_skins_directory();
    if !skins_dir.exists() {
        fs::create_dir_all(&skins_dir).map_err(|e| e.to_string())?;
    }

    let target_path = skins_dir.join(format!("{id}.png"));
    fs::write(&target_path, &image_bytes).map_err(|e| e.to_string())?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&image_bytes);
    let data_url = format!("data:image/png;base64,{b64}");

    let entry = SkinEntry {
        id,
        name: if params.name.trim().is_empty() { "Custom Skin".to_string() } else { params.name },
        texture_url: data_url,
        model: if params.model == "slim" { "slim".to_string() } else { "classic".to_string() },
        source: params.source,
        author: params.author,
        category: None,
        created_at: Some(Utc::now().to_rfc3339()),
    };

    let mut cfg = load_skins_config();
    cfg.skins.insert(0, entry.clone());
    save_skins_config(&cfg)?;

    Ok(entry)
}

pub async fn delete_skin(skin_id: &str) -> Result<bool, String> {
    if skin_id.starts_with("preset_") {
        return Ok(false);
    }

    let mut cfg = load_skins_config();
    let initial_len = cfg.skins.len();
    cfg.skins.retain(|s| s.id != skin_id);

    if cfg.skins.len() == initial_len {
        return Ok(false);
    }

    if cfg.active_skin_id.as_deref() == Some(skin_id) {
        cfg.active_skin_id = Some("preset_steve".to_string());
    }

    save_skins_config(&cfg)?;

    let target = paths::get_skins_directory().join(format!("{skin_id}.png"));
    if target.is_file() {
        let _ = fs::remove_file(target);
    }

    Ok(true)
}

pub async fn search_player_skin(username: &str) -> Result<PlayerSkinSearchResult, String> {
    let trimmed = username.trim();
    if trimmed.is_empty() {
        return Err("Please enter a valid Minecraft player username.".to_string());
    }

    let client = reqwest::Client::new();
    let profile_url = format!("https://api.mojang.com/users/profiles/minecraft/{trimmed}");
    let profile_res = client.get(&profile_url).send().await.map_err(|e| e.to_string())?;

    if profile_res.status() == 404 || profile_res.status() == 204 {
        return Err(format!("Player \"{trimmed}\" not found."));
    }
    if !profile_res.status().is_success() {
        return Err(format!("Mojang API error: {}", profile_res.status()));
    }

    let profile: serde_json::Value = profile_res.json().await.map_err(|e| e.to_string())?;
    let uuid_str = profile.get("id").and_then(|v| v.as_str()).ok_or("Invalid profile uuid")?;
    let name_str = profile.get("name").and_then(|v| v.as_str()).unwrap_or(trimmed);

    let session_url = format!("https://sessionserver.mojang.com/session/minecraft/profile/{uuid_str}");
    let session_res = client.get(&session_url).send().await.map_err(|e| e.to_string())?;
    if !session_res.status().is_success() {
        return Err(format!("Could not load player skin profile: HTTP {}", session_res.status()));
    }

    let session: serde_json::Value = session_res.json().await.map_err(|e| e.to_string())?;
    let props = session.get("properties").and_then(|p| p.as_array()).ok_or("No properties found")?;
    let textures_prop = props.iter().find(|p| p.get("name").and_then(|n| n.as_str()) == Some("textures")).ok_or(format!("Player \"{name_str}\" has no custom skin set."))?;
    let b64_val = textures_prop.get("value").and_then(|v| v.as_str()).ok_or("No texture property value")?;

    let decoded = base64::engine::general_purpose::STANDARD.decode(b64_val).map_err(|e| e.to_string())?;
    let textures_obj: serde_json::Value = serde_json::from_slice(&decoded).map_err(|e| e.to_string())?;

    let skin_obj = textures_obj.get("textures").and_then(|t| t.get("SKIN")).ok_or(format!("Player \"{name_str}\" has no active skin URL."))?;
    let raw_url = skin_obj.get("url").and_then(|u| u.as_str()).ok_or("No skin url")?;
    let https_url = raw_url.replacen("http://", "https://", 1);

    let skin_bytes = resolve_image_bytes(&https_url).await?;
    let b64_skin = base64::engine::general_purpose::STANDARD.encode(&skin_bytes);
    let data_url = format!("data:image/png;base64,{b64_skin}");

    let model = skin_obj
        .get("metadata")
        .and_then(|m| m.get("model"))
        .and_then(|m| m.as_str())
        .unwrap_or("classic");

    Ok(PlayerSkinSearchResult {
        username: name_str.to_string(),
        uuid: uuid_str.to_string(),
        skin_url: data_url,
        model: if model == "slim" { "slim".to_string() } else { "classic".to_string() },
    })
}

pub async fn list_all_capes() -> Result<CapesListResponse, String> {
    let mut cfg = load_capes_config();
    let mut mojang_capes = Vec::new();

    if let Ok(auth_state) = auth::get_auth_state() {
        if let Some(active_acc) = auth_state.active_account {
            if active_acc.account_type == "microsoft" && !active_acc.access_token.is_empty() {
                let client = reqwest::Client::new();
                if let Ok(resp) = client
                    .get("https://api.minecraftservices.com/minecraft/profile")
                    .header(reqwest::header::AUTHORIZATION, format!("Bearer {}", active_acc.access_token))
                    .send()
                    .await
                {
                    if let Ok(val) = resp.json::<serde_json::Value>().await {
                        if let Some(capes) = val.get("capes").and_then(|c| c.as_array()) {
                            for c in capes {
                                let id = c.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let is_active = c.get("state").and_then(|v| v.as_str()) == Some("ACTIVE");
                                let alias = c.get("alias").and_then(|v| v.as_str()).map(|s| s.to_string());
                                let raw_url = c.get("url").and_then(|v| v.as_str()).unwrap_or("");
                                let texture_url = raw_url.replacen("http://", "https://", 1);
                                let name = alias.as_ref().map(|a| format!("{a} Cape")).unwrap_or_else(|| "Mojang Cape".to_string());

                                if is_active && cfg.active_cape_id.is_none() {
                                    cfg.active_cape_id = Some(id.clone());
                                }

                                mojang_capes.push(CapeEntry {
                                    id,
                                    name,
                                    texture_url,
                                    source: "mojang".to_string(),
                                    active: Some(is_active),
                                    alias,
                                    created_at: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    let mut all_capes = mojang_capes;
    all_capes.extend(skins_presets::get_preset_capes());
    all_capes.extend(cfg.capes);

    Ok(CapesListResponse {
        active_cape_id: cfg.active_cape_id,
        capes: all_capes,
    })
}

pub async fn set_active_cape(cape_id: Option<String>) -> Result<ApplyCapeResult, String> {
    let mut cfg = load_capes_config();

    let Some(id) = cape_id else {
        cfg.active_cape_id = None;
        save_capes_config(&cfg)?;

        if let Ok(auth_state) = auth::get_auth_state() {
            if let Some(active_acc) = auth_state.active_account {
                if active_acc.account_type == "microsoft" && !active_acc.access_token.is_empty() {
                    let client = reqwest::Client::new();
                    let _ = client
                        .delete("https://api.minecraftservices.com/minecraft/profile/capes/active")
                        .header(reqwest::header::AUTHORIZATION, format!("Bearer {}", active_acc.access_token))
                        .send()
                        .await;
                }
            }
        }

        return Ok(ApplyCapeResult {
            success: true,
            equipped_to_mojang: true,
            message: "Cape unequipped successfully.".to_string(),
        });
    };

    let all = list_all_capes().await?.capes;
    let target = all.into_iter().find(|c| c.id == id).ok_or("Selected cape not found.")?;

    cfg.active_cape_id = Some(id.clone());
    save_capes_config(&cfg)?;

    if target.source == "mojang" {
        if let Ok(auth_state) = auth::get_auth_state() {
            if let Some(active_acc) = auth_state.active_account {
                if active_acc.account_type == "microsoft" && !active_acc.access_token.is_empty() {
                    let client = reqwest::Client::new();
                    let payload = serde_json::json!({ "capeId": target.id });
                    let resp = client
                        .put("https://api.minecraftservices.com/minecraft/profile/capes/active")
                        .header(reqwest::header::AUTHORIZATION, format!("Bearer {}", active_acc.access_token))
                        .json(&payload)
                        .send()
                        .await;

                    match resp {
                        Ok(r) if r.status().is_success() => {
                            return Ok(ApplyCapeResult {
                                success: true,
                                equipped_to_mojang: true,
                                message: format!("Cape \"{}\" equipped to your Minecraft account!", target.name),
                            });
                        }
                        Ok(r) => {
                            let err = r.text().await.unwrap_or_default();
                            return Ok(ApplyCapeResult {
                                success: true,
                                equipped_to_mojang: false,
                                message: format!("Cape selected locally, but Mojang equip failed: {err}"),
                            });
                        }
                        Err(e) => {
                            return Ok(ApplyCapeResult {
                                success: true,
                                equipped_to_mojang: false,
                                message: format!("Cape selected locally, but network error: {e}"),
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(ApplyCapeResult {
        success: true,
        equipped_to_mojang: false,
        message: format!("Cape \"{}\" selected for preview.", target.name),
    })
}

pub async fn save_custom_cape(name: &str, texture_data: &str) -> Result<CapeEntry, String> {
    let id = format!("custom_cape_{}", uuid::Uuid::new_v4().simple());
    let image_bytes = resolve_image_bytes(texture_data).await?;

    let capes_dir = paths::get_capes_directory();
    if !capes_dir.exists() {
        fs::create_dir_all(&capes_dir).map_err(|e| e.to_string())?;
    }

    let target_path = capes_dir.join(format!("{id}.png"));
    fs::write(&target_path, &image_bytes).map_err(|e| e.to_string())?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&image_bytes);
    let data_url = format!("data:image/png;base64,{b64}");

    let entry = CapeEntry {
        id,
        name: if name.trim().is_empty() { "Custom Cape".to_string() } else { name.trim().to_string() },
        texture_url: data_url,
        source: "custom".to_string(),
        active: None,
        alias: None,
        created_at: Some(Utc::now().to_rfc3339()),
    };

    let mut cfg = load_capes_config();
    cfg.capes.push(entry.clone());
    save_capes_config(&cfg)?;

    Ok(entry)
}

pub async fn delete_custom_cape(cape_id: &str) -> Result<bool, String> {
    let mut cfg = load_capes_config();
    let initial_len = cfg.capes.len();
    cfg.capes.retain(|c| c.id != cape_id);

    if cfg.capes.len() == initial_len {
        return Ok(false);
    }

    if cfg.active_cape_id.as_deref() == Some(cape_id) {
        cfg.active_cape_id = None;
    }

    save_capes_config(&cfg)?;

    let target = paths::get_capes_directory().join(format!("{cape_id}.png"));
    if target.is_file() {
        let _ = fs::remove_file(target);
    }

    Ok(true)
}

pub async fn fetch_optifine_cape(username: &str) -> Result<Option<CapeEntry>, String> {
    let trimmed = username.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let url = format!("http://optifine.net/capes/{trimmed}.png");
    let client = reqwest::Client::new();
    let Ok(resp) = client.get(&url).send().await else {
        return Ok(None);
    };

    if !resp.status().is_success() {
        return Ok(None);
    }

    let Ok(bytes) = resp.bytes().await else {
        return Ok(None);
    };

    if bytes.len() < 50 {
        return Ok(None);
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:image/png;base64,{b64}");

    Ok(Some(CapeEntry {
        id: format!("optifine_{}", trimmed.to_lowercase()),
        name: format!("{trimmed}'s OptiFine Cape"),
        texture_url: data_url,
        source: "optifine".to_string(),
        active: None,
        alias: None,
        created_at: None,
    }))
}
