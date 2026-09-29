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
    servers::list_instance_servers(&instance_id)
}

#[tauri::command]
pub async fn servers_add(payload: AddServerPayload) -> Result<Vec<MinecraftServerEntry>, String> {
    servers::add_instance_server(&payload.instance_id, &payload.name, &payload.ip)
}

#[tauri::command]
pub async fn servers_remove(payload: RemoveServerPayload) -> Result<Vec<MinecraftServerEntry>, String> {
    servers::remove_instance_server(&payload.instance_id, &payload.server_ip)
}

#[tauri::command]
pub async fn servers_ping(host: String, port: Option<u16>) -> Result<ServerPingStatus, String> {
    let p = port.unwrap_or(25565);
    Ok(servers::ping_minecraft_server(&host, p).await)
}
