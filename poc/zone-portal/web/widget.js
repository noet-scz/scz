// noet — виджет личности. Инжектится на каждую страницу.
// Чип (фикс. правый верх): аватар+ник или «Войти». Клик → меню.
// Прямые API-вызовы без iframe (работает на любом домене noet).
// Popup-логин: открывает id.nt, получает токен и ключ через postMessage.
(function () {
  if (window.__noetWidget) return; window.__noetWidget = true;
  const ID_ORIGIN = 'http://id.nt';
  const TOKEN_KEY = 'noet_token';   // те же ключи, что в account.js: всё на одном origin реестра
  const NSEC_KEY  = 'noet_sk';
  const PROF_KEY  = 'noet_profile';
  const LAST_KEY  = 'noet_lastwho';
  const T = (k) => (window.t ? window.t(k) : { guest:'Гость', login:'Войти', logout:'Выйти', account:'Аккаунт', search_nav:'Поиск', relay_nav:'Реле', hide:'Спрятать', edit_page:'Редактировать' }[k] || k);
  const LOGO_URI = 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='lg' x1='8' y1='8' x2='56' y2='56' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#7c5cff'/><stop offset='1' stop-color='#9d8bff'/></linearGradient></defs><path d='M42.16 12.49 A22 22 0 1 1 21.84 12.49' fill='none' stroke='url(#lg)' stroke-width='5' stroke-linecap='round'/><circle cx='32' cy='32' r='6.5' fill='url(#lg)'/></svg>");

  /* ---- sha256 pure JS (для Nostr event id, без WebCrypto) ---- */
  const _K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  function sha256hex(str){const rotr=(x,n)=>(x>>>n)|(x<<(32-n));const bytes=new TextEncoder().encode(str),l=bytes.length;const withOne=l+1,pad=(56-(withOne%64)+64)%64,total=withOne+pad+8;const m=new Uint8Array(total);m.set(bytes);m[l]=0x80;const dv=new DataView(m.buffer);dv.setUint32(total-8,Math.floor((l*8)/0x100000000),false);dv.setUint32(total-4,(l*8)>>>0,false);let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;const w=new Uint32Array(64);for(let i=0;i<total;i+=64){for(let t=0;t<16;t++)w[t]=dv.getUint32(i+t*4,false);for(let t=16;t<64;t++){const s0=rotr(w[t-15],7)^rotr(w[t-15],18)^(w[t-15]>>>3);const s1=rotr(w[t-2],17)^rotr(w[t-2],19)^(w[t-2]>>>10);w[t]=(w[t-16]+s0+w[t-7]+s1)>>>0;}let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;for(let t=0;t<64;t++){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g);const t1=(h+S1+ch+_K[t]+w[t])>>>0;const S0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c);const t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;}const hx=(x)=>('00000000'+(x>>>0).toString(16)).slice(-8);return hx(h0)+hx(h1)+hx(h2)+hx(h3)+hx(h4)+hx(h5)+hx(h6)+hx(h7);}

  /* ---- schnorr (ленивый импорт) ---- */
  let _sc = null;
  const getSchnorr = () => _sc ? Promise.resolve(_sc) : import('/vendor/noble-secp256k1.js').then(m => { _sc = m.schnorr; return _sc; });
  const hexU8 = h => Uint8Array.from(h.match(/.{2}/g).map(b => parseInt(b, 16)));
  const u8Hex = u => Array.from(u).map(b => b.toString(16).padStart(2, '0')).join('');

  /* ---- прямые вызовы ---- */
  async function directWhoami() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return { loggedIn: false, hasKey: !!window.nostr || !!localStorage.getItem(NSEC_KEY) };
    try {
      const r = await fetch('/api/me', { headers: { authorization: 'Bearer ' + token } });
      if (!r.ok) { localStorage.removeItem(TOKEN_KEY); return { loggedIn: false, hasKey: !!window.nostr || !!localStorage.getItem(NSEC_KEY) }; }
      const m = await r.json();
      let profile = null; try { profile = JSON.parse(localStorage.getItem(PROF_KEY) || 'null'); } catch {}
      return { loggedIn: true, pubkey: m.pubkey, handle: m.handle, profile, hasKey: true };
    } catch { return { loggedIn: false, hasKey: !!window.nostr || !!localStorage.getItem(NSEC_KEY) }; }
  }

  async function localSign(event) {
    const nsec = localStorage.getItem(NSEC_KEY);
    if (!nsec) throw Object.assign(new Error('нет ключа'), { code: 'no_key' });
    const sc = await getSchnorr();
    event.pubkey = u8Hex(sc.getPublicKey(hexU8(nsec)));
    event.created_at = event.created_at || Math.floor(Date.now() / 1000);
    event.tags = event.tags || []; event.content = event.content || '';
    event.id = sha256hex(JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]));
    event.sig = u8Hex(await sc.sign(hexU8(event.id), hexU8(nsec)));
    return event;
  }

  /* ---- popup-логин ---- */
  const changeCbs = new Set();
  let _popup = null;
  function openLoginPopup() {
    // всё на одном origin реестра → popup не нужен, просто идём на страницу входа
    location.href = '/id';
  }
  window.addEventListener('message', (e) => {
    if (e.origin !== ID_ORIGIN) return;
    const d = e.data; if (!d || d.__noet !== 1 || d.ev !== 'auth') return;
    try { if (d.token) localStorage.setItem(TOKEN_KEY, d.token); } catch {}
    try { if (d.nsec)  localStorage.setItem(NSEC_KEY,  d.nsec);  } catch {}
    try { if (d.profile) localStorage.setItem(PROF_KEY, JSON.stringify(d.profile)); } catch {}
    try { if (_popup && !_popup.closed) _popup.close(); } catch {}
    refresh();
    changeCbs.forEach(cb => { try { cb(); } catch {} });
  });

  const escXml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
  const hashN = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  function avatar(pubkey, name, profile) {
    const pic = profile && profile.picture;
    if (pic && /^(https?:|data:)/i.test(pic)) return pic;
    const seed = pubkey || name || '?', hue = hashN(seed) % 360, hue2 = (hue + 50) % 360;
    const ch = pic && [...pic].length <= 2 ? pic : ((name || '').trim() ? [...name.trim()][0].toUpperCase() : '');
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><defs><linearGradient id='a' x1='0' y1='0' x2='64' y2='64'><stop offset='0' stop-color='hsl(" + hue + " 65% 56%)'/><stop offset='1' stop-color='hsl(" + hue2 + " 60% 42%)'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(#a)'/>" + (ch ? "<text x='32' y='43' font-family='system-ui,sans-serif' font-size='30' font-weight='600' fill='white' text-anchor='middle'>" + escXml(ch) + "</text>" : "") + "</svg>";
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  const Noet = window.Noet = {
    whoami: directWhoami,
    signEvent: async ({ event }) => {
      // расширение (window.nostr) приоритетно, но если в нём нет ключа/ошибка —
      // падаем на локальный ключ, чтобы вход старым ключом продолжал работать
      if (window.nostr) { try { return await window.nostr.signEvent(event); } catch (e) { if (!localStorage.getItem(NSEC_KEY)) throw e; } }
      return localSign(event);
    },
    logout: () => {
      localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(NSEC_KEY); localStorage.removeItem(PROF_KEY);
      refresh(); changeCbs.forEach(cb => { try { cb(); } catch {} });
      return Promise.resolve({ ok: true });
    },
    onChange: (cb) => { changeCbs.add(cb); return () => changeCbs.delete(cb); },
    openLogin: openLoginPopup,
    openPanel: openLoginPopup,
    avatar,
  };

  /* ---- UI: чип + меню ---- */
  const state = { me: null, open: false, hidden: false };
  try { state.hidden = localStorage.getItem('noet_widget_hidden') === '1'; } catch {}
  const whost = document.createElement('div'); whost.id = 'noet-widget';
  const root = whost.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
    .chip{position:fixed;top:14px;right:16px;z-index:2147483646;display:inline-flex;align-items:center;gap:8px;
      background:#15151c;border:1px solid #2a2a36;border-radius:999px;padding:5px 12px 5px 5px;color:#ececf2;
      font-size:14px;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.45);max-width:200px}
    .chip:hover{border-color:#7c5cff}
    .chip .av{width:28px;height:28px;border-radius:50%;flex:0 0 28px;object-fit:cover}
    .chip .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .chip.guest{padding-left:12px}
    .menu{position:fixed;top:54px;right:16px;z-index:2147483647;width:200px;background:#101016;border:1px solid #26262f;
      border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.6);padding:6px;color:#ececf2;font-size:14px}
    .menu.hidden{display:none}
    .menu a,.menu button{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:0;border:0;
      color:#ececf2;border-radius:9px;padding:9px 10px;cursor:pointer;text-decoration:none;font-size:14px}
    .menu a:hover,.menu button:hover{background:#17171f}
    .menu .sep{height:1px;background:#1f1f28;margin:5px 4px}
    .menu .sub{color:#8b8b98;font-size:12px}
    .tab{position:fixed;top:14px;right:0;z-index:2147483646;background:#15151c;border:1px solid #2a2a36;border-right:0;
      border-radius:10px 0 0 10px;color:#9d8bff;cursor:pointer;padding:7px 7px;font-size:14px;box-shadow:0 6px 22px rgba(0,0,0,.4)}
  </style>
  <button class="chip" part=chip></button>
  <div class="menu hidden" part=menu></div>
  <div class="tab" part=tab style="display:none">‹</div>`;

  const $ = (s) => root.querySelector(s);
  const chip = $('.chip'), menu = $('.menu'), tab = $('.tab');
  const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));

  function applyHidden() { tab.style.display = state.hidden ? 'block' : 'none'; chip.style.display = state.hidden ? 'none' : 'inline-flex'; if (state.hidden) closeMenu(); }
  function setHidden(h) { state.hidden = h; try { localStorage.setItem('noet_widget_hidden', h ? '1' : '0'); } catch {} applyHidden(); }
  function closeMenu() { state.open = false; menu.classList.add('hidden'); }
  function openMenu(force) { if (state.hidden) setHidden(false); state.open = force ? true : !state.open; menu.classList.toggle('hidden', !state.open); if (state.open) renderMenu(); }

  chip.addEventListener('click', () => { if (state.me && state.me.loggedIn) openMenu(); else openLoginPopup(); });
  tab.addEventListener('click', () => setHidden(false));
  document.addEventListener('click', (e) => { if (state.open && !e.composedPath().includes(whost)) closeMenu(); });
  window.addEventListener('keydown', (e) => { if (e.altKey && e.code === 'KeyN') { e.preventDefault(); setHidden(!state.hidden); } if (e.key === 'Escape' && state.open) closeMenu(); });

  function renderChip() {
    const m = state.me;
    if (m && m.loggedIn) {
      const nm = (m.profile && m.profile.name) || m.handle;
      chip.classList.remove('guest');
      chip.innerHTML = `<img class=av src="${avatar(m.pubkey, nm, m.profile)}"><span class=nm>${escHtml(nm)}</span>`;
    } else { chip.classList.add('guest'); chip.innerHTML = `<span class=nm>${escHtml(T('login'))}</span>`; }
  }
  function renderMenu() {
    const m = state.me || {};
    let html = `<a href="/">⌕ ${T('search_nav')}</a><a href="/relay">◇ ${T('relay_nav')}</a><a href="/people">⚯ ${T('people_nav')}</a><a href="/id">○ ${T('account')}</a><div class=sep></div>`;
    if (m.loggedIn) {
      html += `<button id=logout>⏻ ${T('logout')}</button>`;
    } else {
      html += `<button id=loginbtn>→ ${T('login')}</button>`;
    }
    html += `<button id=hide>↗ ${T('hide')} <span class=sub>Alt+N</span></button>`;
    menu.innerHTML = html;
    const lo = $('#logout'); if (lo) lo.onclick = async () => { closeMenu(); await Noet.logout(); };
    const lb = $('#loginbtn'); if (lb) lb.onclick = () => { closeMenu(); openLoginPopup(); };
    const hd = $('#hide'); if (hd) hd.onclick = () => setHidden(true);
  }

  async function refresh() {
    try { state.me = await directWhoami(); } catch { state.me = null; }
    try { if (state.me) localStorage.setItem(LAST_KEY, JSON.stringify({ loggedIn: state.me.loggedIn, pubkey: state.me.pubkey, handle: state.me.handle, profile: state.me.profile })); } catch {}
    renderChip();
    if (state.open) renderMenu();
  }

  function mount() {
    document.body.appendChild(whost);
    try { const c = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); if (c) state.me = c; } catch {}
    renderChip(); applyHidden();
    refresh();
  }
  if (document.body) mount(); else window.addEventListener('DOMContentLoaded', mount);
})();
