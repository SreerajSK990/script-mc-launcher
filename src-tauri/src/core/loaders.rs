use crate::core::instances::InstanceConfiguration;
use crate::core::meta::{self, VersionPackage};
use crate::core::paths;
use std::path::PathBuf;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct DownloadTask {
    pub url: String,
    pub destination: PathBuf,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct LoaderLaunchConfiguration {
    pub version_package: VersionPackage,
    pub extra_download_tasks: Vec<DownloadTask>,
    pub extra_jvm_arguments: Vec<String>,
}

pub fn convert_maven_coordinate_to_path(
    coordinate: &str,
    classifier: Option<&str>,
    extension: &str,
) -> Result<String, String> {
    let parts: Vec<&str> = coordinate.split(':').collect();
    if parts.len() < 3 {
        return Err(format!("Invalid Maven coordinate: {coordinate}"));
    }

    let group_id = parts[0];
    let artifact_id = parts[1];
    let mut version = parts[2];
    let mut resolved_classifier = classifier.or_else(|| parts.get(3).copied());
    let mut resolved_extension = extension;

    if let Some(c) = resolved_classifier {
        if c.contains('@') {
            let split: Vec<&str> = c.split('@').collect();
            resolved_classifier = Some(split[0]);
            resolved_extension = split[1];
        }
    } else if version.contains('@') {
        let split: Vec<&str> = version.split('@').collect();
        version = split[0];
        resolved_extension = split[1];
    }

    let group_dir = group_id.replace('.', "/");
    let file_name = if let Some(c) = resolved_classifier {
        format!("{artifact_id}-{version}-{c}.{resolved_extension}")
    } else {
        format!("{artifact_id}-{version}.{resolved_extension}")
    };

    Ok(format!("{group_dir}/{artifact_id}/{version}/{file_name}"))
}

pub async fn resolve_instance_launch_configuration(
    instance: &InstanceConfiguration,
    base_version_package: VersionPackage,
) -> Result<LoaderLaunchConfiguration, String> {
    match instance.loader_type.as_str() {
        "fabric" => prepare_fabric_launch_configuration(instance, base_version_package).await,
        "quilt" => prepare_quilt_launch_configuration(instance, base_version_package).await,
        "forge" => prepare_forge_launch_configuration(instance, base_version_package).await,
        "neoforge" => prepare_neoforge_launch_configuration(instance, base_version_package).await,
        _ => Ok(LoaderLaunchConfiguration {
            version_package: base_version_package,
            extra_download_tasks: Vec::new(),
            extra_jvm_arguments: Vec::new(),
        }),
    }
}

async fn prepare_fabric_launch_configuration(
    instance: &InstanceConfiguration,
    base_version_package: VersionPackage,
) -> Result<LoaderLaunchConfiguration, String> {
    let loader_version = match &instance.loader_version {
        Some(v) if !v.is_empty() => v.clone(),
        _ => {
            let compatible =
                meta::get_compatible_loader_versions("fabric", &instance.minecraft_version).await?;
            compatible
                .first()
                .cloned()
                .ok_or_else(|| format!("No compatible Fabric version for {}", instance.minecraft_version))?
        }
    };

    let comp = meta::fetch_prism_component_version("net.fabricmc.fabric-loader", &loader_version).await?;

    let mut merged_libraries = base_version_package.libraries.clone();
    if let Some(extra_libs) = comp.libraries {
        merged_libraries.extend(extra_libs);
    }

    let mut merged_package = base_version_package;
    merged_package.main_class = comp
        .main_class
        .unwrap_or_else(|| "net.fabricmc.loader.impl.launch.knot.KnotClient".to_string());
    merged_package.libraries = merged_libraries;

    Ok(LoaderLaunchConfiguration {
        version_package: merged_package,
        extra_download_tasks: Vec::new(),
        extra_jvm_arguments: Vec::new(),
    })
}

async fn prepare_quilt_launch_configuration(
    instance: &InstanceConfiguration,
    base_version_package: VersionPackage,
) -> Result<LoaderLaunchConfiguration, String> {
    let loader_version = match &instance.loader_version {
        Some(v) if !v.is_empty() => v.clone(),
        _ => {
            let compatible =
                meta::get_compatible_loader_versions("quilt", &instance.minecraft_version).await?;
            compatible
                .first()
                .cloned()
                .ok_or_else(|| format!("No compatible Quilt version for {}", instance.minecraft_version))?
        }
    };

    let comp = meta::fetch_prism_component_version("org.quiltmc.quilt-loader", &loader_version).await?;

    let mut merged_libraries = base_version_package.libraries.clone();
    if let Some(extra_libs) = comp.libraries {
        merged_libraries.extend(extra_libs);
    }

    let mut merged_package = base_version_package;
    merged_package.main_class = comp
        .main_class
        .unwrap_or_else(|| "org.quiltmc.loader.impl.launch.knot.KnotClient".to_string());
    merged_package.libraries = merged_libraries;

    Ok(LoaderLaunchConfiguration {
        version_package: merged_package,
        extra_download_tasks: Vec::new(),
        extra_jvm_arguments: Vec::new(),
    })
}

async fn prepare_forge_launch_configuration(
    instance: &InstanceConfiguration,
    base_version_package: VersionPackage,
) -> Result<LoaderLaunchConfiguration, String> {
    let loader_version = match &instance.loader_version {
        Some(v) if !v.is_empty() => v.clone(),
        _ => {
            let compatible =
                meta::get_compatible_loader_versions("forge", &instance.minecraft_version).await?;
            compatible
                .first()
                .cloned()
                .ok_or_else(|| format!("No compatible Forge version for {}", instance.minecraft_version))?
        }
    };

    let comp = meta::fetch_prism_component_version("net.minecraftforge", &loader_version).await?;
    let libraries_root = paths::get_libraries_directory();
    let mut extra_download_tasks = Vec::new();
    let mut installer_jar_path: Option<PathBuf> = None;

    if let Some(maven_files) = comp.maven_files {
        for item in maven_files {
            if let Some(downloads) = item.downloads {
                if let Some(artifact) = downloads.get("artifact") {
                    let url = artifact.get("url").and_then(|u| u.as_str());
                    let sha1 = artifact.get("sha1").and_then(|s| s.as_str()).map(|s| s.to_string());
                    let size = artifact.get("size").and_then(|s| s.as_u64());

                    if let Some(url_str) = url {
                        let path_str = artifact
                            .get("path")
                            .and_then(|p| p.as_str())
                            .map(|p| p.to_string())
                            .unwrap_or_else(|| {
                                convert_maven_coordinate_to_path(&item.name, None, "jar")
                                    .unwrap_or_else(|_| item.name.clone())
                            });

                        let destination = libraries_root.join(path_str.replace('/', std::path::MAIN_SEPARATOR_STR));
                        extra_download_tasks.push(DownloadTask {
                            url: url_str.to_string(),
                            destination: destination.clone(),
                            sha1,
                            size,
                        });

                        if item.name.ends_with(":installer")
                            || destination.to_string_lossy().ends_with("-installer.jar")
                        {
                            installer_jar_path = Some(destination);
                        }
                    }
                }
            }
        }
    }

    let client_jar_path = libraries_root
        .join("com")
        .join("mojang")
        .join("minecraft")
        .join(&instance.minecraft_version)
        .join(format!("minecraft-{}-client.jar", instance.minecraft_version));

    let mut extra_jvm_arguments = Vec::new();
    if let Some(inst_path) = installer_jar_path {
        extra_jvm_arguments.push(format!("-Dforgewrapper.installer={}", inst_path.display()));
    }
    extra_jvm_arguments.push(format!("-Dforgewrapper.minecraft={}", client_jar_path.display()));
    extra_jvm_arguments.push(format!("-Dforgewrapper.librariesDir={}", libraries_root.display()));

    let mut merged_libraries = base_version_package.libraries.clone();
    if let Some(extra_libs) = comp.libraries {
        merged_libraries.extend(extra_libs);
    }

    let mut merged_package = base_version_package;
    merged_package.main_class = comp
        .main_class
        .unwrap_or_else(|| "io.github.zekerzhayard.forgewrapper.installer.Main".to_string());
    if comp.minecraft_arguments.is_some() {
        merged_package.minecraft_arguments = comp.minecraft_arguments;
    }
    if comp.arguments.is_some() {
        merged_package.arguments = comp.arguments;
    }
    merged_package.libraries = merged_libraries;

    Ok(LoaderLaunchConfiguration {
        version_package: merged_package,
        extra_download_tasks,
        extra_jvm_arguments,
    })
}

async fn prepare_neoforge_launch_configuration(
    instance: &InstanceConfiguration,
    base_version_package: VersionPackage,
) -> Result<LoaderLaunchConfiguration, String> {
    let loader_version = match &instance.loader_version {
        Some(v) if !v.is_empty() => v.clone(),
        _ => {
            let compatible =
                meta::get_compatible_loader_versions("neoforge", &instance.minecraft_version).await?;
            compatible
                .first()
                .cloned()
                .ok_or_else(|| format!("No compatible NeoForge version for {}", instance.minecraft_version))?
        }
    };

    let comp = meta::fetch_prism_component_version("net.neoforged", &loader_version).await?;
    let libraries_root = paths::get_libraries_directory();
    let mut extra_download_tasks = Vec::new();
    let mut installer_jar_path: Option<PathBuf> = None;

    if let Some(maven_files) = comp.maven_files {
        for item in maven_files {
            if let Some(downloads) = item.downloads {
                if let Some(artifact) = downloads.get("artifact") {
                    let url = artifact.get("url").and_then(|u| u.as_str());
                    let sha1 = artifact.get("sha1").and_then(|s| s.as_str()).map(|s| s.to_string());
                    let size = artifact.get("size").and_then(|s| s.as_u64());

                    if let Some(url_str) = url {
                        let path_str = artifact
                            .get("path")
                            .and_then(|p| p.as_str())
                            .map(|p| p.to_string())
                            .unwrap_or_else(|| {
                                convert_maven_coordinate_to_path(&item.name, None, "jar")
                                    .unwrap_or_else(|_| item.name.clone())
                            });

                        let destination = libraries_root.join(path_str.replace('/', std::path::MAIN_SEPARATOR_STR));
                        extra_download_tasks.push(DownloadTask {
                            url: url_str.to_string(),
                            destination: destination.clone(),
                            sha1,
                            size,
                        });

                        if item.name.ends_with(":installer")
                            || destination.to_string_lossy().ends_with("-installer.jar")
                        {
                            installer_jar_path = Some(destination);
                        }
                    }
                }
            }
        }
    }

    let client_jar_path = libraries_root
        .join("com")
        .join("mojang")
        .join("minecraft")
        .join(&instance.minecraft_version)
        .join(format!("minecraft-{}-client.jar", instance.minecraft_version));

    let mut extra_jvm_arguments = Vec::new();
    if let Some(inst_path) = installer_jar_path {
        extra_jvm_arguments.push(format!("-Dforgewrapper.installer={}", inst_path.display()));
    }
    extra_jvm_arguments.push(format!("-Dforgewrapper.minecraft={}", client_jar_path.display()));
    extra_jvm_arguments.push(format!("-Dforgewrapper.librariesDir={}", libraries_root.display()));

    let mut merged_libraries = base_version_package.libraries.clone();
    if let Some(extra_libs) = comp.libraries {
        merged_libraries.extend(extra_libs);
    }

    let mut merged_package = base_version_package;
    merged_package.main_class = comp
        .main_class
        .unwrap_or_else(|| "io.github.zekerzhayard.forgewrapper.installer.Main".to_string());
    if comp.minecraft_arguments.is_some() {
        merged_package.minecraft_arguments = comp.minecraft_arguments;
    }
    if comp.arguments.is_some() {
        merged_package.arguments = comp.arguments;
    }
    merged_package.libraries = merged_libraries;

    Ok(LoaderLaunchConfiguration {
        version_package: merged_package,
        extra_download_tasks,
        extra_jvm_arguments,
    })
}
