use crate::core::paths;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFontEntry {
    pub name: String,
    pub file_name: String,
    pub path: String,
    pub format: String,
    pub data_url: String,
}

fn get_font_format_and_mime(ext: &str) -> Option<(&'static str, &'static str)> {
    match ext.to_lowercase().as_str() {
        "otf" => Some(("opentype", "font/otf")),
        "woff2" => Some(("woff2", "font/woff2")),
        "ttf" => Some(("truetype", "font/ttf")),
        _ => None,
    }
}

pub fn list_installed_fonts() -> Result<Vec<CustomFontEntry>, String> {
    let fonts_dir = paths::get_fonts_directory();
    if !fonts_dir.exists() {
        fs::create_dir_all(&fonts_dir).map_err(|e| e.to_string())?;
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&fonts_dir).map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        let (format, mime) = match get_font_format_and_mime(ext) {
            Some(pair) => pair,
            None => continue,
        };

        if let Ok(bytes) = fs::read(&path) {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let data_url = format!("data:{mime};base64,{b64}");
            let file_name = entry.file_name().to_string_lossy().to_string();
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&file_name);
            let clean_name = stem.replace(['-', '_'], " ");

            results.push(CustomFontEntry {
                name: clean_name,
                file_name,
                path: path.to_string_lossy().to_string(),
                format: format.to_string(),
                data_url,
            });
        }
    }

    Ok(results)
}

pub fn install_custom_font(source_path: &str) -> Result<CustomFontEntry, String> {
    let source = Path::new(source_path);
    if !source.exists() || !source.is_file() {
        return Err("Source font file does not exist".to_string());
    }

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    let (format, mime) = get_font_format_and_mime(ext).ok_or_else(|| {
        "Unsupported font format. Please select a .ttf, .otf, or .woff2 file.".to_string()
    })?;

    let file_name = source
        .file_name()
        .ok_or_else(|| "Invalid font filename".to_string())?
        .to_string_lossy()
        .to_string();

    let fonts_dir = paths::get_fonts_directory();
    if !fonts_dir.exists() {
        fs::create_dir_all(&fonts_dir).map_err(|e| e.to_string())?;
    }

    let target_path = fonts_dir.join(&file_name);
    fs::copy(source, &target_path).map_err(|e| e.to_string())?;

    let bytes = fs::read(&target_path).map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{mime};base64,{b64}");
    let stem = target_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&file_name);
    let clean_name = stem.replace(['-', '_'], " ");

    Ok(CustomFontEntry {
        name: clean_name,
        file_name,
        path: target_path.to_string_lossy().to_string(),
        format: format.to_string(),
        data_url,
    })
}

pub fn delete_custom_font(file_name: &str) -> Result<bool, String> {
    let fonts_dir = paths::get_fonts_directory();
    let clean_name = Path::new(file_name)
        .file_name()
        .ok_or_else(|| "Invalid font filename".to_string())?;

    let target = fonts_dir.join(clean_name);
    if target.exists() {
        fs::remove_file(target).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Ok(false)
    }
}
