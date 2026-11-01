use crate::core::download::{self, Checksum};
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static CANCELLED_INSTANCES: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransferProgressPayload {
    instance_id: String,
    transferred: u64,
    total: Option<u64>,
    bytes_per_second: f64,
    completed: bool,
}

fn cancelled_instances() -> &'static Mutex<HashSet<String>> {
    CANCELLED_INSTANCES.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn initialize(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
}

pub fn request_cancel(instance_id: &str) {
    if let Ok(mut cancelled) = cancelled_instances().lock() {
        cancelled.insert(instance_id.to_string());
    }
}

fn is_cancelled(instance_id: &str) -> bool {
    cancelled_instances()
        .lock()
        .map(|cancelled| cancelled.contains(instance_id))
        .unwrap_or(false)
}

fn clear_cancel(instance_id: &str) {
    if let Ok(mut cancelled) = cancelled_instances().lock() {
        cancelled.remove(instance_id);
    }
}

fn emit(payload: TransferProgressPayload) {
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("content:transfer-progress", payload);
    }
}

pub async fn download_for_instance(
    instance_id: &str,
    url: &str,
    destination: &Path,
    checksum: Option<&Checksum>,
    expected_size: Option<u64>,
) -> Result<u64, String> {
    clear_cancel(instance_id);
    let started = Instant::now();
    let mut last_emit = Instant::now();
    let total = expected_size.filter(|size| *size > 0);
    let result = download::fetch_to_path_cancellable(url, destination, checksum, |transferred| {
        if last_emit.elapsed().as_millis() >= 150 {
            last_emit = Instant::now();
            let elapsed = started.elapsed().as_secs_f64().max(0.001);
            emit(TransferProgressPayload {
                instance_id: instance_id.to_string(),
                transferred,
                total,
                bytes_per_second: transferred as f64 / elapsed,
                completed: false,
            });
        }
        !is_cancelled(instance_id)
    })
    .await;
    emit(TransferProgressPayload {
        instance_id: instance_id.to_string(),
        transferred: *result.as_ref().unwrap_or(&0),
        total,
        bytes_per_second: 0.0,
        completed: true,
    });
    clear_cancel(instance_id);
    result
}
