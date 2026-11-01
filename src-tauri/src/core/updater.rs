use crate::core::net;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};

static PENDING_UPDATE: Mutex<Option<(Update, Vec<u8>)>> = Mutex::new(None);
static IS_DOWNLOADING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatusPayload {
    pub status: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgressPayload {
    pub percent: f64,
    pub bytes_per_second: f64,
    pub transferred: u64,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDownloadedPayload {
    pub version: String,
    pub release_date: Option<String>,
    pub release_notes: Option<String>,
}

fn emit_status(app: &AppHandle, status: &str, message: Option<String>) {
    let _ = app.emit(
        "updater:status",
        UpdateStatusPayload {
            status: status.to_string(),
            message,
        },
    );
}

fn announce_downloaded(app: &AppHandle, update: &Update) {
    emit_status(app, "downloaded", Some(format!("v{}", update.version)));
    let _ = app.emit(
        "updater:downloaded",
        UpdateDownloadedPayload {
            version: update.version.clone(),
            release_date: update
                .raw_json
                .get("pub_date")
                .and_then(|value| value.as_str())
                .map(str::to_string),
            release_notes: update.body.clone(),
        },
    );
}

async fn download_update(app: AppHandle, update: Update) -> Result<(), String> {
    emit_status(&app, "downloading", Some(format!("v{}", update.version)));
    let mut transferred = 0u64;
    let mut last_emit = Instant::now();
    let mut last_bytes = 0u64;
    let progress_app = app.clone();
    let bytes = update
        .download(
            |chunk_length, content_length| {
                transferred += chunk_length as u64;
                let elapsed = last_emit.elapsed();
                if elapsed.as_millis() < 150 {
                    return;
                }
                let total = content_length.unwrap_or(0);
                let _ = progress_app.emit(
                    "updater:progress",
                    UpdateProgressPayload {
                        percent: if total > 0 {
                            (transferred as f64 / total as f64 * 100.0).clamp(0.0, 100.0)
                        } else {
                            0.0
                        },
                        bytes_per_second: transferred.saturating_sub(last_bytes) as f64 / elapsed.as_secs_f64(),
                        transferred,
                        total: if total > 0 { total } else { transferred },
                    },
                );
                last_emit = Instant::now();
                last_bytes = transferred;
            },
            || {},
        )
        .await
        .map_err(|e| format!("Update download failed: {e}"))?;

    let _ = app.emit(
        "updater:progress",
        UpdateProgressPayload {
            percent: 100.0,
            bytes_per_second: 0.0,
            transferred: bytes.len() as u64,
            total: bytes.len() as u64,
        },
    );
    announce_downloaded(&app, &update);
    if let Ok(mut slot) = PENDING_UPDATE.lock() {
        *slot = Some((update, bytes));
    }
    Ok(())
}

pub async fn check_and_download_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current_version = net::LAUNCHER_VERSION.to_string();
    let failure = |error: String| UpdateCheckResult {
        has_update: false,
        current_version: current_version.clone(),
        latest_version: None,
        error: Some(error),
    };

    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(error) => return Ok(failure(error.to_string())),
    };
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => {
            emit_status(&app, "not-available", None);
            return Ok(UpdateCheckResult {
                has_update: false,
                current_version,
                latest_version: None,
                error: None,
            });
        }
        Err(error) => return Ok(failure(error.to_string())),
    };

    let latest = update.version.clone();
    emit_status(&app, "available", Some(format!("v{latest}")));

    let already_downloaded = PENDING_UPDATE
        .lock()
        .ok()
        .and_then(|slot| slot.as_ref().map(|(pending, _)| pending.version == latest))
        .unwrap_or(false);
    if already_downloaded {
        announce_downloaded(&app, &update);
    } else if !IS_DOWNLOADING.swap(true, Ordering::SeqCst) {
        let download_app = app.clone();
        tokio::spawn(async move {
            if let Err(error) = download_update(download_app.clone(), update).await {
                emit_status(&download_app, "error", Some(error));
            }
            IS_DOWNLOADING.store(false, Ordering::SeqCst);
        });
    }

    Ok(UpdateCheckResult {
        has_update: true,
        current_version,
        latest_version: Some(latest),
        error: None,
    })
}

pub fn quit_and_install(app: AppHandle) -> Result<(), String> {
    let (update, bytes) = PENDING_UPDATE
        .lock()
        .map_err(|_| "Updater state is unavailable".to_string())?
        .take()
        .ok_or_else(|| "No update downloaded".to_string())?;
    update
        .install(bytes)
        .map_err(|e| format!("Failed to install the update: {e}"))?;
    app.restart();
}
