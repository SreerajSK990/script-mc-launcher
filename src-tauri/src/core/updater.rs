use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubRelease {
    tag_name: String,
}

pub async fn check_for_updates() -> Result<UpdateCheckResult, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/repos/SreerajSK990/script-mc-launcher/releases/latest")
        .header(reqwest::header::USER_AGENT, "ScriptLauncher/0.18.0")
        .send()
        .await;

    match resp {
        Ok(res) => {
            if res.status().is_success() {
                if let Ok(release) = res.json::<GitHubRelease>().await {
                    let latest = release.tag_name.trim_start_matches('v').to_string();
                    let has_update = latest != current_version;
                    return Ok(UpdateCheckResult {
                        has_update,
                        current_version,
                        latest_version: Some(latest),
                        error: None,
                    });
                }
            }
            Ok(UpdateCheckResult {
                has_update: false,
                current_version,
                latest_version: None,
                error: None,
            })
        }
        Err(e) => Ok(UpdateCheckResult {
            has_update: false,
            current_version,
            latest_version: None,
            error: Some(e.to_string()),
        }),
    }
}
