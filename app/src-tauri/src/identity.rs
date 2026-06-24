// SCZ — личность. Ключ secp256k1, подпись BIP340 Schnorr (как в Nostr). Всё ТОЛЬКО здесь,
// в Rust: фронтенд приватного ключа не видит и сам не подписывает (правило §1).

use secp256k1::{Keypair, Message, Secp256k1, SecretKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

fn keypair_from_hex(sk_hex: &str) -> Result<Keypair, String> {
    let bytes = hex::decode(sk_hex.trim()).map_err(|_| "bad_key".to_string())?;
    if bytes.len() != 32 {
        return Err("bad_key".to_string());
    }
    let sk = SecretKey::from_slice(&bytes).map_err(|_| "bad_key".to_string())?;
    let secp = Secp256k1::new();
    Ok(Keypair::from_secret_key(&secp, &sk))
}

/// x-only публичный ключ (32 байта hex) из приватного.
pub fn pubkey_hex(sk_hex: &str) -> Result<String, String> {
    let kp = keypair_from_hex(sk_hex)?;
    let (xonly, _parity) = kp.x_only_public_key();
    Ok(hex::encode(xonly.serialize()))
}

/// Новый приватный ключ (64 hex).
pub fn generate() -> String {
    let secp = Secp256k1::new();
    let (sk, _pk) = secp.generate_keypair(&mut rand::thread_rng());
    hex::encode(sk.secret_bytes())
}

/// Подпись события по NIP-01: id = sha256([0,pubkey,created_at,kind,tags,content]),
/// sig = Schnorr(id). На вход {kind, content, tags, created_at?}, на выход полное событие.
pub fn sign_event(sk_hex: &str, event: &Value) -> Result<Value, String> {
    let kp = keypair_from_hex(sk_hex)?;
    let (xonly, _parity) = kp.x_only_public_key();
    let pubkey = hex::encode(xonly.serialize());

    let created_at = event
        .get("created_at")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0)
        });
    let kind = event.get("kind").and_then(|v| v.as_i64()).ok_or("no_kind")?;
    let tags = event.get("tags").cloned().unwrap_or_else(|| json!([]));
    let content = event
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // компактная сериализация массива, как JSON.stringify в расширении
    let ser = json!([0, pubkey, created_at, kind, tags, content]);
    let ser_str = serde_json::to_string(&ser).map_err(|e| e.to_string())?;
    let id_bytes: [u8; 32] = Sha256::digest(ser_str.as_bytes()).into();
    let id_hex = hex::encode(id_bytes);

    let secp = Secp256k1::new();
    let msg = Message::from_digest(id_bytes);
    let sig = secp.sign_schnorr_no_aux_rand(&msg, &kp);
    let sig_hex = hex::encode(sig.as_ref());

    Ok(json!({
        "id": id_hex,
        "pubkey": pubkey,
        "created_at": created_at,
        "kind": kind,
        "tags": tags,
        "content": content,
        "sig": sig_hex,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keygen_roundtrip() {
        let sk = generate();
        assert_eq!(sk.len(), 64);
        let pk = pubkey_hex(&sk).unwrap();
        assert_eq!(pk.len(), 64);
    }

    #[test]
    fn sign_shapes() {
        let sk = generate();
        let ev = json!({"kind": 1, "content": "привет", "tags": [], "created_at": 1700000000});
        let signed = sign_event(&sk, &ev).unwrap();
        assert_eq!(signed["id"].as_str().unwrap().len(), 64);
        assert_eq!(signed["sig"].as_str().unwrap().len(), 128);
        assert_eq!(signed["pubkey"].as_str().unwrap(), pubkey_hex(&sk).unwrap());
    }

    #[test]
    fn reject_bad_key() {
        assert!(pubkey_hex("xyz").is_err());
        assert!(pubkey_hex("00").is_err());
    }
}
