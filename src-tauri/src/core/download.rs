use crate::core::net;
use sha1::{Digest, Sha1};
use sha2::Sha512;
use std::collections::HashSet;
use std::ffi::OsString;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

const MAX_DOWNLOAD_ATTEMPTS: u32 = 4;
const HASH_BUFFER_SIZE: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Checksum {
    Sha1(String),
    Sha512(String),
}

impl Checksum {
    pub fn from_hashes(sha512: Option<String>, sha1: Option<String>) -> Option<Checksum> {
        sha512
            .filter(|value| !value.is_empty())
            .map(Checksum::Sha512)
            .or_else(|| sha1.filter(|value| !value.is_empty()).map(Checksum::Sha1))
    }

    pub fn expected(&self) -> &str {
        match self {
            Checksum::Sha1(value) | Checksum::Sha512(value) => value,
        }
    }

    fn label(&self) -> &'static str {
        match self {
            Checksum::Sha1(_) => "SHA-1",
            Checksum::Sha512(_) => "SHA-512",
        }
    }
}

enum RunningHasher {
    Sha1(Sha1),
    Sha512(Sha512),
}

impl RunningHasher {
    fn new(checksum: &Checksum) -> Self {
        match checksum {
            Checksum::Sha1(_) => RunningHasher::Sha1(Sha1::new()),
            Checksum::Sha512(_) => RunningHasher::Sha512(Sha512::new()),
        }
    }

    fn update(&mut self, data: &[u8]) {
        match self {
            RunningHasher::Sha1(hasher) => hasher.update(data),
            RunningHasher::Sha512(hasher) => hasher.update(data),
        }
    }

    fn finish(self) -> String {
        match self {
            RunningHasher::Sha1(hasher) => format!("{:x}", hasher.finalize()),
            RunningHasher::Sha512(hasher) => format!("{:x}", hasher.finalize()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DownloadTask {
    pub url: String,
    pub destination: PathBuf,
    pub checksum: Option<Checksum>,
    pub size: Option<u64>,
}

pub fn hash_file(path: &Path, checksum: &Checksum) -> std::io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = RunningHasher::new(checksum);
    let mut buffer = vec![0u8; HASH_BUFFER_SIZE];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finish())
}

pub fn file_satisfies(path: &Path, checksum: Option<&Checksum>, size: Option<u64>) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    if let Some(expected_size) = size {
        if expected_size > 0 && metadata.len() != expected_size {
            return false;
        }
    }
    match checksum {
        None => true,
        Some(expected) => hash_file(path, expected)
            .map(|actual| actual.eq_ignore_ascii_case(expected.expected()))
            .unwrap_or(false),
    }
}

fn partial_path(destination: &Path) -> PathBuf {
    let mut name: OsString = destination.as_os_str().to_owned();
    name.push(".part");
    PathBuf::from(name)
}

enum FetchFailure {
    Retryable(String),
    Fatal(String),
}

async fn fetch_once<F>(
    url: &str,
    destination: &Path,
    checksum: Option<&Checksum>,
    on_bytes: &mut F,
) -> Result<u64, FetchFailure>
where
    F: FnMut(u64) -> bool,
{
    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| FetchFailure::Fatal(format!("Failed to create {}: {e}", parent.display())))?;
    }

    let mut response = net::http_client()
        .get(url)
        .send()
        .await
        .map_err(|e| FetchFailure::Retryable(format!("Failed to download {url}: {}", net::describe_request_error(&e))))?;

    let status = response.status();
    if !status.is_success() {
        let message = format!("Download failed with HTTP {status} for {url}");
        return Err(if net::is_retryable_status(status) {
            FetchFailure::Retryable(message)
        } else {
            FetchFailure::Fatal(message)
        });
    }

    let part_path = partial_path(destination);
    let mut file = tokio::fs::File::create(&part_path)
        .await
        .map_err(|e| FetchFailure::Fatal(format!("Failed to create {}: {e}", part_path.display())))?;
    let mut hasher = checksum.map(RunningHasher::new);
    let mut transferred = 0u64;

    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(error) => {
                drop(file);
                let _ = tokio::fs::remove_file(&part_path).await;
                return Err(FetchFailure::Retryable(format!(
                    "Connection interrupted while downloading {url}: {}",
                    net::describe_request_error(&error)
                )));
            }
        };
        if let Some(active) = hasher.as_mut() {
            active.update(&chunk);
        }
        if let Err(error) = file.write_all(&chunk).await {
            drop(file);
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(FetchFailure::Fatal(format!("Failed to write {}: {error}", part_path.display())));
        }
        transferred += chunk.len() as u64;
        if !on_bytes(transferred) {
            drop(file);
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(FetchFailure::Fatal("Download cancelled".to_string()));
        }
    }

    let flush_result = file.flush().await;
    drop(file);
    if let Err(error) = flush_result {
        let _ = tokio::fs::remove_file(&part_path).await;
        return Err(FetchFailure::Fatal(format!("Failed to write {}: {error}", part_path.display())));
    }

    if let (Some(expected), Some(active)) = (checksum, hasher) {
        let actual = active.finish();
        if !actual.eq_ignore_ascii_case(expected.expected()) {
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(FetchFailure::Retryable(format!(
                "{} mismatch for {}: expected {}, got {actual}",
                expected.label(),
                destination.display(),
                expected.expected()
            )));
        }
    }

    tokio::fs::rename(&part_path, destination).await.map_err(|e| {
        FetchFailure::Fatal(format!("Failed to move download into {}: {e}", destination.display()))
    })?;
    Ok(transferred)
}

