use crate::core::download::{self, Checksum};
use crate::core::instances::{self, InstanceConfiguration};
use crate::core::mods::{
    self, InstallModMetadata, InstallModPayload, InstalledModRecord, ModDependency, ModVersionFile,
};
use crate::core::paths;
use crate::core::recovery::DependencyPlan;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::future::Future;
use std::pin::Pin;

const MAX_DEPENDENCY_PROJECTS: usize = 200;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait DependencyProvider: Sync {
    fn version<'a>(&'a self, source: &'a str, project_id: &'a str, version_id: &'a str) -> BoxFuture<'a, Result<ModVersionFile, String>>;
    fn versions<'a>(
        &'a self,
        source: &'a str,
        project_id: &'a str,
        instance: &'a InstanceConfiguration,
    ) -> BoxFuture<'a, Result<Vec<ModVersionFile>, String>>;
    fn verify_installed(&self, record: &InstalledModRecord, version: &ModVersionFile, instance: &InstanceConfiguration) -> bool;
}

pub struct RemoteDependencyProvider;

impl DependencyProvider for RemoteDependencyProvider {
    fn version<'a>(&'a self, source: &'a str, project_id: &'a str, version_id: &'a str) -> BoxFuture<'a, Result<ModVersionFile, String>> {
        Box::pin(mods::get_mod_version(source, project_id, version_id))
    }

    fn versions<'a>(
        &'a self,
        source: &'a str,
        project_id: &'a str,
        instance: &'a InstanceConfiguration,
    ) -> BoxFuture<'a, Result<Vec<ModVersionFile>, String>> {
        Box::pin(mods::get_mod_versions(
            project_id,
            source,
            Some(&instance.minecraft_version),
            Some(&instance.loader_type),
        ))
    }

    fn verify_installed(&self, record: &InstalledModRecord, version: &ModVersionFile, instance: &InstanceConfiguration) -> bool {
        let Some(checksum) = Checksum::from_hashes(version.sha512.clone(), version.sha1.clone()) else {
            return false;
        };
        let file_name = if record.enabled {
            record.filename.clone()
        } else {
            format!("{}.disabled", record.filename)
        };
        let path = paths::get_instance_minecraft_path(&instance.id).join("mods").join(file_name);
        download::file_satisfies(&path, Some(&checksum), None)
    }
}

fn project_key(source: &str, project_id: &str) -> String {
    format!("{source}:{project_id}")
}

pub fn loader_accepts(instance_loader: &str, version_loaders: &[String]) -> bool {
    version_loaders.iter().any(|loader| {
        loader.eq_ignore_ascii_case(instance_loader)
            || (instance_loader.eq_ignore_ascii_case("quilt") && loader.eq_ignore_ascii_case("fabric"))
    })
}

fn is_compatible(version: &ModVersionFile, instance: &InstanceConfiguration) -> bool {
    version.game_versions.iter().any(|game_version| game_version == &instance.minecraft_version)
        && loader_accepts(&instance.loader_type, &version.loaders)
}

struct Resolver<'p, P: DependencyProvider> {
    provider: &'p P,
    instance: InstanceConfiguration,
    installed: Vec<InstalledModRecord>,
    chosen: HashMap<String, InstallModPayload>,
    chosen_order: Vec<String>,
    pending: HashSet<String>,
    visited: HashSet<String>,
    items: Vec<InstallModPayload>,
    reused: HashSet<String>,
    warnings: BTreeSet<String>,
}

impl<'p, P: DependencyProvider> Resolver<'p, P> {
    fn choose(&mut self, key: String, payload: InstallModPayload) {
        if !self.chosen.contains_key(&key) {
            self.chosen_order.push(key.clone());
        }
        self.chosen.insert(key, payload);
    }

    fn existing_for(&self, source: &str, project_id: &str) -> Option<InstalledModRecord> {
        self.installed
            .iter()
            .find(|record| record.source == source && record.id == project_id)
            .cloned()
    }

