use crate::core::download::{self, Checksum};
use crate::core::instances::{self, InstanceConfiguration};
use crate::core::meta;
use crate::core::net;
use crate::core::paths;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

const LOOKUP_FOLDERS: [&str; 3] = ["mods", "resourcepacks", "shaderpacks"];
const OVERRIDE_FOLDERS: [&str; 10] = [
    "mods",
    "resourcepacks",
    "shaderpacks",
    "config",
    "defaultconfigs",
    "kubejs",
    "scripts",
    "datapacks",
    "global_packs",
    "openloader",
];
const OVERRIDE_FILES: [&str; 3] = ["options.txt", "optionsof.txt", "servers.dat"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackExportResult {
    pub output_path: String,
    pub linked_files: usize,
    pub bundled_files: usize,
}

struct CandidateFile {
    relative_path: String,
    sha1: String,
    sha512: String,
    size: u64,
}

fn loader_dependency_key(loader: &str) -> Option<&'static str> {
    match loader {
        "fabric" => Some("fabric-loader"),
        "quilt" => Some("quilt-loader"),
        "forge" => Some("forge"),
        "neoforge" => Some("neoforge"),
        _ => None,
    }
}

fn collect_candidates(minecraft_dir: &Path) -> Result<Vec<CandidateFile>, String> {
    let mut candidates = Vec::new();
    for folder in LOOKUP_FOLDERS {
        let Ok(entries) = fs::read_dir(minecraft_dir.join(folder)) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let is_archive = name.ends_with(".jar") || name.ends_with(".zip");
            if !path.is_file() || !is_archive {
                continue;
            }
            candidates.push(CandidateFile {
                relative_path: format!("{folder}/{name}"),
                sha1: download::hash_file(&path, &Checksum::Sha1(String::new())).map_err(|e| e.to_string())?,
                sha512: download::hash_file(&path, &Checksum::Sha512(String::new())).map_err(|e| e.to_string())?,
                size: entry.metadata().map(|m| m.len()).unwrap_or(0),
            });
        }
    }
    Ok(candidates)
}

async fn lookup_modrinth_urls(hashes: Vec<String>) -> Result<HashMap<String, String>, String> {
    let mut urls = HashMap::new();
    if hashes.is_empty() {
        return Ok(urls);
    }
    let body = serde_json::json!({ "hashes": hashes, "algorithm": "sha512" });
    let response = net::send_with_retry(|| {
        net::http_client()
            .post("https://api.modrinth.com/v2/version_files")
            .json(&body)
    })
    .await?;
    if !response.status().is_success() {
        return Err(format!("Modrinth file lookup failed: HTTP {}", response.status()));
    }
    let versions: HashMap<String, serde_json::Value> = response.json().await.map_err(|e| e.to_string())?;
    for (hash, version) in versions {
        let matching_url = version
            .get("files")
            .and_then(|files| files.as_array())
            .and_then(|files| {
                files.iter().find(|file| {
                    file.get("hashes")
                        .and_then(|h| h.get("sha512"))
                        .and_then(|value| value.as_str())
                        .is_some_and(|value| value.eq_ignore_ascii_case(&hash))
                })
            })
            .and_then(|file| file.get("url"))
            .and_then(|url| url.as_str());
        if let Some(url) = matching_url {
            urls.insert(hash.to_lowercase(), url.to_string());
        }
    }
    Ok(urls)
}

async fn resolve_loader_version(instance: &InstanceConfiguration) -> Result<Option<String>, String> {
    if instance.loader_type == "vanilla" {
        return Ok(None);
    }
    if let Some(version) = instance.loader_version.clone().filter(|v| !v.is_empty()) {
        return Ok(Some(version));
    }
    let versions = meta::get_compatible_loader_versions(&instance.loader_type, &instance.minecraft_version).await?;
    versions
        .into_iter()
        .next()
        .map(Some)
        .ok_or_else(|| format!("No {} version found for Minecraft {}", instance.loader_type, instance.minecraft_version))
}

fn add_file_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    archive_name: &str,
    source: &Path,
    options: SimpleFileOptions,
) -> Result<(), String> {
    zip.start_file(archive_name, options).map_err(|e| e.to_string())?;
    let mut file = fs::File::open(source).map_err(|e| e.to_string())?;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        zip.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn add_directory_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    source_root: &Path,
    archive_prefix: &str,
    skip: &dyn Fn(&str) -> bool,
    options: SimpleFileOptions,
) -> Result<usize, String> {
    let mut added = 0;
    let mut stack = vec![source_root.to_path_buf()];
    while let Some(directory) = stack.pop() {
        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let relative = path
                .strip_prefix(source_root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            let archive_name = format!("{archive_prefix}/{relative}");
            if path.is_dir() {
                stack.push(path);
            } else if path.is_file() && !skip(&archive_name) {
                add_file_to_zip(zip, &archive_name, &path, options)?;
                added += 1;
            }
        }
    }
    Ok(added)
}

