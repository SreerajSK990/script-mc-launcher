use crate::core::download::{self, Checksum};
use crate::core::fs_util::write_json_atomic;
use crate::core::paths;
use crate::core::safety;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const MODRINTH_API_BASE: &str = "https://api.modrinth.com/v2";
const CURSEFORGE_API_BASE: &str = "https://api.curseforge.com/v1";
const MINECRAFT_GAME_ID: u64 = 432;
const MODS_CLASS_ID: u64 = 6;
const RESOURCEPACKS_CLASS_ID: u64 = 12;
const MODPACKS_CLASS_ID: u64 = 4471;
use crate::core::net::USER_AGENT;

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

impl InstallModPayload {
    pub fn validate(&self) -> Result<(), String> {
        safety::validate_identifier(&self.instance_id)?;
        safety::validate_file_name(&self.version_file.filename)?;
        if let Some(old_filename) = self.old_filename.as_deref() {
            safety::validate_file_name(old_filename)?;
        }
        Ok(())
    }
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

    let client = crate::core::net::http_client().clone();
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

    let client = crate::core::net::http_client().clone();
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

    let client = crate::core::net::http_client().clone();
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
    Ok(data
        .iter()
        .filter_map(|version| parse_modrinth_version(version, project_id))
        .collect())
}