    fn visit<'s>(&'s mut self, payload: InstallModPayload) -> BoxFuture<'s, Result<(), String>> {
        Box::pin(async move {
            let source = payload.mod_metadata.source.clone();
            let id = project_key(&source, &payload.version_file.project_id);
            if self.visited.contains(&id) || self.pending.contains(&id) {
                return Ok(());
            }
            if self.chosen.len() > MAX_DEPENDENCY_PROJECTS {
                return Err(format!("Dependency graph exceeds {MAX_DEPENDENCY_PROJECTS} projects"));
            }
            if !is_compatible(&payload.version_file, &self.instance) {
                return Err(format!(
                    "{} is not compatible with Minecraft {} / {}",
                    payload.mod_metadata.name, self.instance.minecraft_version, self.instance.loader_type
                ));
            }
            if payload.version_file.download_url.is_none() && !self.reused.contains(&id) {
                return Err(format!(
                    "{} requires a manual download from {}. Install that file before continuing.",
                    payload.mod_metadata.name,
                    payload.version_file.website_url.as_deref().unwrap_or("its project website")
                ));
            }
            self.pending.insert(id.clone());

            for dependency in payload.version_file.dependencies.clone().unwrap_or_default() {
                self.visit_dependency(&payload, &dependency).await?;
            }

            self.pending.remove(&id);
            self.visited.insert(id);
            self.items.push(payload);
            Ok(())
        })
    }

    async fn visit_dependency(&mut self, parent: &InstallModPayload, dependency: &ModDependency) -> Result<(), String> {
        let source = parent.mod_metadata.source.clone();
        if dependency.r#type == "optional" {
            self.warnings.insert(format!(
                "Optional dependency {} is not installed automatically",
                dependency
                    .project_id
                    .as_deref()
                    .or(dependency.version_id.as_deref())
                    .unwrap_or("unknown")
            ));
            return Ok(());
        }
        if dependency.r#type != "required" {
            return Ok(());
        }

        let mut target = match dependency.version_id.as_deref() {
            Some(version_id) => Some(
                self.provider
                    .version(&source, dependency.project_id.as_deref().unwrap_or(""), version_id)
                    .await?,
            ),
            None => None,
        };
        let project_id = target
            .as_ref()
            .map(|version| version.project_id.clone())
            .filter(|value| !value.is_empty())
            .or_else(|| dependency.project_id.clone())
            .ok_or_else(|| format!("{} has a required dependency with no resolvable project", parent.mod_metadata.name))?;
        let dependency_key = project_key(&source, &project_id);
        let mut existing = self.existing_for(&source, &project_id);
        if let Some(record) = &existing {
            if !record.enabled {
                return Err(format!(
                    "Required dependency {} is disabled. Enable it explicitly before installing {}.",
                    record.name, parent.mod_metadata.name
                ));
            }
        }

        if let Some(selected) = self.chosen.get(&dependency_key).cloned() {
            if let Some(required) = &target {
                if selected.version_file.id != required.id {
                    return Err(format!("Conflicting dependency versions for {project_id}"));
                }
            }
            return self.visit(selected).await;
        }

        let candidates: Vec<ModVersionFile> = match &target {
            Some(required) => vec![required.clone()],
            None => self
                .provider
                .versions(&source, &project_id, &self.instance)
                .await?
                .into_iter()
                .filter(|candidate| is_compatible(candidate, &self.instance))
                .collect(),
        };

        let mut matching = candidates
            .iter()
            .find(|candidate| {
                existing.as_ref().is_some_and(|record| {
                    record.version_id.as_deref() == Some(candidate.id.as_str())
                        || (record.filename == candidate.filename && record.version == candidate.version_number)
                })
            })
            .cloned();

        if matching.is_none() {
            for candidate in &candidates {
                let Some(local) = self.installed.iter().find(|record| record.filename == candidate.filename).cloned() else {
                    continue;
                };
                if self.provider.verify_installed(&local, candidate, &self.instance) {
                    if !local.enabled {
                        return Err(format!("Required dependency {} is disabled. Enable it before continuing.", local.name));
                    }
                    existing = Some(local);
                    matching = Some(candidate.clone());
                    break;
                }
            }
        }

        target = matching
            .clone()
            .or(target)
            .or_else(|| candidates.iter().find(|candidate| candidate.release_type == "release").cloned())
            .or_else(|| candidates.first().cloned());
        let Some(chosen_version) = target else {
            return Err(format!(
                "No compatible version of required dependency {project_id} is available for {}",
                parent.mod_metadata.name
            ));
        };

        let next = InstallModPayload {
            instance_id: self.instance.id.clone(),
            mod_metadata: InstallModMetadata {
                id: project_id.clone(),
                name: existing
                    .as_ref()
                    .map(|record| record.name.clone())
                    .unwrap_or_else(|| chosen_version.name.clone()),
                source: source.clone(),
                icon_url: None,
            },
            old_filename: existing.as_ref().map(|record| record.filename.clone()),
            version_file: chosen_version,
        };
        self.choose(dependency_key.clone(), next.clone());
        if matching.is_some() {
            self.reused.insert(dependency_key);
        }
        self.visit(next).await
    }

    fn check_final_conflicts(&self) -> Result<(), String> {
        struct FinalVersion {
            source: String,
            id: String,
            version_id: String,
            dependencies: Vec<ModDependency>,
        }
        let mut final_versions: Vec<FinalVersion> = self
            .chosen_order
            .iter()
            .filter_map(|key| self.chosen.get(key))
            .map(|item| FinalVersion {
                source: item.mod_metadata.source.clone(),
                id: item.version_file.project_id.clone(),
                version_id: item.version_file.id.clone(),
                dependencies: item.version_file.dependencies.clone().unwrap_or_default(),
            })
            .collect();
        for record in self
            .installed
            .iter()
            .filter(|record| record.enabled && !self.chosen.contains_key(&project_key(&record.source, &record.id)))
        {
            final_versions.push(FinalVersion {
                source: record.source.clone(),
                id: record.id.clone(),
                version_id: record.version_id.clone().unwrap_or_default(),
                dependencies: record.dependencies.clone().unwrap_or_default(),
            });
        }

        for version in &final_versions {
            for dependency in &version.dependencies {
                let matched = final_versions.iter().find(|other| {
                    other.source == version.source
                        && match dependency.project_id.as_deref() {
                            Some(project_id) => other.id == project_id,
                            None => dependency.version_id.as_deref() == Some(other.version_id.as_str()),
                        }
                });
                let Some(matched) = matched else {
                    continue;
                };
                let version_matches = dependency
                    .version_id
                    .as_deref()
                    .is_none_or(|required| required == matched.version_id);
                if dependency.r#type == "incompatible" && version_matches {
                    return Err(format!("{} declares an incompatibility with {}", version.id, matched.id));
                }
                if dependency.r#type == "required" && dependency.version_id.is_some() && !version_matches {
                    return Err(format!("{} requires a different version of {}", version.id, matched.id));
                }
            }
        }
        Ok(())
    }
}