pub async fn export_instance_as_mrpack(instance_id: &str, output_path: &str) -> Result<ModpackExportResult, String> {
    let instance = instances::get_instance_by_id(instance_id)?.ok_or("Instance not found")?;
    let minecraft_dir = paths::get_instance_minecraft_path(instance_id);
    let output = PathBuf::from(output_path);
    if output.extension().and_then(|ext| ext.to_str()) != Some("mrpack") {
        return Err("Choose a file name ending in .mrpack".to_string());
    }

    let scan_dir = minecraft_dir.clone();
    let candidates = tokio::task::spawn_blocking(move || collect_candidates(&scan_dir))
        .await
        .map_err(|e| e.to_string())??;
    let urls = lookup_modrinth_urls(candidates.iter().map(|c| c.sha512.clone()).collect()).await?;
    let loader_version = resolve_loader_version(&instance).await?;

    let mut dependencies = serde_json::Map::new();
    dependencies.insert("minecraft".to_string(), serde_json::json!(instance.minecraft_version));
    if let (Some(key), Some(version)) = (loader_dependency_key(&instance.loader_type), loader_version) {
        dependencies.insert(key.to_string(), serde_json::json!(version));
    }

    let mut linked = Vec::new();
    for candidate in &candidates {
        if let Some(url) = urls.get(&candidate.sha512.to_lowercase()) {
            linked.push(serde_json::json!({
                "path": candidate.relative_path,
                "hashes": { "sha1": candidate.sha1, "sha512": candidate.sha512 },
                "env": { "client": "required", "server": "required" },
                "downloads": [url],
                "fileSize": candidate.size,
            }));
        }
    }

    let index = serde_json::json!({
        "formatVersion": 1,
        "game": "minecraft",
        "versionId": chrono::Local::now().format("%Y.%m.%d").to_string(),
        "name": instance.name,
        "summary": format!("Exported from Script Minecraft Launcher {}", net::LAUNCHER_VERSION),
        "files": linked,
        "dependencies": dependencies,
    });

    let linked_paths: std::collections::HashSet<String> = candidates
        .iter()
        .filter(|candidate| urls.contains_key(&candidate.sha512.to_lowercase()))
        .map(|candidate| format!("overrides/{}", candidate.relative_path))
        .collect();
    let linked_count = linked_paths.len();
    let output_for_writer = output.clone();
    let bundled_files = tokio::task::spawn_blocking(move || -> Result<usize, String> {
        if let Some(parent) = output_for_writer.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let temporary = output_for_writer.with_extension("mrpack.part");
        let file = fs::File::create(&temporary).map_err(|e| e.to_string())?;
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("modrinth.index.json", options).map_err(|e| e.to_string())?;
        zip.write_all(serde_json::to_string_pretty(&index).map_err(|e| e.to_string())?.as_bytes())
            .map_err(|e| e.to_string())?;

        let skip = |archive_name: &str| {
            linked_paths.contains(archive_name)
                || archive_name.ends_with(".disabled")
                || archive_name.ends_with(".mod-identity-cache.json")
        };
        let mut bundled = 0;
        for folder in OVERRIDE_FOLDERS {
            let source = minecraft_dir.join(folder);
            if source.is_dir() {
                bundled += add_directory_to_zip(&mut zip, &source, &format!("overrides/{folder}"), &skip, options)?;
            }
        }
        for name in OVERRIDE_FILES {
            let source = minecraft_dir.join(name);
            if source.is_file() {
                add_file_to_zip(&mut zip, &format!("overrides/{name}"), &source, options)?;
                bundled += 1;
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
        fs::rename(&temporary, &output_for_writer).map_err(|e| e.to_string())?;
        Ok(bundled)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(ModpackExportResult {
        output_path: output.to_string_lossy().to_string(),
        linked_files: linked_count,
        bundled_files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn live_export_round_trips_through_inspect() {
        let instance_id = std::env::var("EXPORT_INSTANCE").unwrap();
        let output = std::env::temp_dir().join(format!("script-launcher-export-{}.mrpack", std::process::id()));
        let result = export_instance_as_mrpack(&instance_id, &output.to_string_lossy()).await.unwrap();
        println!("linked {}, bundled {}", result.linked_files, result.bundled_files);
        let manifest = crate::core::modpacks::inspect_modpack(&output.to_string_lossy()).unwrap();
        println!("{} | {} {:?}", manifest.name, manifest.loader_type, manifest.loader_version);
        assert!(result.linked_files > 0);
        let original_jars = fs::read_dir(paths::get_instance_minecraft_path(&instance_id).join("mods"))
            .unwrap()
            .flatten()
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".jar"))
            .count();
        let imported = crate::core::modpacks::import_modpack(&output.to_string_lossy(), Some("export round trip".into()), |_| {})
            .await
            .unwrap();
        let imported_jars = fs::read_dir(paths::get_instance_minecraft_path(&imported.id).join("mods"))
            .unwrap()
            .flatten()
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".jar"))
            .count();
        let _ = fs::remove_dir_all(paths::get_instance_path(&imported.id));
        println!("original jars {original_jars}, imported jars {imported_jars}");
        assert_eq!(original_jars, imported_jars);
        fs::remove_file(output).unwrap();
    }
}
