use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use sysinfo::System;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMemoryInfo {
    pub total_megabytes: u64,
    pub free_megabytes: u64,
    pub recommended_allocation_megabytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperatingSystemInfo {
    pub platform: String,
    pub architecture: String,
    pub release: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemEnvironment {
    pub memory: SystemMemoryInfo,
    pub os: OperatingSystemInfo,
    pub default_java_path: Option<String>,
    pub app_data_directory: String,
}

pub fn get_system_memory() -> SystemMemoryInfo {
    let mut sys = System::new_all();
    sys.refresh_memory();

    let total_bytes = sys.total_memory();
    let free_bytes = sys.available_memory();

    let total_megabytes = total_bytes / (1024 * 1024);
    let free_megabytes = free_bytes / (1024 * 1024);
    let half_total = total_megabytes / 2;
    let recommended_allocation_megabytes = 2048.max(8192.min(half_total));

    SystemMemoryInfo {
        total_megabytes,
        free_megabytes,
        recommended_allocation_megabytes,
    }
}

pub fn get_operating_system() -> OperatingSystemInfo {
    let platform = if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else {
        "linux".to_string()
    };

    let architecture = std::env::consts::ARCH.to_string();
    let release = System::os_version().unwrap_or_else(|| "unknown".to_string());

    OperatingSystemInfo {
        platform,
        architecture,
        release,
    }
}

pub fn detect_system_java_path() -> Option<String> {
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let candidate = if cfg!(target_os = "windows") {
            PathBuf::from(&java_home).join("bin").join("java.exe")
        } else {
            PathBuf::from(&java_home).join("bin").join("java")
        };
        if candidate.exists() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    let lookup_cmd = if cfg!(target_os = "windows") { "where" } else { "which" };
    if let Ok(output) = std::process::Command::new(lookup_cmd).arg("java").output() {
        if output.status.success() {
            if let Ok(text) = String::from_utf8(output.stdout) {
                if let Some(first_line) = text.lines().next() {
                    let trimmed = first_line.trim();
                    if !trimmed.is_empty() && PathBuf::from(trimmed).exists() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    None
}

pub fn get_system_environment() -> SystemEnvironment {
    let memory = get_system_memory();
    let os = get_operating_system();
    let default_java_path = detect_system_java_path();
    let app_data_directory = super::paths::get_launcher_root_directory()
        .to_string_lossy()
        .to_string();

    SystemEnvironment {
        memory,
        os,
        default_java_path,
        app_data_directory,
    }
}