pub async fn resolve_dependencies<P: DependencyProvider>(
    roots: Vec<InstallModPayload>,
    instance: InstanceConfiguration,
    installed: Vec<InstalledModRecord>,
    provider: &P,
) -> Result<DependencyPlan, String> {
    let mut resolver = Resolver {
        provider,
        instance,
        installed,
        chosen: HashMap::new(),
        chosen_order: Vec::new(),
        pending: HashSet::new(),
        visited: HashSet::new(),
        items: Vec::new(),
        reused: HashSet::new(),
        warnings: BTreeSet::new(),
    };

    for root in roots {
        let source = root.mod_metadata.source.clone();
        let version = provider
            .version(&source, &root.version_file.project_id, &root.version_file.id)
            .await?;
        let key = project_key(&source, &version.project_id);
        if let Some(existing) = resolver.chosen.get(&key) {
            if existing.version_file.id != version.id {
                return Err(format!("Conflicting versions requested for {}", root.mod_metadata.name));
            }
        }
        let mut metadata = root.mod_metadata.clone();
        metadata.id = version.project_id.clone();
        resolver.choose(
            key,
            InstallModPayload {
                version_file: version,
                mod_metadata: metadata,
                ..root
            },
        );
    }

    let roots: Vec<InstallModPayload> = resolver
        .chosen_order
        .clone()
        .iter()
        .filter_map(|key| resolver.chosen.get(key).cloned())
        .collect();
    for root in roots {
        resolver.visit(root).await?;
    }
    resolver.check_final_conflicts()?;

    let is_reused =
        |item: &InstallModPayload| resolver.reused.contains(&project_key(&item.mod_metadata.source, &item.version_file.project_id));
    Ok(DependencyPlan {
        items: resolver.items.iter().filter(|item| !is_reused(item)).cloned().collect(),
        reused: resolver.reused.iter().cloned().collect(),
        reused_items: resolver.items.iter().filter(|item| is_reused(item)).cloned().collect(),
        warnings: resolver.warnings.into_iter().collect(),
    })
}

