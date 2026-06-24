// noet — один файл, две роли.
//
//  РЕЕСТР (без REGISTRY_URL): удалённый сервер. Хранит ТОЛЬКО имена (name -> CID),
//    личность/сессии (auth), Nostr-реле и seed-пиннинг контента. Контент он НЕ отдаёт
//    в браузер: просмотр идёт через локальный демон у каждого пользователя.
//
//  ДЕМОН (с REGISTRY_URL): крутится на машине пользователя (127.0.0.1). PAC шлёт сюда
//    *.nt и *.me. Демон синхронит список имён с реестра, резолвит name -> CID, тянет
//    контент из ЛОКАЛЬНОГО kubo (P2P, проверка хешей) и отдаёт странице. Запись (вход,
//    публикация, реле) проксируется на реестр. Так в просмотре нет ни одного сервера.

import http from 'node:http';
import net from 'node:net';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { makeRelay } from './ws.mjs';
import { makeGov } from './gov.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const WEB = join(__dir, 'web');
const PORT = Number(process.env.PORT || 8090);
const IPFS_GW = process.env.IPFS_GW || 'http://127.0.0.1:8080';
const IPFS_API = process.env.IPFS_API || 'http://127.0.0.1:5001';
const ZONE_TLD = (process.env.ZONE_TLD || 'nt').toLowerCase();
const BLOG_TLD = (process.env.BLOG_TLD || 'me').toLowerCase();
const REGISTRY_URL = (process.env.REGISTRY_URL || '').replace(/\/$/, '');
const DAEMON = !!REGISTRY_URL;                       // роль определяется наличием REGISTRY_URL
const REG_FILE = process.env.REGISTRY_FILE || join(__dir, 'registry.json');
const SEED_FILE = join(__dir, 'registry.seed.json');
const NAMES_CACHE = join(__dir, 'names.cache.json'); // офлайн-кэш имён (демон)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';     // для авто-обновления https-зеркала имён
const GH_REPO = process.env.GH_REPO || 'noet-scz/noet';
const GH_PATH = 'dist/names.json';
const NAME_RE = new RegExp(`^([a-z0-9-]{1,32})\\.(${BLOG_TLD})$`, 'i');
const RESERVED = new Set(['admin', 'root', 'sys', 'core', 'search', 'relay', 'id', 'profile', 'www', 'api']);

// имя страницы/проекта ЖЁСТКО привязано к тегу пользователя: [<sub>.]<handle>.me.
// Чужой тег не подделать (handle берётся из сессии). sub — для доп-сайтов (dash/admin/…).
function meNameFor(pk, sub) {
  const handle = auth && auth.handleOf(pk);
  if (!handle) return { error: 'нет хэндла', code: 'need_login' };
  sub = String(sub || '').toLowerCase().trim().replace(/^\.+|\.+$/g, '');
  if (sub) {
    if (!/^[a-z0-9-]{1,32}$/.test(sub)) return { error: 'поддомен: буквы, цифры, дефис', code: 'name_format' };
    return { name: `${sub}.${handle}.${BLOG_TLD}` };
  }
  return { name: `${handle}.${BLOG_TLD}` };
}

const isBlog = (h) => h.endsWith('.' + BLOG_TLD);
const isZone = (h) => h.endsWith('.' + ZONE_TLD);

// лимит поддоменов из репутации (новые имена; уже занятые продолжают работать)
function subQuotaError(pk, name) {
  if (reg.names[name] || name.split('.').length < 3) return null;   // не новый поддомен
  const cap = gov.capacity(pk, reg.names);
  if (cap.maxSubs === Infinity) return null;
  const subs = Object.entries(reg.names).filter(([n, r]) => r.owner === pk && n.endsWith('.' + BLOG_TLD) && n.split('.').length > 2).length;
  if (subs >= cap.maxSubs) return { error: `у тебя предел поддоменов: ${cap.maxSubs}. Лимит растёт с репутацией, смотри страницу Люди.`, code: 'quota_subs' };
  return null;
}

// auth/gov нужны только реестру; демон проксирует вход на реестр и сам ключей не держит
let auth = null, gov = null;
if (!DAEMON) {
  auth = await import('./auth.mjs');
  gov = makeGov({
    verify: auth.verifyNostr, members: auth.allMembers, handleOf: auth.handleOf,
    file: process.env.GOV_FILE || join(__dir, 'gov.json'),
  });
}

// ---- имена ----
let reg = existsSync(REG_FILE) ? JSON.parse(readFileSync(REG_FILE, 'utf8'))
  : existsSync(SEED_FILE) ? JSON.parse(readFileSync(SEED_FILE, 'utf8')) : { names: {} };
const saveReg = () => writeFileSync(REG_FILE, JSON.stringify(reg, null, 2));

