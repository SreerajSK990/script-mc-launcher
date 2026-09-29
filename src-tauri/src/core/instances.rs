use crate::core::paths;
use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceConfiguration {
    pub id: String,
    pub name: String,
    pub minecraft_version: String,
    pub loader_type: String,
    pub loader_version: Option<String>,
    pub java_path: Option<String>,
    pub jvm_arguments: Vec<String>,
    pub ram_allocation_megabytes: u32,
    pub icon_path: Option<String>,
    pub icon: Option<String>,
    pub banner_path: Option<String>,
    pub group: Option<String>,
    pub is_favorite: Option<bool>,
    pub created_at: String,
    pub last_played_at: Option<String>,
    pub total_play_time_minutes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstancePayload {
    pub name: String,
    pub minecraft_version: Option<String>,
    pub loader_type: Option<String>,
    pub loader_version: Option<String>,
    pub ram_allocation_megabytes: Option<u32>,
    pub java_path: Option<String>,
    pub jvm_arguments: Option<Vec<String>>,
    pub icon: Option<String>,
    pub group: Option<String>,
    pub is_favorite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstancePayload {
    pub id: String,
    pub name: Option<String>,
    pub minecraft_version: Option<String>,
    pub loader_type: Option<String>,
    pub loader_version: Option<String>,
    pub java_path: Option<String>,
    pub jvm_arguments: Option<Vec<String>>,
    pub ram_allocation_megabytes: Option<u32>,
    pub icon: Option<String>,
    pub group: Option<String>,
    pub is_favorite: Option<bool>,
    pub last_played_at: Option<String>,
    pub total_play_time_minutes: Option<u64>,
}

pub fn default_jvm_arguments() -> Vec<String> {
    vec![
        "-XX:+UseG1GC".to_string(),
        "-XX:+ParallelRefProcEnabled".to_string(),
        "-XX:MaxGCPauseMillis=200".to_string(),
        "-XX:+UnlockExperimentalVMOptions".to_string(),
        "-XX:+DisableExplicitGC".to_string(),
        "-XX:+AlwaysPreTouch".to_string(),
        "-XX:G1NewSizePercent=30".to_string(),
        "-XX:G1MaxNewSizePercent=40".to_string(),
        "-XX:G1ReservePercent=20".to_string(),
        "-XX:G1HeapWastePercent=5".to_string(),
        "-XX:G1MixedGCCountTarget=4".to_string(),
        "-XX:InitiatingHeapOccupancyPercent=15".to_string(),
        "-XX:G1MixedGCLiveThresholdPercent=90".to_string(),
        "-XX:G1RSetUpdatingPauseTimePercent=5".to_string(),
        "-XX:SurvivorRatio=32".to_string(),
        "-XX:+PerfDisableSharedMem".to_string(),
        "-XX:MaxTenuringThreshold=1".to_string(),
    ]
}

pub fn write_json_atomic<T: Serialize>(path: &Path, data: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temp_path = path.with_extension("tmp");
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&temp_path, content).map_err(|e| e.to_string())?;
    fs::rename(&temp_path, path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn generate_instance_id(name: &str) -> String {
    let sanitized: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '-' })
        .collect();

    let clean = sanitized.trim_matches('-');
    let prefix = if clean.is_empty() { "instance" } else { &clean[..clean.len().min(24)] };
    let uuid_suffix = &uuid::Uuid::new_v4().to_string()[..8];
    format!("{prefix}-{uuid_suffix}")
}

pub fn list_all_instances() -> Result<Vec<InstanceConfiguration>, String> {
    let instances_dir = paths::get_instances_directory();
    if !instances_dir.exists() {
        fs::create_dir_all(&instances_dir).map_err(|e| e.to_string())?;
    }

    let entries = fs::read_dir(&instances_dir).map_err(|e| e.to_string())?;
    let mut instances = Vec::new();

    for entry in entries.flatten() {
        if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            let config_path = entry.path().join("instance.json");
            if config_path.exists() {
                if let Ok(content) = fs::read_to_string(&config_path) {
                    if let Ok(config) = serde_json::from_str::<InstanceConfiguration>(&content) {
                        instances.push(config);
                    }
                }
            }
        }
    }

    instances.sort_by(|a, b| {
        let time_a = a.last_played_at.as_deref().unwrap_or(&a.created_at);
        let time_b = b.last_played_at.as_deref().unwrap_or(&b.created_at);
        time_b.cmp(time_a)
    });

    Ok(instances)
}

