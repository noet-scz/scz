// noet — «Люди» serverless. Участники = заявившие имя (31111); профили (kind 0),
// поручительства (8001/8002) и репутация считаются КЛИЕНТОМ из событий на реле. Без VPS.
import { schnorr } from './vendor/noble-secp256k1.js';
import { sha256 } from './noet-names.js';

const api = globalThis.browser || globalThis.chrome;
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
const hex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');
const h2u = (h) => Uint8Array.from(h.match(/.{2}/g).map((b) => parseInt(b, 16)));
const enc = (s) => new TextEncoder().encode(s);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tag = (ev, k) => (((ev.tags || []).find((t) => t[0] === k) || [])[1]) || '';
const handleFromName = (n) => String(n).replace(/\.(me|nt)$/i, '');
const isTestName = (n) => /^p\d+-[0-9a-f]{5,}\.(me|nt)$/i.test(n);   // мусор от тестов

const getSk = async () => (await api.storage.local.get('noet_sk')).noet_sk || null;
function query(filters) {
  const list = Array.isArray(filters) ? filters : [filters]; const seen = new Map();
  const socks = RELAYS.map((u) => { try { return new WebSocket(u); } catch { return null; } }).filter(Boolean);
  return new Promise((res) => {
    let c = 0; const fin = () => { try { socks.forEach((w) => w.close()); } catch {} res([...seen.values()]); };
    const t = setTimeout(fin, 4500);
    socks.forEach((ws) => {
      ws.onopen = () => { try { ws.send(JSON.stringify(['REQ', 'q', ...list])); } catch {} };
      ws.onmessage = (m) => { try { const a = JSON.parse(m.data); if (a[0] === 'EVENT') { if (!seen.has(a[2].id)) seen.set(a[2].id, a[2]); } else if (a[0] === 'EOSE') { ws.close(); if (++c >= socks.length) { clearTimeout(t); fin(); } } } catch {} };
      ws.onerror = () => { if (++c >= socks.length) { clearTimeout(t); fin(); } };
    });
  });
}
async function sign(ev, sk) {
  ev.pubkey = hex(schnorr.getPublicKey(h2u(sk))); ev.created_at = Math.floor(Date.now() / 1000); ev.tags = ev.tags || []; ev.content = ev.content || '';
  ev.id = hex(sha256(enc(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]))));
  ev.sig = hex(await schnorr.sign(h2u(ev.id), h2u(sk))); return ev;
}
function send(ev) {
  const msg = JSON.stringify(['EVENT', ev]);
  return Promise.allSettled(RELAYS.map((u) => new Promise((res) => {
    let ws; try { ws = new WebSocket(u); } catch { return res(); }
    const t = setTimeout(() => { try { ws.close(); } catch {} res(); }, 5000);
    ws.onopen = () => { try { ws.send(msg); } catch {} };
    ws.onmessage = () => { clearTimeout(t); try { ws.close(); } catch {} res(); };
    ws.onerror = () => { clearTimeout(t); res(); };
  })));
}
function avatar(pk, name, prof) {
  const pic = prof && prof.picture; if (pic && /^(https?:|data:)/i.test(pic)) return pic;
  let h = 0; const seed = pk || name || '?'; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360, ch = (name || '').trim() ? [...name.trim()][0].toUpperCase() : '';
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='32' fill='hsl(${hue} 60% 50%)'/>${ch ? `<text x='32' y='43' font-family='system-ui' font-size='30' font-weight='600' fill='white' text-anchor='middle'>${esc(ch)}</text>` : ''}</svg>`);
}

let MY = null, PEOPLE = [], MYVOUCHES = new Set();

// активные поручительства: по паре (от→за) последнее слово (8001 даёт, 8002 снимает)
function activeVouches(events) {
  const last = new Map();
  events.filter((e) => e.kind === 8001 || e.kind === 8002).forEach((v) => {
    const k = v.pubkey + '>' + tag(v, 'p'); const cur = last.get(k);
    if (!cur || v.created_at >= cur.created_at) last.set(k, v);
  });
  return [...last.values()].filter((v) => v.kind === 8001);
}

async function load() {
  MY = await getSk(); const myPk = MY ? hex(schnorr.getPublicKey(h2u(MY))) : null;
  // участники = заявившие имя; + профили + поручительства одним заходом
  const evs = await query([{ kinds: [31111], '#t': ['noet-name'], limit: 500 }, { kinds: [0], limit: 500 }, { kinds: [8001, 8002], limit: 1000 }]);
  const claims = evs.filter((e) => e.kind === 31111 && /\.(me|nt)$/.test(tag(e, 'd')) && !isTestName(tag(e, 'd')));
  const members = {}; // pk → {name, since}
  claims.forEach((c) => { const pk = c.pubkey, name = tag(c, 'd'); if (!members[pk] || c.created_at < members[pk].since) members[pk] = { name, since: c.created_at }; });
  const profs = {}; evs.filter((e) => e.kind === 0).forEach((e) => { if (!profs[e.pubkey] || e.created_at > profs[e.pubkey]._ts) { try { const p = JSON.parse(e.content); p._ts = e.created_at; profs[e.pubkey] = p; } catch {} } });
  const vouches = activeVouches(evs).filter((v) => members[v.pubkey] && members[tag(v, 'p')]);
  // репутация: 1 + стаж(мес*0.5, до 12) + полученные поручительства (вес 1)
  const now = Date.now() / 1000;
  const rep = {};
  for (const pk in members) { const tenure = Math.min(12, Math.floor((now - members[pk].since) / (30 * 86400))) * 0.5; rep[pk] = 1 + tenure; }
  const recv = {}; vouches.forEach((v) => { const to = tag(v, 'p'); recv[to] = (recv[to] || []).concat(profs[v.pubkey] && profs[v.pubkey].name || (members[v.pubkey] && members[v.pubkey].name) || v.pubkey.slice(0, 8)); rep[to] = (rep[to] || 1) + 1; });
  PEOPLE = Object.keys(members).map((pk) => ({ pk, name: members[pk].name, since: members[pk].since, prof: profs[pk] || null, rep: Math.round((rep[pk] || 1) * 10) / 10, vouchers: recv[pk] || [] }))
    .sort((a, b) => b.rep - a.rep);
  MYVOUCHES = new Set(vouches.filter((v) => v.pubkey === myPk).map((v) => tag(v, 'p')));
  render(myPk);
}

function render(myPk) {
  $('#me').innerHTML = myPk
    ? `<div class="card"><div class="psub">ты: @${esc(handleFromName((PEOPLE.find((p) => p.pk === myPk) || {}).name || myPk.slice(0, 10)))} · репутация <b style="color:var(--acc2)">${esc((PEOPLE.find((p) => p.pk === myPk) || {}).rep ?? '—')}</b></div></div>`
    : `<div class="card"><span class="mut">Войди (создай личность в расширении), чтобы ручаться за людей.</span></div>`;
  $('#list').innerHTML = PEOPLE.map((m) => {
    const handle = handleFromName(m.name);
    const dn = (m.prof && m.prof.name) || handle;
    const mine = myPk && myPk === m.pk;
    const vouched = MYVOUCHES.has(m.pk);
    return `<div class="card"><div class="prow">
      <img class="pav" src="${avatar(m.pk, dn, m.prof)}">
      <div style="min-width:0"><div class="pname"><a href="http://${esc(m.name)}/">${esc(dn)}</a> <span class="me">@${esc(handle)}</span></div>
        <div class="psub">в noet с ${new Date(m.since * 1000).toLocaleDateString('ru')}${m.vouchers.length ? ' · ручались: ' + m.vouchers.map(esc).join(', ') : ''}</div>
        ${myPk && !mine ? `<div class="acts">${vouched ? `<button class="g" data-un="${esc(m.pk)}">Отозвать поручительство</button>` : `<button class="b" data-v="${esc(m.pk)}">Поручиться</button>`}<span class="msg" data-m="${esc(m.pk)}"></span></div>` : ''}
      </div>
      <div class="rep"><b>${esc(m.rep)}</b><span class="lbl">репутация</span></div>
    </div></div>`;
  }).join('') || '<div class="mut">Пока никого.</div>';
  document.querySelectorAll('[data-v],[data-un]').forEach((b) => b.onclick = async () => {
    const pk = b.dataset.v || b.dataset.un; const m = document.querySelector(`[data-m="${pk}"]`);
    if (m) { m.textContent = '…'; m.className = 'msg'; }
    try { const ev = await sign({ kind: b.dataset.v ? 8001 : 8002, tags: [['p', pk]] }, MY); await send(ev); await load(); }
    catch (e) { if (m) { m.textContent = 'не вышло'; m.className = 'msg err'; } }
  });
}

$('#lhome').href = 'http://noet.nt/'; $('#ldev').href = 'http://dev.nt/';
load().catch(() => { $('#list').innerHTML = '<div class="mut">не загрузилось, обнови</div>'; });
