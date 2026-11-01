use crate::core::paths;
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

pub fn asset_url_for_path(path: &std::path::Path) -> String {
    let raw = path.to_string_lossy();
    let mut encoded = String::with_capacity(raw.len() * 3);
    for byte in raw.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')' => {
                encoded.push(*byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    if cfg!(any(target_os = "windows", target_os = "android")) {
        format!("http://asset.localhost/{encoded}")
    } else {
        format!("asset://localhost/{encoded}")
    }
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
            let created_at = metadata
                .modified()
                .ok()
                .map(|t| DateTime::<Utc>::from(t).to_rfc3339())
                .unwrap_or_else(|| Utc::now().to_rfc3339());

            results.push(ScreenshotEntry {
                filename: entry.file_name().to_string_lossy().to_string(),
                size_bytes: metadata.len(),
                created_at,
                data_url: asset_url_for_path(&path),
            });
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_urls_match_tauri_convert_file_src() {
        let url = asset_url_for_path(std::path::Path::new(r"C:\Users\a b\shot.png"));
        if cfg!(target_os = "windows") {
            assert_eq!(url, "http://asset.localhost/C%3A%5CUsers%5Ca%20b%5Cshot.png");
        }
    }
}
