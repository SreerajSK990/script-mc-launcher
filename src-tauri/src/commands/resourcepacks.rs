use crate::core::resourcepacks::{
    self, InstallDroppedPacksResult, InstallModPayload, InstalledResourcePackRecord,
};

#[tauri::command]
pub async fn resourcepacks_list_installed(
    instance_id: String,
) -> Result<Vec<InstalledResourcePackRecord>, String> {
    resourcepacks::list_installed_resource_packs(&instance_id)
}

#[tauri::command]
pub async fn resourcepacks_install(
    payload: InstallModPayload,
) -> Result<InstalledResourcePackRecord, String> {
    resourcepacks::install_resource_pack_to_instance(payload).await
}

#[tauri::command]
pub async fn resourcepacks_toggle_installed(
    instance_id: String,
    filename: String,
    enable: bool,
) -> Result<bool, String> {
    resourcepacks::toggle_resource_pack_enabled(&instance_id, &filename, enable)
}

#[tauri::command]
pub async fn resourcepacks_delete_installed(
    instance_id: String,
    filename: String,
) -> Result<bool, String> {
    resourcepacks::delete_installed_resource_pack(&instance_id, &filename)
}

#[tauri::command]
pub async fn resourcepacks_install_dropped(
    instance_id: String,
    file_paths: Vec<String>,
) -> Result<InstallDroppedPacksResult, String> {
    resourcepacks::install_dropped_resource_packs(&instance_id, &file_paths)
}

#[tauri::command]
pub async fn resourcepacks_open_folder(instance_id: String) -> Result<(), String> {
    resourcepacks::open_resource_packs_folder(&instance_id)
}
