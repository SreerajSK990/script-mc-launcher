use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

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

const RECONNECT_INTERVAL_SECONDS: u64 = 15;
const FRAME_TIMEOUT_SECONDS: u64 = 5;
const OPCODE_HANDSHAKE: u32 = 0;
const OPCODE_FRAME: u32 = 1;

trait IpcStream: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send {}
impl<T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send> IpcStream for T {}

static ACTIVITY_SENDER: OnceLock<tokio::sync::mpsc::UnboundedSender<Option<serde_json::Value>>> = OnceLock::new();

#[cfg(windows)]
async fn open_discord_socket() -> Option<Box<dyn IpcStream>> {
    use tokio::net::windows::named_pipe::ClientOptions;
    for index in 0..10 {
        if let Ok(client) = ClientOptions::new().open(format!(r"\\.\pipe\discord-ipc-{index}")) {
            return Some(Box::new(client));
        }
    }
    None
}

#[cfg(unix)]
async fn open_discord_socket() -> Option<Box<dyn IpcStream>> {
    let base = ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"]
        .iter()
        .find_map(|key| std::env::var(key).ok())
        .unwrap_or_else(|| "/tmp".to_string());
    for index in 0..10 {
        for folder in ["", "app/com.discordapp.Discord/", "snap.discord/"] {
            let path = std::path::Path::new(&base).join(format!("{folder}discord-ipc-{index}"));
            if let Ok(stream) = tokio::net::UnixStream::connect(&path).await {
                return Some(Box::new(stream));
            }
        }
    }
    None
}

#[cfg(not(any(windows, unix)))]
async fn open_discord_socket() -> Option<Box<dyn IpcStream>> {
    None
}

pub fn encode_frame(opcode: u32, payload: &serde_json::Value) -> Vec<u8> {
    let body = payload.to_string().into_bytes();
    let mut frame = Vec::with_capacity(8 + body.len());
    frame.extend_from_slice(&opcode.to_le_bytes());
    frame.extend_from_slice(&(body.len() as u32).to_le_bytes());
    frame.extend_from_slice(&body);
    frame
}

async fn write_frame(stream: &mut Box<dyn IpcStream>, opcode: u32, payload: &serde_json::Value) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    stream.write_all(&encode_frame(opcode, payload)).await.map_err(|e| e.to_string())?;
    stream.flush().await.map_err(|e| e.to_string())
}

async fn read_frame(stream: &mut Box<dyn IpcStream>) -> Result<(u32, serde_json::Value), String> {
    use tokio::io::AsyncReadExt;
    let read = async {
        let mut header = [0u8; 8];
        stream.read_exact(&mut header).await.map_err(|e| e.to_string())?;
        let opcode = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
        let length = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
        if length > 1024 * 1024 {
            return Err("Discord sent an oversized frame".to_string());
        }
        let mut body = vec![0u8; length];
        stream.read_exact(&mut body).await.map_err(|e| e.to_string())?;
        let value = serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null);
        Ok((opcode, value))
    };
    tokio::time::timeout(std::time::Duration::from_secs(FRAME_TIMEOUT_SECONDS), read)
        .await
        .map_err(|_| "Discord did not respond in time".to_string())?
}

async fn connect_to_discord() -> Option<Box<dyn IpcStream>> {
    let mut stream = open_discord_socket().await?;
    let handshake = serde_json::json!({ "v": 1, "client_id": DISCORD_CLIENT_ID });
    write_frame(&mut stream, OPCODE_HANDSHAKE, &handshake).await.ok()?;
    let (_, ready) = read_frame(&mut stream).await.ok()?;
    if ready.get("evt").and_then(|v| v.as_str()) != Some("READY") {
        return None;
    }
    Some(stream)
}

async fn push_activity(stream: &mut Box<dyn IpcStream>, activity: &Option<serde_json::Value>) -> Result<(), String> {
    let mut args = serde_json::json!({ "pid": std::process::id() });
    if let Some(activity) = activity {
        args["activity"] = activity.clone();
    }
    let frame = serde_json::json!({
        "cmd": "SET_ACTIVITY",
        "args": args,
        "nonce": uuid::Uuid::new_v4().to_string()
    });
    write_frame(stream, OPCODE_FRAME, &frame).await?;
    read_frame(stream).await.map(|_| ())
}

async fn run_presence_client(mut updates: tokio::sync::mpsc::UnboundedReceiver<Option<serde_json::Value>>) {
    let mut desired: Option<serde_json::Value> = None;
    let mut published = false;
    let mut connection: Option<Box<dyn IpcStream>> = None;
    let mut retry = tokio::time::interval(std::time::Duration::from_secs(RECONNECT_INTERVAL_SECONDS));
    loop {
        tokio::select! {
            update = updates.recv() => {
                match update {
                    Some(next) => {
                        desired = next;
                        published = false;
                    }
                    None => return,
                }
            }
            _ = retry.tick() => {}
        }
        if published || (desired.is_none() && connection.is_none()) {
            continue;
        }
        if connection.is_none() {
            connection = connect_to_discord().await;
        }
        if let Some(stream) = connection.as_mut() {
            match push_activity(stream, &desired).await {
                Ok(()) => published = true,
                Err(_) => connection = None,
            }
        }
    }
}

fn publish(activity: Option<serde_json::Value>) {
    let sender = ACTIVITY_SENDER.get_or_init(|| {
        let (sender, receiver) = tokio::sync::mpsc::unbounded_channel();
        tauri::async_runtime::spawn(run_presence_client(receiver));
        sender
    });
    let _ = sender.send(activity);
}

pub async fn set_activity(payload: SetDiscordActivityPayload) -> Result<(), String> {
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

    publish(Some(activity_json));
    Ok(())
}

pub async fn clear_activity() -> Result<(), String> {
    publish(None);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn live_discord_handshake_and_activity() {
        let mut stream = connect_to_discord().await.expect("Discord handshake failed");
        push_activity(&mut stream, &Some(serde_json::json!({ "details": "Connection test" }))).await.unwrap();
        push_activity(&mut stream, &None).await.unwrap();
    }

    #[test]
    fn frames_use_little_endian_header() {
        let frame = encode_frame(1, &serde_json::json!({"a": 1}));
        assert_eq!(&frame[0..4], &1u32.to_le_bytes());
        assert_eq!(u32::from_le_bytes([frame[4], frame[5], frame[6], frame[7]]) as usize, frame.len() - 8);
    }
}