pub async fn plan_mod_installation(payloads: Vec<InstallModPayload>) -> Result<DependencyPlan, String> {
    let Some(first) = payloads.first() else {
        return Ok(DependencyPlan {
            items: Vec::new(),
            reused: Vec::new(),
            reused_items: Vec::new(),
            warnings: Vec::new(),
        });
    };
    let instance_id = first.instance_id.clone();
    for payload in &payloads {
        payload.validate()?;
        if payload.instance_id != instance_id {
            return Err("Select one target instance".to_string());
        }
    }
    let instance = instances::get_instance_by_id(&instance_id)?.ok_or("Instance not found")?;
    let installed = mods::list_installed_mods(&instance_id)?;
    resolve_dependencies(payloads, instance, installed, &RemoteDependencyProvider).await
}

pub async fn install_mod_with_dependencies(payload: InstallModPayload) -> Result<InstalledModRecord, String> {
    let requested_project = payload.version_file.project_id.clone();
    let requested_source = payload.mod_metadata.source.clone();
    let instance_id = payload.instance_id.clone();
    let plan = plan_mod_installation(vec![payload]).await?;

    let mut requested_record = None;
    for item in plan.items {
        let is_requested = item.version_file.project_id == requested_project && item.mod_metadata.source == requested_source;
        let record = mods::install_mod_to_instance(item).await?;
        if is_requested {
            requested_record = Some(record);
        }
    }

    if !plan.reused_items.is_empty() {
        mods::update_installed_records(&instance_id, |records| {
            for item in &plan.reused_items {
                if let Some(record) = records.iter_mut().find(|record| {
                    record.filename == item.version_file.filename || item.old_filename.as_deref() == Some(record.filename.as_str())
                }) {
                    record.id = item.version_file.project_id.clone();
                    record.source = item.mod_metadata.source.clone();
                    record.version_id = Some(item.version_file.id.clone());
                    record.version = item.version_file.version_number.clone();
                    record.dependencies = item.version_file.dependencies.clone();
                }
            }
        })?;
    }

    match requested_record {
        Some(record) => Ok(record),
        None => mods::list_installed_mods(&instance_id)?
            .into_iter()
            .find(|record| record.id == requested_project && record.source == requested_source)
            .ok_or_else(|| "Requested mod was not installed".to_string()),
    }
}

