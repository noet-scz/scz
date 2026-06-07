// noet — страница личности (id.nt).
// top-level: видимая страница (регистрация/вход/профиль/редактор).
// popup-режим (?popup=1): логинит и отправляет {ev:'auth', token, nsec} opener-у.
// Хеши — pure JS: на http-origin нет crypto.subtle (см. CLAUDE.md §1).
import { schnorr } from '/vendor/noble-secp256k1.js';

/* ---------- sha256 pure JS ---------- */
const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function sha256hex(str){const rotr=(x,n)=>(x>>>n)|(x<<(32-n));const bytes=new TextEncoder().encode(str),l=bytes.length;const withOne=l+1,pad=(56-(withOne%64)+64)%64,total=withOne+pad+8;const m=new Uint8Array(total);m.set(bytes);m[l]=0x80;const dv=new DataView(m.buffer);dv.setUint32(total-8,Math.floor((l*8)/0x100000000),false);dv.setUint32(total-4,(l*8)>>>0,false);let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;const w=new Uint32Array(64);for(let i=0;i<total;i+=64){for(let t=0;t<16;t++)w[t]=dv.getUint32(i+t*4,false);for(let t=16;t<64;t++){const s0=rotr(w[t-15],7)^rotr(w[t-15],18)^(w[t-15]>>>3);const s1=rotr(w[t-2],17)^rotr(w[t-2],19)^(w[t-2]>>>10);w[t]=(w[t-16]+s0+w[t-7]+s1)>>>0;}let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;for(let t=0;t<64;t++){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g);const t1=(h+S1+ch+K[t]+w[t])>>>0;const S0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c);const t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;}const hx=(x)=>('00000000'+(x>>>0).toString(16)).slice(-8);return hx(h0)+hx(h1)+hx(h2)+hx(h3)+hx(h4)+hx(h5)+hx(h6)+hx(h7);}

/* ---------- identity ---------- */
const LS = localStorage;
const hex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
const K_SK = 'noet_sk', K_TOK = 'noet_token', K_PROF = 'noet_profile';
const nip07 = () => !!window.nostr;
const getSk = () => LS.getItem(K_SK);

async function pubkey() {
  if (nip07()) return await window.nostr.getPublicKey();
  const sk = getSk();
  if (!sk) throw Object.assign(new Error('no key'), { code: 'no_key' });
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
  async publish({ name, title, body, template }) { return await api('/api/publish', { method: 'POST', headers: { 'content-type': 'application/json', ...authH() }, body: JSON.stringify({ name, title, body, template }) }); },
};

/* ---------- popup-режим (открыт другой страницей зоны) ---------- */
const IS_POPUP = new URLSearchParams(location.search).has('popup');

async function doPopupAuth() {
  const me = await OPS.whoami();
  if (me.loggedIn) {
    // Уже залогинен → отдаём токен и nsec, закрываемся
    const token = LS.getItem(K_TOK), nsec = getSk(), profile = me.profile;
    try { window.opener.postMessage({ __noet: 1, ev: 'auth', token, nsec, profile }, '*'); } catch {}
    setTimeout(() => { try { window.close(); } catch {} }, 300);
    return true;
  }
  if (me.hasKey && getSk()) {
    // Ключ есть, токена нет → тихий логин (известный pubkey)
    try {
      await OPS.login({});
      const token = LS.getItem(K_TOK), nsec = getSk(), profile = me.profile;
      try { window.opener.postMessage({ __noet: 1, ev: 'auth', token, nsec, profile }, '*'); } catch {}
      setTimeout(() => { try { window.close(); } catch {} }, 300);
      return true;
    } catch { /* ключ есть, но не зарегистрирован → показываем register */ }
  }
  return false;
}

/* ---------- миграция: принимаем ключ из id.noet.nt ---------- */
if (new URLSearchParams(location.search).has('migrate')) {
  try { window.opener.postMessage({ __noet: 1, ev: 'ready_migrate' }, 'http://id.noet.nt'); } catch {}
  window.addEventListener('message', (e) => {
    if (e.origin !== 'http://id.noet.nt') return;
    const d = e.data; if (!d || d.__noet !== 1 || d.ev !== 'migrate') return;
    try { if (d.sk) LS.setItem(K_SK, d.sk); } catch {}
    try { if (d.prof) LS.setItem(K_PROF, d.prof); } catch {}
  });
}

