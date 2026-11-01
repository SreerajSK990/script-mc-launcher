use crate::core::instances::{
    create_new_instance, CreateInstancePayload, InstanceConfiguration,
};
use crate::core::mods::{
    get_curseforge_key, get_mods_metadata_path, InstalledModRecord, ModVersionFile,
};
use crate::core::download::{self, Checksum, DownloadTask};
use crate::core::fs_util::write_json_atomic;
use crate::core::paths;
use crate::core::safety;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;

const CURSEFORGE_API_BASE: &str = "https://api.curseforge.com/v1";
const USER_AGENT: &str = "ScriptLauncher/0.18.5 (github.com/SreerajSK990/script-mc-launcher)";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackManifestInfo {
    pub name: String,
    pub version_name: Option<String>,
    pub summary: Option<String>,
    pub minecraft_version: String,
    pub loader_type: String,
    pub loader_version: Option<String>,
    pub file_count: usize,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackImportProgressEvent {
    pub step: String,
    pub message: String,
    pub current: usize,
    pub total: usize,
    pub percentage: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallRemoteModpackPayload {
    pub source: String,
    pub project_id: String,
    pub version_file: ModVersionFile,
    pub custom_instance_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ModrinthFileHashes {
    sha512: Option<String>,
    sha1: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
struct ModrinthFileEnv {
    client: Option<String>,
    server: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ModrinthFile {
    path: String,
    hashes: Option<ModrinthFileHashes>,
    env: Option<ModrinthFileEnv>,
    downloads: Vec<String>,
    #[serde(rename = "fileSize")]
    file_size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct ModrinthIndexJson {
    name: String,
    #[serde(rename = "versionId")]
    version_id: Option<String>,
    summary: Option<String>,
    files: Option<Vec<ModrinthFile>>,
    dependencies: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize)]
struct CurseForgeModLoader {
    id: String,
    primary: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
struct CurseForgeMinecraft {
    version: String,
    #[serde(rename = "modLoaders")]
    mod_loaders: Option<Vec<CurseForgeModLoader>>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
struct CurseForgeManifestFile {
    #[serde(rename = "projectID")]
    project_id: u64,
    #[serde(rename = "fileID")]
    file_id: u64,
    required: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
struct CurseForgeManifestJson {
    minecraft: CurseForgeMinecraft,
    name: String,
    version: Option<String>,
    author: Option<String>,
    files: Option<Vec<CurseForgeManifestFile>>,
    overrides: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeApiFileHash {
    value: String,
    algo: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeApiFile {
    id: u64,
    mod_id: Option<u64>,
    display_name: Option<String>,
    file_name: String,
    file_length: u64,
    download_url: Option<String>,
    hashes: Option<Vec<CurseForgeApiFileHash>>,
}

#[derive(Debug, Clone, Deserialize)]
struct CurseForgeApiFilesResponse {
    data: Option<Vec<CurseForgeApiFile>>,
}


pub fn inspect_modpack(archive_path: &str) -> Result<ModpackManifestInfo, String> {
    let path = Path::new(archive_path);
    if !path.is_file() {
        return Err(format!("Modpack file not found: {archive_path}"));
    }

    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    if let Ok(mut entry) = archive.by_name("modrinth.index.json") {
        let mut content = String::new();
        entry.read_to_string(&mut content).map_err(|e| e.to_string())?;
        let data: ModrinthIndexJson = serde_json::from_str(&content).map_err(|e| e.to_string())?;

        let mut loader_type = "vanilla".to_string();
        let mut loader_version = None;

        if let Some(deps) = &data.dependencies {
            if let Some(v) = deps.get("fabric-loader") {
                loader_type = "fabric".to_string();
                loader_version = Some(v.clone());
            } else if let Some(v) = deps.get("quilt-loader") {
                loader_type = "quilt".to_string();
                loader_version = Some(v.clone());
            } else if let Some(v) = deps.get("neoforge") {
                loader_type = "neoforge".to_string();
                loader_version = Some(v.clone());
            } else if let Some(v) = deps.get("forge") {
                loader_type = "forge".to_string();
                loader_version = Some(v.clone());
            }
        }

        let mc_version = data
            .dependencies
            .as_ref()
            .and_then(|d| d.get("minecraft").cloned())
            .unwrap_or_else(|| "1.20.1".to_string());

        let count = data.files.as_ref().map(|f| f.len()).unwrap_or(0);

        return Ok(ModpackManifestInfo {
            name: data.name,
            version_name: data.version_id,
            summary: data.summary,
            minecraft_version: mc_version,
            loader_type,
            loader_version,
            file_count: count,
            format: "modrinth".to_string(),
        });
    }

    if let Ok(mut entry) = archive.by_name("manifest.json") {
        let mut content = String::new();
        entry.read_to_string(&mut content).map_err(|e| e.to_string())?;
        let data: CurseForgeManifestJson =
            serde_json::from_str(&content).map_err(|e| e.to_string())?;

        let mut loader_type = "vanilla".to_string();
        let mut loader_version = None;

        if let Some(loaders) = &data.minecraft.mod_loaders {
            let primary = loaders.iter().find(|l| l.primary == Some(true)).or_else(|| loaders.first());
            if let Some(p) = primary {
                let id_lower = p.id.to_lowercase();
                if let Some(v) = id_lower.strip_prefix("forge-") {
                    loader_type = "forge".to_string();
                    loader_version = Some(v.to_string());
                } else if let Some(v) = id_lower.strip_prefix("neoforge-") {
                    loader_type = "neoforge".to_string();
                    loader_version = Some(v.to_string());
                } else if let Some(v) = id_lower.strip_prefix("fabric-") {
                    loader_type = "fabric".to_string();
                    loader_version = Some(v.to_string());
                } else if let Some(v) = id_lower.strip_prefix("quilt-") {
                    loader_type = "quilt".to_string();
                    loader_version = Some(v.to_string());
                }
            }
        }

        let count = data.files.as_ref().map(|f| f.len()).unwrap_or(0);

        return Ok(ModpackManifestInfo {
            name: data.name,
            version_name: data.version,
            summary: data.author.map(|a| format!("By {a}")),
            minecraft_version: data.minecraft.version,
            loader_type,
            loader_version,
            file_count: count,
            format: "curseforge".to_string(),
        });
    }

    Err("Unsupported modpack archive format. Missing modrinth.index.json or manifest.json.".to_string())
}

struct PartialInstanceCleanup {
    instance_id: Option<String>,
}

impl PartialInstanceCleanup {
    fn disarm(&mut self) {
        self.instance_id = None;
    }
}

impl Drop for PartialInstanceCleanup {
    fn drop(&mut self) {
        if let Some(instance_id) = self.instance_id.take() {
            let _ = fs::remove_dir_all(paths::get_instance_path(&instance_id));
        }
    }
}

const CURSEFORGE_RESOURCE_PACK_CLASS: u64 = 12;
const CURSEFORGE_SHADER_PACK_CLASS: u64 = 6552;

fn curseforge_target_folder(class_id: Option<u64>) -> &'static str {
    match class_id {
        Some(CURSEFORGE_RESOURCE_PACK_CLASS) => "resourcepacks",
        Some(CURSEFORGE_SHADER_PACK_CLASS) => "shaderpacks",
        _ => "mods",
    }
}

async fn fetch_curseforge_class_ids(mod_ids: &[u64], api_key: &str) -> Result<HashMap<u64, u64>, String> {
    let mut class_ids = HashMap::new();
    for chunk in mod_ids.chunks(50) {
        let body = serde_json::json!({ "modIds": chunk });
        let response = crate::core::net::send_with_retry(|| {
            crate::core::net::http_client()
                .post(format!("{CURSEFORGE_API_BASE}/mods"))
                .header("x-api-key", api_key)
                .json(&body)
        })
        .await?;
        if !response.status().is_success() {
            return Err(format!("CurseForge project lookup failed: HTTP {}", response.status()));
        }
        let payload: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        for project in payload.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default() {
            if let (Some(id), Some(class_id)) = (
                project.get("id").and_then(|v| v.as_u64()),
                project.get("classId").and_then(|v| v.as_u64()),
            ) {
                class_ids.insert(id, class_id);
            }
        }
    }
    Ok(class_ids)
}

pub async fn import_modpack<F>(
    archive_path: &str,
    custom_name: Option<String>,
    progress: F,
) -> Result<InstanceConfiguration, String>
where
    F: Fn(ModpackImportProgressEvent) + Send + Sync + 'static,
{
    let progress = Arc::new(progress);
    progress(ModpackImportProgressEvent {
        step: "extracting".to_string(),
        message: "Analyzing modpack archive structure...".to_string(),
        current: 0,
        total: 100,
        percentage: 5,
    });

    let manifest = inspect_modpack(archive_path)?;
    let instance_name = custom_name
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| manifest.name.clone());

    let instance = create_new_instance(CreateInstancePayload {
        name: instance_name,
        minecraft_version: Some(manifest.minecraft_version.clone()),
        loader_type: Some(manifest.loader_type.clone()),
        loader_version: manifest.loader_version.clone(),
        ram_allocation_megabytes: Some(4096),
        java_path: None,
        jvm_arguments: None,
        icon: None,
        group: None,
        is_favorite: None,
    })?;

    let mut cleanup = PartialInstanceCleanup {
        instance_id: Some(instance.id.clone()),
    };
    let mut skipped_files: Vec<crate::core::manual_downloads::PendingDownload> = Vec::new();
    let minecraft_dir = paths::get_instance_minecraft_path(&instance.id);
    fs::create_dir_all(&minecraft_dir).map_err(|e| e.to_string())?;

    progress(ModpackImportProgressEvent {
        step: "extracting".to_string(),
        message: "Extracting configurations and game overrides...".to_string(),
        current: 10,
        total: 100,
        percentage: 15,
    });

    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut download_tasks: Vec<DownloadTask> = Vec::new();
    let mut installed_mods: Vec<InstalledModRecord> = Vec::new();

    if manifest.format == "modrinth" {
        for override_prefix in ["overrides/", "client-overrides/"] {
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let entry_name = entry.name().replace('\\', "/");

            let Some(rel_path) = entry_name.strip_prefix(override_prefix) else {
                continue;
            };

            if rel_path.trim().is_empty() {
                continue;
            }

            let target_path = safety::safe_join(&minecraft_dir, rel_path)?;
            if entry.is_dir() {
                let _ = fs::create_dir_all(&target_path);
            } else {
                if let Some(parent) = target_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let mut out_file = fs::File::create(&target_path).map_err(|e| e.to_string())?;
                std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
            }
        }
        }

        if let Ok(mut index_entry) = archive.by_name("modrinth.index.json") {
            let mut raw = String::new();
            index_entry.read_to_string(&mut raw).map_err(|e| e.to_string())?;
            let raw_index: ModrinthIndexJson =
                serde_json::from_str(&raw).map_err(|e| e.to_string())?;

            for f in raw_index.files.unwrap_or_default() {
                if f.env.as_ref().and_then(|e| e.client.as_deref()) == Some("unsupported") {
                    continue;
                }
                let Some(download_url) = f.downloads.first().cloned() else {
                    continue;
                };

                let target = safety::safe_join(&minecraft_dir, &f.path)?;
                let size = f.file_size.unwrap_or(0);
                let sha512 = f.hashes.as_ref().and_then(|h| h.sha512.clone());
                let sha1 = f.hashes.as_ref().and_then(|h| h.sha1.clone());

                download_tasks.push(DownloadTask {
                    url: download_url,
                    destination: target,
                    checksum: Checksum::from_hashes(sha512, sha1.clone()),
                    size: Some(size).filter(|value| *value > 0),
                });

                if f.path.starts_with("mods/") {
                    let filename = Path::new(&f.path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(&f.path)
                        .to_string();

                    let mod_name = filename
                        .strip_suffix(".jar")
                        .unwrap_or(&filename)
                        .to_string();

                    installed_mods.push(InstalledModRecord {
                        version_id: None,
                        dependencies: None,
                        id: sha1.unwrap_or_else(|| filename.clone()),
                        name: mod_name,
                        version: raw_index.version_id.clone().unwrap_or_else(|| "1.0.0".to_string()),
                        filename,
                        source: "modrinth".to_string(),
                        icon_url: None,
                        installed_at: Utc::now().to_rfc3339(),
                        enabled: true,
                        file_size_bytes: size,
                        game_version: Some(manifest.minecraft_version.clone()),
                        loader: Some(manifest.loader_type.clone()),
                    });
                }
            }
        }
    } else if manifest.format == "curseforge" {
        let mut raw_manifest_str = String::new();
        if let Ok(mut man_entry) = archive.by_name("manifest.json") {
            man_entry.read_to_string(&mut raw_manifest_str).map_err(|e| e.to_string())?;
        }
        let raw_manifest: CurseForgeManifestJson =
            serde_json::from_str(&raw_manifest_str).map_err(|e| e.to_string())?;

        let overrides_folder = raw_manifest.overrides.unwrap_or_else(|| "overrides".to_string());
        let prefix = if overrides_folder.ends_with('/') {
            overrides_folder
        } else {
            format!("{overrides_folder}/")
        };

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let entry_name = entry.name().replace('\\', "/");

            if let Some(rel_path) = entry_name.strip_prefix(&prefix) {
                if rel_path.trim().is_empty() {
                    continue;
                }
                let target_path = safety::safe_join(&minecraft_dir, rel_path)?;
                if entry.is_dir() {
                    let _ = fs::create_dir_all(&target_path);
                } else {
                    if let Some(parent) = target_path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    let mut out_file = fs::File::create(&target_path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
                }
            }
        }

        let file_ids: Vec<u64> = raw_manifest
            .files
            .unwrap_or_default()
            .into_iter()
            .map(|f| f.file_id)
            .collect();

        if !file_ids.is_empty() {
            let api_key = get_curseforge_key().ok_or(
                "A CurseForge API key is required in Settings to download CurseForge modpack files."
                    .to_string(),
            )?;

            progress(ModpackImportProgressEvent {
                step: "resolving".to_string(),
                message: "Resolving CurseForge mod links...".to_string(),
                current: 20,
                total: 100,
                percentage: 20,
            });

            let client = crate::core::net::http_client().clone();
            let mut fetched_files: Vec<CurseForgeApiFile> = Vec::new();

            for chunk in file_ids.chunks(50) {
                let body = serde_json::json!({ "fileIds": chunk });
                let resp = client
                    .post(format!("{CURSEFORGE_API_BASE}/mods/files"))
                    .header("x-api-key", &api_key)
                    .header("Content-Type", "application/json")
                    .header(reqwest::header::USER_AGENT, USER_AGENT)
                    .json(&body)
                    .send()
                    .await;

                let res = resp.map_err(|e| format!("CurseForge file lookup failed: {e}"))?;
                if !res.status().is_success() {
                    return Err(format!("CurseForge file lookup failed: HTTP {}", res.status()));
                }
                let json_data = res
                    .json::<CurseForgeApiFilesResponse>()
                    .await
                    .map_err(|e| format!("CurseForge file lookup returned invalid data: {e}"))?;
                fetched_files.extend(json_data.data.unwrap_or_default());
            }

            let project_ids: Vec<u64> = fetched_files.iter().filter_map(|file| file.mod_id).collect();
            let class_ids = fetch_curseforge_class_ids(&project_ids, &api_key).await?;

            for f in fetched_files {
                let target_folder = curseforge_target_folder(f.mod_id.and_then(|id| class_ids.get(&id).copied()));
                let Some(dl_url) = f.download_url.clone() else {
                    let project_id = f.mod_id.unwrap_or(f.id).to_string();
                    skipped_files.push(crate::core::manual_downloads::PendingDownload {
                        file_name: f.file_name.clone(),
                        display_name: f.display_name.clone().unwrap_or_else(|| f.file_name.clone()),
                        page_url: format!("https://www.curseforge.com/projects/{project_id}/files/{}", f.id),
                        project_id,
                        file_id: f.id.to_string(),
                        sha1: f.hashes.as_ref().and_then(|hashes| hashes.iter().find(|h| h.algo == 1).map(|h| h.value.clone())),
                        target_folder: target_folder.to_string(),
                    });
                    continue;
                };
                {
                    let target_dir = minecraft_dir.join(target_folder);
                    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
                    let dest = target_dir.join(safety::validate_file_name(&f.file_name)?);
                    let sha1 = f.hashes.as_ref().and_then(|hashes| {
                        hashes.iter().find(|h| h.algo == 1).map(|h| h.value.clone())
                    });

                    download_tasks.push(DownloadTask {
                        url: dl_url,
                        destination: dest,
                        checksum: sha1.map(Checksum::Sha1),
                        size: Some(f.file_length).filter(|value| *value > 0),
                    });

                    let display = f.display_name.unwrap_or_else(|| {
                        f.file_name.strip_suffix(".jar").unwrap_or(&f.file_name).to_string()
                    });

                    if target_folder != "mods" {
                        continue;
                    }
                    installed_mods.push(InstalledModRecord {
                        version_id: Some(f.id.to_string()),
                        dependencies: None,
                        id: f.mod_id.unwrap_or(f.id).to_string(),
                        name: display,
                        version: f.file_name.clone(),
                        filename: f.file_name,
                        source: "curseforge".to_string(),
                        icon_url: None,
                        installed_at: Utc::now().to_rfc3339(),
                        enabled: true,
                        file_size_bytes: f.file_length,
                        game_version: Some(manifest.minecraft_version.clone()),
                        loader: Some(manifest.loader_type.clone()),
                    });
                }
            }
        }
    }

    let total_mods = download_tasks.len();
    if total_mods > 0 {
        progress(ModpackImportProgressEvent {
            step: "downloading".to_string(),
            message: format!("Downloading {total_mods} mod files..."),
            current: 0,
            total: total_mods,
            percentage: 30,
        });

        let download_progress = progress.clone();
        download::ensure_files(download_tasks, 8, move |completed, total| {
            let percentage = 30 + ((completed as f64 / total as f64) * 65.0) as u32;
            download_progress(ModpackImportProgressEvent {
                step: "downloading".to_string(),
                message: format!("Downloaded mod ({completed}/{total})"),
                current: completed,
                total,
                percentage,
            });
        })
        .await?;
    }

    progress(ModpackImportProgressEvent {
        step: "finalizing".to_string(),
        message: "Saving instance metadata and registered mods...".to_string(),
        current: 95,
        total: 100,
        percentage: 95,
    });

    let mods_meta_path = get_mods_metadata_path(&instance.id);
    let _ = write_json_atomic(&mods_meta_path, &installed_mods);

    crate::core::manual_downloads::save_pending(&instance.id, &skipped_files)?;
    cleanup.disarm();
    let completion_message = if skipped_files.is_empty() {
        format!("Successfully installed {}!", instance.name)
    } else {
        format!(
            "Installed {}, but {} file(s) must be downloaded manually from CurseForge. Open the instance's Mods tab to finish.",
            instance.name,
            skipped_files.len()
        )
    };
    progress(ModpackImportProgressEvent {
        step: "completed".to_string(),
        message: completion_message,
        current: 100,
        total: 100,
        percentage: 100,
    });

    Ok(instance)
}

pub async fn install_remote_modpack<F>(
    payload: InstallRemoteModpackPayload,
    progress: F,
) -> Result<InstanceConfiguration, String>
where
    F: Fn(ModpackImportProgressEvent) + Send + Sync + 'static,
{
    let download_url = payload
        .version_file
        .download_url
        .as_deref()
        .ok_or("Direct download is not available for this modpack version.")?;

    let temp_dir = paths::get_launcher_root_directory().join("temp").join("modpacks");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let filename = format!(
        "{}_{}",
        Utc::now().timestamp_millis(),
        safety::validate_file_name(&payload.version_file.filename)?
    );
    let temp_file_path = temp_dir.join(&filename);

    progress(ModpackImportProgressEvent {
        step: "extracting".to_string(),
        message: format!("Downloading modpack package ({})...", payload.version_file.filename),
        current: 0,
        total: 100,
        percentage: 5,
    });

    let client = crate::core::net::http_client().clone();
    let resp = client
        .get(download_url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Download failed: HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    fs::write(&temp_file_path, &bytes).map_err(|e| e.to_string())?;

    let path_str = temp_file_path.to_string_lossy().to_string();
    let res = import_modpack(&path_str, payload.custom_instance_name, progress).await;

    let _ = fs::remove_file(temp_file_path);
    res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn live_modrinth_modpack_import() {
        let versions = crate::core::mods::get_modrinth_project_versions("fabulously-optimized", None, None)
            .await
            .unwrap();
        let pack = &versions[0];
        let archive = std::env::temp_dir().join(format!("script-launcher-pack-{}.mrpack", std::process::id()));
        crate::core::download::fetch_to_path(
            pack.download_url.as_deref().unwrap(),
            &archive,
            Checksum::from_hashes(pack.sha512.clone(), pack.sha1.clone()).as_ref(),
            |_| {},
        )
        .await
        .unwrap();
        let instance = import_modpack(&archive.to_string_lossy(), Some("pack import test".into()), |_| {})
            .await
            .unwrap();
        let mods_dir = paths::get_instance_minecraft_path(&instance.id).join("mods");
        let jar_count = fs::read_dir(&mods_dir).unwrap().count();
        let config_exists = paths::get_instance_minecraft_path(&instance.id).join("config").is_dir();
        let _ = fs::remove_dir_all(paths::get_instance_path(&instance.id));
        let _ = fs::remove_file(&archive);
        println!("{} mods, config folder: {config_exists}", jar_count);
        assert!(jar_count > 5);
        assert!(config_exists);
    }
}
