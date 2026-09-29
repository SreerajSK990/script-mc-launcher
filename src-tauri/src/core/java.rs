use crate::core::instances::write_json_atomic;
use crate::core::meta::VersionPackage;
use crate::core::paths;
use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

const MOJANG_JAVA_ALL_PRODUCTS_URL: &str =
    "https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedJavaRuntimeInfo {
    pub component: String,
    pub version_name: String,
    pub major_version: u32,
    pub is_installed: bool,
    pub executable_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MojangJavaManifestEntry {
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MojangJavaProductVersion {
    pub manifest: MojangJavaManifestEntry,
    pub version: serde_json::Value,
}

pub type MojangJavaAllProducts = HashMap<String, HashMap<String, Vec<MojangJavaProductVersion>>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MojangJavaFileDownload {
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MojangJavaFileDownloads {
    pub raw: Option<MojangJavaFileDownload>,
    pub lzma: Option<MojangJavaFileDownload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MojangJavaFileEntry {
    #[serde(rename = "type")]
    pub entry_type: String,
    pub executable: Option<bool>,
    pub downloads: Option<MojangJavaFileDownloads>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MojangJavaFilesManifest {
    pub files: HashMap<String, MojangJavaFileEntry>,
}

pub fn resolve_mojang_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        if cfg!(target_arch = "aarch64") {
            "windows-arm64"
        } else if cfg!(target_arch = "x86") {
            "windows-x86"
        } else {
            "windows-x64"
        }
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "mac-os-arm64"
        } else {
            "mac-os"
        }
    } else if cfg!(target_arch = "x86") {
        "linux-i386"
    } else {
        "linux"
    }
}

pub fn resolve_java_component_for_version(
    version_package: Option<&VersionPackage>,
    minecraft_version: Option<&str>,
) -> String {
    if let Some(pkg) = version_package {
        if let Some(java_ver) = &pkg.java_version {
            if !java_ver.component.is_empty() {
                return java_ver.component.clone();
            }
        }
    }

    let ver_str = minecraft_version
        .or_else(|| version_package.map(|p| p.id.as_str()))
        .unwrap_or("1.21.1");

    let parts: Vec<u32> = ver_str
        .split('.')
        .map(|p| p.parse::<u32>().unwrap_or(0))
        .collect();

    let minor = if parts.len() >= 2 { parts[1] } else { 0 };
    let patch = if parts.len() >= 3 { parts[2] } else { 0 };

    if minor < 17 {
        "jre-legacy".to_string()
    } else if minor == 17 {
        "java-runtime-alpha".to_string()
    } else if minor < 20 || (minor == 20 && patch < 5) {
        "java-runtime-gamma".to_string()
    } else {
        "java-runtime-delta".to_string()
    }
}

pub fn get_java_component_directory(component: &str) -> PathBuf {
    paths::get_java_runtimes_directory().join(component)
}

pub fn get_java_executable_path(component: &str) -> PathBuf {
    let comp_dir = get_java_component_directory(component);
    if cfg!(target_os = "windows") {
        comp_dir.join("bin").join("java.exe")
    } else {
        comp_dir.join("bin").join("java")
    }
}

pub fn is_java_runtime_installed(component: &str) -> bool {
    let exe_path = get_java_executable_path(component);
    if !exe_path.exists() {
        return false;
    }
    match fs::metadata(&exe_path) {
        Ok(m) => m.is_file() && m.len() > 0,
        Err(_) => false,
    }
}

pub async fn fetch_mojang_java_products() -> Result<MojangJavaAllProducts, String> {
    let cache_path = paths::get_meta_cache_directory().join("mojang-java-runtimes.json");

    if let Ok(metadata) = fs::metadata(&cache_path) {
        if let Ok(modified) = metadata.modified() {
            if let Ok(elapsed) = SystemTime::now().duration_since(modified) {
                if elapsed < Duration::from_secs(86400) {
                    if let Ok(content) = fs::read_to_string(&cache_path) {
                        if let Ok(data) = serde_json::from_str::<MojangJavaAllProducts>(&content) {
                            return Ok(data);
                        }
                    }
                }
            }
        }
    }

    let client = reqwest::Client::new();
    let resp = client
        .get(MOJANG_JAVA_ALL_PRODUCTS_URL)
        .header(USER_AGENT, "ScriptLauncher/0.18.1")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Failed to fetch Java products: HTTP {}", resp.status()));
    }

    let data = resp.json::<MojangJavaAllProducts>().await.map_err(|e| e.to_string())?;
    let _ = write_json_atomic(&cache_path, &data);
    Ok(data)
}

struct JavaDownloadTask {
    url: String,
    destination: PathBuf,
    sha1: String,
    #[allow(dead_code)]
    is_executable: bool,
}

