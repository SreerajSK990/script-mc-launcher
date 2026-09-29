use crate::core::instances::{
    create_new_instance, write_json_atomic, CreateInstancePayload, InstanceConfiguration,
};
use crate::core::mods::{get_mods_metadata_path, InstalledModRecord};
use crate::core::paths;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredExternalInstance {
    pub id: String,
    pub name: String,
    pub launcher_type: String,
    pub launcher_name: String,
    pub minecraft_version: String,
    pub loader_type: String,
    pub loader_version: Option<String>,
    pub source_path: String,
    pub game_directory: String,
    pub icon_path: Option<String>,
    pub icon_data_url: Option<String>,
    pub total_mod_count: usize,
    pub has_saves: bool,
    pub saves_count: usize,
    pub ram_allocation_megabytes: Option<u32>,
    pub jvm_arguments: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneInstancePayload {
    pub source_instance: DiscoveredExternalInstance,
    pub custom_name: Option<String>,
    pub copy_saves: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneProgressEvent {
    pub step: String,
    pub message: String,
    pub current: usize,
    pub total: usize,
    pub percentage: u32,
}

#[derive(Debug, Clone, Deserialize)]
struct MmcComponent {
    uid: String,
    version: Option<String>,
    #[serde(rename = "cachedVersion")]
    cached_version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct MmcPackJson {
    components: Option<Vec<MmcComponent>>,
}

#[derive(Debug, Clone, Deserialize)]
struct CurseForgeInstanceManifestBaseLoader {
    name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct CurseForgeInstanceManifest {
    name: Option<String>,
    #[serde(rename = "gameVersion")]
    game_version: Option<String>,
    #[serde(rename = "baseModLoader")]
    base_mod_loader: Option<CurseForgeInstanceManifestBaseLoader>,
    #[serde(rename = "allocatedMemory")]
    allocated_memory: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct ModrinthProfileJson {
    name: Option<String>,
    game_version: Option<String>,
    loader: Option<String>,
    loader_version: Option<String>,
    memory: Option<u32>,
    java_arguments: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
struct VanillaProfile {
    name: Option<String>,
    #[serde(rename = "lastVersionId")]
    last_version_id: Option<String>,
    #[serde(rename = "gameDir")]
    game_dir: Option<String>,
    #[serde(rename = "javaArgs")]
    java_args: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct VanillaProfilesJson {
    profiles: Option<std::collections::HashMap<String, VanillaProfile>>,
}

fn count_files_and_check_saves(game_dir: &Path) -> (usize, bool, usize) {
    let mut mod_count = 0;
    let mut has_saves = false;
    let mut saves_count = 0;

    let mods_dir = game_dir.join("mods");
    if mods_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".jar") || name.ends_with(".jar.disabled") {
                    mod_count += 1;
                }
            }
        }
    }

    let saves_dir = game_dir.join("saves");
    if saves_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&saves_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    saves_count += 1;
                }
            }
        }
        has_saves = saves_count > 0;
    }

    (mod_count, has_saves, saves_count)
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest_child = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest_child)?;
        } else {
            fs::copy(entry.path(), dest_child)?;
        }
    }
    Ok(())
}

