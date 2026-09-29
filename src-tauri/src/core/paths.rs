use std::path::PathBuf;

pub const DATA_DIRECTORY_NAME: &str = ".scriptlauncher";

pub fn get_launcher_root_directory() -> PathBuf {
    if let Ok(custom_dir) = std::env::var("LAUNCHER_DATA_DIR") {
        if !custom_dir.is_empty() {
            return PathBuf::from(custom_dir);
        }
    }

    if cfg!(target_os = "windows") {
        if let Ok(app_data) = std::env::var("APPDATA") {
            return PathBuf::from(app_data).join(DATA_DIRECTORY_NAME);
        }
    } else if cfg!(target_os = "macos") {
        if let Some(user_home) = dirs::home_dir() {
            return user_home
                .join("Library")
                .join("Application Support")
                .join(DATA_DIRECTORY_NAME);
        }
    }

    dirs::home_dir()
        .map(|home| home.join(DATA_DIRECTORY_NAME))
        .unwrap_or_else(|| PathBuf::from(".").join(DATA_DIRECTORY_NAME))
}

pub fn get_instances_directory() -> PathBuf {
    get_launcher_root_directory().join("instances")
}

pub fn get_instance_path(instance_id: &str) -> PathBuf {
    get_instances_directory().join(instance_id)
}

pub fn get_instance_minecraft_path(instance_id: &str) -> PathBuf {
    get_instance_path(instance_id).join("minecraft")
}

pub fn get_instance_config_path(instance_id: &str) -> PathBuf {
    get_instance_path(instance_id).join("instance.json")
}

pub fn get_libraries_directory() -> PathBuf {
    get_launcher_root_directory().join("libraries")
}

pub fn get_assets_directory() -> PathBuf {
    get_launcher_root_directory().join("assets")
}

pub fn get_java_runtimes_directory() -> PathBuf {
    get_launcher_root_directory().join("java")
}

pub fn get_meta_cache_directory() -> PathBuf {
    get_launcher_root_directory().join("meta-cache")
}

pub fn get_fonts_directory() -> PathBuf {
    get_launcher_root_directory().join("fonts")
}

pub fn get_skins_directory() -> PathBuf {
    get_launcher_root_directory().join("skins")
}

pub fn get_capes_directory() -> PathBuf {
    get_launcher_root_directory().join("capes")
}

pub fn initialize_launcher_directories() -> std::io::Result<()> {
    std::fs::create_dir_all(get_launcher_root_directory())?;
    std::fs::create_dir_all(get_instances_directory())?;
    std::fs::create_dir_all(get_libraries_directory())?;
    std::fs::create_dir_all(get_assets_directory())?;
    std::fs::create_dir_all(get_java_runtimes_directory())?;
    std::fs::create_dir_all(get_meta_cache_directory())?;
    std::fs::create_dir_all(get_fonts_directory())?;
    std::fs::create_dir_all(get_skins_directory())?;
    std::fs::create_dir_all(get_capes_directory())?;
    Ok(())
}
