// noet — домашняя/личность/редактор ВНУТРИ расширения. Без сервера: личность это ключ
// расширения, имя и страница живут в сети (реле + якорь имени). VPS не участвует.
import { schnorr } from './vendor/noble-secp256k1.js';
import { sha256, otsStamp } from './noet-names.js';

const api = globalThis.browser || globalThis.chrome;
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
const hex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');
const h2u = (h) => Uint8Array.from(h.match(/.{2}/g).map((b) => parseInt(b, 16)));
const enc = (s) => new TextEncoder().encode(s);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const app = () => $('#app');

const getSk = async () => (await api.storage.local.get('noet_sk')).noet_sk || null;
const pubOf = (sk) => hex(schnorr.getPublicKey(h2u(sk)));

async function sign(ev, sk) {
  ev.pubkey = pubOf(sk); ev.created_at = ev.created_at || Math.floor(Date.now() / 1000); ev.tags = ev.tags || []; ev.content = ev.content || '';
  ev.id = hex(sha256(enc(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]))));
  ev.sig = hex(await schnorr.sign(h2u(ev.id), h2u(sk)));
  return ev;
}
function send(ev) {
  const msg = JSON.stringify(['EVENT', ev]);
  return Promise.allSettled(RELAYS.map((u) => new Promise((res) => {
    let ws; try { ws = new WebSocket(u); } catch { return res(false); }
    const t = setTimeout(() => { try { ws.close(); } catch {} res(false); }, 6000);
    ws.onopen = () => { try { ws.send(msg); } catch {} };
    ws.onmessage = (m) => { try { const a = JSON.parse(m.data); if (a[0] === 'OK' && a[1] === ev.id) { clearTimeout(t); ws.close(); res(!!a[2]); } } catch {} };
    ws.onerror = () => { clearTimeout(t); res(false); };
  }))).then((rs) => rs.filter((r) => r.value).length);
}
function query(filters) {
  const list = Array.isArray(filters) ? filters : [filters]; const seen = new Map();
  const socks = RELAYS.map((u) => { try { return new WebSocket(u); } catch { return null; } }).filter(Boolean);
  return new Promise((res) => {
    let closed = 0;
    const fin = () => { try { socks.forEach((w) => w.close()); } catch {} res([...seen.values()]); };
    const t = setTimeout(fin, 4000);
    socks.forEach((ws) => {
      ws.onopen = () => { try { ws.send(JSON.stringify(['REQ', 'q', ...list])); } catch {} };
      ws.onmessage = (m) => { try { const a = JSON.parse(m.data); if (a[0] === 'EVENT') { const ev = a[2]; if (ev && !seen.has(ev.id)) seen.set(ev.id, ev); } else if (a[0] === 'EOSE') { ws.close(); if (++closed >= socks.length) { clearTimeout(t); fin(); } } } catch {} };
      ws.onerror = () => { if (++closed >= socks.length) { clearTimeout(t); fin(); } };
    });
  });
}
const tag = (ev, k) => (((ev.tags || []).find((t) => t[0] === k) || [])[1]) || '';
const handleFromName = (n) => String(n || '').replace(/\.(me|nt)$/i, '');

let SK = null, PK = null, NAME = null, PROFILE = {}, PAGE = null;

async function loadAll() {
  // имя: самая ранняя заявка моего ключа (она и есть моя личность, навсегда)
  const claims = (await query({ kinds: [31111], authors: [PK], limit: 20 })).filter((e) => tag(e, 'd'));
  claims.sort((a, b) => a.created_at - b.created_at);
  NAME = claims[0] ? tag(claims[0], 'd') : null;
  // профиль
  const profs = await query({ kinds: [0], authors: [PK], limit: 1 });
  try { PROFILE = profs[0] ? JSON.parse(profs[0].content) : {}; } catch { PROFILE = {}; }
  // страница
  if (NAME) {
    const recs = await query({ kinds: [31002], authors: [PK], '#d': [NAME], limit: 1 });
    if (recs[0]) { try { PAGE = JSON.parse(recs[0].content); } catch { PAGE = null; } }
  }
}