pub fn parse_prism_instance(instance_dir: &Path) -> Option<DiscoveredExternalInstance> {
    let pack_json_path = instance_dir.join("mmc-pack.json");
    if !pack_json_path.is_file() {
        return None;
    }

    let pack_raw = fs::read_to_string(&pack_json_path).ok()?;
    let pack_json: MmcPackJson = serde_json::from_str(&pack_raw).ok()?;
    let components = pack_json.components?;

    let mut mc_version = "1.20.1".to_string();
    let mut loader_type = "vanilla".to_string();
    let mut loader_version = None;

    for comp in components {
        match comp.uid.as_str() {
            "net.minecraft" => {
                if let Some(v) = comp.version.or(comp.cached_version) {
                    mc_version = v;
                }
            }
            "net.fabricmc.fabric-loader" => {
                loader_type = "fabric".to_string();
                loader_version = comp.version.or(comp.cached_version);
            }
            "org.quiltmc.quilt-loader" => {
                loader_type = "quilt".to_string();
                loader_version = comp.version.or(comp.cached_version);
            }
            "net.minecraftforge" => {
                loader_type = "forge".to_string();
                loader_version = comp.version.or(comp.cached_version);
            }
            "net.neoforged" => {
                loader_type = "neoforge".to_string();
                loader_version = comp.version.or(comp.cached_version);
            }
            _ => {}
        }
    }

    let folder_name = instance_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();
    let mut name = folder_name.clone();
    let mut ram_mb = None;
    let mut jvm_args = None;

    let cfg_path = instance_dir.join("instance.cfg");
    if cfg_path.is_file() {
        if let Ok(cfg_text) = fs::read_to_string(&cfg_path) {
            for line in cfg_text.lines() {
                if let Some(val) = line.strip_prefix("name=") {
                    let trimmed = val.trim();
                    if !trimmed.is_empty() {
                        name = trimmed.to_string();
                    }
                } else if let Some(val) = line.strip_prefix("MaxMemAlloc=") {
                    if let Ok(m) = val.trim().parse::<u32>() {
                        ram_mb = Some(m);
                    }
                } else if let Some(val) = line.strip_prefix("JvmArgs=") {
                    let trimmed = val.trim();
                    if !trimmed.is_empty() {
                        jvm_args = Some(trimmed.split_whitespace().map(|s| s.to_string()).collect());
                    }
                }
            }
        }
    }

    let dot_mc = instance_dir.join(".minecraft");
    let game_dir = if dot_mc.is_dir() {
        dot_mc
    } else {
        instance_dir.to_path_buf()
    };

    let (mod_count, has_saves, saves_count) = count_files_and_check_saves(&game_dir);

    Some(DiscoveredExternalInstance {
        id: format!("prism-{folder_name}"),
        name,
        launcher_type: "prism".to_string(),
        launcher_name: "Prism Launcher".to_string(),
        minecraft_version: mc_version,
        loader_type,
        loader_version,
        source_path: instance_dir.to_string_lossy().to_string(),
        game_directory: game_dir.to_string_lossy().to_string(),
        icon_path: None,
        icon_data_url: None,
        total_mod_count: mod_count,
        has_saves,
        saves_count,
        ram_allocation_megabytes: ram_mb,
        jvm_arguments: jvm_args,
    })
}

pub fn parse_curseforge_instance(instance_dir: &Path) -> Option<DiscoveredExternalInstance> {
    let manifest_path = instance_dir.join("minecraftinstance.json");
    if !manifest_path.is_file() {
        return None;
    }

    let raw = fs::read_to_string(&manifest_path).ok()?;
    let manifest: CurseForgeInstanceManifest = serde_json::from_str(&raw).ok()?;

    let mut loader_type = "vanilla".to_string();
    let mut loader_version = None;

    if let Some(loader_obj) = manifest.base_mod_loader {
        if let Some(name_str) = loader_obj.name {
            let lower = name_str.to_lowercase();
            if let Some(v) = lower.strip_prefix("forge-") {
                loader_type = "forge".to_string();
                loader_version = Some(v.to_string());
            } else if let Some(v) = lower.strip_prefix("neoforge-") {
                loader_type = "neoforge".to_string();
                loader_version = Some(v.to_string());
            } else if let Some(v) = lower.strip_prefix("fabric-") {
                loader_type = "fabric".to_string();
                loader_version = Some(v.to_string());
            } else if let Some(v) = lower.strip_prefix("quilt-") {
                loader_type = "quilt".to_string();
                loader_version = Some(v.to_string());
            }
        }
    }

    let folder_name = instance_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let (mod_count, has_saves, saves_count) = count_files_and_check_saves(instance_dir);

    Some(DiscoveredExternalInstance {
        id: format!("curseforge-{folder_name}"),
        name: manifest.name.unwrap_or(folder_name),
        launcher_type: "curseforge".to_string(),
        launcher_name: "CurseForge App".to_string(),
        minecraft_version: manifest.game_version.unwrap_or_else(|| "1.20.1".to_string()),
        loader_type,
        loader_version,
        source_path: instance_dir.to_string_lossy().to_string(),
        game_directory: instance_dir.to_string_lossy().to_string(),
        icon_path: None,
        icon_data_url: None,
        total_mod_count: mod_count,
        has_saves,
        saves_count,
        ram_allocation_megabytes: manifest.allocated_memory,
        jvm_arguments: None,
    })
}

