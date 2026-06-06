// noet — виджет зоны. Инжектится на каждую страницу .nt. Плавающая кнопка в углу:
//   перетаскивается, прячется в стрелку у края (или хоткеем Alt+N), даёт быстрый доступ
//   к профилю/настройкам/поиску/зале. Изолирован в Shadow DOM, чтобы не конфликтовать
//   со стилями сайта. Личность берётся из скрытого моста id.nt (ключ туда не утекает).
(function () {
  if (window.__noetWidget) return; window.__noetWidget = true;
  const ID_ORIGIN = 'http://id.nt';
  const TRUSTED = ['search.nt', 'relay.nt', 'profile.nt', 'id.nt'];
  const isTrusted = TRUSTED.includes(location.hostname);
  const LOGO = "<svg viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'><defs><linearGradient id='lg' x1='8' y1='8' x2='56' y2='56' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='%237c5cff'/><stop offset='1' stop-color='%239d8bff'/></linearGradient></defs><path d='M42.16 12.49 A22 22 0 1 1 21.84 12.49' fill='none' stroke='url(%23lg)' stroke-width='5' stroke-linecap='round'/><circle cx='32' cy='32' r='6.5' fill='url(%23lg)'/></svg>";
  const LOGO_URI = 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='lg' x1='8' y1='8' x2='56' y2='56' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#7c5cff'/><stop offset='1' stop-color='#9d8bff'/></linearGradient></defs><path d='M42.16 12.49 A22 22 0 1 1 21.84 12.49' fill='none' stroke='url(#lg)' stroke-width='5' stroke-linecap='round'/><circle cx='32' cy='32' r='6.5' fill='url(#lg)'/></svg>");

  // ---------- мост id.nt ----------
  const iframe = document.createElement('iframe');
  iframe.src = ID_ORIGIN + '/'; iframe.title = 'noet identity';
  iframe.style.cssText = 'position:fixed;width:1px;height:1px;border:0;left:-9999px;top:-9999px;opacity:0';
  let frameReady = false; const readyWaiters = []; const pending = new Map(); let seq = 0; const changeCbs = new Set();
  window.addEventListener('message', (e) => {
    if (e.origin !== ID_ORIGIN) return; const d = e.data; if (!d || d.__noet !== 1) return;
    if (d.ev === 'ready') { frameReady = true; readyWaiters.splice(0).forEach((r) => r()); return; }
    if (d.ev === 'changed') { changeCbs.forEach((cb) => { try { cb(); } catch {} }); refresh(); return; }
    if (d.id && pending.has(d.id)) { const { resolve, reject } = pending.get(d.id); pending.delete(d.id); d.ok ? resolve(d.result) : reject(Object.assign(new Error(d.error || 'ошибка'), { untrusted: d.untrusted })); }
  });
  let readyFailed = false;
  setTimeout(() => { if (!frameReady) { readyFailed = true; readyWaiters.splice(0).forEach((r) => r()); } }, 6000);
  const ready = () => (frameReady || readyFailed) ? Promise.resolve() : new Promise((r) => readyWaiters.push(r));
  async function call(op, args) {
    await ready(); const id = ++seq;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('мост личности недоступен')); } }, 8000);
      pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      try { iframe.contentWindow.postMessage({ __noet: 1, id, op, args: args || {} }, ID_ORIGIN); }
      catch (e) { clearTimeout(t); pending.delete(id); reject(e); }
    });
  }

  // ---------- аватар (identicon / эмодзи / картинка) ----------
  const escXml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const hashN = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  function avatar(pubkey, name, profile) {
    const pic = profile && profile.picture;
    if (pic && /^(https?:|data:)/i.test(pic)) return pic;
    const seed = pubkey || name || '?';
    const hue = hashN(seed) % 360, hue2 = (hue + 50) % 360;
    let ch = pic && [...pic].length <= 2 ? pic : ((name || '').trim() ? [...name.trim()][0].toUpperCase() : '');
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><defs><linearGradient id='a' x1='0' y1='0' x2='64' y2='64'><stop offset='0' stop-color='hsl(" + hue + " 65% 56%)'/><stop offset='1' stop-color='hsl(" + hue2 + " 60% 42%)'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(#a)'/>" + (ch ? "<text x='32' y='43' font-family='system-ui,sans-serif' font-size='30' font-weight='600' fill='white' text-anchor='middle'>" + escXml(ch) + "</text>" : "") + "</svg>";
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  function publishToRelay(ev) {
    const urls = ['ws://relay.nt/relay', 'ws://127.0.0.1:8090/relay'];
    const tryOne = (i) => new Promise((resolve, reject) => {
      let ws; try { ws = new WebSocket(urls[i]); } catch (e) { return reject(e); }
      let opened = false;
      const to = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('таймаут реле')); }, 6000);
      ws.onopen = () => { opened = true; ws.send(JSON.stringify(['EVENT', ev])); };
      ws.onmessage = (m) => { let a; try { a = JSON.parse(m.data); } catch { return; } if (a[0] === 'OK' && a[1] === ev.id) { clearTimeout(to); try { ws.close(); } catch {} a[2] ? resolve() : reject(new Error(a[3] || 'отклонено')); } };
      ws.onerror = () => { clearTimeout(to); reject(Object.assign(new Error('нет связи с реле'), { reconnectable: !opened })); };
      ws.onclose = () => { if (!opened) { clearTimeout(to); reject(Object.assign(new Error('нет связи с реле'), { reconnectable: true })); } };
    });
    return tryOne(0).catch((e) => e && e.reconnectable ? tryOne(1) : Promise.reject(e));
  }

  const Noet = window.Noet = {
    ready, call, trusted: isTrusted, avatar, publishToRelay,
    whoami: () => call('whoami'), login: (a) => call('login', a), logout: () => call('logout'),
    genKey: () => call('genKey'), importKey: (nsec) => call('importKey', { nsec }), exportKey: () => call('exportKey'), forget: () => call('forgetKey'),
    signEvent: (event) => call('signEvent', { event }).then((r) => r.event),
    publishProfile: (p) => call('publishProfile', p).then((r) => r.event),
    claim: (a) => call('claim', a),
    onChange: (cb) => { changeCbs.add(cb); return () => changeCbs.delete(cb); },
    openLogin: () => openPanel('login'), openPanel: (v) => openPanel(v),
  };

  // ---------- UI ----------
  const state = { me: null, view: 'menu', hidden: false, pos: null, open: false, busy: false };
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
    .panel{position:fixed;z-index:2147483647;width:300px;max-width:92vw;max-height:78vh;overflow:auto;background:#101016;border:1px solid #26262f;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.6);color:#ececf2;font-size:14px;padding:14px}
    .panel.hidden{display:none}
    .hd{display:flex;align-items:center;gap:10px;margin-bottom:12px}
    .av{width:40px;height:40px;border-radius:50%;flex:0 0 40px;background:#15151c;object-fit:cover}
    .nm{font-weight:600;line-height:1.15}.sub{color:#8b8b98;font-size:12px}
    .x{margin-left:auto;color:#8b8b98;cursor:pointer;font-size:18px;background:0;border:0}
    .nav{display:flex;gap:8px;margin:4px 0 12px}
    .nav a{flex:1;text-align:center;text-decoration:none;color:#ececf2;background:#15151c;border:1px solid #26262f;border-radius:10px;padding:9px 0;font-weight:500}
    .nav a:hover{border-color:#7c5cff}
    .it{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:0;border:0;border-radius:9px;color:#ececf2;padding:9px 8px;cursor:pointer;font-size:14px}
    .it:hover{background:#17171f}
    label{display:block;color:#8b8b98;font-size:12px;margin:9px 0 3px}
    input,textarea{width:100%;background:#15151c;border:1px solid #26262f;border-radius:9px;color:#ececf2;padding:8px 10px;font-size:14px}
    textarea{resize:vertical;min-height:54px}
    .btn{width:100%;margin-top:11px;background:#7c5cff;border:0;border-radius:10px;color:#fff;padding:10px;font-size:14px;font-weight:600;cursor:pointer}
    .btn.ghost{background:#15151c;border:1px solid #26262f;color:#ececf2;font-weight:500}
    .lnk{background:0;border:0;color:#9d8bff;cursor:pointer;font-size:13px;padding:4px 0}
    .row{display:flex;gap:8px}.row>*{flex:1}
    .msg{color:#8b8b98;font-size:12px;margin-top:8px;min-height:16px}.err{color:#ff8b8b}.ok{color:#5fd0a8}
    .sep{height:1px;background:#1f1f28;margin:10px 0}
    .ft{display:flex;align-items:center;gap:6px;color:#55555f;font-size:11px;margin-top:12px}
    .ft img{width:14px;height:14px;opacity:.8}
    .nlist{margin:6px 0}.nlist .n{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #1a1a22;font-size:13px}
    code{background:#0a0a0c;border:1px solid #26262f;border-radius:5px;padding:1px 5px;font-size:12px;word-break:break-all}
  </style>
  <div class="tab" part=tab>‹</div>
  <button class="bubble logo" part=bubble><img src="${LOGO_URI}" alt="noet"></button>
  <div class="panel hidden" part=panel></div>`;

  const $ = (s) => root.querySelector(s);
  const bubble = $('.bubble'), panel = $('.panel'), tab = $('.tab');

  function placeBubble() {
    const m = 16, sz = 52;
    let left, top;
    if (state.pos) { left = state.pos.left; top = state.pos.top; }
    else { left = window.innerWidth - sz - m; top = window.innerHeight - sz - m; }
    left = Math.max(m, Math.min(window.innerWidth - sz - m, left));
    top = Math.max(m, Math.min(window.innerHeight - sz - m, top));
    bubble.style.left = left + 'px'; bubble.style.top = top + 'px';
    // панель рядом с пузырём
    const pw = Math.min(300, window.innerWidth * 0.92);
    let pl = left + sz - pw; if (pl < m) pl = m;
    panel.style.left = pl + 'px';
    const below = top + sz + 8;
    panel.style.top = (top > window.innerHeight / 2 ? 'auto' : below + 'px');
    panel.style.bottom = (top > window.innerHeight / 2 ? (window.innerHeight - top + 8) + 'px' : 'auto');
  }
  function applyHidden() {
    tab.style.display = state.hidden ? 'block' : 'none';
    bubble.style.display = state.hidden ? 'none' : 'flex';
    if (state.hidden) closePanel();
  }
  function setHidden(h) { state.hidden = h; try { localStorage.setItem('noet_widget_hidden', h ? '1' : '0'); } catch {} applyHidden(); }

  // drag
  let drag = null;
  bubble.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: false, sx: parseFloat(bubble.style.left), sy: parseFloat(bubble.style.top) }; bubble.setPointerCapture(e.pointerId); bubble.style.cursor = 'grabbing'; });
  bubble.addEventListener('pointermove', (e) => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (drag.moved) { state.pos = { left: drag.sx + dx, top: drag.sy + dy }; placeBubble(); if (state.open) closePanel(); }
  });
  bubble.addEventListener('pointerup', (e) => {
    bubble.style.cursor = 'grab';
    if (drag && drag.moved) { try { localStorage.setItem('noet_widget_pos', JSON.stringify(state.pos)); } catch {} }
    else { togglePanel(); }
    drag = null;
  });
  tab.addEventListener('click', () => setHidden(false));
  window.addEventListener('resize', () => { placeBubble(); });
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.code === 'KeyN')) { e.preventDefault(); setHidden(!state.hidden); }
    if (e.key === 'Escape' && state.open) closePanel();
  });

  function togglePanel() { state.open ? closePanel() : openPanel('menu'); }
  function closePanel() { state.open = false; panel.classList.add('hidden'); }
  async function openPanel(view) { state.view = view || 'menu'; state.open = true; if (state.hidden) setHidden(false); placeBubble(); panel.classList.remove('hidden'); await refresh(); }

  async function refresh() {
    try { state.me = await Noet.whoami(); } catch { state.me = null; }
    // аватар на пузыре
    const m = state.me;
    if (m && m.pubkey && (m.loggedIn || m.hasKey)) {
      bubble.classList.remove('logo');
      bubble.querySelector('img').src = avatar(m.pubkey, (m.profile && m.profile.name) || m.handle, m.profile);
    } else { bubble.classList.add('logo'); bubble.querySelector('img').src = LOGO_URI; }
    if (state.open) renderPanel();
  }

  const go = (host) => { location.href = 'http://' + host + '/'; };
  const nav = `<div class=nav><a href="http://search.nt/">Поиск</a><a href="http://relay.nt/">Реле</a></div>`;
  const foot = `<div class=ft><img src="${LOGO_URI}"> noet</div>`;

  function renderPanel() {
    const m = state.me || {};
    const loggedIn = m.loggedIn;
    const dname = (m.profile && m.profile.name) || (m.handle ? '@' + m.handle : 'Гость');
    const headAv = (m.pubkey && (loggedIn || m.hasKey)) ? avatar(m.pubkey, dname, m.profile) : LOGO_URI;
    let body = '';

    if (state.view === 'profile' && loggedIn) {
      const p = m.profile || {};
      body = `<label>Имя</label><input id=p_name value="${attr(p.name)}" placeholder="как показывать тебя">
        <label>Аватар (ссылка http(s) или эмодзи)</label><input id=p_pic value="${attr(p.picture)}" placeholder="🜂 или https://…">
        <label>О себе</label><textarea id=p_about placeholder="пара слов">${escHtml(p.about || '')}</textarea>
        <button class=btn id=p_save>Сохранить</button>
        <button class="btn ghost" id=back>Назад</button><div class=msg id=pmsg></div>`;
    } else if (state.view === 'names' && loggedIn) {
      body = `<div class=sub>Имена, которыми ты владеешь в зоне.</div><div class=nlist id=nlist>загрузка…</div>
        <div class=sep></div><div class=sub>Занять имя</div>
        <div class=row><input id=c_name placeholder="blog.nt"><input id=c_cid placeholder="CID (bafy…)"></div>
        <button class=btn id=c_save>Занять</button><button class="btn ghost" id=back>Назад</button><div class=msg id=cmsg></div>`;
    } else if (state.view === 'settings') {
      body = `<button class=it id=s_hide>↘ Спрятать виджет <span class=sub>(Alt+N)</span></button>
        ${m.hasKey && !m.nip07 ? '<button class=it id=s_export>⤓ Показать/скачать бэкап ключа</button>' : ''}
        ${m.hasKey && !m.nip07 ? '<button class=it id=s_forget>⌫ Забыть ключ в этом браузере</button>' : ''}
        ${m.pubkey ? `<div class=msg>ключ: <code>${m.pubkey.slice(0, 24)}…</code></div>` : ''}
        <button class="btn ghost" id=back>Назад</button><div class=msg id=smsg></div>`;
    } else if (loggedIn) {
      body = nav +
        `<button class=it id=v_profile>✎ Профиль</button>
         <button class=it id=v_names>⬡ Мои имена</button>
         <button class=it id=v_settings>⚙ Настройки</button>
         <div class=sep></div>
         <button class=it id=logout>⏻ Выйти</button>`;
    } else {
      // не вошёл
      if (isTrusted) {
        body = nav +
          `<div class=sub>${m.nip07 ? 'Найден внешний ключ (расширение) — войдём через него.' : 'Личность это твой ключ. Нет ключа — создадим прямо здесь.'}</div>
           <label>Имя в зоне (хэндл)</label><input id=l_handle placeholder="например nyx">
           <label>Инвайт-код</label><input id=l_invite placeholder="код приглашения">
           <button class=btn id=l_go>Войти / Регистрация</button>
           ${m.nip07 ? '' : '<div class=row style="margin-top:8px"><button class="lnk" id=l_gen>Создать ключ</button><button class="lnk" id=l_imp>Импорт ключа</button></div>'}
           <div class=msg id=lmsg></div>
           <div class=sub style="margin-top:8px">Читать и искать можно и без входа.</div>`;
      } else {
        body = nav + `<div class=sub>Чтобы войти или зарегистрироваться, открой страницу входа.</div>
          <button class=btn id=l_search>Войти на noet</button>`;
      }
    }

    panel.innerHTML =
      `<div class=hd><img class=av src="${headAv}"><div><div class=nm>${escHtml(dname)}</div>${loggedIn ? `<div class=sub>@${escHtml(m.handle)}</div>` : '<div class=sub>не в сети</div>'}</div><button class=x id=close>×</button></div>`
      + body + foot;
    wire();
  }

  function wire() {
    const on = (id, ev, fn) => { const el = $('#' + id); if (el) el.addEventListener(ev, fn); };
    on('close', 'click', closePanel);
    on('back', 'click', () => { state.view = 'menu'; renderPanel(); });
    on('v_profile', 'click', () => { state.view = 'profile'; renderPanel(); });
    on('v_names', 'click', () => { state.view = 'names'; renderPanel(); loadNames(); });
    on('v_settings', 'click', () => { state.view = 'settings'; renderPanel(); });
    on('s_hide', 'click', () => { closePanel(); setHidden(true); });
    on('logout', 'click', async () => { await Noet.logout(); state.view = 'menu'; await refresh(); });
    on('l_search', 'click', () => go('search.nt'));
    on('l_go', 'click', doLogin);
    on('l_gen', 'click', async () => { const r = await Noet.genKey(); download('noet-ключ.txt', backupText(r.nsec, r.pubkey)); setMsg('lmsg', 'ключ создан и сохранён, бэкап скачан. Теперь введи хэндл и инвайт.', 'ok'); });
    on('l_imp', 'click', async () => { const v = prompt('Вставь приватный ключ (64 hex):'); if (!v) return; try { await Noet.importKey(v.trim()); setMsg('lmsg', 'ключ импортирован', 'ok'); } catch (e) { setMsg('lmsg', e.message, 'err'); } });
    on('p_save', 'click', saveProfile);
    on('c_save', 'click', doClaim);
    on('s_export', 'click', async () => { try { const r = await Noet.exportKey(); download('noet-ключ.txt', backupText(r.nsec, state.me.pubkey)); setMsg('smsg', 'бэкап скачан. Храни в тайне.', 'ok'); } catch (e) { setMsg('smsg', e.message, 'err'); } });
    on('s_forget', 'click', async () => { if (!confirm('Забыть ключ в этом браузере? Без бэкапа личность не вернуть.')) return; await Noet.forget(); state.view = 'menu'; await refresh(); });
  }
  const setMsg = (id, t, cls) => { const e = $('#' + id); if (e) { e.textContent = t; e.className = 'msg ' + (cls || ''); } };
  async function doLogin() {
    const handle = $('#l_handle').value.trim(), invite = $('#l_invite').value.trim();
    setMsg('lmsg', '…');
    try { await Noet.login({ handle, invite }); state.view = 'menu'; await refresh(); }
    catch (e) { setMsg('lmsg', e.message, 'err'); }
  }
  async function saveProfile() {
    setMsg('pmsg', 'сохраняю…');
    try {
      const ev = await Noet.publishProfile({ name: $('#p_name').value.trim(), picture: $('#p_pic').value.trim(), about: $('#p_about').value.trim() });
      try { await Noet.publishToRelay(ev); } catch {}
      await refresh(); state.view = 'profile'; renderPanel(); setMsg('pmsg', 'сохранено', 'ok');
    } catch (e) { setMsg('pmsg', e.message, 'err'); }
  }
  async function loadNames() {
    try {
      const all = await (await fetch('http://search.nt/api/names')).json();
      const mine = Object.entries(all).filter(([, r]) => r.owner === state.me.pubkey);
      const el = $('#nlist'); if (!el) return;
      el.innerHTML = mine.length ? mine.map(([n, r]) => `<div class=n><a href="http://${n}/" style="color:#9d8bff;text-decoration:none">${escHtml(n)}</a><span class=sub>${escHtml((r.cid || '').slice(0, 12))}…</span></div>`).join('') : '<div class=sub>пока нет</div>';
    } catch { const el = $('#nlist'); if (el) el.textContent = 'не удалось загрузить'; }
  }
  async function doClaim() {
    const name = $('#c_name').value.trim(), cid = $('#c_cid').value.trim();
    setMsg('cmsg', 'занимаю…');
    try { await Noet.claim({ name, cid }); setMsg('cmsg', 'занято: ' + name, 'ok'); loadNames(); }
    catch (e) { setMsg('cmsg', e.message, 'err'); }
  }

  const attr = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const backupText = (nsec, pub) => 'noet — приватный ключ (никому не показывай):\n' + nsec + '\n\nпубличный ключ:\n' + pub + '\n\nПотеряешь этот ключ — потеряешь личность.';
  function download(name, text) { const a = document.createElement('a'); a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text); a.download = name; a.click(); }

  function mount() {
    document.documentElement.appendChild(iframe);
    document.body.appendChild(host);
    placeBubble(); applyHidden();
    ready().then(refresh);
  }
  if (document.body) mount(); else window.addEventListener('DOMContentLoaded', mount);
})();
