// SCZ — мост к Rust-личности. Приватный ключ и подпись живут в бэкенде (правило §1).
const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);

let _pubkey = null;   // кэш текущего pubkey (для UI без лишних invoke)

export async function status() {
  const s = await invoke('identity_status');
  _pubkey = s && s.hasKey ? s.pubkey : null;
  return s;
}
export function pubkey() { return _pubkey; }

export async function create() {
  const r = await invoke('identity_create');   // { pubkey, nsec } nsec показываем один раз
  _pubkey = r.pubkey;
  return r;
}
export async function importKey(sk) {
  const r = await invoke('identity_import', { sk });
  _pubkey = r.pubkey;
  return r;
}
export async function exportKey() { return invoke('identity_export'); }   // hex приватного ключа
export async function forget() { _pubkey = null; return invoke('identity_forget'); }

// подписать событие {kind, content, tags, created_at?} -> полное событие с id/pubkey/sig
export async function signEvent(event) { return invoke('sign_event', { event }); }
