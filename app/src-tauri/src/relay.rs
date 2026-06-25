// SCZ — сетевой слой В УЗЛЕ (AUDIT #1). Узел держит ПОСТОЯННЫЕ соединения с публичными
// Nostr-реле (Фаза-0, §11) и отдаёт зоне query/publish через локальный API. Соединения не
// открываются на каждый запрос (иначе TLS-хендшейк на каждый = тормоза/висяк), а живут и
// переиспользуются. Сюда же позже ляжет libp2p без изменения приложений (§04).

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::{connect_async, tungstenite::Message};

const RELAYS: [&str; 3] = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"];

static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
pub fn runtime() -> &'static tokio::runtime::Runtime {
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(4)
            .enable_all()
            .build()
            .expect("tokio runtime")
    })
}

struct Pool {
    senders: Vec<mpsc::UnboundedSender<Message>>, // отправка REQ/EVENT/CLOSE в каждое реле
    inbound: broadcast::Sender<String>,           // все входящие сообщения реле
}
static POOL: OnceLock<Pool> = OnceLock::new();
static SUB: AtomicU64 = AtomicU64::new(0);

fn pool() -> &'static Pool {
    POOL.get_or_init(|| {
        let (inbound, _) = broadcast::channel::<String>(8192);
        let mut senders = Vec::new();
        for url in RELAYS {
            let (tx, rx) = mpsc::unbounded_channel::<Message>();
            senders.push(tx);
            let ib = inbound.clone();
            runtime().spawn(relay_task(url, rx, ib));
        }
        Pool { senders, inbound }
    })
}

// одно реле: подключиться, переподключаться при обрыве, гонять сообщения в обе стороны
async fn relay_task(url: &'static str, mut rx: mpsc::UnboundedReceiver<Message>, inbound: broadcast::Sender<String>) {
    loop {
        match connect_async(url).await {
            Ok((ws, _)) => {
                let (mut write, mut read) = ws.split();
                loop {
                    tokio::select! {
                        out = rx.recv() => match out {
                            Some(m) => { if write.send(m).await.is_err() { break; } }
                            None => return, // пул уничтожен
                        },
                        inc = read.next() => match inc {
                            Some(Ok(Message::Text(t))) => { let _ = inbound.send(t); }
                            Some(Ok(Message::Ping(p))) => { let _ = write.send(Message::Pong(p)).await; }
                            Some(Ok(_)) => {}
                            _ => break, // обрыв -> переподключение
                        },
                    }
                }
            }
            Err(_) => {}
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}

fn req_filters(filters: &Value) -> Vec<Value> {
    match filters {
        Value::Array(a) => a.clone(),
        Value::Null => vec![],
        other => vec![other.clone()],
    }
}

/// Запрос ко всем реле через постоянные соединения. Дедуп по id, сортировка по времени убыв.
pub async fn query(filters: Value, timeout_ms: u64) -> Vec<Value> {
    let p = pool();
    let n = p.senders.len();
    let subid = format!("z{}", SUB.fetch_add(1, Ordering::Relaxed));
    let mut rx = p.inbound.subscribe(); // подписаться ДО REQ, чтобы не потерять ответы

    let mut req = vec![json!("REQ"), json!(subid)];
    req.extend(req_filters(&filters));
    let reqmsg = Message::Text(Value::Array(req).to_string());
    for s in &p.senders {
        let _ = s.send(reqmsg.clone());
    }

    let mut seen: HashMap<String, Value> = HashMap::new();
    let mut eose = 0usize;
    let collect = async {
        loop {
            match rx.recv().await {
                Ok(txt) => {
                    if let Ok(a) = serde_json::from_str::<Value>(&txt) {
                        if a.get(1).and_then(|x| x.as_str()) == Some(subid.as_str()) {
                            match a.get(0).and_then(|x| x.as_str()) {
                                Some("EVENT") => {
                                    if let Some(ev) = a.get(2) {
                                        if let Some(id) = ev.get("id").and_then(|x| x.as_str()) {
                                            seen.entry(id.to_string()).or_insert_with(|| ev.clone());
                                        }
                                    }
                                }
                                Some("EOSE") => {
                                    eose += 1;
                                    if eose >= n {
                                        break;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
    };
    let _ = tokio::time::timeout(Duration::from_millis(timeout_ms), collect).await;

    let closemsg = Message::Text(json!(["CLOSE", subid]).to_string());
    for s in &p.senders {
        let _ = s.send(closemsg.clone());
    }

    let mut out: Vec<Value> = seen.into_values().collect();
    out.sort_by(|a, b| {
        let ta = a.get("created_at").and_then(|x| x.as_i64()).unwrap_or(0);
        let tb = b.get("created_at").and_then(|x| x.as_i64()).unwrap_or(0);
        tb.cmp(&ta)
    });
    out
}

/// Опубликовать событие во все реле (мгновенно, по постоянным соединениям).
pub async fn publish(event: Value) {
    let p = pool();
    let msg = Message::Text(json!(["EVENT", event]).to_string());
    for s in &p.senders {
        let _ = s.send(msg.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn query_real_relay() {
        let evs = runtime().block_on(query(json!([{ "kinds": [0], "limit": 3 }]), 6000));
        for e in &evs {
            assert!(e.get("id").is_some());
            assert_eq!(e.get("kind").and_then(|x| x.as_i64()), Some(0));
        }
        println!("got {} events", evs.len());
    }
}
