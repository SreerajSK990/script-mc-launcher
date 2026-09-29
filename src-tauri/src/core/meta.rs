#![allow(dead_code)]

use crate::core::instances::write_json_atomic;
use crate::core::paths;
use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const MOJANG_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const PRISM_META_BASE_URL: &str = "https://meta.prismlauncher.org/v1";
const CACHE_TTL: Duration = Duration::from_secs(3600);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionManifestEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    pub time: String,
    pub release_time: String,
    pub sha1: String,
    pub compliance_level: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftVersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub release_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionManifestEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadArtifact {
    pub path: Option<String>,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRuleOs {
    pub name: Option<String>,
    pub version: Option<String>,
    pub arch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRule {
    pub action: String,
    pub os: Option<LibraryRuleOs>,
    pub features: Option<HashMap<String, bool>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDownloadClassifier {
    pub artifact: Option<DownloadArtifact>,
    pub classifiers: Option<HashMap<String, DownloadArtifact>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDownload {
    pub name: String,
    pub url: Option<String>,
    pub downloads: Option<LibraryDownloadClassifier>,
    pub rules: Option<Vec<LibraryRule>>,
    pub natives: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndexInfo {
    pub id: String,
    pub sha1: String,
    pub size: u64,
    pub total_size: Option<u64>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionDownloads {
    pub client: DownloadArtifact,
    pub server: Option<DownloadArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionArguments {
    pub game: Option<Vec<serde_json::Value>>,
    pub jvm: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaVersionInfo {
    pub component: String,
    pub major_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionPackage {
    pub id: String,
    pub main_class: String,
    pub arguments: Option<VersionArguments>,
    pub minecraft_arguments: Option<String>,
    pub asset_index: AssetIndexInfo,
    pub assets: String,
    pub downloads: VersionDownloads,
    pub libraries: Vec<LibraryDownload>,
    pub compliance_level: Option<i32>,
    pub release_time: Option<String>,
    pub time: Option<String>,
    pub java_version: Option<JavaVersionInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrismVersionRequirement {
    pub uid: String,
    pub equals: Option<String>,
    pub suggests: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrismVersionListItem {
    pub version: String,
    pub release_time: Option<String>,
    pub requires: Option<Vec<PrismVersionRequirement>>,
    #[serde(rename = "type")]
    pub version_type: Option<String>,
    pub recommended: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrismComponentIndex {
    pub format_version: Option<u32>,
    pub name: Option<String>,
    pub uid: String,
    pub versions: Vec<PrismVersionListItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrismMavenFile {
    pub name: String,
    pub downloads: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrismComponentVersion {
    pub uid: String,
    pub version: String,
    pub name: Option<String>,
    pub main_class: Option<String>,
    pub libraries: Option<Vec<LibraryDownload>>,
    pub maven_files: Option<Vec<PrismMavenFile>>,
    pub minecraft_arguments: Option<String>,
    pub arguments: Option<VersionArguments>,
    pub order: Option<i32>,
    pub release_time: Option<String>,
    pub requires: Option<Vec<PrismVersionRequirement>>,
}

fn is_cache_valid(path: &Path) -> bool {
    if let Ok(metadata) = fs::metadata(path) {
        if let Ok(modified) = metadata.modified() {
            if let Ok(elapsed) = SystemTime::now().duration_since(modified) {
                return elapsed < CACHE_TTL;
            }
        }
    }
    false
}

fn get_mojang_manifest_cache_path() -> PathBuf {
    paths::get_meta_cache_directory()
        .join("mojang")
        .join("version_manifest_v2.json")
}

fn get_version_package_cache_path(version_id: &str) -> PathBuf {
    paths::get_meta_cache_directory()
        .join("mojang")
        .join("versions")
        .join(format!("{version_id}.json"))
}

pub async fn fetch_mojang_version_manifest() -> Result<VersionManifest, String> {
    let cache_path = get_mojang_manifest_cache_path();

    if is_cache_valid(&cache_path) {
        if let Ok(content) = fs::read_to_string(&cache_path) {
            if let Ok(manifest) = serde_json::from_str::<VersionManifest>(&content) {
                if !manifest.versions.is_empty() {
                    return Ok(manifest);
                }
            }
        }
    }

    let client = reqwest::Client::new();
    let response = client
        .get(MOJANG_MANIFEST_URL)
        .header(USER_AGENT, "ScriptLauncher/0.18.4")
        .send()
        .await;

    match response {
        Ok(resp) if resp.status().is_success() => {
            let manifest = resp.json::<VersionManifest>().await.map_err(|e| e.to_string())?;
            let _ = write_json_atomic(&cache_path, &manifest);
            Ok(manifest)
        }
        _ => {
            if cache_path.exists() {
                if let Ok(content) = fs::read_to_string(&cache_path) {
                    if let Ok(manifest) = serde_json::from_str::<VersionManifest>(&content) {
                        return Ok(manifest);
                    }
                }
            }
            Err("Failed to fetch Mojang version manifest and no valid cache available.".to_string())
        }
    }
}

pub async fn fetch_version_package(version_id: &str) -> Result<VersionPackage, String> {
    let cache_path = get_version_package_cache_path(version_id);

    if cache_path.exists() {
        if let Ok(content) = fs::read_to_string(&cache_path) {
            if let Ok(package) = serde_json::from_str::<VersionPackage>(&content) {
                if package.id == version_id {
                    return Ok(package);
                }
            }
        }
    }

    let manifest = fetch_mojang_version_manifest().await?;
    let entry = manifest
        .versions
        .iter()
        .find(|v| v.id == version_id)
        .ok_or_else(|| format!("Minecraft version \"{version_id}\" not found in manifest."))?;

    let client = reqwest::Client::new();
    let resp = client
        .get(&entry.url)
        .header(USER_AGENT, "ScriptLauncher/0.18.4")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Failed to fetch version package: HTTP {}", resp.status()));
    }

    let package = resp.json::<VersionPackage>().await.map_err(|e| e.to_string())?;
    let _ = write_json_atomic(&cache_path, &package);
    Ok(package)
}

pub async fn get_available_minecraft_versions() -> Result<Vec<MinecraftVersionEntry>, String> {
    let manifest = fetch_mojang_version_manifest().await?;
    let entries = manifest
        .versions
        .into_iter()
        .map(|v| MinecraftVersionEntry {
            id: v.id,
            version_type: v.version_type,
            release_time: v.release_time,
        })
        .collect();
    Ok(entries)
}

pub fn get_prism_component_uid(loader: &str) -> Option<&'static str> {
    match loader {
        "fabric" => Some("net.fabricmc.fabric-loader"),
        "quilt" => Some("org.quiltmc.quilt-loader"),
        "forge" => Some("net.minecraftforge"),
        "neoforge" => Some("net.neoforged"),
        _ => None,
    }
}

pub async fn fetch_prism_component_index(component_uid: &str) -> Result<PrismComponentIndex, String> {
    let cache_path = paths::get_meta_cache_directory()
        .join("prism")
        .join(component_uid)
        .join("index.json");

    if is_cache_valid(&cache_path) {
        if let Ok(content) = fs::read_to_string(&cache_path) {
            if let Ok(index) = serde_json::from_str::<PrismComponentIndex>(&content) {
                return Ok(index);
            }
        }
    }

    let url = format!("{PRISM_META_BASE_URL}/{component_uid}/index.json");
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header(USER_AGENT, "ScriptLauncher/0.18.4")
        .send()
        .await;

    match resp {
        Ok(r) if r.status().is_success() => {
            let index = r.json::<PrismComponentIndex>().await.map_err(|e| e.to_string())?;
            let _ = write_json_atomic(&cache_path, &index);
            Ok(index)
        }
        _ => {
            if cache_path.exists() {
                if let Ok(content) = fs::read_to_string(&cache_path) {
                    if let Ok(index) = serde_json::from_str::<PrismComponentIndex>(&content) {
                        return Ok(index);
                    }
                }
            }
            Err(format!("Failed to fetch Prism index for {component_uid}"))
        }
    }
}

pub async fn fetch_prism_component_version(
    component_uid: &str,
    version: &str,
) -> Result<PrismComponentVersion, String> {
    let cache_path = paths::get_meta_cache_directory()
        .join("prism")
        .join(component_uid)
        .join(format!("{version}.json"));

    if cache_path.exists() {
        if let Ok(content) = fs::read_to_string(&cache_path) {
            if let Ok(comp_version) = serde_json::from_str::<PrismComponentVersion>(&content) {
                return Ok(comp_version);
            }
        }
    }

    let url = format!("{PRISM_META_BASE_URL}/{component_uid}/{version}.json");
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header(USER_AGENT, "ScriptLauncher/0.18.4")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Failed to fetch Prism version: HTTP {}", resp.status()));
    }

    let comp_version = resp.json::<PrismComponentVersion>().await.map_err(|e| e.to_string())?;
    let _ = write_json_atomic(&cache_path, &comp_version);
    Ok(comp_version)
}

pub async fn get_compatible_loader_versions(
    loader: &str,
    minecraft_version: &str,
) -> Result<Vec<String>, String> {
    let uid = match get_prism_component_uid(loader) {
        Some(u) => u,
        None => return Ok(Vec::new()),
    };

    let index = fetch_prism_component_index(uid).await?;

    if loader == "fabric" || loader == "quilt" {
        return Ok(index
            .versions
            .into_iter()
            .map(|item| item.version)
            .take(35)
            .collect());
    }

    let exact_matches: Vec<String> = index
        .versions
        .iter()
        .filter(|entry| {
            entry.requires.as_ref().map_or(false, |reqs| {
                reqs.iter().any(|req| {
                    req.uid == "net.minecraft" && req.equals.as_deref() == Some(minecraft_version)
                })
            })
        })
        .map(|entry| entry.version.clone())
        .collect();

    if !exact_matches.is_empty() {
        return Ok(exact_matches);
    }

    if loader == "neoforge" {
        let parts: Vec<&str> = minecraft_version.split('.').collect();
        if parts.len() >= 2 {
            let minor = parts[1];
            let patch = if parts.len() >= 3 { parts[2] } else { "0" };
            let prefix = format!("{minor}.{patch}");
            let fallback_matches: Vec<String> = index
                .versions
                .iter()
                .filter(|entry| entry.version.starts_with(&prefix))
                .map(|entry| entry.version.clone())
                .collect();
            if !fallback_matches.is_empty() {
                return Ok(fallback_matches);
            }
        }
    }

    Ok(Vec::new())
}
