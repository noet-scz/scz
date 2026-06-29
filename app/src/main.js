// noet, нативное окно узла: header + 3 страницы (home / accounts / settings).
// Личность, реле, хранилище — всё через Tauri-команды к Rust-бэкенду.
const invoke = (c, a) => window.__TAURI__.core.invoke(c, a);

const DICT = {
  ru: {
    open: 'Открыть noet', loading: 'Загрузка…',
    // header
    guest: 'Гость',
    // home
    node_status: 'Статус узла', relays: 'Реле', storage: 'Хранилище',
    online: 'онлайн', offline: 'офлайн',
    accs_count: 'аккаунтов', users_today: 'пользователей сегодня', users_loading: '…',
    port: 'шлюз',
    update_avail: 'Обновление', install: 'Установить', updating: '…',
    // accounts
    accounts: 'Аккаунты', active: 'активный', create: 'Создать аккаунт',
    have_key: 'Уже есть ключ? Импортируй:', add_ph: 'приватный ключ (64 hex)', add: 'Импортировать',
    bad_key: 'Ключ должен быть 64 hex.', no_accs: 'Аккаунтов нет. Создай первый.',
    backup_t: 'Сохрани ключ', backup_w: 'Потеряешь ключ, потеряешь личность. Скопируй и спрячь.',
    done: 'Готово', copied: 'Скопировано', back: 'Назад',
    // settings
    settings: 'Настройки', autostart: 'Автозапуск с системой', autostart_na: 'Недоступно на этой платформе',
    notif: 'Уведомления', lang: 'Язык', check_upd: 'Проверить обновления',
    up_to_date: 'Последняя версия.', upd_err: 'Недоступно.',
    danger: 'Опасная зона', forget: 'Забыть активный аккаунт',
    forget_q: 'Забыть ключ активного аккаунта? Без бэкапа не вернуть.',
  },
  en: {
    open: 'Open noet', loading: 'Loading…',
    guest: 'Guest',
    node_status: 'Node status', relays: 'Relays', storage: 'Storage',
    online: 'online', offline: 'offline',
    accs_count: 'accounts', users_today: 'users today', users_loading: '…',
    port: 'gateway',
    update_avail: 'Update', install: 'Install', updating: '…',
    accounts: 'Accounts', active: 'active', create: 'Create account',
    have_key: 'Already have a key? Import:', add_ph: 'private key (64 hex)', add: 'Import',
    bad_key: 'Key must be 64 hex.', no_accs: 'No accounts. Create the first.',
    backup_t: 'Back up your key', backup_w: 'Lose the key, lose the identity. Copy and store it.',
    done: 'Done', copied: 'Copied', back: 'Back',
    settings: 'Settings', autostart: 'Start with system', autostart_na: 'Not available on this platform',
    notif: 'Notifications', lang: 'Language', check_upd: 'Check for updates',
    up_to_date: 'Latest version.', upd_err: 'Unavailable.',
    danger: 'Danger zone', forget: 'Forget active account',
    forget_q: 'Forget the active account key? No backup, no return.',
  },
};
let lang = localStorage.getItem('noet_lang') || 'ru';
const t = (k) => (DICT[lang] && DICT[lang][k]) || DICT.ru[k] || k;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const IC = {
  open: '<path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"/><path d="M11 13l9 -9"/><path d="M15 4h5v5"/>',
  plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
  gear: '<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/><circle cx="12" cy="12" r="3"/>',
  back: '<path d="M15 6l-6 6l6 6"/>',
  copy: '<path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/>',
  check: '<path d="M5 12l5 5l10 -10"/>',
  logout: '<path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"/><path d="M9 12h12l-3 -3"/><path d="M18 15l3 -3"/>',
  refresh: '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
  switch: '<path d="M21 17l-18 0"/><path d="M6 10l-3 -3l3 -3"/><path d="M3 7l18 0"/><path d="M18 20l3 -3l-3 -3"/>',
  users: '<path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/>',
};
const icon = (n, s = 18) => '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (IC[n] || '') + '</svg>';
const hashN = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
function identicon(pk, nm) {
  const hue = hashN(pk || nm || '?') % 360, h2 = (hue + 50) % 360;
  const ch = (nm || '').trim() ? nm.trim()[0].toUpperCase() : '';
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><defs><linearGradient id='a' x1='0' y1='0' x2='64' y2='64'><stop offset='0' stop-color='hsl(" + hue + " 65% 56%)'/><stop offset='1' stop-color='hsl(" + h2 + " 60% 42%)'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(#a)'/>" + (ch ? "<text x='32' y='43' font-family='system-ui' font-size='30' fill='white' text-anchor='middle'>" + esc(ch) + "</text>" : "") + "</svg>";
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
const shortPk = (pk) => pk ? pk.slice(0, 6) + '…' + pk.slice(-4) : '';
const fmt = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

// имена с реле
const RELAYS_WS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
function fetchNames(pubkeys) {
  return new Promise((resolve) => {
    const out = {};
    if (!pubkeys.length) return resolve(out);
    let socks;
    try { socks = RELAYS_WS.map((u) => new WebSocket(u)); } catch { return resolve(out); }
    let closed = 0;
    const fin = () => { try { socks.forEach((w) => w.close()); } catch {} resolve(out); };
    const tm = setTimeout(fin, 3500);
    socks.forEach((ws) => {
      ws.onopen = () => { try { ws.send(JSON.stringify(['REQ', 'n', { kinds: [0], authors: pubkeys, limit: pubkeys.length }])); } catch {} };
      ws.onmessage = (m) => {
        try {
          const a = JSON.parse(m.data);
          if (a[0] === 'EVENT' && a[2]) { try { const p = JSON.parse(a[2].content); out[a[2].pubkey] = { name: p.name || '', picture: p.picture || '' }; } catch {} }
          else if (a[0] === 'EOSE') { ws.close(); if (++closed >= socks.length) { clearTimeout(tm); fin(); } }
        } catch {}
      };
      ws.onerror = () => { if (++closed >= socks.length) { clearTimeout(tm); fin(); } };
    });
  });
}

// Состояние
let page = 'home'; // 'home' | 'accounts' | 'settings'
let gatewayUrl = '', accs = { accounts: [], active: null }, nameMap = {};
let stats = { port: 0, relays: [], connected: 0, relay_total: 3, bytes: 0, accounts: 0 };
let pendingUpdate = null; // версия доступного обновления

async function loadData() {
  try { gatewayUrl = await invoke('gateway_url'); } catch { gatewayUrl = ''; }
  try { accs = await invoke('identity_accounts'); } catch { accs = { accounts: [], active: null }; }
  try { stats = await invoke('node_stats'); } catch {}
  try { if (accs.accounts.length) nameMap = await fetchNames(accs.accounts); } catch {}
}

function navigate(p) {
  page = p;
  render();
}

// ---- HEADER ----
function renderHeader(opts = {}) {
  const { showBack, backPage } = opts;
  const active = accs.active;
  const info = active ? (nameMap[active] || {}) : null;
  const nm = info ? (info.name || shortPk(active)) : '';
  const ident = active ? identicon(active, nm) : '';
  const src = (info && info.picture && gatewayUrl)
    ? (/^data:/i.test(info.picture) ? info.picture : (gatewayUrl + 'api/img?u=' + encodeURIComponent(info.picture)))
    : ident;

  const updBadge = pendingUpdate ? '<span class="upd-badge" id="upd-badge">' + esc(pendingUpdate) + '</span>' : '';

  const left = showBack
    ? '<button class="iconbtn" id="hdr-back">' + icon('back') + '</button>'
    : '<div class="brand"><img src="./logo.svg"><b>noet</b>' + updBadge + '</div>';

  const acchipHtml = active
    ? '<div class="acchip" id="acchip"><img src="' + esc(src) + '" onerror="this.onerror=null;this.src=\'' + ident + '\'"><span>' + esc(nm) + '</span></div>'
    : '<span class="guest" id="acchip">' + esc(t('guest')) + '</span>';

  return '<div class="hdr">' + left + '<div class="hdr-spacer"></div>' + acchipHtml +
    (showBack ? '' : '<button class="iconbtn" id="hdr-gear" title="' + esc(t('settings')) + '">' + icon('gear') + '</button>') + '</div>';
}

function bindHeader(opts = {}) {
  const { backPage } = opts;
  const bp = document.getElementById('hdr-back');
  if (bp) bp.onclick = () => navigate(backPage || 'home');
  const chip = document.getElementById('acchip');
  if (chip) chip.onclick = () => navigate('accounts');
  const gear = document.getElementById('hdr-gear');
  if (gear) gear.onclick = () => navigate('settings');
  const badge = document.getElementById('upd-badge');
  if (badge) badge.onclick = () => navigate('settings');
}

// ---- HOME ----
function renderHome() {
  const relayRows = (stats.relays || []).map((r) => {
    const host = r.url.replace('wss://', '').replace('ws://', '');
    return '<div class="relay-row"><span class="dot ' + (r.up ? 'up' : 'dn') + '"></span><span>' + esc(host) + '</span></div>';
  }).join('');

  return renderHeader() + '<div class="page">' +
    '<button class="pri big" id="open">' + icon('open', 20) + '<span>' + esc(t('open')) + '</span></button>' +

    '<div class="card"><div class="ch">' + esc(t('node_status')) + '</div>' +
    '<div class="relay-list">' + (relayRows || '<div class="relay-row"><span class="dot dn"></span><span>…</span></div>') + '</div>' +
    '<div class="kv" style="margin-top:.5rem"><span class="mut">' + esc(t('port')) + '</span><span class="mono">' + (stats.port ? '127.0.0.1:' + stats.port : '…') + '</span></div>' +
    '</div>' +

    '<div class="card">' +
    '<div class="kv"><span>' + icon('users', 16) + '</span><span id="users-val" class="mut">' + esc(t('users_loading')) + '</span></div>' +
    '<div class="kv"><span class="mut">' + esc(t('accs_count')) + '</span><span>' + (stats.accounts || 0) + '</span></div>' +
    '<div class="kv"><span class="mut">' + esc(t('storage')) + '</span><span>' + fmt(stats.bytes || 0) + '</span></div>' +
    '</div>' +

    '</div>';
}

function bindHome() {
  bindHeader();
  document.getElementById('open').onclick = () => invoke('open_zone').catch(() => {});

  // Загрузить счётчик пользователей асинхронно
  invoke('active_users').then((n) => {
    const el = document.getElementById('users-val');
    if (el) el.textContent = n + ' ' + t('users_today');
  }).catch(() => {
    const el = document.getElementById('users-val');
    if (el) el.textContent = '…';
  });

  // Фоновая проверка обновлений
  if (!pendingUpdate) {
    invoke('check_update').then((v) => {
      if (v) {
        pendingUpdate = v;
        render(); // перерисовать с бэджем
      }
    }).catch(() => {});
  }
}

// ---- ACCOUNTS ----
function renderAccounts() {
  const accHtml = accs.accounts.length
    ? accs.accounts.map((pk) => {
        const info = nameMap[pk] || {};
        const nm = info.name || shortPk(pk);
        const ident = identicon(pk, nm);
        const src = info.picture && gatewayUrl
          ? (/^data:/i.test(info.picture) ? info.picture : (gatewayUrl + 'api/img?u=' + encodeURIComponent(info.picture)))
          : ident;
        const isA = pk === accs.active;
        return '<div class="acc"><img src="' + esc(src) + '" onerror="this.onerror=null;this.src=\'' + ident + '\'"><div style="min-width:0"><div class="nm">' + esc(nm) + '</div><div class="tg">' + esc(shortPk(pk)) + '</div></div>' +
          (isA ? '<span class="badge">' + esc(t('active')) + '</span>' : '<button class="iconbtn" data-sw="' + esc(pk) + '">' + icon('switch') + '</button>') + '</div>';
      }).join('')
    : '<div class="mut" style="padding:.6rem .1rem">' + esc(t('no_accs')) + '</div>';

  return renderHeader({ showBack: true, backPage: 'home' }) + '<div class="page">' +
    '<h2>' + esc(t('accounts')) + '</h2>' +
    '<div class="card">' + '<div id="accs">' + accHtml + '</div>' +
    '<button class="pri full" id="newbtn" style="margin-top:.7rem">' + icon('plus') + '<span>' + esc(t('create')) + '</span></button>' +
    '</div>' +
    '<div class="section-title">' + esc(t('have_key')) + '</div>' +
    '<div class="card"><div class="row"><input id="addk" placeholder="' + esc(t('add_ph')) + '" autocomplete="off" spellcheck="false"><button class="ghost" id="addbtn">' + esc(t('add')) + '</button></div>' +
    '<div class="msg" id="amsg"></div></div>' +
    '</div>';
}

function bindAccounts() {
  bindHeader({ showBack: true, backPage: 'home' });
  document.querySelectorAll('[data-sw]').forEach((b) => {
    b.onclick = async () => {
      await invoke('identity_switch', { pubkey: b.dataset.sw }).catch(() => {});
      accs = await invoke('identity_accounts').catch(() => accs);
      render();
    };
  });
  const amsg = document.getElementById('amsg');
  document.getElementById('addbtn').onclick = async () => {
    let v = (document.getElementById('addk').value || '').trim().toLowerCase();
    const m = v.match(/[0-9a-f]{64}/);
    if (m) v = m[0];
    if (!/^[0-9a-f]{64}$/.test(v)) { amsg.className = 'msg err'; amsg.textContent = t('bad_key'); return; }
    try {
      await invoke('identity_add', { sk: v });
      document.getElementById('addk').value = '';
      amsg.textContent = '';
      accs = await invoke('identity_accounts').catch(() => accs);
      render();
    } catch { amsg.className = 'msg err'; amsg.textContent = t('bad_key'); }
  };
  document.getElementById('newbtn').onclick = async () => {
    try {
      const r = await invoke('identity_create');
      accs = await invoke('identity_accounts').catch(() => accs);
      renderBackup(r.nsec);
    } catch {}
  };
}

// ---- SETTINGS ----
function renderSettings() {
  const notif = localStorage.getItem('noet_notif') === '1';
  const isMobile = navigator.userAgent.includes('Android') || navigator.userAgent.includes('iOS');

  const autostartRow = isMobile
    ? ''
    : '<div class="kv"><span>' + esc(t('autostart')) + '</span><span class="toggle" id="astog"></span></div>';

  return renderHeader({ showBack: true, backPage: 'home' }) + '<div class="page">' +
    '<h2>' + esc(t('settings')) + '</h2>' +

    '<div class="section-title">' + esc(t('lang')) + '</div>' +
    '<div class="card"><div class="kv"><span>' + esc(t('lang')) + '</span>' +
    '<span class="seg"><button data-l="ru" class="' + (lang === 'ru' ? 'on' : '') + '">RU</button><button data-l="en" class="' + (lang === 'en' ? 'on' : '') + '">EN</button></span></div>' +
    '<div class="kv"><span>' + esc(t('notif')) + '</span><span class="toggle ' + (notif ? 'on' : '') + '" id="ntog"></span></div>' +
    (autostartRow) +
    '</div>' +

    '<div class="section-title">' + esc(t('check_upd')) + '</div>' +
    '<div class="card"><div class="kv"><span id="updlbl">' + esc(t('check_upd')) + '</span><button class="iconbtn" id="upd">' + icon('refresh') + '</button></div>' +
    '<div class="msg" id="umsg"></div></div>' +

    '<div class="section-title">' + esc(t('danger')) + '</div>' +
    '<div class="card">' +
    '<button class="ghost danger" id="forget">' + icon('logout') + '<span>' + esc(t('forget')) + '</span></button>' +
    '</div>' +
    '</div>';
}

function bindSettings() {
  bindHeader({ showBack: true, backPage: 'home' });

  // Язык
  document.querySelectorAll('[data-l]').forEach((b) => {
    b.onclick = () => { lang = b.dataset.l; localStorage.setItem('noet_lang', lang); render(); };
  });

  // Уведомления
  const ntog = document.getElementById('ntog');
  if (ntog) ntog.onclick = (e) => { const on = e.target.classList.toggle('on'); localStorage.setItem('noet_notif', on ? '1' : '0'); };

  // Автозапуск
  const astog = document.getElementById('astog');
  if (astog) {
    invoke('autostart_is_enabled').then((on) => { if (on) astog.classList.add('on'); }).catch(() => {});
    astog.onclick = async () => {
      const on = astog.classList.toggle('on');
      try { await invoke(on ? 'autostart_enable' : 'autostart_disable'); } catch { astog.classList.toggle('on'); }
    };
  }

  // Обновление
  const umsg = document.getElementById('umsg');
  const updlbl = document.getElementById('updlbl');
  const updBtn = document.getElementById('upd');
  if (pendingUpdate) {
    umsg.textContent = t('update_avail') + ' ' + pendingUpdate;
    updlbl.textContent = t('install');
    updBtn.onclick = doInstall;
  } else {
    updBtn.onclick = checkUpd;
  }

  async function checkUpd() {
    umsg.className = 'msg'; umsg.textContent = t('updating');
    try {
      const v = await invoke('check_update');
      if (!v) { umsg.classList.add('ok'); umsg.textContent = t('up_to_date'); return; }
      pendingUpdate = v;
      umsg.textContent = t('update_avail') + ' ' + v;
      updlbl.textContent = t('install');
      updBtn.onclick = doInstall;
    } catch { umsg.className = 'msg err'; umsg.textContent = t('upd_err'); }
  }

  async function doInstall() {
    umsg.className = 'msg'; umsg.textContent = t('updating');
    try { await invoke('install_update'); } catch { umsg.className = 'msg err'; umsg.textContent = t('upd_err'); }
  }

  // Удалить аккаунт
  document.getElementById('forget').onclick = async () => {
    if (!confirm(t('forget_q'))) return;
    await invoke('identity_forget').catch(() => {});
    accs = await invoke('identity_accounts').catch(() => ({ accounts: [], active: null }));
    navigate('home');
  };
}

// ---- BACKUP ----
function renderBackup(nsec) {
  document.getElementById('app').innerHTML =
    renderHeader({ showBack: true, backPage: 'accounts' }) +
    '<div class="page"><h2>' + esc(t('backup_t')) + '</h2><p class="mut" style="margin:.2rem 0 1rem">' + esc(t('backup_w')) + '</p>' +
    '<div class="card"><div class="row" style="gap:.5rem;align-items:flex-start"><div class="mono" style="flex:1">' + esc(nsec) + '</div><button class="iconbtn" id="cp">' + icon('copy') + '</button></div>' +
    '<button class="pri" id="dn" style="width:100%;margin-top:.7rem"><span>' + esc(t('done')) + '</span></button></div></div>';
  bindHeader({ showBack: true, backPage: 'accounts' });
  document.getElementById('cp').onclick = async () => {
    try { await navigator.clipboard.writeText(nsec); document.getElementById('cp').innerHTML = icon('check'); } catch {}
  };
  document.getElementById('dn').onclick = () => navigate('accounts');
}

// ---- RENDER ----
function render() {
  const app = document.getElementById('app');
  if (page === 'home') { app.innerHTML = renderHome(); bindHome(); }
  else if (page === 'accounts') { app.innerHTML = renderAccounts(); bindAccounts(); }
  else if (page === 'settings') { app.innerHTML = renderSettings(); bindSettings(); }
}

async function boot() {
  if (!window.__TAURI__) {
    document.getElementById('app').innerHTML = '<div class="boot">noet</div>';
    return;
  }
  await loadData();
  render();
}
boot();
