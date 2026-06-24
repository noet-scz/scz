// noet — резолвер+рендер в странице расширения. Замороженный код, всё изменяемое
// (адрес реестра, список шлюзов, имена) тянется снаружи в рантайме.

const api = globalThis.browser || globalThis.chrome;   // Firefox: browser.*, Chrome: chrome.*
const REMOTE_CONFIG = 'https://noet-scz.github.io/noet/dist/config.json';
const $ = (s) => document.querySelector(s);

// исходный URL пришёл как ...view.html?u=<полный URL>
function originalUrl() {
  const i = location.href.indexOf('?u=');
  return i < 0 ? '' : location.href.slice(i + 3);
}
function parseTarget(raw) {
  try { const u = new URL(raw); return { host: u.hostname.toLowerCase(), path: u.pathname + u.search, full: raw }; }
  catch { return { host: '', path: '/', full: raw }; }
}
// базовое имя = последние две метки. dev.nyx.me / api.dev.nyx.me → nyx.me (его владелец владеет поддеревом)
function baseOf(h) { const p = String(h).split('.'); return p.length <= 2 ? h : p.slice(-2).join('.'); }

async function loadConfig() {
  try {
    const r = await fetch(REMOTE_CONFIG, { signal: AbortSignal.timeout(5000), cache: 'no-cache' });
    if (r.ok) { const c = await r.json(); await api.storage.local.set({ cfg: c }); return c; }
  } catch {}
  const { cfg } = await api.storage.local.get('cfg');         // прошлый удачный
  if (cfg) return cfg;
  return fetch(api.runtime.getURL('config.default.json')).then((r) => r.json()); // вшитый запасной
}

async function fetchNames(cfg) {
  for (const src of cfg.name_sources || []) {
    try {
      const r = await fetch(src, { signal: AbortSignal.timeout(6000), cache: 'no-cache' });
      if (!r.ok) continue;
      const j = await r.json();
      await api.storage.local.set({ names: j, names_ts: Date.now() });
      return j;
    } catch {}
  }
  const { names } = await api.storage.local.get('names');     // офлайн-кэш
  return names || {};
}

function setName(host) {
  const dot = host.lastIndexOf('.');
  $('#name').innerHTML = dot > 0
    ? host.slice(0, dot) + '<span class="tld">' + host.slice(dot) + '</span>'
    : host;
}
function showMsg(html) { $('#msg').style.display = 'flex'; $('#msg').innerHTML = html; }

