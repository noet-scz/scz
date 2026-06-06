// СЦЗ — страница личности (браузер). Личность = Nostr-ключ.
// Если есть NIP-07 расширение — используем его (ключ не покидает расширение).
// Иначе генерируем ключ в браузере (бэкап обязателен — мина §7.2).
import { schnorr } from '/vendor/noble-secp256k1.js';

const $ = (id) => document.getElementById(id);
const hex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function sha256hex(str) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return hex(new Uint8Array(h));
}
const LS = window.localStorage;
const nip07 = !!window.nostr;

const token = () => LS.getItem('scz_token');
const getNsec = () => LS.getItem('scz_nsec');
const setNsec = (h) => LS.setItem('scz_nsec', h);

async function pubkeyHex() {
  if (nip07) return await window.nostr.getPublicKey();
  let sk = getNsec();
  if (!sk) { sk = hex(schnorr.utils.randomPrivateKey()); setNsec(sk); }
  return hex(schnorr.getPublicKey(fromHex(sk)));
}
const serialize = (ev) => JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
async function signEvent(ev) {
  if (nip07) return await window.nostr.signEvent(ev);
  ev.id = await sha256hex(serialize(ev));
  ev.sig = hex(await schnorr.sign(fromHex(ev.id), fromHex(getNsec())));
  return ev;
}
async function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {});
  const t = token(); if (t) opts.headers['authorization'] = 'Bearer ' + t;
  const r = await fetch(path, opts);
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

async function refresh() {
  if (token()) {
    const r = await api('/api/me');
    if (r.status === 200) return showMember(r.json);
    LS.removeItem('scz_token');
  }
  showLogin();
}

function showMember(m) {
  $('view').innerHTML =
    '<div class=ok>Вы вошли как <b>@' + esc(m.handle) + '</b><div class=mut>pubkey ' + esc(m.pubkey.slice(0, 24)) + '…</div></div>' +
    '<h3>Занять имя в зоне</h3>' +
    '<div class=row><input id=cname placeholder="напр. blog.scz"><input id=ccid placeholder="CID (bafy…)"></div>' +
    '<button id=claimbtn>Занять имя</button> <button id=logout class=ghost>Выйти</button>' +
    '<div id=claimres class=mut></div>';
  $('claimbtn').onclick = doClaim;
  $('logout').onclick = () => { LS.removeItem('scz_token'); refresh(); };
}
async function doClaim() {
  const name = $('cname').value.trim(), cid = $('ccid').value.trim();
  const r = await api('/api/claim', { method: 'POST', body: JSON.stringify({ name, cid }) });
  $('claimres').textContent = r.status === 201 ? ('✓ занято: ' + name + ' → ' + cid) : ('✗ ' + (r.json.error || r.status));
}

function showLogin() {
  $('view').innerHTML =
    '<p class=mut>Личность — твой Nostr-ключ. ' + (nip07 ? 'Найдено расширение Nostr (NIP-07) — ключ из него.' : 'Расширения Nostr нет — ключ создадим прямо здесь (обязательно сохрани бэкап).') + '</p>' +
    (nip07 ? '' : '<button id=genkey class=ghost>Создать новый ключ</button> <span id=keyinfo class=mut></span>') +
    '<h3>Регистрация / вход</h3>' +
    '<div class=mut>Новый ключ → нужен инвайт-код и хэндл. Известный ключ → просто вход.</div>' +
    '<div class=row><input id=handle placeholder="хэндл (a-z0-9_)"><input id=invite placeholder="инвайт-код"></div>' +
    '<button id=loginbtn>Войти / Зарегистрироваться</button>' +
    '<div id=loginres class=mut></div>';
  const g = $('genkey');
  if (g) g.onclick = () => {
    const k = hex(schnorr.utils.randomPrivateKey()); setNsec(k);
    const pk = hex(schnorr.getPublicKey(fromHex(k)));
    const backup = 'data:text/plain;charset=utf-8,' + encodeURIComponent('SCZ Nostr приватный ключ (nsec, храни в тайне):\n' + k + '\npubkey: ' + pk);
    $('keyinfo').innerHTML = 'ключ создан · pub ' + pk.slice(0, 16) + '… <a href="' + backup + '" download="scz-key.txt">скачать бэкап</a>';
  };
  $('loginbtn').onclick = doLogin;
}
async function doLogin() {
  $('loginres').textContent = '…';
  try {
    const pubkey = await pubkeyHex();
    const ch = (await (await fetch('/api/auth/challenge')).json()).challenge;
    let ev = { kind: 22242, created_at: Math.floor(Date.now() / 1000), tags: [['challenge', ch]], content: '', pubkey };
    ev = await signEvent(ev);
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ event: ev, handle: $('handle').value, invite: $('invite').value }) });
    if (r.status === 200) { LS.setItem('scz_token', r.json.token); refresh(); }
    else $('loginres').textContent = '✗ ' + (r.json.error || r.status);
  } catch (e) { $('loginres').textContent = 'ошибка: ' + e.message; }
}

refresh();
