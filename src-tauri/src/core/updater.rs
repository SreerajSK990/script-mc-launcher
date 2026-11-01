use crate::core::download::{self, Checksum};
use crate::core::net;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

const LATEST_RELEASE_URL: &str = "https://api.github.com/repos/SreerajSK990/script-mc-launcher/releases/latest";
const UPDATE_MANIFEST_ASSET_NAME: &str = "latest.yml";

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
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<GitHubReleaseAsset>,
}

struct PendingInstaller {
    version: String,
    download_url: String,
    size: u64,
    sha512_hex: String,
    release_date: Option<String>,
    release_notes: Option<String>,
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

pub fn is_newer_version(candidate: &str, current: &str) -> bool {
    match (
        semver::Version::parse(candidate.trim().trim_start_matches('v')),
        semver::Version::parse(current.trim().trim_start_matches('v')),
    ) {
        (Ok(candidate_version), Ok(current_version)) => candidate_version > current_version,
        _ => false,
    }
}

fn manifest_value<'a>(manifest: &'a str, key: &str) -> Option<&'a str> {
    manifest.lines().find_map(|line| {
        let stripped = line.strip_prefix(key)?.strip_prefix(':')?;
        Some(stripped.trim().trim_matches('\'').trim_matches('"'))
    })
}

