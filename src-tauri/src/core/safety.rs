use std::path::{Path, PathBuf};

const MAX_IDENTIFIER_LENGTH: usize = 160;
const MAX_FILE_NAME_LENGTH: usize = 255;
const FORBIDDEN_FILE_NAME_CHARACTERS: [char; 9] = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

pub fn validate_identifier(value: &str) -> Result<&str, String> {
    let is_valid = !value.is_empty()
        && value.len() <= MAX_IDENTIFIER_LENGTH
        && value != "."
        && value != ".."
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if is_valid {
        Ok(value)
    } else {
        Err(format!("Invalid identifier: {value}"))
    }
}

pub fn validate_file_name(value: &str) -> Result<&str, String> {
    let is_valid = !value.is_empty()
        && value.len() <= MAX_FILE_NAME_LENGTH
        && value != "."
        && value != ".."
        && value.trim() == value
        && !value.ends_with('.')
        && !value
            .chars()
            .any(|c| c.is_control() || FORBIDDEN_FILE_NAME_CHARACTERS.contains(&c));
    if is_valid {
        Ok(value)
    } else {
        Err(format!("Invalid file name: {value}"))
    }
}

pub fn safe_relative_path(relative: &str) -> Result<PathBuf, String> {
    let mut resolved = PathBuf::new();
    for component in relative.split(['/', '\\']) {
        if component.is_empty() || component == "." {
            continue;
        }
        if component == ".." {
            return Err(format!("Path escapes its target directory: {relative}"));
        }
        validate_file_name(component).map_err(|_| format!("Unsafe path segment in: {relative}"))?;
        resolved.push(component);
    }
    if resolved.as_os_str().is_empty() {
        return Err(format!("Empty relative path: {relative}"));
    }
    Ok(resolved)
}

pub fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    Ok(root.join(safe_relative_path(relative)?))
}

pub fn is_path_inside(root: &Path, candidate: &Path) -> bool {
    match (dunce_canonicalize(root), dunce_canonicalize(candidate)) {
        (Some(canonical_root), Some(canonical_candidate)) => canonical_candidate.starts_with(canonical_root),
        _ => false,
    }
}

fn dunce_canonicalize(path: &Path) -> Option<PathBuf> {
    let canonical = std::fs::canonicalize(path).ok()?;
    let text = canonical.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(stripped) if !stripped.starts_with("UNC") => Some(PathBuf::from(stripped)),
        _ => Some(canonical),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifiers() {
        assert!(validate_identifier("my-pack_1.2-ab12cd34").is_ok());
        assert!(validate_identifier("..").is_err());
        assert!(validate_identifier("../x").is_err());
        assert!(validate_identifier("a/b").is_err());
        assert!(validate_identifier("").is_err());
    }

    #[test]
    fn file_names() {
        assert!(validate_file_name("sodium-fabric-0.6.0+mc1.21.1.jar").is_ok());
        assert!(validate_file_name("Complementary [v5].zip").is_ok());
        assert!(validate_file_name("../evil.jar").is_err());
        assert!(validate_file_name("C:evil").is_err());
        assert!(validate_file_name("evil.jar.").is_err());
        assert!(validate_file_name("a\u{0}b").is_err());
    }

    #[test]
    fn relative_paths() {
        assert_eq!(safe_relative_path("mods/a.jar").unwrap(), PathBuf::from("mods").join("a.jar"));
        assert_eq!(safe_relative_path("/config//x.toml").unwrap(), PathBuf::from("config").join("x.toml"));
        assert!(safe_relative_path("../../Startup/evil.bat").is_err());
        assert!(safe_relative_path("config/../../evil").is_err());
        assert!(safe_relative_path("C:\\Windows\\evil").is_err());
        assert!(safe_relative_path("").is_err());
    }

    #[test]
    fn containment() {
        let root = std::env::temp_dir();
        assert!(is_path_inside(&root, &root));
        assert!(!is_path_inside(&root.join("definitely-missing-folder"), &root));
    }
}
