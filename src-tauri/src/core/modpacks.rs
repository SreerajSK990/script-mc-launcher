use crate::core::instances::{
    create_new_instance, write_json_atomic, CreateInstancePayload, InstanceConfiguration,
};
use crate::core::mods::{
    get_curseforge_key, get_mods_metadata_path, InstalledModRecord, ModVersionFile,
};
use crate::core::paths;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha1::Digest;
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

const CURSEFORGE_API_BASE: &str = "https://api.curseforge.com/v1";
const USER_AGENT: &str = "ScriptLauncher/0.18.0 (github.com/SreerajSK990/script-mc-launcher)";

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

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct ModpackDownloadTask {
    url: String,
    destination: PathBuf,
    sha512: Option<String>,
    sha1: Option<String>,
    size: u64,
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

pub async fn import_modpack<F>(
    archive_path: &str,
    custom_name: Option<String>,
    progress: F,
) -> Result<InstanceConfiguration, String>
where
    F: Fn(ModpackImportProgressEvent) + Send + Sync + 'static,
{
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

    let mut download_tasks: Vec<ModpackDownloadTask> = Vec::new();
    let mut installed_mods: Vec<InstalledModRecord> = Vec::new();

    if manifest.format == "modrinth" {
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let entry_name = entry.name().replace('\\', "/");

            let rel_path = if let Some(p) = entry_name.strip_prefix("overrides/") {
                p
            } else if let Some(p) = entry_name.strip_prefix("client-overrides/") {
                p
            } else {
                continue;
            };

            if rel_path.trim().is_empty() {
                continue;
            }

            let target_path = minecraft_dir.join(rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
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

                let target = minecraft_dir.join(f.path.replace('/', std::path::MAIN_SEPARATOR_STR));
                let size = f.file_size.unwrap_or(0);
                let sha512 = f.hashes.as_ref().and_then(|h| h.sha512.clone());
                let sha1 = f.hashes.as_ref().and_then(|h| h.sha1.clone());

                download_tasks.push(ModpackDownloadTask {
                    url: download_url,
                    destination: target,
                    sha512,
                    sha1: sha1.clone(),
                    size,
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
                let target_path = minecraft_dir.join(rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
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

            let client = reqwest::Client::new();
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

                if let Ok(res) = resp {
                    if res.status().is_success() {
                        if let Ok(json_data) = res.json::<CurseForgeApiFilesResponse>().await {
                            if let Some(data) = json_data.data {
                                fetched_files.extend(data);
                            }
                        }
                    }
                }
            }

            let mods_dir = minecraft_dir.join("mods");
            fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

            for f in fetched_files {
                if let Some(dl_url) = f.download_url {
                    let dest = mods_dir.join(&f.file_name);
                    let sha1 = f.hashes.as_ref().and_then(|hashes| {
                        hashes.iter().find(|h| h.algo == 1).map(|h| h.value.clone())
                    });

                    download_tasks.push(ModpackDownloadTask {
                        url: dl_url,
                        destination: dest,
                        sha512: None,
                        sha1,
                        size: f.file_length,
                    });

                    let display = f.display_name.unwrap_or_else(|| {
                        f.file_name.strip_suffix(".jar").unwrap_or(&f.file_name).to_string()
                    });

                    installed_mods.push(InstalledModRecord {
                        version_id: None,
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

        let client = reqwest::Client::new();
        let semaphore = Arc::new(Semaphore::new(8));
        let mut set = JoinSet::new();
        let completed = Arc::new(AtomicUsize::new(0));

        for task in download_tasks {
            let sem = semaphore.clone();
            let c = client.clone();
            set.spawn(async move {
                let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
                if task.destination.exists() {
                    return Ok(());
                }
                if let Some(parent) = task.destination.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let resp = c.get(&task.url).header(reqwest::header::USER_AGENT, USER_AGENT).send().await.map_err(|e| e.to_string())?;
                if !resp.status().is_success() {
                    return Err(format!("Download failed: HTTP {}", resp.status()));
                }
                let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
                if let Some(expected_512) = &task.sha512 {
                    let mut hasher = sha2::Sha512::new();
                    hasher.update(&bytes);
                    let actual = format!("{:x}", hasher.finalize());
                    if !actual.eq_ignore_ascii_case(expected_512) {
                        return Err("SHA-512 check failed".to_string());
                    }
                } else if let Some(expected_1) = &task.sha1 {
                    let mut hasher = sha1::Sha1::new();
                    hasher.update(&bytes);
                    let actual = format!("{:x}", hasher.finalize());
                    if !actual.eq_ignore_ascii_case(expected_1) {
                        return Err("SHA-1 check failed".to_string());
                    }
                }
                fs::write(&task.destination, &bytes).map_err(|e| e.to_string())?;
                Ok(())
            });
        }

        while let Some(res) = set.join_next().await {
            match res {
                Ok(Ok(())) => {
                    let c = completed.fetch_add(1, Ordering::SeqCst) + 1;
                    let percentage = 30 + ((c as f64 / total_mods as f64) * 65.0) as u32;
                    progress(ModpackImportProgressEvent {
                        step: "downloading".to_string(),
                        message: format!("Downloaded mod ({c}/{total_mods})"),
                        current: c,
                        total: total_mods,
                        percentage,
                    });
                }
                Ok(Err(e)) => return Err(e),
                Err(e) => return Err(e.to_string()),
            }
        }
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

    progress(ModpackImportProgressEvent {
        step: "completed".to_string(),
        message: format!("Successfully installed {}!", instance.name),
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

    let filename = format!("{}_{}", Utc::now().timestamp_millis(), payload.version_file.filename);
    let temp_file_path = temp_dir.join(&filename);

    progress(ModpackImportProgressEvent {
        step: "extracting".to_string(),
        message: format!("Downloading modpack package ({})...", payload.version_file.filename),
        current: 0,
        total: 100,
        percentage: 5,
    });

    let client = reqwest::Client::new();
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
