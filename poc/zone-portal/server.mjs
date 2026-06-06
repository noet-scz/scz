// СЦЗ — Zone Portal: реестр + резолвер + поисковик (один сервис, без зависимостей)
//
// Маршруты:
//   GET /                      — главная: поиск + каталог зоны (работает и без расширения)
//   GET /scz-zone.user.js      — Tampermonkey-юзерскрипт (адрес VPS подставляется на лету)
//   GET /api/names             — каталог { name: {cid,title} }
//   GET /api/search?q=...      — поиск по проиндексированным сайтам зоны
//   GET /api/resolve/:name     — имя -> {cid}
//   GET /raw/:name             — index.html сайта из IPFS (для рендера в расширении/srcdoc)
//   GET /r/:name               — серверная обёртка: показать сайт зоны (для браузера без расширения)
//   POST /register             — занять имя (только при ADMIN_TOKEN — публично закрыто)
//
// Контент тянется из ЛОКАЛЬНОГО узла IPFS (RPC API), без публичных шлюзов.

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8090);
const IPFS_GW = process.env.IPFS_GW || 'http://127.0.0.1:8080'; // gateway, не RPC (Host-check у RPC)
const REG_FILE = process.env.REGISTRY_FILE || join(__dir, 'registry.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''; // пусто => /register публично закрыт
const RESERVED = new Set(['gov', 'core', 'admin', 'root', 'scz', 'sys', 'зона', 'zone']);
const NAME_RE = /^([a-zа-яё0-9-]{1,32})\.(зона|zone)$/iu;

let reg = existsSync(REG_FILE) ? JSON.parse(readFileSync(REG_FILE, 'utf8')) : { names: {} };
const saveReg = () => writeFileSync(REG_FILE, JSON.stringify(reg, null, 2));

// ---- IPFS ----
async function ipfsCat(path) { // path = "<cid>/index.html"
  const r = await fetch(`${IPFS_GW}/ipfs/${path}`, { redirect: 'follow' });
  if (!r.ok) throw new Error('gateway ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

// ---- индекс ----
const index = new Map(); // name -> {title, text, cid}

function stripHtml(html) {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = t ? t[1].trim() : '';
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
  return { title, text };
}

async function crawl() {
  let ok = 0;
  for (const [name, rec] of Object.entries(reg.names)) {
    try {
      const html = (await ipfsCat(`${rec.cid}/index.html`)).toString('utf8');
      const { title, text } = stripHtml(html);
      index.set(name, { title: title || rec.title || name, text, cid: rec.cid });
      ok++;
    } catch { /* недостижимо — пропускаем */ }
  }
  console.log(`[portal] индекс: ${ok}/${Object.keys(reg.names).length} сайтов`);
}

function search(q) {
  const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const [name, doc] of index) {
    const title = doc.title.toLowerCase();
    const body = doc.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      let i = 0, c = 0;
      while ((i = body.indexOf(t, i)) >= 0) { c++; i += t.length; }
      score += c;
      if (title.includes(t)) score += 5;
    }
    if (score > 0) {
      const positions = terms.map((t) => body.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b);
      const at = positions[0] || 0;
      const start = Math.max(0, at - 60);
      const snippet = (start > 0 ? '…' : '') + doc.text.slice(start, start + 180) + '…';
      out.push({ name, title: doc.title, cid: doc.cid, snippet, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---- helpers ----
const cors = { 'access-control-allow-origin': '*' };
const sendJson = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...cors }); res.end(JSON.stringify(obj, null, 2)); };
const sendHtml = (res, code, html) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', ...cors }); res.end(html); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)); });

// ---- userscript (адрес подставляется по Host) ----
function userscript(host) {
  const base = `http://${host}`;
  const src = readFileSync(join(__dir, 'userscript', 'scz-zone.user.js'), 'utf8');
  return src.replace(/__PORTAL_BASE__/g, base).replace(/__PORTAL_HOST__/g, host.split(':')[0]);
}

// ---- главная ----
function homePage(host) {
  return `<!doctype html><html lang=ru><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1"><title>СЦЗ · поиск по зоне</title>
<style>
:root{--bg:#0f1115;--card:#171a21;--bd:#262b36;--fg:#e7e9ee;--mut:#9aa3b2;--acc:#7c5cff}
*{box-sizing:border-box}body{font:16px/1.6 system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0}
.wrap{max-width:46rem;margin:0 auto;padding:3rem 1.2rem}
h1{font-size:1.7rem;margin:0 0 .2em}.mut{color:var(--mut)}
.bar{display:flex;gap:.5rem;margin:1.5rem 0}
input{flex:1;background:var(--card);border:1px solid var(--bd);border-radius:10px;color:var(--fg);padding:.8rem 1rem;font-size:1rem}
button{background:var(--acc);border:0;border-radius:10px;color:#fff;padding:0 1.2rem;font-size:1rem;cursor:pointer}
.res{margin-top:1rem}.item{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:1rem 1.2rem;margin:.7rem 0}
.item a{color:var(--acc);font-size:1.1rem;text-decoration:none}.item .u{color:var(--mut);font-size:.85rem}.item .s{margin-top:.3rem}
.hint{background:var(--card);border:1px dashed var(--bd);border-radius:10px;padding:1rem 1.2rem;margin-top:2rem;font-size:.9rem}
code{background:#0b0d11;border:1px solid var(--bd);border-radius:5px;padding:.1em .4em}
iframe{width:100%;height:70vh;border:1px solid var(--bd);border-radius:10px;background:#fff;margin-top:1rem;display:none}
</style></head><body><div class=wrap>
<h1>⬡ Поиск по зоне СЦЗ</h1>
<div class=mut>Поисковик внутри самоуправляемой цифровой зоны. Имена <code>*.зона</code> ведут к хешу содержимого в IPFS, не к серверу.</div>
<div class=bar>
  <input id=q placeholder="искать в зоне… (напр. метакогниция, форк, IPFS)" autofocus>
  <button onclick=run()>Найти</button>
</div>
<div class=mut style="margin:-.6rem 0 1rem">или открыть по имени: <input style="padding:.3rem .6rem;flex:none;width:14rem" id=addr placeholder="манифест.зона" onkeydown="if(event.key=='Enter')openName(addr.value)"></div>
<iframe id=view sandbox="allow-same-origin"></iframe>
<div class=res id=res></div>
<div class=hint><b>Хочешь, чтобы зона работала в любом браузере?</b> Поставь юзерскрипт для Tampermonkey:
<a href="/scz-zone.user.js">/scz-zone.user.js</a> — добавит плавающую кнопку ⬡ и адресную строку зоны на любой странице.</div>
</div>
<script>
const API='${base(host)}';
async function run(){
  const q=document.getElementById('q').value.trim();const res=document.getElementById('res');
  document.getElementById('view').style.display='none';
  if(!q){res.innerHTML='';return}
  const r=await fetch(API+'/api/search?q='+encodeURIComponent(q));const items=await r.json();
  res.innerHTML=items.length?items.map(function(it){return '<div class=item><a href="#" onclick="openName(\\''+it.name+'\\');return false">'+it.title+'</a><div class=u>'+it.name+' · '+it.cid.slice(0,16)+'…</div><div class=s>'+it.snippet+'</div></div>'}).join(''):'<div class=mut>ничего не найдено</div>';
}
async function openName(name){
  name=(name||'').trim();if(!name)return;
  const r=await fetch(API+'/raw/'+encodeURIComponent(name));
  const view=document.getElementById('view');
  if(!r.ok){view.srcdoc='<body style=\\'font:16px system-ui;padding:2rem;color:#900\\'>имя '+name+' не найдено в зоне';view.style.display='block';return}
  view.srcdoc=await r.text();view.style.display='block';view.scrollIntoView({behavior:'smooth'});
}
document.getElementById('q').addEventListener('keydown',function(e){if(e.key==='Enter')run()});
</script></body></html>`;
}
const base = (host) => `http://${host}`;

// ---- сервер ----
const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { p = req.url; }
  const qs = new URL(req.url, 'http://x').searchParams;

  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  if (req.method === 'GET' && (p === '/' || p === '/index.html')) return sendHtml(res, 200, homePage(host));

  if (req.method === 'GET' && p === '/scz-zone.user.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', ...cors });
    return res.end(userscript(host));
  }

  if (req.method === 'GET' && p === '/api/names') {
    const out = {};
    for (const [n, r] of Object.entries(reg.names)) out[n] = { cid: r.cid, title: (index.get(n) || {}).title || r.title || n };
    return sendJson(res, 200, out);
  }

  if (req.method === 'GET' && p === '/api/search') return sendJson(res, 200, search(qs.get('q')));

  if (req.method === 'GET' && p.startsWith('/api/resolve/')) {
    const name = p.slice('/api/resolve/'.length).toLowerCase();
    const rec = reg.names[name];
    return rec ? sendJson(res, 200, { name, cid: rec.cid }) : sendJson(res, 404, { error: 'not found', name });
  }

  if (req.method === 'GET' && p.startsWith('/raw/')) {
    const name = p.slice('/raw/'.length).toLowerCase();
    const rec = reg.names[name];
    if (!rec) return sendHtml(res, 404, `<h1>404</h1><p>имя ${esc(name)} не зарегистрировано в зоне</p>`);
    try { return sendHtml(res, 200, (await ipfsCat(`${rec.cid}/index.html`)).toString('utf8')); }
    catch (e) { return sendHtml(res, 504, `<h1>504</h1><p>IPFS не отдал контент: ${esc(e.message)}</p>`); }
  }

  if (req.method === 'GET' && p.startsWith('/r/')) {
    const name = p.slice('/r/'.length).toLowerCase();
    return sendHtml(res, 200, `<!doctype html><meta charset=utf-8><title>${esc(name)} · СЦЗ</title>
<body style="margin:0;background:#0f1115"><iframe src="/raw/${encodeURIComponent(name)}" style="width:100%;height:100vh;border:0"></iframe>`);
  }

  if (req.method === 'POST' && p === '/register') {
    if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN)
      return sendJson(res, 403, { error: 'регистрация закрыта (нужен admin-token)' });
    let data; try { data = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'bad json' }); }
    const name = String(data.name || '').toLowerCase().trim();
    const cid = String(data.cid || '').trim();
    const m = name.match(NAME_RE);
    if (!m) return sendJson(res, 400, { error: 'имя должно быть вида label.зона' });
    if (RESERVED.has(m[1]) || [...m[1]].length === 1) return sendJson(res, 403, { error: 'системное/односложное имя' });
    if (!cid) return sendJson(res, 400, { error: 'нужен cid' });
    reg.names[name] = { cid, owner: data.owner || 'admin', ts: Date.now(), title: data.title || name };
    saveReg(); await crawl();
    return sendJson(res, 201, { name, ...reg.names[name] });
  }

  sendJson(res, 404, { error: 'нет маршрута' });
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`[portal] :${PORT} → IPFS ${IPFS_GW} · имён в реестре: ${Object.keys(reg.names).length}`);
  await crawl();
  setInterval(crawl, 5 * 60 * 1000); // переиндексация каждые 5 мин
});