// демон: тянем список имён с реестра, кэшируем, при недоступности живём с кэша
async function syncNames() {
  try {
    const r = await fetch(`${REGISTRY_URL}/api/names`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('names ' + r.status);
    const j = await r.json();
    const names = {};
    for (const [n, o] of Object.entries(j)) names[n] = { cid: o.cid, owner: o.owner, owner_handle: o.owner_handle, title: o.title };
    reg = { names };
    writeFileSync(NAMES_CACHE, JSON.stringify(reg));
  } catch (e) {
    if (existsSync(NAMES_CACHE)) { try { reg = JSON.parse(readFileSync(NAMES_CACHE, 'utf8')); } catch {} }
    console.log('[daemon] синк имён не удался, работаю с кэша:', e.message);
  }
}

// ---- IPFS (через локальный шлюз/RPC) ----
async function ipfsCat(path) {
  const r = await fetch(`${IPFS_GW}/ipfs/${path}`, { redirect: 'follow' });
  if (!r.ok) throw new Error('gateway ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
async function ipfsAdd(filename, content) {
  const boundary = '----noet' + Math.random().toString(16).slice(2);
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const body = Buffer.concat([Buffer.from(head), Buffer.from(content), Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const r = await fetch(`${IPFS_API}/api/v0/add?cid-version=1&wrap-with-directory=true&pin=true`, {
    method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body,
  });
  if (!r.ok) throw new Error('ipfs add ' + r.status);
  const lines = (await r.text()).trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return {}; } });
  const dir = lines.find((o) => o.Name === '' && o.Hash);
  if (!dir) throw new Error('ipfs add: нет CID директории');
  return dir.Hash;
}
// добавить целую директорию (собранный проект): много файлов с относительными
// путями -> kubo wrap-with-directory -> CID корня (обёртка, Name=="")
async function ipfsAddDir(files) {
  const boundary = '----noet' + Math.random().toString(16).slice(2);
  const parts = [];
  for (const f of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${encodeURIComponent(f.path)}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content));
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const r = await fetch(`${IPFS_API}/api/v0/add?cid-version=1&wrap-with-directory=true&pin=true`, {
    method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body: Buffer.concat(parts),
  });
  if (!r.ok) throw new Error('ipfs add ' + r.status);
  const lines = (await r.text()).trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return {}; } });
  const root = lines.find((o) => o.Name === '' && o.Hash);
  if (!root) throw new Error('ipfs add: нет CID директории');
  return root.Hash;
}
// seed-пиннинг (реестр): подтянуть CID из сети, закрепить и анонсировать в DHT,
// чтобы публичные шлюзы у клиентов находили контент даже когда автор офлайн
async function ipfsPin(cid) {
  try {
    await fetch(`${IPFS_API}/api/v0/pin/add?arg=${encodeURIComponent(cid)}`, { method: 'POST', signal: AbortSignal.timeout(30000) });
    fetch(`${IPFS_API}/api/v0/routing/provide?arg=${encodeURIComponent(cid)}`, { method: 'POST', signal: AbortSignal.timeout(60000) }).catch(() => {});
  } catch { /* best-effort */ }
}

