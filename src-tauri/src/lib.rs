mod commands;
mod core;

use commands::instances::*;
use commands::java::*;
use commands::meta::*;
use commands::system::*;
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
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
