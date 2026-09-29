use crate::core::updater::{self, UpdateCheckResult};

#[tauri::command]
pub async fn updater_check_for_updates() -> Result<UpdateCheckResult, String> {
    updater::check_for_updates().await
}