pub fn parse_modrinth_profile(profile_dir: &Path) -> Option<DiscoveredExternalInstance> {
    let folder_name = profile_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let profile_json_path = profile_dir.join("profile.json");
    if profile_json_path.is_file() {
        if let Ok(raw) = fs::read_to_string(&profile_json_path) {
            if let Ok(profile) = serde_json::from_str::<ModrinthProfileJson>(&raw) {
                let mut loader_type = "vanilla".to_string();
                if let Some(l) = &profile.loader {
                    let lower = l.to_lowercase();
                    if lower == "fabric" || lower == "forge" || lower == "neoforge" || lower == "quilt" {
                        loader_type = lower;
                    }
                }

                let mut jvm_args = None;
                if let Some(val) = profile.java_arguments {
                    if let Some(s) = val.as_str() {
                        jvm_args = Some(s.split_whitespace().map(|s| s.to_string()).collect());
                    } else if let Some(arr) = val.as_array() {
                        jvm_args = Some(
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect(),
                        );
                    }
                }

                let (mod_count, has_saves, saves_count) = count_files_and_check_saves(profile_dir);

                return Some(DiscoveredExternalInstance {
                    id: format!("modrinth-{folder_name}"),
                    name: profile.name.unwrap_or(folder_name),
                    launcher_type: "modrinth".to_string(),
                    launcher_name: "Modrinth App".to_string(),
                    minecraft_version: profile.game_version.unwrap_or_else(|| "1.20.1".to_string()),
                    loader_type,
                    loader_version: profile.loader_version,
                    source_path: profile_dir.to_string_lossy().to_string(),
                    game_directory: profile_dir.to_string_lossy().to_string(),
                    icon_path: None,
                    icon_data_url: None,
                    total_mod_count: mod_count,
                    has_saves,
                    saves_count,
                    ram_allocation_megabytes: profile.memory,
                    jvm_arguments: jvm_args,
                });
            }
        }
    }

    let has_mods = profile_dir.join("mods").is_dir();
    let has_config = profile_dir.join("config").is_dir();
    let has_saves = profile_dir.join("saves").is_dir();
    let has_options = profile_dir.join("options.txt").is_file();

    if has_mods || has_config || has_saves || has_options {
        let (mod_count, has_saves, saves_count) = count_files_and_check_saves(profile_dir);
        let mut loader_type = "vanilla".to_string();
        let folder_lower = folder_name.to_lowercase();
        if folder_lower.contains("fabric") {
            loader_type = "fabric".to_string();
        } else if folder_lower.contains("neoforge") {
            loader_type = "neoforge".to_string();
        } else if folder_lower.contains("forge") {
            loader_type = "forge".to_string();
        } else if folder_lower.contains("quilt") {
            loader_type = "quilt".to_string();
        }

        return Some(DiscoveredExternalInstance {
            id: format!("modrinth-{folder_name}"),
            name: folder_name,
            launcher_type: "modrinth".to_string(),
            launcher_name: "Modrinth App".to_string(),
            minecraft_version: "1.20.1".to_string(),
            loader_type,
            loader_version: None,
            source_path: profile_dir.to_string_lossy().to_string(),
            game_directory: profile_dir.to_string_lossy().to_string(),
            icon_path: None,
            icon_data_url: None,
            total_mod_count: mod_count,
            has_saves,
            saves_count,
            ram_allocation_megabytes: None,
            jvm_arguments: None,
        });
    }

    None
}

