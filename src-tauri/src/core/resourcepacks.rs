use crate::core::instances::write_json_atomic;
use crate::core::paths;
use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha1::Digest;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledResourcePackRecord {
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
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallDroppedPacksResult {
    pub success: bool,
    pub installed_packs: Vec<InstalledResourcePackRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModVersionFile {
    pub id: String,
    pub filename: String,
    pub download_url: Option<String>,
    pub size_bytes: u64,
    pub sha512: Option<String>,
    pub sha1: Option<String>,
    pub version_number: Option<String>,
    pub game_versions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModMetadata {
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
    pub mod_metadata: ModMetadata,
    pub old_filename: Option<String>,
}

pub fn get_resource_packs_directory(instance_id: &str) -> PathBuf {
    paths::get_instance_minecraft_path(instance_id).join("resourcepacks")
}

pub fn get_resource_packs_metadata_path(instance_id: &str) -> PathBuf {
    paths::get_instance_path(instance_id).join("resourcepacks.json")
}

fn extract_zip_pack_info(zip_path: &Path) -> (Option<String>, Option<String>) {
    let Ok(file) = fs::File::open(zip_path) else {
        return (None, None);
    };
    let Ok(mut archive) = zip::ZipArchive::new(file) else {
        return (None, None);
    };

    let mut description = None;
    let mut icon_data_url = None;

    if let Ok(mut meta_file) = archive.by_name("pack.mcmeta") {
        let mut s = String::new();
        if meta_file.read_to_string(&mut s).is_ok() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&s) {
                if let Some(desc) = val.get("pack").and_then(|p| p.get("description")) {
                    if let Some(text) = desc.as_str() {
                        description = Some(text.to_string());
                    } else if let Some(text) = desc.get("text").and_then(|t| t.as_str()) {
                        description = Some(text.to_string());
                    }
                }
            }
        }
    }

    if let Ok(mut png_file) = archive.by_name("pack.png") {
        let mut buf = Vec::new();
        if png_file.read_to_end(&mut buf).is_ok() && !buf.is_empty() {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
            icon_data_url = Some(format!("data:image/png;base64,{b64}"));
        }
    }

    (description, icon_data_url)
}

pub fn list_installed_resource_packs(
    instance_id: &str,
) -> Result<Vec<InstalledResourcePackRecord>, String> {
    let packs_dir = get_resource_packs_directory(instance_id);
    if !packs_dir.exists() {
        fs::create_dir_all(&packs_dir).map_err(|e| e.to_string())?;
    }

    let meta_path = get_resource_packs_metadata_path(instance_id);
    let saved_packs: Vec<InstalledResourcePackRecord> = if meta_path.is_file() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str(&r).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    struct DiskInfo {
        enabled: bool,
        size: u64,
        full_path: PathBuf,
    }

    let mut disk_files_map = std::collections::HashMap::new();

    if let Ok(entries) = fs::read_dir(&packs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = entry.metadata() else {
                continue;
            };

            let name = entry.file_name().to_string_lossy().to_string();

            if metadata.is_file() {
                if name.ends_with(".zip") {
                    disk_files_map.insert(
                        name.clone(),
                        DiskInfo {
                            enabled: true,
                            size: metadata.len(),
                            full_path: path,
                        },
                    );
                } else if let Some(base) = name.strip_suffix(".zip.disabled") {
                    disk_files_map.insert(
                        format!("{base}.zip"),
                        DiskInfo {
                            enabled: false,
                            size: metadata.len(),
                            full_path: path,
                        },
                    );
                }
            } else if metadata.is_dir() && !name.ends_with(".disabled") {
                disk_files_map.insert(
                    name.clone(),
                    DiskInfo {
                        enabled: true,
                        size: 0,
                        full_path: path,
                    },
                );
            }
        }
    }

    let mut synced_list = Vec::new();
    let mut recognized = std::collections::HashSet::new();

    for record in saved_packs {
        if let Some(info) = disk_files_map.get(&record.filename) {
            let mut updated = record.clone();
            updated.enabled = info.enabled;
            updated.file_size_bytes = info.size;
            recognized.insert(record.filename.clone());
            synced_list.push(updated);
        }
    }

    for (filename, info) in &disk_files_map {
        if !recognized.contains(filename) {
            let (description, icon_url) = if info.full_path.is_file() {
                extract_zip_pack_info(&info.full_path)
            } else {
                (None, None)
            };

            let clean_name = filename.strip_suffix(".zip").unwrap_or(filename);
            let safe_id = clean_name.to_lowercase().replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_");

            synced_list.push(InstalledResourcePackRecord {
                id: format!("manual-{safe_id}"),
                name: clean_name.to_string(),
                version: "custom".to_string(),
                filename: filename.clone(),
                source: "modrinth".to_string(),
                icon_url,
                installed_at: Utc::now().to_rfc3339(),
                enabled: info.enabled,
                file_size_bytes: info.size,
                game_version: None,
                description,
            });
        }
    }

    let _ = write_json_atomic(&meta_path, &synced_list);
    Ok(synced_list)
}

