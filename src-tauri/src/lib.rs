use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex}, thread, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    display_name: String,
    input_device_id: Option<String>,
    output_device_id: Option<String>,
    push_to_talk: bool,
    push_to_talk_key: String,
    voice_activity: bool,
    echo_cancellation: bool,
    noise_suppression: bool,
    auto_gain_control: bool,
    mic_bitrate_kbps: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            display_name: String::new(),
            input_device_id: None,
            output_device_id: None,
            push_to_talk: false,
            push_to_talk_key: "Space".into(),
            voice_activity: true,
            echo_cancellation: true,
            noise_suppression: true,
            auto_gain_control: false,
            mic_bitrate_kbps: 96,
        }
    }
}

#[derive(Default)]
struct PttState(Mutex<Option<Arc<AtomicBool>>>);

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn read_settings(app: &AppHandle) -> AppSettings {
    let Ok(path) = settings_path(app) else { return AppSettings::default(); };
    fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

#[tauri::command]
fn get_settings(app: AppHandle) -> AppSettings { read_settings(&app) }

#[tauri::command]
fn save_settings(app: AppHandle, patch: Value) -> Result<AppSettings, String> {
    let mut current = serde_json::to_value(read_settings(&app)).map_err(|e| e.to_string())?;
    if let (Some(dst), Some(src)) = (current.as_object_mut(), patch.as_object()) {
        for (k, v) in src { dst.insert(k.clone(), v.clone()); }
    }
    let settings: AppSettings = serde_json::from_value(current).map_err(|e| e.to_string())?;
    let path = settings_path(&app)?;
    fs::write(path, serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(settings)
}

fn key_to_vk(code: &str) -> Option<i32> {
    if code.len() == 4 && code.starts_with("Key") {
        return code.chars().nth(3).map(|c| c.to_ascii_uppercase() as i32);
    }
    if code.starts_with("Digit") { return code.chars().last().map(|c| c as i32); }
    match code {
        "Space" => Some(0x20), "Enter" => Some(0x0D), "Tab" => Some(0x09),
        "ShiftLeft" | "ShiftRight" => Some(0x10), "ControlLeft" | "ControlRight" => Some(0x11),
        "AltLeft" | "AltRight" => Some(0x12), "CapsLock" => Some(0x14),
        "F1" => Some(0x70), "F2" => Some(0x71), "F3" => Some(0x72), "F4" => Some(0x73),
        "F5" => Some(0x74), "F6" => Some(0x75), "F7" => Some(0x76), "F8" => Some(0x77),
        "F9" => Some(0x78), "F10" => Some(0x79), "F11" => Some(0x7A), "F12" => Some(0x7B),
        _ => None,
    }
}

#[tauri::command]
fn configure_push_to_talk(app: AppHandle, state: State<PttState>, enabled: bool, key: String) -> Value {
    if let Some(stop) = state.0.lock().unwrap().take() { stop.store(true, Ordering::Relaxed); }
    if !enabled { return json!({"ok": true, "global": true, "message": "PTT desativado"}); }
    let Some(vk) = key_to_vk(&key) else { return json!({"ok": false, "global": false, "message": "Tecla PTT não suportada"}); };
    let stop = Arc::new(AtomicBool::new(false));
    *state.0.lock().unwrap() = Some(stop.clone());
    thread::spawn(move || {
        let mut previous = false;
        while !stop.load(Ordering::Relaxed) {
            #[cfg(windows)]
            let pressed = unsafe { (windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState(vk) as u16 & 0x8000) != 0 };
            #[cfg(not(windows))]
            let pressed = false;
            if pressed != previous { previous = pressed; let _ = app.emit("ptt-state", pressed); }
            thread::sleep(Duration::from_millis(15));
        }
    });
    json!({"ok": true, "global": true, "message": "PTT global ativo"})
}

#[tauri::command]
fn get_gpu_info() -> Value {
    json!({"featureStatus": {"video_encode": "WebView2 / Windows"}, "basicInfo": null, "supportedVideoCodecs": []})
}

#[tauri::command]
fn app_version(app: AppHandle) -> String { app.package_info().version.to_string() }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PttState::default())
        .invoke_handler(tauri::generate_handler![get_settings, save_settings, configure_push_to_talk, get_gpu_info, app_version])
        .run(tauri::generate_context!())
        .expect("error while running CriaCord");
}
