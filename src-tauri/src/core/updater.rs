use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

static DOWNLOADED_INSTALLER_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
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

#[derive(Debug, Clone, Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    body: Option<String>,
    published_at: Option<String>,
    #[serde(default)]
    assets: Vec<GitHubReleaseAsset>,
}

pub async fn check_and_download_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/repos/SreerajSK990/script-mc-launcher/releases/latest")
        .header(reqwest::header::USER_AGENT, "ScriptLauncher/0.18.5")
        .send()
        .await;

    match resp {
        Ok(res) => {
            if !res.status().is_success() {
                return Ok(UpdateCheckResult {
                    has_update: false,
                    current_version,
                    latest_version: None,
                    error: Some(format!("HTTP {}", res.status())),
                });
            }

            let release = match res.json::<GitHubRelease>().await {
                Ok(r) => r,
                Err(e) => {
                    return Ok(UpdateCheckResult {
                        has_update: false,
                        current_version,
                        latest_version: None,
                        error: Some(e.to_string()),
                    })
                }
            };

            let latest = release.tag_name.trim_start_matches('v').to_string();
            let has_update = latest != current_version;

            if !has_update {
                let _ = app.emit(
                    "updater:status",
                    UpdateStatusPayload {
                        status: "not-available".to_string(),
                        message: None,
                    },
                );
                return Ok(UpdateCheckResult {
                    has_update: false,
                    current_version,
                    latest_version: None,
                    error: None,
                });
            }

            let _ = app.emit(
                "updater:status",
                UpdateStatusPayload {
                    status: "available".to_string(),
                    message: Some(format!("v{latest}")),
                },
            );

            let setup_asset = release.assets.iter().find(|a| {
                a.name.ends_with(".exe")
                    && (a.name.contains("Setup") || a.name.contains("setup"))
            });

            if let Some(asset) = setup_asset {
                let download_url = asset.browser_download_url.clone();
                let asset_size = asset.size;
                let version_clone = latest.clone();
                let release_date = release.published_at.clone();
                let release_notes = release.body.clone();
                let app_handle = app.clone();

                if let Some(existing) = DOWNLOADED_INSTALLER_PATH.lock().unwrap().as_ref() {
                    if existing.exists() {
                        if let Ok(meta) = std::fs::metadata(existing) {
                            if meta.len() >= asset_size && asset_size > 0 {
                                let _ = app.emit(
                                    "updater:status",
                                    UpdateStatusPayload {
                                        status: "downloaded".to_string(),
                                        message: Some(format!("v{latest}")),
                                    },
                                );
                                let _ = app.emit(
                                    "updater:downloaded",
                                    UpdateDownloadedPayload {
                                        version: latest.clone(),
                                        release_date: release_date.clone(),
                                        release_notes: release_notes.clone(),
                                    },
                                );
                                return Ok(UpdateCheckResult {
                                    has_update: true,
                                    current_version,
                                    latest_version: Some(latest),
                                    error: None,
                                });
                            }
                        }
                    }
                }

                if !IS_DOWNLOADING.swap(true, Ordering::SeqCst) {
                    tokio::spawn(async move {
                        let _ = download_installer_file(
                            app_handle,
                            download_url,
                            asset_size,
                            version_clone,
                            release_date,
                            release_notes,
                        )
                        .await;
                        IS_DOWNLOADING.store(false, Ordering::SeqCst);
                    });
                }
            }

            Ok(UpdateCheckResult {
                has_update: true,
                current_version,
                latest_version: Some(latest),
                error: None,
            })
        }
        Err(e) => Ok(UpdateCheckResult {
            has_update: false,
            current_version,
            latest_version: None,
            error: Some(e.to_string()),
        }),
    }
}

async fn download_installer_file(
    app: AppHandle,
    url: String,
    expected_size: u64,
    version: String,
    release_date: Option<String>,
    release_notes: Option<String>,
) -> Result<(), String> {
    let _ = app.emit(
        "updater:status",
        UpdateStatusPayload {
            status: "downloading".to_string(),
            message: Some(format!("v{version}")),
        },
    );

    let temp_file = std::env::temp_dir().join(format!("Script-Minecraft-Launcher-Setup-{version}.exe"));
    let mut file = tokio::fs::File::create(&temp_file)
        .await
        .map_err(|e| e.to_string())?;

    let client = reqwest::Client::new();
    let mut resp = client
        .get(&url)
        .header(reqwest::header::USER_AGENT, "ScriptLauncher/0.18.5")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let err_msg = format!("Download failed: HTTP {}", resp.status());
        let _ = app.emit(
            "updater:status",
            UpdateStatusPayload {
                status: "error".to_string(),
                message: Some(err_msg.clone()),
            },
        );
        return Err(err_msg);
    }

    let total = if expected_size > 0 {
        expected_size
    } else {
        resp.content_length().unwrap_or(0)
    };

    let mut transferred: u64 = 0;
    let mut last_emit = Instant::now();
    let mut last_bytes = 0u64;

    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        transferred += chunk.len() as u64;

        let elapsed = last_emit.elapsed();
        if elapsed.as_millis() >= 150 {
            let bytes_in_interval = transferred.saturating_sub(last_bytes);
            let bytes_per_second = (bytes_in_interval as f64) / elapsed.as_secs_f64();
            let percent = if total > 0 {
                ((transferred as f64) / (total as f64) * 100.0).clamp(0.0, 100.0)
            } else {
                0.0
            };

            let _ = app.emit(
                "updater:progress",
                UpdateProgressPayload {
                    percent,
                    bytes_per_second,
                    transferred,
                    total: if total > 0 { total } else { transferred },
                },
            );

            last_emit = Instant::now();
            last_bytes = transferred;
        }
    }

    file.flush().await.map_err(|e| e.to_string())?;

    let _ = app.emit(
        "updater:progress",
        UpdateProgressPayload {
            percent: 100.0,
            bytes_per_second: 0.0,
            transferred,
            total: transferred,
        },
    );

    *DOWNLOADED_INSTALLER_PATH.lock().unwrap() = Some(temp_file);

    let _ = app.emit(
        "updater:status",
        UpdateStatusPayload {
            status: "downloaded".to_string(),
            message: Some(format!("v{version}")),
        },
    );

    let _ = app.emit(
        "updater:downloaded",
        UpdateDownloadedPayload {
            version,
            release_date,
            release_notes,
        },
    );

    Ok(())
}

pub fn quit_and_install() -> Result<(), String> {
    let path_opt = DOWNLOADED_INSTALLER_PATH.lock().unwrap().clone();
    let installer_path = path_opt.ok_or_else(|| "No update downloaded".to_string())?;

    if !installer_path.exists() {
        return Err("Downloaded installer file not found".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x00000008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;

        let mut cmd = std::process::Command::new(&installer_path);
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
        cmd.spawn().map_err(|e| format!("Failed to spawn installer: {e}"))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        open::that(&installer_path).map_err(|e| format!("Failed to run installer: {e}"))?;
    }

    std::process::exit(0);
}
