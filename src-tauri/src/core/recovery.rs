use crate::core::instances::{self, write_json_atomic};
use crate::core::mods::{list_installed_mods, InstallModPayload};
use crate::core::paths;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyPlan {
    pub items: Vec<InstallModPayload>,
    pub reused: Vec<String>,
    pub reused_items: Vec<InstallModPayload>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub id: String,
    pub kind: String,
    pub created_at: String,
    pub label: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySettings {
    pub keep_backups: usize,
    pub backup_after_play: bool,
}

impl Default for RecoverySettings {
    fn default() -> Self {
        Self {
            keep_backups: 5,
            backup_after_play: false,
        }
    }
}

pub fn get_recovery_directory(instance_id: &str) -> PathBuf {
    paths::get_instance_path(instance_id).join("recovery")
}

pub fn get_recovery_settings(instance_id: &str) -> Result<RecoverySettings, String> {
    let settings_path = get_recovery_directory(instance_id).join("settings.json");
    if settings_path.is_file() {
        if let Ok(raw) = fs::read_to_string(&settings_path) {
            if let Ok(settings) = serde_json::from_str::<RecoverySettings>(&raw) {
                return Ok(settings);
            }
        }
    }
    Ok(RecoverySettings::default())
}

pub fn save_recovery_settings(
    instance_id: &str,
    settings: &RecoverySettings,
) -> Result<(), String> {
    let dir = get_recovery_directory(instance_id);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let settings_path = dir.join("settings.json");
    write_json_atomic(&settings_path, settings)?;
    Ok(())
}

pub fn list_backups(instance_id: &str) -> Result<Vec<BackupEntry>, String> {
    let mut results = Vec::new();
    let legacy_dir = paths::get_instance_path(instance_id).join("backups");

    if legacy_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&legacy_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("saves-backup-") && name.ends_with(".zip") {
                    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    let created_at = entry
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .map(|t| {
                            let dt: chrono::DateTime<Utc> = t.into();
                            dt.to_rfc3339()
                        })
                        .unwrap_or_else(|| Utc::now().to_rfc3339());

                    results.push(BackupEntry {
                        id: name.clone(),
                        kind: "saves".to_string(),
                        created_at,
                        label: "World saves backup".to_string(),
                        size_bytes: size,
                    });
                }
            }
        }
    }

    results.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(results)
}

pub fn create_saves_backup(instance_id: &str) -> Result<BackupEntry, String> {
    let res = instances::backup_saves(instance_id)?;
    let p = Path::new(&res.backup_path);
    let filename = p.file_name().and_then(|n| n.to_str()).unwrap_or("backup.zip").to_string();
    let size = p.metadata().map(|m| m.len()).unwrap_or(0);

    Ok(BackupEntry {
        id: filename,
        kind: "saves".to_string(),
        created_at: Utc::now().to_rfc3339(),
        label: "World saves backup".to_string(),
        size_bytes: size,
    })
}

pub fn restore_backup(instance_id: &str, backup_id: &str) -> Result<(), String> {
    let legacy_dir = paths::get_instance_path(instance_id).join("backups");
    let target_archive = legacy_dir.join(backup_id);
    if !target_archive.is_file() {
        return Err(format!("Backup archive not found: {backup_id}"));
    }

    let saves_dir = paths::get_instance_minecraft_path(instance_id).join("saves");
    if !saves_dir.exists() {
        fs::create_dir_all(&saves_dir).map_err(|e| e.to_string())?;
    }

    let file = fs::File::open(&target_archive).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let entry_path = entry.mangled_name();
        let out_path = saves_dir.join(entry_path);

        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

pub fn plan_mods(payloads: Vec<InstallModPayload>) -> Result<DependencyPlan, String> {
    if payloads.is_empty() {
        return Ok(DependencyPlan {
            items: Vec::new(),
            reused: Vec::new(),
            reused_items: Vec::new(),
            warnings: Vec::new(),
        });
    }

    let instance_id = &payloads[0].instance_id;
    for p in &payloads {
        if &p.instance_id != instance_id {
            return Err("Select one target instance".to_string());
        }
    }

    let installed = list_installed_mods(instance_id)?;
    let mut items = Vec::new();
    let mut reused = Vec::new();
    let mut reused_items = Vec::new();
    let mut warnings = Vec::new();

    for payload in payloads {
        let is_already_installed = installed.iter().any(|m| {
            m.source == payload.mod_metadata.source
                && (m.id == payload.mod_metadata.id || m.filename == payload.version_file.filename)
        });

        if is_already_installed {
            reused.push(format!("{}:{}", payload.mod_metadata.source, payload.mod_metadata.id));
            reused_items.push(payload);
        } else {
            if let Some(deps) = &payload.version_file.dependencies {
                for dep in deps {
                    if dep.r#type == "optional" {
                        let dep_name = dep
                            .project_id
                            .as_deref()
                            .or(dep.version_id.as_deref())
                            .unwrap_or("unknown");
                        warnings.push(format!("Optional dependency {dep_name} is not installed automatically"));
                    }
                }
            }
            items.push(payload);
        }
    }

    Ok(DependencyPlan {
        items,
        reused,
        reused_items,
        warnings,
    })
}
