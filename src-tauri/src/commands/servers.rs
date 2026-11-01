use crate::core::safety;
use crate::core::servers::{
    self, AddServerPayload, MinecraftServerEntry, QuickPlayTarget, RemoveServerPayload,
    ServerPingStatus,
};

#[tauri::command]
pub async fn servers_list_all() -> Result<Vec<QuickPlayTarget>, String> {
    servers::get_all_quick_play_targets()
}

#[tauri::command]
pub async fn servers_list_instance(instance_id: String) -> Result<Vec<MinecraftServerEntry>, String> {
    safety::validate_identifier(&instance_id)?;
    servers::list_instance_servers(&instance_id)
}

#[tauri::command]
pub async fn servers_add(payload: AddServerPayload) -> Result<Vec<MinecraftServerEntry>, String> {
    let _operation_guard = crate::core::operations::reserve_instance(&payload.instance_id, "The server list is being updated")?;
    servers::add_instance_server(&payload.instance_id, &payload.name, &payload.ip)
}

#[tauri::command]
pub async fn servers_remove(payload: RemoveServerPayload) -> Result<Vec<MinecraftServerEntry>, String> {
    let _operation_guard = crate::core::operations::reserve_instance(&payload.instance_id, "The server list is being updated")?;
    servers::remove_instance_server(&payload.instance_id, &payload.server_ip)
}

#[tauri::command]
pub async fn servers_ping(host: String, port: Option<u16>) -> Result<ServerPingStatus, String> {
    let p = port.unwrap_or(25565);
    Ok(servers::ping_minecraft_server(&host, p).await)
}

#[tauri::command]
pub async fn worlds_list(instance_id: String) -> Result<Vec<crate::core::worlds::ManagedWorldEntry>, String> {
    safety::validate_identifier(&instance_id)?;
    tauri::async_runtime::spawn_blocking(move || crate::core::worlds::list_worlds(&instance_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn worlds_rename(instance_id: String, folder_name: String, new_name: String) -> Result<(), String> {
    safety::validate_identifier(&instance_id)?;
    let _operation_guard = crate::core::operations::reserve_instance(&instance_id, "A world is being renamed")?;
    crate::core::worlds::rename_world(&instance_id, &folder_name, &new_name)
}

#[tauri::command]
pub async fn worlds_backup(instance_id: String, folder_name: String) -> Result<String, String> {
    safety::validate_identifier(&instance_id)?;
    let _operation_guard = crate::core::operations::reserve_instance(&instance_id, "A world is being backed up")?;
    tauri::async_runtime::spawn_blocking(move || crate::core::worlds::backup_world(&instance_id, &folder_name))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn worlds_delete(instance_id: String, folder_name: String) -> Result<String, String> {
    safety::validate_identifier(&instance_id)?;
    let _operation_guard = crate::core::operations::reserve_instance(&instance_id, "A world is being removed")?;
    crate::core::worlds::delete_world(&instance_id, &folder_name)
}

#[tauri::command]
pub async fn worlds_open_folder(instance_id: String, folder_name: String) -> Result<(), String> {
    safety::validate_identifier(&instance_id)?;
    crate::core::worlds::open_world_folder(&instance_id, &folder_name)
}

#[tauri::command]
pub async fn datapacks_list(instance_id: String, folder_name: String) -> Result<Vec<crate::core::worlds::DatapackEntry>, String> {
    safety::validate_identifier(&instance_id)?;
    crate::core::worlds::list_datapacks(&instance_id, &folder_name)
}

#[tauri::command]
pub async fn datapacks_install(
    instance_id: String,
    folder_name: String,
    version_file: crate::core::mods::ModVersionFile,
) -> Result<crate::core::worlds::DatapackEntry, String> {
    safety::validate_identifier(&instance_id)?;
    crate::core::worlds::install_datapack(&instance_id, &folder_name, &version_file).await
}

#[tauri::command]
pub async fn datapacks_delete(instance_id: String, folder_name: String, file_name: String) -> Result<(), String> {
    safety::validate_identifier(&instance_id)?;
    crate::core::worlds::delete_datapack(&instance_id, &folder_name, &file_name)
}