// ---- верхняя полоса: навигация + личность + сворачивание (одна на все страницы) ----
function esch(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function genAv(pk, nm) { let h = 0; const seed = pk || nm || '?'; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0; const hue = h % 360, ch = (nm || '').trim() ? nm.trim()[0].toUpperCase() : ''; return 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='32' fill='hsl(" + hue + " 60% 50%)'/><text x='32' y='43' font-family='system-ui' font-size='30' font-weight='600' fill='white' text-anchor='middle'>" + esch(ch) + "</text></svg>"); }
function setupBar(host) {
  $('#brand').onclick = () => { location.href = 'http://noet.nt/'; };
  document.querySelectorAll('#nav a').forEach((a) => { if (a.dataset.h === host) a.classList.add('on'); a.onclick = (e) => { e.preventDefault(); location.href = 'http://' + a.dataset.h + '/'; }; });
  $('#chip').onclick = () => { location.href = 'http://id.nt/'; };
  $('#collapse').onclick = () => { $('#bar').classList.add('hide'); $('#reopen').style.display = 'block'; };
  $('#reopen').onclick = () => { $('#bar').classList.remove('hide'); $('#reopen').style.display = 'none'; };
  renderChip();
}
function showChip(dn, av) { const c = $('#chip'); c.innerHTML = '<img src="' + esch(av) + '"><span class="nm">' + esch(dn) + '</span>'; c.style.display = 'inline-flex'; }
function applyNavLang(lang) {
  const L = { 'people.nt': { ru: 'Люди', en: 'People' }, 'relay.nt': { ru: 'Лента', en: 'Feed' }, 'dev.nt': { ru: 'Разработчикам', en: 'Developers' } };
  document.querySelectorAll('#nav a').forEach((a) => { const t = L[a.dataset.h]; if (t) a.textContent = t[lang] || t.ru; });
  const b = $('#brand'); if (b) b.title = lang === 'en' ? 'Home' : 'Главная';
  const c = $('#chip'); if (c) c.title = lang === 'en' ? 'My page' : 'Моя страница';
}
async function renderChip() {
  let pk; try { pk = await getPub(); } catch { return; }   // нет ключа — нет чипа (гость)
  showChip('я', genAv(pk, 'я'));   // показываем сразу, как только есть ключ; ниже уточняем профилем
  try {
    const evs = await relayQuery([{ kinds: [0], authors: [pk], limit: 1 }, { kinds: [31111], authors: [pk], limit: 20 }]);
    let prof = {}; const p0 = evs.find((e) => e.kind === 0); try { prof = p0 ? JSON.parse(p0.content) : {}; } catch {}
    applyNavLang(prof.lang === 'en' ? 'en' : 'ru');
    const claims = evs.filter((e) => e.kind === 31111 && /\.(me|nt)$/i.test(((e.tags.find((t) => t[0] === 'd') || [])[1]) || '')).sort((a, b) => b.created_at - a.created_at);
    const name = claims[0] ? (claims[0].tags.find((t) => t[0] === 'd') || [])[1] : '';
    const dn = prof.name || name.replace(/\.(me|nt)$/i, '') || 'я';
    const av = prof.picture && /^(https?:|data:)/i.test(prof.picture) ? prof.picture : genAv(pk, dn);
    showChip(dn, av);
  } catch { /* профиль не подгрузился — остаётся базовый чип */ }
}

// ---- мост window.noet / window.nostr для контента в sandbox-рендере ----
// Публичные шлюзы либо не выполняют JS (dweb.link), либо не находят наш контент
// (w3s.link, IPNI). Поэтому забираем БАЙТЫ страницы со шлюза (он их отдаёт) и рисуем
// в sandbox-странице расширения (там CSP разрешает JS). Личность и реле страница
// получает через мост сюда: подпись ключом расширения + публичные wss-реле.
let RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];   // публичные реле — дом данных (P2); конфиг может переопределить
const _K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function sha256hex(str){const rotr=(x,n)=>(x>>>n)|(x<<(32-n));const bytes=new TextEncoder().encode(str),l=bytes.length;const withOne=l+1,pad=(56-(withOne%64)+64)%64,total=withOne+pad+8;const m=new Uint8Array(total);m.set(bytes);m[l]=0x80;const dv=new DataView(m.buffer);dv.setUint32(total-8,Math.floor((l*8)/0x100000000),false);dv.setUint32(total-4,(l*8)>>>0,false);let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;const w=new Uint32Array(64);for(let i=0;i<total;i+=64){for(let t=0;t<16;t++)w[t]=dv.getUint32(i+t*4,false);for(let t=16;t<64;t++){const s0=rotr(w[t-15],7)^rotr(w[t-15],18)^(w[t-15]>>>3);const s1=rotr(w[t-2],17)^rotr(w[t-2],19)^(w[t-2]>>>10);w[t]=(w[t-16]+s0+w[t-7]+s1)>>>0;}let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;for(let t=0;t<64;t++){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g);const t1=(h+S1+ch+_K[t]+w[t])>>>0;const S0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c);const t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;}const hx=(x)=>('00000000'+(x>>>0).toString(16)).slice(-8);return hx(h0)+hx(h1)+hx(h2)+hx(h3)+hx(h4)+hx(h5)+hx(h6)+hx(h7);}
const u8hex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');
const hex2u8 = (h) => Uint8Array.from(h.match(/.{2}/g).map((b) => parseInt(b, 16)));
let _sc = null;
async function schnorr() { if (!_sc) _sc = (await import(api.runtime.getURL('vendor/noble-secp256k1.js'))).schnorr; return _sc; }
async function keyHex() { return (await api.storage.local.get('noet_sk')).noet_sk || null; }
async function getPub() { const sk = await keyHex(); if (!sk) throw new Error('в noet нет ключа'); return u8hex((await schnorr()).getPublicKey(hex2u8(sk))); }
async function signEv(ev) {
  const sk = await keyHex(); if (!sk) throw new Error('в noet нет ключа');
  const s = await schnorr(); ev = ev || {};
  ev.pubkey = u8hex(s.getPublicKey(hex2u8(sk)));
  ev.created_at = ev.created_at || Math.floor(Date.now() / 1000); ev.tags = ev.tags || []; ev.content = ev.content || '';
  ev.id = sha256hex(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]));
  ev.sig = u8hex(await s.sign(hex2u8(ev.id), hex2u8(sk)));
  return ev;
}
async function relayPublish(ev) {
  const signed = await signEv(ev); const msg = JSON.stringify(['EVENT', signed]);
  await Promise.allSettled(RELAYS.map((u) => new Promise((res) => {
    let ws; try { ws = new WebSocket(u); } catch { return res(); }
    const t = setTimeout(() => { try { ws.close(); } catch {} res(); }, 4500);
    ws.onopen = () => { try { ws.send(msg); } catch {} };
    ws.onmessage = (m) => { try { if (JSON.parse(m.data)[0] === 'OK') { clearTimeout(t); ws.close(); res(); } } catch {} };
    ws.onerror = () => { clearTimeout(t); res(); };
  })));
  return signed;
}
function relayQuery(filters, opts) {
  const list = Array.isArray(filters) ? filters : [filters]; const seen = new Map();
  const socks = RELAYS.map((u) => { try { return new WebSocket(u); } catch { return null; } }).filter(Boolean);
  return new Promise((res) => {
    let closed = 0;
    const fin = () => { try { socks.forEach((w) => w.close()); } catch {} res([...seen.values()].sort((a, b) => b.created_at - a.created_at)); };
    const t = setTimeout(fin, (opts && opts.timeout) || 4500);
    socks.forEach((ws) => {
      ws.onopen = () => { try { ws.send(JSON.stringify(['REQ', 'q', ...list])); } catch {} };
      ws.onmessage = (m) => { try { const a = JSON.parse(m.data); if (a[0] === 'EVENT') { const ev = a[2]; if (ev && !seen.has(ev.id)) seen.set(ev.id, ev); } else if (a[0] === 'EOSE') { ws.close(); if (++closed >= socks.length) { clearTimeout(t); fin(); } } } catch {} };
      ws.onerror = () => { if (++closed >= socks.length) { clearTimeout(t); fin(); } };
    });
  });
}
async function handleCall(apiName, method, params) {
  if (apiName === 'nostr') { if (method === 'getPublicKey') return await getPub(); if (method === 'signEvent') return await signEv(params); return {}; }
  if (apiName === 'noet') { if (method === 'me') return { pubkey: await getPub() }; if (method === 'publish') return await relayPublish(params); if (method === 'query') return await relayQuery(params[0], params[1] || {}); }
  throw new Error('неизвестный вызов');
}

