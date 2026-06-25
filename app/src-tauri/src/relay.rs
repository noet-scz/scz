// SCZ — сетевой слой В УЗЛЕ (AUDIT #1). Узел сам держит соединения с публичными Nostr-реле
// (Фаза-0, §11) и отдаёт зоне query/publish через локальный API. Зона больше не лезет в
// реле напрямую. Сюда же позже ляжет libp2p без изменения приложений (§04).

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const RELAYS: [&str; 3] = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"];

static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
pub fn runtime() -> &'static tokio::runtime::Runtime {
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("tokio runtime")
    })
}

fn req_filters(filters: &Value) -> Vec<Value> {
    match filters {
        Value::Array(a) => a.clone(),
        Value::Null => vec![],
        other => vec![other.clone()],
    }
}

async fn query_one(url: &str, filters: Value, timeout_ms: u64) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    let (mut ws, _) = match connect_async(url).await {
        Ok(x) => x,
        Err(_) => return out,
    };
    let mut req = vec![json!("REQ"), json!("q")];
    req.extend(req_filters(&filters));
    if ws
        .send(Message::Text(Value::Array(req).to_string()))
        .await
        .is_err()
    {
        return out;
    }
    let read = async {
        while let Some(Ok(msg)) = ws.next().await {
            if let Message::Text(txt) = msg {
                if let Ok(a) = serde_json::from_str::<Value>(&txt) {
                    match a.get(0).and_then(|x| x.as_str()) {
                        Some("EVENT") => {
                            if let Some(ev) = a.get(2) {
                                out.push(ev.clone());
                            }
                        }
                        Some("EOSE") => {
                            let _ = ws.send(Message::Text(json!(["CLOSE", "q"]).to_string())).await;
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }
    };
    let _ = tokio::time::timeout(Duration::from_millis(timeout_ms), read).await;
    out
}

/// Запрос ко всем реле, дедуп по id, сортировка по времени убыв.
pub async fn query(filters: Value, timeout_ms: u64) -> Vec<Value> {
    let tasks: Vec<_> = RELAYS
        .iter()
        .map(|url| {
            let f = filters.clone();
            tokio::spawn(async move { query_one(url, f, timeout_ms).await })
        })
        .collect();
    let mut seen: HashMap<String, Value> = HashMap::new();
    for h in futures_util::future::join_all(tasks).await {
        if let Ok(evs) = h {
            for ev in evs {
                if let Some(id) = ev.get("id").and_then(|x| x.as_str()) {
                    seen.entry(id.to_string()).or_insert(ev);
                }
            }
        }
    }
    let mut out: Vec<Value> = seen.into_values().collect();
    out.sort_by(|a, b| {
        let ta = a.get("created_at").and_then(|x| x.as_i64()).unwrap_or(0);
        let tb = b.get("created_at").and_then(|x| x.as_i64()).unwrap_or(0);
        tb.cmp(&ta)
    });
    out
}

async fn publish_one(url: &str, event: Value) {
    if let Ok((mut ws, _)) = connect_async(url).await {
        let _ = ws
            .send(Message::Text(json!(["EVENT", event]).to_string()))
            .await;
        let wait = async {
            while let Some(Ok(msg)) = ws.next().await {
                if let Message::Text(t) = msg {
                    if let Ok(a) = serde_json::from_str::<Value>(&t) {
                        if a.get(0).and_then(|x| x.as_str()) == Some("OK") {
                            break;
                        }
                    }
                }
            }
        };
        let _ = tokio::time::timeout(Duration::from_millis(2500), wait).await;
    }
}

pub async fn publish(event: Value) {
    let tasks: Vec<_> = RELAYS
        .iter()
        .map(|url| {
            let e = event.clone();
            tokio::spawn(async move { publish_one(url, e).await })
        })
        .collect();
    let _ = futures_util::future::join_all(tasks).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn query_real_relay() {
        // живой запрос к публичному реле: профили (kind 0). Проверяет, что узел реально
        // ходит в сеть. Может быть пустым при сетевых проблемах, но не должен паниковать.
        let evs = runtime().block_on(query(json!([{ "kinds": [0], "limit": 3 }]), 6000));
        for e in &evs {
            assert!(e.get("id").is_some());
            assert_eq!(e.get("kind").and_then(|x| x.as_i64()), Some(0));
        }
        println!("got {} events", evs.len());
    }
}
