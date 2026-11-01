use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEMPORARY_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

fn temporary_sibling(path: &Path) -> PathBuf {
    let sequence = TEMPORARY_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let base_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    path.with_file_name(format!("{base_name}.{}.{sequence}.tmp", std::process::id()))
}

pub fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    let temporary_path = temporary_sibling(path);
    let write_result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temporary_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        Ok(())
    })();
    if let Err(error) = write_result {
        let _ = fs::remove_file(&temporary_path);
        return Err(format!("Failed to write {}: {error}", path.display()));
    }
    if let Err(error) = fs::rename(&temporary_path, path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(format!("Failed to replace {}: {error}", path.display()));
    }
    Ok(())
}

pub fn write_json_atomic<T: Serialize + ?Sized>(path: &Path, data: &T) -> Result<(), String> {
    let content = serde_json::to_vec_pretty(data).map_err(|e| e.to_string())?;
    write_bytes_atomic(path, &content)
}

pub fn copy_dir_recursive(source: &Path, destination: &Path, skip_names: &[&str]) -> Result<u64, String> {
    fs::create_dir_all(destination)
        .map_err(|e| format!("Failed to create {}: {e}", destination.display()))?;
    let mut copied_files = 0u64;
    let entries = fs::read_dir(source).map_err(|e| format!("Failed to read {}: {e}", source.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_name = entry.file_name();
        if skip_names.contains(&file_name.to_string_lossy().as_ref()) {
            continue;
        }
        let source_path = entry.path();
        let target_path = destination.join(&file_name);
        let metadata = fs::metadata(&source_path)
            .map_err(|e| format!("Failed to inspect {}: {e}", source_path.display()))?;
        if metadata.is_dir() {
            copied_files += copy_dir_recursive(&source_path, &target_path, skip_names)?;
        } else if metadata.is_file() {
            fs::copy(&source_path, &target_path)
                .map_err(|e| format!("Failed to copy {}: {e}", source_path.display()))?;
            copied_files += 1;
        }
    }
    Ok(copied_files)
}

pub fn link_dir_recursive(source: &Path, destination: &Path) -> Result<u64, String> {
    fs::create_dir_all(destination)
        .map_err(|e| format!("Failed to create {}: {e}", destination.display()))?;
    let mut linked_files = 0u64;
    let entries = fs::read_dir(source).map_err(|e| format!("Failed to read {}: {e}", source.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let source_path = entry.path();
        let target_path = destination.join(entry.file_name());
        let metadata = fs::metadata(&source_path)
            .map_err(|e| format!("Failed to inspect {}: {e}", source_path.display()))?;
        if metadata.is_dir() {
            linked_files += link_dir_recursive(&source_path, &target_path)?;
        } else if metadata.is_file() {
            if fs::hard_link(&source_path, &target_path).is_err() {
                fs::copy(&source_path, &target_path)
                    .map_err(|e| format!("Failed to copy {}: {e}", source_path.display()))?;
            }
            linked_files += 1;
        }
    }
    Ok(linked_files)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_directory(label: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "script-launcher-test-{label}-{}-{}",
            std::process::id(),
            TEMPORARY_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    #[test]
    fn atomic_write_replaces_existing_file_and_leaves_no_temporary_files() {
        let directory = scratch_directory("atomic");
        let target = directory.join("data.json");
        write_json_atomic(&target, &vec![1, 2, 3]).unwrap();
        write_json_atomic(&target, &vec![4]).unwrap();
        let parsed: Vec<i32> = serde_json::from_str(&fs::read_to_string(&target).unwrap()).unwrap();
        assert_eq!(parsed, vec![4]);
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn recursive_copy_skips_named_entries() {
        let directory = scratch_directory("copy");
        let source = directory.join("source");
        fs::create_dir_all(source.join("nested")).unwrap();
        fs::create_dir_all(source.join("logs")).unwrap();
        fs::write(source.join("nested").join("a.txt"), "a").unwrap();
        fs::write(source.join("logs").join("b.txt"), "b").unwrap();
        let copied = copy_dir_recursive(&source, &directory.join("target"), &["logs"]).unwrap();
        assert_eq!(copied, 1);
        assert!(directory.join("target").join("nested").join("a.txt").is_file());
        assert!(!directory.join("target").join("logs").exists());
        fs::remove_dir_all(directory).unwrap();
    }
}
