// noet — Zone Portal: реестр + резолвер + поиск + личность + зала (Nostr-реле) + ПРОКСИ зоны .nt
//
// Доступ по имени прямо в браузере: PAC отправляет хосты *.nt на этот сервер
// (forward-proxy), сервер резолвит имя -> CID -> IPFS и отдаёт страницу. На каждую
// страницу зоны инжектится виджет (/widget.js). Личность хранится в изолированном
// origin id.nt; зала relay.nt — настоящее Nostr-реле поверх WebSocket (см. ws.mjs).
//
// Приложение-хосты: search.nt (поиск), relay.nt (зала/чат), id.nt (мост личности).
// Контент-хосты: <имя>.nt -> сайт из IPFS. Прямой доступ по IP (отладка): / , /relay , /id , /r/<имя>.

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import * as auth from './auth.mjs';
import { makeRelay } from './ws.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const WEB = join(__dir, 'web');
const PORT = Number(process.env.PORT || 8090);
const IPFS_GW = process.env.IPFS_GW || 'http://127.0.0.1:8080';
const ZONE_TLD = (process.env.ZONE_TLD || 'nt').toLowerCase();
const SEARCH_NAME = `search.${ZONE_TLD}`, RELAY_NAME = `relay.${ZONE_TLD}`, ID_NAME = `id.${ZONE_TLD}`;
const APP_HOSTS = new Set([SEARCH_NAME, RELAY_NAME, ID_NAME, `profile.${ZONE_TLD}`]);
const REG_FILE = process.env.REGISTRY_FILE || join(__dir, 'registry.json');
const SEED_FILE = join(__dir, 'registry.seed.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const NAME_RE = new RegExp(`^([a-z0-9-]{1,32})\\.${ZONE_TLD}$`, 'i');
const RESERVED = new Set(['admin', 'root', 'sys', 'core', 'search', 'relay', 'id', 'profile']);

let reg = existsSync(REG_FILE) ? JSON.parse(readFileSync(REG_FILE, 'utf8'))
  : existsSync(SEED_FILE) ? JSON.parse(readFileSync(SEED_FILE, 'utf8')) : { names: {} };
const saveReg = () => writeFileSync(REG_FILE, JSON.stringify(reg, null, 2));

// ---- IPFS (через gateway) ----
async function ipfsCat(path) {
  const r = await fetch(`${IPFS_GW}/ipfs/${path}`, { redirect: 'follow' });
  if (!r.ok) throw new Error('gateway ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

// ---- индекс/поиск ----
const index = new Map();
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

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
function sendFile(res, file, code = 200) {
  try {
    const buf = readFileSync(file);
    res.writeHead(code, { 'content-type': MIME[extname(file)] || 'application/octet-stream', ...cors });
    res.end(buf);
  } catch { sendJson(res, 404, { error: 'нет файла' }); }
}
// инжект виджета в страницы зоны (контент из IPFS)
function withWidget(html) {
  const tag = '<script src="/widget.js"></script>';
  if (html.includes('__noetWidget') || html.includes('/widget.js')) return html;
  return html.includes('</body>') ? html.replace('</body>', tag + '</body>') : html + tag;
}

function pacFile(proxyHostPort) {
  return `function FindProxyForURL(url, host) {
  if (shExpMatch(host, "*.${ZONE_TLD}")) return "PROXY ${proxyHostPort}";
  return "DIRECT";
}
`;
}
const notFoundPage = (name) => `<!doctype html><meta charset=utf-8><title>${esc(name)} — нет в зоне</title>
<link rel=icon href="/logo.svg">
<body style="font:16px/1.6 system-ui;background:#0a0a0c;color:#ececf2;max-width:40rem;margin:5rem auto;padding:0 1.2rem">
<p><img src="/logo.svg" width=44 style="vertical-align:middle"> </p>
<h1>${esc(name)}</h1><p style="color:#8b8b98">Имя не зарегистрировано в зоне .${ZONE_TLD}.</p>
<p><a style="color:#9d8bff" href="http://${SEARCH_NAME}/">← на ${SEARCH_NAME}</a></p>
<script src="/widget.js"></script>`;

// ---- статические ассеты (host-независимо) ----
const STATIC = {
  '/widget.js': join(WEB, 'widget.js'),
  '/bridge.js': join(WEB, 'bridge.js'),
  '/app.css': join(WEB, 'app.css'),
  '/logo.svg': join(WEB, 'logo.svg'),
  '/vendor/noble-secp256k1.js': join(__dir, 'vendor', 'noble-secp256k1.js'),
};

// ---- сервер ----
const server = http.createServer(async (req, res) => {
  const host = hostOf(req);
  const url = reqUrl(req);
  let path; try { path = decodeURIComponent(url.pathname); } catch { path = url.pathname; }

  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  // статика
  if (req.method === 'GET' && STATIC[path]) return sendFile(res, STATIC[path]);
  if (req.method === 'GET' && (path === `/${ZONE_TLD}.pac` || path === '/proxy.pac' || path === '/scz.pac')) {
    res.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig', ...cors });
    return res.end(pacFile(req.headers.host || `127.0.0.1:${PORT}`));
  }
  if (path === '/favicon.ico') return sendFile(res, join(WEB, 'logo.svg'));

  // API (host-независимо)
  if (req.method === 'GET' && path === '/api/names') {
    const out = {};
    for (const [n, r] of Object.entries(reg.names)) out[n] = { cid: r.cid, title: (index.get(n) || {}).title || r.title || n, owner: r.owner, owner_handle: r.owner_handle || null };
    return sendJson(res, 200, out);
  }
  if (req.method === 'GET' && path === '/api/members') return sendJson(res, 200, auth.allHandles());
  if (req.method === 'GET' && path === '/api/search') return sendJson(res, 200, search(url.searchParams.get('q')));
  if (req.method === 'GET' && path.startsWith('/api/resolve/')) {
    const name = path.slice('/api/resolve/'.length).toLowerCase();
    const rec = reg.names[name];
    return rec ? sendJson(res, 200, { name, cid: rec.cid }) : sendJson(res, 404, { error: 'not found', name });
  }

  // ---- личность (Nostr-ключ) + гейт на участие ----
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
    if (host === SEARCH_NAME) return sendFile(res, join(WEB, 'search.html'));
    if (host === RELAY_NAME) return sendFile(res, join(WEB, 'relay.html'));
    if (host === ID_NAME) return sendFile(res, join(WEB, 'bridge.html'));
    const rec = reg.names[host];
    if (!rec) return sendHtml(res, 404, notFoundPage(host));
    try { return sendHtml(res, 200, withWidget((await ipfsCat(`${rec.cid}/index.html`)).toString('utf8'))); }
    catch (e) { return sendHtml(res, 504, `<h1>504</h1><p>IPFS не отдал контент: ${esc(e.message)}</p>`); }
  }

  // ----- прямой доступ по IP (отладка) -----
  if (req.method === 'GET' && (path === '/' || path === '/index.html')) return sendFile(res, join(WEB, 'search.html'));
  if (req.method === 'GET' && path === '/relay') return sendFile(res, join(WEB, 'relay.html'));
  if (req.method === 'GET' && (path === '/id' || path === '/id/')) return sendFile(res, join(WEB, 'bridge.html'));
  if (req.method === 'GET' && path.startsWith('/r/')) {
    const name = path.slice('/r/'.length).toLowerCase();
    const rec = reg.names[name];
    if (!rec) return sendHtml(res, 404, notFoundPage(name));
    try { return sendHtml(res, 200, withWidget((await ipfsCat(`${rec.cid}/index.html`)).toString('utf8'))); }
    catch (e) { return sendHtml(res, 504, `<h1>504</h1><p>${esc(e.message)}</p>`); }
  }

  sendJson(res, 404, { error: 'нет маршрута' });
});

// зала: настоящее Nostr-реле поверх WebSocket
const relay = makeRelay({ verify: auth.verifyNostr, file: join(__dir, 'relay-events.json') });
relay.attach(server);

// https-попытки к зоне (CONNECT) аккуратно отклоняем — зона по http
server.on('connect', (req, socket) => { socket.write('HTTP/1.1 501 Not Implemented\r\n\r\nЗона работает по http\r\n'); socket.end(); });

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`[portal] :${PORT} → IPFS ${IPFS_GW} · зона .${ZONE_TLD} · имён: ${Object.keys(reg.names).length} · реле on`);
  await crawl();
  setInterval(crawl, 5 * 60 * 1000);
});