pub async fn fetch_to_path<F>(
    url: &str,
    destination: &Path,
    checksum: Option<&Checksum>,
    mut on_bytes: F,
) -> Result<u64, String>
where
    F: FnMut(u64),
{
    fetch_to_path_cancellable(url, destination, checksum, |transferred| {
        on_bytes(transferred);
        true
    })
    .await
}

pub async fn fetch_to_path_cancellable<F>(
    url: &str,
    destination: &Path,
    checksum: Option<&Checksum>,
    mut on_bytes: F,
) -> Result<u64, String>
where
    F: FnMut(u64) -> bool,
{
    let mut last_error = format!("Download was not attempted: {url}");
    for attempt in 0..MAX_DOWNLOAD_ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(net::retry_delay(attempt)).await;
        }
        match fetch_once(url, destination, checksum, &mut on_bytes).await {
            Ok(transferred) => return Ok(transferred),
            Err(FetchFailure::Fatal(message)) => return Err(message),
            Err(FetchFailure::Retryable(message)) => last_error = message,
        }
    }
    Err(last_error)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExistingFilePolicy {
    VerifyChecksum,
    TrustMatchingSize,
}

pub async fn ensure_file(task: &DownloadTask) -> Result<(), String> {
    ensure_file_with_policy(task, ExistingFilePolicy::VerifyChecksum).await
}

pub async fn ensure_file_with_policy(task: &DownloadTask, policy: ExistingFilePolicy) -> Result<(), String> {
    let destination = task.destination.clone();
    let checksum = match policy {
        ExistingFilePolicy::VerifyChecksum => task.checksum.clone(),
        ExistingFilePolicy::TrustMatchingSize if task.size.is_some() => None,
        ExistingFilePolicy::TrustMatchingSize => task.checksum.clone(),
    };
    let size = task.size;
    let already_valid = tokio::task::spawn_blocking(move || file_satisfies(&destination, checksum.as_ref(), size))
        .await
        .unwrap_or(false);
    if already_valid {
        return Ok(());
    }
    fetch_to_path(&task.url, &task.destination, task.checksum.as_ref(), |_| {}).await?;
    Ok(())
}

pub async fn ensure_files<F>(tasks: Vec<DownloadTask>, concurrency: usize, on_progress: F) -> Result<(), String>
where
    F: Fn(usize, usize) + Send + Sync + 'static,
{
    ensure_files_with_policy(tasks, concurrency, ExistingFilePolicy::VerifyChecksum, on_progress).await
}

