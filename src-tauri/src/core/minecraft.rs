use crate::core::instances::{self, InstanceConfiguration};
use crate::core::java;
use crate::core::loaders::{self, DownloadTask};
use crate::core::meta::{self, AssetIndexInfo, LibraryDownload, LibraryRule, VersionPackage};
use crate::core::paths;
use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{Mutex, Semaphore};
use tokio::task::JoinSet;

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

pub struct ActiveProcessManager {
    children: Mutex<HashMap<String, u32>>,
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
    if let Some(pid) = map.remove(instance_id) {
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("taskkill")
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
    } else {
        false
    }
}

fn is_rule_allowed(rules: Option<&[LibraryRule]>) -> bool {
    let current_os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    };

    let rules = match rules {
        Some(r) if !r.is_empty() => r,
        _ => return true,
    };

    let mut allowed = false;
    for rule in rules {
        let os_match = match &rule.os {
            Some(os) => os.name.as_deref() == Some(current_os),
            None => true,
        };

        if os_match {
            if rule.action == "allow" {
                allowed = true;
            } else if rule.action == "disallow" {
                allowed = false;
            }
        }
    }
    allowed
}

fn resolve_native_classifier_key(library: &LibraryDownload) -> Option<String> {
    let natives_map = library.natives.as_ref()?;
    let os_key = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    };
    let native_key = natives_map.get(os_key)?;
    let arch_str = if cfg!(target_arch = "x86_64") || cfg!(target_arch = "aarch64") {
        "64"
    } else {
        "32"
    };
    Some(native_key.replace("${arch}", arch_str))
}

fn extract_native_libraries(jar_path: &Path, natives_dir: &Path) -> Result<(), String> {
    let file = fs::File::open(jar_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        if name.starts_with("META-INF") || file.is_dir() {
            continue;
        }
        let outpath = natives_dir.join(
            Path::new(&name)
                .file_name()
                .unwrap_or_else(|| Path::new(&name).as_os_str()),
        );
        let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
        std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn download_file_with_verify(
    client: &reqwest::Client,
    task: &DownloadTask,
) -> Result<(), String> {
    if task.destination.exists() {
        if let Some(expected_sha1) = &task.sha1 {
            if let Ok(bytes) = fs::read(&task.destination) {
                let mut hasher = Sha1::new();
                hasher.update(&bytes);
                let actual = format!("{:x}", hasher.finalize());
                if actual.eq_ignore_ascii_case(expected_sha1) {
                    return Ok(());
                }
            }
        } else {
            return Ok(());
        }
    }

    if let Some(parent) = task.destination.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let resp = client
        .get(&task.url)
        .header(USER_AGENT, "ScriptLauncher/0.18.2")
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {e}", task.url))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed with HTTP {} for {}", resp.status(), task.url));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    if let Some(expected_sha1) = &task.sha1 {
        let mut hasher = Sha1::new();
        hasher.update(&bytes);
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected_sha1) {
            return Err(format!(
                "Checksum mismatch for {}: expected {expected_sha1}, got {actual}",
                task.destination.display()
            ));
        }
    }

    fs::write(&task.destination, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}

async fn download_batch(tasks: Vec<DownloadTask>, concurrency: usize) -> Result<(), String> {
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let client = reqwest::Client::new();
    let mut set = JoinSet::new();

    for task in tasks {
        let sem = semaphore.clone();
        let client_clone = client.clone();
        set.spawn(async move {
            let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
            download_file_with_verify(&client_clone, &task).await
        });
    }

    while let Some(res) = set.join_next().await {
        match res {
            Ok(Ok(())) => {}
            Ok(Err(e)) => return Err(e),
            Err(e) => return Err(e.to_string()),
        }
    }

    Ok(())
}

