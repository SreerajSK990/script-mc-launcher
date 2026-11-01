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

#[cfg(test)]
mod tests {
    use super::*;

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