function renderPage({ title, body, name, handle, template }) {
  const e = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const link = (h) => h.replace(/(https?:\/\/[^\s<]+)/gi, (m) => `<a href="${m}">${m}</a>`);
  const out = []; let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${link(e(para.join('\n'))).replace(/\n/g, '<br>')}</p>`); para = []; } };
  for (const ln of String(body || '').replace(/\r/g, '').split('\n')) {
    const ttrim = ln.trim();
    if (!ttrim) { flush(); continue; }
    if (/^#\s+/.test(ttrim)) { flush(); out.push(`<h2>${e(ttrim.replace(/^#\s+/, ''))}</h2>`); continue; }
    para.push(ttrim);
  }
  flush();
  const blocks = out.join('\n  ');
  const accent = template === 'note' ? '#34d399' : '#7c5cff';
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title || name)}</title>
<link rel="icon" href="/logo.svg">
<style>
  :root{--bg:#0a0a0c;--card:#15151c;--bd:#23232c;--fg:#ececf2;--mut:#8b8b98;--acc:${accent};--acc2:#9d8bff}
  *{box-sizing:border-box}body{font:16px/1.7 system-ui,Segoe UI,sans-serif;background:var(--bg);color:var(--fg);margin:0}
  main{max-width:44rem;margin:0 auto;padding:3.4rem 1.3rem 6rem}
  .brand{display:flex;align-items:center;gap:.6rem;margin-bottom:1.8rem}
  .brand img{width:30px;height:30px}.brand b{font-size:1rem;color:var(--mut)}
  h1{font-size:2.1rem;line-height:1.15;margin:0 0 .6em}
  h2{font-size:1.25rem;margin:2rem 0 .5rem;border-left:3px solid var(--acc);padding-left:.6rem}
  a{color:var(--acc2)}p{margin:0 0 1rem}
  footer{margin-top:3rem;color:var(--mut);font-size:.85rem;border-top:1px solid var(--bd);padding-top:1rem}
  code{background:var(--card);border:1px solid var(--bd);border-radius:5px;padding:.1em .4em}
</style></head>
<body><main>
  <div class="brand"><img src="/logo.svg" alt=""><b>noet</b></div>
  <h1>${e(title || name)}</h1>
  ${blocks || '<p class="mut"></p>'}
  ${handle ? `<footer>Автор @${e(handle)}</footer>` : ''}
</main></body></html>`;
}

// заглушка личной страницы: создаётся при регистрации, пока автор не настроил свою
function placeholderPage(handle) {
  const h = String(handle).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h}.${BLOG_TLD}</title><link rel="icon" href="/logo.svg">
<style>
  body{margin:0;min-height:100vh;background:#0a0a0c;color:#ececf2;font:16px/1.6 system-ui,sans-serif;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;text-align:center;padding:2rem}
  img{width:48px;height:48px}h1{margin:0;font-size:1.6rem}p{color:#8b8b98;max-width:30rem;margin:0}
  .h{color:#9d8bff}
</style></head>
<body>
  <img src="/logo.svg" alt="">
  <h1><span class="h">${h}</span>.${BLOG_TLD}</h1>
  <p>Страница пока пустая. Автор её ещё не настроил.</p>
</body></html>`;
}

// авто-обновление https-зеркала имён на GitHub Pages (его читает расширение,
// потому что http-реестр из secure-страницы расширения недоступен). Debounce 2с.
let ghTimer = null;
function pushNamesToGitHub() {
  if (!GITHUB_TOKEN || DAEMON || ghTimer) return;
  ghTimer = setTimeout(async () => {
    ghTimer = null;
    try {
      const body = {};
      for (const [n, r] of Object.entries(reg.names)) body[n] = { cid: r.cid, title: r.title || n, owner: r.owner, owner_handle: r.owner_handle || null };
      const content = Buffer.from(JSON.stringify(body, null, 2) + '\n').toString('base64');
      const url = `https://api.github.com/repos/${GH_REPO}/contents/${GH_PATH}`;
      const headers = { authorization: 'Bearer ' + GITHUB_TOKEN, accept: 'application/vnd.github+json', 'user-agent': 'noet-registry' };
      let sha;
      const cur = await fetch(`${url}?ref=main`, { headers, signal: AbortSignal.timeout(10000) });
      if (cur.ok) sha = (await cur.json()).sha;
      const r = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ message: 'update names mirror', content, sha, branch: 'main' }), signal: AbortSignal.timeout(15000) });
      console.log(r.ok ? '[registry] зеркало имён обновлено на github' : '[registry] github mirror: ' + r.status);
    } catch (e) { console.log('[registry] github mirror push failed:', e.message); }
  }, 2000);
}

// при регистрации участника заводим его личную страницу handle.me с заглушкой
async function ensureHomePage(handle, pubkey) {
  const name = `${handle}.${BLOG_TLD}`;
  if (reg.names[name]) return;
  try {
    const cid = await ipfsAdd('index.html', Buffer.from(placeholderPage(handle), 'utf8'));
    reg.names[name] = { cid, owner: pubkey, owner_handle: handle, ts: Date.now(), title: name, raw: { placeholder: true } };
    saveReg(); ipfsPin(cid); pushNamesToGitHub(); index.delete(name); crawl();
  } catch (e) { console.log('[registry] ensureHomePage failed:', e.message); }
}

// ---- индекс/поиск (строится локально по синхронизированным именам) ----
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
  console.log(`[${DAEMON ? 'daemon' : 'registry'}] индекс: ${ok}/${Object.keys(reg.names).length} сайтов`);
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
function withWidget(html) {
  const tag = '<script src="/i18n.js"></script><script src="/widget.js"></script>';
  if (html.includes('/widget.js')) return html;
  return html.includes('</body>') ? html.replace('</body>', tag + '</body>') : html + tag;
}

// демон: прозрачный реверс-прокси на реестр (вход/сессии/участники/claim/инвайты)
async function proxyToRegistry(req, res) {
  const u = reqUrl(req);
  const target = REGISTRY_URL + u.pathname + (u.search || '');
  const headers = {};
  for (const h of ['authorization', 'content-type', 'x-admin-token']) if (req.headers[h]) headers[h] = req.headers[h];
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') body = await readBody(req);
  try {
    const r = await fetch(target, { method: req.method, headers, body, signal: AbortSignal.timeout(15000) });
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json; charset=utf-8', ...cors });
    res.end(buf);
  } catch (e) {
    sendJson(res, 502, { error: 'реестр недоступен, попробуй позже', code: 'network' });
  }
}

