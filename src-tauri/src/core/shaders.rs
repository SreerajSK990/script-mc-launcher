use crate::core::instances::write_json_atomic;
use crate::core::mods::{list_installed_mods, InstallModPayload};
use crate::core::paths;
use serde::{Deserialize, Serialize};
use sha1::Digest;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShaderPack {
    pub shader_loaders: Option<Vec<String>>,
    pub id: String,
    pub name: String,
    pub filename: String,
    pub version: String,
    pub source: Option<String>,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShaderEnvironment {
    pub installed: Vec<String>,
    pub recommended_project: Option<String>,
    pub message: String,
}

pub fn get_shader_directory(instance_id: &str) -> PathBuf {
    paths::get_instance_minecraft_path(instance_id).join("shaderpacks")
}

pub fn get_shader_metadata_path(instance_id: &str) -> PathBuf {
    paths::get_instance_path(instance_id).join("shaders.json")
}

pub fn list_shaders(instance_id: &str) -> Result<Vec<ShaderPack>, String> {
    let dir = get_shader_directory(instance_id);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    let meta_path = get_shader_metadata_path(instance_id);
    let saved: Vec<ShaderPack> = if meta_path.is_file() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str(&r).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let mut result = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            if !name.to_lowercase().ends_with(".zip") {
                continue;
            }

            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            if let Some(prev) = saved.iter().find(|p| p.filename == name) {
                let mut up = prev.clone();
                up.size_bytes = size;
                result.push(up);
            } else {
                let clean_name = name.strip_suffix(".zip").unwrap_or(&name).to_string();
                result.push(ShaderPack {
                    shader_loaders: None,
                    id: format!("local-{name}"),
                    name: clean_name,
                    filename: name,
                    version: "Local".to_string(),
                    source: None,
                    size_bytes: size,
                });
            }
        }
    }

    let _ = write_json_atomic(&meta_path, &result);
    Ok(result)
}

pub async fn install_shader(payload: InstallModPayload) -> Result<ShaderPack, String> {
    let dir = get_shader_directory(&payload.instance_id);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    let download_url = payload
        .version_file
        .download_url
        .as_deref()
        .ok_or("Select a downloadable shader ZIP")?;

    let filename = &payload.version_file.filename;
    let target = dir.join(filename);

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
            return Err("SHA-512 integrity check failed for shader pack".to_string());
        }
    } else if let Some(expected_1) = &payload.version_file.sha1 {
        let mut hasher = sha1::Sha1::new();
        hasher.update(&bytes);
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected_1) {
            return Err("SHA-1 integrity check failed for shader pack".to_string());
        }
    }

    fs::write(&target, &bytes).map_err(|e| e.to_string())?;

    if let Some(old) = &payload.old_filename {
        if old != filename {
            let _ = fs::remove_file(dir.join(old));
        }
    }

    let pack = ShaderPack {
        shader_loaders: payload.version_file.shader_loaders,
        id: payload.mod_metadata.id,
        name: payload.mod_metadata.name,
        filename: filename.clone(),
        version: payload.version_file.version_number,
        source: Some(payload.mod_metadata.source),
        size_bytes: bytes.len() as u64,
    };

    let meta_path = get_shader_metadata_path(&payload.instance_id);
    let mut saved: Vec<ShaderPack> = if meta_path.is_file() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str(&r).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    saved.retain(|p| p.filename != *filename && payload.old_filename.as_deref() != Some(&p.filename));
    saved.push(pack.clone());
    write_json_atomic(&meta_path, &saved)?;

    Ok(pack)
}

pub fn import_shaders(instance_id: &str, file_paths: &[String]) -> Result<Vec<ShaderPack>, String> {
    let dir = get_shader_directory(instance_id);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    let mut imported = Vec::new();

    for path_str in file_paths {
        let src = Path::new(path_str);
        if !src.is_file() {
            continue;
        }

        let Some(name) = src.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        if !name.to_lowercase().ends_with(".zip") {
            continue;
        }

        let dest = dir.join(name);
        fs::copy(src, &dest).map_err(|e| e.to_string())?;

        let size = dest.metadata().map(|m| m.len()).unwrap_or(0);
        let clean_name = name.strip_suffix(".zip").unwrap_or(name).to_string();

        imported.push(ShaderPack {
            shader_loaders: None,
            id: format!("local-{name}"),
            name: clean_name,
            filename: name.to_string(),
            version: "Local".to_string(),
            source: None,
            size_bytes: size,
        });
    }

    let meta_path = get_shader_metadata_path(instance_id);
    let mut saved: Vec<ShaderPack> = if meta_path.is_file() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str(&r).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    for pack in &imported {
        saved.retain(|p| p.filename != pack.filename);
        saved.push(pack.clone());
    }

    let _ = write_json_atomic(&meta_path, &saved);
    Ok(imported)
}

pub fn delete_shader(instance_id: &str, filename: &str) -> Result<(), String> {
    let dir = get_shader_directory(instance_id);
    let target = dir.join(filename);
    if target.exists() {
        let _ = fs::remove_file(target);
    }

    let meta_path = get_shader_metadata_path(instance_id);
    if meta_path.is_file() {
        if let Some(mut saved) = fs::read_to_string(&meta_path)
            .ok()
            .and_then(|r| serde_json::from_str::<Vec<ShaderPack>>(&r).ok())
        {
            saved.retain(|p| p.filename != filename);
            let _ = write_json_atomic(&meta_path, &saved);
        }
    }

    Ok(())
}

pub fn get_shader_environment(instance_id: &str) -> Result<ShaderEnvironment, String> {
    let mods = list_installed_mods(instance_id)?;
    let mut installed = Vec::new();

    for m in mods.into_iter().filter(|m| m.enabled) {
        let name_lower = m.name.to_lowercase();
        let id_lower = m.id.to_lowercase();
        let file_lower = m.filename.to_lowercase();

        if name_lower.contains("iris") || id_lower.contains("iris") || file_lower.contains("iris") {
            if !installed.contains(&"Iris".to_string()) {
                installed.push("Iris".to_string());
            }
        }
        if name_lower.contains("oculus") || id_lower.contains("oculus") || file_lower.contains("oculus") {
            if !installed.contains(&"Oculus".to_string()) {
                installed.push("Oculus".to_string());
            }
        }
        if name_lower.contains("optifine") || id_lower.contains("optifine") || file_lower.contains("optifine") {
            if !installed.contains(&"OptiFine".to_string()) {
                installed.push("OptiFine".to_string());
            }
        }
    }

    if !installed.is_empty() {
        return Ok(ShaderEnvironment {
            installed: installed.clone(),
            recommended_project: None,
            message: format!("Compatible shader mod detected ({})", installed.join(", ")),
        });
    }

    Ok(ShaderEnvironment {
        installed: Vec::new(),
        recommended_project: Some("iris".to_string()),
        message: "No shader mod installed. Install Iris or Oculus from the Mod Browser to use shaders.".to_string(),
    })
}

pub fn open_shader_folder(instance_id: &str) -> Result<(), String> {
    let dir = get_shader_directory(instance_id);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    open::that(dir).map_err(|e| e.to_string())?;
    Ok(())
}
