use crate::core::instances::write_json_atomic;
use crate::core::paths;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha1::Digest;
use std::fs;
use std::path::{Path, PathBuf};

const MODRINTH_API_BASE: &str = "https://api.modrinth.com/v2";
const CURSEFORGE_API_BASE: &str = "https://api.curseforge.com/v1";
const MINECRAFT_GAME_ID: u64 = 432;
const MODS_CLASS_ID: u64 = 6;
const RESOURCEPACKS_CLASS_ID: u64 = 12;
const MODPACKS_CLASS_ID: u64 = 4471;
const USER_AGENT: &str = "ScriptLauncher/0.18.4 (github.com/SreerajSK990/script-mc-launcher)";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModSearchParams {
    pub query: Option<String>,
    pub minecraft_version: Option<String>,
    pub loader: Option<String>,
    pub project_type: Option<String>,
    pub source: Option<String>,
    pub category: Option<String>,
    pub limit: Option<u64>,
    pub offset: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModSearchResult {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub author: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub source: String,
    pub categories: Vec<String>,
    pub loaders: Vec<String>,
    pub project_type: Option<String>,
    pub latest_version: Option<String>,
    pub client_side: Option<String>,
    pub server_side: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDependency {
    pub project_id: Option<String>,
    pub version_id: Option<String>,
    pub r#type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModVersionFile {
    pub dependencies: Option<Vec<ModDependency>>,
    pub shader_loaders: Option<Vec<String>>,
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub download_url: Option<String>,
    pub website_url: Option<String>,
    pub filename: String,
    pub size_bytes: u64,
    pub sha512: Option<String>,
    pub sha1: Option<String>,
    pub release_type: String,
    pub date_published: String,
    pub changelog: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDetailLink {
    pub issues: Option<String>,
    pub source: Option<String>,
    pub wiki: Option<String>,
    pub discord: Option<String>,
    pub donate: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDetailLicense {
    pub id: String,
    pub name: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDetailCreator {
    pub name: String,
    pub role: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDetailGalleryItem {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDetail {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub summary: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub followers: Option<u64>,
    pub source: String,
    pub categories: Vec<String>,
    pub loaders: Vec<String>,
    pub game_versions: Vec<String>,
    pub client_side: Option<String>,
    pub server_side: Option<String>,
    pub links: ModDetailLink,
    pub license: Option<ModDetailLicense>,
    pub creators: Vec<ModDetailCreator>,
    pub gallery: Vec<ModDetailGalleryItem>,
    pub published_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModRecord {
    pub version_id: Option<String>,
    pub dependencies: Option<Vec<ModDependency>>,
    pub id: String,
    pub name: String,
    pub version: String,
    pub filename: String,
    pub source: String,
    pub icon_url: Option<String>,
    pub installed_at: String,
    pub enabled: bool,
    pub file_size_bytes: u64,
    pub game_version: Option<String>,
    pub loader: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallModMetadata {
    pub id: String,
    pub name: String,
    pub source: String,
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallModPayload {
    pub instance_id: String,
    pub version_file: ModVersionFile,
    pub mod_metadata: InstallModMetadata,
    pub old_filename: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModUpdateInfo {
    pub mod_id: String,
    pub name: String,
    pub current_version: String,
    pub current_filename: String,
    pub latest_version: String,
    pub source: String,
    pub version_file: ModVersionFile,
    pub release_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModUpdateFailure {
    pub mod_id: String,
    pub source: String,
    pub name: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModUpdateResult {
    pub success: bool,
    pub updated_count: usize,
    pub failed_count: usize,
    pub errors: Vec<String>,
    pub failures: Vec<ModUpdateFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallDroppedModsResult {
    pub success: bool,
    pub installed_mods: Vec<InstalledModRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct LauncherSettings {
    pub curse_forge_api_key: Option<String>,
    pub default_ram_mb: Option<u64>,
    pub custom_java_path: Option<String>,
}

fn get_settings_path() -> PathBuf {
    paths::get_launcher_root_directory().join("settings.json")
}

fn load_launcher_settings() -> LauncherSettings {
    let path = get_settings_path();
    if path.is_file() {
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<LauncherSettings>(&raw) {
                return settings;
            }
        }
    }
    LauncherSettings::default()
}

pub fn get_curseforge_key() -> Option<String> {
    let settings = load_launcher_settings();
    if let Some(key) = settings.curse_forge_api_key {
        if !key.trim().is_empty() {
            return Some(key.trim().to_string());
        }
    }
    std::env::var("CURSEFORGE_API_KEY").ok()
}

pub fn set_curseforge_key(key: Option<String>) -> Result<bool, String> {
    let mut settings = load_launcher_settings();
    settings.curse_forge_api_key = key.map(|k| k.trim().to_string()).filter(|k| !k.is_empty());
    write_json_atomic(&get_settings_path(), &settings)?;
    Ok(true)
}

pub fn get_mods_directory(instance_id: &str) -> PathBuf {
    paths::get_instance_minecraft_path(instance_id).join("mods")
}

pub fn get_mods_metadata_path(instance_id: &str) -> PathBuf {
    paths::get_instance_path(instance_id).join("mods.json")
}

pub async fn search_modrinth(params: &ModSearchParams) -> Result<Vec<ModSearchResult>, String> {
    let project_type = params.project_type.as_deref().unwrap_or("mod");
    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{project_type}")]];

    if let Some(loader) = &params.loader {
        if project_type == "mod" {
            facets.push(vec![format!("categories:{}", loader.to_lowercase())]);
        }
    }

    if let Some(mc_ver) = &params.minecraft_version {
        facets.push(vec![format!("versions:{mc_ver}")]);
    }

    if let Some(cat) = &params.category {
        if cat != "all" {
            facets.push(vec![format!("categories:{}", cat.to_lowercase())]);
        }
    }

    let facets_json = serde_json::to_string(&facets).unwrap_or_else(|_| "[]".to_string());
    let limit = params.limit.unwrap_or(24);
    let offset = params.offset.unwrap_or(0);
    let index = if params.query.as_ref().map(|q| !q.trim().is_empty()).unwrap_or(false) {
        "relevance"
    } else {
        "downloads"
    };

    let mut query_pairs = vec![
        ("facets", facets_json),
        ("limit", limit.to_string()),
        ("offset", offset.to_string()),
        ("index", index.to_string()),
    ];

    let query_str = params.query.as_ref().map(|q| q.trim().to_string()).unwrap_or_default();
    if !query_str.is_empty() {
        query_pairs.push(("query", query_str));
    }

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{MODRINTH_API_BASE}/search"))
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .query(&query_pairs)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Modrinth search error: HTTP {}", resp.status()));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let hits = data.get("hits").and_then(|h| h.as_array()).cloned().unwrap_or_default();

    let mut results = Vec::new();
    for hit in hits {
        let id = hit.get("project_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let slug = hit.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let name = hit.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let author = hit.get("author").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let description = hit.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let icon_url = hit.get("icon_url").and_then(|v| v.as_str()).map(|s| s.to_string());
        let downloads = hit.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0);
        let latest_version = hit.get("latest_version").and_then(|v| v.as_str()).map(|s| s.to_string());
        let client_side = hit.get("client_side").and_then(|v| v.as_str()).map(|s| s.to_string());
        let server_side = hit.get("server_side").and_then(|v| v.as_str()).map(|s| s.to_string());

        let raw_categories = hit.get("categories").and_then(|c| c.as_array()).cloned().unwrap_or_default();
        let mut loaders = Vec::new();
        let mut categories = Vec::new();

        for cat_val in raw_categories {
            if let Some(cat) = cat_val.as_str() {
                let lower = cat.to_lowercase();
                if ["fabric", "forge", "neoforge", "quilt"].contains(&lower.as_str()) {
                    loaders.push(lower);
                } else {
                    categories.push(cat.to_string());
                }
            }
        }

        results.push(ModSearchResult {
            id,
            slug,
            name,
            author,
            description,
            icon_url,
            downloads,
            source: "modrinth".to_string(),
            categories,
            loaders,
            project_type: Some(project_type.to_string()),
            latest_version,
            client_side,
            server_side,
        });
    }

    Ok(results)
}

fn convert_loader_to_curseforge_num(loader: &str) -> Option<u64> {
    match loader.to_lowercase().as_str() {
        "forge" => Some(1),
        "fabric" => Some(4),
        "quilt" => Some(5),
        "neoforge" => Some(6),
        _ => None,
    }
}

pub async fn search_curseforge(
    params: &ModSearchParams,
    api_key: &str,
) -> Result<Vec<ModSearchResult>, String> {
    let mut class_id = MODS_CLASS_ID;
    if let Some(pt) = &params.project_type {
        if pt == "modpack" {
            class_id = MODPACKS_CLASS_ID;
        } else if pt == "resourcepack" {
            class_id = RESOURCEPACKS_CLASS_ID;
        }
    }

    let mut query_pairs = vec![
        ("gameId".to_string(), MINECRAFT_GAME_ID.to_string()),
        ("classId".to_string(), class_id.to_string()),
        ("pageSize".to_string(), params.limit.unwrap_or(24).to_string()),
        ("index".to_string(), params.offset.unwrap_or(0).to_string()),
    ];

    if let Some(q) = &params.query {
        if !q.trim().is_empty() {
            query_pairs.push(("searchFilter".to_string(), q.trim().to_string()));
            query_pairs.push(("sortField".to_string(), "1".to_string()));
        } else {
            query_pairs.push(("sortField".to_string(), "2".to_string()));
        }
    } else {
        query_pairs.push(("sortField".to_string(), "2".to_string()));
    }

    if let Some(mc_ver) = &params.minecraft_version {
        query_pairs.push(("gameVersion".to_string(), mc_ver.clone()));
    }

    if let Some(loader) = &params.loader {
        if let Some(num) = convert_loader_to_curseforge_num(loader) {
            query_pairs.push(("modLoaderType".to_string(), num.to_string()));
        }
    }

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{CURSEFORGE_API_BASE}/mods/search"))
        .header("x-api-key", api_key)
        .query(&query_pairs)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("CurseForge search error: HTTP {}", resp.status()));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let hits = data.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default();

    let mut results = Vec::new();
    for hit in hits {
        let id_num = hit.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
        let slug = hit.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let name = hit.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let summary = hit.get("summary").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let downloads = hit.get("downloadCount").and_then(|v| v.as_u64()).unwrap_or(0);

        let icon_url = hit
            .get("logo")
            .and_then(|l| l.get("thumbnailUrl").or_else(|| l.get("url")))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        let author = hit
            .get("authors")
            .and_then(|a| a.as_array())
            .and_then(|a| a.first())
            .and_then(|f| f.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string();

        let categories: Vec<String> = hit
            .get("categories")
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|c| c.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let mut loaders = Vec::new();
        if let Some(files) = hit.get("latestFilesIndexes").and_then(|f| f.as_array()) {
            for f in files {
                if let Some(lt) = f.get("modLoader").and_then(|l| l.as_u64()) {
                    let l_name = match lt {
                        1 => "forge",
                        4 => "fabric",
                        5 => "quilt",
                        6 => "neoforge",
                        _ => "",
                    };
                    if !l_name.is_empty() && !loaders.contains(&l_name.to_string()) {
                        loaders.push(l_name.to_string());
                    }
                }
            }
        }

        results.push(ModSearchResult {
            id: id_num.to_string(),
            slug,
            name,
            author,
            description: summary,
            icon_url,
            downloads,
            source: "curseforge".to_string(),
            categories,
            loaders,
            project_type: params.project_type.clone(),
            latest_version: None,
            client_side: None,
            server_side: None,
        });
    }

    Ok(results)
}

pub async fn search_all_mods(params: ModSearchParams) -> Result<Vec<ModSearchResult>, String> {
    let source = params.source.as_deref().unwrap_or("all");

    if source == "modrinth" {
        return search_modrinth(&params).await;
    }

    if source == "curseforge" {
        if let Some(key) = get_curseforge_key() {
            return search_curseforge(&params, &key).await;
        }
        return Ok(Vec::new());
    }

    let mut all_results = Vec::new();
    if let Ok(modrinth_results) = search_modrinth(&params).await {
        all_results.extend(modrinth_results);
    }

    if let Some(key) = get_curseforge_key() {
        if let Ok(curseforge_results) = search_curseforge(&params, &key).await {
            all_results.extend(curseforge_results);
        }
    }

    let mut seen = std::collections::HashSet::new();
    let deduped = all_results
        .into_iter()
        .filter(|item| seen.insert(format!("{}:{}", item.source, item.id)))
        .collect();

    Ok(deduped)
}

pub async fn get_modrinth_project_versions(
    project_id: &str,
    minecraft_version: Option<&str>,
    loader: Option<&str>,
) -> Result<Vec<ModVersionFile>, String> {
    let mut query_pairs = Vec::new();

    if let Some(l) = loader {
        let arr = serde_json::to_string(&vec![l.to_lowercase()]).unwrap_or_default();
        query_pairs.push(("loaders", arr));
    }

    if let Some(v) = minecraft_version {
        let arr = serde_json::to_string(&vec![v]).unwrap_or_default();
        query_pairs.push(("game_versions", arr));
    }

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{MODRINTH_API_BASE}/project/{project_id}/version"))
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .query(&query_pairs)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Failed to fetch versions: HTTP {}", resp.status()));
    }

    let data: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;
    let mut files = Vec::new();

    for v in data {
        let version_id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let proj_id = v.get("project_id").and_then(|x| x.as_str()).unwrap_or(project_id).to_string();
        let name = v.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let version_number = v.get("version_number").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let release_type = v.get("version_type").and_then(|x| x.as_str()).unwrap_or("release").to_string();
        let date_published = v.get("date_published").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let changelog = v.get("changelog").and_then(|x| x.as_str()).map(|s| s.to_string());

        let game_versions: Vec<String> = v
            .get("game_versions")
            .and_then(|gv| gv.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();

        let loaders: Vec<String> = v
            .get("loaders")
            .and_then(|l| l.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();

        let dependencies: Vec<ModDependency> = v
            .get("dependencies")
            .and_then(|d| d.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|dep| ModDependency {
                        project_id: dep.get("project_id").and_then(|x| x.as_str()).map(|s| s.to_string()),
                        version_id: dep.get("version_id").and_then(|x| x.as_str()).map(|s| s.to_string()),
                        r#type: dep.get("dependency_type").and_then(|x| x.as_str()).unwrap_or("optional").to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default();

        if let Some(file_entries) = v.get("files").and_then(|f| f.as_array()) {
            let primary = file_entries.iter().find(|f| f.get("primary").and_then(|p| p.as_bool()).unwrap_or(false)).or_else(|| file_entries.first());
            if let Some(pf) = primary {
                let filename = pf.get("filename").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let download_url = pf.get("url").and_then(|x| x.as_str()).map(|s| s.to_string());
                let size_bytes = pf.get("size").and_then(|x| x.as_u64()).unwrap_or(0);
                let sha512 = pf.get("hashes").and_then(|h| h.get("sha512")).and_then(|s| s.as_str()).map(|s| s.to_string());
                let sha1 = pf.get("hashes").and_then(|h| h.get("sha1")).and_then(|s| s.as_str()).map(|s| s.to_string());

                files.push(ModVersionFile {
                    dependencies: Some(dependencies),
                    shader_loaders: None,
                    id: version_id,
                    project_id: proj_id,
                    name,
                    version_number,
                    game_versions,
                    loaders,
                    download_url,
                    website_url: None,
                    filename,
                    size_bytes,
                    sha512,
                    sha1,
                    release_type,
                    date_published,
                    changelog,
                });
            }
        }
    }

    Ok(files)
}

pub async fn get_curseforge_mod_versions(
    mod_id: &str,
    minecraft_version: Option<&str>,
    loader: Option<&str>,
    api_key: &str,
) -> Result<Vec<ModVersionFile>, String> {
    let mut query_pairs = Vec::new();
    if let Some(v) = minecraft_version {
        query_pairs.push(("gameVersion".to_string(), v.to_string()));
    }
    if let Some(l) = loader {
        if let Some(num) = convert_loader_to_curseforge_num(l) {
            query_pairs.push(("modLoaderType".to_string(), num.to_string()));
        }
    }

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{CURSEFORGE_API_BASE}/mods/{mod_id}/files"))
        .header("x-api-key", api_key)
        .query(&query_pairs)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("CurseForge files error: HTTP {}", resp.status()));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let files_arr = data.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default();

    let mut result = Vec::new();
    for f in files_arr {
        let file_id = f.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
        let name = f.get("displayName").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let filename = f.get("fileName").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let size_bytes = f.get("fileLength").and_then(|v| v.as_u64()).unwrap_or(0);
        let date_published = f.get("fileDate").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let download_url = f.get("downloadUrl").and_then(|v| v.as_str()).map(|s| s.to_string());
        let release_type_num = f.get("releaseType").and_then(|v| v.as_u64()).unwrap_or(1);
        let release_type = match release_type_num {
            2 => "beta",
            3 => "alpha",
            _ => "release",
        }.to_string();

        let game_versions: Vec<String> = f
            .get("gameVersions")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();

        let mut sha1 = None;
        if let Some(hashes) = f.get("hashes").and_then(|h| h.as_array()) {
            for h in hashes {
                if h.get("algo").and_then(|a| a.as_u64()) == Some(1) {
                    sha1 = h.get("value").and_then(|v| v.as_str()).map(|s| s.to_string());
                }
            }
        }

        result.push(ModVersionFile {
            dependencies: None,
            shader_loaders: None,
            id: file_id.to_string(),
            project_id: mod_id.to_string(),
            name,
            version_number: file_id.to_string(),
            game_versions,
            loaders: loader.map(|l| vec![l.to_string()]).unwrap_or_default(),
            download_url,
            website_url: None,
            filename,
            size_bytes,
            sha512: None,
            sha1,
            release_type,
            date_published,
            changelog: None,
        });
    }

    Ok(result)
}

pub async fn get_mod_versions(
    project_id: &str,
    source: &str,
    minecraft_version: Option<&str>,
    loader: Option<&str>,
) -> Result<Vec<ModVersionFile>, String> {
    if source == "curseforge" {
        if let Some(key) = get_curseforge_key() {
            return get_curseforge_mod_versions(project_id, minecraft_version, loader, &key).await;
        }
        return Ok(Vec::new());
    }

    get_modrinth_project_versions(project_id, minecraft_version, loader).await
}

pub async fn get_mod_detail(source: &str, id: &str) -> Result<ModDetail, String> {
    if source == "curseforge" {
        let key = get_curseforge_key().ok_or("CurseForge API key not configured")?;
        let client = reqwest::Client::new();
        let resp = client
            .get(format!("{CURSEFORGE_API_BASE}/mods/{id}"))
            .header("x-api-key", key)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let m = data.get("data").ok_or("No data in response")?;

        let id_str = m.get("id").and_then(|v| v.as_u64()).unwrap_or(0).to_string();
        let slug = m.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let name = m.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let summary = m.get("summary").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let downloads = m.get("downloadCount").and_then(|v| v.as_u64()).unwrap_or(0);
        let icon_url = m.get("logo").and_then(|l| l.get("url")).and_then(|u| u.as_str()).map(|s| s.to_string());

        let categories: Vec<String> = m
            .get("categories")
            .and_then(|c| c.as_array())
            .map(|arr| arr.iter().filter_map(|c| c.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())).collect())
            .unwrap_or_default();

        let creators: Vec<ModDetailCreator> = m
            .get("authors")
            .and_then(|a| a.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|a| a.get("name").and_then(|n| n.as_str()).map(|name| ModDetailCreator {
                        name: name.to_string(),
                        role: None,
                        avatar_url: None,
                    }))
                    .collect()
            })
            .unwrap_or_default();

        return Ok(ModDetail {
            id: id_str,
            slug,
            name,
            summary: summary.clone(),
            description: summary,
            icon_url,
            downloads,
            followers: None,
            source: "curseforge".to_string(),
            categories,
            loaders: Vec::new(),
            game_versions: Vec::new(),
            client_side: None,
            server_side: None,
            links: ModDetailLink {
                issues: m.get("links").and_then(|l| l.get("issuesUrl")).and_then(|u| u.as_str()).map(|s| s.to_string()),
                source: m.get("links").and_then(|l| l.get("sourceUrl")).and_then(|u| u.as_str()).map(|s| s.to_string()),
                wiki: m.get("links").and_then(|l| l.get("wikiUrl")).and_then(|u| u.as_str()).map(|s| s.to_string()),
                discord: None,
                donate: None,
            },
            license: None,
            creators,
            gallery: Vec::new(),
            published_at: m.get("dateCreated").and_then(|v| v.as_str()).map(|s| s.to_string()),
            updated_at: m.get("dateModified").and_then(|v| v.as_str()).map(|s| s.to_string()),
        });
    }

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{MODRINTH_API_BASE}/project/{id}"))
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let p: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let project_id = p.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let slug = p.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let name = p.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let summary = p.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let description = p.get("body").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let icon_url = p.get("icon_url").and_then(|v| v.as_str()).map(|s| s.to_string());
    let downloads = p.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0);
    let followers = p.get("followers").and_then(|v| v.as_u64());

    let categories: Vec<String> = p
        .get("categories")
        .and_then(|c| c.as_array())
        .map(|arr| arr.iter().filter_map(|c| c.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let loaders: Vec<String> = p
        .get("loaders")
        .and_then(|c| c.as_array())
        .map(|arr| arr.iter().filter_map(|c| c.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let game_versions: Vec<String> = p
        .get("game_versions")
        .and_then(|c| c.as_array())
        .map(|arr| arr.iter().filter_map(|c| c.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let gallery: Vec<ModDetailGalleryItem> = p
        .get("gallery")
        .and_then(|g| g.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    item.get("url").and_then(|u| u.as_str()).map(|url| ModDetailGalleryItem {
                        url: url.to_string(),
                        title: item.get("title").and_then(|t| t.as_str()).map(|s| s.to_string()),
                        description: item.get("description").and_then(|d| d.as_str()).map(|s| s.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(ModDetail {
        id: project_id,
        slug,
        name,
        summary,
        description,
        icon_url,
        downloads,
        followers,
        source: "modrinth".to_string(),
        categories,
        loaders,
        game_versions,
        client_side: p.get("client_side").and_then(|v| v.as_str()).map(|s| s.to_string()),
        server_side: p.get("server_side").and_then(|v| v.as_str()).map(|s| s.to_string()),
        links: ModDetailLink {
            issues: p.get("issues_url").and_then(|u| u.as_str()).map(|s| s.to_string()),
            source: p.get("source_url").and_then(|u| u.as_str()).map(|s| s.to_string()),
            wiki: p.get("wiki_url").and_then(|u| u.as_str()).map(|s| s.to_string()),
            discord: p.get("discord_url").and_then(|u| u.as_str()).map(|s| s.to_string()),
            donate: p.get("donation_urls").and_then(|d| d.as_array()).and_then(|a| a.first()).and_then(|x| x.get("url")).and_then(|u| u.as_str()).map(|s| s.to_string()),
        },
        license: p.get("license").and_then(|l| l.get("id")).and_then(|i| i.as_str()).map(|id| ModDetailLicense {
            id: id.to_string(),
            name: p.get("license").and_then(|l| l.get("name")).and_then(|n| n.as_str()).map(|s| s.to_string()),
            url: p.get("license").and_then(|l| l.get("url")).and_then(|u| u.as_str()).map(|s| s.to_string()),
        }),
        creators: Vec::new(),
        gallery,
        published_at: p.get("published").and_then(|v| v.as_str()).map(|s| s.to_string()),
        updated_at: p.get("updated").and_then(|v| v.as_str()).map(|s| s.to_string()),
    })
}

pub fn list_installed_mods(instance_id: &str) -> Result<Vec<InstalledModRecord>, String> {
    let mods_dir = get_mods_directory(instance_id);
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    }

    let meta_path = get_mods_metadata_path(instance_id);
    let saved_mods: Vec<InstalledModRecord> = if meta_path.is_file() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str(&r).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    struct DiskModInfo {
        enabled: bool,
        size: u64,
    }

    let mut disk_map = std::collections::HashMap::new();

    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if !meta.is_file() {
                continue;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".jar") {
                disk_map.insert(name.clone(), DiskModInfo { enabled: true, size: meta.len() });
            } else if let Some(base) = name.strip_suffix(".jar.disabled") {
                disk_map.insert(format!("{base}.jar"), DiskModInfo { enabled: false, size: meta.len() });
            }
        }
    }

    let mut synced = Vec::new();
    let mut recognized = std::collections::HashSet::new();

    for record in saved_mods {
        if let Some(info) = disk_map.get(&record.filename) {
            let mut up = record.clone();
            up.enabled = info.enabled;
            up.file_size_bytes = info.size;
            recognized.insert(record.filename.clone());
            synced.push(up);
        }
    }

    for (filename, info) in &disk_map {
        if !recognized.contains(filename) {
            let clean_name = filename.strip_suffix(".jar").unwrap_or(filename);
            synced.push(InstalledModRecord {
                version_id: None,
                dependencies: None,
                id: format!("manual-{}", clean_name.to_lowercase()),
                name: clean_name.to_string(),
                version: "custom".to_string(),
                filename: filename.clone(),
                source: "modrinth".to_string(),
                icon_url: None,
                installed_at: Utc::now().to_rfc3339(),
                enabled: info.enabled,
                file_size_bytes: info.size,
                game_version: None,
                loader: None,
            });
        }
    }

    let _ = write_json_atomic(&meta_path, &synced);
    Ok(synced)
}

pub async fn install_mod_to_instance(payload: InstallModPayload) -> Result<InstalledModRecord, String> {
    let mods_dir = get_mods_directory(&payload.instance_id);
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    }

    let download_url = payload
        .version_file
        .download_url
        .as_deref()
        .ok_or("Direct download is not available for this version.")?;

    let filename = &payload.version_file.filename;
    let target_dest = mods_dir.join(filename);

    let client = reqwest::Client::new();
    let resp = client.get(download_url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Download failed: HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    if let Some(expected_512) = &payload.version_file.sha512 {
        let mut hasher = sha2::Sha512::new();
        hasher.update(&bytes);
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected_512) {
            return Err("SHA-512 integrity check failed for downloaded mod".to_string());
        }
    } else if let Some(expected_1) = &payload.version_file.sha1 {
        let mut hasher = sha1::Sha1::new();
        hasher.update(&bytes);
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected_1) {
            return Err("SHA-1 integrity check failed for downloaded mod".to_string());
        }
    }

    fs::write(&target_dest, &bytes).map_err(|e| e.to_string())?;

    if let Some(old_name) = &payload.old_filename {
        if old_name != filename {
            let _ = fs::remove_file(mods_dir.join(old_name));
            let _ = fs::remove_file(mods_dir.join(format!("{old_name}.disabled")));
        }
    }

    let new_record = InstalledModRecord {
        version_id: Some(payload.version_file.id.clone()),
        dependencies: payload.version_file.dependencies.clone(),
        id: payload.mod_metadata.id.clone(),
        name: payload.mod_metadata.name.clone(),
        version: payload.version_file.version_number.clone(),
        filename: filename.clone(),
        source: payload.mod_metadata.source.clone(),
        icon_url: payload.mod_metadata.icon_url.clone(),
        installed_at: Utc::now().to_rfc3339(),
        enabled: true,
        file_size_bytes: bytes.len() as u64,
        game_version: payload.version_file.game_versions.first().cloned(),
        loader: payload.version_file.loaders.first().cloned(),
    };

    let meta_path = get_mods_metadata_path(&payload.instance_id);
    let mut saved_mods: Vec<InstalledModRecord> = if meta_path.is_file() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str(&r).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    saved_mods.retain(|m| {
        !(m.id == new_record.id && m.source == new_record.source)
            && m.filename != *filename
            && payload.old_filename.as_deref() != Some(&m.filename)
    });

    saved_mods.push(new_record.clone());
    write_json_atomic(&meta_path, &saved_mods)?;

    Ok(new_record)
}

pub fn toggle_mod_enabled(instance_id: &str, filename: &str, enable: bool) -> Result<bool, String> {
    let mods_dir = get_mods_directory(instance_id);
    let active = mods_dir.join(filename);
    let disabled = mods_dir.join(format!("{filename}.disabled"));

    if enable {
        if disabled.exists() {
            fs::rename(&disabled, &active).map_err(|e| e.to_string())?;
        }
    } else if active.exists() {
        fs::rename(&active, &disabled).map_err(|e| e.to_string())?;
    }

    let meta_path = get_mods_metadata_path(instance_id);
    if meta_path.is_file() {
        if let Some(mut saved_mods) = fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str::<Vec<InstalledModRecord>>(&r).ok())
        {
            if let Some(target) = saved_mods.iter_mut().find(|m| m.filename == filename) {
                target.enabled = enable;
                let _ = write_json_atomic(&meta_path, &saved_mods);
            }
        }
    }

    Ok(true)
}

pub fn delete_installed_mod(instance_id: &str, filename: &str) -> Result<bool, String> {
    let mods_dir = get_mods_directory(instance_id);
    let active = mods_dir.join(filename);
    let disabled = mods_dir.join(format!("{filename}.disabled"));

    if active.exists() {
        let _ = fs::remove_file(active);
    }
    if disabled.exists() {
        let _ = fs::remove_file(disabled);
    }

    let meta_path = get_mods_metadata_path(instance_id);
    if meta_path.is_file() {
        if let Some(mut saved_mods) = fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str::<Vec<InstalledModRecord>>(&r).ok())
        {
            saved_mods.retain(|m| m.filename != filename);
            let _ = write_json_atomic(&meta_path, &saved_mods);
        }
    }

    Ok(true)
}

pub fn install_dropped_mod_files(
    instance_id: &str,
    file_paths: &[String],
) -> Result<InstallDroppedModsResult, String> {
    let mods_dir = get_mods_directory(instance_id);
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    }

    let mut installed_mods = Vec::new();

    for file_path in file_paths {
        let src = Path::new(file_path);
        if !src.exists() {
            continue;
        }

        let Some(name) = src.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        if !name.ends_with(".jar") {
            continue;
        }

        let target = mods_dir.join(name);
        if let Err(e) = fs::copy(src, &target) {
            eprintln!("Failed to copy dropped mod {name}: {e}");
            continue;
        }

        let size = target.metadata().map(|m| m.len()).unwrap_or(0);
        let clean_name = name.strip_suffix(".jar").unwrap_or(name);

        let record = InstalledModRecord {
            version_id: None,
            dependencies: None,
            id: format!("manual-{}", clean_name.to_lowercase()),
            name: clean_name.to_string(),
            version: "custom".to_string(),
            filename: name.to_string(),
            source: "modrinth".to_string(),
            icon_url: None,
            installed_at: Utc::now().to_rfc3339(),
            enabled: true,
            file_size_bytes: size,
            game_version: None,
            loader: None,
        };

        installed_mods.push(record);
    }

    let meta_path = get_mods_metadata_path(instance_id);
    let mut saved_mods: Vec<InstalledModRecord> = if meta_path.is_file() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str(&r).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    for m in &installed_mods {
        saved_mods.retain(|x| x.filename != m.filename);
        saved_mods.push(m.clone());
    }

    let _ = write_json_atomic(&meta_path, &saved_mods);

    Ok(InstallDroppedModsResult {
        success: true,
        installed_mods,
    })
}

pub async fn check_mod_updates(instance_id: &str) -> Result<Vec<ModUpdateInfo>, String> {
    let installed = list_installed_mods(instance_id)?;
    let mut updates = Vec::new();

    for m in installed {
        if m.id.starts_with("manual-") {
            continue;
        }

        if let Ok(versions) = get_mod_versions(&m.id, &m.source, m.game_version.as_deref(), m.loader.as_deref()).await {
            if let Some(latest) = versions.first() {
                if latest.version_number != m.version && latest.filename != m.filename {
                    updates.push(ModUpdateInfo {
                        mod_id: m.id.clone(),
                        name: m.name.clone(),
                        current_version: m.version.clone(),
                        current_filename: m.filename.clone(),
                        latest_version: latest.version_number.clone(),
                        source: m.source.clone(),
                        version_file: latest.clone(),
                        release_type: latest.release_type.clone(),
                    });
                }
            }
        }
    }

    Ok(updates)
}

pub async fn update_all_mods(
    instance_id: &str,
    updates: &[ModUpdateInfo],
) -> Result<ModUpdateResult, String> {
    let mut updated_count = 0;
    let mut failed_count = 0;
    let mut errors = Vec::new();
    let mut failures = Vec::new();

    for u in updates {
        let payload = InstallModPayload {
            instance_id: instance_id.to_string(),
            version_file: u.version_file.clone(),
            mod_metadata: InstallModMetadata {
                id: u.mod_id.clone(),
                name: u.name.clone(),
                source: u.source.clone(),
                icon_url: None,
            },
            old_filename: Some(u.current_filename.clone()),
        };

        match install_mod_to_instance(payload).await {
            Ok(_) => {
                updated_count += 1;
            }
            Err(e) => {
                failed_count += 1;
                errors.push(e.clone());
                failures.push(ModUpdateFailure {
                    mod_id: u.mod_id.clone(),
                    source: u.source.clone(),
                    name: u.name.clone(),
                    error: e,
                });
            }
        }
    }

    Ok(ModUpdateResult {
        success: failed_count == 0,
        updated_count,
        failed_count,
        errors,
        failures,
    })
}
