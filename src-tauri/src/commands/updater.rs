use crate::core::updater::{self, UpdateCheckResult};
use tauri::AppHandle;

#[tauri::command]
pub async fn updater_check_for_updates(app: AppHandle) -> Result<UpdateCheckResult, String> {
    updater::check_and_download_update(app).await
}

#[tauri::command]
pub async fn updater_quit_and_install() -> Result<(), String> {
    updater::quit_and_install()
}
