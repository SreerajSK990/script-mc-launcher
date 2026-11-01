use crate::core::paths;
use crate::core::safety;
use crate::core::system::{get_system_environment, SystemEnvironment};
use std::path::Path;
use tauri::Url;

#[tauri::command]
pub async fn system_get_environment() -> Result<SystemEnvironment, String> {
    Ok(get_system_environment())
}

#[tauri::command]
pub async fn system_open_external(url: String) -> Result<(), String> {
    let parsed = Url::parse(url.trim()).map_err(|_| format!("Refusing to open an invalid URL: {url}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("Refusing to open a non-web URL: {url}"));
    }
    open::that(parsed.as_str()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn system_open_directory(dir_path: String) -> Result<(), String> {
    let target = Path::new(&dir_path);
    let launcher_root = paths::get_launcher_root_directory();
    if !target.is_dir() || !safety::is_path_inside(&launcher_root, target) {
        return Err("Only folders inside the launcher data directory can be opened.".to_string());
    }
    open::that(target).map_err(|e| e.to_string())
}
