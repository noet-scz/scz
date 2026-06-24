// noet — общая лента (бывшее реле), serverless. ПОЛНЫЙ функционал: упоминания @, ответы
// (NIP-10), картинки, профили, живое обновление. Сообщения = kind 1 с тегом t=noet на
// публичных реле. Ники и @упоминания — из заявок имён (31111) и профилей (kind 0). Без VPS.
import { schnorr } from './vendor/noble-secp256k1.js';
import { sha256 } from './noet-names.js';

const api = globalThis.browser || globalThis.chrome;
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
const TOPIC = 'noet';
const hex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');
const h2u = (h) => Uint8Array.from(h.match(/.{2}/g).map((b) => parseInt(b, 16)));
const enc = (s) => new TextEncoder().encode(s);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tag = (ev, k) => (((ev.tags || []).find((t) => t[0] === k) || [])[1]) || '';
const IMG_RE = /\.(png|jpe?g|gif|webp|avif|svg)(\?[^\s]*)?$/i;

const getSk = async () => (await api.storage.local.get('noet_sk')).noet_sk || null;
let SK = null, MYPK = null, replyTo = null;
const events = new Map(), profiles = new Map(), pTime = new Map();
const handleToPk = {}, pkToHandle = {};   // ник ↔ ключ из заявок имён

async function sign(ev) {
  ev.pubkey = MYPK; ev.created_at = ev.created_at || Math.floor(Date.now() / 1000); ev.tags = ev.tags || []; ev.content = ev.content || '';
  ev.id = hex(sha256(enc(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]))));
  ev.sig = hex(await schnorr.sign(h2u(ev.id), h2u(SK))); return ev;
}

