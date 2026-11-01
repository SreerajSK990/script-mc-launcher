use crate::core::fs_util::write_json_atomic;
use crate::core::instances;
use crate::core::mods::InstallModPayload;
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

const MOD_SNAPSHOT_PREFIX: &str = "mods-";
const SNAPSHOT_METADATA_FILE: &str = "snapshot.json";

fn snapshots_directory(instance_id: &str) -> PathBuf {
    get_recovery_directory(instance_id).join("snapshots")
}

fn saves_backups_directory(instance_id: &str) -> PathBuf {
    paths::get_instance_path(instance_id).join("backups")
}

fn directory_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| match entry.metadata() {
            Ok(meta) if meta.is_dir() => directory_size(&entry.path()),
            Ok(meta) => meta.len(),
            Err(_) => 0,
        })
        .sum()
}

fn list_mod_snapshots(instance_id: &str) -> Vec<BackupEntry> {
    let Ok(entries) = fs::read_dir(snapshots_directory(instance_id)) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let raw = fs::read_to_string(entry.path().join(SNAPSHOT_METADATA_FILE)).ok()?;
            let mut snapshot: BackupEntry = serde_json::from_str(&raw).ok()?;
            snapshot.size_bytes = directory_size(&entry.path());
            Some(snapshot)
        })
        .collect()
}

fn list_saves_backups(instance_id: &str) -> Vec<BackupEntry> {
    let Ok(entries) = fs::read_dir(saves_backups_directory(instance_id)) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if !(name.starts_with("saves-backup-") && name.ends_with(".zip")) {
                return None;
            }
            let metadata = entry.metadata().ok()?;
            let created_at = metadata
                .modified()
                .ok()
                .map(|time| chrono::DateTime::<Utc>::from(time).to_rfc3339())
                .unwrap_or_else(|| Utc::now().to_rfc3339());
            Some(BackupEntry {
                id: name,
                kind: "saves".to_string(),
                created_at,
                label: "World saves backup".to_string(),
                size_bytes: metadata.len(),
            })
        })
        .collect()
}

pub fn list_backups(instance_id: &str) -> Result<Vec<BackupEntry>, String> {
    let mut results = list_mod_snapshots(instance_id);
    results.extend(list_saves_backups(instance_id));
    results.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(results)
}

pub fn prune_backups(instance_id: &str) -> Result<(), String> {
    let keep = get_recovery_settings(instance_id)?.keep_backups.max(1);
    let mut snapshots = list_mod_snapshots(instance_id);
    snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    for stale in snapshots.iter().skip(keep) {
        let _ = fs::remove_dir_all(snapshots_directory(instance_id).join(&stale.id));
    }
    let mut saves = list_saves_backups(instance_id);
    saves.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    for stale in saves.iter().skip(keep) {
        let _ = fs::remove_file(saves_backups_directory(instance_id).join(&stale.id));
    }
    Ok(())
}

pub fn create_mod_snapshot(instance_id: &str, label: &str) -> Result<BackupEntry, String> {
    let created_at = Utc::now();
    let id = format!("{MOD_SNAPSHOT_PREFIX}{}", created_at.format("%Y%m%d-%H%M%S%.3f")).replace('.', "-");
    let snapshot_dir = snapshots_directory(instance_id).join(&id);
    let mods_dir = paths::get_instance_minecraft_path(instance_id).join("mods");
    fs::create_dir_all(&snapshot_dir).map_err(|e| e.to_string())?;

    let result = (|| -> Result<BackupEntry, String> {
        if mods_dir.is_dir() {
            crate::core::fs_util::link_dir_recursive(&mods_dir, &snapshot_dir.join("mods"))?;
        } else {
            fs::create_dir_all(snapshot_dir.join("mods")).map_err(|e| e.to_string())?;
        }
        let metadata_path = paths::get_instance_path(instance_id).join("mods.json");
        if metadata_path.is_file() {
            fs::copy(&metadata_path, snapshot_dir.join("mods.json")).map_err(|e| e.to_string())?;
        }
        let entry = BackupEntry {
            id: id.clone(),
            kind: "mods".to_string(),
            created_at: created_at.to_rfc3339(),
            label: label.to_string(),
            size_bytes: directory_size(&snapshot_dir),
        };
        write_json_atomic(&snapshot_dir.join(SNAPSHOT_METADATA_FILE), &entry)?;
        Ok(entry)
    })();

    match result {
        Ok(entry) => {
            prune_backups(instance_id)?;
            Ok(entry)
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&snapshot_dir);
            Err(error)
        }
    }
}

