use crate::core::auth::{self, StoredAccount};
use crate::core::instances::{self, InstanceConfiguration};
use crate::core::java;
use crate::core::download::{self, Checksum, DownloadTask, ExistingFilePolicy};
use crate::core::loaders;
use crate::core::meta::{self, AssetIndexInfo, LibraryDownload, LibraryRule, VersionPackage};
use crate::core::operations;
use crate::core::paths;
use crate::core::safety;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;

const ASSETS_RESOURCE_ROOT_URL: &str = "https://resources.download.minecraft.net";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchProgressEvent {
    pub instance_id: String,
    pub step: String,
    pub status_text: String,
    pub current_items: Option<u64>,
    pub total_items: Option<u64>,
    pub percentage: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchLogEvent {
    pub instance_id: String,
    pub text: String,
    pub level: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPlayLaunchOptions {
    #[serde(rename = "type")]
    pub target_type: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub world_folder: Option<String>,
}

#[derive(Debug, Clone, Copy)]
struct RunningProcess {
    pid: u32,
    stop_requested: bool,
}

pub struct ActiveProcessManager {
    children: Mutex<HashMap<String, RunningProcess>>,
}

static PROCESS_MANAGER: OnceLock<ActiveProcessManager> = OnceLock::new();

fn get_process_manager() -> &'static ActiveProcessManager {
    PROCESS_MANAGER.get_or_init(|| ActiveProcessManager {
        children: Mutex::new(HashMap::new()),
    })
}

pub async fn is_instance_running(instance_id: &str) -> bool {
    let mgr = get_process_manager();
    let map = mgr.children.lock().await;
    map.contains_key(instance_id)
}

pub async fn stop_running_instance(instance_id: &str) -> bool {
    let mgr = get_process_manager();
    let mut map = mgr.children.lock().await;
    let Some(process) = map.get_mut(instance_id) else {
        return false;
    };
    process.stop_requested = true;
    let pid = process.pid;
    drop(map);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .creation_flags(0x08000000)
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();
    }
    true
}

fn timestamp_now() -> String {
    chrono::Local::now().format("%H:%M:%S").to_string()
}

fn send_launch_status(app: &AppHandle, instance_id: &str, step: &str, status_text: &str) {
    send_launch_progress(app, instance_id, step, status_text, None);
}

fn send_launch_progress(
    app: &AppHandle,
    instance_id: &str,
    step: &str,
    status_text: &str,
    counts: Option<(usize, usize)>,
) {
    let _ = app.emit(
        "launch:status",
        LaunchProgressEvent {
            instance_id: instance_id.to_string(),
            step: step.to_string(),
            status_text: status_text.to_string(),
            current_items: counts.map(|(current, _)| current as u64),
            total_items: counts.map(|(_, total)| total as u64),
            percentage: counts.map(|(current, total)| {
                if total == 0 {
                    100
                } else {
                    ((current as f64 / total as f64) * 100.0).round() as u32
                }
            }),
        },
    );
}

fn send_launch_log(app: &AppHandle, instance_id: &str, text: &str, level: &str) {
    let _ = app.emit(
        "launch:log",
        LaunchLogEvent {
            instance_id: instance_id.to_string(),
            text: text.to_string(),
            level: level.to_string(),
            timestamp: timestamp_now(),
        },
    );
}

pub fn decode_log_line(raw: &[u8]) -> String {
    let trimmed = raw.strip_suffix(b"\n").unwrap_or(raw);
    let trimmed = trimmed.strip_suffix(b"\r").unwrap_or(trimmed);
    String::from_utf8_lossy(trimmed).into_owned()
}

fn spawn_log_forwarder<R>(app: AppHandle, instance_id: String, stream: R)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut reader = BufReader::new(stream);
        let mut buffer = Vec::with_capacity(512);
        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer).await {
                Ok(0) => break,
                Ok(_) => {
                    let line = decode_log_line(&buffer);
                    send_launch_log(&app, &instance_id, &line, determine_log_level(&line));
                }
                Err(_) => break,
            }
        }
    });
}

fn current_os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

fn os_name_matches(rule_name: &str) -> bool {
    let base = current_os_name();
    if rule_name == base {
        return true;
    }
    cfg!(target_arch = "aarch64") && rule_name == format!("{base}-arm64")
}

fn os_arch_matches(rule_arch: &str) -> bool {
    match rule_arch {
        "x86" => cfg!(target_arch = "x86"),
        "x86_64" | "amd64" => cfg!(target_arch = "x86_64"),
        "arm64" | "aarch64" => cfg!(target_arch = "aarch64"),
        _ => false,
    }
}

