use std::sync::OnceLock;
use std::time::Duration;

pub const LAUNCHER_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const USER_AGENT: &str = concat!(
    "ScriptLauncher/",
    env!("CARGO_PKG_VERSION"),
    " (github.com/SreerajSK990/script-mc-launcher)"
);

const MAX_REQUEST_ATTEMPTS: u32 = 3;

static SHARED_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub fn http_client() -> &'static reqwest::Client {
    SHARED_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(15))
            .read_timeout(Duration::from_secs(60))
            .pool_idle_timeout(Duration::from_secs(90))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

pub fn retry_delay(attempt: u32) -> Duration {
    Duration::from_millis(400 * 2u64.pow(attempt.min(4)))
}

pub fn is_retryable_status(status: reqwest::StatusCode) -> bool {
    status.is_server_error()
        || status == reqwest::StatusCode::TOO_MANY_REQUESTS
        || status == reqwest::StatusCode::REQUEST_TIMEOUT
}

pub async fn send_with_retry<F>(build_request: F) -> Result<reqwest::Response, String>
where
    F: Fn() -> reqwest::RequestBuilder,
{
    let mut last_error = String::from("Request was not attempted");
    for attempt in 0..MAX_REQUEST_ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(retry_delay(attempt)).await;
        }
        match build_request().send().await {
            Ok(response) if is_retryable_status(response.status()) => {
                last_error = format!("HTTP {} from {}", response.status(), response.url());
            }
            Ok(response) => return Ok(response),
            Err(error) => last_error = describe_request_error(&error),
        }
    }
    Err(last_error)
}

pub async fn get_json<T: serde::de::DeserializeOwned>(url: &str) -> Result<T, String> {
    let response = send_with_retry(|| http_client().get(url)).await?;
    if !response.status().is_success() {
        return Err(format!("HTTP {} from {url}", response.status()));
    }
    response
        .json::<T>()
        .await
        .map_err(|error| format!("Invalid response from {url}: {error}"))
}

pub fn describe_request_error(error: &reqwest::Error) -> String {
    let mut details = error.to_string();
    let mut source = std::error::Error::source(error);
    while let Some(inner) = source {
        details.push_str(&format!(" -> {inner}"));
        source = std::error::Error::source(inner);
    }
    details
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_agent_contains_package_version() {
        assert!(USER_AGENT.contains(LAUNCHER_VERSION));
    }

    #[test]
    fn retry_delay_grows_and_caps() {
        assert!(retry_delay(1) < retry_delay(2));
        assert_eq!(retry_delay(4), retry_delay(9));
    }

    #[test]
    fn retryable_statuses() {
        assert!(is_retryable_status(reqwest::StatusCode::BAD_GATEWAY));
        assert!(is_retryable_status(reqwest::StatusCode::TOO_MANY_REQUESTS));
        assert!(!is_retryable_status(reqwest::StatusCode::NOT_FOUND));
    }
}
