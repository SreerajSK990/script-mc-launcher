use crate::core::instances::InstanceConfiguration;
use crate::core::modpacks::{
    self, InstallRemoteModpackPayload, ModpackManifestInfo,
};
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn modpacks_inspect(file_path: String) -> Result<ModpackManifestInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        modpacks::inspect_modpack(&file_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn modpacks_import(
    app: AppHandle,
    file_path: String,
    custom_name: Option<String>,
) -> Result<InstanceConfiguration, String> {
    let app_handle = app.clone();
    modpacks::import_modpack(&file_path, custom_name, move |event| {
        let _ = app_handle.emit("modpacks:progress-event", event);
    })
    .await
}

#[tauri::command]
pub async fn modpacks_install_remote(
    app: AppHandle,
    payload: InstallRemoteModpackPayload,
) -> Result<InstanceConfiguration, String> {
    let app_handle = app.clone();
    modpacks::install_remote_modpack(payload, move |event| {
        let _ = app_handle.emit("modpacks:progress-event", event);
    })
    .await
}
