use crate::core::safety;
use crate::core::mods::{
    self, InstallDroppedModsResult, InstallModPayload, InstalledModRecord, ModDetail,
    ModSearchParams, ModSearchResult, ModUpdateInfo, ModUpdateResult, ModVersionFile,
};

#[tauri::command]
pub async fn mods_search(params: ModSearchParams) -> Result<Vec<ModSearchResult>, String> {
    mods::search_all_mods(params).await
}

#[tauri::command]
pub async fn mods_get_detail(source: String, id: String) -> Result<ModDetail, String> {
    mods::get_mod_detail(&source, &id).await
}

#[tauri::command]
pub async fn mods_get_versions(
    project_id: String,
    source: String,
    minecraft_version: Option<String>,
    loader: Option<String>,
) -> Result<Vec<ModVersionFile>, String> {
    mods::get_mod_versions(
        &project_id,
        &source,
        minecraft_version.as_deref(),
        loader.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn mods_install(payload: InstallModPayload) -> Result<InstalledModRecord, String> {
    let _operation_guard = crate::core::operations::reserve_instance(&payload.instance_id, "Mods are being installed")?;
    crate::core::dependencies::install_mod_with_dependencies(payload).await
}

#[tauri::command]
pub async fn mods_list_installed(
    instance_id: String,
) -> Result<Vec<InstalledModRecord>, String> {
    safety::validate_identifier(&instance_id)?;
    mods::list_installed_mods(&instance_id)
}

#[tauri::command]
pub async fn mods_toggle_installed(
    instance_id: String,
    filename: String,
    enable: bool,
) -> Result<bool, String> {
    safety::validate_identifier(&instance_id)?;
    safety::validate_file_name(&filename)?;
    mods::toggle_mod_enabled(&instance_id, &filename, enable)
}

#[tauri::command]
pub async fn mods_delete_installed(
    instance_id: String,
    filename: String,
) -> Result<bool, String> {
    safety::validate_identifier(&instance_id)?;
    safety::validate_file_name(&filename)?;
    mods::delete_installed_mod(&instance_id, &filename)
}

#[tauri::command]
pub async fn mods_set_curseforge_key(key: Option<String>) -> Result<bool, String> {
    mods::set_curseforge_key(key)
}

#[tauri::command]
pub async fn mods_get_curseforge_key() -> Result<Option<String>, String> {
    Ok(mods::get_curseforge_key())
}

#[tauri::command]
pub async fn mods_check_updates(
    instance_id: String,
    _force_refresh: Option<bool>,
) -> Result<Vec<ModUpdateInfo>, String> {
    safety::validate_identifier(&instance_id)?;
    mods::check_mod_updates(&instance_id).await
}

#[tauri::command]
pub async fn mods_update_all(
    app: tauri::AppHandle,
    instance_id: String,
    updates: Vec<ModUpdateInfo>,
) -> Result<ModUpdateResult, String> {
    safety::validate_identifier(&instance_id)?;
    let _operation_guard = crate::core::operations::reserve_instance(&instance_id, "Mods are being updated")?;
    use tauri::Emitter;
    mods::update_all_mods(&instance_id, &updates, |message, current, total| {
        let _ = app.emit(
            "mods:update-progress",
            serde_json::json!({ "message": message, "current": current, "total": total }),
        );
    })
    .await
}

#[tauri::command]
pub async fn mods_install_dropped(
    instance_id: String,
    file_paths: Vec<String>,
) -> Result<InstallDroppedModsResult, String> {
    safety::validate_identifier(&instance_id)?;
    mods::install_dropped_mod_files(&instance_id, &file_paths)
}

#[tauri::command]
pub async fn mods_pending_downloads(
    instance_id: String,
) -> Result<crate::core::manual_downloads::ManualDownloadStatus, String> {
    safety::validate_identifier(&instance_id)?;
    tauri::async_runtime::spawn_blocking(move || crate::core::manual_downloads::resolve_pending_downloads(&instance_id))
        .await
        .map_err(|e| e.to_string())?
}
