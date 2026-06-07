// noet — страница личности на origin id.nt. Здесь живёт ключ.
//  - сверху (top-level): видимая страница аккаунта (создать/войти/профиль/имена/бэкап).
//  - в iframe: мост — отвечает на postMessage (whoami всем, signEvent доверенным).
// Хеши на ЧИСТОМ JS: на http-origin (не localhost) нет crypto.subtle (см. CLAUDE.md §1).
import { schnorr } from '/vendor/noble-secp256k1.js';

/* ---------- sha256 (pure JS, без WebCrypto) ---------- */
const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
function sha256hex(str) {
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const bytes = new TextEncoder().encode(str), l = bytes.length;
  const withOne = l + 1, pad = (56 - (withOne % 64) + 64) % 64, total = withOne + pad + 8;
  const m = new Uint8Array(total); m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, Math.floor((l * 8) / 0x100000000), false);
  dv.setUint32(total - 4, (l * 8) >>> 0, false);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const hx = (x) => ('00000000' + (x >>> 0).toString(16)).slice(-8);
  return hx(h0) + hx(h1) + hx(h2) + hx(h3) + hx(h4) + hx(h5) + hx(h6) + hx(h7);
}

/* ---------- identity ---------- */
const LS = localStorage;
const hex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
const K_SK = 'noet_sk', K_TOK = 'noet_token', K_PROF = 'noet_profile';
const nip07 = () => !!window.nostr;
const getSk = () => LS.getItem(K_SK);

async function pubkey() {
  if (nip07()) return await window.nostr.getPublicKey();
  let sk = getSk(); if (!sk) { sk = hex(schnorr.utils.randomPrivateKey()); LS.setItem(K_SK, sk); }
  return hex(schnorr.getPublicKey(fromHex(sk)));
}
const serialize = (ev) => JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
async function sign(ev) {
  ev.created_at = ev.created_at || Math.floor(Date.now() / 1000); ev.tags = ev.tags || []; ev.content = ev.content || '';
  if (nip07()) return await window.nostr.signEvent(ev);
  ev.pubkey = await pubkey(); ev.id = sha256hex(serialize(ev));
  ev.sig = hex(await schnorr.sign(fromHex(ev.id), fromHex(getSk())));
  return ev;
}
const authH = () => { const t = LS.getItem(K_TOK); return t ? { authorization: 'Bearer ' + t } : {}; };
async function api(path, opts) {
  let r; try { r = await fetch(path, opts); } catch { const e = new Error('network'); e.code = 'network'; throw e; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || ('http ' + r.status)); e.code = j.code || null; e.status = r.status; throw e; }
  return j;
}