async fn prepare_minecraft_libraries(
    version_package: &VersionPackage,
    natives_dir: &Path,
    extra_download_tasks: Vec<DownloadTask>,
) -> Result<Vec<PathBuf>, String> {
    let libraries_root = paths::get_libraries_directory();
    fs::create_dir_all(&libraries_root).map_err(|e| e.to_string())?;
    fs::create_dir_all(natives_dir).map_err(|e| e.to_string())?;

    let mut download_tasks: Vec<DownloadTask> = Vec::new();
    let mut classpath_jars: Vec<PathBuf> = Vec::new();
    let mut native_jars_to_extract: Vec<PathBuf> = Vec::new();

    for library in &version_package.libraries {
        if !is_rule_allowed(library.rules.as_deref()) {
            continue;
        }

        if let Some(downloads) = &library.downloads {
            if let Some(artifact) = &downloads.artifact {
                let relative_path = artifact.path.clone().unwrap_or_else(|| {
                    loaders::convert_maven_coordinate_to_path(&library.name, None, "jar")
                        .unwrap_or_else(|_| library.name.clone())
                });
                let dest = libraries_root.join(relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
                download_tasks.push(DownloadTask {
                    url: artifact.url.clone(),
                    destination: dest.clone(),
                    sha1: Some(artifact.sha1.clone()),
                    size: Some(artifact.size),
                });
                if !classpath_jars.contains(&dest) {
                    classpath_jars.push(dest);
                }
            }
        } else if let Some(url) = &library.url {
            if let Ok(rel_path) = loaders::convert_maven_coordinate_to_path(&library.name, None, "jar") {
                let dest = libraries_root.join(rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
                let base = if url.ends_with('/') { url.clone() } else { format!("{url}/") };
                download_tasks.push(DownloadTask {
                    url: format!("{base}{rel_path}"),
                    destination: dest.clone(),
                    sha1: None,
                    size: None,
                });
                if !classpath_jars.contains(&dest) {
                    classpath_jars.push(dest);
                }
            }
        } else if let Ok(rel_path) = loaders::convert_maven_coordinate_to_path(&library.name, None, "jar") {
            let dest = libraries_root.join(rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if !classpath_jars.contains(&dest) {
                classpath_jars.push(dest);
            }
        }

        if let Some(native_key) = resolve_native_classifier_key(library) {
            if let Some(downloads) = &library.downloads {
                if let Some(classifiers) = &downloads.classifiers {
                    if let Some(native_art) = classifiers.get(&native_key) {
                        let rel_path = native_art.path.clone().unwrap_or_else(|| {
                            loaders::convert_maven_coordinate_to_path(&library.name, Some(&native_key), "jar")
                                .unwrap_or_else(|_| library.name.clone())
                        });
                        let dest = libraries_root.join(rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
                        download_tasks.push(DownloadTask {
                            url: native_art.url.clone(),
                            destination: dest.clone(),
                            sha1: Some(native_art.sha1.clone()),
                            size: Some(native_art.size),
                        });
                        if !native_jars_to_extract.contains(&dest) {
                            native_jars_to_extract.push(dest);
                        }
                    }
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
        sha1: Some(client_download.sha1.clone()),
        size: Some(client_download.size),
    });
    if !classpath_jars.contains(&client_jar_path) {
        classpath_jars.push(client_jar_path);
    }

    download_batch(download_tasks, 12).await?;

    for native_jar in native_jars_to_extract {
        let _ = extract_native_libraries(&native_jar, natives_dir);
    }

    Ok(classpath_jars)
}

#[derive(Debug, Deserialize)]
struct AssetIndexMap {
    objects: HashMap<String, AssetIndexObject>,
}

#[derive(Debug, Deserialize)]
struct AssetIndexObject {
    hash: String,
    size: u64,
}

async fn prepare_minecraft_assets(asset_index_info: &AssetIndexInfo) -> Result<(), String> {
    let assets_root = paths::get_assets_directory();
    let indexes_dir = assets_root.join("indexes");
    let objects_dir = assets_root.join("objects");

    fs::create_dir_all(&indexes_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&objects_dir).map_err(|e| e.to_string())?;

    let index_file_path = indexes_dir.join(format!("{}.json", asset_index_info.id));
    let client = reqwest::Client::new();

    if !index_file_path.exists() {
        let task = DownloadTask {
            url: asset_index_info.url.clone(),
            destination: index_file_path.clone(),
            sha1: Some(asset_index_info.sha1.clone()),
            size: Some(asset_index_info.size),
        };
        download_file_with_verify(&client, &task).await?;
    }

    let content = fs::read_to_string(&index_file_path).map_err(|e| e.to_string())?;
    let index_map: AssetIndexMap = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let mut download_tasks: Vec<DownloadTask> = Vec::new();
    let mut seen_hashes: HashSet<String> = HashSet::new();

    for obj in index_map.objects.values() {
        if seen_hashes.insert(obj.hash.clone()) {
            let prefix = &obj.hash[..2];
            let dest = objects_dir.join(prefix).join(&obj.hash);
            download_tasks.push(DownloadTask {
                url: format!("{ASSETS_RESOURCE_ROOT_URL}/{prefix}/{}", obj.hash),
                destination: dest,
                sha1: Some(obj.hash.clone()),
                size: Some(obj.size),
            });
        }
    }

    download_batch(download_tasks, 16).await?;
    Ok(())
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
    username: &str,
    uuid: &str,
    natives_dir: &Path,
    classpath_string: &str,
    quick_play: Option<&QuickPlayLaunchOptions>,
) -> (Vec<String>, Vec<String>, String) {
    let path_sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    let mc_dir = paths::get_instance_minecraft_path(&instance.id);
    let assets_dir = paths::get_assets_directory();

    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("${auth_player_name}", username.to_string());
    vars.insert("${auth_uuid}", uuid.to_string());
    vars.insert("${auth_access_token}", "offline".to_string());
    vars.insert("${user_type}", "mojang".to_string());
    vars.insert("${version_name}", instance.minecraft_version.clone());
    vars.insert("${version_type}", "release".to_string());
    vars.insert("${game_directory}", mc_dir.to_string_lossy().to_string());
    vars.insert("${assets_root}", assets_dir.to_string_lossy().to_string());
    vars.insert("${assets_index_name}", version_package.asset_index.id.clone());
    vars.insert("${natives_directory}", natives_dir.to_string_lossy().to_string());
    vars.insert("${classpath}", classpath_string.to_string());
    vars.insert("${classpath_separator}", path_sep.to_string());
    vars.insert("${clientid}", uuid.to_string());
    vars.insert("${auth_xuid}", uuid.to_string());

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
        jvm_args.push("-Dminecraft.launcher.version=0.18.2".to_string());
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
        if qp.target_type == "server" {
            if let Some(host) = &qp.host {
                let port_str = qp.port.unwrap_or(25565);
                game_args.push("--quickPlayMultiplayer".to_string());
                game_args.push(format!("{host}:{port_str}"));
            }
        } else if qp.target_type == "world" {
            if let Some(wf) = &qp.world_folder {
                game_args.push("--quickPlaySingleplayer".to_string());
                game_args.push(wf.clone());
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
    if is_instance_running(&instance_id).await {
        return Err("This instance is already running.".to_string());
    }

    let emit_progress = |step: &str, status: &str, current: Option<u64>, total: Option<u64>, pct: Option<u32>| {
        let _ = app.emit(
            "launch:status",
            LaunchProgressEvent {
                instance_id: instance_id.clone(),
                step: step.to_string(),
                status_text: status.to_string(),
                current_items: current,
                total_items: total,
                percentage: pct,
            },
        );
    };

    let emit_log = |text: &str, level: &str| {
        let _ = app.emit(
            "launch:log",
            LaunchLogEvent {
                instance_id: instance_id.clone(),
                text: text.to_string(),
                level: level.to_string(),
                timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
            },
        );
    };

    emit_progress("FETCHING_METADATA", "Preparing instance environment...", None, None, None);
    let instance = instances::get_instance_by_id(&instance_id)?
        .ok_or_else(|| format!("Instance {instance_id} not found"))?;

    let username = "Player";
    let uuid = "00000000-0000-0000-0000-000000000000";
    emit_log(&format!("Authenticated as: {username} (offline)"), "info");

    let base_package = meta::fetch_version_package(&instance.minecraft_version).await?;
    emit_log(&format!("Loaded version metadata for Minecraft {}", base_package.id), "info");

    emit_progress("PREPARING_LOADER", &format!("Resolving {} configuration...", instance.loader_type), None, None, None);
    let launch_config = loaders::resolve_instance_launch_configuration(&instance, base_package).await?;
    let resolved_package = launch_config.version_package;
    emit_log(&format!("Configured runtime for loader: {}", instance.loader_type), "info");

    let natives_dir = paths::get_instance_path(&instance.id).join("natives");

    emit_progress("VERIFYING_LIBRARIES", "Verifying libraries and client jar...", None, None, None);
    let classpath_jars = prepare_minecraft_libraries(
        &resolved_package,
        &natives_dir,
        launch_config.extra_download_tasks,
    )
    .await?;
    emit_log(&format!("Verified {} libraries on classpath", classpath_jars.len()), "info");

    emit_progress("VERIFYING_ASSETS", "Verifying game assets...", None, None, None);
    prepare_minecraft_assets(&resolved_package.asset_index).await?;
    emit_log("All game assets verified successfully", "info");

    emit_progress("BUILDING_ARGUMENTS", "Constructing JVM parameters...", None, None, None);
    let path_sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    let classpath_string = classpath_jars
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<String>>()
        .join(path_sep);

    let (mut jvm_args, game_args, main_class) = build_arguments(
        &instance,
        &resolved_package,
        username,
        uuid,
        &natives_dir,
        &classpath_string,
        quick_play.as_ref(),
    );

    jvm_args.extend(launch_config.extra_jvm_arguments);

    emit_progress("STARTING_JAVA", "Resolving Java runtime for instance...", None, None, None);
    let java_executable = match &instance.java_path {
        Some(p) if !p.is_empty() => p.clone(),
        _ => match java::ensure_java_runtime(Some(&resolved_package), Some(&instance.minecraft_version)).await {
            Ok(exe) => exe,
            Err(_) => "java".to_string(),
        },
    };

    let working_dir = paths::get_instance_minecraft_path(&instance.id);
    emit_progress("STARTING_JAVA", "Spawning Java Virtual Machine...", None, None, None);
    emit_log(&format!("Executing Java: {java_executable}"), "info");
    emit_log(&format!("Main class: {main_class}"), "info");
    emit_log(&format!("Working directory: {}", working_dir.display()), "info");

    let mut cmd = tokio::process::Command::new(&java_executable);
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
        map.insert(instance_id.clone(), pid);
    }

    emit_progress("RUNNING", "Minecraft is running", None, None, None);

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_clone_1 = app.clone();
    let inst_id_1 = instance_id.clone();
    if let Some(out) = stdout {
        tokio::spawn(async move {
            let mut reader = BufReader::new(out).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let level = determine_log_level(&line);
                let _ = app_clone_1.emit(
                    "launch:log",
                    LaunchLogEvent {
                        instance_id: inst_id_1.clone(),
                        text: line,
                        level: level.to_string(),
                        timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
                    },
                );
            }
        });
    }

    let app_clone_2 = app.clone();
    let inst_id_2 = instance_id.clone();
    if let Some(err) = stderr {
        tokio::spawn(async move {
            let mut reader = BufReader::new(err).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let level = determine_log_level(&line);
                let _ = app_clone_2.emit(
                    "launch:log",
                    LaunchLogEvent {
                        instance_id: inst_id_2.clone(),
                        text: line,
                        level: level.to_string(),
                        timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
                    },
                );
            }
        });
    }

    let app_clone_3 = app.clone();
    let inst_id_3 = instance_id.clone();
    let start_time = Instant::now();

    tokio::spawn(async move {
        let status = child.wait().await;
        {
            let mgr = get_process_manager();
            let mut map = mgr.children.lock().await;
            map.remove(&inst_id_3);
        }

        let duration_secs = start_time.elapsed().as_secs();
        let exit_code = status.map(|s| s.code().unwrap_or(0)).unwrap_or(-1);

        if exit_code == 0 {
            let _ = app_clone_3.emit(
                "launch:log",
                LaunchLogEvent {
                    instance_id: inst_id_3.clone(),
                    text: format!("Minecraft process completed cleanly (Duration: {duration_secs}s)"),
                    level: "info".to_string(),
                    timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
                },
            );
            let _ = app_clone_3.emit(
                "launch:status",
                LaunchProgressEvent {
                    instance_id: inst_id_3.clone(),
                    step: "COMPLETED".to_string(),
                    status_text: "Game closed".to_string(),
                    current_items: None,
                    total_items: None,
                    percentage: None,
                },
            );
        } else {
            let _ = app_clone_3.emit(
                "launch:log",
                LaunchLogEvent {
                    instance_id: inst_id_3.clone(),
                    text: format!("Minecraft process exited with code {exit_code}"),
                    level: "error".to_string(),
                    timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
                },
            );
            let _ = app_clone_3.emit(
                "launch:status",
                LaunchProgressEvent {
                    instance_id: inst_id_3.clone(),
                    step: "CRASHED".to_string(),
                    status_text: format!("Game closed with code {exit_code}"),
                    current_items: None,
                    total_items: None,
                    percentage: None,
                },
            );
        }

        if let Ok(Some(inst)) = instances::get_instance_by_id(&inst_id_3) {
            let session_mins = (duration_secs / 60).max(1);
            let total_mins = if duration_secs >= 10 {
                inst.total_play_time_minutes + session_mins
            } else {
                inst.total_play_time_minutes
            };

            let _ = instances::update_instance(instances::UpdateInstancePayload {
                id: inst_id_3,
                name: None,
                minecraft_version: None,
                loader_type: None,
                loader_version: None,
                java_path: None,
                jvm_arguments: None,
                ram_allocation_megabytes: None,
                icon: None,
                group: None,
                is_favorite: None,
                last_played_at: Some(chrono::Utc::now().to_rfc3339()),
                total_play_time_minutes: Some(total_mins),
            });
        }
    });

    Ok(true)
}
