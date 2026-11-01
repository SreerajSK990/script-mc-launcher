use crate::core::instances::{self, InstanceConfiguration};
use crate::core::paths;
use base64::Engine;
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPlayersInfo {
    pub online: u32,
    pub max: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPingStatus {
    pub online: bool,
    pub latency_ms: i64,
    pub motd: Option<String>,
    pub clean_motd: Option<String>,
    pub version_name: Option<String>,
    pub protocol_version: Option<i32>,
    pub players: Option<ServerPlayersInfo>,
    pub favicon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftServerEntry {
    pub id: String,
    pub instance_id: String,
    pub instance_name: String,
    pub loader_type: String,
    pub minecraft_version: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub icon: Option<String>,
    #[serde(rename = "type")]
    pub entry_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SingleplayerWorldEntry {
    pub id: String,
    pub instance_id: String,
    pub instance_name: String,
    pub loader_type: String,
    pub minecraft_version: String,
    pub name: String,
    pub folder_name: String,
    pub game_mode: String,
    pub last_played: i64,
    pub icon: Option<String>,
    #[serde(rename = "type")]
    pub entry_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum QuickPlayTarget {
    Server(MinecraftServerEntry),
    World(SingleplayerWorldEntry),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddServerPayload {
    pub instance_id: String,
    pub name: String,
    pub ip: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveServerPayload {
    pub instance_id: String,
    pub server_ip: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NbtServerEntry {
    pub name: String,
    pub ip: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default, rename = "acceptTextures")]
    pub accept_textures: Option<i8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServersDatFile {
    pub servers: Vec<NbtServerEntry>,
}

#[derive(Debug, Deserialize)]
struct LevelDatFile {
    #[serde(rename = "Data")]
    data: LevelDatData,
}

#[derive(Debug, Deserialize)]
struct LevelDatData {
    #[serde(rename = "LevelName")]
    level_name: Option<String>,
    #[serde(rename = "GameType")]
    game_type: Option<i32>,
    #[serde(rename = "LastPlayed")]
    last_played: Option<i64>,
}

fn write_var_int(mut val: i32) -> Vec<u8> {
    let mut bytes = Vec::new();
    loop {
        if (val & !0x7f) == 0 {
            bytes.push(val as u8);
            break;
        }
        bytes.push(((val & 0x7f) | 0x80) as u8);
        val = ((val as u32) >> 7) as i32;
    }
    bytes
}

fn read_var_int(buf: &[u8], offset: &mut usize) -> Result<i32, String> {
    let mut result = 0;
    let mut shift = 0;
    while *offset < buf.len() {
        let byte = buf[*offset];
        *offset += 1;
        result |= ((byte & 0x7f) as i32) << shift;
        if (byte & 0x80) == 0 {
            return Ok(result);
        }
        shift += 7;
        if shift >= 35 {
            return Err("VarInt exceeds 35 bits".to_string());
        }
    }
    Err("Unexpected EOF reading VarInt".to_string())
}

fn strip_minecraft_colors(text: &str) -> String {
    let mut result = String::new();
    let mut skip_next = false;
    for c in text.chars() {
        if skip_next {
            skip_next = false;
            continue;
        }
        if c == '§' {
            skip_next = true;
            continue;
        }
        result.push(c);
    }
    result.trim().to_string()
}

pub async fn ping_minecraft_server(host: &str, port: u16) -> ServerPingStatus {
    let timeout_duration = Duration::from_millis(4000);
    match tokio::time::timeout(timeout_duration, ping_internal(host, port)).await {
        Ok(Ok(status)) => status,
        _ => {
            tokio::time::sleep(Duration::from_millis(250)).await;
            match tokio::time::timeout(timeout_duration, ping_internal(host, port)).await {
                Ok(Ok(status)) => status,
                _ => ServerPingStatus {
                    online: false,
                    latency_ms: -1,
                    motd: None,
                    clean_motd: Some("Can't connect to server".to_string()),
                    version_name: None,
                    protocol_version: None,
                    players: None,
                    favicon: None,
                },
            }
        }
    }
}

async fn ping_internal(host: &str, port: u16) -> Result<ServerPingStatus, String> {
    let start_time = std::time::Instant::now();
    let addr = format!("{host}:{port}");
    let mut stream = tokio::net::TcpStream::connect(&addr)
        .await
        .map_err(|e| e.to_string())?;

    let host_bytes = host.as_bytes();
    let mut handshake_payload = Vec::new();
    handshake_payload.extend(write_var_int(0x00));
    handshake_payload.extend(write_var_int(47));
    handshake_payload.extend(write_var_int(host_bytes.len() as i32));
    handshake_payload.extend_from_slice(host_bytes);
    handshake_payload.extend_from_slice(&port.to_be_bytes());
    handshake_payload.extend(write_var_int(1));

    let mut handshake_packet = Vec::new();
    handshake_packet.extend(write_var_int(handshake_payload.len() as i32));
    handshake_packet.extend(handshake_payload);

    let request_packet = vec![0x01, 0x00];

    stream
        .write_all(&handshake_packet)
        .await
        .map_err(|e| e.to_string())?;
    stream
        .write_all(&request_packet)
        .await
        .map_err(|e| e.to_string())?;

    let mut read_buf = Vec::new();
    let mut chunk = [0u8; 8192];
    let mut expected_total: Option<usize> = None;
    let mut first_byte_latency: Option<i64> = None;

    loop {
        let n = stream.read(&mut chunk).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        if first_byte_latency.is_none() {
            first_byte_latency = Some(start_time.elapsed().as_millis() as i64);
        }
        read_buf.extend_from_slice(&chunk[..n]);

        if expected_total.is_none() {
            let mut offset = 0;
            if let Ok(_packet_len) = read_var_int(&read_buf, &mut offset) {
                if let Ok(packet_id) = read_var_int(&read_buf, &mut offset) {
                    if packet_id != 0 {
                        return Err("Unexpected packet id".to_string());
                    }
                    if let Ok(json_len) = read_var_int(&read_buf, &mut offset) {
                        expected_total = Some(offset + (json_len as usize));
                    }
                }
            }
        }

        if let Some(total) = expected_total {
            if read_buf.len() >= total {
                break;
            }
        }
    }

    let latency = first_byte_latency.unwrap_or_else(|| start_time.elapsed().as_millis() as i64);

    let mut offset = 0;
    let _packet_len = read_var_int(&read_buf, &mut offset)?;
    let packet_id = read_var_int(&read_buf, &mut offset)?;
    if packet_id != 0 {
        return Err("Unexpected packet id".to_string());
    }
    let json_len = read_var_int(&read_buf, &mut offset)? as usize;
    if offset + json_len > read_buf.len() {
        return Err("Incomplete JSON packet".to_string());
    }
    let json_str =
        std::str::from_utf8(&read_buf[offset..offset + json_len]).map_err(|e| e.to_string())?;
    let parsed: serde_json::Value =
        serde_json::from_str(json_str).map_err(|e| e.to_string())?;

    let raw_motd = if let Some(desc) = parsed.get("description") {
        if let Some(s) = desc.as_str() {
            s.to_string()
        } else if let Some(text) = desc.get("text").and_then(|t| t.as_str()) {
            text.to_string()
        } else if let Some(extra) = desc.get("extra").and_then(|e| e.as_array()) {
            extra
                .iter()
                .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                .collect()
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let clean_motd = strip_minecraft_colors(&raw_motd);
    let version_name = parsed
        .get("version")
        .and_then(|v| v.get("name"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string());
    let protocol_version = parsed
        .get("version")
        .and_then(|v| v.get("protocol"))
        .and_then(|p| p.as_i64())
        .map(|p| p as i32);
    let players = if let Some(p) = parsed.get("players") {
        let online = p.get("online").and_then(|o| o.as_u64()).unwrap_or(0) as u32;
        let max = p.get("max").and_then(|m| m.as_u64()).unwrap_or(0) as u32;
        Some(ServerPlayersInfo { online, max })
    } else {
        None
    };
    let favicon = parsed
        .get("favicon")
        .and_then(|f| f.as_str())
        .map(|s| s.to_string());

    Ok(ServerPingStatus {
        online: true,
        latency_ms: latency.max(1),
        motd: Some(raw_motd),
        clean_motd: Some(clean_motd),
        version_name,
        protocol_version,
        players,
        favicon,
    })
}

pub fn get_instance_servers(instance: &InstanceConfiguration) -> Vec<MinecraftServerEntry> {
    let servers_dat_path = paths::get_instance_minecraft_path(&instance.id).join("servers.dat");
    if !servers_dat_path.exists() {
        return Vec::new();
    }

    let bytes = match fs::read(&servers_dat_path) {
        Ok(b) => b,
        Err(_) => return Vec::new(),
    };

    let parsed: ServersDatFile = match fastnbt::from_bytes(&bytes) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };

    parsed
        .servers
        .into_iter()
        .enumerate()
        .map(|(idx, s)| {
            let full_ip = s.ip.trim();
            let (ip, port) = if let Some((h, p)) = full_ip.split_once(':') {
                (h.to_string(), p.parse::<u16>().unwrap_or(25565))
            } else {
                (full_ip.to_string(), 25565)
            };

            let icon = s.icon.map(|ic| {
                if ic.starts_with("data:") {
                    ic
                } else {
                    format!("data:image/png;base64,{ic}")
                }
            });

            MinecraftServerEntry {
                id: format!("server_{}_{idx}_{ip}", instance.id),
                instance_id: instance.id.clone(),
                instance_name: instance.name.clone(),
                loader_type: instance.loader_type.clone(),
                minecraft_version: instance.minecraft_version.clone(),
                name: if s.name.is_empty() { ip.clone() } else { s.name },
                ip,
                port,
                icon,
                entry_type: "server".to_string(),
            }
        })
        .collect()
}

pub fn get_instance_worlds(instance: &InstanceConfiguration) -> Vec<SingleplayerWorldEntry> {
    let saves_dir = paths::get_instance_minecraft_path(&instance.id).join("saves");
    if !saves_dir.exists() {
        return Vec::new();
    }

    let entries = match fs::read_dir(&saves_dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut worlds = Vec::new();

    for entry in entries.flatten() {
        if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            let world_folder = entry.file_name().to_string_lossy().to_string();
            let world_path = entry.path();
            let level_dat_path = world_path.join("level.dat");
            let icon_path = world_path.join("icon.png");

            let mut world_name = world_folder.clone();
            let mut game_mode = "Survival".to_string();
            let mut last_played = 0i64;

            if level_dat_path.exists() {
                if let Ok(raw_bytes) = fs::read(&level_dat_path) {
                    let mut decoder = GzDecoder::new(&raw_bytes[..]);
                    if let Ok(level_file) = fastnbt::from_reader::<_, LevelDatFile>(&mut decoder) {
                        if let Some(name) = level_file.data.level_name {
                            world_name = name;
                        }
                        if let Some(mode) = level_file.data.game_type {
                            game_mode = match mode {
                                1 => "Creative".to_string(),
                                2 => "Adventure".to_string(),
                                3 => "Spectator".to_string(),
                                _ => "Survival".to_string(),
                            };
                        }
                        if let Some(time) = level_file.data.last_played {
                            last_played = time;
                        }
                    }
                }
            }

            let icon = if icon_path.exists() {
                fs::read(&icon_path).ok().map(|bytes| {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
                    format!("data:image/png;base64,{b64}")
                })
            } else {
                None
            };

            worlds.push(SingleplayerWorldEntry {
                id: format!("world_{}_{world_folder}", instance.id),
                instance_id: instance.id.clone(),
                instance_name: instance.name.clone(),
                loader_type: instance.loader_type.clone(),
                minecraft_version: instance.minecraft_version.clone(),
                name: world_name,
                folder_name: world_folder,
                game_mode,
                last_played: if last_played == 0 {
                    chrono::Utc::now().timestamp_millis()
                } else {
                    last_played
                },
                icon,
                entry_type: "world".to_string(),
            });
        }
    }

    worlds.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    worlds
}

pub fn get_all_quick_play_targets() -> Result<Vec<QuickPlayTarget>, String> {
    let all_instances = instances::list_all_instances()?;
    let mut targets = Vec::new();

    for instance in all_instances {
        for server in get_instance_servers(&instance) {
            targets.push(QuickPlayTarget::Server(server));
        }
        for world in get_instance_worlds(&instance) {
            targets.push(QuickPlayTarget::World(world));
        }
    }

    Ok(targets)
}

fn normalize_server_address(address: &str) -> (String, u16) {
    let trimmed = address.trim().to_lowercase();
    match trimmed.rsplit_once(':') {
        Some((host, port)) if !host.contains(':') => (host.to_string(), port.parse().unwrap_or(25565)),
        _ => (trimmed, 25565),
    }
}

pub fn addresses_match(left: &str, right: &str) -> bool {
    normalize_server_address(left) == normalize_server_address(right)
}

fn read_servers_dat_value(mc_dir: &Path) -> Result<fastnbt::Value, String> {
    let servers_file = mc_dir.join("servers.dat");
    if !servers_file.is_file() {
        return Ok(fastnbt::Value::Compound(std::collections::HashMap::new()));
    }
    let bytes = fs::read(&servers_file).map_err(|e| e.to_string())?;
    fastnbt::from_bytes::<fastnbt::Value>(&bytes)
        .map_err(|e| format!("servers.dat could not be read, so it was left untouched: {e}"))
}

fn edit_server_list<F>(mc_dir: &Path, edit: F) -> Result<(), String>
where
    F: FnOnce(&mut Vec<fastnbt::Value>),
{
    let mut root = read_servers_dat_value(mc_dir)?;
    let fastnbt::Value::Compound(root_compound) = &mut root else {
        return Err("servers.dat has an unexpected structure, so it was left untouched".to_string());
    };
    let servers_entry = root_compound
        .entry("servers".to_string())
        .or_insert_with(|| fastnbt::Value::List(Vec::new()));
    let fastnbt::Value::List(servers) = servers_entry else {
        return Err("servers.dat has an unexpected structure, so it was left untouched".to_string());
    };
    edit(servers);
    let bytes = fastnbt::to_bytes(&root).map_err(|e| e.to_string())?;
    let target = mc_dir.join("servers.dat");
    if target.is_file() {
        let _ = fs::copy(&target, mc_dir.join("servers.dat_old"));
    }
    crate::core::fs_util::write_bytes_atomic(&target, &bytes)
}

fn server_entry_address(entry: &fastnbt::Value) -> Option<&str> {
    match entry {
        fastnbt::Value::Compound(fields) => match fields.get("ip") {
            Some(fastnbt::Value::String(ip)) => Some(ip.as_str()),
            _ => None,
        },
        _ => None,
    }
}

pub fn add_instance_server(
    instance_id: &str,
    name: &str,
    ip: &str,
) -> Result<Vec<MinecraftServerEntry>, String> {
    crate::core::safety::validate_identifier(instance_id)?;
    let instance = instances::get_instance_by_id(instance_id)?
        .ok_or_else(|| format!("Instance not found: {instance_id}"))?;

    let norm_ip = ip.trim();
    if norm_ip.is_empty() {
        return Err("Server address cannot be empty".to_string());
    }
    let norm_name = if name.trim().is_empty() { norm_ip } else { name.trim() };

    let mc_dir = paths::get_instance_minecraft_path(instance_id);
    edit_server_list(&mc_dir, |servers| {
        if let Some(existing) = servers
            .iter_mut()
            .find(|entry| server_entry_address(entry).is_some_and(|address| addresses_match(address, norm_ip)))
        {
            if let fastnbt::Value::Compound(fields) = existing {
                fields.insert("name".to_string(), fastnbt::Value::String(norm_name.to_string()));
            }
            return;
        }
        let mut fields = std::collections::HashMap::new();
        fields.insert("name".to_string(), fastnbt::Value::String(norm_name.to_string()));
        fields.insert("ip".to_string(), fastnbt::Value::String(norm_ip.to_string()));
        servers.push(fastnbt::Value::Compound(fields));
    })?;
    Ok(get_instance_servers(&instance))
}

pub fn remove_instance_server(
    instance_id: &str,
    server_ip: &str,
) -> Result<Vec<MinecraftServerEntry>, String> {
    crate::core::safety::validate_identifier(instance_id)?;
    let instance = instances::get_instance_by_id(instance_id)?
        .ok_or_else(|| format!("Instance not found: {instance_id}"))?;

    let mc_dir = paths::get_instance_minecraft_path(instance_id);
    edit_server_list(&mc_dir, |servers| {
        servers.retain(|entry| !server_entry_address(entry).is_some_and(|address| addresses_match(address, server_ip)));
    })?;
    Ok(get_instance_servers(&instance))
}

pub fn list_instance_servers(instance_id: &str) -> Result<Vec<MinecraftServerEntry>, String> {
    let instance = instances::get_instance_by_id(instance_id)?
        .ok_or_else(|| format!("Instance not found: {instance_id}"))?;
    Ok(get_instance_servers(&instance))
}

#[cfg(test)]
mod server_list_tests {
    use super::*;

    #[test]
    #[ignore]
    fn real_servers_dat_round_trips() {
        let directory = std::path::PathBuf::from(std::env::var("SERVERS_DAT_DIR").unwrap());
        let original = read_servers_dat_value(&directory).unwrap();
        let encoded = fastnbt::to_bytes(&original).unwrap();
        let decoded: fastnbt::Value = fastnbt::from_bytes(&encoded).unwrap();
        assert_eq!(original, decoded);
    }

    #[test]
    fn address_matching_handles_default_port() {
        assert!(addresses_match("Play.Example.com", "play.example.com:25565"));
        assert!(!addresses_match("play.example.com:25566", "play.example.com"));
    }

    #[test]
    fn edits_preserve_unknown_server_fields() {
        let directory = std::env::temp_dir().join(format!("script-launcher-servers-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        edit_server_list(&directory, |servers| {
            let mut fields = std::collections::HashMap::new();
            fields.insert("name".to_string(), fastnbt::Value::String("Keep".into()));
            fields.insert("ip".to_string(), fastnbt::Value::String("keep.example".into()));
            fields.insert("acceptTextures".to_string(), fastnbt::Value::Byte(1));
            servers.push(fastnbt::Value::Compound(fields));
            let mut other = std::collections::HashMap::new();
            other.insert("name".to_string(), fastnbt::Value::String("Drop".into()));
            other.insert("ip".to_string(), fastnbt::Value::String("drop.example".into()));
            servers.push(fastnbt::Value::Compound(other));
        })
        .unwrap();
        edit_server_list(&directory, |servers| {
            servers.retain(|entry| server_entry_address(entry) != Some("drop.example"));
        })
        .unwrap();
        let root = read_servers_dat_value(&directory).unwrap();
        let fastnbt::Value::Compound(fields) = root else { panic!() };
        let Some(fastnbt::Value::List(servers)) = fields.get("servers") else { panic!() };
        assert_eq!(servers.len(), 1);
        let fastnbt::Value::Compound(kept) = &servers[0] else { panic!() };
        assert_eq!(kept.get("acceptTextures"), Some(&fastnbt::Value::Byte(1)));
        fs::remove_dir_all(directory).unwrap();
    }
}
