use crate::core::safety;
use crate::core::game_settings::{self, GameSettingsPayload};

#[tauri::command]
pub async fn game_settings_get(instance_id: String) -> Result<GameSettingsPayload, String> {
    safety::validate_identifier(&instance_id)?;
    game_settings::read_game_settings(&instance_id)
}

#[tauri::command]
pub async fn game_settings_save(
    instance_id: String,
    payload: GameSettingsPayload,
) -> Result<bool, String> {
    safety::validate_identifier(&instance_id)?;
    game_settings::save_game_settings(&instance_id, &payload)
}

#[tauri::command]
pub async fn game_settings_open_file(
    instance_id: String,
    file_type: String,
) -> Result<(), String> {
    safety::validate_identifier(&instance_id)?;
    game_settings::open_game_settings_file(&instance_id, &file_type)
}
