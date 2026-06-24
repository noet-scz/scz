// SCZ — узел (бэкбон). Поднимает локальный шлюз (зона для браузера + API подписи),
// хранит личность, умеет самообновление (Tauri updater). Нативное окно тонкое: статус,
// кнопка «Открыть SCZ в браузере», обновление. Всё остальное живёт в браузере.

mod gateway;
mod identity;

use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

struct Node {
    port: u16,
}

fn cfg_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("scz"))
}

#[tauri::command]
fn gateway_url(state: tauri::State<'_, Node>) -> String {
    format!("http://127.0.0.1:{}/", state.port)
}

#[tauri::command]
fn open_zone(state: tauri::State<'_, Node>) -> Result<(), String> {
    open::that(format!("http://127.0.0.1:{}/", state.port)).map_err(|e| e.to_string())
}

#[tauri::command]
fn identity_status(app: AppHandle) -> Value {
    let cfg = cfg_dir(&app);
    let p = cfg.join("identity.key");
    match fs::read_to_string(p).ok().map(|s| s.trim().to_lowercase()) {
        Some(sk) if sk.len() == 64 && sk.chars().all(|c| c.is_ascii_hexdigit()) => {
            match identity::pubkey_hex(&sk) {
                Ok(pk) => json!({ "hasKey": true, "pubkey": pk }),
                Err(_) => json!({ "hasKey": false }),
            }
        }
        _ => json!({ "hasKey": false }),
    }
}

#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<String>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => Ok(Some(update.version.clone())),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
        app.restart();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let cfg = cfg_dir(&app.handle());
            let _ = fs::create_dir_all(&cfg);
            let port = gateway::start(cfg).unwrap_or(0);
            app.manage(Node { port });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            gateway_url,
            open_zone,
            identity_status,
            check_update,
            install_update,
        ])
        .run(tauri::generate_context!())
        .expect("ошибка запуска SCZ");
}
