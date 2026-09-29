use crate::core::skins::{
    self, ApplyCapeResult, ApplySkinResult, CapeEntry, CapesListResponse, PlayerSkinSearchResult,
    SaveSkinParams, SkinEntry, SkinsListResponse,
};

#[tauri::command]
pub async fn skins_list() -> Result<SkinsListResponse, String> {
    skins::list_all_skins().await
}

#[tauri::command]
pub async fn skins_get_active() -> Result<Option<String>, String> {
    skins::get_active_skin_id().await
}

#[tauri::command]
pub async fn skins_apply(skin_id: String) -> Result<ApplySkinResult, String> {
    skins::set_active_skin(&skin_id).await
}

#[tauri::command]
pub async fn skins_save(params: SaveSkinParams) -> Result<SkinEntry, String> {
    skins::save_skin(params).await
}

#[tauri::command]
pub async fn skins_delete(skin_id: String) -> Result<bool, String> {
    skins::delete_skin(&skin_id).await
}

#[tauri::command]
pub async fn skins_search_player(username: String) -> Result<PlayerSkinSearchResult, String> {
    skins::search_player_skin(&username).await
}

#[tauri::command]
pub async fn skins_list_capes() -> Result<CapesListResponse, String> {
    skins::list_all_capes().await
}

#[tauri::command]
pub async fn skins_apply_cape(cape_id: Option<String>) -> Result<ApplyCapeResult, String> {
    skins::set_active_cape(cape_id).await
}

#[tauri::command]
pub async fn skins_save_cape(name: String, texture_data: String) -> Result<CapeEntry, String> {
    skins::save_custom_cape(&name, &texture_data).await
}

#[tauri::command]
pub async fn skins_delete_cape(cape_id: String) -> Result<bool, String> {
    skins::delete_custom_cape(&cape_id).await
}

#[tauri::command]
pub async fn skins_search_optifine_cape(
    username: String,
) -> Result<Option<CapeEntry>, String> {
    skins::fetch_optifine_cape(&username).await
}