pub async fn ensure_java_runtime(
    version_package: Option<&VersionPackage>,
    minecraft_version: Option<&str>,
) -> Result<String, String> {
    let component = resolve_java_component_for_version(version_package, minecraft_version);
    let exe_path = get_java_executable_path(&component);

    if is_java_runtime_installed(&component) {
        return Ok(exe_path.to_string_lossy().to_string());
    }

    let all_products = fetch_mojang_java_products().await?;
    let platform = resolve_mojang_platform();

    let platform_products = all_products
        .get(platform)
        .ok_or_else(|| format!("No Java runtimes available for platform: {platform}"))?;

    let component_versions = platform_products
        .get(&component)
        .ok_or_else(|| format!("No runtime versions found for component: {component}"))?;

    let chosen_product = component_versions
        .first()
        .ok_or_else(|| format!("Empty versions list for component: {component}"))?;

    let client = reqwest::Client::new();
    let manifest_resp = client
        .get(&chosen_product.manifest.url)
        .header(USER_AGENT, "ScriptLauncher/0.18.1")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !manifest_resp.status().is_success() {
        return Err(format!(
            "Failed to download Java files manifest: HTTP {}",
            manifest_resp.status()
        ));
    }

    let files_manifest = manifest_resp
        .json::<MojangJavaFilesManifest>()
        .await
        .map_err(|e| e.to_string())?;

    let component_dir = get_java_component_directory(&component);
    fs::create_dir_all(&component_dir).map_err(|e| e.to_string())?;

    let mut download_tasks: Vec<JavaDownloadTask> = Vec::new();

    for (rel_path, file_entry) in files_manifest.files {
        let destination = component_dir.join(rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
        if file_entry.entry_type == "directory" {
            let _ = fs::create_dir_all(&destination);
            continue;
        }

        if file_entry.entry_type == "file" {
            if let Some(downloads) = file_entry.downloads {
                if let Some(raw) = downloads.raw {
                    download_tasks.push(JavaDownloadTask {
                        url: raw.url,
                        destination,
                        sha1: raw.sha1,
                        is_executable: file_entry.executable.unwrap_or(false),
                    });
                }
            }
        }
    }

    let semaphore = Arc::new(Semaphore::new(12));
    let mut set = JoinSet::new();

    for task in download_tasks {
        let sem = semaphore.clone();
        let client_clone = client.clone();
        set.spawn(async move {
            let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
            download_and_verify_file(&client_clone, &task).await
        });
    }

    while let Some(res) = set.join_next().await {
        match res {
            Ok(Ok(())) => {}
            Ok(Err(e)) => return Err(e),
            Err(e) => return Err(e.to_string()),
        }
    }

    if is_java_runtime_installed(&component) {
        Ok(exe_path.to_string_lossy().to_string())
    } else {
        Err(format!("Java runtime downloaded but executable not found at: {}", exe_path.display()))
    }
}

async fn download_and_verify_file(
    client: &reqwest::Client,
    task: &JavaDownloadTask,
) -> Result<(), String> {
    if task.destination.exists() {
        if let Ok(bytes) = fs::read(&task.destination) {
            let mut hasher = Sha1::new();
            hasher.update(&bytes);
            let calculated_hash = format!("{:x}", hasher.finalize());
            if calculated_hash.eq_ignore_ascii_case(&task.sha1) {
                return Ok(());
            }
        }
    }

    if let Some(parent) = task.destination.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let resp = client
        .get(&task.url)
        .header(USER_AGENT, "ScriptLauncher/0.18.1")
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {e}", task.url))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed with HTTP {} for {}", resp.status(), task.url));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read bytes for {}: {e}", task.url))?;

    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    let calculated_hash = format!("{:x}", hasher.finalize());
    if !calculated_hash.eq_ignore_ascii_case(&task.sha1) {
        return Err(format!(
            "Checksum mismatch for {}: expected {}, got {}",
            task.destination.display(),
            task.sha1,
            calculated_hash
        ));
    }

    fs::write(&task.destination, &bytes).map_err(|e| e.to_string())?;

    #[cfg(unix)]
    if task.is_executable {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&task.destination, fs::Permissions::from_mode(0o755));
    }

    Ok(())
}

pub fn get_managed_java_runtimes_summary() -> Vec<ManagedJavaRuntimeInfo> {
    let components = [
        ("jre-legacy", "Java 8", 8u32),
        ("java-runtime-alpha", "Java 16", 16u32),
        ("java-runtime-gamma", "Java 17", 17u32),
        ("java-runtime-delta", "Java 21", 21u32),
    ];

    components
        .iter()
        .map(|(component, name, major)| {
            let is_installed = is_java_runtime_installed(component);
            let exe_path = get_java_executable_path(component);
            ManagedJavaRuntimeInfo {
                component: component.to_string(),
                version_name: name.to_string(),
                major_version: *major,
                is_installed,
                executable_path: exe_path.to_string_lossy().to_string(),
            }
        })
        .collect()
}
