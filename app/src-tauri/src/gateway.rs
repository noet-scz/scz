// SCZ — локальный шлюз. Узел (приложение) поднимает HTTP на 127.0.0.1 и отдаёт браузеру
// зону (встроенные файлы app/zone) + API: подпись личностью и управление ключом. Так
// «всё остальное» (мессенджер, домены, сайты, игры) живёт в браузере, а узел даёт
// идентичность и связь. Это роль бывшего расширения, перенесённая в нативное приложение.

use crate::identity;
use include_dir::{include_dir, Dir};
use serde_json::{json, Value};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tiny_http::{Header, Method, Request, Response, Server};

static ZONE: Dir = include_dir!("$CARGO_MANIFEST_DIR/../zone");

pub fn key_file(cfg: &Path) -> PathBuf {
    cfg.join("identity.key")
}
pub fn read_key(cfg: &Path) -> Option<String> {
    std::fs::read_to_string(key_file(cfg))
        .ok()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit()))
}
pub fn write_key(cfg: &Path, sk: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(cfg)?;
    std::fs::write(key_file(cfg), sk)
}

pub fn accounts_dir(cfg: &Path) -> PathBuf {
    cfg.join("accounts")
}
// сохранить ключ как аккаунт (файл accounts/<pubkey>.key), вернуть pubkey
pub fn save_account(cfg: &Path, sk: &str) -> Result<String, String> {
    let pk = identity::pubkey_hex(sk)?;
    let dir = accounts_dir(cfg);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{}.key", pk)), sk).map_err(|e| e.to_string())?;
    Ok(pk)
}
pub fn list_accounts(cfg: &Path) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(accounts_dir(cfg)) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if let Some(pk) = name.strip_suffix(".key") {
                if pk.len() == 64 && pk.chars().all(|c| c.is_ascii_hexdigit()) {
                    out.push(pk.to_string());
                }
            }
        }
    }
    out.sort();
    out
}
pub fn dir_size(p: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(rd) = std::fs::read_dir(p) {
        for e in rd.flatten() {
            let path = e.path();
            if path.is_dir() {
                total += dir_size(&path);
            } else if let Ok(m) = e.metadata() {
                total += m.len();
            }
        }
    }
    total
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

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => match u8::from_str_radix(&s[i + 1..i + 3], 16) {
                Ok(v) => { out.push(v); i += 3; }
                Err(_) => { out.push(b'%'); i += 1; }
            },
            b'+' => { out.push(b' '); i += 1; }
            c => { out.push(c); i += 1; }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

// прокси картинки: узел качает по URL (без браузерного Referer) и отдаёт зоне со своего
// origin. Обходит хотлинк-защиту (imgur и пр.) и CORS.
fn serve_img(req: Request, url_full: &str) {
    let q = url_full.splitn(2, '?').nth(1).unwrap_or("");
    let raw = q.split('&').find_map(|kv| kv.strip_prefix("u=")).unwrap_or("");
    let u = pct_decode(raw);
    if !(u.starts_with("http://") || u.starts_with("https://")) {
        let _ = req.respond(Response::from_string("bad url").with_status_code(400));
        return;
    }
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(8))
        .timeout_read(Duration::from_secs(12))
        .build();
    match agent.get(&u).call() {
        Ok(resp) => {
            let ct = resp.header("Content-Type").unwrap_or("application/octet-stream").to_string();
            let mut buf = Vec::new();
            let _ = resp.into_reader().take(8 * 1024 * 1024).read_to_end(&mut buf);
            let mut r = Response::from_data(buf)
                .with_header(Header::from_bytes(&b"Content-Type"[..], ct.as_bytes()).unwrap());
            if let Ok(h) = Header::from_bytes(&b"Cache-Control"[..], &b"public, max-age=86400"[..]) {
                r = r.with_header(h);
            }
            let _ = req.respond(r);
        }
        Err(_) => { let _ = req.respond(Response::from_string("fetch failed").with_status_code(502)); }
    }
}

fn handle(mut req: Request, cfg: &Path) {
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();
    if path == "/api/img" {
        serve_img(req, &url);
        return;
    }
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
            match save_account(cfg, &sk) {
                Ok(pk) => {
                    let _ = write_key(cfg, &sk);
                    (200, json!({ "pubkey": pk, "nsec": sk }))
                }
                Err(e) => (500, json!({ "error": e })),
            }
        }
        // import = добавить аккаунт И сделать активным; add = добавить без переключения
        (&Method::Post, "/api/identity/import") | (&Method::Post, "/api/identity/add") => {
            let sk = serde_json::from_str::<Value>(body)
                .ok()
                .and_then(|v| v.get("sk").and_then(|x| x.as_str()).map(|s| s.trim().to_lowercase()));
            match sk.and_then(|sk| save_account(cfg, &sk).ok().map(|pk| (sk, pk))) {
                Some((sk, pk)) => {
                    if path == "/api/identity/import" {
                        let _ = write_key(cfg, &sk);
                    }
                    (200, json!({ "pubkey": pk }))
                }
                None => (400, json!({ "error": "bad_key" })),
            }
        }
        (&Method::Get, "/api/identity/accounts") => {
            let active = read_key(cfg).and_then(|sk| identity::pubkey_hex(&sk).ok());
            (200, json!({ "accounts": list_accounts(cfg), "active": active }))
        }
        (&Method::Post, "/api/identity/switch") => {
            let pk = serde_json::from_str::<Value>(body)
                .ok()
                .and_then(|v| v.get("pubkey").and_then(|x| x.as_str()).map(|s| s.to_lowercase()));
            match pk {
                Some(pk) => {
                    let f = accounts_dir(cfg).join(format!("{}.key", pk));
                    match std::fs::read_to_string(&f).ok().map(|s| s.trim().to_string()) {
                        Some(sk) if sk.len() == 64 => {
                            let _ = write_key(cfg, &sk);
                            (200, json!({ "pubkey": pk }))
                        }
                        _ => (404, json!({ "error": "no_account" })),
                    }
                }
                None => (400, json!({ "error": "no_account" })),
            }
        }
        (&Method::Get, "/api/storage") => {
            (200, json!({ "bytes": dir_size(cfg), "accounts": list_accounts(cfg).len() }))
        }
        (&Method::Get, "/api/identity/export") => match read_key(cfg) {
            Some(sk) => (200, json!({ "sk": sk })),
            None => (404, json!({ "error": "no_key" })),
        },
        (&Method::Post, "/api/identity/forget") => {
            // удалить активный аккаунт; если есть другие, переключиться на первый
            if let Some(pk) = read_key(cfg).and_then(|sk| identity::pubkey_hex(&sk).ok()) {
                let _ = std::fs::remove_file(accounts_dir(cfg).join(format!("{}.key", pk)));
            }
            let _ = std::fs::remove_file(key_file(cfg));
            if let Some(next) = list_accounts(cfg).into_iter().next() {
                if let Ok(sk) = std::fs::read_to_string(accounts_dir(cfg).join(format!("{}.key", next))) {
                    let _ = write_key(cfg, sk.trim());
                }
            }
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
