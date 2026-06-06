// noet — мост личности. Работает в скрытом iframe на origin id.nt.
// Здесь и ТОЛЬКО здесь живёт ключ (nsec в localStorage этого origin) — другие сайты
// зоны его не видят. Страницы общаются с мостом через postMessage; подпись/логин
// разрешены лишь доверенным origin'ам (search/relay/profile/id), чтение личности — всем.
import { schnorr } from '/vendor/noble-secp256k1.js';

const LS = localStorage;
const hex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
async function sha256hex(str) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); return hex(new Uint8Array(h)); }
const nip07 = () => !!window.nostr;

const K = { sk: 'noet_sk', token: 'noet_token', profile: 'noet_profile' };
const getSk = () => LS.getItem(K.sk);
const TRUSTED = ['search.nt', 'relay.nt', 'profile.nt', 'id.nt'];
const trusted = (origin) => { try { return TRUSTED.includes(new URL(origin).hostname); } catch { return false; } };

async function pubkey() {
  if (nip07()) return await window.nostr.getPublicKey();
  let sk = getSk();
  if (!sk) { sk = hex(schnorr.utils.randomPrivateKey()); LS.setItem(K.sk, sk); }
  return hex(schnorr.getPublicKey(fromHex(sk)));
}
const serialize = (ev) => JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
async function sign(ev) {
  ev.created_at = ev.created_at || Math.floor(Date.now() / 1000);
  ev.tags = ev.tags || []; ev.content = ev.content || '';
  if (nip07()) return await window.nostr.signEvent(ev);
  ev.pubkey = await pubkey();
  ev.id = await sha256hex(serialize(ev));
  ev.sig = hex(await schnorr.sign(fromHex(ev.id), fromHex(getSk())));
  return ev;
}
const j = async (path, opts) => { const r = await fetch(path, opts); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const authH = () => { const t = LS.getItem(K.token); return t ? { authorization: 'Bearer ' + t } : {}; };

const OPS = {
  async whoami() {
    let loggedIn = false, pk = null, handle = null;
    const t = LS.getItem(K.token);
    if (t) { const r = await j('/api/me', { headers: authH() }); if (r.status === 200) { loggedIn = true; pk = r.json.pubkey; handle = r.json.handle; } else LS.removeItem(K.token); }
    if (!pk && (nip07() || getSk())) { try { pk = await pubkey(); } catch {} }
    let profile = null; try { profile = JSON.parse(LS.getItem(K.profile) || 'null'); } catch {}
    return { loggedIn, pubkey: pk, handle, profile, nip07: nip07(), hasKey: nip07() || !!getSk() };
  },
  async genKey() {
    const sk = hex(schnorr.utils.randomPrivateKey()); LS.setItem(K.sk, sk);
    return { pubkey: hex(schnorr.getPublicKey(fromHex(sk))), nsec: sk };
  },
  async importKey({ nsec }) {
    const v = String(nsec || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(v)) throw new Error('ключ: 64 hex-символа');
    LS.setItem(K.sk, v);
    return { pubkey: hex(schnorr.getPublicKey(fromHex(v))) };
  },
  async exportKey() { const sk = getSk(); if (!sk) throw new Error('ключ в этом браузере не хранится'); return { nsec: sk }; },
  async forgetKey() { LS.removeItem(K.sk); LS.removeItem(K.token); LS.removeItem(K.profile); return { ok: true }; },
  async logout() { LS.removeItem(K.token); return { ok: true }; },
  async login({ handle, invite }) {
    const pk = await pubkey();
    const ch = (await (await fetch('/api/auth/challenge')).json()).challenge;
    const ev = await sign({ kind: 22242, tags: [['challenge', ch]], content: '', pubkey: pk });
    const r = await j('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: ev, handle, invite }) });
    if (r.status !== 200) throw new Error(r.json.error || ('login ' + r.status));
    LS.setItem(K.token, r.json.token);
    return { loggedIn: true, pubkey: r.json.pubkey, handle: r.json.handle, registered: r.json.registered };
  },
  async signEvent({ event }) { return { event: await sign(event) }; },
  async publishProfile({ name, picture, about }) {
    const content = JSON.stringify({ name: name || '', picture: picture || '', about: about || '' });
    const ev = await sign({ kind: 0, tags: [], content });
    LS.setItem(K.profile, JSON.stringify({ name, picture, about }));
    return { event: ev };
  },
  async claim({ name, cid, title }) {
    const r = await j('/api/claim', { method: 'POST', headers: { 'content-type': 'application/json', ...authH() }, body: JSON.stringify({ name, cid, title }) });
    if (r.status !== 201) throw new Error(r.json.error || ('claim ' + r.status));
    return r.json;
  },
};

const OPEN = new Set(['whoami']); // доступно любому origin зоны
window.addEventListener('message', async (e) => {
  const d = e.data;
  if (!d || d.__noet !== 1 || !d.op) return;
  const reply = (p) => { try { e.source.postMessage({ __noet: 1, id: d.id, ...p }, e.origin); } catch {} };
  if (!OPS[d.op]) return reply({ ok: false, error: 'неизвестная операция' });
  if (!OPEN.has(d.op) && !trusted(e.origin)) return reply({ ok: false, error: 'origin не доверен', untrusted: true });
  try { reply({ ok: true, result: await OPS[d.op](d.args || {}) }); }
  catch (err) { reply({ ok: false, error: String((err && err.message) || err) }); }
});
const notify = () => { try { parent.postMessage({ __noet: 1, ev: 'changed' }, '*'); } catch {} };
window.addEventListener('storage', notify);
try { parent.postMessage({ __noet: 1, ev: 'ready' }, '*'); } catch {}
