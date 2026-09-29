use crate::core::java::{self, ManagedJavaRuntimeInfo};

#[tauri::command]
pub async fn java_get_runtimes() -> Result<Vec<ManagedJavaRuntimeInfo>, String> {
    Ok(java::get_managed_java_runtimes_summary())
}

#[tauri::command]
pub async fn java_download_runtime(component_or_version: String) -> Result<String, String> {
    java::ensure_java_runtime(None, Some(&component_or_version)).await
}
