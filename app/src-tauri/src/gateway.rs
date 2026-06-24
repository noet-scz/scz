// SCZ — локальный шлюз. Узел (приложение) поднимает HTTP на 127.0.0.1 и отдаёт браузеру
// зону (встроенные файлы app/zone) + API: подпись личностью и управление ключом. Так
// «всё остальное» (мессенджер, домены, сайты, игры) живёт в браузере, а узел даёт
// идентичность и связь. Это роль бывшего расширения, перенесённая в нативное приложение.

use crate::identity;
use include_dir::{include_dir, Dir};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tiny_http::{Header, Method, Request, Response, Server};

static ZONE: Dir = include_dir!("$CARGO_MANIFEST_DIR/../zone");

fn key_file(cfg: &Path) -> PathBuf {
    cfg.join("identity.key")
}
fn read_key(cfg: &Path) -> Option<String> {
    std::fs::read_to_string(key_file(cfg))
        .ok()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit()))
}
fn write_key(cfg: &Path, sk: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(cfg)?;
    std::fs::write(key_file(cfg), sk)
}

/// Поднять шлюз. Возвращает выбранный порт. Сервер крутится в фоновом потоке.
pub fn start(cfg: PathBuf) -> std::io::Result<u16> {
    let mut bound = None;
    for p in 8788..8800u16 {
        if let Ok(s) = Server::http(("127.0.0.1", p)) {
            bound = Some((s, p));
            break;
        }
    }
    let (server, port) =
        bound.ok_or_else(|| std::io::Error::new(std::io::ErrorKind::AddrInUse, "no free port"))?;
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            handle(req, &cfg);
        }
    });
    Ok(port)
}

fn json_header() -> Header {
    Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap()
}

fn handle(mut req: Request, cfg: &Path) {
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();
    if path.starts_with("/api/") {
        let method = req.method().clone();
        let mut body = String::new();
        if method == Method::Post {
            let _ = req.as_reader().read_to_string(&mut body);
        }
        let (code, val) = handle_api(cfg, &method, &path, &body);
        let data = serde_json::to_vec(&val).unwrap_or_default();
        let resp = Response::from_data(data)
            .with_status_code(code)
            .with_header(json_header());
        let _ = req.respond(resp);
    } else {
        serve_static(req, &path);
    }
}

fn handle_api(cfg: &Path, method: &Method, path: &str, body: &str) -> (u16, Value) {
    match (method, path) {
        (&Method::Get, "/api/identity/status") => match read_key(cfg) {
            Some(sk) => match identity::pubkey_hex(&sk) {
                Ok(pk) => (200, json!({ "hasKey": true, "pubkey": pk })),
                Err(_) => (200, json!({ "hasKey": false })),
            },
            None => (200, json!({ "hasKey": false })),
        },
        (&Method::Get, "/api/nostr/pubkey") => {
            match read_key(cfg).and_then(|sk| identity::pubkey_hex(&sk).ok()) {
                Some(pk) => (200, json!({ "pubkey": pk })),
                None => (200, json!({ "pubkey": Value::Null })),
            }
        }
        (&Method::Post, "/api/nostr/sign") => match read_key(cfg) {
            None => (401, json!({ "error": "no_key" })),
            Some(sk) => match serde_json::from_str::<Value>(body) {
                Ok(ev) => match identity::sign_event(&sk, &ev) {
                    Ok(signed) => (200, signed),
                    Err(e) => (400, json!({ "error": e })),
                },
                Err(_) => (400, json!({ "error": "bad_json" })),
            },
        },
        (&Method::Post, "/api/identity/create") => {
            let sk = identity::generate();
            match identity::pubkey_hex(&sk) {
                Ok(pk) => {
                    let _ = write_key(cfg, &sk);
                    (200, json!({ "pubkey": pk, "nsec": sk }))
                }
                Err(e) => (500, json!({ "error": e })),
            }
        }
        (&Method::Post, "/api/identity/import") => {
            let sk = serde_json::from_str::<Value>(body)
                .ok()
                .and_then(|v| v.get("sk").and_then(|x| x.as_str()).map(|s| s.trim().to_lowercase()));
            match sk {
                Some(sk) => match identity::pubkey_hex(&sk) {
                    Ok(pk) => {
                        let _ = write_key(cfg, &sk);
                        (200, json!({ "pubkey": pk }))
                    }
                    Err(_) => (400, json!({ "error": "bad_key" })),
                },
                None => (400, json!({ "error": "bad_key" })),
            }
        }
        (&Method::Get, "/api/identity/export") => match read_key(cfg) {
            Some(sk) => (200, json!({ "sk": sk })),
            None => (404, json!({ "error": "no_key" })),
        },
        (&Method::Post, "/api/identity/forget") => {
            let _ = std::fs::remove_file(key_file(cfg));
            (200, json!({ "ok": true }))
        }
        _ => (404, json!({ "error": "not_found" })),
    }
}

fn content_type(path: &str) -> &'static str {
    if path.ends_with(".html") { "text/html; charset=utf-8" }
    else if path.ends_with(".js") { "text/javascript; charset=utf-8" }
    else if path.ends_with(".css") { "text/css; charset=utf-8" }
    else if path.ends_with(".svg") { "image/svg+xml" }
    else if path.ends_with(".json") { "application/json" }
    else if path.ends_with(".png") { "image/png" }
    else if path.ends_with(".wasm") { "application/wasm" }
    else { "application/octet-stream" }
}

fn serve_static(req: Request, path: &str) {
    let mut rel = path.trim_start_matches('/').to_string();
    if rel.is_empty() {
        rel = "index.html".to_string();
    }
    // SPA на hash-роутинге: неизвестный путь отдаём как index.html
    let file = ZONE.get_file(&rel).or_else(|| ZONE.get_file("index.html"));
    match file {
        Some(f) => {
            let ct = content_type(&rel);
            let resp = Response::from_data(f.contents().to_vec())
                .with_header(Header::from_bytes(&b"Content-Type"[..], ct.as_bytes()).unwrap());
            let _ = req.respond(resp);
        }
        None => {
            let _ = req.respond(Response::from_string("not found").with_status_code(404));
        }
    }
}
