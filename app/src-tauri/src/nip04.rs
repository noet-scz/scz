// noet — личные сообщения (NIP-04). Шифрование в узле: ECDH(my_priv, their_pub).x как ключ
// AES-256-CBC. Это Фаза-0 (NIP-04 простой и совместимый); цель NIP-44 по роадмапу.

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::RngCore;
use secp256k1::{ecdh, PublicKey, SecretKey};

type Enc = cbc::Encryptor<aes::Aes256>;
type Dec = cbc::Decryptor<aes::Aes256>;

fn shared_key(sk_hex: &str, their_xonly_hex: &str) -> Result<[u8; 32], String> {
    let sk = SecretKey::from_slice(&hex::decode(sk_hex.trim()).map_err(|_| "bad_key")?)
        .map_err(|_| "bad_key")?;
    let mut pkb = vec![2u8];
    pkb.extend(hex::decode(their_xonly_hex.trim()).map_err(|_| "bad_pub")?);
    let pk = PublicKey::from_slice(&pkb).map_err(|_| "bad_pub")?;
    let point = ecdh::shared_secret_point(&pk, &sk); // [u8; 64] = x||y
    let mut key = [0u8; 32];
    key.copy_from_slice(&point[..32]); // NIP-04: сырой X, без хэширования
    Ok(key)
}

pub fn encrypt(sk_hex: &str, their: &str, plain: &str) -> Result<String, String> {
    let key = shared_key(sk_hex, their)?;
    let mut iv = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut iv);
    let ct = Enc::new(&key.into(), &iv.into()).encrypt_padded_vec_mut::<Pkcs7>(plain.as_bytes());
    Ok(format!("{}?iv={}", STANDARD.encode(ct), STANDARD.encode(iv)))
}

pub fn decrypt(sk_hex: &str, their: &str, content: &str) -> Result<String, String> {
    let key = shared_key(sk_hex, their)?;
    let mut it = content.splitn(2, "?iv=");
    let ctb = STANDARD
        .decode(it.next().unwrap_or(""))
        .map_err(|_| "bad_content")?;
    let ivv = STANDARD
        .decode(it.next().ok_or("bad_content")?)
        .map_err(|_| "bad_content")?;
    if ivv.len() != 16 {
        return Err("bad_iv".to_string());
    }
    let mut iv = [0u8; 16];
    iv.copy_from_slice(&ivv);
    let pt = Dec::new(&key.into(), &iv.into())
        .decrypt_padded_vec_mut::<Pkcs7>(&ctb)
        .map_err(|_| "decrypt_failed")?;
    Ok(String::from_utf8_lossy(&pt).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity;

    #[test]
    fn roundtrip() {
        let a = identity::generate();
        let b = identity::generate();
        let pa = identity::pubkey_hex(&a).unwrap();
        let pb = identity::pubkey_hex(&b).unwrap();
        let msg = "привет, это шифр 🔒";
        let ct = encrypt(&a, &pb, msg).unwrap();
        assert!(ct.contains("?iv="));
        // получатель расшифровывает ключом отправителя (общий ключ симметричен)
        assert_eq!(decrypt(&b, &pa, &ct).unwrap(), msg);
        // отправитель тоже может прочитать свой шифр (ключом получателя)
        assert_eq!(decrypt(&a, &pb, &ct).unwrap(), msg);
    }
}
