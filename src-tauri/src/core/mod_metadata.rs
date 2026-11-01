use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmbeddedModMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
}

fn read_entry(archive: &mut zip::ZipArchive<std::fs::File>, name: &str) -> Option<String> {
    let mut entry = archive.by_name(name).ok()?;
    let mut text = String::new();
    entry.read_to_string(&mut text).ok()?;
    Some(text)
}

fn concrete_version(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|version| !version.is_empty() && !version.contains("${"))
        .map(str::to_string)
}

fn toml_string_value(line: &str, key: &str) -> Option<String> {
    let (left, right) = line.split_once('=')?;
    if left.trim() != key {
        return None;
    }
    let value = right.trim();
    let quote = value.chars().next().filter(|c| *c == '"' || *c == '\'')?;
    let inner = &value[1..];
    let end = inner.find(quote)?;
    Some(inner[..end].to_string())
}

pub fn parse_mods_toml(text: &str) -> Option<EmbeddedModMetadata> {
    let mut in_first_mod = false;
    let mut id = None;
    let mut name = None;
    let mut version = None;
    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.starts_with('[') {
            if in_first_mod {
                break;
            }
            let header = line.split('#').next().unwrap_or("").trim();
            in_first_mod = header == "[[mods]]";
            continue;
        }
        if !in_first_mod {
            continue;
        }
        id = id.or_else(|| toml_string_value(line, "modId"));
        name = name.or_else(|| toml_string_value(line, "displayName"));
        version = version.or_else(|| toml_string_value(line, "version"));
    }
    let id = id?;
    Some(EmbeddedModMetadata {
        name: name.unwrap_or_else(|| id.clone()),
        version: concrete_version(version.as_deref()).unwrap_or_else(|| "custom".to_string()),
        id,
    })
}

