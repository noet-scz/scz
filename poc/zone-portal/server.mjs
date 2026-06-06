// СЦЗ — Zone Portal: реестр + резолвер + поисковик + ПРОКСИ для зоны .scz
//
// Доступ по имени в самом браузере: PAC отправляет хосты *.scz на этот сервер
// (в режиме forward-proxy), сервер резолвит имя -> CID -> IPFS и отдаёт страницу.
// Никакого виджета: http://search.scz/ , http://manifest.scz/ открываются как обычные сайты.
//
// Маршруты (host-независимые):
//   GET /scz.pac           — PAC: *.scz -> PROXY <этот хост>, остальное DIRECT
//   GET /api/names         — каталог зоны
//   GET /api/search?q=     — поиск по индексу
//   GET /api/resolve/:name — имя -> {cid}
// По хосту (через прокси):
//   http://search.scz/     — поисковик (полноценная страница)
//   http://<имя>.scz/      — сайт зоны из IPFS
// Прямой доступ по IP (отладка): http://<ip>:8090/ — поиск; /r/<имя> — сайт.

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as auth from './auth.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8090);
const IPFS_GW = process.env.IPFS_GW || 'http://127.0.0.1:8080';
const ZONE_TLD = (process.env.ZONE_TLD || 'scz').toLowerCase();
const SEARCH_NAME = `search.${ZONE_TLD}`;
const REG_FILE = process.env.REGISTRY_FILE || join(__dir, 'registry.json');
const SEED_FILE = join(__dir, 'registry.seed.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const NAME_RE = new RegExp(`^([a-z0-9-]{1,32})\\.${ZONE_TLD}$`, 'i');
const RESERVED = new Set(['admin', 'root', 'sys', 'core']);

let reg = existsSync(REG_FILE) ? JSON.parse(readFileSync(REG_FILE, 'utf8'))
  : existsSync(SEED_FILE) ? JSON.parse(readFileSync(SEED_FILE, 'utf8')) : { names: {} };
const saveReg = () => writeFileSync(REG_FILE, JSON.stringify(reg, null, 2));

// ---- IPFS (через gateway, не RPC) ----
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
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
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
    } catch { /* недостижимо */ }
  }
  console.log(`[portal] индекс: ${ok}/${Object.keys(reg.names).length} сайтов`);
}
function search(q) {
  const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const [name, doc] of index) {
    const title = doc.title.toLowerCase(), body = doc.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      let i = 0, c = 0; while ((i = body.indexOf(t, i)) >= 0) { c++; i += t.length; }
      score += c; if (title.includes(t)) score += 5;
    }
    if (score > 0) {
      const at = terms.map((t) => body.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] || 0;
      const start = Math.max(0, at - 60);
      out.push({ name, title: doc.title, cid: doc.cid, snippet: (start > 0 ? '…' : '') + doc.text.slice(start, start + 180) + '…', score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---- helpers ----
const cors = { 'access-control-allow-origin': '*' };
const sendJson = (res, c, o) => { res.writeHead(c, { 'content-type': 'application/json; charset=utf-8', ...cors }); res.end(JSON.stringify(o, null, 2)); };
const sendHtml = (res, c, h) => { res.writeHead(c, { 'content-type': 'text/html; charset=utf-8', ...cors }); res.end(h); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)); });
const hostOf = (req) => (req.headers.host || '').toLowerCase().split(':')[0];
const isZone = (h) => h.endsWith('.' + ZONE_TLD);
function reqUrl(req) { return /^https?:\/\//i.test(req.url) ? new URL(req.url) : new URL(req.url, 'http://x'); }
const bearer = (req) => { const h = req.headers['authorization'] || ''; return h.startsWith('Bearer ') ? h.slice(7) : (reqUrl(req).searchParams.get('token') || ''); };

// ---- страницы ----
function pacFile(proxyHostPort) {
  return `function FindProxyForURL(url, host) {
  if (shExpMatch(host, "*.${ZONE_TLD}")) return "PROXY ${proxyHostPort}";
  return "DIRECT";
}
`;
}

function searchPage() {
  return `<!doctype html><html lang=ru><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1"><title>search.${ZONE_TLD} · поиск по зоне</title>
<style>
:root{--bg:#0f1115;--card:#171a21;--bd:#262b36;--fg:#e7e9ee;--mut:#9aa3b2;--acc:#7c5cff}
*{box-sizing:border-box}body{font:16px/1.6 system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0}
.wrap{max-width:46rem;margin:0 auto;padding:4rem 1.2rem}
h1{font-size:1.9rem;margin:0 0 .1em}.mut{color:var(--mut)}
.bar{display:flex;gap:.5rem;margin:1.6rem 0 .4rem}
input{flex:1;background:var(--card);border:1px solid var(--bd);border-radius:10px;color:var(--fg);padding:.8rem 1rem;font-size:1rem}
button{background:var(--acc);border:0;border-radius:10px;color:#fff;padding:0 1.2rem;font-size:1rem;cursor:pointer}
.addr{display:flex;gap:.5rem;margin:.2rem 0 1.5rem}.addr input{font-size:.95rem}
.item{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:1rem 1.2rem;margin:.7rem 0}
.item a{color:#b9a8ff;font-size:1.15rem;text-decoration:none}.item a:hover{text-decoration:underline}
.item .u{color:var(--mut);font-size:.85rem;margin:.15rem 0}.item .s{font-size:.95rem;color:#cdd2db}
code{background:#0b0d11;border:1px solid var(--bd);border-radius:5px;padding:.1em .4em}
</style></head><body><div class=wrap>
<h1>⬡ search.${ZONE_TLD}</h1>
<div class=mut>Поиск по самоуправляемой цифровой зоне СЦЗ. Сайты живут в IPFS по хешу содержимого; имена <code>*.${ZONE_TLD}</code> резолвит зона, не DNS.</div>
<div class=bar><input id=q placeholder="искать в зоне…" autofocus><button onclick=run()>Найти</button></div>
<div class=addr><input id=addr placeholder="открыть по имени: manifest.${ZONE_TLD}"><button onclick=go()>Открыть</button></div>
<div id=res></div>
</div><script>
function go(){var n=document.getElementById('addr').value.trim();if(n)location.href='http://'+n+'/';}
async function run(){
  var q=document.getElementById('q').value.trim(),res=document.getElementById('res');
  if(!q){res.innerHTML='';return}
  res.innerHTML='<div class=mut>ищу…</div>';
  var items=await (await fetch('/api/search?q='+encodeURIComponent(q))).json();
  res.innerHTML=items.length?items.map(function(it){
    return '<div class=item><a href="http://'+it.name+'/">'+esc(it.title)+'</a>'
      +'<div class=u>'+esc(it.name)+' · '+esc(it.cid.slice(0,16))+'…</div>'
      +'<div class=s>'+esc(it.snippet)+'</div></div>';
  }).join(''):'<div class=mut>ничего не найдено</div>';
}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
document.getElementById('q').addEventListener('keydown',function(e){if(e.key==='Enter')run()});
document.getElementById('addr').addEventListener('keydown',function(e){if(e.key==='Enter')go()});
</script></body></html>`;
}

const notFoundPage = (name) => `<!doctype html><meta charset=utf-8><title>${esc(name)} — нет в зоне</title>
<body style="font:16px/1.6 system-ui;background:#0f1115;color:#e7e9ee;max-width:40rem;margin:4rem auto;padding:0 1rem">
<h1>⬡ ${esc(name)}</h1><p style="color:#9aa3b2">Имя не зарегистрировано в зоне .${ZONE_TLD}.</p>
<p><a style="color:#7c5cff" href="http://${SEARCH_NAME}/">← на search.${ZONE_TLD}</a></p>`;

function idPage() {
  return `<!doctype html><html lang=ru><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1"><title>Личность · зона СЦЗ</title>
<style>
:root{--bg:#0f1115;--card:#171a21;--bd:#262b36;--fg:#e7e9ee;--mut:#9aa3b2;--acc:#7c5cff;--ok:#34d399}
*{box-sizing:border-box}body{font:16px/1.6 system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0}
.wrap{max-width:40rem;margin:0 auto;padding:3rem 1.2rem}h1{font-size:1.6rem;margin:0 0 .3em}h3{margin:1.6rem 0 .5rem}
.mut{color:var(--mut);font-size:.92rem}.ok{background:#10261f;border:1px solid #1c5c45;border-radius:10px;padding:.8rem 1rem;color:var(--ok)}
.row{display:flex;gap:.5rem;margin:.5rem 0}input{flex:1;background:var(--card);border:1px solid var(--bd);border-radius:9px;color:var(--fg);padding:.6rem .8rem;font-size:.95rem}
button{background:var(--acc);border:0;border-radius:9px;color:#fff;padding:.55rem 1rem;font-size:.95rem;cursor:pointer}
button.ghost{background:transparent;border:1px solid var(--bd);color:var(--fg)}a{color:var(--acc)}
</style></head><body><div class=wrap>
<h1>⬡ Личность зоны</h1>
<div class=mut>Вход по Nostr-ключу. Читать и искать можно без входа — он нужен, чтобы <b>участвовать</b> (занять имя, позже — постить).</div>
<div id=view style="margin-top:1.2rem"><div class=mut>загрузка…</div></div>
<p class=mut style="margin-top:2rem">Ключ = доступ: потеряешь ключ — потеряешь личность (§7.2). Паскей-восстановление — следующим шагом.</p>
</div><script type="module" src="/id.js"></script></body></html>`;
}

// ---- сервер ----
const server = http.createServer(async (req, res) => {
  const host = hostOf(req);
  const url = reqUrl(req);
  let path; try { path = decodeURIComponent(url.pathname); } catch { path = url.pathname; }

  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  // PAC (host-независимо). PROXY = тот хост:порт, с которого забрали PAC.
  if (req.method === 'GET' && (path === '/scz.pac' || path === '/proxy.pac')) {
    res.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig', ...cors });
    return res.end(pacFile(req.headers.host || `127.0.0.1:${PORT}`));
  }

  // API (host-независимо)
  if (req.method === 'GET' && path === '/api/names') {
    const out = {};
    for (const [n, r] of Object.entries(reg.names)) out[n] = { cid: r.cid, title: (index.get(n) || {}).title || r.title || n };
    return sendJson(res, 200, out);
  }
  if (req.method === 'GET' && path === '/api/search') return sendJson(res, 200, search(url.searchParams.get('q')));
  if (req.method === 'GET' && path.startsWith('/api/resolve/')) {
    const name = path.slice('/api/resolve/'.length).toLowerCase();
    const rec = reg.names[name];
    return rec ? sendJson(res, 200, { name, cid: rec.cid }) : sendJson(res, 404, { error: 'not found', name });
  }
  if (path === '/favicon.ico') { res.writeHead(204, cors); return res.end(); }

  // ---- личность (Nostr-ключ) + гейт на участие ----
  if (req.method === 'GET' && (path === '/vendor/noble-secp256k1.js' || path === '/id.js')) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', ...cors });
    return res.end(readFileSync(join(__dir, path === '/id.js' ? 'id.js' : join('vendor', 'noble-secp256k1.js'))));
  }
  if (req.method === 'GET' && (path === '/id' || path === '/id/')) return sendHtml(res, 200, idPage());
  if (req.method === 'GET' && path === '/api/auth/challenge') return sendJson(res, 200, { challenge: auth.newChallenge() });
  if (req.method === 'POST' && path === '/api/auth/login') {
    let d; try { d = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'bad json' }); }
    const r = await auth.login(d);
    return sendJson(res, r.ok ? 200 : (r.code || 400), r);
  }
  if (req.method === 'GET' && path === '/api/me') {
    const m = auth.me(bearer(req));
    return m ? sendJson(res, 200, m) : sendJson(res, 401, { error: 'не авторизован' });
  }
  if (req.method === 'POST' && path === '/api/invite') {
    if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) return sendJson(res, 403, { error: 'нужен admin-token' });
    return sendJson(res, 201, { invite: auth.createInvite('founder') });
  }
  if (req.method === 'POST' && path === '/api/claim') {
    const pk = auth.sessionPubkey(bearer(req));
    if (!pk) return sendJson(res, 401, { error: 'нужен вход, чтобы занять имя' });
    let d; try { d = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'bad json' }); }
    const name = String(d.name || '').toLowerCase().trim(), m = name.match(NAME_RE);
    if (!m) return sendJson(res, 400, { error: `имя вида label.${ZONE_TLD}` });
    if (RESERVED.has(m[1]) || m[1].length === 1) return sendJson(res, 403, { error: 'системное/односложное имя' });
    if (!d.cid) return sendJson(res, 400, { error: 'нужен cid' });
    const cur = reg.names[name];
    if (cur && cur.owner && cur.owner !== pk) return sendJson(res, 409, { error: 'имя занято другим участником', owner_handle: cur.owner_handle || null });
    reg.names[name] = { cid: String(d.cid).trim(), owner: pk, owner_handle: auth.handleOf(pk), ts: Date.now(), title: d.title || name };
    saveReg(); await crawl();
    return sendJson(res, 201, { name, ...reg.names[name] });
  }

  if (req.method === 'POST' && path === '/register') {
    if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) return sendJson(res, 403, { error: 'регистрация закрыта' });
    let d; try { d = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'bad json' }); }
    const name = String(d.name || '').toLowerCase().trim(), m = name.match(NAME_RE);
    if (!m) return sendJson(res, 400, { error: `имя вида label.${ZONE_TLD}` });
    if (RESERVED.has(m[1]) || m[1].length === 1) return sendJson(res, 403, { error: 'системное/односложное имя' });
    if (!d.cid) return sendJson(res, 400, { error: 'нужен cid' });
    reg.names[name] = { cid: String(d.cid).trim(), owner: d.owner || 'admin', ts: Date.now(), title: d.title || name };
    saveReg(); await crawl();
    return sendJson(res, 201, { name, ...reg.names[name] });
  }

  // ----- доступ ПО ИМЕНИ (через прокси) -----
  if (isZone(host)) {
    if (host === SEARCH_NAME) return sendHtml(res, 200, searchPage());
    const rec = reg.names[host];
    if (!rec) return sendHtml(res, 404, notFoundPage(host));
    try { return sendHtml(res, 200, (await ipfsCat(`${rec.cid}/index.html`)).toString('utf8')); }
    catch (e) { return sendHtml(res, 504, `<h1>504</h1><p>IPFS не отдал контент: ${esc(e.message)}</p>`); }
  }

  // ----- прямой доступ по IP (отладка) -----
  if (req.method === 'GET' && (path === '/' || path === '/index.html')) return sendHtml(res, 200, searchPage());
  if (req.method === 'GET' && path.startsWith('/r/')) {
    const name = path.slice('/r/'.length).toLowerCase();
    const rec = reg.names[name];
    if (!rec) return sendHtml(res, 404, notFoundPage(name));
    try { return sendHtml(res, 200, (await ipfsCat(`${rec.cid}/index.html`)).toString('utf8')); }
    catch (e) { return sendHtml(res, 504, `<h1>504</h1><p>${esc(e.message)}</p>`); }
  }

  sendJson(res, 404, { error: 'нет маршрута' });
});

// https-попытки к зоне (CONNECT) аккуратно отклоняем — зона по http
server.on('connect', (req, socket) => { socket.write('HTTP/1.1 501 Not Implemented\r\n\r\nЗона работает по http\r\n'); socket.end(); });

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`[portal] :${PORT} → IPFS ${IPFS_GW} · зона .${ZONE_TLD} · имён: ${Object.keys(reg.names).length}`);
  await crawl();
  setInterval(crawl, 5 * 60 * 1000);
});
