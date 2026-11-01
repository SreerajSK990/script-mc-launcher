use crate::core::fs_util::write_json_atomic;
use crate::core::instances;
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

fn extract_backup_archive(archive_path: &Path, destination: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(entry_path) = entry.enclosed_name() else {
            return Err(format!("Backup archive contains an unsafe path: {}", entry.name()));
        };
        let out_path = destination.join(entry_path);

        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn restore_backup(instance_id: &str, backup_id: &str) -> Result<(), String> {
    crate::core::safety::validate_file_name(backup_id)?;
    let legacy_dir = paths::get_instance_path(instance_id).join("backups");
    let target_archive = legacy_dir.join(backup_id);
    if !target_archive.is_file() {
        return Err(format!("Backup archive not found: {backup_id}"));
    }

    let minecraft_dir = paths::get_instance_minecraft_path(instance_id);
    fs::create_dir_all(&minecraft_dir).map_err(|e| e.to_string())?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let staging_dir = minecraft_dir.join(format!("saves.restoring-{stamp}"));
    let saves_dir = minecraft_dir.join("saves");
    let previous_dir = minecraft_dir.join(format!("saves.before-restore-{stamp}"));

    if let Err(error) = extract_backup_archive(&target_archive, &staging_dir) {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(error);
    }

    if saves_dir.exists() {
        if let Err(error) = fs::rename(&saves_dir, &previous_dir) {
            let _ = fs::remove_dir_all(&staging_dir);
            return Err(format!("Could not move the current worlds aside (is the game still open?): {error}"));
        }
    }

    if let Err(error) = fs::rename(&staging_dir, &saves_dir) {
        if previous_dir.exists() {
            let _ = fs::rename(&previous_dir, &saves_dir);
        }
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(format!("Could not put the restored worlds in place: {error}"));
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
        p.validate()?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_archive(path: &Path, entries: &[(&str, &str)]) {
        let mut writer = zip::ZipWriter::new(fs::File::create(path).unwrap());
        for (name, content) in entries {
            writer
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
    }

    #[test]
    fn extraction_rejects_escaping_entries_and_restores_nested_files() {
        let root = std::env::temp_dir().join(format!("script-launcher-restore-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();

        let good = root.join("good.zip");
        write_archive(&good, &[("World/level.dat", "data")]);
        extract_backup_archive(&good, &root.join("out")).unwrap();
        assert_eq!(fs::read_to_string(root.join("out").join("World").join("level.dat")).unwrap(), "data");

        let evil = root.join("evil.zip");
        write_archive(&evil, &[("../escaped.txt", "x")]);
        assert!(extract_backup_archive(&evil, &root.join("evil-out")).is_err());
        assert!(!root.join("escaped.txt").exists());

        fs::remove_dir_all(root).unwrap();
    }
}