pub async fn ensure_files_with_policy<F>(
    tasks: Vec<DownloadTask>,
    concurrency: usize,
    policy: ExistingFilePolicy,
    on_progress: F,
) -> Result<(), String>
where
    F: Fn(usize, usize) + Send + Sync + 'static,
{
    let mut seen_destinations = HashSet::new();
    let unique_tasks: Vec<DownloadTask> = tasks
        .into_iter()
        .filter(|task| seen_destinations.insert(task.destination.clone()))
        .collect();

    let total = unique_tasks.len();
    if total == 0 {
        on_progress(0, 0);
        return Ok(());
    }

    let semaphore = Arc::new(Semaphore::new(concurrency.max(1)));
    let completed = Arc::new(AtomicUsize::new(0));
    let on_progress = Arc::new(on_progress);
    let mut workers = JoinSet::new();

    for task in unique_tasks {
        let semaphore = semaphore.clone();
        let completed = completed.clone();
        let on_progress = on_progress.clone();
        workers.spawn(async move {
            let _permit = semaphore.acquire_owned().await.map_err(|e| e.to_string())?;
            ensure_file_with_policy(&task, policy).await?;
            let done = completed.fetch_add(1, Ordering::SeqCst) + 1;
            on_progress(done, total);
            Ok::<(), String>(())
        });
    }

    while let Some(result) = workers.join_next().await {
        match result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => return Err(error),
            Err(error) => return Err(format!("Download worker failed: {error}")),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum_prefers_sha512() {
        assert_eq!(
            Checksum::from_hashes(Some("abc".into()), Some("def".into())),
            Some(Checksum::Sha512("abc".into()))
        );
        assert_eq!(
            Checksum::from_hashes(Some(String::new()), Some("def".into())),
            Some(Checksum::Sha1("def".into()))
        );
        assert_eq!(Checksum::from_hashes(None, None), None);
    }

    #[test]
    fn file_validation_checks_size_and_hash() {
        let path = std::env::temp_dir().join(format!("script-launcher-hash-{}.bin", std::process::id()));
        fs::write(&path, b"hello").unwrap();
        let sha1 = Checksum::Sha1("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d".into());
        assert!(file_satisfies(&path, Some(&sha1), Some(5)));
        assert!(!file_satisfies(&path, Some(&sha1), Some(6)));
        assert!(!file_satisfies(&path, Some(&Checksum::Sha1("00".into())), None));
        assert!(file_satisfies(&path, None, None));
        fs::remove_file(path).unwrap();
    }

    #[tokio::test]
    #[ignore]
    async fn downloads_and_verifies_live_mojang_file() {
        let manifest: serde_json::Value =
            net::get_json("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json").await.unwrap();
        let entry = manifest["versions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|version| version["id"] == "1.21.1")
            .unwrap();
        let destination = std::env::temp_dir().join(format!("script-launcher-live-{}.json", std::process::id()));
        let task = DownloadTask {
            url: entry["url"].as_str().unwrap().to_string(),
            destination: destination.clone(),
            checksum: Some(Checksum::Sha1(entry["sha1"].as_str().unwrap().to_string())),
            size: None,
        };
        ensure_file(&task).await.unwrap();
        assert!(file_satisfies(&destination, task.checksum.as_ref(), None));
        ensure_file(&task).await.unwrap();
        let broken = DownloadTask { checksum: Some(Checksum::Sha1("00".into())), ..task.clone() };
        let _ = fs::remove_file(&destination);
        assert!(ensure_file(&broken).await.unwrap_err().contains("mismatch"));
        assert!(!destination.exists());
        assert!(!partial_path(&destination).exists());
    }

    #[test]
    fn partial_path_appends_suffix() {
        assert_eq!(partial_path(Path::new("a/b.jar")), PathBuf::from("a/b.jar.part"));
    }
}
