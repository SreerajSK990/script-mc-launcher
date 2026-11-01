use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

static ACTIVE_OPERATIONS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn active_operations() -> &'static Mutex<HashMap<String, String>> {
    ACTIVE_OPERATIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug)]
pub struct InstanceOperationGuard {
    instance_id: String,
}

impl Drop for InstanceOperationGuard {
    fn drop(&mut self) {
        if let Ok(mut operations) = active_operations().lock() {
            operations.remove(&self.instance_id);
        }
    }
}

pub fn reserve_instance(instance_id: &str, description: &str) -> Result<InstanceOperationGuard, String> {
    let mut operations = active_operations()
        .lock()
        .map_err(|_| "Instance operation state is unavailable".to_string())?;
    if let Some(existing) = operations.get(instance_id) {
        return Err(format!("{existing}. Wait for it to finish and try again."));
    }
    operations.insert(instance_id.to_string(), description.to_string());
    Ok(InstanceOperationGuard {
        instance_id: instance_id.to_string(),
    })
}

pub fn active_operation(instance_id: &str) -> Option<String> {
    active_operations()
        .lock()
        .ok()
        .and_then(|operations| operations.get(instance_id).cloned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reservation_blocks_until_guard_is_dropped() {
        let guard = reserve_instance("ops-test", "Minecraft is running").unwrap();
        let error = reserve_instance("ops-test", "Deleting the instance").unwrap_err();
        assert!(error.contains("Minecraft is running"));
        assert_eq!(active_operation("ops-test").as_deref(), Some("Minecraft is running"));
        drop(guard);
        assert!(active_operation("ops-test").is_none());
        assert!(reserve_instance("ops-test", "Deleting the instance").is_ok());
    }
}
