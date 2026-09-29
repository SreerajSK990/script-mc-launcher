use crate::core::paths;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VanillaGameOptions {
    pub render_distance: f64,
    pub simulation_distance: f64,
    pub max_fps: f64,
    pub fov: f64,
    pub graphics_mode: String,
    pub enable_vsync: bool,
    pub fullscreen: bool,
    pub gamma: f64,
    pub gui_scale: f64,
    pub smooth_lighting: bool,
    pub view_bobbing: bool,
    pub entity_shadows: bool,
    pub entity_distance_scaling: f64,
    pub particles: String,
    pub render_clouds: String,
    pub mipmap_levels: f64,
    pub attack_indicator: String,

    #[serde(rename = "soundCategory_master")]
    pub sound_category_master: f64,
    #[serde(rename = "soundCategory_music")]
    pub sound_category_music: f64,
    #[serde(rename = "soundCategory_weather")]
    pub sound_category_weather: f64,
    #[serde(rename = "soundCategory_block")]
    pub sound_category_block: f64,
    #[serde(rename = "soundCategory_hostile")]
    pub sound_category_hostile: f64,
    #[serde(rename = "soundCategory_neutral")]
    pub sound_category_neutral: f64,
    #[serde(rename = "soundCategory_player")]
    pub sound_category_player: f64,
    #[serde(rename = "soundCategory_ambient")]
    pub sound_category_ambient: f64,
    #[serde(rename = "soundCategory_voice")]
    pub sound_category_voice: f64,
    pub show_subtitles: bool,

    pub mouse_sensitivity: f64,
    pub invert_y_mouse: bool,
    pub auto_jump: bool,
    pub raw_mouse_input: bool,
    pub pause_on_lost_focus: bool,
}