/* ---------- видимая страница ---------- */
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

  const header = () => `<div class="hd"><a class="brand" href="http://noet.nt/"><img src="/logo.svg" alt=""><b>noet</b></a>
    <div class="lang"><button data-l="ru" class="${window.noetLang() === 'ru' ? 'on' : ''}">RU</button><button data-l="en" class="${window.noetLang() === 'en' ? 'on' : ''}">EN</button></div></div>`;

  let state = { view: 'loading', me: null, justKey: null, edTitle: '', edBody: '' };

  async function refresh() { try { state.me = await OPS.whoami(); } catch { state.me = null; } }

  async function init() {
    // Popup-режим: пробуем тихо авторизоваться и закрыть
    if (IS_POPUP) {
      const done = await doPopupAuth();
      if (done) {
        root.innerHTML = header() + '<div class="wrap"><div class="card mut" style="text-align:center;padding:2rem">…</div></div>';
        return;
      }
    }
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
    if (state.view === 'loading') {
      body = `<div class="card mut">…</div>`;
    } else if (state.view === 'create') {
      body = `<div class="card">
        <h1>${t('acc_welcome')}</h1>
        <p class="mut">${t('acc_guest_hint')}</p>
        <label>${t('import_key')}</label>
        <input id="impkey" placeholder="${t('import_ph')}" autofocus>
        <button class="btn big" id="doimport">${t('import_key')}</button>
        <div class="msg err" id="msg"></div>
        <div class="sep"></div>
        <div class="or"><button class="lnk" id="create">${t('create_identity')}</button></div>
      </div>`;
    } else if (state.view === 'register') {
      body = `<div class="card">
        <h1>${t('choose_handle')}</h1>
        <div class="ok">✓ ${t('key_ready')}${state.justKey ? ` <a class="lnk" id="redl">${t('download_backup')}</a>` : ''}</div>
        <p class="mut">${t('backup_warn')}</p>
        <label>${t('choose_handle')}</label><input id="rhandle" placeholder="${t('handle_ph')}" autofocus>
        <button class="btn big" id="register">${t('register_btn')}</button>
        <div class="msg err" id="msg"></div>
      </div>`;
    } else if (state.view === 'profile') {
      const p = me.profile || {}, dname = (p.name || me.handle);
      const blogUrl = me.handle ? `http://${me.handle}.blog/` : null;
      body = `<div class="card profile">
        <div class="phd"><img class="bigav" src="${avatar(me.pubkey, dname, p)}"><div><div class="dn">${esc(dname)}</div><div class="mut">@${esc(me.handle)}</div></div></div>
        <label>${t('display_name')}</label><input id="p_name" value="${esc(p.name)}" placeholder="${t('dname_ph')}">
        <label>${t('avatar_lbl')}</label><input id="p_pic" value="${esc(p.picture)}" placeholder="${t('avatar_ph')}">
        <label>${t('about_lbl')}</label><textarea id="p_about" placeholder="${t('about_ph')}">${esc(p.about)}</textarea>
        <button class="btn" id="psave">${t('save')}</button><div class="msg" id="pmsg"></div>
      </div>
      ${blogUrl ? `<div class="card"><div class="row2">
        <div><div class="mut" style="font-size:.8rem;margin-bottom:.3rem">${t('your_page')}</div>
        <a href="${esc(blogUrl)}" style="font-size:1.05rem;color:var(--acc2)">${esc(me.handle)}.blog</a></div>
        <button class="btn ghost" id="goedit" style="margin-top:0">${t('edit_page')}</button>
      </div></div>` : ''}
      <div class="card">
        <div class="row2">
          ${me.hasKey && !me.nip07 ? `<button class="btn ghost" id="backup">${t('show_backup')}</button>` : ''}
          <button class="btn ghost" id="logout">${t('logout')}</button>
        </div>
        ${me.hasKey && !me.nip07 ? `<button class="lnk danger" id="forget">${t('forget_key')}</button>` : ''}
        ${me.pubkey ? `<div class="mut key">${t('key_label')}: <code>${esc(me.pubkey.slice(0, 32))}…</code></div>` : ''}
      </div>`;
    } else if (state.view === 'editor') {
      const handle = (state.me || {}).handle || '';
      const blogUrl = handle ? handle + '.blog' : '…';
      body = `<div class="ed-wrap">
        <div class="ed-head">
          <button class="lnk" id="edback">← ${t('back')}</button>
          <span class="mut" style="font-size:.85rem">${esc(blogUrl)}</span>
        </div>
        <input class="ed-title" id="ed_title" placeholder="${t('page_title_ph')}" value="${esc(state.edTitle)}">
        <textarea class="ed-body" id="ed_body" placeholder="${t('page_body_ph')}">${esc(state.edBody)}</textarea>
        <div class="ed-foot">
          <button class="btn" id="edpub">${t('publish_btn')}</button>
          <div class="msg" id="edmsg"></div>
        </div>
      </div>`;
    }
    root.innerHTML = header() + `<div class="wrap">${body}</div>`;
    wire();
  }

  function setMsg(id, text, cls) { const e = document.getElementById(id); if (e) { e.textContent = text; e.className = 'msg ' + (cls || ''); } }

  async function enterEditor() {
    state.view = 'editor'; state.edTitle = ''; state.edBody = '';
    const handle = (state.me || {}).handle;
    if (handle) {
      try {
        const r = await fetch(`/api/resolve/${handle}.blog`);
        if (r.ok) { const d = await r.json(); if (d.raw) { state.edTitle = d.raw.title || ''; state.edBody = d.raw.body || ''; } }
      } catch {}
    }
    render();
  }

  // После popup-логина отправляем токен и ключ opener-у
  async function afterLogin() {
    if (IS_POPUP && window.opener) {
      const token = LS.getItem(K_TOK);
      const nsec = getSk();
      let profile = null; try { profile = JSON.parse(LS.getItem(K_PROF) || 'null'); } catch {}
      try { window.opener.postMessage({ __noet: 1, ev: 'auth', token, nsec, profile }, '*'); } catch {}
      setTimeout(() => { try { window.close(); } catch {} }, 300);
    }
  }

  function wire() {
    document.querySelectorAll('.lang button').forEach((b) => b.onclick = () => window.setLang(b.dataset.l));
    const id = (x) => document.getElementById(x), on = (x, fn) => { const el = id(x); if (el) el.onclick = fn; };
    on('create', async () => {
      if (!confirm('Создать новый ключ? Только если у тебя его нет. Старый ключ станет недоступен.')) return;
      try { const r = await OPS.genKey(); state.justKey = r.nsec; download('noet-ключ.txt', backupText(r.nsec, r.pubkey)); await refresh(); state.view = 'register'; render(); }
      catch (e) { setMsg('msg', errText(e), 'err'); }
    });
    on('doimport', async () => {
      try {
        await OPS.importKey({ nsec: id('impkey').value });
        try { await OPS.login({}); await refresh(); state.view = 'profile'; await afterLogin(); }
        catch { await refresh(); state.view = 'register'; }
        render();
      } catch (e) { setMsg('msg', errText(e), 'err'); }
    });
    on('redl', () => { if (state.justKey) { const pk = state.me && state.me.pubkey; download('noet-ключ.txt', backupText(state.justKey, pk)); } });
    on('register', async () => {
      const handle = id('rhandle').value.trim();
      setMsg('msg', '…', '');
      try {
        await OPS.login({ handle }); await refresh(); state.justKey = null; state.view = 'profile'; render();
        await afterLogin();
      } catch (e) { setMsg('msg', errText(e), 'err'); }
    });
    on('psave', async () => {
      setMsg('pmsg', '…', '');
      try {
        await OPS.publishProfile({ name: id('p_name').value.trim(), picture: id('p_pic').value.trim(), about: id('p_about').value.trim() });
        await refresh(); render(); setMsg('pmsg', t('saved'), 'ok');
      } catch (e) { setMsg('pmsg', errText(e), 'err'); }
    });
    on('goedit', () => enterEditor());
    on('edback', () => { state.view = 'profile'; render(); });
    on('edpub', async () => {
      setMsg('edmsg', '…', '');
      const title = (id('ed_title').value || '').trim();
      const body = id('ed_body').value || '';
      try {
        const r = await OPS.publish({ title, body }); // имя автоматически handle.blog
        state.edTitle = title; state.edBody = body;
        const el = id('edmsg'); el.className = 'msg ok';
        el.textContent = t('published') + ' ';
        const a = document.createElement('a'); a.href = 'http://' + r.name + '/'; a.textContent = r.name; a.target = '_blank'; el.appendChild(a);
      } catch (e) { setMsg('edmsg', errText(e), 'err'); }
    });
    on('backup', async () => { try { const r = await OPS.exportKey(); download('noet-ключ.txt', backupText(r.nsec, r.pubkey)); } catch (e) { alert(errText(e)); } });
    on('forget', async () => { if (!confirm(t('forget_confirm'))) return; await OPS.forgetKey(); await init(); });
    on('logout', async () => { await OPS.logout(); await init(); });
  }

  window.addEventListener('noetlang', render);
  init();
}
