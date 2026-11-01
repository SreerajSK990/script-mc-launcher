use crate::core::safety;
use crate::core::screenshots::{self, ScreenshotEntry};

#[tauri::command]
pub async fn screenshots_list(instance_id: String) -> Result<Vec<ScreenshotEntry>, String> {
    safety::validate_identifier(&instance_id)?;
    screenshots::list_instance_screenshots(&instance_id)
}

#[tauri::command]
pub async fn screenshots_delete(instance_id: String, filename: String) -> Result<bool, String> {
    safety::validate_identifier(&instance_id)?;
    safety::validate_file_name(&filename)?;
    screenshots::delete_instance_screenshot(&instance_id, &filename)
}

#[tauri::command]
pub async fn screenshots_open_folder(instance_id: String) -> Result<(), String> {
    safety::validate_identifier(&instance_id)?;
    screenshots::open_screenshots_folder(&instance_id)
}
