use crate::core::system::{get_system_environment, SystemEnvironment};

#[tauri::command]
pub async fn system_get_environment() -> Result<SystemEnvironment, String> {
    Ok(get_system_environment())
}

#[tauri::command]
pub async fn system_open_external(url: String) -> Result<(), String> {
    open::that(url).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn system_open_directory(dir_path: String) -> Result<(), String> {
    open::that(dir_path).map_err(|e| e.to_string())
}
