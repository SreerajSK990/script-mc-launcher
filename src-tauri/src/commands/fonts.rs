use crate::core::fonts::{self, CustomFontEntry};

#[tauri::command]
pub async fn fonts_list() -> Result<Vec<CustomFontEntry>, String> {
    fonts::list_installed_fonts()
}

#[tauri::command]
pub async fn fonts_install(file_path: String) -> Result<CustomFontEntry, String> {
    fonts::install_custom_font(&file_path)
}

#[tauri::command]
pub async fn fonts_delete(file_name: String) -> Result<bool, String> {
    fonts::delete_custom_font(&file_name)
}