pub fn get_instance_by_id(instance_id: &str) -> Result<Option<InstanceConfiguration>, String> {
    let config_path = paths::get_instance_config_path(instance_id);
    if !config_path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let config = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(Some(config))
}

pub fn create_new_instance(payload: CreateInstancePayload) -> Result<InstanceConfiguration, String> {
    let instance_id = generate_instance_id(&payload.name);
    let instance_dir = paths::get_instance_path(&instance_id);
    let mc_dir = paths::get_instance_minecraft_path(&instance_id);

    fs::create_dir_all(&instance_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(mc_dir.join("mods")).map_err(|e| e.to_string())?;
    fs::create_dir_all(mc_dir.join("saves")).map_err(|e| e.to_string())?;
    fs::create_dir_all(mc_dir.join("config")).map_err(|e| e.to_string())?;

    let now = Utc::now().to_rfc3339();
    let instance = InstanceConfiguration {
        id: instance_id,
        name: payload.name.trim().to_string(),
        minecraft_version: payload.minecraft_version.unwrap_or_else(|| "1.21.1".to_string()),
        loader_type: payload.loader_type.unwrap_or_else(|| "vanilla".to_string()),
        loader_version: payload.loader_version,
        java_path: payload.java_path,
        jvm_arguments: payload.jvm_arguments.unwrap_or_else(default_jvm_arguments),
        ram_allocation_megabytes: payload.ram_allocation_megabytes.unwrap_or(4096),
        icon_path: None,
        icon: Some(payload.icon.unwrap_or_else(|| "minecraft_grass".to_string())),
        banner_path: None,
        group: payload.group.map(|g| g.trim().to_string()),
        is_favorite: payload.is_favorite,
        created_at: now,
        last_played_at: None,
        total_play_time_minutes: 0,
    };

    let config_path = paths::get_instance_config_path(&instance.id);
    write_json_atomic(&config_path, &instance)?;

    Ok(instance)
}

pub fn update_instance(payload: UpdateInstancePayload) -> Result<InstanceConfiguration, String> {
    let mut instance = get_instance_by_id(&payload.id)?
        .ok_or_else(|| format!("Instance not found: {}", payload.id))?;

    if let Some(name) = payload.name {
        instance.name = name.trim().to_string();
    }
    if let Some(version) = payload.minecraft_version {
        instance.minecraft_version = version;
    }
    if let Some(loader) = payload.loader_type {
        instance.loader_type = loader;
    }
    if payload.loader_version.is_some() {
        instance.loader_version = payload.loader_version;
    }
    if payload.java_path.is_some() {
        instance.java_path = payload.java_path;
    }
    if let Some(jvm_args) = payload.jvm_arguments {
        instance.jvm_arguments = jvm_args;
    }
    if let Some(ram) = payload.ram_allocation_megabytes {
        instance.ram_allocation_megabytes = ram;
    }
    if let Some(icon) = payload.icon {
        instance.icon = Some(icon);
    }
    if payload.group.is_some() {
        instance.group = payload.group.map(|g| g.trim().to_string());
    }
    if let Some(fav) = payload.is_favorite {
        instance.is_favorite = Some(fav);
    }
    if payload.last_played_at.is_some() {
        instance.last_played_at = payload.last_played_at;
    }
    if let Some(playtime) = payload.total_play_time_minutes {
        instance.total_play_time_minutes = playtime;
    }

    let config_path = paths::get_instance_config_path(&instance.id);
    write_json_atomic(&config_path, &instance)?;

    Ok(instance)
}

pub fn delete_instance(instance_id: &str) -> Result<bool, String> {
    let instance_dir = paths::get_instance_path(instance_id);
    if instance_dir.exists() {
        fs::remove_dir_all(&instance_dir).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn open_instance_folder(instance_id: &str) -> Result<(), String> {
    let instance_dir = paths::get_instance_path(instance_id);
    if instance_dir.exists() {
        open::that(instance_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn set_instance_group(instance_id: &str, group: Option<String>) -> Result<InstanceConfiguration, String> {
    let mut instance = get_instance_by_id(instance_id)?
        .ok_or_else(|| format!("Instance not found: {instance_id}"))?;
    instance.group = group.map(|g| g.trim().to_string()).filter(|g| !g.is_empty());
    let config_path = paths::get_instance_config_path(instance_id);
    write_json_atomic(&config_path, &instance)?;
    Ok(instance)
}

pub fn toggle_favorite(instance_id: &str) -> Result<InstanceConfiguration, String> {
    let mut instance = get_instance_by_id(instance_id)?
        .ok_or_else(|| format!("Instance not found: {instance_id}"))?;
    let new_fav = !instance.is_favorite.unwrap_or(false);
    instance.is_favorite = Some(new_fav);
    let config_path = paths::get_instance_config_path(instance_id);
    write_json_atomic(&config_path, &instance)?;
    Ok(instance)
}

fn copy_dir_all(src: &Path, dst: &Path, skip_names: &[&str]) -> Result<(), String> {
    if !dst.exists() {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    }
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy();
        if skip_names.contains(&name_str.as_ref()) {
            continue;
        }
        let src_path = entry.path();
        let dst_path = dst.join(&file_name);
        if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            copy_dir_all(&src_path, &dst_path, skip_names)?;
        } else {
            fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn add_dir_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    base_dir: &Path,
    current_dir: &Path,
    options: SimpleFileOptions,
) -> Result<(), String> {
    for entry in fs::read_dir(current_dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let relative = path.strip_prefix(base_dir).map_err(|e| e.to_string())?;
        let name = relative.to_string_lossy().replace('\\', "/");
        if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            zip.add_directory(&name, options).map_err(|e| e.to_string())?;
            add_dir_to_zip(zip, base_dir, &path, options)?;
        } else {
            zip.start_file(&name, options).map_err(|e| e.to_string())?;
            let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;
            let mut buffer = Vec::new();
            f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            zip.write_all(&buffer).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn rename_group(old_name: &str, new_name: &str) -> Result<(), String> {
    let instances = list_all_instances()?;
    let target = old_name.trim();
    let clean_new = new_name.trim();
    for instance in instances {
        if instance.group.as_deref() == Some(target) {
            update_instance(UpdateInstancePayload {
                id: instance.id,
                name: None,
                minecraft_version: None,
                loader_type: None,
                loader_version: None,
                java_path: None,
                jvm_arguments: None,
                ram_allocation_megabytes: None,
                icon: None,
                group: if clean_new.is_empty() { None } else { Some(clean_new.to_string()) },
                is_favorite: None,
                last_played_at: None,
                total_play_time_minutes: None,
            })?;
        }
    }
    Ok(())
}

pub fn disband_group(group_name: &str) -> Result<(), String> {
    let instances = list_all_instances()?;
    let target = group_name.trim();
    for instance in instances {
        if instance.group.as_deref() == Some(target) {
            let mut updated = instance;
            updated.group = None;
            let config_path = paths::get_instance_config_path(&updated.id);
            write_json_atomic(&config_path, &updated)?;
        }
    }
    Ok(())
}

pub fn delete_group(group_name: &str) -> Result<(), String> {
    let instances = list_all_instances()?;
    let target = group_name.trim();
    for instance in instances {
        if instance.group.as_deref() == Some(target) {
            delete_instance(&instance.id)?;
        }
    }
    Ok(())
}

pub fn save_custom_icon(instance_id: &str, data_url: &str) -> Result<String, String> {
    let instance_dir = paths::get_instance_path(instance_id);
    if !instance_dir.exists() {
        fs::create_dir_all(&instance_dir).map_err(|e| e.to_string())?;
    }
    let parts: Vec<&str> = data_url.splitn(2, ',').collect();
    if parts.len() != 2 {
        return Err("Invalid image data URL format".to_string());
    }
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(parts[1])
        .map_err(|e| e.to_string())?;
    let icon_path = instance_dir.join("icon.png");
    fs::write(&icon_path, decoded).map_err(|e| e.to_string())?;

    let mut instance = get_instance_by_id(instance_id)?
        .ok_or_else(|| format!("Instance not found: {instance_id}"))?;
    instance.icon = Some(data_url.to_string());
    let config_path = paths::get_instance_config_path(instance_id);
    write_json_atomic(&config_path, &instance)?;
    Ok(data_url.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationStatus {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub success: bool,
    pub backup_path: String,
}

pub fn repair_instance(instance_id: &str) -> Result<OperationStatus, String> {
    let instance = get_instance_by_id(instance_id)?
        .ok_or_else(|| format!("Instance not found: {instance_id}"))?;
    let natives_dir = paths::get_instance_path(instance_id).join("natives");
    if natives_dir.exists() {
        fs::remove_dir_all(&natives_dir).map_err(|e| e.to_string())?;
    }
    let meta_file = paths::get_meta_cache_directory()
        .join("mojang")
        .join("versions")
        .join(format!("{}.json", instance.minecraft_version));
    if meta_file.exists() {
        let _ = fs::remove_file(&meta_file);
    }
    Ok(OperationStatus {
        success: true,
        message: format!(
            "Instance \"{}\" repaired successfully. Dependencies and runtime libraries will be verified and re-downloaded on next launch.",
            instance.name
        ),
    })
}

pub fn backup_saves(instance_id: &str) -> Result<BackupResult, String> {
    let _instance = get_instance_by_id(instance_id)?
        .ok_or_else(|| format!("Instance not found: {instance_id}"))?;
    let saves_dir = paths::get_instance_minecraft_path(instance_id).join("saves");
    if !saves_dir.exists() {
        return Ok(BackupResult {
            success: true,
            backup_path: "No saves directory found to backup.".to_string(),
        });
    }
    let backups_dir = paths::get_instance_path(instance_id).join("backups");
    if !backups_dir.exists() {
        fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    }
    let timestamp = Utc::now().to_rfc3339().replace(':', "-").replace('.', "-");
    let backup_filename = format!("saves-backup-{timestamp}.zip");
    let backup_path = backups_dir.join(&backup_filename);

    let file = fs::File::create(&backup_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    add_dir_to_zip(&mut zip, &saves_dir, &saves_dir, options)?;
    zip.finish().map_err(|e| e.to_string())?;

    Ok(BackupResult {
        success: true,
        backup_path: backup_path.to_string_lossy().to_string(),
    })
}

pub fn clone_instance(instance_id: &str, custom_name: Option<String>) -> Result<InstanceConfiguration, String> {
    let source = get_instance_by_id(instance_id)?
        .ok_or_else(|| format!("Instance not found: {instance_id}"))?;
    let new_name = match custom_name {
        Some(name) if !name.trim().is_empty() => name.trim().to_string(),
        _ => format!("{} (Backup)", source.name),
    };

    let new_instance = create_new_instance(CreateInstancePayload {
        name: new_name,
        minecraft_version: Some(source.minecraft_version),
        loader_type: Some(source.loader_type),
        loader_version: source.loader_version,
        ram_allocation_megabytes: Some(source.ram_allocation_megabytes),
        java_path: source.java_path,
        jvm_arguments: Some(source.jvm_arguments),
        icon: source.icon,
        group: source.group,
        is_favorite: source.is_favorite,
    })?;

    let src_mc_dir = paths::get_instance_minecraft_path(instance_id);
    let dst_mc_dir = paths::get_instance_minecraft_path(&new_instance.id);
    if src_mc_dir.exists() {
        copy_dir_all(&src_mc_dir, &dst_mc_dir, &["crash-reports", "logs", ".fabric", ".quilt"])?;
    }

    for meta_name in &["mods.json", "resourcepacks.json", "shaders.json"] {
        let src_meta = paths::get_instance_path(instance_id).join(meta_name);
        if src_meta.exists() {
            let dst_meta = paths::get_instance_path(&new_instance.id).join(meta_name);
            let _ = fs::copy(&src_meta, &dst_meta);
        }
    }

    Ok(new_instance)
}

