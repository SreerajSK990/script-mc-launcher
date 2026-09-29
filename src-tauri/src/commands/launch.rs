use crate::core::minecraft::{self, QuickPlayLaunchOptions};
use tauri::AppHandle;

#[tauri::command]
pub async fn launch_start(app: AppHandle, instance_id: String) -> Result<bool, String> {
    minecraft::launch_minecraft(app, instance_id, None).await
}

#[tauri::command]
pub async fn launch_quick_play(
    app: AppHandle,
    instance_id: String,
    options: QuickPlayLaunchOptions,
) -> Result<bool, String> {
    minecraft::launch_minecraft(app, instance_id, Some(options)).await
}

#[tauri::command]
pub async fn launch_stop(instance_id: String) -> Result<bool, String> {
    Ok(minecraft::stop_running_instance(&instance_id).await)
}

#[tauri::command]
pub async fn launch_is_running(instance_id: String) -> Result<bool, String> {
    Ok(minecraft::is_instance_running(&instance_id).await)
}
