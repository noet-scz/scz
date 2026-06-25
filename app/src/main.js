// SCZ — нативное окно узла = панель управления. Личность и аккаунты хранятся в узле,
// поэтому управление ими тут (а зона в браузере). Открыть зону, аккаунты, хранилище,
// язык, уведомления, обновление.
const invoke = (c, a) => window.__TAURI__.core.invoke(c, a);

const DICT = {
  ru: {
    open: 'Открыть SCZ', accounts: 'Аккаунты', active: 'активный', create: 'Создать аккаунт',
    add_ph: 'приватный ключ (64 hex)', add: 'Добавить', bad_key: 'Ключ должен быть 64 hex.',
    backup_t: 'Сохрани ключ', backup_w: 'Потеряешь ключ, потеряешь личность. Скопируй и спрячь.', done: 'Готово', copied: 'Скопировано',
    storage: 'Хранилище', used: 'занято', accs: 'аккаунтов', notif: 'Уведомления',
    forget: 'Забыть активный', forget_q: 'Забыть ключ активного аккаунта? Без бэкапа не вернуть.',
    check_upd: 'Обновления', up_to_date: 'Последняя версия.', update_found: 'Доступна', install: 'Обновить', updating: '…', upd_err: 'Обновление недоступно.', no_accs: 'Аккаунтов нет. Создай первый.',
  },
  en: {
    open: 'Open SCZ', accounts: 'Accounts', active: 'active', create: 'Create account',
    add_ph: 'private key (64 hex)', add: 'Add', bad_key: 'Key must be 64 hex.',
    backup_t: 'Back up your key', backup_w: 'Lose the key, lose the identity. Copy and store it.', done: 'Done', copied: 'Copied',
    storage: 'Storage', used: 'used', accs: 'accounts', notif: 'Notifications',
    forget: 'Forget active', forget_q: 'Forget the active account key? No backup, no return.',
    check_upd: 'Updates', up_to_date: 'Latest version.', update_found: 'Available', install: 'Update', updating: '…', upd_err: 'Update unavailable.', no_accs: 'No accounts. Create the first.',
  },
};
let lang = localStorage.getItem('scz_lang') || 'ru';
const t = (k) => (DICT[lang] && DICT[lang][k]) || DICT.ru[k] || k;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// иконки Tabler Icons (MIT)
const IC = {
  open: '<path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"/><path d="M11 13l9 -9"/><path d="M15 4h5v5"/>',
  plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
  add: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
  switch: '<path d="M21 17l-18 0"/><path d="M6 10l-3 -3l3 -3"/><path d="M3 7l18 0"/><path d="M18 20l3 -3l-3 -3"/>',
  copy: '<path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/>',
  check: '<path d="M5 12l5 5l10 -10"/>',
  logout: '<path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"/><path d="M9 12h12l-3 -3"/><path d="M18 15l3 -3"/>',
  refresh: '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
};
const icon = (n, s = 18) => '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (IC[n] || '') + '</svg>';
const hashN = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
function identicon(pk, nm) { const hue = hashN(pk || nm || '?') % 360, h2 = (hue + 50) % 360, ch = (nm || '').trim() ? nm.trim()[0].toUpperCase() : ''; const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><defs><linearGradient id='a' x1='0' y1='0' x2='64' y2='64'><stop offset='0' stop-color='hsl(" + hue + " 65% 56%)'/><stop offset='1' stop-color='hsl(" + h2 + " 60% 42%)'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(#a)'/>" + (ch ? "<text x='32' y='43' font-family='system-ui' font-size='30' fill='white' text-anchor='middle'>" + esc(ch) + "</text>" : "") + "</svg>"; return 'data:image/svg+xml,' + encodeURIComponent(svg); }
const shortPk = (pk) => pk ? pk.slice(0, 8) + '…' + pk.slice(-4) : '';

// мини-запрос имён аккаунтов из реле
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
function names(pubkeys) {
  return new Promise((resolve) => {
    const out = {}; if (!pubkeys.length) return resolve(out);
    let socks; try { socks = RELAYS.map((u) => new WebSocket(u)); } catch { return resolve(out); }
    let closed = 0; const fin = () => { try { socks.forEach((w) => w.close()); } catch {} resolve(out); };
    const tm = setTimeout(fin, 3500);
    socks.forEach((ws) => { ws.onopen = () => { try { ws.send(JSON.stringify(['REQ', 'n', { kinds: [0], authors: pubkeys, limit: pubkeys.length }])); } catch {} }; ws.onmessage = (m) => { try { const a = JSON.parse(m.data); if (a[0] === 'EVENT' && a[2]) { try { const p = JSON.parse(a[2].content); if (p.name) out[a[2].pubkey] = p.name; } catch {} } else if (a[0] === 'EOSE') { ws.close(); if (++closed >= socks.length) { clearTimeout(tm); fin(); } } } catch {} }; ws.onerror = () => { if (++closed >= socks.length) { clearTimeout(tm); fin(); } }; });
  });
}

let url = '', accs = { accounts: [], active: null }, stor = { bytes: 0, accounts: 0 }, nameMap = {};

async function refresh() {
  try { url = await invoke('gateway_url'); } catch { url = ''; }
  try { accs = await invoke('identity_accounts'); } catch { accs = { accounts: [], active: null }; }
  try { stor = await invoke('storage_info'); } catch {}
  try { if (accs.accounts.length) nameMap = await names(accs.accounts); } catch {}
}

function fmt(b) { return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
function ib(name, ic, title) { return '<button class="iconbtn" id="' + name + '" title="' + esc(title) + '">' + icon(ic) + '</button>'; }

function render() {
  const notif = localStorage.getItem('scz_notif') === '1';
  const accHtml = accs.accounts.length ? accs.accounts.map((pk) => {
    const nm = nameMap[pk] || shortPk(pk);
    const isA = pk === accs.active;
    return '<div class="acc"><img src="' + identicon(pk, nm) + '"><div style="min-width:0"><div class="nm">' + esc(nm) + '</div><div class="tg">' + esc(shortPk(pk)) + '</div></div>' +
      (isA ? '<span class="badge">' + esc(t('active')) + '</span>' : '<button class="iconbtn" data-sw="' + esc(pk) + '" title="' + esc(t('active')) + '">' + icon('switch') + '</button>') + '</div>';
  }).join('') : '<div class="mut" style="padding:.6rem .1rem">' + esc(t('no_accs')) + '</div>';

  document.getElementById('app').innerHTML = `
    <div class="page">
      <div class="top"><div class="brand"><img src="./logo.svg"><b>SCZ</b></div>
        <span class="seg"><button data-l="ru" class="${lang === 'ru' ? 'on' : ''}">RU</button><button data-l="en" class="${lang === 'en' ? 'on' : ''}">EN</button></span></div>

      <button class="pri big" id="open">${icon('open')}<span>${esc(t('open'))}</span></button>

      <div class="card"><div class="ch">${esc(t('accounts'))}</div>
        <div id="accs">${accHtml}</div>
        <div class="row"><input id="addk" placeholder="${esc(t('add_ph'))}" autocomplete="off" spellcheck="false">${ib('addbtn', 'add', t('add'))}${ib('newbtn', 'plus', t('create'))}</div>
        <div class="msg" id="amsg"></div>
      </div>

      <div class="card"><div class="kv"><span>${esc(t('notif'))}</span><span class="toggle ${notif ? 'on' : ''}" id="ntog"></span></div>
        <div class="kv"><span>${esc(t('storage'))}</span><span class="mut">${fmt(stor.bytes || 0)} · ${stor.accounts || 0} ${esc(t('accs'))}</span></div></div>

      <div class="card"><div class="kv"><span id="updlbl">${esc(t('check_upd'))}</span><button class="iconbtn" id="upd" title="${esc(t('check_upd'))}">${icon('refresh')}</button></div><div class="msg" id="umsg"></div></div>

      <button class="ghost danger" id="forget">${icon('logout')}<span>${esc(t('forget'))}</span></button>
    </div>`;

  document.getElementById('open').onclick = () => invoke('open_zone').catch(() => {});
  document.querySelectorAll('[data-l]').forEach((b) => { b.onclick = () => { lang = b.dataset.l; localStorage.setItem('scz_lang', lang); render(); }; });
  document.getElementById('ntog').onclick = (e) => { const on = e.target.classList.toggle('on'); localStorage.setItem('scz_notif', on ? '1' : '0'); };
  document.querySelectorAll('[data-sw]').forEach((b) => { b.onclick = async () => { await invoke('identity_switch', { pubkey: b.dataset.sw }); await refresh(); render(); }; });

  const amsg = document.getElementById('amsg');
  document.getElementById('addbtn').onclick = async () => {
    let v = (document.getElementById('addk').value || '').trim().toLowerCase(); const m = v.match(/[0-9a-f]{64}/); if (m) v = m[0];
    if (!/^[0-9a-f]{64}$/.test(v)) { amsg.className = 'msg err'; amsg.textContent = t('bad_key'); return; }
    try { await invoke('identity_add', { sk: v }); document.getElementById('addk').value = ''; amsg.textContent = ''; await refresh(); render(); } catch { amsg.className = 'msg err'; amsg.textContent = t('bad_key'); }
  };
  document.getElementById('newbtn').onclick = async () => { try { const r = await invoke('identity_create'); await refresh(); backup(r.nsec); } catch {} };
  document.getElementById('forget').onclick = async () => { if (!confirm(t('forget_q'))) return; await invoke('identity_forget'); await refresh(); render(); };

  const umsg = document.getElementById('umsg');
  document.getElementById('upd').onclick = async () => {
    umsg.className = 'msg'; umsg.textContent = t('updating');
    try { const v = await invoke('check_update'); if (!v) { umsg.classList.add('ok'); umsg.textContent = t('up_to_date'); return; }
      umsg.textContent = t('update_found') + ' ' + v; document.getElementById('updlbl').textContent = t('install');
      document.getElementById('upd').onclick = async () => { umsg.textContent = t('updating'); try { await invoke('install_update'); } catch { umsg.className = 'msg err'; umsg.textContent = t('upd_err'); } };
    } catch { umsg.className = 'msg err'; umsg.textContent = t('upd_err'); }
  };
}

function backup(nsec) {
  document.getElementById('app').innerHTML = `<div class="page"><div class="top"><div class="brand"><img src="./logo.svg"><b>SCZ</b></div></div>
    <h2 style="margin:.4rem 0 .2rem">${esc(t('backup_t'))}</h2><p class="mut" style="margin:.2rem 0 1rem">${esc(t('backup_w'))}</p>
    <div class="card"><div class="row" style="gap:.5rem;align-items:flex-start"><div class="mono" style="flex:1">${esc(nsec)}</div><button class="iconbtn" id="cp" title="${esc(t('copied'))}">${icon('copy')}</button></div><div class="row" style="margin-top:.7rem"><button class="pri" id="dn"><span>${esc(t('done'))}</span></button></div></div></div>`;
  document.getElementById('cp').onclick = async () => { try { await navigator.clipboard.writeText(nsec); const e = document.getElementById('cp'); e.innerHTML = icon('check'); } catch {} };
  document.getElementById('dn').onclick = () => render();
}

async function boot() {
  if (!window.__TAURI__) { document.getElementById('app').innerHTML = '<div class="boot">SCZ</div>'; return; }
  await refresh();
  render();
}
boot();