pub fn installer_sha512_from_manifest(manifest: &str, installer_name: &str) -> Result<String, String> {
    let manifest_path = manifest_value(manifest, "path")
        .ok_or_else(|| "Update manifest does not name an installer".to_string())?;
    if manifest_path != installer_name {
        return Err(format!(
            "Update manifest describes {manifest_path}, but the release installer is {installer_name}"
        ));
    }
    let encoded = manifest_value(manifest, "sha512")
        .ok_or_else(|| "Update manifest does not contain a SHA-512 checksum".to_string())?;
    let digest = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Update manifest checksum is not valid base64: {e}"))?;
    if digest.len() != 64 {
        return Err("Update manifest checksum has an unexpected length".to_string());
    }
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

async fn fetch_latest_release() -> Result<GitHubRelease, String> {
    let response = net::send_with_retry(|| {
        net::http_client()
            .get(LATEST_RELEASE_URL)
            .header(reqwest::header::ACCEPT, "application/vnd.github+json")
    })
    .await?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    response.json::<GitHubRelease>().await.map_err(|e| e.to_string())
}

async fn resolve_pending_installer(release: &GitHubRelease, version: &str) -> Result<PendingInstaller, String> {
    let installer = release
        .assets
        .iter()
        .find(|asset| asset.name.ends_with(".exe") && asset.name.to_lowercase().contains("setup"))
        .ok_or_else(|| "This release does not include a Windows installer".to_string())?;
    let manifest_asset = release
        .assets
        .iter()
        .find(|asset| asset.name == UPDATE_MANIFEST_ASSET_NAME)
        .ok_or_else(|| "This release does not include an update manifest, so it cannot be verified".to_string())?;

    let manifest_response =
        net::send_with_retry(|| net::http_client().get(&manifest_asset.browser_download_url)).await?;
    if !manifest_response.status().is_success() {
        return Err(format!("Failed to download update manifest: HTTP {}", manifest_response.status()));
    }
    let manifest_text = manifest_response.text().await.map_err(|e| e.to_string())?;
    let sha512_hex = installer_sha512_from_manifest(&manifest_text, &installer.name)?;

    Ok(PendingInstaller {
        version: version.to_string(),
        download_url: installer.browser_download_url.clone(),
        size: installer.size,
        sha512_hex,
        release_date: release.published_at.clone(),
        release_notes: release.body.clone(),
    })
}

fn announce_downloaded(app: &AppHandle, pending: &PendingInstaller) {
    emit_status(app, "downloaded", Some(format!("v{}", pending.version)));
    let _ = app.emit(
        "updater:downloaded",
        UpdateDownloadedPayload {
            version: pending.version.clone(),
            release_date: pending.release_date.clone(),
            release_notes: pending.release_notes.clone(),
        },
    );
}

fn installer_destination(version: &str) -> PathBuf {
    std::env::temp_dir().join(format!("Script-Minecraft-Launcher-Setup-{version}.exe"))
}

pub async fn check_and_download_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current_version = net::LAUNCHER_VERSION.to_string();
    let failure = |error: String| UpdateCheckResult {
        has_update: false,
        current_version: current_version.clone(),
        latest_version: None,
        error: Some(error),
    };

    let release = match fetch_latest_release().await {
        Ok(release) => release,
        Err(error) => return Ok(failure(error)),
    };

    let latest = release.tag_name.trim_start_matches('v').to_string();
    if release.draft || release.prerelease || !is_newer_version(&latest, &current_version) {
        emit_status(&app, "not-available", None);
        return Ok(UpdateCheckResult {
            has_update: false,
            current_version,
            latest_version: None,
            error: None,
        });
    }

    emit_status(&app, "available", Some(format!("v{latest}")));

    let pending = match resolve_pending_installer(&release, &latest).await {
        Ok(pending) => pending,
        Err(error) => {
            emit_status(&app, "error", Some(error.clone()));
            return Ok(UpdateCheckResult {
                has_update: true,
                current_version,
                latest_version: Some(latest),
                error: Some(error),
            });
        }
    };

    let destination = installer_destination(&pending.version);
    let checksum = Checksum::Sha512(pending.sha512_hex.clone());
    let already_verified = {
        let destination = destination.clone();
        let checksum = checksum.clone();
        let size = pending.size;
        tokio::task::spawn_blocking(move || download::file_satisfies(&destination, Some(&checksum), Some(size)))
            .await
            .unwrap_or(false)
    };

    if already_verified {
        if let Ok(mut slot) = DOWNLOADED_INSTALLER_PATH.lock() {
            *slot = Some(destination);
        }
        announce_downloaded(&app, &pending);
    } else if !IS_DOWNLOADING.swap(true, Ordering::SeqCst) {
        let app_handle = app.clone();
        tokio::spawn(async move {
            if let Err(error) = download_installer(&app_handle, &pending, &destination, &checksum).await {
                emit_status(&app_handle, "error", Some(error));
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

async fn download_installer(
    app: &AppHandle,
    pending: &PendingInstaller,
    destination: &PathBuf,
    checksum: &Checksum,
) -> Result<(), String> {
    emit_status(app, "downloading", Some(format!("v{}", pending.version)));

    let total = pending.size;
    let mut last_emit = Instant::now();
    let mut last_bytes = 0u64;
    let progress_app = app.clone();

    let transferred = download::fetch_to_path(&pending.download_url, destination, Some(checksum), |transferred| {
        let elapsed = last_emit.elapsed();
        if elapsed.as_millis() < 150 {
            return;
        }
        let bytes_per_second = transferred.saturating_sub(last_bytes) as f64 / elapsed.as_secs_f64();
        let percent = if total > 0 {
            (transferred as f64 / total as f64 * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        };
        let _ = progress_app.emit(
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
    })
    .await?;

    let _ = app.emit(
        "updater:progress",
        UpdateProgressPayload {
            percent: 100.0,
            bytes_per_second: 0.0,
            transferred,
            total: transferred,
        },
    );

    if let Ok(mut slot) = DOWNLOADED_INSTALLER_PATH.lock() {
        *slot = Some(destination.clone());
    }
    announce_downloaded(app, pending);
    Ok(())
}

pub fn quit_and_install() -> Result<(), String> {
    let installer_path = DOWNLOADED_INSTALLER_PATH
        .lock()
        .map_err(|_| "Updater state is unavailable".to_string())?
        .clone()
        .ok_or_else(|| "No update downloaded".to_string())?;

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

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_MANIFEST: &str = "version: 0.18.10\nfiles:\n  - url: Script-Minecraft-Launcher-Setup-0.18.10.exe\n    sha512: s9BXOCO724gD0OfuVJYGmehCIxXiTOrZHr3/ld/yevm2Z+y78RezXwZ5dctjWh3k3zo21lNyou5NsxHq40I+KQ==\n    size: 4225549\npath: Script-Minecraft-Launcher-Setup-0.18.10.exe\nsha512: s9BXOCO724gD0OfuVJYGmehCIxXiTOrZHr3/ld/yevm2Z+y78RezXwZ5dctjWh3k3zo21lNyou5NsxHq40I+KQ==\nreleaseDate: '2026-09-30T08:38:25.510Z'\n";

    #[test]
    fn version_comparison_never_downgrades() {
        assert!(is_newer_version("0.18.11", "0.18.10"));
        assert!(is_newer_version("v0.19.0", "0.18.10"));
        assert!(!is_newer_version("0.18.9", "0.18.10"));
        assert!(!is_newer_version("0.18.10", "0.18.10"));
        assert!(!is_newer_version("garbage", "0.18.10"));
    }

    #[test]
    fn manifest_checksum_is_decoded_to_hex() {
        let hex = installer_sha512_from_manifest(SAMPLE_MANIFEST, "Script-Minecraft-Launcher-Setup-0.18.10.exe").unwrap();
        assert_eq!(hex.len(), 128);
        assert!(hex.starts_with("b3d05738"));
    }

    #[test]
    fn manifest_for_other_installer_is_rejected() {
        assert!(installer_sha512_from_manifest(SAMPLE_MANIFEST, "Other-Setup.exe").is_err());
    }
}