pub async fn install_resource_pack_to_instance(
    payload: InstallModPayload,
) -> Result<InstalledResourcePackRecord, String> {
    let packs_dir = get_resource_packs_directory(&payload.instance_id);
    if !packs_dir.exists() {
        fs::create_dir_all(&packs_dir).map_err(|e| e.to_string())?;
    }

    let download_url = payload
        .version_file
        .download_url
        .as_deref()
        .ok_or("Direct download is not available for this version.")?;

    let filename = &payload.version_file.filename;
    let destination = packs_dir.join(filename);

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
            return Err("SHA-512 integrity check failed for downloaded resource pack".to_string());
        }
    } else if let Some(expected_1) = &payload.version_file.sha1 {
        let mut hasher = sha1::Sha1::new();
        hasher.update(&bytes);
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected_1) {
            return Err("SHA-1 integrity check failed for downloaded resource pack".to_string());
        }
    }

    fs::write(&destination, &bytes).map_err(|e| e.to_string())?;

    let (description, zip_icon) = extract_zip_pack_info(&destination);
    let icon_url = payload.mod_metadata.icon_url.or(zip_icon);

    let new_record = InstalledResourcePackRecord {
        id: payload.mod_metadata.id,
        name: payload.mod_metadata.name,
        version: payload.version_file.version_number.unwrap_or_else(|| "latest".to_string()),
        filename: filename.clone(),
        source: payload.mod_metadata.source,
        icon_url,
        installed_at: Utc::now().to_rfc3339(),
        enabled: true,
        file_size_bytes: bytes.len() as u64,
        game_version: payload.version_file.game_versions.and_then(|v| v.first().cloned()),
        description,
    };

    let meta_path = get_resource_packs_metadata_path(&payload.instance_id);
    let mut saved_packs: Vec<InstalledResourcePackRecord> = if meta_path.is_file() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str(&r).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    saved_packs.retain(|p| p.filename != *filename);
    saved_packs.push(new_record.clone());
    write_json_atomic(&meta_path, &saved_packs)?;

    Ok(new_record)
}

pub fn toggle_resource_pack_enabled(
    instance_id: &str,
    filename: &str,
    enable: bool,
) -> Result<bool, String> {
    let packs_dir = get_resource_packs_directory(instance_id);
    let active_path = packs_dir.join(filename);
    let disabled_path = packs_dir.join(format!("{filename}.disabled"));

    if enable {
        if disabled_path.exists() {
            fs::rename(&disabled_path, &active_path).map_err(|e| e.to_string())?;
        }
    } else if active_path.exists() {
        fs::rename(&active_path, &disabled_path).map_err(|e| e.to_string())?;
    }

    let meta_path = get_resource_packs_metadata_path(instance_id);
    if meta_path.is_file() {
        if let Some(mut saved_packs) = fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str::<Vec<InstalledResourcePackRecord>>(&r).ok())
        {
            if let Some(target) = saved_packs.iter_mut().find(|p| p.filename == filename) {
                target.enabled = enable;
                let _ = write_json_atomic(&meta_path, &saved_packs);
            }
        }
    }

    Ok(true)
}

pub fn delete_installed_resource_pack(instance_id: &str, filename: &str) -> Result<bool, String> {
    let packs_dir = get_resource_packs_directory(instance_id);
    let active_path = packs_dir.join(filename);
    let disabled_path = packs_dir.join(format!("{filename}.disabled"));

    if active_path.exists() {
        if active_path.is_dir() {
            let _ = fs::remove_dir_all(&active_path);
        } else {
            let _ = fs::remove_file(&active_path);
        }
    }
    if disabled_path.exists() {
        if disabled_path.is_dir() {
            let _ = fs::remove_dir_all(&disabled_path);
        } else {
            let _ = fs::remove_file(&disabled_path);
        }
    }

    let meta_path = get_resource_packs_metadata_path(instance_id);
    if meta_path.is_file() {
        if let Some(mut saved_packs) = fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str::<Vec<InstalledResourcePackRecord>>(&r).ok())
        {
            saved_packs.retain(|p| p.filename != filename);
            let _ = write_json_atomic(&meta_path, &saved_packs);
        }
    }

    Ok(true)
}

pub fn install_dropped_resource_packs(
    instance_id: &str,
    file_paths: &[String],
) -> Result<InstallDroppedPacksResult, String> {
    let packs_dir = get_resource_packs_directory(instance_id);
    if !packs_dir.exists() {
        fs::create_dir_all(&packs_dir).map_err(|e| e.to_string())?;
    }

    let mut installed_packs = Vec::new();

    for file_path in file_paths {
        let src = Path::new(file_path);
        if !src.exists() {
            continue;
        }

        let Some(name) = src.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        if !name.ends_with(".zip") {
            continue;
        }

        let target = packs_dir.join(name);
        if let Err(e) = fs::copy(src, &target) {
            eprintln!("Failed to copy dropped pack {name}: {e}");
            continue;
        }

        let (description, icon_url) = extract_zip_pack_info(&target);
        let size = target.metadata().map(|m| m.len()).unwrap_or(0);
        let clean_name = name.strip_suffix(".zip").unwrap_or(name);
        let safe_id = clean_name.to_lowercase().replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_");

        let record = InstalledResourcePackRecord {
            id: format!("manual-{safe_id}"),
            name: clean_name.to_string(),
            version: "custom".to_string(),
            filename: name.to_string(),
            source: "modrinth".to_string(),
            icon_url,
            installed_at: Utc::now().to_rfc3339(),
            enabled: true,
            file_size_bytes: size,
            game_version: None,
            description,
        };

        installed_packs.push(record);
    }

    let meta_path = get_resource_packs_metadata_path(instance_id);
    let mut saved_packs: Vec<InstalledResourcePackRecord> = if meta_path.is_file() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str(&r).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    for pack in &installed_packs {
        saved_packs.retain(|p| p.filename != pack.filename);
        saved_packs.push(pack.clone());
    }

    let _ = write_json_atomic(&meta_path, &saved_packs);

    Ok(InstallDroppedPacksResult {
        success: true,
        installed_packs,
    })
}

pub fn open_resource_packs_folder(instance_id: &str) -> Result<(), String> {
    let dir = get_resource_packs_directory(instance_id);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    open::that(dir).map_err(|e| e.to_string())?;
    Ok(())
}