pub fn find_managed_dependency_issues(records: &[InstalledModRecord]) -> Vec<String> {
    let mut issues = Vec::new();
    for record in records.iter().filter(|record| record.enabled) {
        for dependency in record.dependencies.as_deref().unwrap_or_default() {
            if dependency.r#type != "required" && dependency.r#type != "incompatible" {
                continue;
            }
            let target = records.iter().find(|other| {
                other.source == record.source
                    && match dependency.project_id.as_deref() {
                        Some(project_id) => other.id == project_id,
                        None => dependency.version_id.as_deref().is_some_and(|version| other.version_id.as_deref() == Some(version)),
                    }
            });
            let target_name = target
                .map(|found| found.name.clone())
                .or_else(|| dependency.project_id.clone())
                .or_else(|| dependency.version_id.clone())
                .unwrap_or_else(|| "an unknown mod".to_string());
            if dependency.r#type == "required" {
                let satisfied = target.is_some_and(|found| {
                    found.enabled
                        && dependency
                            .version_id
                            .as_deref()
                            .is_none_or(|version| found.version_id.as_deref() == Some(version))
                });
                if !satisfied {
                    issues.push(format!(
                        "{} requires {target_name}, which is missing, disabled, or has a different version.",
                        record.name
                    ));
                }
            } else if target.is_some_and(|found| {
                found.enabled
                    && dependency
                        .version_id
                        .as_deref()
                        .is_none_or(|version| found.version_id.as_deref() == Some(version))
            }) {
                issues.push(format!("{} declares an incompatibility with {target_name}.", record.name));
            }
        }
    }
    issues
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeProvider {
        versions: HashMap<String, ModVersionFile>,
    }

    fn version(project: &str, id: &str, dependencies: Vec<ModDependency>) -> ModVersionFile {
        ModVersionFile {
            dependencies: Some(dependencies),
            shader_loaders: None,
            id: id.to_string(),
            project_id: project.to_string(),
            name: project.to_string(),
            version_number: id.to_string(),
            game_versions: vec!["1.21.1".to_string()],
            loaders: vec!["fabric".to_string()],
            download_url: Some(format!("https://example.invalid/{id}.jar")),
            website_url: None,
            filename: format!("{id}.jar"),
            size_bytes: 1,
            sha512: None,
            sha1: None,
            release_type: "release".to_string(),
            date_published: String::new(),
            changelog: None,
        }
    }

    fn requires(project: &str, kind: &str) -> ModDependency {
        ModDependency {
            project_id: Some(project.to_string()),
            version_id: None,
            r#type: kind.to_string(),
        }
    }

    impl DependencyProvider for FakeProvider {
        fn version<'a>(&'a self, _source: &'a str, _project_id: &'a str, version_id: &'a str) -> BoxFuture<'a, Result<ModVersionFile, String>> {
            let found = self.versions.get(version_id).cloned().ok_or_else(|| format!("missing {version_id}"));
            Box::pin(async move { found })
        }

        fn versions<'a>(
            &'a self,
            _source: &'a str,
            project_id: &'a str,
            _instance: &'a InstanceConfiguration,
        ) -> BoxFuture<'a, Result<Vec<ModVersionFile>, String>> {
            let found: Vec<ModVersionFile> = self.versions.values().filter(|v| v.project_id == project_id).cloned().collect();
            Box::pin(async move { Ok(found) })
        }

        fn verify_installed(&self, _record: &InstalledModRecord, _version: &ModVersionFile, _instance: &InstanceConfiguration) -> bool {
            false
        }
    }

    fn instance() -> InstanceConfiguration {
        serde_json::from_value(serde_json::json!({
            "id": "deps-test",
            "name": "Deps",
            "minecraftVersion": "1.21.1",
            "loaderType": "fabric"
        }))
        .unwrap()
    }

    fn root(version: &ModVersionFile) -> InstallModPayload {
        InstallModPayload {
            instance_id: "deps-test".to_string(),
            version_file: version.clone(),
            mod_metadata: InstallModMetadata {
                id: version.project_id.clone(),
                name: version.name.clone(),
                source: "modrinth".to_string(),
                icon_url: None,
            },
            old_filename: None,
        }
    }

    fn provider(versions: Vec<ModVersionFile>) -> FakeProvider {
        FakeProvider {
            versions: versions.into_iter().map(|v| (v.id.clone(), v)).collect(),
        }
    }

    #[tokio::test]
    async fn required_dependencies_are_installed_before_dependents() {
        let sodium_extra = version("sodium-extra", "se-1", vec![requires("sodium", "required"), requires("modmenu", "optional")]);
        let sodium = version("sodium", "so-1", vec![requires("fabric-api", "required")]);
        let fabric_api = version("fabric-api", "fa-1", vec![]);
        let fake = provider(vec![sodium_extra.clone(), sodium, fabric_api]);
        let plan = resolve_dependencies(vec![root(&sodium_extra)], instance(), Vec::new(), &fake).await.unwrap();
        let order: Vec<&str> = plan.items.iter().map(|item| item.version_file.project_id.as_str()).collect();
        assert_eq!(order, vec!["fabric-api", "sodium", "sodium-extra"]);
        assert_eq!(plan.warnings.len(), 1);
    }

    #[tokio::test]
    async fn incompatible_installed_mod_blocks_installation() {
        let optifine_like = version("conflict", "cf-1", vec![requires("sodium", "incompatible")]);
        let fake = provider(vec![optifine_like.clone()]);
        let installed = vec![InstalledModRecord {
            version_id: Some("so-1".into()),
            dependencies: None,
            id: "sodium".into(),
            name: "Sodium".into(),
            version: "1".into(),
            filename: "so-1.jar".into(),
            source: "modrinth".into(),
            icon_url: None,
            installed_at: String::new(),
            enabled: true,
            file_size_bytes: 1,
            game_version: None,
            loader: None,
        }];
        let error = resolve_dependencies(vec![root(&optifine_like)], instance(), installed, &fake).await.unwrap_err();
        assert!(error.contains("incompatibility"));
    }

    #[tokio::test]
    async fn incompatible_game_version_is_rejected() {
        let mut old = version("old-mod", "om-1", vec![]);
        old.game_versions = vec!["1.20.1".into()];
        let fake = provider(vec![old.clone()]);
        let error = resolve_dependencies(vec![root(&old)], instance(), Vec::new(), &fake).await.unwrap_err();
        assert!(error.contains("not compatible"));
    }

    #[tokio::test]
    #[ignore]
    async fn live_modrinth_dependencies_resolve() {
        let versions = mods::get_modrinth_project_versions("sodium-extra", Some("1.21.1"), Some("fabric"))
            .await
            .unwrap();
        let plan = resolve_dependencies(vec![root(&versions[0])], instance(), Vec::new(), &RemoteDependencyProvider)
            .await
            .unwrap();
        let projects: Vec<String> = plan.items.iter().map(|item| item.mod_metadata.name.clone()).collect();
        println!("{projects:?}");
        assert!(plan.items.len() >= 2, "{projects:?}");
        assert_eq!(plan.items.last().unwrap().version_file.project_id, versions[0].project_id);
    }

    #[test]
    fn quilt_instances_accept_fabric_mods() {
        assert!(loader_accepts("quilt", &["fabric".to_string()]));
        assert!(!loader_accepts("forge", &["fabric".to_string()]));
    }

    #[test]
    fn managed_issues_report_missing_requirements() {
        let record = InstalledModRecord {
            version_id: Some("a".into()),
            dependencies: Some(vec![requires("fabric-api", "required")]),
            id: "sodium".into(),
            name: "Sodium".into(),
            version: "1".into(),
            filename: "sodium.jar".into(),
            source: "modrinth".into(),
            icon_url: None,
            installed_at: String::new(),
            enabled: true,
            file_size_bytes: 1,
            game_version: None,
            loader: None,
        };
        let issues = find_managed_dependency_issues(&[record]);
        assert_eq!(issues.len(), 1);
        assert!(issues[0].contains("fabric-api"));
    }
}
