use crate::core::download::{self, Checksum};
use crate::core::fs_util::write_json_atomic;
use crate::core::mods::InstalledModRecord;
use crate::core::paths;
use crate::core::safety;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const PENDING_FILE: &str = "pending-downloads.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PendingDownload {
    pub file_name: String,
    pub display_name: String,
    pub project_id: String,
    pub file_id: String,
    pub sha1: Option<String>,
    pub target_folder: String,
    pub page_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualDownloadStatus {
    pub pending: Vec<PendingDownload>,
    pub resolved: Vec<String>,
    pub watched_folder: Option<String>,
}

fn pending_path(instance_id: &str) -> PathBuf {
    paths::get_instance_path(instance_id).join(PENDING_FILE)
}

pub fn load_pending(instance_id: &str) -> Vec<PendingDownload> {
    fs::read_to_string(pending_path(instance_id))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save_pending(instance_id: &str, pending: &[PendingDownload]) -> Result<(), String> {
    if pending.is_empty() {
        let _ = fs::remove_file(pending_path(instance_id));
        return Ok(());
    }
    write_json_atomic(&pending_path(instance_id), &pending)
}

fn candidate_folders() -> Vec<PathBuf> {
    let mut folders = Vec::new();
    if let Some(downloads) = dirs::download_dir() {
        folders.push(downloads);
    }
    if let Some(home) = dirs::home_dir() {
        let fallback = home.join("Downloads");
        if !folders.contains(&fallback) {
            folders.push(fallback);
        }
    }
    folders
}

fn find_downloaded_copy(item: &PendingDownload, folders: &[PathBuf]) -> Option<PathBuf> {
    for folder in folders {
        let candidate = folder.join(&item.file_name);
        if !candidate.is_file() {
            continue;
        }
        let matches = match &item.sha1 {
            Some(sha1) => download::file_satisfies(&candidate, Some(&Checksum::Sha1(sha1.clone())), None),
            None => true,
        };
        if matches {
            return Some(candidate);
        }
    }
    None
}

fn move_into_place(source: &Path, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if fs::rename(source, target).is_err() {
        fs::copy(source, target).map_err(|e| format!("Could not copy {}: {e}", source.display()))?;
        let _ = fs::remove_file(source);
    }
    Ok(())
}

pub fn resolve_pending_downloads(instance_id: &str) -> Result<ManualDownloadStatus, String> {
    let pending = load_pending(instance_id);
    let folders = candidate_folders();
    let minecraft_dir = paths::get_instance_minecraft_path(instance_id);
    let mut remaining = Vec::new();
    let mut resolved = Vec::new();
    let mut new_records = Vec::new();

    for item in pending {
        let (Ok(file_name), Ok(folder)) = (
            safety::validate_file_name(&item.file_name),
            safety::validate_file_name(&item.target_folder),
        ) else {
            continue;
        };
        let target = minecraft_dir.join(folder).join(file_name);
        if target.is_file() {
            resolved.push(item.display_name.clone());
            continue;
        }
        match find_downloaded_copy(&item, &folders) {
            Some(source) => {
                move_into_place(&source, &target)?;
                if item.target_folder == "mods" {
                    new_records.push(InstalledModRecord {
                        version_id: Some(item.file_id.clone()),
                        dependencies: None,
                        id: item.project_id.clone(),
                        name: item.display_name.clone(),
                        version: item.file_name.clone(),
                        filename: item.file_name.clone(),
                        source: "curseforge".to_string(),
                        icon_url: None,
                        installed_at: Utc::now().to_rfc3339(),
                        enabled: true,
                        file_size_bytes: fs::metadata(&target).map(|m| m.len()).unwrap_or(0),
                        game_version: None,
                        loader: None,
                    });
                }
                resolved.push(item.display_name.clone());
            }
            None => remaining.push(item),
        }
    }

    if !new_records.is_empty() {
        crate::core::mods::update_installed_records(instance_id, |records| {
            for record in new_records {
                records.retain(|existing| existing.filename != record.filename);
                records.push(record);
            }
        })?;
    }
    save_pending(instance_id, &remaining)?;
    Ok(ManualDownloadStatus {
        pending: remaining,
        resolved,
        watched_folder: folders.first().map(|folder| folder.to_string_lossy().to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downloaded_copy_must_match_checksum() {
        let folder = std::env::temp_dir().join(format!("script-launcher-manual-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("blocked.jar"), b"hello").unwrap();
        let mut item = PendingDownload {
            file_name: "blocked.jar".into(),
            display_name: "Blocked".into(),
            project_id: "1".into(),
            file_id: "2".into(),
            sha1: Some("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d".into()),
            target_folder: "mods".into(),
            page_url: String::new(),
        };
        assert!(find_downloaded_copy(&item, &[folder.clone()]).is_some());
        item.sha1 = Some("00".into());
        assert!(find_downloaded_copy(&item, &[folder.clone()]).is_none());
        fs::remove_dir_all(folder).unwrap();
    }
}
