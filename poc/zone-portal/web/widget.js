// noet — виджет личности. Инжектится одинаково на каждую страницу зоны и рисует ОДИН
// индикатор в фиксированном месте (правый верхний угол): аватар + ник (или «Войти»).
// Клик — меню (Поиск / Реле / Аккаунт / Выйти). Прячется на Alt+N. Изолирован в Shadow DOM.
// Личность читается из скрытого моста id.noet.nt (ключ туда не утекает; страницы зоны
// same-site с id.noet.nt, поэтому хранилище общее).
(function () {
  if (window.__noetWidget) return; window.__noetWidget = true;
  const ID_ORIGIN = 'http://id.noet.nt';
  const T = (k) => (window.t ? window.t(k) : ({ guest: 'Гость', login: 'Войти', logout: 'Выйти', account: 'Аккаунт', search_nav: 'Поиск', relay_nav: 'Реле', hide: 'Спрятать' }[k] || k));
  const LOGO_URI = 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='lg' x1='8' y1='8' x2='56' y2='56' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#7c5cff'/><stop offset='1' stop-color='#9d8bff'/></linearGradient></defs><path d='M42.16 12.49 A22 22 0 1 1 21.84 12.49' fill='none' stroke='url(#lg)' stroke-width='5' stroke-linecap='round'/><circle cx='32' cy='32' r='6.5' fill='url(#lg)'/></svg>");

  // ---------- мост id.noet.nt ----------
  const iframe = document.createElement('iframe');
  iframe.src = ID_ORIGIN + '/'; iframe.title = 'noet identity';
  iframe.style.cssText = 'position:fixed;width:1px;height:1px;border:0;left:-9999px;top:-9999px;opacity:0';
  let frameReady = false, readyFailed = false; const readyWaiters = []; const pending = new Map(); let seq = 0; const changeCbs = new Set();
  window.addEventListener('message', (e) => {
    if (e.origin !== ID_ORIGIN) return; const d = e.data; if (!d || d.__noet !== 1) return;
    if (d.ev === 'ready') { frameReady = true; readyWaiters.splice(0).forEach((r) => r()); return; }
    if (d.ev === 'changed') { changeCbs.forEach((cb) => { try { cb(); } catch {} }); refresh(); return; }
    if (d.id && pending.has(d.id)) { const { resolve, reject } = pending.get(d.id); pending.delete(d.id); d.ok ? resolve(d.result) : reject(Object.assign(new Error(d.error || 'ошибка'), { untrusted: d.untrusted })); }
  });
  setTimeout(() => { if (!frameReady) { readyFailed = true; readyWaiters.splice(0).forEach((r) => r()); } }, 6000);
  const ready = () => (frameReady || readyFailed) ? Promise.resolve() : new Promise((r) => readyWaiters.push(r));
  async function call(op, args) {
    await ready(); const id = ++seq;
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('мост недоступен')); } }, 8000);
      pending.set(id, { resolve: (v) => { clearTimeout(to); resolve(v); }, reject: (e) => { clearTimeout(to); reject(e); } });
      try { iframe.contentWindow.postMessage({ __noet: 1, id, op, args: args || {} }, ID_ORIGIN); }
      catch (e) { clearTimeout(to); pending.delete(id); reject(e); }
    });
  }

  const escXml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
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
    ready, call, avatar,
    whoami: () => call('whoami'),
    signEvent: (event) => call('signEvent', { event }).then((r) => r.event),
    logout: () => call('logout'),
    onChange: (cb) => { changeCbs.add(cb); return () => changeCbs.delete(cb); },
    openPanel: () => openMenu(true), openLogin: () => { location.href = ID_ORIGIN + '/'; },
  };

  // ---------- UI: фиксированный чип в правом верхнем углу ----------
  const state = { me: null, open: false, hidden: false };
  try { state.hidden = localStorage.getItem('noet_widget_hidden') === '1'; } catch {}
  const host = document.createElement('div'); host.id = 'noet-widget';
  const root = host.attachShadow({ mode: 'open' });
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

  function applyHidden() {
    tab.style.display = state.hidden ? 'block' : 'none';
    chip.style.display = state.hidden ? 'none' : 'inline-flex';
    if (state.hidden) closeMenu();
  }
  function setHidden(h) { state.hidden = h; try { localStorage.setItem('noet_widget_hidden', h ? '1' : '0'); } catch {} applyHidden(); }
  function closeMenu() { state.open = false; menu.classList.add('hidden'); }
  function openMenu(force) { if (state.hidden) setHidden(false); state.open = force ? true : !state.open; menu.classList.toggle('hidden', !state.open); if (state.open) renderMenu(); }

  chip.addEventListener('click', () => openMenu());
  tab.addEventListener('click', () => setHidden(false));
  document.addEventListener('click', (e) => { if (state.open && !e.composedPath().includes(host)) closeMenu(); });
  window.addEventListener('keydown', (e) => { if (e.altKey && e.code === 'KeyN') { e.preventDefault(); setHidden(!state.hidden); } if (e.key === 'Escape' && state.open) closeMenu(); });

  const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
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
    let html = `<a href="http://noet.nt/">⌕ ${T('search_nav')}</a><a href="http://relay.noet.nt/">◇ ${T('relay_nav')}</a><a href="http://id.noet.nt/">○ ${T('account')}</a><div class=sep></div>`;
    html += m.loggedIn ? `<button id=logout>⏻ ${T('logout')}</button>` : `<a href="http://id.noet.nt/">→ ${T('login')}</a>`;
    html += `<button id=hide>↗ ${T('hide')} <span class=sub>Alt+N</span></button>`;
    menu.innerHTML = html;
    const lo = $('#logout'); if (lo) lo.onclick = async () => { closeMenu(); await Noet.logout(); await refresh(); };
    const hd = $('#hide'); if (hd) hd.onclick = () => setHidden(true);
  }

  async function refresh() {
    try { state.me = await Noet.whoami(); } catch { state.me = null; }
    renderChip();
    if (state.open) renderMenu();
  }

  function mount() {
    document.documentElement.appendChild(iframe);
    document.body.appendChild(host);
    renderChip(); applyHidden();
    ready().then(refresh);
  }
  if (document.body) mount(); else window.addEventListener('DOMContentLoaded', mount);
})();
