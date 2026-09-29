use crate::core::cloner::{
    self, CloneInstancePayload, DiscoveredExternalInstance,
};
use crate::core::instances::InstanceConfiguration;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub fn launchers_scan_all() -> Result<Vec<DiscoveredExternalInstance>, String> {
    cloner::scan_external_instances()
}

#[tauri::command]
pub fn launchers_scan_directory(
    directory_path: String,
) -> Result<Vec<DiscoveredExternalInstance>, String> {
    cloner::scan_custom_directory(&directory_path)
}

#[tauri::command]
pub fn launchers_clone(
    app: AppHandle,
    payload: CloneInstancePayload,
) -> Result<InstanceConfiguration, String> {
    let app_handle = app.clone();
    cloner::clone_external_instance(payload, move |event| {
        let _ = app_handle.emit("launchers:clone-progress-event", event);
    })
}