pub fn parse_vanilla_profiles(dot_mc_dir: &Path) -> Vec<DiscoveredExternalInstance> {
    let profiles_json_path = dot_mc_dir.join("launcher_profiles.json");
    if !profiles_json_path.is_file() {
        return Vec::new();
    }

    let raw = match fs::read_to_string(&profiles_json_path) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };

    let profiles_data: VanillaProfilesJson = match serde_json::from_str(&raw) {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };

    let mut results = Vec::new();
    for (key, profile) in profiles_data.profiles.unwrap_or_default() {
        let game_dir = if let Some(ref d) = profile.game_dir {
            let p = Path::new(d);
            if p.is_dir() {
                p.to_path_buf()
            } else {
                dot_mc_dir.to_path_buf()
            }
        } else {
            dot_mc_dir.to_path_buf()
        };

        let ver_id = profile.last_version_id.clone().unwrap_or_else(|| "latest-release".to_string());
        let lower_ver = ver_id.to_lowercase();

        let mut loader_type = "vanilla".to_string();
        if lower_ver.contains("fabric") {
            loader_type = "fabric".to_string();
        } else if lower_ver.contains("forge") {
            loader_type = "forge".to_string();
        } else if lower_ver.contains("neoforge") {
            loader_type = "neoforge".to_string();
        } else if lower_ver.contains("quilt") {
            loader_type = "quilt".to_string();
        }

        let mut mc_version = "1.20.1".to_string();
        let parts: Vec<&str> = ver_id.split(|c: char| !c.is_numeric() && c != '.').filter(|s| s.contains('.')).collect();
        if let Some(first_ver) = parts.first() {
            mc_version = first_ver.to_string();
        }

        let (mod_count, has_saves, saves_count) = count_files_and_check_saves(&game_dir);
        let jvm_args = profile
            .java_args
            .map(|a| a.split_whitespace().map(|s| s.to_string()).collect());

        results.push(DiscoveredExternalInstance {
            id: format!("vanilla-{key}"),
            name: profile.name.unwrap_or(key),
            launcher_type: "vanilla".to_string(),
            launcher_name: "Official Launcher".to_string(),
            minecraft_version: mc_version,
            loader_type,
            loader_version: None,
            source_path: game_dir.to_string_lossy().to_string(),
            game_directory: game_dir.to_string_lossy().to_string(),
            icon_path: None,
            icon_data_url: None,
            total_mod_count: mod_count,
            has_saves,
            saves_count,
            ram_allocation_megabytes: None,
            jvm_arguments: jvm_args,
        });
    }

    results
}