// исходник SDK примитивов — один раз тянем из пакета расширения и вкладываем в рендер,
// чтобы у контента был тот же window.noet, что и на обычных страницах
let _sdkSrc = null;
async function sdkSrc() {
  if (_sdkSrc == null) { try { _sdkSrc = await (await fetch(api.runtime.getURL('noet-primitives.js'))).text(); } catch { _sdkSrc = ''; } }
  return _sdkSrc;
}

let _pendingDoc = null;
window.addEventListener('message', async (e) => {
  const d = e.data;
  if (d && d.__noetRender === 'ready') {
    if (_pendingDoc) { try { e.source.postMessage({ __noetRender: 'doc', html: _pendingDoc.html, base: _pendingDoc.base, sdk: _pendingDoc.sdk }, '*'); } catch {} }
    $('#msg').style.display = 'none'; $('#frame').hidden = false;
    return;
  }
  // навигация из sandbox-страницы (UI снаружи): перевести ВКЛАДКУ на noet-имя
  if (d && d.__noetNav) { try { location.href = d.__noetNav; } catch {} return; }
  if (d && d.__noetOpen) { try { window.open(d.__noetOpen, '_blank', 'noopener'); } catch {} return; }
  if (d && d.__noetCall) {
    let result, error;
    try { result = await handleCall(d.api, d.method, d.params); } catch (err) { error = (err && err.message) || 'ошибка'; }
    try { e.source.postMessage({ __noetRes: 1, id: d.id, result, error }, '*'); } catch {}
  }
});