fn string_list(value: Option<&serde_json::Value>) -> Vec<String> {
    value
        .and_then(|list| list.as_array())
        .map(|list| list.iter().filter_map(|item| item.as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

pub fn parse_modrinth_version(v: &serde_json::Value, fallback_project_id: &str) -> Option<ModVersionFile> {
    let file_entries = v.get("files").and_then(|f| f.as_array())?;
    let primary = file_entries
        .iter()
        .find(|f| f.get("primary").and_then(|p| p.as_bool()).unwrap_or(false))
        .or_else(|| file_entries.first())?;

    let dependencies: Vec<ModDependency> = v
        .get("dependencies")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .map(|dep| ModDependency {
                    project_id: dep.get("project_id").and_then(|x| x.as_str()).map(str::to_string),
                    version_id: dep.get("version_id").and_then(|x| x.as_str()).map(str::to_string),
                    r#type: dep.get("dependency_type").and_then(|x| x.as_str()).unwrap_or("optional").to_string(),
                })
                .collect()
        })
        .unwrap_or_default();

    let project_id = v
        .get("project_id")
        .and_then(|x| x.as_str())
        .unwrap_or(fallback_project_id)
        .to_string();
    let version_id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();

    Some(ModVersionFile {
        dependencies: Some(dependencies),
        shader_loaders: None,
        website_url: Some(format!("https://modrinth.com/project/{project_id}/version/{version_id}")),
        id: version_id,
        project_id,
        name: v.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        version_number: v.get("version_number").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        game_versions: string_list(v.get("game_versions")),
        loaders: string_list(v.get("loaders")),
        download_url: primary.get("url").and_then(|x| x.as_str()).map(str::to_string),
        filename: primary.get("filename").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        size_bytes: primary.get("size").and_then(|x| x.as_u64()).unwrap_or(0),
        sha512: primary.get("hashes").and_then(|h| h.get("sha512")).and_then(|s| s.as_str()).map(str::to_string),
        sha1: primary.get("hashes").and_then(|h| h.get("sha1")).and_then(|s| s.as_str()).map(str::to_string),
        release_type: v.get("version_type").and_then(|x| x.as_str()).unwrap_or("release").to_string(),
        date_published: v.get("date_published").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        changelog: v.get("changelog").and_then(|x| x.as_str()).map(str::to_string),
    })
}

pub async fn get_modrinth_version(version_id: &str) -> Result<ModVersionFile, String> {
    let version: serde_json::Value =
        crate::core::net::get_json(&format!("{MODRINTH_API_BASE}/version/{version_id}")).await?;
    parse_modrinth_version(&version, "").ok_or_else(|| format!("Modrinth version {version_id} has no files"))
}

const CURSEFORGE_LOADER_NAMES: [(&str, &str); 4] = [
    ("forge", "forge"),
    ("fabric", "fabric"),
    ("quilt", "quilt"),
    ("neoforge", "neoforge"),
];

const CURSEFORGE_NON_VERSION_TAGS: [&str; 4] = ["client", "server", "java 8", "java 17"];

pub fn parse_curseforge_file(f: &serde_json::Value, fallback_project_id: &str, requested_loader: Option<&str>) -> ModVersionFile {
    let file_id = f.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
    let project_id = f
        .get("modId")
        .and_then(|v| v.as_u64())
        .map(|id| id.to_string())
        .unwrap_or_else(|| fallback_project_id.to_string());
    let release_type = match f.get("releaseType").and_then(|v| v.as_u64()).unwrap_or(1) {
        2 => "beta",
        3 => "alpha",
        _ => "release",
    }
    .to_string();

    let mut game_versions = Vec::new();
    let mut loaders = Vec::new();
    for tag in string_list(f.get("gameVersions")) {
        let lowered = tag.to_lowercase();
        if let Some((_, loader)) = CURSEFORGE_LOADER_NAMES.iter().find(|(name, _)| *name == lowered) {
            if !loaders.iter().any(|existing: &String| existing == loader) {
                loaders.push(loader.to_string());
            }
        } else if !CURSEFORGE_NON_VERSION_TAGS.contains(&lowered.as_str()) && !lowered.starts_with("java ") {
            game_versions.push(tag);
        }
    }
    if loaders.is_empty() {
        if let Some(loader) = requested_loader {
            loaders.push(loader.to_lowercase());
        }
    }

    let sha1 = f
        .get("hashes")
        .and_then(|h| h.as_array())
        .and_then(|hashes| hashes.iter().find(|h| h.get("algo").and_then(|a| a.as_u64()) == Some(1)))
        .and_then(|h| h.get("value"))
        .and_then(|v| v.as_str())
        .map(str::to_string);

    let dependencies = f
        .get("dependencies")
        .and_then(|d| d.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|dependency| {
                    let relation = match dependency.get("relationType").and_then(|r| r.as_u64())? {
                        2 => "optional",
                        3 => "required",
                        5 => "incompatible",
                        _ => return None,
                    };
                    Some(ModDependency {
                        project_id: dependency.get("modId").and_then(|id| id.as_u64()).map(|id| id.to_string()),
                        version_id: None,
                        r#type: relation.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let display_name = f.get("displayName").and_then(|v| v.as_str()).unwrap_or("").to_string();
    ModVersionFile {
        dependencies: Some(dependencies),
        shader_loaders: None,
        id: file_id.to_string(),
        website_url: Some(format!("https://www.curseforge.com/projects/{project_id}/files/{file_id}")),
        project_id,
        version_number: if display_name.is_empty() { file_id.to_string() } else { display_name.clone() },
        name: display_name,
        game_versions,
        loaders,
        download_url: f.get("downloadUrl").and_then(|v| v.as_str()).map(str::to_string),
        filename: f.get("fileName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        size_bytes: f.get("fileLength").and_then(|v| v.as_u64()).unwrap_or(0),
        sha512: None,
        sha1,
        release_type,
        date_published: f.get("fileDate").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        changelog: None,
    }
}

pub async fn get_curseforge_version(project_id: &str, file_id: &str) -> Result<ModVersionFile, String> {
    let key = get_curseforge_key().ok_or("A CurseForge API key is required in Settings")?;
    let response = crate::core::net::send_with_retry(|| {
        crate::core::net::http_client()
            .get(format!("{CURSEFORGE_API_BASE}/mods/{project_id}/files/{file_id}"))
            .header("x-api-key", &key)
    })
    .await?;
    if !response.status().is_success() {
        return Err(format!("CurseForge file {file_id} could not be loaded: HTTP {}", response.status()));
    }
    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let file = body.get("data").ok_or("CurseForge returned no file data")?;
    Ok(parse_curseforge_file(file, project_id, None))
}

pub async fn get_mod_version(source: &str, project_id: &str, version_id: &str) -> Result<ModVersionFile, String> {
    if source == "curseforge" {
        get_curseforge_version(project_id, version_id).await
    } else {
        get_modrinth_version(version_id).await
    }
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

    let client = crate::core::net::http_client().clone();
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

    Ok(files_arr
        .iter()
        .map(|file| parse_curseforge_file(file, mod_id, loader))
        .collect())
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
        let client = crate::core::net::http_client().clone();
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

    let client = crate::core::net::http_client().clone();
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
            let on_disk = if info.enabled {
                mods_dir.join(filename)
            } else {
                mods_dir.join(format!("{filename}.disabled"))
            };
            let embedded = crate::core::mod_metadata::read_embedded_metadata(&on_disk);
            synced.push(InstalledModRecord {
                version_id: None,
                dependencies: None,
                id: format!(
                    "manual-{}",
                    embedded.as_ref().map(|meta| meta.id.clone()).unwrap_or_else(|| clean_name.to_lowercase())
                ),
                name: embedded.as_ref().map(|meta| meta.name.clone()).unwrap_or_else(|| clean_name.to_string()),
                version: embedded.as_ref().map(|meta| meta.version.clone()).unwrap_or_else(|| "custom".to_string()),
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
    payload.validate()?;
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

    let checksum = Checksum::from_hashes(
        payload.version_file.sha512.clone(),
        payload.version_file.sha1.clone(),
    );
    let downloaded_bytes = download::fetch_to_path(download_url, &target_dest, checksum.as_ref(), |_| {}).await?;

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
        file_size_bytes: downloaded_bytes,
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

pub fn update_installed_records<F>(instance_id: &str, update: F) -> Result<(), String>
where
    F: FnOnce(&mut Vec<InstalledModRecord>),
{
    let mut records = list_installed_mods(instance_id)?;
    update(&mut records);
    write_json_atomic(&get_mods_metadata_path(instance_id), &records)
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
        let embedded = crate::core::mod_metadata::read_embedded_metadata(&target);

        let record = InstalledModRecord {
            version_id: None,
            dependencies: None,
            id: format!(
                "manual-{}",
                embedded.as_ref().map(|meta| meta.id.clone()).unwrap_or_else(|| clean_name.to_lowercase())
            ),
            name: embedded.as_ref().map(|meta| meta.name.clone()).unwrap_or_else(|| clean_name.to_string()),
            version: embedded.as_ref().map(|meta| meta.version.clone()).unwrap_or_else(|| "custom".to_string()),
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

fn prefer_release(versions: Vec<ModVersionFile>) -> Option<ModVersionFile> {
    versions
        .iter()
        .find(|version| version.release_type == "release")
        .cloned()
        .or_else(|| versions.into_iter().next())
}

fn update_from(record: &InstalledModRecord, latest: ModVersionFile, source: &str) -> Option<ModUpdateInfo> {
    let unchanged = record.version_id.as_deref() == Some(latest.id.as_str()) || latest.filename == record.filename;
    if unchanged {
        return None;
    }
    Some(ModUpdateInfo {
        mod_id: latest.project_id.clone(),
        name: record.name.clone(),
        current_version: record.version.clone(),
        current_filename: record.filename.clone(),
        latest_version: latest.version_number.clone(),
        source: source.to_string(),
        release_type: latest.release_type.clone(),
        version_file: latest,
    })
}

pub async fn check_mod_updates(instance_id: &str) -> Result<Vec<ModUpdateInfo>, String> {
    let instance = crate::core::instances::get_instance_by_id(instance_id)?.ok_or("Instance not found")?;
    let loader = (instance.loader_type != "vanilla").then(|| instance.loader_type.clone());
    let installed: Vec<InstalledModRecord> = list_installed_mods(instance_id)?
        .into_iter()
        .filter(|record| record.enabled)
        .collect();
    let mods_dir = get_mods_directory(instance_id);

    let hashing_targets: Vec<(InstalledModRecord, PathBuf)> = installed
        .iter()
        .filter(|record| record.source != "curseforge")
        .map(|record| (record.clone(), mods_dir.join(&record.filename)))
        .collect();
    let hashed: Vec<(String, InstalledModRecord)> = tokio::task::spawn_blocking(move || {
        hashing_targets
            .into_iter()
            .filter_map(|(record, path)| {
                download::hash_file(&path, &Checksum::Sha512(String::new()))
                    .ok()
                    .map(|hash| (hash, record))
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())?;

    let mut updates = Vec::new();
    if !hashed.is_empty() {
        let body = serde_json::json!({
            "hashes": hashed.iter().map(|(hash, _)| hash.clone()).collect::<Vec<_>>(),
            "algorithm": "sha512",
            "loaders": loader.iter().map(|value| value.to_lowercase()).collect::<Vec<_>>(),
            "game_versions": [instance.minecraft_version.clone()],
        });
        let response = crate::core::net::send_with_retry(|| {
            crate::core::net::http_client()
                .post(format!("{MODRINTH_API_BASE}/version_files/update"))
                .json(&body)
        })
        .await?;
        if !response.status().is_success() {
            return Err(format!("Modrinth update check failed: HTTP {}", response.status()));
        }
        let results: HashMap<String, serde_json::Value> = response.json().await.map_err(|e| e.to_string())?;
        for (hash, record) in &hashed {
            let Some(latest) = results.get(hash).and_then(|value| parse_modrinth_version(value, &record.id)) else {
                continue;
            };
            if let Some(update) = update_from(record, latest, "modrinth") {
                updates.push(update);
            }
        }
    }

    for record in installed.iter().filter(|record| record.source == "curseforge" && !record.id.starts_with("manual-")) {
        let Ok(versions) = get_mod_versions(
            &record.id,
            "curseforge",
            Some(&instance.minecraft_version),
            loader.as_deref(),
        )
        .await
        else {
            continue;
        };
        if let Some(update) = prefer_release(versions).and_then(|latest| update_from(record, latest, "curseforge")) {
            updates.push(update);
        }
    }

    Ok(updates)
}

pub async fn update_all_mods<F>(
    instance_id: &str,
    updates: &[ModUpdateInfo],
    on_progress: F,
) -> Result<ModUpdateResult, String>
where
    F: Fn(String, usize, usize),
{
    let mut updated_count = 0;
    let mut failed_count = 0;
    let mut errors = Vec::new();
    let mut failures = Vec::new();

    let total = updates.len();
    for (index, u) in updates.iter().enumerate() {
        on_progress(format!("Updating {}", u.name), index, total);
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

    on_progress("Updates finished".to_string(), total, total);
    Ok(ModUpdateResult {
        success: failed_count == 0,
        updated_count,
        failed_count,
        errors,
        failures,
    })
}

#[cfg(test)]
mod version_parsing_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn live_update_check_for_existing_instance() {
        let instance_id = std::env::var("UPDATE_CHECK_INSTANCE").unwrap();
        let updates = check_mod_updates(&instance_id).await.unwrap();
        for update in &updates {
            println!("{} {} -> {}", update.name, update.current_version, update.latest_version);
        }
        println!("{} updates found", updates.len());
    }

    #[test]
    fn curseforge_tags_split_into_versions_loaders_and_dependencies() {
        let file = serde_json::json!({
            "id": 5123456,
            "modId": 306612,
            "displayName": "Fabric API 0.102.0",
            "fileName": "fabric-api-0.102.0.jar",
            "gameVersions": ["1.21.1", "Fabric", "Client", "Java 21"],
            "dependencies": [{"modId": 1, "relationType": 3}, {"modId": 2, "relationType": 2}, {"modId": 3, "relationType": 1}],
            "hashes": [{"algo": 1, "value": "abc"}],
            "downloadUrl": null
        });
        let parsed = parse_curseforge_file(&file, "0", None);
        assert_eq!(parsed.project_id, "306612");
        assert_eq!(parsed.game_versions, vec!["1.21.1"]);
        assert_eq!(parsed.loaders, vec!["fabric"]);
        let dependencies = parsed.dependencies.unwrap();
        assert_eq!(dependencies.len(), 2);
        assert_eq!(dependencies[0].r#type, "required");
        assert_eq!(parsed.sha1.as_deref(), Some("abc"));
        assert!(parsed.download_url.is_none());
        assert!(parsed.website_url.unwrap().contains("306612/files/5123456"));
    }
}