const OPS = {
  async whoami() {
    let loggedIn = false, pk = null, handle = null;
    const t = LS.getItem(K_TOK);
    if (t) { try { const m = await api('/api/me', { headers: authH() }); loggedIn = true; pk = m.pubkey; handle = m.handle; } catch { LS.removeItem(K_TOK); } }
    if (!pk && (nip07() || getSk())) { try { pk = await pubkey(); } catch {} }
    let profile = null; try { profile = JSON.parse(LS.getItem(K_PROF) || 'null'); } catch {}
    return { loggedIn, pubkey: pk, handle, profile, nip07: nip07(), hasKey: nip07() || !!getSk() };
  },
  async genKey() { const sk = hex(schnorr.utils.randomPrivateKey()); LS.setItem(K_SK, sk); return { pubkey: hex(schnorr.getPublicKey(fromHex(sk))), nsec: sk }; },
  async importKey({ nsec }) { const v = String(nsec || '').trim().toLowerCase(); if (!/^[0-9a-f]{64}$/.test(v)) { const e = new Error('bad key'); e.code = 'no_key'; throw e; } LS.setItem(K_SK, v); return { pubkey: hex(schnorr.getPublicKey(fromHex(v))) }; },
  async exportKey() { const sk = getSk(); if (!sk) { const e = new Error('no key'); e.code = 'no_key'; throw e; } return { nsec: sk, pubkey: hex(schnorr.getPublicKey(fromHex(sk))) }; },
  async forgetKey() { LS.removeItem(K_SK); LS.removeItem(K_TOK); LS.removeItem(K_PROF); return { ok: true }; },
  async logout() { LS.removeItem(K_TOK); return { ok: true }; },
  async login({ handle, invite }) {
    const pk = await pubkey();
    const ch = (await api('/api/auth/challenge')).challenge;
    const ev = await sign({ kind: 22242, tags: [['challenge', ch]], content: '', pubkey: pk });
    const r = await api('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: ev, handle, invite }) });
    LS.setItem(K_TOK, r.token);
    return { loggedIn: true, pubkey: r.pubkey, handle: r.handle, registered: r.registered };
  },
  async signEvent({ event }) { return { event: await sign(event) }; },
  async publishProfile({ name, picture, about }) {
    const ev = await sign({ kind: 0, tags: [], content: JSON.stringify({ name: name || '', picture: picture || '', about: about || '' }) });
    LS.setItem(K_PROF, JSON.stringify({ name, picture, about }));
    return { event: ev };
  },
  async claim({ name, cid, title }) { return await api('/api/claim', { method: 'POST', headers: { 'content-type': 'application/json', ...authH() }, body: JSON.stringify({ name, cid, title }) }); },
};

function publishToRelay(ev) {
  const urls = ['ws://relay.nt/relay', 'ws://127.0.0.1:8090/relay'];
  const one = (i) => new Promise((res, rej) => {
    let ws; try { ws = new WebSocket(urls[i]); } catch (e) { return rej(e); }
    let opened = false; const to = setTimeout(() => { try { ws.close(); } catch {} rej(Object.assign(new Error('relay'), { again: !opened })); }, 5000);
    ws.onopen = () => { opened = true; ws.send(JSON.stringify(['EVENT', ev])); };
    ws.onmessage = (m) => { let a; try { a = JSON.parse(m.data); } catch { return; } if (a[0] === 'OK' && a[1] === ev.id) { clearTimeout(to); try { ws.close(); } catch {} a[2] ? res() : rej(new Error(a[3] || 'rejected')); } };
    ws.onerror = () => { clearTimeout(to); rej(Object.assign(new Error('relay'), { again: !opened })); };
    ws.onclose = () => { if (!opened) { clearTimeout(to); rej(Object.assign(new Error('relay'), { again: true })); } };
  });
  return one(0).catch((e) => e && e.again ? one(1) : Promise.reject(e));
}

/* ---------- мост (iframe) ---------- */
const TRUSTED = ['search.nt', 'relay.nt', 'profile.nt', 'id.nt'];
const trusted = (o) => { try { return TRUSTED.includes(new URL(o).hostname); } catch { return false; } };
const OPEN = new Set(['whoami']);
window.addEventListener('message', async (e) => {
  const d = e.data; if (!d || d.__noet !== 1 || !d.op) return;
  const reply = (p) => { try { e.source.postMessage({ __noet: 1, id: d.id, ...p }, e.origin); } catch {} };
  if (!OPS[d.op]) return reply({ ok: false, error: 'unknown op' });
  if (!OPEN.has(d.op) && !trusted(e.origin)) return reply({ ok: false, error: 'untrusted', untrusted: true });
  try { reply({ ok: true, result: await OPS[d.op](d.args || {}) }); }
  catch (err) { reply({ ok: false, error: String((err && err.message) || err), code: err && err.code }); }
});
try { parent.postMessage({ __noet: 1, ev: 'ready' }, '*'); } catch {}
const notifyParent = () => { try { parent.postMessage({ __noet: 1, ev: 'changed' }, '*'); } catch {} };

/* ===================== видимая страница (top-level) ===================== */
if (window.top === window.self) renderApp();

function renderApp() {
  const t = window.t, root = document.getElementById('app');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const errText = (e) => (e && e.code && t('err_' + e.code) !== 'err_' + e.code) ? t('err_' + e.code) : (e && e.code === 'network' ? t('err_network') : t('err_generic'));
  const hashN = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  function avatar(pk, name, profile) {
    const pic = profile && profile.picture;
    if (pic && /^(https?:|data:)/i.test(pic)) return pic;
    const seed = pk || name || '?', hue = hashN(seed) % 360, hue2 = (hue + 50) % 360;
    const ch = pic && [...pic].length <= 2 ? pic : ((name || '').trim() ? [...name.trim()][0].toUpperCase() : '');
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><defs><linearGradient id='a' x1='0' y1='0' x2='96' y2='96'><stop offset='0' stop-color='hsl(" + hue + " 65% 56%)'/><stop offset='1' stop-color='hsl(" + hue2 + " 60% 42%)'/></linearGradient></defs><rect width='96' height='96' rx='48' fill='url(#a)'/>" + (ch ? "<text x='48' y='64' font-family='system-ui,sans-serif' font-size='46' font-weight='600' fill='white' text-anchor='middle'>" + esc(ch) + "</text>" : "") + "</svg>";
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  const download = (name, text) => { const a = document.createElement('a'); a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text); a.download = name; a.click(); };
  const backupText = (nsec, pub) => 'noet — приватный ключ (никому не показывай):\n' + nsec + '\n\nпубличный ключ:\n' + pub + '\n\nПотеряешь ключ — потеряешь личность.';

  const header = () => `<div class="hd"><a class="brand" href="http://search.nt/"><img src="/logo.svg" alt=""><b>noet</b></a>
    <div class="lang"><button data-l="ru" class="${window.noetLang() === 'ru' ? 'on' : ''}">RU</button><button data-l="en" class="${window.noetLang() === 'en' ? 'on' : ''}">EN</button></div></div>`;
  const wrapErr = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { console.error(e); throw e; } };

  let state = { view: 'loading', me: null, justKey: null };

  async function refresh() {
    try { state.me = await OPS.whoami(); } catch { state.me = null; }
  }
  async function init() {
    await refresh();
    if (state.me && state.me.loggedIn) state.view = 'profile';
    else if (state.me && state.me.hasKey) {
      try { await OPS.login({}); await refresh(); state.view = 'profile'; }
      catch { state.view = 'register'; }
    } else state.view = 'create';
    render();
  }

  function render() {
    const me = state.me || {};
    let body = '';
    if (state.view === 'loading') body = `<div class="card mut">…</div>`;
    else if (state.view === 'create') {
      body = `<div class="card">
        <h1>${t('acc_welcome')}</h1>
        <p class="mut">${t('acc_guest_hint')}</p>
        <button class="btn big" id="create">${t('create_identity')}</button>
        <div class="or"><button class="lnk" id="toimport">${t('have_key')}</button></div>
        <div id="importbox" class="hide"><label>${t('import_key')}</label>
          <input id="impkey" placeholder="${t('import_ph')}"><button class="btn" id="doimport">${t('import_key')}</button></div>
        <div class="msg err" id="msg"></div>
      </div>`;
    } else if (state.view === 'register') {
      body = `<div class="card">
        <h1>${t('choose_handle')}</h1>
        <div class="ok">✓ ${t('key_ready')}${state.justKey ? ` <a class="lnk" id="redl">${t('download_backup')}</a>` : ''}</div>
        <p class="mut">${t('backup_warn')}</p>
        <label>${t('choose_handle')}</label><input id="rhandle" placeholder="${t('handle_ph')}" autofocus>
        <label>${t('invite_ph')}</label><input id="rinvite" placeholder="${t('invite_ph')}">
        <button class="btn big" id="register">${t('register_btn')}</button>
        <div class="msg err" id="msg"></div>
      </div>`;
    } else if (state.view === 'profile') {
      const p = me.profile || {}, dname = (p.name || ('@' + me.handle));
      body = `<div class="card profile">
        <div class="phd"><img class="bigav" src="${avatar(me.pubkey, dname, p)}"><div><div class="dn">${esc(dname)}</div><div class="mut">@${esc(me.handle)}</div></div></div>
        <label>${t('display_name')}</label><input id="p_name" value="${esc(p.name)}" placeholder="${t('dname_ph')}">
        <label>${t('avatar_lbl')}</label><input id="p_pic" value="${esc(p.picture)}" placeholder="${t('avatar_ph')}">
        <label>${t('about_lbl')}</label><textarea id="p_about" placeholder="${t('about_ph')}">${esc(p.about)}</textarea>
        <button class="btn" id="psave">${t('save')}</button><div class="msg" id="pmsg"></div>
      </div>
      <div class="card">
        <h2>${t('your_names')}</h2><div id="names" class="mut">…</div>
        <div class="sep"></div><label>${t('claim_title')}</label>
        <div class="row"><input id="c_name" placeholder="${t('name_ph')}"><input id="c_cid" placeholder="${t('cid_ph')}"></div>
        <button class="btn" id="claim">${t('claim_btn')}</button><div class="msg" id="cmsg"></div>
      </div>
      <div class="card">
        <div class="row2">
          ${me.hasKey && !me.nip07 ? `<button class="btn ghost" id="backup">${t('show_backup')}</button>` : ''}
          <button class="btn ghost" id="logout">${t('logout')}</button>
        </div>
        ${me.hasKey && !me.nip07 ? `<button class="lnk danger" id="forget">${t('forget_key')}</button>` : ''}
        ${me.pubkey ? `<div class="mut key">${t('key_label')}: <code>${esc(me.pubkey.slice(0, 32))}…</code></div>` : ''}
      </div>`;
    }
    root.innerHTML = header() + `<div class="wrap">${body}</div>`;
    wire();
  }

  function setMsg(id, text, cls) { const e = document.getElementById(id); if (e) { e.textContent = text; e.className = 'msg ' + (cls || ''); } }

  function wire() {
    document.querySelectorAll('.lang button').forEach((b) => b.onclick = () => window.setLang(b.dataset.l));
    const id = (x) => document.getElementById(x), on = (x, fn) => { const el = id(x); if (el) el.onclick = fn; };
    on('create', async () => { try { const r = await OPS.genKey(); state.justKey = r.nsec; download('noet-ключ.txt', backupText(r.nsec, r.pubkey)); await refresh(); state.view = 'register'; render(); } catch (e) { setMsg('msg', errText(e), 'err'); } });
    on('toimport', () => { const b = id('importbox'); if (b) b.classList.toggle('hide'); });
    on('doimport', async () => { try { await OPS.importKey({ nsec: id('impkey').value }); try { await OPS.login({}); await refresh(); state.view = 'profile'; } catch { await refresh(); state.view = 'register'; } render(); } catch (e) { setMsg('msg', errText(e), 'err'); } });
    on('redl', () => { if (state.justKey) { const pk = state.me && state.me.pubkey; download('noet-ключ.txt', backupText(state.justKey, pk)); } });
    on('register', async () => {
      const handle = id('rhandle').value.trim(), invite = id('rinvite').value.trim();
      setMsg('msg', '…', '');
      try { await OPS.login({ handle, invite }); await refresh(); state.justKey = null; state.view = 'profile'; render(); notifyParent(); }
      catch (e) { setMsg('msg', errText(e), 'err'); }
    });
    on('psave', async () => {
      setMsg('pmsg', '…', '');
      try { const r = await OPS.publishProfile({ name: id('p_name').value.trim(), picture: id('p_pic').value.trim(), about: id('p_about').value.trim() }); try { await publishToRelay(r.event); } catch {} await refresh(); render(); setMsg('pmsg', t('saved'), 'ok'); notifyParent(); }
      catch (e) { setMsg('pmsg', errText(e), 'err'); }
    });
    on('claim', async () => {
      setMsg('cmsg', '…', '');
      try { await OPS.claim({ name: id('c_name').value.trim(), cid: id('c_cid').value.trim() }); setMsg('cmsg', t('claimed'), 'ok'); loadNames(); }
      catch (e) { setMsg('cmsg', errText(e), 'err'); }
    });
    on('backup', async () => { try { const r = await OPS.exportKey(); download('noet-ключ.txt', backupText(r.nsec, r.pubkey)); } catch (e) { alert(errText(e)); } });
    on('forget', async () => { if (!confirm(t('forget_confirm'))) return; await OPS.forgetKey(); await init(); notifyParent(); });
    on('logout', async () => { await OPS.logout(); await init(); notifyParent(); });
    if (state.view === 'profile') loadNames();
  }
  async function loadNames() {
    const el = document.getElementById('names'); if (!el) return;
    try {
      const all = await (await fetch('/api/names')).json();
      const mine = Object.entries(all).filter(([, r]) => r.owner === state.me.pubkey);
      el.innerHTML = mine.length ? mine.map(([n, r]) => `<div class="nrow"><a href="http://${n}/">${n}</a><span class="mut">${(r.cid || '').slice(0, 14)}…</span></div>`).join('') : `<span class="mut">${t('no_names')}</span>`;
    } catch { el.textContent = '…'; }
  }
  window.addEventListener('noetlang', render);
  init();
}
