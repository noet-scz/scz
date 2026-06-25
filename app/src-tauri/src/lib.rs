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
fn identity_accounts(app: AppHandle) -> Value {
    let cfg = cfg_dir(&app);
    let active = gateway::read_key(&cfg).and_then(|sk| identity::pubkey_hex(&sk).ok());
    json!({ "accounts": gateway::list_accounts(&cfg), "active": active })
}

#[tauri::command]
fn identity_create(app: AppHandle) -> Result<Value, String> {
    let cfg = cfg_dir(&app);
    let sk = identity::generate();
    let pk = gateway::save_account(&cfg, &sk)?;
    gateway::write_key(&cfg, &sk).map_err(|e| e.to_string())?;
    Ok(json!({ "pubkey": pk, "nsec": sk }))
}

// добавить аккаунт (без переключения)
#[tauri::command]
fn identity_add(app: AppHandle, sk: String) -> Result<Value, String> {
    let cfg = cfg_dir(&app);
    let sk = sk.trim().to_lowercase();
    let pk = gateway::save_account(&cfg, &sk).map_err(|_| "bad_key".to_string())?;
    Ok(json!({ "pubkey": pk }))
}

#[tauri::command]
fn identity_switch(app: AppHandle, pubkey: String) -> Result<(), String> {
    let cfg = cfg_dir(&app);
    let f = gateway::accounts_dir(&cfg).join(format!("{}.key", pubkey.to_lowercase()));
    let sk = fs::read_to_string(f).map_err(|_| "no_account".to_string())?;
    let sk = sk.trim();
    if sk.len() != 64 {
        return Err("no_account".to_string());
    }
    gateway::write_key(&cfg, sk).map_err(|e| e.to_string())
}

#[tauri::command]
fn identity_forget(app: AppHandle) -> Result<(), String> {
    let cfg = cfg_dir(&app);
    if let Some(pk) = gateway::read_key(&cfg).and_then(|sk| identity::pubkey_hex(&sk).ok()) {
        let _ = fs::remove_file(gateway::accounts_dir(&cfg).join(format!("{}.key", pk)));
    }
    let _ = fs::remove_file(gateway::key_file(&cfg));
    if let Some(next) = gateway::list_accounts(&cfg).into_iter().next() {
        if let Ok(sk) = fs::read_to_string(gateway::accounts_dir(&cfg).join(format!("{}.key", next))) {
            let _ = gateway::write_key(&cfg, sk.trim());
        }
    }
    Ok(())
}

#[tauri::command]
fn identity_export(app: AppHandle) -> Result<String, String> {
    gateway::read_key(&cfg_dir(&app)).ok_or_else(|| "no_key".to_string())
}

#[tauri::command]
fn storage_info(app: AppHandle) -> Value {
    let cfg = cfg_dir(&app);
    json!({ "bytes": gateway::dir_size(&cfg), "accounts": gateway::list_accounts(&cfg).len() })
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
            if port != 0 {
                let _ = open::that(format!("http://127.0.0.1:{}/", port));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            gateway_url,
            open_zone,
            identity_status,
            identity_accounts,
            identity_create,
            identity_add,
            identity_switch,
            identity_forget,
            identity_export,
            storage_info,
            check_update,
            install_update,
        ])
        .run(tauri::generate_context!())
        .expect("ошибка запуска SCZ");
}
