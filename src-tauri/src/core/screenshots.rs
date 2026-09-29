use crate::core::paths;
use base64::Engine;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotEntry {
    pub filename: String,
    pub size_bytes: u64,
    pub created_at: String,
    pub data_url: String,
}

pub fn get_screenshots_directory(instance_id: &str) -> PathBuf {
    paths::get_instance_minecraft_path(instance_id).join("screenshots")
}

pub fn list_instance_screenshots(instance_id: &str) -> Result<Vec<ScreenshotEntry>, String> {
    let dir = get_screenshots_directory(instance_id);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if ext != "png" && ext != "jpg" && ext != "jpeg" && ext != "webp" {
            continue;
        }

        if let Ok(metadata) = entry.metadata() {
            if let Ok(bytes) = fs::read(&path) {
                let mime = if ext == "png" {
                    "image/png"
                } else if ext == "webp" {
                    "image/webp"
                } else {
                    "image/jpeg"
                };
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                let data_url = format!("data:{mime};base64,{b64}");

                let created_at = metadata
                    .modified()
                    .ok()
                    .and_then(|t| {
                        let dt: DateTime<Utc> = t.into();
                        Some(dt.to_rfc3339())
                    })
                    .unwrap_or_else(|| Utc::now().to_rfc3339());

                results.push(ScreenshotEntry {
                    filename: entry.file_name().to_string_lossy().to_string(),
                    size_bytes: metadata.len(),
                    created_at,
                    data_url,
                });
            }
        }
    }

    results.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(results)
}

pub fn delete_instance_screenshot(instance_id: &str, filename: &str) -> Result<bool, String> {
    let dir = get_screenshots_directory(instance_id);
    let clean_name = std::path::Path::new(filename)
        .file_name()
        .ok_or_else(|| "Invalid filename".to_string())?;
    let target = dir.join(clean_name);

    if target.exists() {
        fs::remove_file(target).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn open_screenshots_folder(instance_id: &str) -> Result<(), String> {
    let dir = get_screenshots_directory(instance_id);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    open::that(dir).map_err(|e| e.to_string())?;
    Ok(())
}
