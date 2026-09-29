use crate::core::discord::{self, SetDiscordActivityPayload};

#[tauri::command]
pub async fn discord_set_activity(payload: SetDiscordActivityPayload) -> Result<(), String> {
    discord::set_activity(payload).await
}

#[tauri::command]
pub async fn discord_clear_activity() -> Result<(), String> {
    discord::clear_activity().await
}
