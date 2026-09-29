mod commands;
mod core;

use commands::auth::*;
use commands::cloner::*;
use commands::content::*;
use commands::discord::*;
use commands::fonts::*;
use commands::game_settings::*;
use commands::instances::*;
use commands::java::*;
use commands::launch::*;
use commands::meta::*;
use commands::mods::*;
use commands::modpacks::*;
use commands::resourcepacks::*;
use commands::screenshots::*;
use commands::servers::*;
use commands::skins::*;
use commands::system::*;
use commands::updater::*;
use commands::window::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = core::paths::initialize_launcher_directories() {
        eprintln!("Failed to initialize launcher directories: {e}");
    }

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window_minimize,
            window_maximize,
            window_is_maximized,
            window_close,
            system_get_environment,
            system_open_external,
            system_open_directory,
            instances_list,
            instances_get,
            instances_create,
            instances_update,
            instances_delete,
            instances_open_folder,
            instances_set_group,
            instances_rename_group,
            instances_disband_group,
            instances_delete_group,
            instances_save_custom_icon,
            instances_toggle_favorite,
            instances_repair,
            instances_backup_saves,
            instances_clone,
            meta_get_versions,
            meta_get_loader_versions,
            java_get_runtimes,
            java_download_runtime,
            servers_list_all,
            servers_list_instance,
            servers_add,
            servers_remove,
            servers_ping,
            screenshots_list,
            screenshots_delete,
            screenshots_open_folder,
            fonts_list,
            fonts_install,
            fonts_delete,
            game_settings_get,
            game_settings_save,
            game_settings_open_file,
            skins_list,
            skins_get_active,
            skins_apply,
            skins_save,
            skins_delete,
            skins_search_player,
            skins_list_capes,
            skins_apply_cape,
            skins_save_cape,
            skins_delete_cape,
            skins_search_optifine_cape,
            mods_search,
            mods_get_detail,
            mods_get_versions,
            mods_install,
            mods_list_installed,
            mods_toggle_installed,
            mods_delete_installed,
            mods_set_curseforge_key,
            mods_get_curseforge_key,
            mods_check_updates,
            mods_update_all,
            mods_install_dropped,
            resourcepacks_list_installed,
            resourcepacks_install,
            resourcepacks_toggle_installed,
            resourcepacks_delete_installed,
            resourcepacks_install_dropped,
            resourcepacks_open_folder,
            launch_start,
            launch_quick_play,
            launch_stop,
            launch_is_running,
            auth_get_state,
            auth_login_offline,
            auth_login_microsoft,
            auth_switch_account,
            auth_logout,
            content_list_shaders,
            content_install_shader,
            content_import_shaders,
            content_delete_shader,
            content_shader_environment,
            content_open_shader_folder,
            content_list_backups,
            content_backup_saves,
            content_restore_backup,
            content_get_recovery_settings,
            content_save_recovery_settings,
            content_plan_mods,
            modpacks_inspect,
            modpacks_import,
            modpacks_install_remote,
            launchers_scan_all,
            launchers_scan_directory,
            launchers_clone,
            discord_set_activity,
            discord_clear_activity,
            updater_check_for_updates,
            updater_quit_and_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
