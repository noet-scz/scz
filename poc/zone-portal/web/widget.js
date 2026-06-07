// noet — виджет зоны. На каждой странице .nt: плавающая кнопка, перетаскивается,
// прячется в стрелку (или Alt+N), показывает личность и ведёт в Поиск / Реле / Аккаунт.
// НИКАКИХ форм входа: регистрация/профиль живут на отдельной странице id.nt.
// Личность читается из скрытого моста id.nt (ключ туда не утекает).
(function () {
  if (window.__noetWidget) return; window.__noetWidget = true;
  const ID_ORIGIN = 'http://id.nt';
  const T = (k) => (window.t ? window.t(k) : ({ guest: 'Гость', login: 'Войти', logout: 'Выйти', account: 'Аккаунт', profile: 'Профиль', search_nav: 'Поиск', relay_nav: 'Реле', hide: 'Спрятать' }[k] || k));
  const LOGO_URI = 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='lg' x1='8' y1='8' x2='56' y2='56' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#7c5cff'/><stop offset='1' stop-color='#9d8bff'/></linearGradient></defs><path d='M42.16 12.49 A22 22 0 1 1 21.84 12.49' fill='none' stroke='url(#lg)' stroke-width='5' stroke-linecap='round'/><circle cx='32' cy='32' r='6.5' fill='url(#lg)'/></svg>");

  // ---------- мост id.nt ----------
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
    openPanel: (v) => openPanel(v), openLogin: () => { location.href = ID_ORIGIN + '/'; },
  };

  // ---------- UI ----------
  const state = { me: null, hidden: false, pos: null, open: false };
  try { state.pos = JSON.parse(localStorage.getItem('noet_widget_pos') || 'null'); } catch {}
  try { state.hidden = localStorage.getItem('noet_widget_hidden') === '1'; } catch {}
  const host = document.createElement('div'); host.id = 'noet-widget';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
    .bubble{position:fixed;z-index:2147483646;width:52px;height:52px;border-radius:50%;background:#0a0a0c;border:1px solid #2a2a36;box-shadow:0 8px 30px rgba(0,0,0,.5);cursor:grab;display:flex;align-items:center;justify-content:center;overflow:hidden;touch-action:none;transition:transform .12s}
    .bubble:hover{transform:scale(1.05)}
    .bubble img{width:100%;height:100%;object-fit:cover;pointer-events:none}
    .bubble.logo img{width:34px;height:34px}
    .tab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483646;background:#15151c;border:1px solid #2a2a36;border-right:0;border-radius:10px 0 0 10px;color:#9d8bff;cursor:pointer;padding:10px 6px;font-size:14px;box-shadow:0 8px 30px rgba(0,0,0,.4)}
    .panel{position:fixed;z-index:2147483647;width:248px;max-width:92vw;background:#101016;border:1px solid #26262f;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.6);color:#ececf2;font-size:14px;padding:12px}
    .panel.hidden{display:none}
    .hd{display:flex;align-items:center;gap:10px;margin-bottom:10px}
    .av{width:38px;height:38px;border-radius:50%;flex:0 0 38px;background:#15151c;object-fit:cover}
    .nm{font-weight:600;line-height:1.15}.sub{color:#8b8b98;font-size:12px}
    .x{margin-left:auto;color:#8b8b98;cursor:pointer;font-size:18px;background:0;border:0}
    .nav{display:flex;gap:7px;margin-bottom:8px}
    .nav a{flex:1;text-align:center;text-decoration:none;color:#ececf2;background:#15151c;border:1px solid #26262f;border-radius:10px;padding:9px 0;font-weight:500;font-size:13px}
    .nav a:hover{border-color:#7c5cff}
    .it{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:0;border:0;border-radius:9px;color:#ececf2;padding:9px 8px;cursor:pointer;font-size:14px;text-decoration:none}
    .it:hover{background:#17171f}
    .primary{display:block;text-align:center;background:#7c5cff;color:#fff;border-radius:10px;padding:9px;font-weight:600;text-decoration:none;margin-bottom:8px}
    .sep{height:1px;background:#1f1f28;margin:8px 0}
    .ft{display:flex;align-items:center;gap:6px;color:#55555f;font-size:11px;margin-top:10px}.ft img{width:14px;height:14px;opacity:.8}
  </style>
  <div class="tab" part=tab>‹</div>
  <button class="bubble logo" part=bubble><img src="${LOGO_URI}" alt="noet"></button>
  <div class="panel hidden" part=panel></div>`;

  const $ = (s) => root.querySelector(s);
  const bubble = $('.bubble'), panel = $('.panel'), tab = $('.tab');

  function placeBubble() {
    const m = 16, sz = 52;
    let left = state.pos ? state.pos.left : window.innerWidth - sz - m;
    let top = state.pos ? state.pos.top : window.innerHeight - sz - m;
    left = Math.max(m, Math.min(window.innerWidth - sz - m, left));
    top = Math.max(m, Math.min(window.innerHeight - sz - m, top));
    bubble.style.left = left + 'px'; bubble.style.top = top + 'px';
    const pw = Math.min(248, window.innerWidth * 0.92);
    panel.style.left = Math.max(m, left + sz - pw) + 'px';
    if (top > window.innerHeight / 2) { panel.style.bottom = (window.innerHeight - top + 8) + 'px'; panel.style.top = 'auto'; }
    else { panel.style.top = (top + sz + 8) + 'px'; panel.style.bottom = 'auto'; }
  }
  function applyHidden() { tab.style.display = state.hidden ? 'block' : 'none'; bubble.style.display = state.hidden ? 'none' : 'flex'; if (state.hidden) closePanel(); }
  function setHidden(h) { state.hidden = h; try { localStorage.setItem('noet_widget_hidden', h ? '1' : '0'); } catch {} applyHidden(); }

  let drag = null;
  bubble.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: false, sx: parseFloat(bubble.style.left), sy: parseFloat(bubble.style.top) }; bubble.setPointerCapture(e.pointerId); bubble.style.cursor = 'grabbing'; });
  bubble.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; if (drag.moved) { state.pos = { left: drag.sx + dx, top: drag.sy + dy }; placeBubble(); if (state.open) closePanel(); } });
  bubble.addEventListener('pointerup', () => { bubble.style.cursor = 'grab'; if (drag && drag.moved) { try { localStorage.setItem('noet_widget_pos', JSON.stringify(state.pos)); } catch {} } else togglePanel(); drag = null; });
  tab.addEventListener('click', () => setHidden(false));
  window.addEventListener('resize', placeBubble);
  window.addEventListener('keydown', (e) => { if (e.altKey && e.code === 'KeyN') { e.preventDefault(); setHidden(!state.hidden); } if (e.key === 'Escape' && state.open) closePanel(); });

  function togglePanel() { state.open ? closePanel() : openPanel(); }
  function closePanel() { state.open = false; panel.classList.add('hidden'); }
  async function openPanel() { state.open = true; if (state.hidden) setHidden(false); placeBubble(); panel.classList.remove('hidden'); await refresh(); }

  async function refresh() {
    try { state.me = await Noet.whoami(); } catch { state.me = null; }
    const m = state.me;
    if (m && m.pubkey && (m.loggedIn || m.hasKey)) { bubble.classList.remove('logo'); bubble.querySelector('img').src = avatar(m.pubkey, (m.profile && m.profile.name) || m.handle, m.profile); }
    else { bubble.classList.add('logo'); bubble.querySelector('img').src = LOGO_URI; }
    if (state.open) renderPanel();
  }

  const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function renderPanel() {
    const m = state.me || {};
    const dname = (m.profile && m.profile.name) || (m.handle ? '@' + m.handle : T('guest'));
    const headAv = (m.pubkey && (m.loggedIn || m.hasKey)) ? avatar(m.pubkey, dname, m.profile) : LOGO_URI;
    const nav = `<div class=nav><a href="http://search.nt/">${T('search_nav')}</a><a href="http://relay.nt/">${T('relay_nav')}</a></div>`;
    let body;
    if (m.loggedIn) {
      body = nav + `<a class=it href="http://id.nt/">✎ ${T('account')}</a><div class=sep></div>
        <button class=it id=logout>⏻ ${T('logout')}</button>
        <button class=it id=hide>↘ ${T('hide')} <span class=sub>Alt+N</span></button>`;
    } else {
      body = `<a class=primary href="http://id.nt/">${T('login')}</a>` + nav +
        `<button class=it id=hide>↘ ${T('hide')} <span class=sub>Alt+N</span></button>`;
    }
    panel.innerHTML = `<div class=hd><img class=av src="${headAv}"><div><div class=nm>${escHtml(dname)}</div>${m.loggedIn ? `<div class=sub>@${escHtml(m.handle)}</div>` : `<div class=sub>${T('guest')}</div>`}</div><button class=x id=close>×</button></div>`
      + body + `<div class=ft><img src="${LOGO_URI}"> noet</div>`;
    const close = $('#close'); if (close) close.onclick = closePanel;
    const lo = $('#logout'); if (lo) lo.onclick = async () => { await Noet.logout(); await refresh(); };
    const hd = $('#hide'); if (hd) hd.onclick = () => { closePanel(); setHidden(true); };
  }

  function mount() { document.documentElement.appendChild(iframe); document.body.appendChild(host); placeBubble(); applyHidden(); ready().then(refresh); }
  if (document.body) mount(); else window.addEventListener('DOMContentLoaded', mount);
})();
