use crate::core::safety;
use crate::core::instances::{
    self, BackupResult, CreateInstancePayload, InstanceConfiguration, OperationStatus,
    UpdateInstancePayload,
};

#[tauri::command]
pub async fn instances_list() -> Result<Vec<InstanceConfiguration>, String> {
    instances::list_all_instances()
}

#[tauri::command]
pub async fn instances_get(instance_id: String) -> Result<Option<InstanceConfiguration>, String> {
    safety::validate_identifier(&instance_id)?;
    instances::get_instance_by_id(&instance_id)
}

#[tauri::command]
pub async fn instances_create(payload: CreateInstancePayload) -> Result<InstanceConfiguration, String> {
    instances::create_new_instance(payload)
}

#[tauri::command]
pub async fn instances_update(payload: UpdateInstancePayload) -> Result<InstanceConfiguration, String> {
    instances::update_instance(payload)
}

#[tauri::command]
pub async fn instances_delete(instance_id: String) -> Result<bool, String> {
    safety::validate_identifier(&instance_id)?;
    instances::delete_instance(&instance_id)
}

#[tauri::command]
pub async fn instances_open_folder(instance_id: String) -> Result<(), String> {
    safety::validate_identifier(&instance_id)?;
    instances::open_instance_folder(&instance_id)
}

#[tauri::command]
pub async fn instances_set_group(
    instance_id: String,
    group: Option<String>,
) -> Result<InstanceConfiguration, String> {
    safety::validate_identifier(&instance_id)?;
    instances::set_instance_group(&instance_id, group)
}

#[tauri::command]
pub async fn instances_rename_group(old_name: String, new_name: String) -> Result<(), String> {
    instances::rename_group(&old_name, &new_name)
}

#[tauri::command]
pub async fn instances_disband_group(group_name: String) -> Result<(), String> {
    instances::disband_group(&group_name)
}

#[tauri::command]
pub async fn instances_delete_group(group_name: String) -> Result<(), String> {
    instances::delete_group(&group_name)
}

#[tauri::command]
pub async fn instances_save_custom_icon(
    instance_id: String,
    data_url: String,
) -> Result<String, String> {
    safety::validate_identifier(&instance_id)?;
    instances::save_custom_icon(&instance_id, &data_url)
}

#[tauri::command]
pub async fn instances_toggle_favorite(instance_id: String) -> Result<InstanceConfiguration, String> {
    safety::validate_identifier(&instance_id)?;
    instances::toggle_favorite(&instance_id)
}

#[tauri::command]
pub async fn instances_repair(instance_id: String) -> Result<OperationStatus, String> {
    safety::validate_identifier(&instance_id)?;
    instances::repair_instance(&instance_id)
}

#[tauri::command]
pub async fn instances_backup_saves(instance_id: String) -> Result<BackupResult, String> {
    safety::validate_identifier(&instance_id)?;
    instances::backup_saves(&instance_id)
}

#[tauri::command]
pub async fn instances_clone(
    instance_id: String,
    custom_name: Option<String>,
) -> Result<InstanceConfiguration, String> {
    safety::validate_identifier(&instance_id)?;
    instances::clone_instance(&instance_id, custom_name)
}