// показать готовый html в sandbox-странице render.html (там работает JS)
async function renderDoc(html, base) {
  _pendingDoc = { html, base: base || '', sdk: await sdkSrc() };
  $('#frame').src = api.runtime.getURL('render.html');
}
// IPFS: забрать байты страницы со шлюза (он их отдаёт, даже если не выполняет JS) и показать
async function renderContent(cid, gateways) {
  let html = null, base = '';
  for (let i = 0; i < gateways.length; i++) {
    const gw = gateways[i].replace('{cid}', cid);
    try {
      const r = await fetch(gw, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const txt = await r.text();
      if (txt && /<[a-z!/]/i.test(txt)) { html = txt; base = gw; break; }
    } catch { /* следующий шлюз */ }
  }
  if (html == null) { showMsg('<h2>Не удалось открыть</h2><div>Страница ещё загружается в сеть. Попробуй обновить через минуту.</div>'); return; }
  return renderDoc(html, base);
}

// P2: «вид, а не хранилище». Указатель страницы живёт ещё и на публичных реле как
// подписанное событие 31002 (d=имя, content={cid,…}), поэтому обновления и другой
// экземпляр видят его БЕЗ нашего сервера. Берём свежий указатель владельца, если есть.
// P5: бессерверный резолв имени по заявкам на публичных реле (OTS-очерёдность).
// Нужен, когда имени нет в индексе-зеркале (или реестр выключен совсем).
let _namesMod = null;
async function namesMod() { if (!_namesMod) _namesMod = await import(api.runtime.getURL('noet-names.js')); return _namesMod; }
const hasD = (ev, name) => (ev.tags || []).some((t) => t[0] === 'd' && t[1] === name);

// БЫСТРЫЙ бессерверный резолв: ОДИН запрос за заявкой (31111) И страницей (31002), с
// РАННИМ выходом — отвечаем, как только пришла заявка+страница (≈ от самого быстрого
// реле, <1с), не дожидаясь EOSE от всех. Один претендент → он владелец; коллизия → OTS.
// Резолв host. Владелец берётся из заявки на БАЗОВОЕ имя (base): кто владеет nyx.me, тот
// владеет и dev.nyx.me. Страница — 31002 точного host, подписанная этим владельцем.
// Для базового имени base === host, поведение прежнее.
function resolveServerless(host) {
  const base = baseOf(host);
  return new Promise((resolve) => {
    let socks; try { socks = RELAYS.map((u) => new WebSocket(u)); } catch { return resolve(null); }
    const claims = [], pages = []; let done = false, closed = 0, soon = null;
    const cap = setTimeout(() => finish(), 4500);
    function finish() {
      if (done) return; done = true; clearTimeout(cap); clearTimeout(soon); try { socks.forEach((w) => w.close()); } catch {}
      if (!claims.length) return resolve(null);
      claims.sort((a, b) => a.created_at - b.created_at);
      const owner = claims[0].pubkey;   // ранняя заявка на базу = владелец поддерева
      const mine = pages.filter((p) => p.pubkey === owner).sort((a, b) => b.created_at - a.created_at);
      let rec = null; if (mine[0]) { try { const d = JSON.parse(mine[0].content); rec = { html: d.html || null, cid: d.cid || null }; } catch {} }
      resolve({ owner, rec });
    }
    socks.forEach((ws) => {
      ws.onopen = () => { try { ws.send(JSON.stringify(['REQ', 'q', { kinds: [31111], '#d': [base], limit: 20 }, { kinds: [31002], '#d': [host], limit: 20 }])); } catch {} };
      ws.onmessage = (m) => {
        try { const a = JSON.parse(m.data);
          if (a[0] === 'EVENT') { const ev = a[2]; if (ev.kind === 31111 && hasD(ev, base)) claims.push(ev); else if (ev.kind === 31002 && hasD(ev, host)) pages.push(ev);
            if (claims.length && pages.length && !soon) soon = setTimeout(finish, 400);   // есть оба → добираем 400мс и отвечаем
          } else if (a[0] === 'EOSE') { ws.close(); if (++closed >= socks.length) finish(); }
        } catch {}
      };
      ws.onerror = () => { if (++closed >= socks.length) finish(); };
    });
  });
}

async function main() {
  const cfg = await loadConfig();
  if (Array.isArray(cfg.relays) && cfg.relays.length) RELAYS = cfg.relays;
  const { host, path } = parseTarget(originalUrl());

  setupBar(host || '');   // навигация и личность живут в верхней полосе, общей для всех страниц
  if (!host) { showMsg('<h2>noet</h2><div>Не разобрал адрес.</div>'); return; }

  // Служебные страницы (дом/профиль/люди/лента/разработчикам) тянутся СНАРУЖИ (с Pages)
  // и рисуются в sandbox с мостом window.noet/nostr. Расширение заморожено: правки UI
  // идут без переустановки. Вшитая копия — только запасной путь, если Pages недоступны.
  const APP_PAGES = { 'noet.nt': 'home', 'search.nt': 'home', 'id.nt': 'profile', 'people.nt': 'people', 'dev.nt': 'dev', 'relay.nt': 'feed', 'domains.nt': 'domains' };
  const BUNDLED = { home: 'home', profile: 'app', people: 'people', feed: 'feed', dev: 'dev' };   // офлайн-запас есть не у всех
  if (APP_PAGES[host]) {
    setName(host);
    showMsg('<div class="spin"></div><div>Открываю…</div>');
    const page = APP_PAGES[host];
    const uiBase = ((cfg.ui_base || 'https://noet-scz.github.io/noet/dist/app/').replace(/\/$/, '')) + '/';
    try {
      const r = await fetch(uiBase + page + '.html', { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
      if (r.ok) { const html = await r.text(); if (/<[a-z!/]/i.test(html)) { renderDoc(html, uiBase); return; } }
    } catch { /* запасной путь ниже */ }
    if (BUNDLED[page]) location.href = api.runtime.getURL(BUNDLED[page] + '.html');   // вшитый запас
    else showMsg('<h2>noet</h2><div>Не удалось загрузить. Обнови страницу.</div>');
    return;
  }

  // контент по имени
  setName(host);
  showMsg('<div class="spin"></div><div>Открываю…</div>');
  const names = await fetchNames(cfg);
  const rec = names[host];
  if (!rec || !rec.cid) {
    // имени нет в индексе → бессерверный путь: один запрос к реле (заявка + страница)
    showMsg('<div class="spin"></div><div>Открываю…</div>');
    const sv = await resolveServerless(host);
    if (sv && sv.rec) {
      if (sv.rec.html) { renderDoc(sv.rec.html, ''); return; }
      if (sv.rec.cid) { renderContent(sv.rec.cid, cfg.gateways || []); return; }
    }
    showMsg(`<h2>${host}</h2><div>Такой страницы пока нет.</div>`);
    return;
  }
  showMsg('<div class="spin"></div><div>Открываю…</div>');
  renderContent(rec.cid, cfg.gateways || []);   // индекс имён авторитетен; без фоновой подмены
}

main();