pub fn scan_external_instances() -> Result<Vec<DiscoveredExternalInstance>, String> {
    let mut instances = Vec::new();

    let appdata = std::env::var("APPDATA").ok();
    let localappdata = std::env::var("LOCALAPPDATA").ok();
    let userprofile = std::env::var("USERPROFILE").ok();

    if let Some(ref ad) = appdata {
        let prism_dir = Path::new(ad).join("PrismLauncher").join("instances");
        if prism_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&prism_dir) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        if let Some(inst) = parse_prism_instance(&entry.path()) {
                            instances.push(inst);
                        }
                    }
                }
            }
        }

        let multimc_dir = Path::new(ad).join("MultiMC").join("instances");
        if multimc_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&multimc_dir) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        if let Some(mut inst) = parse_prism_instance(&entry.path()) {
                            inst.launcher_type = "multimc".to_string();
                            inst.launcher_name = "MultiMC".to_string();
                            inst.id = format!("multimc-{}", entry.file_name().to_string_lossy());
                            instances.push(inst);
                        }
                    }
                }
            }
        }

        let modrinth_profiles = Path::new(ad).join("ModrinthApp").join("profiles");
        if modrinth_profiles.is_dir() {
            if let Ok(entries) = fs::read_dir(&modrinth_profiles) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        if let Some(inst) = parse_modrinth_profile(&entry.path()) {
                            instances.push(inst);
                        }
                    }
                }
            }
        }

        let curseforge_instances = Path::new(ad).join("CurseForge").join("minecraft").join("Instances");
        if curseforge_instances.is_dir() {
            if let Ok(entries) = fs::read_dir(&curseforge_instances) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        if let Some(inst) = parse_curseforge_instance(&entry.path()) {
                            instances.push(inst);
                        }
                    }
                }
            }
        }

        let dot_mc = Path::new(ad).join(".minecraft");
        if dot_mc.is_dir() {
            instances.extend(parse_vanilla_profiles(&dot_mc));
        }
    }

    if let Some(ref up) = userprofile {
        let cf_up = Path::new(up).join("curseforge").join("minecraft").join("Instances");
        if cf_up.is_dir() {
            if let Ok(entries) = fs::read_dir(&cf_up) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        let path = entry.path();
                        let already = instances.iter().any(|i| i.source_path == path.to_string_lossy());
                        if !already {
                            if let Some(inst) = parse_curseforge_instance(&path) {
                                instances.push(inst);
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(ref lad) = localappdata {
        let prism_lad = Path::new(lad).join("Programs").join("PrismLauncher").join("instances");
        if prism_lad.is_dir() {
            if let Ok(entries) = fs::read_dir(&prism_lad) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        let path = entry.path();
                        let already = instances.iter().any(|i| i.source_path == path.to_string_lossy());
                        if !already {
                            if let Some(inst) = parse_prism_instance(&path) {
                                instances.push(inst);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(instances)
}

pub fn scan_custom_directory(target_path: &str) -> Result<Vec<DiscoveredExternalInstance>, String> {
    let path = Path::new(target_path);
    if !path.is_dir() {
        return Ok(Vec::new());
    }

    if let Some(mut prism) = parse_prism_instance(path) {
        prism.launcher_type = "custom".to_string();
        prism.launcher_name = "Custom Instance".to_string();
        return Ok(vec![prism]);
    }

    if let Some(mut modrinth) = parse_modrinth_profile(path) {
        modrinth.launcher_type = "custom".to_string();
        modrinth.launcher_name = "Custom Instance".to_string();
        return Ok(vec![modrinth]);
    }

    if let Some(mut curse) = parse_curseforge_instance(path) {
        curse.launcher_type = "custom".to_string();
        curse.launcher_name = "Custom Instance".to_string();
        return Ok(vec![curse]);
    }

    let mut results = Vec::new();
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let sub = entry.path();
                let inst = parse_prism_instance(&sub)
                    .or_else(|| parse_modrinth_profile(&sub))
                    .or_else(|| parse_curseforge_instance(&sub));
                if let Some(mut i) = inst {
                    i.launcher_type = "custom".to_string();
                    i.launcher_name = "Custom Instance".to_string();
                    results.push(i);
                }
            }
        }
    }

    if !results.is_empty() {
        return Ok(results);
    }

    let (mod_count, has_saves, saves_count) = count_files_and_check_saves(path);
    if mod_count > 0 || has_saves || path.join("options.txt").is_file() {
        let folder_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Custom")
            .to_string();
        return Ok(vec![DiscoveredExternalInstance {
            id: format!("custom-{folder_name}"),
            name: folder_name,
            launcher_type: "custom".to_string(),
            launcher_name: "Custom Minecraft Folder".to_string(),
            minecraft_version: "1.20.1".to_string(),
            loader_type: "vanilla".to_string(),
            loader_version: None,
            source_path: path.to_string_lossy().to_string(),
            game_directory: path.to_string_lossy().to_string(),
            icon_path: None,
            icon_data_url: None,
            total_mod_count: mod_count,
            has_saves,
            saves_count,
            ram_allocation_megabytes: None,
            jvm_arguments: None,
        }]);
    }

    Ok(Vec::new())
}

pub fn clone_external_instance<F>(
    payload: CloneInstancePayload,
    progress: F,
) -> Result<InstanceConfiguration, String>
where
    F: Fn(CloneProgressEvent),
{
    let source = payload.source_instance;
    let custom_name = payload.custom_name;
    let copy_saves = payload.copy_saves;

    progress(CloneProgressEvent {
        step: "reading".to_string(),
        message: format!("Initializing clone of {}...", source.name),
        current: 0,
        total: 100,
        percentage: 5,
    });

    let instance_name = custom_name
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| format!("{} (Copy)", source.name));

    let new_instance = create_new_instance(CreateInstancePayload {
        name: instance_name,
        minecraft_version: Some(source.minecraft_version.clone()),
        loader_type: Some(source.loader_type.clone()),
        loader_version: source.loader_version.clone(),
        ram_allocation_megabytes: source.ram_allocation_megabytes.or(Some(4096)),
        java_path: None,
        jvm_arguments: source.jvm_arguments.clone(),
        icon: None,
        group: None,
        is_favorite: None,
    })?;

    let target_minecraft_dir = paths::get_instance_minecraft_path(&new_instance.id);
    let source_game_dir = Path::new(&source.game_directory);

    progress(CloneProgressEvent {
        step: "copying-configs".to_string(),
        message: "Copying configurations and options...".to_string(),
        current: 15,
        total: 100,
        percentage: 15,
    });

    let config_dirs = [
        "config",
        "defaultconfigs",
        "resourcepacks",
        "shaderpacks",
        "datapacks",
        "kubejs",
        "fancymenu_data",
        "schematics",
        "openloader",
    ];

    for dir_name in config_dirs {
        let src = source_game_dir.join(dir_name);
        if src.is_dir() {
            let dst = target_minecraft_dir.join(dir_name);
            let _ = copy_dir_all(&src, &dst);
        }
    }

    let single_files = [
        "options.txt",
        "optionsof.txt",
        "servers.dat",
        "servers.dat_old",
        "hotbar.nbt",
        "usercache.json",
    ];

    for file_name in single_files {
        let src = source_game_dir.join(file_name);
        if src.is_file() {
            let dst = target_minecraft_dir.join(file_name);
            let _ = fs::copy(&src, &dst);
        }
    }

    progress(CloneProgressEvent {
        step: "copying-mods".to_string(),
        message: format!("Copying {} mod files...", source.total_mod_count),
        current: 40,
        total: 100,
        percentage: 40,
    });

    let src_mods = source_game_dir.join("mods");
    let target_mods = target_minecraft_dir.join("mods");
    let mut installed_mods = Vec::new();

    if src_mods.is_dir() {
        let _ = copy_dir_all(&src_mods, &target_mods);

        if let Ok(entries) = fs::read_dir(&target_mods) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.ends_with(".jar") && !name.ends_with(".jar.disabled") {
                    continue;
                }

                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                let is_enabled = name.ends_with(".jar");
                let raw_name = name
                    .strip_suffix(".jar.disabled")
                    .or_else(|| name.strip_suffix(".jar"))
                    .unwrap_or(&name)
                    .to_string();

                installed_mods.push(InstalledModRecord {
                    version_id: None,
                    dependencies: None,
                    id: raw_name.clone(),
                    name: raw_name,
                    version: "1.0.0".to_string(),
                    filename: name,
                    source: if source.launcher_type == "curseforge" {
                        "curseforge".to_string()
                    } else {
                        "modrinth".to_string()
                    },
                    icon_url: None,
                    installed_at: Utc::now().to_rfc3339(),
                    enabled: is_enabled,
                    file_size_bytes: size,
                    game_version: Some(source.minecraft_version.clone()),
                    loader: Some(source.loader_type.clone()),
                });
            }
        }
    }

    if copy_saves {
        progress(CloneProgressEvent {
            step: "copying-saves".to_string(),
            message: format!("Copying {} world saves...", source.saves_count),
            current: 70,
            total: 100,
            percentage: 70,
        });

        let src_saves = source_game_dir.join("saves");
        let target_saves = target_minecraft_dir.join("saves");
        if src_saves.is_dir() {
            let _ = copy_dir_all(&src_saves, &target_saves);
        }
    }

    progress(CloneProgressEvent {
        step: "finalizing".to_string(),
        message: "Registering instance and synchronizing mod catalog...".to_string(),
        current: 90,
        total: 100,
        percentage: 90,
    });

    let mods_meta_path = get_mods_metadata_path(&new_instance.id);
    let _ = write_json_atomic(&mods_meta_path, &installed_mods);

    progress(CloneProgressEvent {
        step: "completed".to_string(),
        message: format!("Successfully cloned {}!", new_instance.name),
        current: 100,
        total: 100,
        percentage: 100,
    });

    Ok(new_instance)
}