function pacFile(proxyHostPort) {
  return `function FindProxyForURL(url, host) {
  if (shExpMatch(host, "*.${ZONE_TLD}")) return "PROXY ${proxyHostPort}";
  if (shExpMatch(host, "*.${BLOG_TLD}")) return "PROXY ${proxyHostPort}";
  return "DIRECT";
}
`;
}
const notFoundPage = (name) => `<!doctype html><meta charset=utf-8><title>${esc(name)} — нет в noet</title>
<link rel=icon href="/logo.svg">
<body style="font:16px/1.6 system-ui;background:#0a0a0c;color:#ececf2;max-width:40rem;margin:5rem auto;padding:0 1.2rem">
<p><img src="/logo.svg" width=44 style="vertical-align:middle"> </p>
<h1>${esc(name)}</h1><p style="color:#8b8b98">Имя не зарегистрировано в noet.</p>
<p><a style="color:#9d8bff" href="http://noet.nt/">← на noet.nt</a></p>
<script src="/widget.js"></script>`;

const STATIC = {
  '/widget.js': join(WEB, 'widget.js'),
  '/account.js': join(WEB, 'account.js'),
  '/i18n.js': join(WEB, 'i18n.js'),
  '/app.css': join(WEB, 'app.css'),
  '/logo.svg': join(WEB, 'logo.svg'),
  '/vendor/noble-secp256k1.js': join(__dir, 'vendor', 'noble-secp256k1.js'),
};

// в демоне эти запросы уходят на реестр (личность/сессии/запись имени)
const PROXY_PATHS = new Set(['/api/me', '/api/members', '/api/auth/challenge', '/api/auth/login', '/api/invite', '/api/claim',
  '/api/people', '/api/gov', '/api/vouch', '/api/delegate', '/api/revoke', '/api/export', '/api/publish-zone']);

