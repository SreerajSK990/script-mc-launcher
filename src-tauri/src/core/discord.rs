use serde::{Deserialize, Serialize};
use std::sync::Mutex;

const DISCORD_CLIENT_ID: &str = "1551298504155201598";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDiscordActivityPayload {
    pub page: Option<String>,
    pub instance_name: Option<String>,
    pub minecraft_version: Option<String>,
    pub loader_type: Option<String>,
    pub server_name: Option<String>,
    pub server_ip: Option<String>,
    pub is_playing: Option<bool>,
    pub start_time: Option<u64>,
}

static LAST_PAYLOAD: Mutex<Option<SetDiscordActivityPayload>> = Mutex::new(None);

#[cfg(windows)]
async fn send_discord_ipc(opcode: u32, payload_json: &str) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    use tokio::net::windows::named_pipe::ClientOptions;

    let pipe_path = r"\\.\pipe\discord-ipc-0";
    let mut client = ClientOptions::new().open(pipe_path).map_err(|e| e.to_string())?;

    let bytes = payload_json.as_bytes();
    let len = bytes.len() as u32;

    let mut packet = Vec::with_capacity(8 + bytes.len());
    packet.extend_from_slice(&opcode.to_le_bytes());
    packet.extend_from_slice(&len.to_le_bytes());
    packet.extend_from_slice(bytes);

    client.write_all(&packet).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(windows))]
async fn send_discord_ipc(_opcode: u32, _payload_json: &str) -> Result<(), String> {
    Ok(())
}

pub async fn set_activity(payload: SetDiscordActivityPayload) -> Result<(), String> {
    *LAST_PAYLOAD.lock().unwrap() = Some(payload.clone());

    let (details, state, small_image, small_text) = if payload.is_playing.unwrap_or(false) {
        let loader = payload.loader_type.unwrap_or_else(|| "Vanilla".to_string());
        let loader_cap = if let Some(first) = loader.chars().next() {
            format!("{}{}", first.to_uppercase(), &loader[1..])
        } else {
            "Vanilla".to_string()
        };
        let version = payload.minecraft_version.unwrap_or_else(|| "Latest".to_string());
        let state_text = if let Some(ref sname) = payload.server_name {
            format!("On {sname}")
        } else {
            format!("{version} • {loader_cap}")
        };
        (
            format!("Playing {}", payload.instance_name.unwrap_or_else(|| "Minecraft".to_string())),
            state_text,
            Some(loader.to_lowercase()),
            Some(format!("{loader_cap} Loader")),
        )
    } else {
        let (d, s) = match payload.page.as_deref().unwrap_or("dashboard") {
            "instances" => ("Browsing Instances".to_string(), "Selecting Instance".to_string()),
            "instance-detail" => (
                format!("Managing {}", payload.instance_name.unwrap_or_else(|| "Instance".to_string())),
                payload
                    .minecraft_version
                    .map(|v| format!("{v} ({})", payload.loader_type.unwrap_or_default().to_uppercase()))
                    .unwrap_or_else(|| "Configuring Instance".to_string()),
            ),
            "mods" => ("Browsing Mods & Packs".to_string(), "Searching Modrinth & CurseForge".to_string()),
            "skins" => ("Customizing Player Skin".to_string(), "In Skin Studio".to_string()),
            "settings" => ("Configuring Launcher".to_string(), "Tweaking Settings".to_string()),
            "logs" => ("Viewing Live Logs".to_string(), "In Console".to_string()),
            _ => ("Exploring Dashboard".to_string(), "In Launcher".to_string()),
        };
        (d, s, None, None)
    };

    let mut activity_json = serde_json::json!({
        "details": details,
        "state": state,
        "assets": {
            "large_image": "app_icon",
            "large_text": "Script Minecraft Launcher"
        },
        "buttons": [
            {
                "label": "Get Launcher",
                "url": "https://github.com/SreerajSK990/script-mc-launcher"
            }
        ]
    });

    if let Some(st) = payload.start_time {
        activity_json["timestamps"] = serde_json::json!({ "start": st });
    }
    if let (Some(img), Some(txt)) = (small_image, small_text) {
        activity_json["assets"]["small_image"] = serde_json::json!(img);
        activity_json["assets"]["small_text"] = serde_json::json!(txt);
    }

    let frame = serde_json::json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": std::process::id(),
            "activity": activity_json
        },
        "nonce": uuid::Uuid::new_v4().to_string()
    });

    let handshake = serde_json::json!({
        "v": 1,
        "client_id": DISCORD_CLIENT_ID
    });

    let _ = send_discord_ipc(0, &handshake.to_string()).await;
    let _ = send_discord_ipc(1, &frame.to_string()).await;

    Ok(())
}

pub async fn clear_activity() -> Result<(), String> {
    *LAST_PAYLOAD.lock().unwrap() = None;
    let frame = serde_json::json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": std::process::id()
        },
        "nonce": uuid::Uuid::new_v4().to_string()
    });
    let _ = send_discord_ipc(1, &frame.to_string()).await;
    Ok(())
}
