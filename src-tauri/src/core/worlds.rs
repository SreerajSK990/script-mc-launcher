use crate::core::fs_util::write_bytes_atomic;
use crate::core::instances;
use crate::core::paths;
use crate::core::safety;
use crate::core::servers::{self, SingleplayerWorldEntry};
use chrono::Utc;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedWorldEntry {
    #[serde(flatten)]
    pub world: SingleplayerWorldEntry,
    pub size_bytes: u64,
}

fn saves_directory(instance_id: &str) -> PathBuf {
    paths::get_instance_minecraft_path(instance_id).join("saves")
}

fn world_directory(instance_id: &str, folder_name: &str) -> Result<PathBuf, String> {
    let folder = safety::validate_file_name(folder_name)?;
    let path = saves_directory(instance_id).join(folder);
    if !path.is_dir() {
        return Err(format!("World not found: {folder_name}"));
    }
    Ok(path)
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

pub fn list_worlds(instance_id: &str) -> Result<Vec<ManagedWorldEntry>, String> {
    let instance = instances::get_instance_by_id(instance_id)?.ok_or("Instance not found")?;
    let mut worlds: Vec<ManagedWorldEntry> = servers::get_instance_worlds(&instance)
        .into_iter()
        .map(|world| ManagedWorldEntry {
            size_bytes: directory_size(&saves_directory(instance_id).join(&world.folder_name)),
            world,
        })
        .collect();
    worlds.sort_by(|a, b| b.world.last_played.cmp(&a.world.last_played));
    Ok(worlds)
}

pub fn set_level_name(level_dat: &[u8], new_name: &str) -> Result<Vec<u8>, String> {
    let mut decompressed = Vec::new();
    GzDecoder::new(level_dat)
        .read_to_end(&mut decompressed)
        .map_err(|e| format!("level.dat is not a valid compressed file: {e}"))?;
    let mut root: fastnbt::Value =
        fastnbt::from_bytes(&decompressed).map_err(|e| format!("level.dat could not be read: {e}"))?;
    let fastnbt::Value::Compound(root_fields) = &mut root else {
        return Err("level.dat has an unexpected structure".to_string());
    };
    let Some(fastnbt::Value::Compound(data)) = root_fields.get_mut("Data") else {
        return Err("level.dat has no Data section".to_string());
    };
    data.insert("LevelName".to_string(), fastnbt::Value::String(new_name.to_string()));
    let encoded = fastnbt::to_bytes(&root).map_err(|e| e.to_string())?;
    let mut encoder = GzEncoder::new(Vec::new(), flate2::Compression::default());
    encoder.write_all(&encoded).map_err(|e| e.to_string())?;
    encoder.finish().map_err(|e| e.to_string())
}

pub fn rename_world(instance_id: &str, folder_name: &str, new_name: &str) -> Result<(), String> {
    let trimmed = new_name.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return Err("World names must be between 1 and 64 characters".to_string());
    }
    let level_dat = world_directory(instance_id, folder_name)?.join("level.dat");
    let original = fs::read(&level_dat).map_err(|e| format!("Could not read level.dat: {e}"))?;
    let updated = set_level_name(&original, trimmed)?;
    fs::copy(&level_dat, level_dat.with_file_name("level.dat_old")).map_err(|e| e.to_string())?;
    write_bytes_atomic(&level_dat, &updated)
}

pub fn backup_world(instance_id: &str, folder_name: &str) -> Result<String, String> {
    let source = world_directory(instance_id, folder_name)?;
    let backups = paths::get_instance_path(instance_id).join("backups");
    fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    let stamp = Utc::now().format("%Y-%m-%dT%H-%M-%S");
    let target = backups.join(format!("world-{folder_name}-{stamp}.zip"));
    let temporary = target.with_extension("zip.part");

    let result = (|| -> Result<(), String> {
        let mut zip = ZipWriter::new(fs::File::create(&temporary).map_err(|e| e.to_string())?);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        let mut stack = vec![source.clone()];
        while let Some(directory) = stack.pop() {
            for entry in fs::read_dir(&directory).map_err(|e| e.to_string())?.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                    continue;
                }
                if path.file_name().is_some_and(|name| name == "session.lock") {
                    continue;
                }
                let relative = path.strip_prefix(&source).map_err(|e| e.to_string())?;
                let archive_name = format!("{folder_name}/{}", relative.to_string_lossy().replace('\\', "/"));
                zip.start_file(archive_name, options).map_err(|e| e.to_string())?;
                let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
                std::io::copy(&mut file, &mut zip).map_err(|e| e.to_string())?;
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
        fs::rename(&temporary, &target).map_err(|e| e.to_string())
    })();

    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    Ok(target.to_string_lossy().to_string())
}

pub fn delete_world(instance_id: &str, folder_name: &str) -> Result<String, String> {
    let source = world_directory(instance_id, folder_name)?;
    let trash = paths::get_instance_path(instance_id).join("deleted-worlds");
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    let target = trash.join(format!("{folder_name}-{}", Utc::now().format("%Y%m%d-%H%M%S")));
    fs::rename(&source, &target).map_err(|e| format!("Could not move the world (is the game still open?): {e}"))?;
    Ok(target.to_string_lossy().to_string())
}

pub fn open_world_folder(instance_id: &str, folder_name: &str) -> Result<(), String> {
    open::that(world_directory(instance_id, folder_name)?).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn level_name_is_rewritten_and_other_fields_survive() {
        let mut data = std::collections::HashMap::new();
        data.insert("LevelName".to_string(), fastnbt::Value::String("Old".into()));
        data.insert("GameType".to_string(), fastnbt::Value::Int(1));
        let mut root = std::collections::HashMap::new();
        root.insert("Data".to_string(), fastnbt::Value::Compound(data));
        let raw = fastnbt::to_bytes(&fastnbt::Value::Compound(root)).unwrap();
        let mut encoder = GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&raw).unwrap();
        let compressed = encoder.finish().unwrap();

        let updated = set_level_name(&compressed, "New Name").unwrap();
        let mut decompressed = Vec::new();
        GzDecoder::new(&updated[..]).read_to_end(&mut decompressed).unwrap();
        let value: fastnbt::Value = fastnbt::from_bytes(&decompressed).unwrap();
        let fastnbt::Value::Compound(root) = value else { panic!() };
        let Some(fastnbt::Value::Compound(data)) = root.get("Data") else { panic!() };
        assert_eq!(data.get("LevelName"), Some(&fastnbt::Value::String("New Name".into())));
        assert_eq!(data.get("GameType"), Some(&fastnbt::Value::Int(1)));
    }

    #[test]
    #[ignore]
    fn real_level_dat_round_trips() {
        let path = std::path::PathBuf::from(std::env::var("LEVEL_DAT").unwrap());
        let original = fs::read(&path).unwrap();
        let updated = set_level_name(&original, "Round Trip").unwrap();
        let mut decompressed = Vec::new();
        GzDecoder::new(&updated[..]).read_to_end(&mut decompressed).unwrap();
        let value: fastnbt::Value = fastnbt::from_bytes(&decompressed).unwrap();
        let mut original_decompressed = Vec::new();
        GzDecoder::new(&original[..]).read_to_end(&mut original_decompressed).unwrap();
        let mut original_value: fastnbt::Value = fastnbt::from_bytes(&original_decompressed).unwrap();
        if let fastnbt::Value::Compound(root) = &mut original_value {
            if let Some(fastnbt::Value::Compound(data)) = root.get_mut("Data") {
                data.insert("LevelName".to_string(), fastnbt::Value::String("Round Trip".into()));
            }
        }
        assert_eq!(value, original_value);
    }
}