// ---- сервер ----
const server = http.createServer(async (req, res) => {
  const host = hostOf(req);
  const url = reqUrl(req);
  let path; try { path = decodeURIComponent(url.pathname); } catch { path = url.pathname; }

  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  // статика (host-независимо)
  if (req.method === 'GET' && STATIC[path]) return sendFile(res, STATIC[path]);
  if (req.method === 'GET' && (path === `/${ZONE_TLD}.pac` || path === '/proxy.pac' || path === '/scz.pac')) {
    res.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig', ...cors });
    return res.end(pacFile(req.headers.host || `127.0.0.1:${PORT}`));
  }
  if (path === '/favicon.ico') return sendFile(res, join(WEB, 'logo.svg'));

  // ---- демон: личность/сессии/запись имени → проксируем на реестр ----
  if (DAEMON && PROXY_PATHS.has(path)) return proxyToRegistry(req, res);

  // ---- демон: публикация. Рендер + добавление в ЛОКАЛЬНЫЙ kubo, затем claim на реестр ----
  if (DAEMON && req.method === 'POST' && path === '/api/publish') {
    const token = bearer(req);
    if (!token) return sendJson(res, 401, { error: 'нужен вход, чтобы публиковать', code: 'need_login' });
    // кто я (хэндл/ключ) — спрашиваем реестр
    let me; try {
      const r = await fetch(`${REGISTRY_URL}/api/me`, { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
      me = r.ok ? await r.json() : null;
    } catch { return sendJson(res, 502, { error: 'реестр недоступен', code: 'network' }); }
    if (!me) return sendJson(res, 401, { error: 'нужен вход', code: 'need_login' });
    let d; try { d = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'bad json', code: 'generic' }); }
    let name = String(d.name || '').toLowerCase().trim();
    if (!name) { if (!me.handle) return sendJson(res, 400, { error: 'нет хэндла', code: 'need_login' }); name = `${me.handle}.${BLOG_TLD}`; }
    const m = name.match(NAME_RE);
    if (!m) return sendJson(res, 400, { error: 'короткое имя: буквы, цифры, дефис', code: 'name_format' });
    if (RESERVED.has(m[1]) || m[1].length === 1) return sendJson(res, 403, { error: 'зарезервированное имя', code: 'name_format' });
    let cid, recTitle;
    if (String(d.mode || '') === 'html') {
      const rawHtml = String(d.body || '').slice(0, 500000);
      if (!rawHtml.trim()) return sendJson(res, 400, { error: 'пустая страница', code: 'empty' });
      const tm = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      recTitle = (tm ? tm[1].trim() : '') || name;
      try { cid = await ipfsAdd('index.html', Buffer.from(rawHtml, 'utf8')); } catch (e) { return sendJson(res, 502, { error: 'ipfs: ' + e.message, code: 'generic' }); }
    } else {
      const title = String(d.title || '').slice(0, 140).trim(), body = String(d.body || '').slice(0, 20000);
      if (!title && !body.trim()) return sendJson(res, 400, { error: 'пустая страница', code: 'empty' });
      const html = renderPage({ title, body, name, handle: me.handle });
      try { cid = await ipfsAdd('index.html', Buffer.from(html, 'utf8')); } catch (e) { return sendJson(res, 502, { error: 'ipfs: ' + e.message, code: 'generic' }); }
      recTitle = title || name;
    }
    // имя занимаем на реестре (он судья уникальности и владения)
    let claim; try {
      const r = await fetch(`${REGISTRY_URL}/api/claim`, {
        method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ name, cid, title: recTitle }), signal: AbortSignal.timeout(15000),
      });
      claim = { status: r.status, body: await r.json().catch(() => ({})) };
    } catch { return sendJson(res, 502, { error: 'реестр недоступен', code: 'network' }); }
    if (claim.status >= 200 && claim.status < 300) { reg.names[name] = { cid, owner: me.pubkey, owner_handle: me.handle, title: recTitle }; index.delete(name); crawl(); }
    return sendJson(res, claim.status, claim.status < 300 ? { name, cid, title: recTitle } : claim.body);
  }

  // ---- чтение имён/поиск/резолв (локально из синхронизированного списка) ----
  if (req.method === 'GET' && path === '/api/names') {
    const out = {};
    for (const [n, r] of Object.entries(reg.names)) out[n] = { cid: r.cid, title: (index.get(n) || {}).title || r.title || n, owner: r.owner, owner_handle: r.owner_handle || null };
    return sendJson(res, 200, out);
  }
  if (req.method === 'GET' && path === '/api/search') return sendJson(res, 200, search(url.searchParams.get('q')));
  if (req.method === 'GET' && path.startsWith('/api/resolve/')) {
    const name = path.slice('/api/resolve/'.length).toLowerCase();
    const rec = reg.names[name];
    return rec ? sendJson(res, 200, { name, cid: rec.cid, title: rec.title || name, raw: rec.raw || null }) : sendJson(res, 404, { error: 'not found', name });
  }

  // ---- реестр: личность (Nostr-ключ) + запись имени + seed-пиннинг ----
  if (!DAEMON) {
    if (req.method === 'GET' && path === '/api/members') return sendJson(res, 200, auth.allHandles());
    if (req.method === 'GET' && path === '/api/auth/challenge') return sendJson(res, 200, { challenge: auth.newChallenge() });
    if (req.method === 'POST' && path === '/api/auth/login') {
      let d; try { d = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'bad json' }); }
      const r = await auth.login(d);
      if (r.ok) { if (r.registered) await ensureHomePage(r.handle, r.pubkey); return sendJson(res, 200, r); }
      return sendJson(res, r.code || 400, { error: r.error, code: r.errcode || 'generic' });
    }
    if (req.method === 'GET' && path === '/api/me') {
      const m = auth.me(bearer(req));
      if (!m) return sendJson(res, 401, { error: 'не авторизован' });
      const cap = gov.capacity(m.pubkey, reg.names);
      const rep = gov.isOwner(m.pubkey) ? (gov.reputation(reg.names)[m.pubkey] || {}).score ?? 0 : cap.rep;
      return sendJson(res, 200, {
        ...m, rep, isOwner: gov.isOwner(m.pubkey), access: gov.scopesOf(m.pubkey),
        capacity: { quotaMB: cap.quotaMB === Infinity ? null : cap.quotaMB, maxSubs: cap.maxSubs === Infinity ? null : cap.maxSubs, canVouch: cap.canVouch },
      });
    }
    // инвайт: по admin-token (владелец машины) или по подписанному запросу держателя
    // доступа 'invite' (одноразовое событие kind 8020)
    if (req.method === 'POST' && path === '/api/invite') {
      if (ADMIN_TOKEN && req.headers['x-admin-token'] === ADMIN_TOKEN) return sendJson(res, 201, { invite: auth.createInvite('founder') });
      let d; try { d = JSON.parse((await readBody(req)) || '{}'); } catch { d = {}; }
      if (d.event) {
        const r = await gov.useInviteEvent(d.event);
        if (r.error) return sendJson(res, 403, { error: r.error, code: 'generic' });
        return sendJson(res, 201, { invite: auth.createInvite(r.by) });
      }
      return sendJson(res, 403, { error: 'нужен admin-token или подписанный запрос' });
    }
    // ---- люди / доступы / репутация / форк ----
    if (req.method === 'GET' && path === '/api/people') {
      const repAll = gov.reputation(reg.names);
      const mem = auth.allMembers();
      const sites = {};
      for (const [n, r] of Object.entries(reg.names)) if (r.owner) (sites[r.owner] ||= []).push(n);
      const people = Object.entries(mem).map(([pk, m]) => ({
        pubkey: pk, handle: m.handle, since: m.ts,
        rep: repAll[pk] || null, sites: (sites[pk] || []).sort(),
        access: gov.scopesOf(pk), isOwner: gov.isOwner(pk),
      })).sort((a, b) => ((b.rep || {}).score || 0) - ((a.rep || {}).score || 0));
      return sendJson(res, 200, { owner: gov.publicState().owner, people });
    }
    if (req.method === 'GET' && path === '/api/gov') return sendJson(res, 200, gov.publicState());
    if (req.method === 'POST' && (path === '/api/vouch' || path === '/api/delegate' || path === '/api/revoke')) {
      let d; try { d = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'bad json', code: 'generic' }); }
      const r = path === '/api/vouch' ? await gov.addVouch(d.event, reg.names)
        : path === '/api/delegate' ? await gov.addDelegation(d.event, reg.names)
        : await gov.addRevocation(d.event);
      return r.error ? sendJson(res, 400, { error: r.error, code: 'generic' }) : sendJson(res, 201, { ok: true });
    }
    // право форка: полная копия состояния, достаточная чтобы поднять свой экземпляр
    if (req.method === 'GET' && path === '/api/export') {
      return sendJson(res, 200, {
        exported_at: Date.now(),
        note: 'Полная копия noet: имена, участники, поручительства, доступы. Код: https://github.com/noet-scz/noet',
        owner: gov.publicState().owner,
        names: reg.names,
        members: auth.allMembers(),
        gov: gov.raw(),
      });
    }
    // обновление зонального имени (*.nt) держателем доступа zone:<имя> или владельцем
    if (req.method === 'POST' && path === '/api/publish-zone') {
      const pk = auth.sessionPubkey(bearer(req));
      if (!pk) return sendJson(res, 401, { error: 'нужен вход', code: 'need_login' });
      let d; try { d = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'bad json', code: 'generic' }); }
      const name = String(d.name || '').toLowerCase().trim();
      if (!new RegExp(`^[a-z0-9-]{1,32}\\.${ZONE_TLD}$`).test(name)) return sendJson(res, 400, { error: `имя вида слово.${ZONE_TLD}`, code: 'name_format' });
      if (!(gov.isOwner(pk) || gov.hasScope(pk, 'zone:' + name))) return sendJson(res, 403, { error: 'нет доступа к этому имени', code: 'generic' });
      const rawHtml = String(d.body || '').slice(0, 500000);
      if (!rawHtml.trim()) return sendJson(res, 400, { error: 'пустая страница', code: 'empty' });
      let cid; try { cid = await ipfsAdd('index.html', Buffer.from(rawHtml, 'utf8')); } catch (e) { return sendJson(res, 502, { error: 'ipfs: ' + e.message, code: 'generic' }); }
      const tm = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const prev = reg.names[name] || {};
      reg.names[name] = { cid, owner: prev.owner || pk, owner_handle: prev.owner_handle || auth.handleOf(pk), ts: Date.now(), title: (tm ? tm[1].trim() : '') || name, raw: { mode: 'html', body: rawHtml, updated_by: auth.handleOf(pk) } };
      saveReg(); ipfsPin(cid); pushNamesToGitHub(); index.delete(name); crawl();
      return sendJson(res, 201, { name, cid });
    }
    if (req.method === 'POST' && path === '/api/claim') {
      const pk = auth.sessionPubkey(bearer(req));
      if (!pk) return sendJson(res, 401, { error: 'нужен вход, чтобы занять имя', code: 'need_login' });
      let d; try { d = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'bad json', code: 'generic' }); }
      const name = String(d.name || '').toLowerCase().trim(), m = name.match(NAME_RE);
      if (!m) return sendJson(res, 400, { error: `имя вида handle.${BLOG_TLD}`, code: 'name_format' });
      if (RESERVED.has(m[1]) || m[1].length === 1) return sendJson(res, 403, { error: 'системное/односложное имя', code: 'name_format' });
      if (!d.cid) return sendJson(res, 400, { error: 'нужен cid', code: 'need_cid' });
      const cur = reg.names[name];
      if (cur && cur.owner && cur.owner !== pk) return sendJson(res, 409, { error: 'имя занято другим участником', code: 'name_taken', owner_handle: cur.owner_handle || null });
      reg.names[name] = { cid: String(d.cid).trim(), owner: pk, owner_handle: auth.handleOf(pk), ts: Date.now(), title: d.title || name };
      saveReg(); ipfsPin(reg.names[name].cid); pushNamesToGitHub(); index.delete(name); crawl();
      return sendJson(res, 201, { name, ...reg.names[name] });
    }
    // публикация страницы: рендер/сырой html -> IPFS -> занять имя -> seed-пин + анонс
    if (req.method === 'POST' && path === '/api/publish') {
      const pk = auth.sessionPubkey(bearer(req));
      if (!pk) return sendJson(res, 401, { error: 'нужен вход, чтобы публиковать', code: 'need_login' });
      let d; try { d = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'bad json', code: 'generic' }); }
      const nm = meNameFor(pk, d.sub);
      if (nm.error) return sendJson(res, 400, { error: nm.error, code: nm.code });
      const name = nm.name;
      const cur = reg.names[name];
      if (cur && cur.owner && cur.owner !== pk) return sendJson(res, 409, { error: 'имя занято другим участником', code: 'name_taken' });
      const subLimit = subQuotaError(pk, name);
      if (subLimit) return sendJson(res, 403, subLimit);
      let cid, recTitle, rawData;
      if (String(d.mode || '') === 'html') {
        const rawHtml = String(d.body || '').slice(0, 500000);
        if (!rawHtml.trim()) return sendJson(res, 400, { error: 'пустая страница', code: 'empty' });
        const tm = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        recTitle = (tm ? tm[1].trim() : '') || name;
        try { cid = await ipfsAdd('index.html', Buffer.from(rawHtml, 'utf8')); } catch (e) { return sendJson(res, 502, { error: 'ipfs: ' + e.message, code: 'generic' }); }
        rawData = { mode: 'html', body: rawHtml };
      } else {
        const title = String(d.title || '').slice(0, 140).trim(), body = String(d.body || '').slice(0, 20000);
        if (!title && !body.trim()) return sendJson(res, 400, { error: 'пустая страница', code: 'empty' });
        const html = renderPage({ title, body, name, handle: auth.handleOf(pk) });
        try { cid = await ipfsAdd('index.html', Buffer.from(html, 'utf8')); } catch (e) { return sendJson(res, 502, { error: 'ipfs: ' + e.message, code: 'generic' }); }
        recTitle = title || name; rawData = { title, body };
      }
      reg.names[name] = { cid, owner: pk, owner_handle: auth.handleOf(pk), ts: Date.now(), title: recTitle, raw: rawData };
      saveReg(); ipfsPin(cid); pushNamesToGitHub(); index.delete(name); crawl();
      return sendJson(res, 201, { name, cid, title: recTitle });
    }
    // публикация целого собранного проекта (фреймворк/игра): много файлов -> директория в IPFS
    if (req.method === 'POST' && path === '/api/publish-dir') {
      const pk = auth.sessionPubkey(bearer(req));
      if (!pk) return sendJson(res, 401, { error: 'нужен вход, чтобы публиковать', code: 'need_login' });
      let d; try { d = JSON.parse((await readBody(req)) || '{}'); } catch { return sendJson(res, 400, { error: 'bad json', code: 'generic' }); }
      const nm = meNameFor(pk, d.sub);
      if (nm.error) return sendJson(res, 400, { error: nm.error, code: nm.code });
      const name = nm.name;
      const cur = reg.names[name];
      if (cur && cur.owner && cur.owner !== pk) return sendJson(res, 409, { error: 'имя занято другим участником', code: 'name_taken' });
      const subLimit = subQuotaError(pk, name);
      if (subLimit) return sendJson(res, 403, subLimit);
      const incoming = Array.isArray(d.files) ? d.files : [];
      if (!incoming.length) return sendJson(res, 400, { error: 'нет файлов', code: 'empty' });
      // квота размера растёт с репутацией (ёмкость, концепция §5.1); владелец без лимита
      const cap = gov.capacity(pk, reg.names);
      const limitMB = cap.quotaMB === Infinity ? 1024 : cap.quotaMB;
      let total = 0; const files = [];
      for (const f of incoming) {
        let p = String(f.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
        if (!p || p.split('/').some((s) => s === '..')) continue;
        const buf = Buffer.from(String(f.data || ''), 'base64');
        total += buf.length;
        if (total > limitMB * 1024 * 1024) return sendJson(res, 413, { error: `проект больше твоей квоты (${limitMB} МБ). Квота растёт с репутацией, смотри страницу Люди.`, code: 'too_big' });
        files.push({ path: p, content: buf });
      }
      if (!files.some((f) => f.path === 'index.html')) return sendJson(res, 400, { error: 'нужен index.html в корне проекта', code: 'no_index' });
      let cid; try { cid = await ipfsAddDir(files); } catch (e) { return sendJson(res, 502, { error: 'ipfs: ' + e.message, code: 'generic' }); }
      const idx = files.find((f) => f.path === 'index.html');
      const tm = idx.content.toString('utf8').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const recTitle = (tm ? tm[1].trim() : '') || name;
      reg.names[name] = { cid, owner: pk, owner_handle: auth.handleOf(pk), ts: Date.now(), title: recTitle, raw: { mode: 'dir' } };
      saveReg(); ipfsPin(cid); pushNamesToGitHub(); index.delete(name); crawl();
      return sendJson(res, 201, { name, cid, title: recTitle });
    }
  }

  // ----- *.me (личные страницы): резолв -> локальный kubo -> отдать -----
  if (isBlog(host)) {
    const rec = reg.names[host];
    if (!rec) return sendHtml(res, 404, notFoundPage(host));
    try { return sendHtml(res, 200, withWidget((await ipfsCat(`${rec.cid}/index.html`)).toString('utf8'))); }
    catch (e) { return sendHtml(res, 504, `<h1>504</h1><p>IPFS не отдал контент: ${esc(e.message)}</p>`); }
  }

  // ----- доступ ПО ИМЕНИ (через прокси-демон) -----
  if (isZone(host)) {
    if (host === 'id.nt') return sendFile(res, join(WEB, 'account.html'));
    if (host === 'relay.nt') return sendFile(res, join(WEB, 'relay.html'));
    if (host === 'people.nt') return sendFile(res, join(WEB, 'people.html'));
    if (host === 'dev.nt') return sendFile(res, join(WEB, 'dev.html'));
    if (host === 'noet.nt' || host === 'search.nt') return sendFile(res, join(WEB, 'search.html'));
    const rec = reg.names[host];
    if (!rec) return sendHtml(res, 404, notFoundPage(host));
    try { return sendHtml(res, 200, withWidget((await ipfsCat(`${rec.cid}/index.html`)).toString('utf8'))); }
    catch (e) { return sendHtml(res, 504, `<h1>504</h1><p>IPFS не отдал контент: ${esc(e.message)}</p>`); }
  }

  // ----- прямой доступ по IP (отладка) -----
  if (req.method === 'GET' && (path === '/' || path === '/index.html')) return sendFile(res, join(WEB, 'search.html'));
  if (req.method === 'GET' && path === '/relay') return sendFile(res, join(WEB, 'relay.html'));
  if (req.method === 'GET' && (path === '/people' || path === '/people/')) return sendFile(res, join(WEB, 'people.html'));
  if (req.method === 'GET' && (path === '/dev' || path === '/dev/')) return sendFile(res, join(WEB, 'dev.html'));
  if (req.method === 'GET' && (path === '/id' || path === '/id/' || path === '/account')) return sendFile(res, join(WEB, 'account.html'));
  if (req.method === 'GET' && path.startsWith('/r/')) {
    const name = path.slice('/r/'.length).toLowerCase();
    const rec = reg.names[name];
    if (!rec) return sendHtml(res, 404, notFoundPage(name));
    try { return sendHtml(res, 200, withWidget((await ipfsCat(`${rec.cid}/index.html`)).toString('utf8'))); }
    catch (e) { return sendHtml(res, 504, `<h1>504</h1><p>${esc(e.message)}</p>`); }
  }

  sendJson(res, 404, { error: 'нет маршрута' });
});