/* ---------- публикация ---------- */
async function ensureClaim(name) {
  const has = (await query({ kinds: [31111], authors: [PK], '#d': [name], limit: 1 }))[0];
  if (has) return;
  const claim = await sign({ kind: 31111, tags: [['d', name], ['t', 'noet-name'], ['target', '']] }, SK);
  await send(claim);
  try { const st = await otsStamp(h2u(claim.id)); if (st) { const pe = await sign({ kind: 31112, tags: [['d', name], ['e', claim.id]], content: st.proof }, SK); await send(pe); } } catch {}
}
async function savePage(name, html, title) {
  const ev = await sign({ kind: 31002, tags: [['d', name]], content: JSON.stringify({ html, title: title || name, mode: 'html' }) }, SK);
  const n = await send(ev);
  ensureClaim(name).catch(() => {});
  return n;
}
async function saveProfile(p) {
  const ev = await sign({ kind: 0, content: JSON.stringify({ name: p.name || '', picture: p.picture || '', about: p.about || '' }) }, SK);
  await send(ev); PROFILE = p;
}

/* ---------- страница из текста ---------- */
function pageFromText(title, body) {
  const blocks = String(body || '').replace(/\r/g, '').split(/\n{2,}/).map((b) => { b = b.trim(); return b ? '<p>' + esc(b).replace(/\n/g, '<br>') + '</p>' : ''; }).join('\n  ');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title || 'Моя страница')}</title>
