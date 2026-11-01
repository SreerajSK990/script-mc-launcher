use crate::core::safety;
use crate::core::mods::InstallModPayload;
use crate::core::recovery::{
    self, BackupEntry, DependencyPlan, RecoverySettings,
};
use crate::core::shaders::{self, ShaderEnvironment, ShaderPack};

#[tauri::command]
pub async fn content_list_shaders(instance_id: String) -> Result<Vec<ShaderPack>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        safety::validate_identifier(&instance_id)?;
        shaders::list_shaders(&instance_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn content_install_shader(payload: InstallModPayload) -> Result<ShaderPack, String> {
    shaders::install_shader(payload).await
}

#[tauri::command]
pub async fn content_import_shaders(
    instance_id: String,
    file_paths: Vec<String>,
) -> Result<Vec<ShaderPack>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        safety::validate_identifier(&instance_id)?;
        shaders::import_shaders(&instance_id, &file_paths)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn content_delete_shader(instance_id: String, filename: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        safety::validate_identifier(&instance_id)?;
        safety::validate_file_name(&filename)?;
        shaders::delete_shader(&instance_id, &filename)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn content_shader_environment(instance_id: String) -> Result<ShaderEnvironment, String> {
    tauri::async_runtime::spawn_blocking(move || {
        safety::validate_identifier(&instance_id)?;
        shaders::get_shader_environment(&instance_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn content_open_shader_folder(instance_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        safety::validate_identifier(&instance_id)?;
        shaders::open_shader_folder(&instance_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn content_list_backups(instance_id: String) -> Result<Vec<BackupEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        safety::validate_identifier(&instance_id)?;
        recovery::list_backups(&instance_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn content_backup_saves(instance_id: String) -> Result<BackupEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        safety::validate_identifier(&instance_id)?;
        recovery::create_saves_backup(&instance_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn content_restore_backup(instance_id: String, backup_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        safety::validate_identifier(&instance_id)?;
        safety::validate_file_name(&backup_id)?;
        let _operation_guard = crate::core::operations::reserve_instance(&instance_id, "A backup is being restored")?;
        recovery::restore_backup(&instance_id, &backup_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn content_get_recovery_settings(instance_id: String) -> Result<RecoverySettings, String> {
    tauri::async_runtime::spawn_blocking(move || {
        safety::validate_identifier(&instance_id)?;
        recovery::get_recovery_settings(&instance_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn content_save_recovery_settings(
    instance_id: String,
    settings: RecoverySettings,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        safety::validate_identifier(&instance_id)?;
        recovery::save_recovery_settings(&instance_id, &settings)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn content_plan_mods(payloads: Vec<InstallModPayload>) -> Result<DependencyPlan, String> {
    crate::core::dependencies::plan_mod_installation(payloads).await
}
