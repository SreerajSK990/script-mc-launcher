use crate::core::meta::{self, MinecraftVersionEntry};

#[tauri::command]
pub async fn meta_get_versions() -> Result<Vec<MinecraftVersionEntry>, String> {
    meta::get_available_minecraft_versions().await
}

#[tauri::command]
pub async fn meta_get_loader_versions(
    loader_type: String,
    minecraft_version: String,
) -> Result<Vec<String>, String> {
    meta::get_compatible_loader_versions(&loader_type, &minecraft_version).await
}