impl Default for VanillaGameOptions {
    fn default() -> Self {
        Self {
            render_distance: 12.0,
            simulation_distance: 12.0,
            max_fps: 120.0,
            fov: 70.0,
            graphics_mode: "fancy".to_string(),
            enable_vsync: false,
            fullscreen: false,
            gamma: 0.5,
            gui_scale: 0.0,
            smooth_lighting: true,
            view_bobbing: true,
            entity_shadows: true,
            entity_distance_scaling: 1.0,
            particles: "all".to_string(),
            render_clouds: "fancy".to_string(),
            mipmap_levels: 4.0,
            attack_indicator: "crosshair".to_string(),
            sound_category_master: 1.0,
            sound_category_music: 0.5,
            sound_category_weather: 1.0,
            sound_category_block: 1.0,
            sound_category_hostile: 1.0,
            sound_category_neutral: 1.0,
            sound_category_player: 1.0,
            sound_category_ambient: 1.0,
            sound_category_voice: 1.0,
            show_subtitles: false,
            mouse_sensitivity: 0.5,
            invert_y_mouse: false,
            auto_jump: false,
            raw_mouse_input: true,
            pause_on_lost_focus: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SodiumGameOptions {
    pub smooth_lighting: String,
    pub biome_blend: i64,
    pub entity_distance_scaling: i64,
    pub entity_shadows: bool,
    pub vignette: bool,
    pub leaves_quality: String,
    pub weather_quality: String,
    pub particle_quality: String,

    pub chunk_builder_threads: i64,
    pub always_defer_chunk_updates: bool,
    pub use_block_face_culling: bool,
    pub use_fog_occlusion: bool,
    pub use_entity_culling: bool,
    pub use_compact_vertex_format: bool,
    pub animate_only_visible_textures: bool,

    pub cpu_render_ahead_limit: i64,
    pub allow_direct_memory_access: bool,
}

impl Default for SodiumGameOptions {
    fn default() -> Self {
        Self {
            smooth_lighting: "HIGH".to_string(),
            biome_blend: 7,
            entity_distance_scaling: 100,
            entity_shadows: true,
            vignette: true,
            leaves_quality: "HIGH".to_string(),
            weather_quality: "HIGH".to_string(),
            particle_quality: "HIGH".to_string(),
            chunk_builder_threads: 0,
            always_defer_chunk_updates: true,
            use_block_face_culling: true,
            use_fog_occlusion: true,
            use_entity_culling: true,
            use_compact_vertex_format: true,
            animate_only_visible_textures: true,
            cpu_render_ahead_limit: 3,
            allow_direct_memory_access: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptiFineGameOptions {
    pub of_smooth_fps: bool,
    pub of_smooth_world: bool,
    pub of_fast_render: bool,
    pub of_fast_math: bool,
    pub of_dynamic_lights: String,
    pub of_dynamic_fov: bool,
    pub of_connected_textures: String,
    pub of_custom_sky: bool,
    pub of_custom_fonts: bool,
    pub of_custom_colors: bool,
    pub of_better_grass: String,
    pub of_better_snow: bool,
    pub of_clear_water: bool,
    pub of_show_fps: bool,
    pub of_fog_type: String,
}

impl Default for OptiFineGameOptions {
    fn default() -> Self {
        Self {
            of_smooth_fps: false,
            of_smooth_world: false,
            of_fast_render: false,
            of_fast_math: false,
            of_dynamic_lights: "off".to_string(),
            of_dynamic_fov: true,
            of_connected_textures: "fancy".to_string(),
            of_custom_sky: true,
            of_custom_fonts: true,
            of_custom_colors: true,
            of_better_grass: "off".to_string(),
            of_better_snow: false,
            of_clear_water: false,
            of_show_fps: false,
            of_fog_type: "fast".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSettingsPayload {
    pub vanilla: VanillaGameOptions,
    pub sodium: Option<SodiumGameOptions>,
    pub optifine: Option<OptiFineGameOptions>,
    pub has_options_txt: bool,
    pub is_sodium_installed: bool,
    pub is_opti_fine_installed: bool,
}

fn parse_fov(raw: &str) -> f64 {
    let val: f64 = raw.parse().unwrap_or(70.0);
    if (0.0..=1.0).contains(&val) {
        (70.0 + val * 40.0).round()
    } else {
        val.round().clamp(30.0, 110.0)
    }
}

fn parse_bool(raw: &str, fallback: bool) -> bool {
    match raw {
        "true" | "1" => true,
        "false" | "0" => false,
        _ => fallback,
    }
}

fn parse_number(raw: &str, fallback: f64) -> f64 {
    raw.parse::<f64>().unwrap_or(fallback)
}

pub fn read_game_settings(instance_id: &str) -> Result<GameSettingsPayload, String> {
    let mc_path = paths::get_instance_minecraft_path(instance_id);
    if !mc_path.exists() {
        fs::create_dir_all(&mc_path).map_err(|e| e.to_string())?;
    }

    let options_path = mc_path.join("options.txt");
    let optifine_path = mc_path.join("optionsof.txt");
    let sodium_config_path = mc_path.join("config").join("sodium-options.json");
    let sodium_root_path = mc_path.join("sodium-options.json");
    let mods_path = mc_path.join("mods");

    let mut has_options_txt = false;
    let mut is_sodium_installed = false;
    let mut is_opti_fine_installed = false;

    if mods_path.is_dir() {
        if let Ok(entries) = fs::read_dir(&mods_path) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.contains("sodium") || name.contains("rubidium") || name.contains("embeddium") {
                    is_sodium_installed = true;
                }
                if name.contains("optifine") {
                    is_opti_fine_installed = true;
                }
            }
        }
    }

    let mut vanilla = VanillaGameOptions::default();

    if options_path.is_file() {
        has_options_txt = true;
        if let Ok(content) = fs::read_to_string(&options_path) {
            for line in content.lines() {
                let Some((key, val)) = line.split_once(':') else {
                    continue;
                };
                let key = key.trim();
                let val = val.trim();

                match key {
                    "renderDistance" => vanilla.render_distance = parse_number(val, vanilla.render_distance),
                    "simulationDistance" => vanilla.simulation_distance = parse_number(val, vanilla.simulation_distance),
                    "maxFps" => vanilla.max_fps = parse_number(val, vanilla.max_fps),
                    "fov" => vanilla.fov = parse_fov(val),
                    "graphicsMode" => {
                        if val == "fast" || val == "fancy" || val == "fabulous" {
                            vanilla.graphics_mode = val.to_string();
                        }
                    }
                    "enableVsync" => vanilla.enable_vsync = parse_bool(val, vanilla.enable_vsync),
                    "fullscreen" => vanilla.fullscreen = parse_bool(val, vanilla.fullscreen),
                    "gamma" => vanilla.gamma = parse_number(val, vanilla.gamma),
                    "guiScale" => vanilla.gui_scale = parse_number(val, vanilla.gui_scale),
                    "smoothLighting" => vanilla.smooth_lighting = parse_bool(val, vanilla.smooth_lighting),
                    "viewBobbing" => vanilla.view_bobbing = parse_bool(val, vanilla.view_bobbing),
                    "entityShadows" => vanilla.entity_shadows = parse_bool(val, vanilla.entity_shadows),
                    "entityDistanceScaling" => vanilla.entity_distance_scaling = parse_number(val, vanilla.entity_distance_scaling),
                    "particles" => {
                        if val == "all" || val == "decreased" || val == "minimal" {
                            vanilla.particles = val.to_string();
                        }
                    }
                    "renderClouds" => {
                        if val == "false" || val == "off" {
                            vanilla.render_clouds = "off".to_string();
                        } else if val == "fast" {
                            vanilla.render_clouds = "fast".to_string();
                        } else {
                            vanilla.render_clouds = "fancy".to_string();
                        }
                    }
                    "mipmapLevels" => vanilla.mipmap_levels = parse_number(val, vanilla.mipmap_levels),
                    "attackIndicator" => {
                        if val == "crosshair" || val == "hotbar" || val == "off" {
                            vanilla.attack_indicator = val.to_string();
                        }
                    }
                    "soundCategory_master" => vanilla.sound_category_master = parse_number(val, vanilla.sound_category_master),
                    "soundCategory_music" => vanilla.sound_category_music = parse_number(val, vanilla.sound_category_music),
                    "soundCategory_weather" => vanilla.sound_category_weather = parse_number(val, vanilla.sound_category_weather),
                    "soundCategory_block" => vanilla.sound_category_block = parse_number(val, vanilla.sound_category_block),
                    "soundCategory_hostile" => vanilla.sound_category_hostile = parse_number(val, vanilla.sound_category_hostile),
                    "soundCategory_neutral" => vanilla.sound_category_neutral = parse_number(val, vanilla.sound_category_neutral),
                    "soundCategory_player" => vanilla.sound_category_player = parse_number(val, vanilla.sound_category_player),
                    "soundCategory_ambient" => vanilla.sound_category_ambient = parse_number(val, vanilla.sound_category_ambient),
                    "soundCategory_voice" => vanilla.sound_category_voice = parse_number(val, vanilla.sound_category_voice),
                    "showSubtitles" => vanilla.show_subtitles = parse_bool(val, vanilla.show_subtitles),
                    "mouseSensitivity" => vanilla.mouse_sensitivity = parse_number(val, vanilla.mouse_sensitivity),
                    "invertYMouse" => vanilla.invert_y_mouse = parse_bool(val, vanilla.invert_y_mouse),
                    "autoJump" => vanilla.auto_jump = parse_bool(val, vanilla.auto_jump),
                    "rawMouseInput" => vanilla.raw_mouse_input = parse_bool(val, vanilla.raw_mouse_input),
                    "pauseOnLostFocus" => vanilla.pause_on_lost_focus = parse_bool(val, vanilla.pause_on_lost_focus),
                    _ => {}
                }
            }
        }
    }

    let mut sodium = None;
    let actual_sodium_path = if sodium_config_path.is_file() {
        Some(sodium_config_path)
    } else if sodium_root_path.is_file() {
        Some(sodium_root_path)
    } else {
        None
    };

    if let Some(target) = actual_sodium_path {
        is_sodium_installed = true;
        if let Ok(raw) = fs::read_to_string(target) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) {
                let def = SodiumGameOptions::default();
                let quality = parsed.get("quality");
                let perf = parsed.get("performance");
                let adv = parsed.get("advanced");

                sodium = Some(SodiumGameOptions {
                    smooth_lighting: quality.and_then(|q| q.get("smooth_lighting")).and_then(|v| v.as_str()).unwrap_or(&def.smooth_lighting).to_string(),
                    biome_blend: quality.and_then(|q| q.get("biome_blend")).and_then(|v| v.as_i64()).unwrap_or(def.biome_blend),
                    entity_distance_scaling: quality.and_then(|q| q.get("entity_distance_scaling")).and_then(|v| v.as_i64()).unwrap_or(def.entity_distance_scaling),
                    entity_shadows: quality.and_then(|q| q.get("entity_shadows")).and_then(|v| v.as_bool()).unwrap_or(def.entity_shadows),
                    vignette: quality.and_then(|q| q.get("vignette")).and_then(|v| v.as_bool()).unwrap_or(def.vignette),
                    leaves_quality: quality.and_then(|q| q.get("leaves_quality")).and_then(|v| v.as_str()).unwrap_or(&def.leaves_quality).to_string(),
                    weather_quality: quality.and_then(|q| q.get("weather_quality")).and_then(|v| v.as_str()).unwrap_or(&def.weather_quality).to_string(),
                    particle_quality: quality.and_then(|q| q.get("particle_quality")).and_then(|v| v.as_str()).unwrap_or(&def.particle_quality).to_string(),
                    chunk_builder_threads: perf.and_then(|p| p.get("chunk_builder_threads")).and_then(|v| v.as_i64()).unwrap_or(def.chunk_builder_threads),
                    always_defer_chunk_updates: perf.and_then(|p| p.get("always_defer_chunk_updates")).and_then(|v| v.as_bool()).unwrap_or(def.always_defer_chunk_updates),
                    use_block_face_culling: perf.and_then(|p| p.get("use_block_face_culling")).and_then(|v| v.as_bool()).unwrap_or(def.use_block_face_culling),
                    use_fog_occlusion: perf.and_then(|p| p.get("use_fog_occlusion")).and_then(|v| v.as_bool()).unwrap_or(def.use_fog_occlusion),
                    use_entity_culling: perf.and_then(|p| p.get("use_entity_culling")).and_then(|v| v.as_bool()).unwrap_or(def.use_entity_culling),
                    use_compact_vertex_format: perf.and_then(|p| p.get("use_compact_vertex_format")).and_then(|v| v.as_bool()).unwrap_or(def.use_compact_vertex_format),
                    animate_only_visible_textures: perf.and_then(|p| p.get("animate_only_visible_textures")).and_then(|v| v.as_bool()).unwrap_or(def.animate_only_visible_textures),
                    cpu_render_ahead_limit: adv.and_then(|a| a.get("cpu_render_ahead_limit")).and_then(|v| v.as_i64()).unwrap_or(def.cpu_render_ahead_limit),
                    allow_direct_memory_access: adv.and_then(|a| a.get("allow_direct_memory_access")).and_then(|v| v.as_bool()).unwrap_or(def.allow_direct_memory_access),
                });
            }
        }
    } else if is_sodium_installed {
        sodium = Some(SodiumGameOptions::default());
    }

    let mut optifine = None;
    if optifine_path.is_file() {
        is_opti_fine_installed = true;
        if let Ok(content) = fs::read_to_string(&optifine_path) {
            let mut of = OptiFineGameOptions::default();
            for line in content.lines() {
                let Some((key, val)) = line.split_once(':') else {
                    continue;
                };
                let key = key.trim();
                let val = val.trim();

                match key {
                    "ofSmoothFps" => of.of_smooth_fps = parse_bool(val, of.of_smooth_fps),
                    "ofSmoothWorld" => of.of_smooth_world = parse_bool(val, of.of_smooth_world),
                    "ofFastRender" => of.of_fast_render = parse_bool(val, of.of_fast_render),
                    "ofFastMath" => of.of_fast_math = parse_bool(val, of.of_fast_math),
                    "ofDynamicLights" => {
                        of.of_dynamic_lights = if val == "3" {
                            "fancy".to_string()
                        } else if val == "2" {
                            "fast".to_string()
                        } else {
                            "off".to_string()
                        };
                    }
                    "ofDynamicFov" => of.of_dynamic_fov = parse_bool(val, of.of_dynamic_fov),
                    "ofConnectedTextures" => {
                        of.of_connected_textures = if val == "3" {
                            "fancy".to_string()
                        } else if val == "2" {
                            "fast".to_string()
                        } else {
                            "off".to_string()
                        };
                    }
                    "ofCustomSky" => of.of_custom_sky = parse_bool(val, of.of_custom_sky),
                    "ofCustomFonts" => of.of_custom_fonts = parse_bool(val, of.of_custom_fonts),
                    "ofCustomColors" => of.of_custom_colors = parse_bool(val, of.of_custom_colors),
                    "ofBetterGrass" => {
                        of.of_better_grass = if val == "3" {
                            "fancy".to_string()
                        } else if val == "2" {
                            "fast".to_string()
                        } else {
                            "off".to_string()
                        };
                    }
                    "ofBetterSnow" => of.of_better_snow = parse_bool(val, of.of_better_snow),
                    "ofClearWater" => of.of_clear_water = parse_bool(val, of.of_clear_water),
                    "ofShowFps" => of.of_show_fps = parse_bool(val, of.of_show_fps),
                    "ofFogType" => {
                        of.of_fog_type = if val == "2" {
                            "fancy".to_string()
                        } else if val == "1" {
                            "fast".to_string()
                        } else {
                            "off".to_string()
                        };
                    }
                    _ => {}
                }
            }
            optifine = Some(of);
        }
    } else if is_opti_fine_installed {
        optifine = Some(OptiFineGameOptions::default());
    }

    Ok(GameSettingsPayload {
        vanilla,
        sodium,
        optifine,
        has_options_txt,
        is_sodium_installed,
        is_opti_fine_installed,
    })
}

pub fn save_game_settings(instance_id: &str, payload: &GameSettingsPayload) -> Result<bool, String> {
    let mc_path = paths::get_instance_minecraft_path(instance_id);
    if !mc_path.exists() {
        fs::create_dir_all(&mc_path).map_err(|e| e.to_string())?;
    }

    let mut managed_keys = HashMap::new();
    managed_keys.insert("renderDistance", format!("{}", payload.vanilla.render_distance as i64));
    managed_keys.insert("simulationDistance", format!("{}", payload.vanilla.simulation_distance as i64));
    managed_keys.insert("maxFps", format!("{}", payload.vanilla.max_fps as i64));
    managed_keys.insert("fov", format!("{:.1}", payload.vanilla.fov));
    managed_keys.insert("graphicsMode", payload.vanilla.graphics_mode.clone());
    managed_keys.insert("enableVsync", format!("{}", payload.vanilla.enable_vsync));
    managed_keys.insert("fullscreen", format!("{}", payload.vanilla.fullscreen));
    managed_keys.insert("gamma", format!("{:.2}", payload.vanilla.gamma));
    managed_keys.insert("guiScale", format!("{}", payload.vanilla.gui_scale as i64));
    managed_keys.insert("smoothLighting", format!("{}", payload.vanilla.smooth_lighting));
    managed_keys.insert("viewBobbing", format!("{}", payload.vanilla.view_bobbing));
    managed_keys.insert("entityShadows", format!("{}", payload.vanilla.entity_shadows));
    managed_keys.insert("entityDistanceScaling", format!("{:.2}", payload.vanilla.entity_distance_scaling));
    managed_keys.insert("particles", payload.vanilla.particles.clone());
    managed_keys.insert("renderClouds", payload.vanilla.render_clouds.clone());
    managed_keys.insert("mipmapLevels", format!("{}", payload.vanilla.mipmap_levels as i64));
    managed_keys.insert("attackIndicator", payload.vanilla.attack_indicator.clone());

    managed_keys.insert("soundCategory_master", format!("{:.2}", payload.vanilla.sound_category_master));
    managed_keys.insert("soundCategory_music", format!("{:.2}", payload.vanilla.sound_category_music));
    managed_keys.insert("soundCategory_weather", format!("{:.2}", payload.vanilla.sound_category_weather));
    managed_keys.insert("soundCategory_block", format!("{:.2}", payload.vanilla.sound_category_block));
    managed_keys.insert("soundCategory_hostile", format!("{:.2}", payload.vanilla.sound_category_hostile));
    managed_keys.insert("soundCategory_neutral", format!("{:.2}", payload.vanilla.sound_category_neutral));
    managed_keys.insert("soundCategory_player", format!("{:.2}", payload.vanilla.sound_category_player));
    managed_keys.insert("soundCategory_ambient", format!("{:.2}", payload.vanilla.sound_category_ambient));
    managed_keys.insert("soundCategory_voice", format!("{:.2}", payload.vanilla.sound_category_voice));
    managed_keys.insert("showSubtitles", format!("{}", payload.vanilla.show_subtitles));

    managed_keys.insert("mouseSensitivity", format!("{:.2}", payload.vanilla.mouse_sensitivity));
    managed_keys.insert("invertYMouse", format!("{}", payload.vanilla.invert_y_mouse));
    managed_keys.insert("autoJump", format!("{}", payload.vanilla.auto_jump));
    managed_keys.insert("rawMouseInput", format!("{}", payload.vanilla.raw_mouse_input));
    managed_keys.insert("pauseOnLostFocus", format!("{}", payload.vanilla.pause_on_lost_focus));

    let options_path = mc_path.join("options.txt");
    let mut written_keys = HashSet::new();
    let mut new_lines = Vec::new();

    if options_path.is_file() {
        if let Ok(existing) = fs::read_to_string(&options_path) {
            for line in existing.lines() {
                if let Some((key, _)) = line.split_once(':') {
                    let key = key.trim();
                    if let Some(val) = managed_keys.get(key) {
                        new_lines.push(format!("{key}:{val}"));
                        written_keys.insert(key.to_string());
                    } else {
                        new_lines.push(line.to_string());
                    }
                } else if !line.trim().is_empty() {
                    new_lines.push(line.to_string());
                }
            }
        }
    }

    for (key, val) in &managed_keys {
        if !written_keys.contains(*key) {
            new_lines.push(format!("{key}:{val}"));
        }
    }

    fs::write(&options_path, new_lines.join("\n")).map_err(|e| e.to_string())?;

    if let Some(s) = &payload.sodium {
        let config_dir = mc_path.join("config");
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
        }
        let target_sodium_path = config_dir.join("sodium-options.json");

        let mut root_val: serde_json::Value = if target_sodium_path.is_file() {
            fs::read_to_string(&target_sodium_path)
                .ok()
                .and_then(|r| serde_json::from_str(&r).ok())
                .unwrap_or_else(|| serde_json::json!({}))
        } else {
            serde_json::json!({})
        };

        if !root_val.is_object() {
            root_val = serde_json::json!({});
        }

        let obj = root_val.as_object_mut().unwrap();

        let mut quality = obj.entry("quality").or_insert_with(|| serde_json::json!({})).as_object().cloned().unwrap_or_default();
        quality.insert("smooth_lighting".to_string(), serde_json::json!(s.smooth_lighting));
        quality.insert("biome_blend".to_string(), serde_json::json!(s.biome_blend));
        quality.insert("entity_distance_scaling".to_string(), serde_json::json!(s.entity_distance_scaling));
        quality.insert("entity_shadows".to_string(), serde_json::json!(s.entity_shadows));
        quality.insert("vignette".to_string(), serde_json::json!(s.vignette));
        quality.insert("leaves_quality".to_string(), serde_json::json!(s.leaves_quality));
        quality.insert("weather_quality".to_string(), serde_json::json!(s.weather_quality));
        quality.insert("particle_quality".to_string(), serde_json::json!(s.particle_quality));
        obj.insert("quality".to_string(), serde_json::Value::Object(quality));

        let mut perf = obj.entry("performance").or_insert_with(|| serde_json::json!({})).as_object().cloned().unwrap_or_default();
        perf.insert("chunk_builder_threads".to_string(), serde_json::json!(s.chunk_builder_threads));
        perf.insert("always_defer_chunk_updates".to_string(), serde_json::json!(s.always_defer_chunk_updates));
        perf.insert("use_block_face_culling".to_string(), serde_json::json!(s.use_block_face_culling));
        perf.insert("use_fog_occlusion".to_string(), serde_json::json!(s.use_fog_occlusion));
        perf.insert("use_entity_culling".to_string(), serde_json::json!(s.use_entity_culling));
        perf.insert("use_compact_vertex_format".to_string(), serde_json::json!(s.use_compact_vertex_format));
        perf.insert("animate_only_visible_textures".to_string(), serde_json::json!(s.animate_only_visible_textures));
        obj.insert("performance".to_string(), serde_json::Value::Object(perf));

        let mut adv = obj.entry("advanced").or_insert_with(|| serde_json::json!({})).as_object().cloned().unwrap_or_default();
        adv.insert("cpu_render_ahead_limit".to_string(), serde_json::json!(s.cpu_render_ahead_limit));
        adv.insert("allow_direct_memory_access".to_string(), serde_json::json!(s.allow_direct_memory_access));
        obj.insert("advanced".to_string(), serde_json::Value::Object(adv));

        let json_str = serde_json::to_string_pretty(&root_val).map_err(|e| e.to_string())?;
        fs::write(target_sodium_path, json_str).map_err(|e| e.to_string())?;
    }

    if let Some(of) = &payload.optifine {
        let optifine_path = mc_path.join("optionsof.txt");
        let mut of_managed = HashMap::new();
        of_managed.insert("ofSmoothFps", format!("{}", of.of_smooth_fps));
        of_managed.insert("ofSmoothWorld", format!("{}", of.of_smooth_world));
        of_managed.insert("ofFastRender", format!("{}", of.of_fast_render));
        of_managed.insert("ofFastMath", format!("{}", of.of_fast_math));
        of_managed.insert("ofDynamicLights", match of.of_dynamic_lights.as_str() {
            "fancy" => "3".to_string(),
            "fast" => "2".to_string(),
            _ => "1".to_string(),
        });
        of_managed.insert("ofDynamicFov", format!("{}", of.of_dynamic_fov));
        of_managed.insert("ofConnectedTextures", match of.of_connected_textures.as_str() {
            "fancy" => "3".to_string(),
            "fast" => "2".to_string(),
            _ => "1".to_string(),
        });
        of_managed.insert("ofCustomSky", format!("{}", of.of_custom_sky));
        of_managed.insert("ofCustomFonts", format!("{}", of.of_custom_fonts));
        of_managed.insert("ofCustomColors", format!("{}", of.of_custom_colors));
        of_managed.insert("ofBetterGrass", match of.of_better_grass.as_str() {
            "fancy" => "3".to_string(),
            "fast" => "2".to_string(),
            _ => "1".to_string(),
        });
        of_managed.insert("ofBetterSnow", format!("{}", of.of_better_snow));
        of_managed.insert("ofClearWater", format!("{}", of.of_clear_water));
        of_managed.insert("ofShowFps", format!("{}", of.of_show_fps));
        of_managed.insert("ofFogType", match of.of_fog_type.as_str() {
            "fancy" => "2".to_string(),
            "fast" => "1".to_string(),
            _ => "3".to_string(),
        });

        let mut of_written = HashSet::new();
        let mut of_lines = Vec::new();

        if optifine_path.is_file() {
            if let Ok(existing) = fs::read_to_string(&optifine_path) {
                for line in existing.lines() {
                    if let Some((key, _)) = line.split_once(':') {
                        let key = key.trim();
                        if let Some(val) = of_managed.get(key) {
                            of_lines.push(format!("{key}:{val}"));
                            of_written.insert(key.to_string());
                        } else {
                            of_lines.push(line.to_string());
                        }
                    } else if !line.trim().is_empty() {
                        of_lines.push(line.to_string());
                    }
                }
            }
        }

        for (key, val) in &of_managed {
            if !of_written.contains(*key) {
                of_lines.push(format!("{key}:{val}"));
            }
        }

        fs::write(optifine_path, of_lines.join("\n")).map_err(|e| e.to_string())?;
    }

    Ok(true)
}

pub fn open_game_settings_file(instance_id: &str, file_type: &str) -> Result<(), String> {
    let mc_path = paths::get_instance_minecraft_path(instance_id);
    if !mc_path.exists() {
        fs::create_dir_all(&mc_path).map_err(|e| e.to_string())?;
    }

    let target_path: PathBuf = match file_type {
        "sodium" => {
            let config_path = mc_path.join("config").join("sodium-options.json");
            if config_path.is_file() {
                config_path
            } else {
                mc_path.join("config")
            }
        }
        "optifine" => mc_path.join("optionsof.txt"),
        _ => mc_path.join("options.txt"),
    };

    if target_path.exists() {
        if cfg!(target_os = "windows") && target_path.is_file() {
            let _ = std::process::Command::new("explorer")
                .arg(format!("/select,{}", target_path.to_string_lossy()))
                .spawn();
            return Ok(());
        }
        open::that(target_path).map_err(|e| e.to_string())?;
    } else {
        open::that(mc_path).map_err(|e| e.to_string())?;
    }

    Ok(())
}
