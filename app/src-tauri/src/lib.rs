// SCZ — Tauri-бэкенд. Хранит ключ в app-config-dir, отдаёт фронтенду команды личности и
// подписи. Приватный ключ наружу не уходит (правило §1): экспорт — явное действие.

mod identity;

use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn key_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("identity.key"))
}

fn read_key(app: &AppHandle) -> Option<String> {
    let p = key_path(app).ok()?;
    let s = fs::read_to_string(p).ok()?.trim().to_lowercase();
    if s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(s)
    } else {
        None
    }
}

#[tauri::command]
fn identity_status(app: AppHandle) -> Value {
    match read_key(&app) {
        Some(sk) => match identity::pubkey_hex(&sk) {
            Ok(pk) => json!({ "hasKey": true, "pubkey": pk }),
            Err(_) => json!({ "hasKey": false }),
        },
        None => json!({ "hasKey": false }),
    }
}

#[tauri::command]
fn identity_create(app: AppHandle) -> Result<Value, String> {
    let sk = identity::generate();
    let pk = identity::pubkey_hex(&sk)?;
    fs::write(key_path(&app)?, &sk).map_err(|e| e.to_string())?;
    // nsec (hex) отдаём один раз для бэкапа; на диске остаётся, фронтенд не хранит
    Ok(json!({ "pubkey": pk, "nsec": sk }))
}

#[tauri::command]
fn identity_import(app: AppHandle, sk: String) -> Result<Value, String> {
    let sk = sk.trim().to_lowercase();
    let pk = identity::pubkey_hex(&sk).map_err(|_| "bad_key".to_string())?;
    fs::write(key_path(&app)?, &sk).map_err(|e| e.to_string())?;
    Ok(json!({ "pubkey": pk }))
}

#[tauri::command]
fn identity_export(app: AppHandle) -> Result<String, String> {
    read_key(&app).ok_or_else(|| "no_key".to_string())
}

#[tauri::command]
fn identity_forget(app: AppHandle) -> Result<(), String> {
    let p = key_path(&app)?;
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn sign_event(app: AppHandle, event: Value) -> Result<Value, String> {
    let sk = read_key(&app).ok_or_else(|| "no_key".to_string())?;
    identity::sign_event(&sk, &event)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            identity_status,
            identity_create,
            identity_import,
            identity_export,
            identity_forget,
            sign_event,
        ])
        .run(tauri::generate_context!())
        .expect("ошибка запуска SCZ");
}