/* ---------- ники ---------- */
const handleFromName = (name) => String(name).replace(/\.(me|nt)$/i, '');
function nameOf(pk) { const p = profiles.get(pk); if (p && p.name) return p.name; if (pkToHandle[pk]) return pkToHandle[pk]; return pk.slice(0, 8) + '…'; }
function profOf(pk) { const p = profiles.get(pk) || {}; return { name: p.name || pkToHandle[pk] || '', picture: p.picture, about: p.about }; }
const pubkeyOfHandle = (h) => handleToPk[String(h).toLowerCase()] || null;
function avatar(pk, name, prof) {
  const pic = prof && prof.picture; if (pic && /^(https?:|data:)/i.test(pic)) return pic;
  let h = 0; const seed = pk || name || '?'; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360, ch = (name || '').trim() ? [...name.trim()][0].toUpperCase() : '';
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='32' fill='hsl(${hue} 60% 50%)'/>${ch ? `<text x='32' y='43' font-family='system-ui' font-size='30' font-weight='600' fill='white' text-anchor='middle'>${esc(ch)}</text>` : ''}</svg>`);
}

/* ---------- рендер текста: картинки, ссылки, @упоминания ---------- */
function renderContent(text) {
  const re = /(https?:\/\/[^\s<]+)|(^|[^\w@])@([a-z0-9_]{2,32})/gi;
  let out = '', last = 0, m;
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index)); last = re.lastIndex;
    if (m[1]) { const u = m[1]; out += IMG_RE.test(u) ? `<a href="${esc(u)}" target=_blank rel=noopener><img class=img loading=lazy src="${esc(u)}" alt=""></a>` : `<a href="${esc(u)}" target=_blank rel=noopener>${esc(u)}</a>`; }
    else { const lead = m[2] || '', h = m[3].toLowerCase(), pk = pubkeyOfHandle(h); out += esc(lead) + (pk ? `<a class=mention href="http://${esc(h)}.me/">@${esc(h)}</a>` : '@' + esc(m[3])); }
  }
  out += esc(text.slice(last)); return out;
}
// NIP-10: теги ответа + p-теги упоминаний, без дублей
function buildTags(text, parent) {
  const tags = [['t', TOPIC]]; const pset = new Set();
  const addP = (pk) => { if (pk && !pset.has(pk)) { pset.add(pk); tags.push(['p', pk]); } };
  if (parent) {
    const rootTag = (parent.tags || []).find((t) => t[0] === 'e' && t[3] === 'root');
    const rootId = rootTag ? rootTag[1] : parent.id;
    if (rootId && rootId !== parent.id) { tags.push(['e', rootId, '', 'root']); tags.push(['e', parent.id, '', 'reply']); }
    else tags.push(['e', parent.id, '', 'root']);
    for (const tg of (parent.tags || [])) if (tg[0] === 'p') addP(tg[1]);
    addP(parent.pubkey);
  }
  let m; const mr = /(^|[^\w@])@([a-z0-9_]{2,32})/gi;
  while ((m = mr.exec(text))) { const pk = pubkeyOfHandle(m[2]); if (pk) addP(pk); }
  return tags;
}

const two = (n) => String(n).padStart(2, '0');
const fmtTime = (ts) => { const d = new Date(ts * 1000); return two(d.getHours()) + ':' + two(d.getMinutes()); };
function dayLabel(ts) {
  const d = new Date(ts * 1000), n = new Date(); const same = (a, b) => a.toDateString() === b.toDateString();
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (same(d, n)) return 'сегодня'; if (same(d, y)) return 'вчера';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' });
}

function render() {
  const log = $('#log');
  const list = [...events.values()].sort((a, b) => a.created_at - b.created_at).slice(-400);
  if (!list.length) { log.innerHTML = '<div class="mut" style="text-align:center;padding:2rem">Пока пусто. Будь первым.</div>'; return; }
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 140;
  let html = '', lastDay = null;
  for (const ev of list) {
    const dk = dayLabel(ev.created_at); if (dk !== lastDay) { html += `<div class=day>${esc(dk)}</div>`; lastDay = dk; }
    const mine = MYPK && MYPK === ev.pubkey;
    const replyE = (ev.tags || []).find((tg) => tg[0] === 'e' && (tg[3] === 'reply' || tg[3] === 'root' || !tg[3]));
    let ref = '';
    if (replyE) { const par = events.get(replyE[1]); const who = par ? nameOf(par.pubkey) : '…'; ref = `<div class=refto data-to="${esc(replyE[1])}">↳ в ответ @${esc(who)}</div>`; }
    html += `<div class="m${mine ? ' me' : ''}" data-id="${esc(ev.id)}"><img class=av src="${avatar(ev.pubkey, nameOf(ev.pubkey), profOf(ev.pubkey))}">
      <div class=b><div class=h><span class=nm>${esc(nameOf(ev.pubkey))}</span><span class=tm>${fmtTime(ev.created_at)}</span>${MYPK ? `<button class=reply data-id="${esc(ev.id)}">↩ ответить</button>` : ''}</div>
      ${ref}<div class=tx>${renderContent(ev.content)}</div></div></div>`;
  }
  log.innerHTML = html;
  log.querySelectorAll('.reply').forEach((b) => b.onclick = () => { const ev = events.get(b.dataset.id); if (ev) { replyTo = ev; renderFoot(); const ci = $('#ci'); if (ci) ci.focus(); } });
  log.querySelectorAll('.refto').forEach((r) => r.onclick = () => { const el = log.querySelector(`[data-id="${CSS.escape(r.dataset.to)}"]`); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); } });
  if (nearBottom) log.scrollTop = log.scrollHeight;
}

function ingest(ev) {
  if (ev.kind === 1) { if (!events.has(ev.id)) { events.set(ev.id, ev); return true; } }
  else if (ev.kind === 0) { const tt = pTime.get(ev.pubkey) || 0; if (ev.created_at >= tt) { pTime.set(ev.pubkey, ev.created_at); try { profiles.set(ev.pubkey, JSON.parse(ev.content || '{}')); } catch {} return true; } }
  else if (ev.kind === 31111) { const name = tag(ev, 'd'); if (/\.(me|nt)$/i.test(name)) { const h = handleFromName(name).toLowerCase(); if (!handleToPk[h]) { handleToPk[h] = ev.pubkey; pkToHandle[ev.pubkey] = handleFromName(name); } } return true; }
  return false;
}

/* ---------- живые подключения к реле ---------- */
let rerender = null;
function bump() { if (rerender) return; rerender = setTimeout(() => { rerender = null; render(); }, 200); }
function connect() {
  RELAYS.forEach((url) => {
    let ws; const open = () => {
      try { ws = new WebSocket(url); } catch { return setTimeout(open, 3000); }
      ws.onopen = () => {
        try {
          ws.send(JSON.stringify(['REQ', 'm', { kinds: [1], '#t': [TOPIC], limit: 300 }]));
          ws.send(JSON.stringify(['REQ', 'p', { kinds: [0], limit: 1000 }]));
          ws.send(JSON.stringify(['REQ', 'n', { kinds: [31111], '#t': ['noet-name'], limit: 1000 }]));
        } catch {}
      };
      ws.onmessage = (m) => { try { const a = JSON.parse(m.data); if (a[0] === 'EVENT') { if (ingest(a[2])) bump(); } else if (a[0] === 'EOSE') bump(); } catch {} };
      ws.onclose = () => { ws = null; setTimeout(open, 2500); };
      ws.onerror = () => { try { ws.close(); } catch {} };
    };
    open();
  });
}
function broadcast(ev) {
  const msg = JSON.stringify(['EVENT', ev]);
  RELAYS.forEach((u) => { try { const w = new WebSocket(u); const t = setTimeout(() => { try { w.close(); } catch {} }, 5000); w.onopen = () => { try { w.send(msg); } catch {} }; w.onmessage = () => { clearTimeout(t); try { w.close(); } catch {} }; w.onerror = () => clearTimeout(t); } catch {} });
}

async function send(text) {
  text = text.trim(); if (!text) return;
  const tags = buildTags(text, replyTo);
  const ev = await sign({ kind: 1, tags, content: text });
  replyTo = null; renderFoot();
  ingest(ev); render();   // оптимистично: сразу показываем
  broadcast(ev);
}

/* ---------- композер + автодополнение @ ---------- */
function renderFoot() {
  const f = $('#foot');
  if (!MYPK) { f.innerHTML = '<span class="mut">Создай личность в расширении noet, чтобы писать.</span>'; return; }
  const rb = replyTo ? `<div class=replybar>в ответ <b>@${esc(nameOf(replyTo.pubkey))}</b><button id=rcancel title="отмена">✕</button></div>` : '';
  f.innerHTML = rb + `<form class=composer id=cf><input id=ci placeholder="написать в ленту…" maxlength=2000 autocomplete=off><div class=ac id=ac style="display:none"></div><button id=cb type=submit>Отправить</button></form>`;
  const rc = $('#rcancel'); if (rc) rc.onclick = () => { replyTo = null; renderFoot(); };
  $('#cf').addEventListener('submit', async (e) => { e.preventDefault(); const v = $('#ci').value; $('#ci').value = ''; hideAc(); $('#cb').disabled = true; try { await send(v); } catch (err) { $('#ci').value = v; } $('#cb').disabled = false; $('#ci').focus(); });
  $('#ci').addEventListener('input', onCompose);
  $('#ci').addEventListener('keydown', acKeydown);
}
let acItems = [], acIdx = 0;
function hideAc() { const ac = $('#ac'); if (ac) { ac.style.display = 'none'; acItems = []; } }
function onCompose(e) {
  const inp = e.target, before = inp.value.slice(0, inp.selectionStart); const m = before.match(/@([a-z0-9_]*)$/i);
  const ac = $('#ac'); if (!m) { hideAc(); return; }
  const q = m[1].toLowerCase();
  acItems = Object.keys(handleToPk).filter((h) => h.startsWith(q)).slice(0, 6).map((h) => pkToHandle[handleToPk[h]] || h);
  if (!acItems.length) { hideAc(); return; }
  acIdx = 0;
  ac.innerHTML = acItems.map((h, i) => `<div class="${i === 0 ? 'on' : ''}" data-i="${i}">@${esc(h)}</div>`).join('');
  ac.style.display = 'block';
  ac.querySelectorAll('div').forEach((d) => d.onclick = () => pickAc(+d.dataset.i));
}
function acKeydown(e) {
  if (!acItems.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); acIdx = (acIdx + 1) % acItems.length; paintAc(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); acIdx = (acIdx - 1 + acItems.length) % acItems.length; paintAc(); }
  else if (e.key === 'Enter' || e.key === 'Tab') { if ($('#ac').style.display !== 'none') { e.preventDefault(); pickAc(acIdx); } }
  else if (e.key === 'Escape') hideAc();
}
function paintAc() { $('#ac').querySelectorAll('div').forEach((d, i) => d.classList.toggle('on', i === acIdx)); }
function pickAc(i) {
  const inp = $('#ci'), h = acItems[i]; if (!h) return;
  const pos = inp.selectionStart, before = inp.value.slice(0, pos), after = inp.value.slice(pos);
  const nb = before.replace(/@([a-z0-9_]*)$/i, '@' + h + ' ');
  inp.value = nb + after; inp.selectionStart = inp.selectionEnd = nb.length; hideAc(); inp.focus();
}

async function init() {
  $('#lhome').href = 'http://noet.nt/'; $('#lpeople').href = 'http://people.nt/';
  SK = await getSk(); MYPK = SK ? hex(schnorr.getPublicKey(h2u(SK))) : null;
  renderFoot(); render();
  connect();
}
init();