pub fn is_rule_allowed(rules: Option<&[LibraryRule]>) -> bool {
    let rules = match rules {
        Some(r) if !r.is_empty() => r,
        _ => return true,
    };

    let mut allowed = false;
    for rule in rules {
        if rule.features.as_ref().is_some_and(|features| !features.is_empty()) {
            continue;
        }

        let os_match = match &rule.os {
            Some(os) => {
                os.name.as_deref().is_none_or(os_name_matches)
                    && os.arch.as_deref().is_none_or(os_arch_matches)
            }
            None => true,
        };

        if os_match {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

fn resolve_native_classifier_key(library: &LibraryDownload) -> Option<String> {
    let natives_map = library.natives.as_ref()?;
    let native_key = natives_map.get(current_os_name())?;
    let arch_str = if cfg!(target_pointer_width = "64") { "64" } else { "32" };
    Some(native_key.replace("${arch}", arch_str))
}

pub fn library_identity(coordinate: &str) -> String {
    let parts: Vec<&str> = coordinate.split(':').collect();
    match parts.len() {
        0..=2 => coordinate.to_string(),
        3 => format!("{}:{}", parts[0], parts[1]),
        _ => format!("{}:{}:{}", parts[0], parts[1], parts[3..].join(":")),
    }
}

pub fn select_active_libraries(libraries: &[LibraryDownload]) -> Vec<LibraryDownload> {
    let mut ordered: Vec<LibraryDownload> = Vec::new();
    let mut positions: HashMap<String, usize> = HashMap::new();
    for library in libraries {
        if !is_rule_allowed(library.rules.as_deref()) {
            continue;
        }
        let identity = library_identity(&library.name);
        match positions.get(&identity) {
            Some(&index) => ordered[index] = library.clone(),
            None => {
                positions.insert(identity, ordered.len());
                ordered.push(library.clone());
            }
        }
    }
    ordered
}

fn extract_native_libraries(jar_path: &Path, natives_dir: &Path, excluded_prefixes: &[String]) -> Result<(), String> {
    let file = fs::File::open(jar_path).map_err(|e| format!("Failed to open {}: {e}", jar_path.display()))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Failed to read {}: {e}", jar_path.display()))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if entry.is_dir()
            || name.starts_with("META-INF")
            || excluded_prefixes.iter().any(|prefix| name.starts_with(prefix.as_str()))
        {
            continue;
        }
        let Some(file_name) = Path::new(&name).file_name() else {
            continue;
        };
        let outpath = natives_dir.join(file_name);
        let mut outfile = fs::File::create(&outpath).map_err(|e| format!("Failed to write {}: {e}", outpath.display()))?;
        std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub type ProgressReporter = Arc<dyn Fn(usize, usize) + Send + Sync>;

async fn prepare_minecraft_libraries(
    version_package: &VersionPackage,
    natives_dir: &Path,
    extra_download_tasks: Vec<DownloadTask>,
    on_progress: ProgressReporter,
) -> Result<Vec<PathBuf>, String> {
    let libraries_root = paths::get_libraries_directory();
    fs::create_dir_all(&libraries_root).map_err(|e| e.to_string())?;
    fs::create_dir_all(natives_dir).map_err(|e| e.to_string())?;

    let mut download_tasks: Vec<DownloadTask> = Vec::new();
    let mut classpath_jars: Vec<PathBuf> = Vec::new();
    let mut native_jars_to_extract: Vec<(PathBuf, Vec<String>)> = Vec::new();

    for library in select_active_libraries(&version_package.libraries) {
        if let Some(downloads) = &library.downloads {
            if let Some(artifact) = &downloads.artifact {
                let relative_path = artifact.path.clone().unwrap_or_else(|| {
                    loaders::convert_maven_coordinate_to_path(&library.name, None, "jar")
                        .unwrap_or_else(|_| library.name.clone())
                });
                let dest = safety::safe_join(&libraries_root, &relative_path)?;
                download_tasks.push(DownloadTask {
                    url: artifact.url.clone(),
                    destination: dest.clone(),
                    checksum: Some(Checksum::Sha1(artifact.sha1.clone())),
                    size: Some(artifact.size),
                });
                if !classpath_jars.contains(&dest) {
                    classpath_jars.push(dest);
                }
            }
        } else if let Some(url) = &library.url {
            if let Ok(rel_path) = loaders::convert_maven_coordinate_to_path(&library.name, None, "jar") {
                let dest = safety::safe_join(&libraries_root, &rel_path)?;
                let base = if url.ends_with('/') { url.clone() } else { format!("{url}/") };
                download_tasks.push(DownloadTask {
                    url: format!("{base}{rel_path}"),
                    destination: dest.clone(),
                    checksum: None,
                    size: None,
                });
                if !classpath_jars.contains(&dest) {
                    classpath_jars.push(dest);
                }
            }
        } else if let Ok(rel_path) = loaders::convert_maven_coordinate_to_path(&library.name, None, "jar") {
            let dest = safety::safe_join(&libraries_root, &rel_path)?;
            if !classpath_jars.contains(&dest) {
                classpath_jars.push(dest);
            }
        }

        if let Some(native_key) = resolve_native_classifier_key(&library) {
            if let Some(native_art) = library
                .downloads
                .as_ref()
                .and_then(|downloads| downloads.classifiers.as_ref())
                .and_then(|classifiers| classifiers.get(&native_key))
            {
                let rel_path = native_art.path.clone().unwrap_or_else(|| {
                    loaders::convert_maven_coordinate_to_path(&library.name, Some(&native_key), "jar")
                        .unwrap_or_else(|_| library.name.clone())
                });
                let dest = safety::safe_join(&libraries_root, &rel_path)?;
                download_tasks.push(DownloadTask {
                    url: native_art.url.clone(),
                    destination: dest.clone(),
                    checksum: Some(Checksum::Sha1(native_art.sha1.clone())),
                    size: Some(native_art.size),
                });
                if !native_jars_to_extract.iter().any(|(path, _)| path == &dest) {
                    let excluded = library.extract.as_ref().map(|rules| rules.exclude.clone()).unwrap_or_default();
                    native_jars_to_extract.push((dest, excluded));
                }
            }
        }
    }

    download_tasks.extend(extra_download_tasks);

    let client_download = &version_package.downloads.client;
    let client_jar_path = libraries_root
        .join("com")
        .join("mojang")
        .join("minecraft")
        .join(&version_package.id)
        .join(format!("minecraft-{}-client.jar", version_package.id));

    download_tasks.push(DownloadTask {
        url: client_download.url.clone(),
        destination: client_jar_path.clone(),
        checksum: Some(Checksum::Sha1(client_download.sha1.clone())),
        size: Some(client_download.size),
    });
    if !classpath_jars.contains(&client_jar_path) {
        classpath_jars.push(client_jar_path);
    }

    download::ensure_files(download_tasks, 12, move |done, total| on_progress(done, total)).await?;

    for (native_jar, excluded) in native_jars_to_extract {
        extract_native_libraries(&native_jar, natives_dir, &excluded)?;
    }

    Ok(classpath_jars)
}

#[derive(Debug, Deserialize)]
struct AssetIndexMap {
    objects: HashMap<String, AssetIndexObject>,
    #[serde(default, rename = "virtual")]
    is_virtual: bool,
    #[serde(default)]
    map_to_resources: bool,
}

#[derive(Debug, Deserialize)]
struct AssetIndexObject {
    hash: String,
    size: u64,
}

fn asset_object_path(objects_dir: &Path, hash: &str) -> Result<PathBuf, String> {
    if hash.len() < 2 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("Asset index contains an invalid hash: {hash}"));
    }
    Ok(objects_dir.join(&hash[..2]).join(hash))
}

fn materialize_legacy_assets(index: &AssetIndexMap, objects_dir: &Path, target_root: &Path) -> Result<(), String> {
    for (relative_name, object) in &index.objects {
        let target = safety::safe_join(target_root, relative_name)?;
        let source = asset_object_path(objects_dir, &object.hash)?;
        let up_to_date = fs::metadata(&target).map(|meta| meta.len() == object.size).unwrap_or(false);
        if up_to_date {
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(&source, &target).map_err(|e| format!("Failed to prepare legacy asset {relative_name}: {e}"))?;
    }
    Ok(())
}

async fn prepare_minecraft_assets(
    asset_index_info: &AssetIndexInfo,
    instance_minecraft_dir: &Path,
    on_progress: ProgressReporter,
) -> Result<PathBuf, String> {
    let assets_root = paths::get_assets_directory();
    let indexes_dir = assets_root.join("indexes");
    let objects_dir = assets_root.join("objects");

    fs::create_dir_all(&indexes_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&objects_dir).map_err(|e| e.to_string())?;

    let index_id = safety::validate_file_name(&asset_index_info.id)?;
    let index_file_path = indexes_dir.join(format!("{index_id}.json"));
    download::ensure_file(&DownloadTask {
        url: asset_index_info.url.clone(),
        destination: index_file_path.clone(),
        checksum: Some(Checksum::Sha1(asset_index_info.sha1.clone())),
        size: Some(asset_index_info.size),
    })
    .await?;

    let content = fs::read_to_string(&index_file_path).map_err(|e| e.to_string())?;
    let index_map: AssetIndexMap = serde_json::from_str(&content)
        .map_err(|e| format!("Asset index {index_id} is invalid: {e}"))?;

    let verification_stamp = indexes_dir.join(format!("{index_id}.verified"));
    let previously_verified = fs::read_to_string(&verification_stamp)
        .map(|stamp| stamp.trim().eq_ignore_ascii_case(&asset_index_info.sha1))
        .unwrap_or(false);
    let policy = if previously_verified {
        ExistingFilePolicy::TrustMatchingSize
    } else {
        ExistingFilePolicy::VerifyChecksum
    };

    let mut download_tasks: Vec<DownloadTask> = Vec::new();
    let mut seen_hashes: HashSet<String> = HashSet::new();

    for obj in index_map.objects.values() {
        if seen_hashes.insert(obj.hash.clone()) {
            let dest = asset_object_path(&objects_dir, &obj.hash)?;
            download_tasks.push(DownloadTask {
                url: format!("{ASSETS_RESOURCE_ROOT_URL}/{}/{}", &obj.hash[..2], obj.hash),
                destination: dest,
                checksum: Some(Checksum::Sha1(obj.hash.clone())),
                size: Some(obj.size),
            });
        }
    }

    download::ensure_files_with_policy(download_tasks, 16, policy, move |done, total| on_progress(done, total)).await?;
    if !previously_verified {
        let _ = crate::core::fs_util::write_bytes_atomic(&verification_stamp, asset_index_info.sha1.as_bytes());
    }

    if index_map.map_to_resources {
        let resources_dir = instance_minecraft_dir.join("resources");
        materialize_legacy_assets(&index_map, &objects_dir, &resources_dir)?;
        return Ok(resources_dir);
    }
    if index_map.is_virtual {
        let virtual_dir = assets_root.join("virtual").join(index_id);
        materialize_legacy_assets(&index_map, &objects_dir, &virtual_dir)?;
        return Ok(virtual_dir);
    }
    Ok(assets_root)
}

async fn prepare_logging_configuration(version_package: &VersionPackage) -> Result<Option<String>, String> {
    let Some(client_logging) = version_package
        .logging
        .as_ref()
        .and_then(|logging| logging.client.as_ref())
    else {
        return Ok(None);
    };
    let file_name = crate::core::safety::validate_file_name(&client_logging.file.id)?;
    let destination = paths::get_assets_directory().join("log_configs").join(file_name);
    download::ensure_file(&DownloadTask {
        url: client_logging.file.url.clone(),
        destination: destination.clone(),
        checksum: Some(Checksum::Sha1(client_logging.file.sha1.clone())),
        size: Some(client_logging.file.size),
    })
    .await?;
    let console_friendly = write_console_logging_configuration(&destination)?;
    Ok(Some(
        client_logging
            .argument
            .replace("${path}", &console_friendly.to_string_lossy()),
    ))
}

const CONSOLE_PATTERN_LAYOUT: &str = r#"<PatternLayout pattern="[%d{HH:mm:ss}] [%t/%level]: %msg{nolookups}%n" />"#;

pub fn convert_logging_configuration_for_console(configuration: &str) -> String {
    configuration
        .replace("<LegacyXMLLayout />", CONSOLE_PATTERN_LAYOUT)
        .replace("<XMLLayout />", CONSOLE_PATTERN_LAYOUT)
}

fn write_console_logging_configuration(official_configuration: &Path) -> Result<PathBuf, String> {
    let original = fs::read_to_string(official_configuration).map_err(|e| e.to_string())?;
    let converted = convert_logging_configuration_for_console(&original);
    let file_stem = official_configuration
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_else(|| "client".to_string());
    let target = official_configuration.with_file_name(format!("{file_stem}.console.xml"));
    let up_to_date = fs::read_to_string(&target).map(|existing| existing == converted).unwrap_or(false);
    if !up_to_date {
        crate::core::fs_util::write_bytes_atomic(&target, converted.as_bytes())?;
    }
    Ok(target)
}

fn replace_template_variables(
    template: &str,
    vars: &HashMap<&str, String>,
) -> String {
    let mut result = template.to_string();
    for (k, v) in vars {
        result = result.replace(k, v);
    }
    result
}

fn build_arguments(
    instance: &InstanceConfiguration,
    version_package: &VersionPackage,
    account: &StoredAccount,
    natives_dir: &Path,
    classpath_string: &str,
    game_assets_dir: &Path,
    quick_play: Option<&QuickPlayLaunchOptions>,
) -> (Vec<String>, Vec<String>, String) {
    let path_sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    let mc_dir = paths::get_instance_minecraft_path(&instance.id);
    let assets_dir = paths::get_assets_directory();
    let user_type = if account.account_type == "microsoft" { "msa" } else { "mojang" };

    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("${auth_player_name}", account.username.clone());
    vars.insert("${auth_uuid}", account.uuid.clone());
    vars.insert("${auth_access_token}", account.access_token.clone());
    vars.insert("${auth_session}", account.access_token.clone());
    vars.insert("${user_properties}", "{}".to_string());
    vars.insert("${user_type}", user_type.to_string());
    vars.insert("${version_name}", instance.minecraft_version.clone());
    vars.insert(
        "${version_type}",
        version_package.version_type.clone().unwrap_or_else(|| "release".to_string()),
    );
    vars.insert("${game_assets}", game_assets_dir.to_string_lossy().to_string());
    vars.insert("${launcher_name}", "ScriptLauncher".to_string());
    vars.insert("${launcher_version}", crate::core::net::LAUNCHER_VERSION.to_string());
    vars.insert(
        "${library_directory}",
        paths::get_libraries_directory().to_string_lossy().to_string(),
    );
    vars.insert("${game_directory}", mc_dir.to_string_lossy().to_string());
    vars.insert("${assets_root}", assets_dir.to_string_lossy().to_string());
    vars.insert("${assets_index_name}", version_package.asset_index.id.clone());
    vars.insert("${natives_directory}", natives_dir.to_string_lossy().to_string());
    vars.insert("${classpath}", classpath_string.to_string());
    vars.insert("${classpath_separator}", path_sep.to_string());
    vars.insert("${clientid}", account.uuid.clone());
    vars.insert("${auth_xuid}", account.uuid.clone());

    let mut jvm_args: Vec<String> = Vec::new();
    jvm_args.push("-Xms512M".to_string());
    jvm_args.push(format!("-Xmx{}M", instance.ram_allocation_megabytes));

    for custom_arg in &instance.jvm_arguments {
        jvm_args.push(replace_template_variables(custom_arg, &vars));
    }

    if let Some(args_obj) = &version_package.arguments {
        if let Some(jvm_entries) = &args_obj.jvm {
            for entry in jvm_entries {
                if let Some(s) = entry.as_str() {
                    jvm_args.push(replace_template_variables(s, &vars));
                } else if let Some(obj) = entry.as_object() {
                    let rules_allowed = obj
                        .get("rules")
                        .and_then(|r| serde_json::from_value::<Vec<LibraryRule>>(r.clone()).ok())
                        .map_or(true, |rules| is_rule_allowed(Some(&rules)));

                    if rules_allowed {
                        if let Some(val) = obj.get("value") {
                            if let Some(s) = val.as_str() {
                                jvm_args.push(replace_template_variables(s, &vars));
                            } else if let Some(arr) = val.as_array() {
                                for item in arr {
                                    if let Some(s) = item.as_str() {
                                        jvm_args.push(replace_template_variables(s, &vars));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if !jvm_args.iter().any(|a| a.starts_with("-Djava.library.path")) {
        jvm_args.push(format!("-Djava.library.path={}", natives_dir.display()));
        jvm_args.push("-Dminecraft.launcher.brand=ScriptLauncher".to_string());
        jvm_args.push(format!("-Dminecraft.launcher.version={}", crate::core::net::LAUNCHER_VERSION));
        jvm_args.push("-cp".to_string());
        jvm_args.push(classpath_string.to_string());
    }

    let mut game_args: Vec<String> = Vec::new();
    if let Some(legacy_args) = &version_package.minecraft_arguments {
        let expanded = replace_template_variables(legacy_args, &vars);
        for part in expanded.split_whitespace() {
            game_args.push(part.to_string());
        }
    } else if let Some(args_obj) = &version_package.arguments {
        if let Some(game_entries) = &args_obj.game {
            for entry in game_entries {
                if let Some(s) = entry.as_str() {
                    game_args.push(replace_template_variables(s, &vars));
                } else if let Some(obj) = entry.as_object() {
                    let rules_allowed = obj
                        .get("rules")
                        .and_then(|r| serde_json::from_value::<Vec<LibraryRule>>(r.clone()).ok())
                        .map_or(true, |rules| is_rule_allowed(Some(&rules)));

                    if rules_allowed {
                        if let Some(val) = obj.get("value") {
                            if let Some(s) = val.as_str() {
                                game_args.push(replace_template_variables(s, &vars));
                            } else if let Some(arr) = val.as_array() {
                                for item in arr {
                                    if let Some(s) = item.as_str() {
                                        game_args.push(replace_template_variables(s, &vars));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(qp) = quick_play {
        let parts: Vec<u32> = instance
            .minecraft_version
            .split('.')
            .map(|p| p.parse::<u32>().unwrap_or(0))
            .collect();
        let is_at_least_1_20 = parts.first().copied().unwrap_or(0) > 1
            || (parts.first().copied().unwrap_or(0) == 1 && parts.get(1).copied().unwrap_or(0) >= 20);

        if qp.target_type == "server" {
            if let Some(host) = &qp.host {
                let port_num = qp.port.unwrap_or(25565);
                if is_at_least_1_20 {
                    game_args.push("--quickPlayMultiplayer".to_string());
                    game_args.push(format!("{host}:{port_num}"));
                } else {
                    game_args.push("--server".to_string());
                    game_args.push(host.clone());
                    if qp.port.is_some() {
                        game_args.push("--port".to_string());
                        game_args.push(port_num.to_string());
                    }
                }
            }
        } else if qp.target_type == "world" {
            if let Some(wf) = &qp.world_folder {
                if is_at_least_1_20 {
                    game_args.push("--quickPlaySingleplayer".to_string());
                    game_args.push(wf.clone());
                }
            }
        }
    }

    (jvm_args, game_args, version_package.main_class.clone())
}

fn determine_log_level(line: &str) -> &'static str {
    let upper = line.to_uppercase();
    if upper.contains("/ERROR") || upper.contains("FATAL") || upper.contains("EXCEPTION") {
        "error"
    } else if upper.contains("/WARN") {
        "warn"
    } else {
        "info"
    }
}

pub async fn launch_minecraft(
    app: AppHandle,
    instance_id: String,
    quick_play: Option<QuickPlayLaunchOptions>,
) -> Result<bool, String> {
    let operation_guard = operations::reserve_instance(&instance_id, "Minecraft is launching or running")?;

    if is_instance_running(&instance_id).await {
        return Err("This instance is already running.".to_string());
    }

    let emit_progress = |step: &str, status: &str| send_launch_status(&app, &instance_id, step, status);
    let emit_log = |text: &str, level: &str| send_launch_log(&app, &instance_id, text, level);

    emit_progress("FETCHING_METADATA", "Preparing instance environment...");
    let instance = instances::get_instance_by_id(&instance_id)?
        .ok_or_else(|| format!("Instance {instance_id} not found"))?;

    if let Ok(installed_mods) = crate::core::mods::list_installed_mods(&instance_id) {
        for issue in crate::core::dependencies::find_managed_dependency_issues(&installed_mods) {
            emit_log(&format!("Mod requirement warning: {issue}"), "warn");
        }
    }

    let resolution = auth::get_valid_active_account().await?;
    if let Some(warning) = &resolution.warning {
        emit_log(warning, "warn");
    }
    let account = resolution.account;
    emit_log(&format!("Authenticated as: {} ({})", account.username, account.account_type), "info");

    let base_package = meta::fetch_version_package(&instance.minecraft_version).await?;
    emit_log(&format!("Loaded version metadata for Minecraft {}", base_package.id), "info");

    emit_progress("PREPARING_LOADER", &format!("Resolving {} configuration...", instance.loader_type));
    let launch_config = loaders::resolve_instance_launch_configuration(&instance, base_package).await?;
    let resolved_package = launch_config.version_package;
    emit_log(&format!("Configured runtime for loader: {}", instance.loader_type), "info");

    let natives_dir = paths::get_instance_path(&instance.id)
        .join("natives")
        .join(safety::validate_file_name(&resolved_package.id)?);
    let working_dir = paths::get_instance_minecraft_path(&instance.id);
    fs::create_dir_all(&working_dir).map_err(|e| e.to_string())?;

    emit_progress("VERIFYING_LIBRARIES", "Verifying libraries and client jar...");
    let library_progress_app = app.clone();
    let library_progress_instance = instance_id.clone();
    let classpath_jars = prepare_minecraft_libraries(
        &resolved_package,
        &natives_dir,
        launch_config.extra_download_tasks,
        Arc::new(move |done, total| {
            send_launch_progress(
                &library_progress_app,
                &library_progress_instance,
                "DOWNLOADING_LIBRARIES",
                &format!("Verifying libraries: {done}/{total}"),
                Some((done, total)),
            )
        }),
    )
    .await?;
    emit_log(&format!("Verified {} libraries on classpath", classpath_jars.len()), "info");

    emit_progress("VERIFYING_ASSETS", "Verifying game assets...");
    let asset_progress_app = app.clone();
    let asset_progress_instance = instance_id.clone();
    let game_assets_dir = prepare_minecraft_assets(
        &resolved_package.asset_index,
        &working_dir,
        Arc::new(move |done, total| {
            send_launch_progress(
                &asset_progress_app,
                &asset_progress_instance,
                "DOWNLOADING_ASSETS",
                &format!("Verifying assets: {done}/{total}"),
                Some((done, total)),
            )
        }),
    )
    .await?;
    emit_log("All game assets verified successfully", "info");

    emit_progress("BUILDING_ARGUMENTS", "Constructing JVM parameters...");
    let path_sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    let classpath_string = classpath_jars
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<String>>()
        .join(path_sep);

    let (mut jvm_args, game_args, main_class) = build_arguments(
        &instance,
        &resolved_package,
        &account,
        &natives_dir,
        &classpath_string,
        &game_assets_dir,
        quick_play.as_ref(),
    );

    jvm_args.extend(launch_config.extra_jvm_arguments);

    match prepare_logging_configuration(&resolved_package).await {
        Ok(Some(logging_argument)) => {
            jvm_args.push(logging_argument);
            emit_log("Applied Mojang's hardened logging configuration", "info");
        }
        Ok(None) => {}
        Err(error) => emit_log(&format!("Could not apply Mojang's logging configuration: {error}"), "warn"),
    }

    emit_progress("STARTING_JAVA", "Resolving Java runtime for instance...");
    let java_executable = match &instance.java_path {
        Some(p) if !p.is_empty() => p.clone(),
        _ => match java::ensure_java_runtime_with_progress(
            Some(&resolved_package),
            Some(&instance.minecraft_version),
            {
                let java_progress_app = app.clone();
                let java_progress_instance = instance_id.clone();
                move |done, total| {
                    send_launch_progress(
                        &java_progress_app,
                        &java_progress_instance,
                        "DOWNLOADING_LIBRARIES",
                        &format!("Preparing Java runtime: {done}/{total}"),
                        Some((done, total)),
                    )
                }
            },
        )
        .await
        {
            Ok(exe) => exe,
            Err(error) => {
                let fallback = crate::core::system::detect_system_java_path().unwrap_or_else(|| "java".to_string());
                emit_log(
                    &format!("Automatic Java setup failed ({error}). Falling back to system Java: {fallback}"),
                    "warn",
                );
                fallback
            }
        },
    };

    emit_progress("STARTING_JAVA", "Spawning Java Virtual Machine...");
    emit_log(&format!("Executing Java: {java_executable}"), "info");
    emit_log(&format!("Main class: {main_class}"), "info");
    emit_log(&format!("Working directory: {}", working_dir.display()), "info");

    let mut cmd = tokio::process::Command::new(&java_executable);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    cmd.current_dir(&working_dir);
    cmd.args(&jvm_args);
    cmd.arg(&main_class);
    cmd.args(&game_args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn Java: {e}"))?;
    let pid = child.id().unwrap_or(0);

    {
        let mgr = get_process_manager();
        let mut map = mgr.children.lock().await;
        map.insert(instance_id.clone(), RunningProcess { pid, stop_requested: false });
    }

    emit_progress("RUNNING", "Minecraft is running");

    if let Some(stdout) = child.stdout.take() {
        spawn_log_forwarder(app.clone(), instance_id.clone(), stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_log_forwarder(app.clone(), instance_id.clone(), stderr);
    }

    let exit_app = app.clone();
    let exit_instance_id = instance_id.clone();
    let start_time = Instant::now();

    tokio::spawn(async move {
        let _operation_guard = operation_guard;
        let status = child.wait().await;
        let stop_requested = {
            let mgr = get_process_manager();
            let mut map = mgr.children.lock().await;
            map.remove(&exit_instance_id)
                .map(|process| process.stop_requested)
                .unwrap_or(false)
        };

        let duration_secs = start_time.elapsed().as_secs();
        let exit_code = status.ok().and_then(|s| s.code());

        if stop_requested {
            send_launch_log(
                &exit_app,
                &exit_instance_id,
                &format!("Minecraft was stopped (Duration: {duration_secs}s)"),
                "info",
            );
            send_launch_status(&exit_app, &exit_instance_id, "CANCELLED", "Game stopped");
        } else if exit_code == Some(0) {
            send_launch_log(
                &exit_app,
                &exit_instance_id,
                &format!("Minecraft process completed cleanly (Duration: {duration_secs}s)"),
                "info",
            );
            send_launch_status(&exit_app, &exit_instance_id, "COMPLETED", "Game closed");
        } else {
            let code_text = exit_code
                .map(|code| code.to_string())
                .unwrap_or_else(|| "unknown (terminated by a signal)".to_string());
            send_launch_log(
                &exit_app,
                &exit_instance_id,
                &format!("Minecraft process exited with code {code_text}"),
                "error",
            );
            send_launch_status(
                &exit_app,
                &exit_instance_id,
                "CRASHED",
                &format!("Game closed with code {code_text}"),
            );
        }

        let _ = instances::record_play_session(&exit_instance_id, duration_secs);

        if exit_code == Some(0) && !stop_requested {
            let backup_after_play = crate::core::recovery::get_recovery_settings(&exit_instance_id)
                .map(|settings| settings.backup_after_play)
                .unwrap_or(false);
            if backup_after_play {
                let backup_instance_id = exit_instance_id.clone();
                let outcome = tokio::task::spawn_blocking(move || crate::core::recovery::create_saves_backup(&backup_instance_id))
                    .await
                    .map_err(|e| e.to_string())
                    .and_then(|result| result);
                match outcome {
                    Ok(_) => send_launch_log(&exit_app, &exit_instance_id, "World saves backed up after game exit", "info"),
                    Err(error) => send_launch_log(&exit_app, &exit_instance_id, &format!("Automatic backup failed: {error}"), "warn"),
                }
            }
        }
    });

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logging_configuration_keeps_lookup_protection_and_plain_console_output() {
        let official = r#"<Console name="SysOut" target="SYSTEM_OUT"><LegacyXMLLayout /></Console><PatternLayout pattern="[%d{HH:mm:ss}] [%t/%level]: %msg{nolookups}%n" />"#;
        let converted = convert_logging_configuration_for_console(official);
        assert!(!converted.contains("XMLLayout"));
        assert_eq!(converted.matches("%msg{nolookups}").count(), 2);
    }

    fn library(name: &str, rules: Option<Vec<LibraryRule>>) -> LibraryDownload {
        LibraryDownload {
            name: name.to_string(),
            url: None,
            downloads: None,
            rules,
            natives: None,
            extract: None,
        }
    }

    fn os_rule(action: &str, name: Option<&str>, arch: Option<&str>) -> LibraryRule {
        LibraryRule {
            action: action.to_string(),
            os: Some(crate::core::meta::LibraryRuleOs {
                name: name.map(str::to_string),
                version: None,
                arch: arch.map(str::to_string),
            }),
            features: None,
        }
    }

    #[test]
    fn rules_respect_os_and_architecture() {
        let other_os = if current_os_name() == "windows" { "osx" } else { "windows" };
        assert!(is_rule_allowed(Some(&[os_rule("allow", Some(current_os_name()), None)])));
        assert!(!is_rule_allowed(Some(&[os_rule("allow", Some(other_os), None)])));
        assert!(is_rule_allowed(Some(&[
            LibraryRule { action: "allow".into(), os: None, features: None },
            os_rule("disallow", Some(other_os), None),
        ])));
        if cfg!(target_pointer_width = "64") {
            assert!(!is_rule_allowed(Some(&[os_rule("allow", None, Some("x86"))])));
        }
    }

    #[test]
    fn later_libraries_replace_earlier_versions_and_keep_position() {
        let selected = select_active_libraries(&[
            library("org.ow2.asm:asm:9.3", None),
            library("com.mojang:brigadier:1.0.18", None),
            library("org.lwjgl:lwjgl:3.3.3:natives-windows", None),
            library("org.ow2.asm:asm:9.7.1", None),
            library("org.lwjgl:lwjgl:3.3.3", None),
        ]);
        let names: Vec<&str> = selected.iter().map(|lib| lib.name.as_str()).collect();
        assert_eq!(
            names,
            vec![
                "org.ow2.asm:asm:9.7.1",
                "com.mojang:brigadier:1.0.18",
                "org.lwjgl:lwjgl:3.3.3:natives-windows",
                "org.lwjgl:lwjgl:3.3.3",
            ]
        );
    }

    #[test]
    fn log_lines_survive_invalid_utf8() {
        assert_eq!(decode_log_line(b"[main/INFO]: caf\xe9 ok\r\n"), "[main/INFO]: caf\u{FFFD} ok");
        assert_eq!(decode_log_line(b"plain"), "plain");
    }

    #[tokio::test]
    #[ignore]
    async fn vanilla_launch_smoke_test() {
        let version = std::env::var("SMOKE_MC_VERSION").unwrap_or_else(|_| "1.21.1".to_string());
        let instance = instances::create_new_instance(instances::CreateInstancePayload {
            name: "launch smoke test".to_string(),
            minecraft_version: Some(version.clone()),
            loader_type: std::env::var("SMOKE_MC_LOADER").ok(),
            loader_version: None,
            ram_allocation_megabytes: Some(2048),
            java_path: None,
            jvm_arguments: None,
            icon: None,
            group: None,
            is_favorite: None,
        })
        .unwrap();
        let instance_root = paths::get_instance_path(&instance.id);

        let outcome = async {
            let base_package = meta::fetch_version_package(&version).await?;
            let launch_config = loaders::resolve_instance_launch_configuration(&instance, base_package).await?;
            let package = launch_config.version_package;
            let natives_dir = instance_root.join("natives").join(&package.id);
            let working_dir = paths::get_instance_minecraft_path(&instance.id);
            let classpath = prepare_minecraft_libraries(&package, &natives_dir, launch_config.extra_download_tasks, Arc::new(|_, _| {})).await?;
            let game_assets_dir = prepare_minecraft_assets(&package.asset_index, &working_dir, Arc::new(|_, _| {})).await?;
            let separator = if cfg!(target_os = "windows") { ";" } else { ":" };
            let classpath_string = classpath
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join(separator);
            let account = StoredAccount {
                id: "offline-smoke".into(),
                username: "SmokeTest".into(),
                uuid: auth::generate_offline_player_uuid("SmokeTest"),
                account_type: "offline".into(),
                access_token: "0".into(),
                refresh_token: None,
                expires_at: u64::MAX,
                skin_url: None,
                created_at: String::new(),
            };
            let (mut jvm_args, game_args, main_class) =
                build_arguments(&instance, &package, &account, &natives_dir, &classpath_string, &game_assets_dir, None);
            jvm_args.extend(launch_config.extra_jvm_arguments);
            if let Some(logging_argument) = prepare_logging_configuration(&package).await? {
                jvm_args.push(logging_argument);
            }
            let java_executable = java::ensure_java_runtime(Some(&package), Some(&version)).await?;
            let mut command = tokio::process::Command::new(&java_executable);
            command
                .current_dir(&working_dir)
                .args(&jvm_args)
                .arg(&main_class)
                .args(&game_args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true);
            let mut child = command.spawn().map_err(|e| e.to_string())?;
            let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
            let mut collected = Vec::new();
            let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(120);
            while let Ok(Ok(Some(line))) = tokio::time::timeout_at(deadline, lines.next_line()).await {
                let reached_game = line.contains("Setting user: SmokeTest")
                    || line.contains("Backend library")
                    || line.contains("OpenAL initialized");
                collected.push(line);
                if reached_game && collected.len() > 3 {
                    break;
                }
            }
            let _ = child.kill().await;
            Ok::<Vec<String>, String>(collected)
        }
        .await;

        let _ = std::fs::remove_dir_all(&instance_root);
        let lines = outcome.unwrap();
        assert!(
            lines.iter().any(|line| line.contains("SmokeTest") || line.contains("Backend library") || line.contains("OpenAL initialized")),
            "{lines:#?}"
        );
        assert!(!lines.iter().any(|line| line.contains("<log4j:Event")), "{lines:#?}");
    }
}
