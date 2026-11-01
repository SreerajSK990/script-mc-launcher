use crate::core::download::{self, Checksum, DownloadTask};
use crate::core::fs_util::write_json_atomic;
use crate::core::safety;
use crate::core::meta::VersionPackage;
use crate::core::paths;
use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

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

pub const KNOWN_JAVA_COMPONENTS: [(&str, &str, u32); 6] = [
    ("jre-legacy", "Java 8", 8),
    ("java-runtime-alpha", "Java 16", 16),
    ("java-runtime-beta", "Java 17 (early)", 17),
    ("java-runtime-gamma", "Java 17", 17),
    ("java-runtime-delta", "Java 21", 21),
    ("java-runtime-epsilon", "Java 25", 25),
];

const COMPLETION_MARKER_NAME: &str = ".script-launcher-complete";

pub fn is_known_java_component(value: &str) -> bool {
    KNOWN_JAVA_COMPONENTS.iter().any(|(component, _, _)| *component == value)
}

pub fn resolve_java_component_for_version(
    version_package: Option<&VersionPackage>,
    minecraft_version: Option<&str>,
) -> String {
    if let Some(requested) = minecraft_version {
        if is_known_java_component(requested) {
            return requested.to_string();
        }
    }

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
        .split(['.', '-'])
        .map(|p| p.parse::<u32>().unwrap_or(0))
        .collect();

    let major = parts.first().copied().unwrap_or(0);
    if major >= 26 {
        return "java-runtime-epsilon".to_string();
    }

    let minor = parts.get(1).copied().unwrap_or(0);
    let patch = parts.get(2).copied().unwrap_or(0);

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
    } else if cfg!(target_os = "macos") {
        let bundled = comp_dir.join("jre.bundle").join("Contents").join("Home").join("bin").join("java");
        if bundled.exists() {
            bundled
        } else {
            comp_dir.join("bin").join("java")
        }
    } else {
        comp_dir.join("bin").join("java")
    }
}

fn completion_marker_path(component: &str) -> PathBuf {
    get_java_component_directory(component).join(COMPLETION_MARKER_NAME)
}

pub fn is_java_runtime_installed(component: &str) -> bool {
    completion_marker_path(component).is_file()
        && fs::metadata(get_java_executable_path(component))
            .map(|m| m.is_file() && m.len() > 0)
            .unwrap_or(false)
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

    let client = crate::core::net::http_client().clone();
    let resp = client
        .get(MOJANG_JAVA_ALL_PRODUCTS_URL)
        .header(USER_AGENT, crate::core::net::USER_AGENT)
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

pub async fn ensure_java_runtime(
    version_package: Option<&VersionPackage>,
    minecraft_version: Option<&str>,
) -> Result<String, String> {
    ensure_java_runtime_with_progress(version_package, minecraft_version, |_, _| {}).await
}

pub async fn ensure_java_runtime_with_progress<F>(
    version_package: Option<&VersionPackage>,
    minecraft_version: Option<&str>,
    on_progress: F,
) -> Result<String, String>
where
    F: Fn(usize, usize) + Send + Sync + 'static,
{
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

    let files_manifest: MojangJavaFilesManifest =
        crate::core::net::get_json(&chosen_product.manifest.url).await?;

    let component_dir = get_java_component_directory(&component);
    fs::create_dir_all(&component_dir).map_err(|e| e.to_string())?;

    let mut download_tasks: Vec<DownloadTask> = Vec::new();
    let mut executable_files: Vec<PathBuf> = Vec::new();

    for (rel_path, file_entry) in files_manifest.files {
        let destination = safety::safe_join(&component_dir, &rel_path)?;
        if file_entry.entry_type == "directory" {
            let _ = fs::create_dir_all(&destination);
            continue;
        }

        if file_entry.entry_type == "file" {
            if let Some(raw) = file_entry.downloads.and_then(|downloads| downloads.raw) {
                if file_entry.executable.unwrap_or(false) {
                    executable_files.push(destination.clone());
                }
                download_tasks.push(DownloadTask {
                    url: raw.url,
                    destination,
                    checksum: Some(Checksum::Sha1(raw.sha1)),
                    size: Some(raw.size),
                });
            }
        }
    }

    download::ensure_files(download_tasks, 12, on_progress).await?;
    mark_files_executable(&executable_files);
    let _ = fs::write(completion_marker_path(&component), &chosen_product.manifest.sha1);

    if is_java_runtime_installed(&component) {
        Ok(exe_path.to_string_lossy().to_string())
    } else {
        Err(format!("Java runtime downloaded but executable not found at: {}", exe_path.display()))
    }
}

#[cfg(unix)]
fn mark_files_executable(files: &[PathBuf]) {
    use std::os::unix::fs::PermissionsExt;
    for file in files {
        let _ = fs::set_permissions(file, fs::Permissions::from_mode(0o755));
    }
}

#[cfg(not(unix))]
fn mark_files_executable(_files: &[PathBuf]) {}

pub fn get_managed_java_runtimes_summary() -> Vec<ManagedJavaRuntimeInfo> {
    KNOWN_JAVA_COMPONENTS
        .iter()
        .filter(|(component, _, _)| *component != "java-runtime-beta")
        .map(|(component, name, major)| ManagedJavaRuntimeInfo {
            component: component.to_string(),
            version_name: name.to_string(),
            major_version: *major,
            is_installed: is_java_runtime_installed(component),
            executable_path: get_java_executable_path(component).to_string_lossy().to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn component_names_are_used_directly() {
        assert_eq!(resolve_java_component_for_version(None, Some("java-runtime-delta")), "java-runtime-delta");
        assert_eq!(resolve_java_component_for_version(None, Some("java-runtime-epsilon")), "java-runtime-epsilon");
    }

    #[test]
    fn versions_map_to_expected_runtimes() {
        assert_eq!(resolve_java_component_for_version(None, Some("1.12.2")), "jre-legacy");
        assert_eq!(resolve_java_component_for_version(None, Some("1.17.1")), "java-runtime-alpha");
        assert_eq!(resolve_java_component_for_version(None, Some("1.20.4")), "java-runtime-gamma");
        assert_eq!(resolve_java_component_for_version(None, Some("1.21.1")), "java-runtime-delta");
        assert_eq!(resolve_java_component_for_version(None, Some("26.3")), "java-runtime-epsilon");
    }
}