// ---- Nostr-реле ----
if (DAEMON) {
  // демон проксирует relay.nt на реле реестра (общая лента у всех)
  server.on('upgrade', (req, clientSocket, head) => {
    const h = (req.headers.host || '').toLowerCase();
    const wantRelay = h.startsWith('relay.') || (req.url || '').includes('relay');
    if ((req.headers.upgrade || '').toLowerCase() !== 'websocket' || !wantRelay) { clientSocket.destroy(); return; }
    const u = new URL(REGISTRY_URL);
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    const upstream = net.connect(port, u.hostname, () => {
      const fwd = { ...req.headers, host: u.host };
      let raw = 'GET /relay HTTP/1.1\r\n';
      for (const [k, v] of Object.entries(fwd)) raw += `${k}: ${v}\r\n`;
      raw += '\r\n';
      upstream.write(raw);
      if (head && head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => { try { clientSocket.destroy(); } catch {} });
    clientSocket.on('error', () => { try { upstream.destroy(); } catch {} });
  });
} else {
  const relay = makeRelay({
    verify: auth.verifyNostr, file: join(__dir, 'relay-events.json'),
    canDelete: (pk) => gov.isOwner(pk) || gov.hasScope(pk, 'relay.mod'),
  });
  relay.attach(server);
}

server.on('connect', (req, socket) => { socket.write('HTTP/1.1 501 Not Implemented\r\n\r\nnoet работает по http\r\n'); socket.end(); });

server.listen(PORT, '0.0.0.0', async () => {
  if (DAEMON) {
    console.log(`[daemon] :${PORT} → IPFS ${IPFS_GW} · реестр ${REGISTRY_URL}`);
    await syncNames();
    await crawl();
    setInterval(async () => { await syncNames(); await crawl(); }, 60 * 1000);
  } else {
    console.log(`[registry] :${PORT} · имён: ${Object.keys(reg.names).length} · реле on`);
    pushNamesToGitHub();   // освежить https-зеркало имён на старте
    await crawl();
    setInterval(crawl, 5 * 60 * 1000);
  }
});
