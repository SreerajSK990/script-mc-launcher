use crate::core::mods::InstallModPayload;
use crate::core::recovery::{
    self, BackupEntry, DependencyPlan, RecoverySettings,
};
use crate::core::shaders::{self, ShaderEnvironment, ShaderPack};

#[tauri::command]
pub fn content_list_shaders(instance_id: String) -> Result<Vec<ShaderPack>, String> {
    shaders::list_shaders(&instance_id)
}

#[tauri::command]
pub async fn content_install_shader(payload: InstallModPayload) -> Result<ShaderPack, String> {
    shaders::install_shader(payload).await
}

#[tauri::command]
pub fn content_import_shaders(
    instance_id: String,
    file_paths: Vec<String>,
) -> Result<Vec<ShaderPack>, String> {
    shaders::import_shaders(&instance_id, &file_paths)
}

#[tauri::command]
pub fn content_delete_shader(instance_id: String, filename: String) -> Result<(), String> {
    shaders::delete_shader(&instance_id, &filename)
}

#[tauri::command]
pub fn content_shader_environment(instance_id: String) -> Result<ShaderEnvironment, String> {
    shaders::get_shader_environment(&instance_id)
}

#[tauri::command]
pub fn content_open_shader_folder(instance_id: String) -> Result<(), String> {
    shaders::open_shader_folder(&instance_id)
}

#[tauri::command]
pub fn content_list_backups(instance_id: String) -> Result<Vec<BackupEntry>, String> {
    recovery::list_backups(&instance_id)
}

#[tauri::command]
pub fn content_backup_saves(instance_id: String) -> Result<BackupEntry, String> {
    recovery::create_saves_backup(&instance_id)
}

#[tauri::command]
pub fn content_restore_backup(instance_id: String, backup_id: String) -> Result<(), String> {
    recovery::restore_backup(&instance_id, &backup_id)
}

#[tauri::command]
pub fn content_get_recovery_settings(instance_id: String) -> Result<RecoverySettings, String> {
    recovery::get_recovery_settings(&instance_id)
}

#[tauri::command]
pub fn content_save_recovery_settings(
    instance_id: String,
    settings: RecoverySettings,
) -> Result<(), String> {
    recovery::save_recovery_settings(&instance_id, &settings)
}

#[tauri::command]
pub fn content_plan_mods(payloads: Vec<InstallModPayload>) -> Result<DependencyPlan, String> {
    recovery::plan_mods(payloads)
}
