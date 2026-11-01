use crate::core::cloner::{
    self, CloneInstancePayload, DiscoveredExternalInstance,
};
use crate::core::instances::InstanceConfiguration;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn launchers_scan_all() -> Result<Vec<DiscoveredExternalInstance>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        cloner::scan_external_instances()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn launchers_scan_directory(
    directory_path: String,
) -> Result<Vec<DiscoveredExternalInstance>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        cloner::scan_custom_directory(&directory_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn launchers_clone(
    app: AppHandle,
    payload: CloneInstancePayload,
) -> Result<InstanceConfiguration, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let app_handle = app.clone();
        cloner::clone_external_instance(payload, move |event| {
            let _ = app_handle.emit("launchers:clone-progress-event", event);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