<style>body{font:18px/1.7 -apple-system,system-ui,sans-serif;background:#0d0d12;color:#ececf2;max-width:40rem;margin:0 auto;padding:3.5rem 1.3rem}h1{color:#fff;font-size:2.1rem;line-height:1.15;margin:0 0 1rem}p{margin:0 0 1.1rem}a{color:#9d8bff}</style></head>
<body>${title ? '<h1>' + esc(title) + '</h1>' : ''}
  ${blocks || '<p></p>'}
</body></html>`;
}
function avatar(pk, name, prof) {
  const pic = prof && prof.picture;
  if (pic && /^(https?:|data:)/i.test(pic)) return pic;
  let h = 0; const seed = pk || name || '?'; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360, ch = (name || '').trim() ? [...name.trim()][0].toUpperCase() : '';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='32' fill='hsl(${hue} 60% 50%)'/>${ch ? `<text x='32' y='43' font-family='system-ui' font-size='30' font-weight='600' fill='white' text-anchor='middle'>${esc(ch)}</text>` : ''}</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/* ---------- виды ---------- */
let view = 'home', edMode = 'text', edTitle = '', edBody = '', edHtml = '';

function renderHome() {
  const dn = PROFILE.name || handleFromName(NAME) || 'без имени';
  app().innerHTML = `
    <div class="card">
      <div class="phd"><img class="av" src="${avatar(PK, dn, PROFILE)}"><div>
        <div class="dn">${esc(dn)}</div>${NAME ? `<div class="hd">${esc(NAME)}</div>` : '<div class="hd">имя ещё не занято</div>'}</div></div>
      <label>Отображаемое имя</label><input id="p_name" value="${esc(PROFILE.name || '')}" placeholder="как тебя показывать">
      <label>Аватар (ссылка или эмодзи)</label><input id="p_pic" value="${esc(PROFILE.picture || '')}" placeholder="🜂 или https://…">
      <label>О себе</label><textarea id="p_about" placeholder="пара слов">${esc(PROFILE.about || '')}</textarea>
      <div class="row" style="margin-top:1rem"><button class="gho" id="psave">Сохранить профиль</button><span class="msg" id="pmsg"></span></div>
    </div>
    ${NAME ? `<div class="card"><label style="margin-top:0">Твоя страница</label>
      <div class="row"><a class="pageurl" id="open" href="http://${esc(NAME)}/" target="_blank">${esc(NAME)}</a>
        <span class="sp" style="flex:1"></span><button class="pri" id="edit">Редактировать</button></div></div>`
    : `<div class="card"><label style="margin-top:0">Займи имя (станет твоим адресом, навсегда)</label>
      <div class="name-row"><input id="claim" placeholder="имя" autocomplete="off"><span class="suf">.me</span></div>
      <div class="row" style="margin-top:.8rem"><button class="pri" id="doclaim">Занять и создать страницу</button><span class="msg" id="cmsg"></span></div></div>`}
    <div class="key">${esc(PK.slice(0, 24))}…</div>`;
  $('#psave').onclick = async () => {
    const m = $('#pmsg'); m.className = 'msg'; m.textContent = 'Сохраняю…';
    try { await saveProfile({ name: $('#p_name').value.trim(), picture: $('#p_pic').value.trim(), about: $('#p_about').value.trim() }); m.className = 'msg ok'; m.textContent = 'Сохранено'; }
    catch (e) { m.className = 'msg err'; m.textContent = 'Не вышло'; }
  };
  if ($('#edit')) $('#edit').onclick = () => openEditor();
  if ($('#doclaim')) $('#doclaim').onclick = onClaim;
}

async function onClaim() {
  const handle = ($('#claim').value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  const name = handle + '.me';   // имя = домен, полностью (как резолвит расширение)
  const m = $('#cmsg');
  if (!handle) { m.className = 'msg err'; m.textContent = 'Впиши имя.'; return; }
  m.className = 'msg'; m.textContent = 'Занимаю…'; $('#doclaim').disabled = true;
  try {
    // проверим, не занято ли уже другим ключом
    const taken = (await query({ kinds: [31111], '#d': [name], limit: 5 })).filter((e) => e.pubkey !== PK);
    if (taken.length) { m.className = 'msg err'; m.textContent = 'Это имя уже занято.'; $('#doclaim').disabled = false; return; }
    await savePage(name, pageFromText('Привет!', 'Это моя страница в noet.'), name);
    NAME = name; await loadAll(); render();
  } catch (e) { m.className = 'msg err'; m.textContent = 'Не вышло, попробуй ещё.'; $('#doclaim').disabled = false; }
}

async function openEditor() {
  edMode = 'text'; edTitle = ''; edBody = ''; edHtml = '';
  if (PAGE && PAGE.html) { edMode = 'html'; edHtml = PAGE.html; }   // правим то, что есть
  view = 'editor'; render();
}

function renderEditor() {
  const isHtml = edMode === 'html';
  app().innerHTML = `
    <div class="ed-bar"><button class="gho" id="back">← назад</button><span class="ed-bar-url mut">${esc(NAME)}</span><span class="sp"></span>
      <div class="seg"><button id="m_text" class="${isHtml ? '' : 'on'}">Текст</button><button id="m_html" class="${isHtml ? 'on' : ''}">HTML</button></div>
      <button class="pri" id="pub">Опубликовать</button></div>
    <div class="card">${isHtml
      ? `<textarea id="code" class="code" spellcheck="false" placeholder="&lt;!doctype html&gt;…">${esc(edHtml)}</textarea>`
      : `<label style="margin-top:0">Заголовок</label><input id="title" value="${esc(edTitle)}" placeholder="как назвать страницу">
         <label>Текст</label><textarea id="body" placeholder="Пиши свободно. Пустая строка это новый абзац.">${esc(edBody)}</textarea>`}
      <div class="msg" id="emsg"></div></div>`;
  $('#back').onclick = () => { view = 'home'; render(); };
  $('#m_text').onclick = () => { saveEd(); edMode = 'text'; render(); };
  $('#m_html').onclick = () => { saveEd(); edMode = 'html'; render(); };
  $('#pub').onclick = onPublish;
}
function saveEd() {
  if ($('#code')) edHtml = $('#code').value;
  if ($('#title')) edTitle = $('#title').value;
  if ($('#body')) edBody = $('#body').value;
}
async function onPublish() {
  saveEd();
  const m = $('#emsg'); let html, title;
  if (edMode === 'html') { html = (edHtml || '').trim(); if (!html) { m.className = 'msg err'; m.textContent = 'Страница пустая.'; return; } title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || NAME; }
  else { title = (edTitle || '').trim(); if (!title && !(edBody || '').trim()) { m.className = 'msg err'; m.textContent = 'Страница пустая.'; return; } html = pageFromText(title, edBody); }
  m.className = 'msg'; m.textContent = 'Публикую…'; $('#pub').disabled = true;
  try {
    await savePage(NAME, html, title); PAGE = { html, title, mode: 'html' };
    m.className = 'msg ok'; m.innerHTML = `Готово. <a href="http://${esc(NAME)}/" target="_blank">${esc(NAME)}</a> обновлена.`;
  } catch (e) { m.className = 'msg err'; m.textContent = 'Не вышло, попробуй ещё.'; }
  $('#pub').disabled = false;
}

function render() {
  $('#lpeople').href = 'http://people.nt/'; $('#ldev').href = 'http://dev.nt/';
  if (view === 'editor' && NAME) return renderEditor();
  renderHome();
}

async function boot() {
  SK = await getSk();
  if (!SK) {
    app().innerHTML = `<div class="card"><h1>Личность</h1><p class="mut">Открой расширение noet (иконка в браузере) и создай или импортируй личность. Потом обнови эту страницу.</p>
      <button class="pri" id="reload" style="margin-top:.6rem">Обновить</button></div>`;
    $('#reload').onclick = () => location.reload(); return;
  }
  PK = pubOf(SK);
  app().innerHTML = '<div class="card mut">собираю твою страницу…</div>';
  await loadAll();
  render();
}
boot();