pub fn create_saves_backup(instance_id: &str) -> Result<BackupEntry, String> {
    let res = instances::backup_saves(instance_id)?;
    let p = Path::new(&res.backup_path);
    let filename = p.file_name().and_then(|n| n.to_str()).unwrap_or("backup.zip").to_string();
    let size = p.metadata().map(|m| m.len()).unwrap_or(0);
    prune_backups(instance_id)?;

    Ok(BackupEntry {
        id: filename,
        kind: "saves".to_string(),
        created_at: Utc::now().to_rfc3339(),
        label: "World saves backup".to_string(),
        size_bytes: size,
    })
}

fn restore_mod_snapshot(instance_id: &str, snapshot_id: &str) -> Result<(), String> {
    let snapshot_dir = snapshots_directory(instance_id).join(snapshot_id);
    if !snapshot_dir.join(SNAPSHOT_METADATA_FILE).is_file() {
        return Err(format!("Mod snapshot not found: {snapshot_id}"));
    }
    create_mod_snapshot(instance_id, "Before restoring an earlier mod setup")?;

    let minecraft_dir = paths::get_instance_minecraft_path(instance_id);
    let mods_dir = minecraft_dir.join("mods");
    let stamp = Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let staging_dir = minecraft_dir.join(format!("mods.restoring-{stamp}"));
    let previous_dir = minecraft_dir.join(format!("mods.replaced-{stamp}"));

    if let Err(error) = crate::core::fs_util::link_dir_recursive(&snapshot_dir.join("mods"), &staging_dir) {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(error);
    }
    if mods_dir.exists() {
        if let Err(error) = fs::rename(&mods_dir, &previous_dir) {
            let _ = fs::remove_dir_all(&staging_dir);
            return Err(format!("Could not move the current mods aside (is the game still open?): {error}"));
        }
    }
    if let Err(error) = fs::rename(&staging_dir, &mods_dir) {
        if previous_dir.exists() {
            let _ = fs::rename(&previous_dir, &mods_dir);
        }
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(format!("Could not put the restored mods in place: {error}"));
    }
    let _ = fs::remove_dir_all(&previous_dir);

    let metadata_target = paths::get_instance_path(instance_id).join("mods.json");
    let snapshot_metadata = snapshot_dir.join("mods.json");
    if snapshot_metadata.is_file() {
        let bytes = fs::read(&snapshot_metadata).map_err(|e| e.to_string())?;
        crate::core::fs_util::write_bytes_atomic(&metadata_target, &bytes)?;
    } else {
        let _ = fs::remove_file(metadata_target);
    }
    Ok(())
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
    if backup_id.starts_with(MOD_SNAPSHOT_PREFIX) {
        return restore_mod_snapshot(instance_id, backup_id);
    }
    let legacy_dir = saves_backups_directory(instance_id);
    let target_archive = legacy_dir.join(backup_id);
    if !target_archive.is_file() {
        return Err(format!("Backup archive not found: {backup_id}"));
    }

    let minecraft_dir = paths::get_instance_minecraft_path(instance_id);
    fs::create_dir_all(&minecraft_dir).map_err(|e| e.to_string())?;
    if minecraft_dir.join("saves").is_dir() {
        instances::backup_saves(instance_id)?;
    }
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
    let _ = fs::remove_dir_all(&previous_dir);

    Ok(())
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
    fn mod_snapshots_restore_and_prune() {
        let root = std::env::temp_dir().join(format!("script-launcher-snapshots-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        unsafe {
            std::env::set_var("LAUNCHER_DATA_DIR", &root);
        }
        let instance_id = "snapshot-test";
        let mods_dir = paths::get_instance_minecraft_path(instance_id).join("mods");
        fs::create_dir_all(&mods_dir).unwrap();
        fs::write(mods_dir.join("a.jar"), "a").unwrap();

        let snapshot = create_mod_snapshot(instance_id, "Before test").unwrap();
        fs::remove_file(mods_dir.join("a.jar")).unwrap();
        fs::write(mods_dir.join("b.jar"), "b").unwrap();
        restore_backup(instance_id, &snapshot.id).unwrap();
        assert!(mods_dir.join("a.jar").is_file());
        assert!(!mods_dir.join("b.jar").exists());
        assert_eq!(list_backups(instance_id).unwrap().iter().filter(|b| b.kind == "mods").count(), 2);

        save_recovery_settings(instance_id, &RecoverySettings { keep_backups: 1, backup_after_play: false }).unwrap();
        prune_backups(instance_id).unwrap();
        assert_eq!(list_backups(instance_id).unwrap().len(), 1);

        unsafe {
            std::env::remove_var("LAUNCHER_DATA_DIR");
        }
        fs::remove_dir_all(root).unwrap();
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
