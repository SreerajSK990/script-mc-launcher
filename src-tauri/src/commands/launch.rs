use crate::core::safety;
use crate::core::minecraft::{self, QuickPlayLaunchOptions};
use tauri::AppHandle;

#[tauri::command]
pub async fn launch_start(app: AppHandle, instance_id: String) -> Result<bool, String> {
    safety::validate_identifier(&instance_id)?;
    minecraft::launch_minecraft(app, instance_id, None).await
}

#[tauri::command]
pub async fn launch_quick_play(
    app: AppHandle,
    instance_id: String,
    options: QuickPlayLaunchOptions,
) -> Result<bool, String> {
    safety::validate_identifier(&instance_id)?;
    minecraft::launch_minecraft(app, instance_id, Some(options)).await
}

#[tauri::command]
pub async fn launch_stop(instance_id: String) -> Result<bool, String> {
    safety::validate_identifier(&instance_id)?;
    Ok(minecraft::stop_running_instance(&instance_id).await)
}

#[tauri::command]
pub async fn launch_is_running(instance_id: String) -> Result<bool, String> {
    safety::validate_identifier(&instance_id)?;
    Ok(minecraft::is_instance_running(&instance_id).await)
}