fn manifest_version(archive: &mut zip::ZipArchive<std::fs::File>) -> Option<String> {
    let manifest = read_entry(archive, "META-INF/MANIFEST.MF")?;
    manifest.lines().find_map(|line| {
        line.strip_prefix("Implementation-Version:")
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

pub fn read_embedded_metadata(jar_path: &Path) -> Option<EmbeddedModMetadata> {
    let file = std::fs::File::open(jar_path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    if let Some(text) = read_entry(&mut archive, "fabric.mod.json") {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
                return Some(EmbeddedModMetadata {
                    id: id.to_string(),
                    name: json.get("name").and_then(|v| v.as_str()).unwrap_or(id).to_string(),
                    version: concrete_version(json.get("version").and_then(|v| v.as_str()))
                        .unwrap_or_else(|| "custom".to_string()),
                });
            }
        }
    }

    if let Some(text) = read_entry(&mut archive, "quilt.mod.json") {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
            let loader = json.get("quilt_loader");
            if let Some(id) = loader.and_then(|l| l.get("id")).and_then(|v| v.as_str()) {
                return Some(EmbeddedModMetadata {
                    id: id.to_string(),
                    name: loader
                        .and_then(|l| l.get("metadata"))
                        .and_then(|m| m.get("name"))
                        .and_then(|v| v.as_str())
                        .unwrap_or(id)
                        .to_string(),
                    version: concrete_version(loader.and_then(|l| l.get("version")).and_then(|v| v.as_str()))
                        .unwrap_or_else(|| "custom".to_string()),
                });
            }
        }
    }

    for toml_name in ["META-INF/neoforge.mods.toml", "META-INF/mods.toml"] {
        if let Some(text) = read_entry(&mut archive, toml_name) {
            if let Some(mut metadata) = parse_mods_toml(&text) {
                if metadata.version == "custom" {
                    if let Some(version) = manifest_version(&mut archive) {
                        metadata.version = version;
                    }
                }
                return Some(metadata);
            }
        }
    }
    None
}

const KNOWN_CONFLICTS: [(&str, &str, &str); 6] = [
    ("optifine", "sodium", "OptiFine and Sodium both replace the renderer and crash together."),
    ("optifine", "embeddium", "OptiFine and Embeddium both replace the renderer and crash together."),
    ("optifine", "rubidium", "OptiFine and Rubidium both replace the renderer and crash together."),
    ("sodium", "embeddium", "Embeddium is a Sodium port; install only one of them."),
    ("sodium", "rubidium", "Rubidium is a Sodium port; install only one of them."),
    ("embeddium", "rubidium", "Embeddium replaces Rubidium; install only one of them."),
];

fn identify_mod(jar_path: &Path) -> Option<String> {
    if let Some(metadata) = read_embedded_metadata(jar_path) {
        return Some(metadata.id.to_lowercase());
    }
    let file_name = jar_path.file_name()?.to_string_lossy().to_lowercase();
    file_name.contains("optifine").then(|| "optifine".to_string())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
struct CachedIdentity {
    size: u64,
    modified: u64,
    id: Option<String>,
}

const IDENTITY_CACHE_FILE: &str = ".mod-identity-cache.json";

pub fn find_mod_conflicts(mods_dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(mods_dir) else {
        return Vec::new();
    };
    let cache_path = mods_dir.join(IDENTITY_CACHE_FILE);
    let previous: std::collections::HashMap<String, CachedIdentity> = std::fs::read_to_string(&cache_path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    let mut current: std::collections::HashMap<String, CachedIdentity> = std::collections::HashMap::new();
    let mut by_id: std::collections::BTreeMap<String, Vec<String>> = std::collections::BTreeMap::new();
    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if !file_name.ends_with(".jar") {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let size = metadata.len();
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        let identity = match previous.get(&file_name) {
            Some(cached) if cached.size == size && cached.modified == modified => cached.clone(),
            _ => CachedIdentity {
                size,
                modified,
                id: identify_mod(&entry.path()),
            },
        };
        if let Some(id) = identity.id.clone() {
            by_id.entry(id).or_default().push(file_name.clone());
        }
        current.insert(file_name, identity);
    }
    if current != previous {
        let _ = crate::core::fs_util::write_json_atomic(&cache_path, &current);
    }

    let mut warnings = Vec::new();
    for (id, files) in &by_id {
        if files.len() > 1 {
            warnings.push(format!("Duplicate mod \"{id}\" found in: {}. Keep only one copy.", files.join(", ")));
        }
    }
    for (first, second, reason) in KNOWN_CONFLICTS {
        if by_id.contains_key(first) && by_id.contains_key(second) {
            warnings.push(format!("{first} and {second} are installed together. {reason}"));
        }
    }
    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn scans_real_mod_folder_for_conflicts() {
        let directory = std::path::PathBuf::from(std::env::var("MOD_JAR_DIR").unwrap());
        let started = std::time::Instant::now();
        let warnings = find_mod_conflicts(&directory);
        println!("{} warnings in {:?}", warnings.len(), started.elapsed());
        for warning in warnings {
            println!("{warning}");
        }
    }

    #[test]
    #[ignore]
    fn reads_real_mod_jars() {
        let directory = std::path::PathBuf::from(std::env::var("MOD_JAR_DIR").unwrap());
        let mut parsed = 0;
        let mut total = 0;
        for entry in std::fs::read_dir(directory).unwrap().flatten().take(40) {
            if !entry.file_name().to_string_lossy().ends_with(".jar") {
                continue;
            }
            total += 1;
            if let Some(meta) = read_embedded_metadata(&entry.path()) {
                parsed += 1;
                if parsed <= 3 {
                    println!("{} | {} | {}", meta.id, meta.name, meta.version);
                }
            }
        }
        println!("parsed {parsed}/{total}");
        assert!(parsed * 10 >= total * 9);
    }

    #[test]
    fn mods_toml_reads_first_mod_entry() {
        let toml = r#"
modLoader="javafml"
[[mods]] #mandatory
modId="examplemod"
version="${file.jarVersion}"
displayName="Example Mod" # comment
[[dependencies.examplemod]]
modId="forge"
"#;
        let parsed = parse_mods_toml(toml).unwrap();
        assert_eq!(parsed.id, "examplemod");
        assert_eq!(parsed.name, "Example Mod");
        assert_eq!(parsed.version, "custom");
    }
}
