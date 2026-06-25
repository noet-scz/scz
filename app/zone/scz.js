// SCZ зона: SPA в браузере, отдаётся локальным узлом. Подпись в узле (/api/nostr/sign),
// данные на публичных реле. Дизайн перенесён с расширения.
(function () {
  'use strict';
  var RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
  var KIND = { profile: 0, post: 1, react: 7, page: 31002, claim: 31111 };

  /* ---------- i18n ---------- */
  var DICT = {
    ru: {
      nav_msg: 'Мессенджер', nav_sites: 'Домены', nav_me: 'Профиль', nav_set: 'Настройки',
      search_ph: 'искать в зоне', searching: 'ищу…', nothing: 'Ничего не нашлось',
      guest: 'Гость', create_id: 'Создать личность', no_tag: 'имя не занято',
      id_title: 'Личность', have_key: 'Уже есть ключ?', import_ph: 'приватный ключ (64 hex)', import: 'Импортировать', bad_key: 'Ключ должен быть 64 hex.',
      backup_t: 'Сохрани ключ', backup_w: 'Потеряешь ключ, потеряешь личность. Скопируй и спрячь.',
      copy: 'Скопировать', copied: 'Скопировано', done: 'Готово',
      nick: 'Имя', nick_ph: 'как тебя показывать', about: 'О себе', about_ph: 'пара слов о тебе', avatar: 'Аватар', avatar_ph: 'ссылка на картинку', save: 'Сохранить', saved: 'Сохранено.', change_tag: 'сменить тег', tag_ph: 'тег (имя)',
      pubkey: 'Публичный ключ', show_key: 'Показать ключ', hide: 'Спрятать',
      rep_t: 'Репутация', rep_posts: 'сообщений', rep_react: 'реакций', rep_sites: 'сайтов', rep_days: 'дней в сети', rep_score: 'счёт',
      need_id: 'Нужна личность: создай её в профиле.',
      post_ph: 'сообщение…', send: 'Отправить', feed_empty: 'В этом канале пусто. Напиши первым.', sending: 'Отправляю…',
      channels: 'Каналы', room_ph: 'название канала', create: 'Создать', general: 'общий',
      claim_ph: 'имя, например mysite.nt', claim: 'Занять', claim_t: 'Занять новое имя',
      my_names: 'Мои имена', open: 'Открыть', publish: 'Опубликовать', no_names: 'Имён пока нет. Займи имя выше.',
      open_t: 'Открыть имя', open_ph: 'имя, чтобы открыть', go: 'Перейти',
      pub_t: 'Опубликовать под именем', pub_html: 'HTML страницы или игры', published: 'Опубликовано.', site_none: 'Под этим именем пока ничего не опубликовано.',
      set_lang: 'Язык', set_accounts: 'Аккаунты', set_active: 'активный', set_switch: 'Войти', set_add: 'Добавить аккаунт', set_add_ph: 'приватный ключ (64 hex)', set_new: 'Создать новый',
      set_storage: 'Хранилище', set_used: 'занято', set_accs: 'аккаунтов', set_notif: 'Уведомления', forget: 'Забыть активный ключ', forget_q: 'Забыть ключ активного аккаунта? Без бэкапа не вернуть.',
      back: 'Назад', offline: 'Реле недоступны, проверь сеть.', err: 'Не получилось.',
    },
    en: {
      nav_msg: 'Messenger', nav_sites: 'Domains', nav_me: 'Profile', nav_set: 'Settings',
      search_ph: 'search the zone', searching: 'searching…', nothing: 'Nothing found',
      guest: 'Guest', create_id: 'Create identity', no_tag: 'no name yet',
      id_title: 'Identity', have_key: 'Already have a key?', import_ph: 'private key (64 hex)', import: 'Import', bad_key: 'Key must be 64 hex.',
      backup_t: 'Back up your key', backup_w: 'Lose the key, lose the identity. Copy and store it.',
      copy: 'Copy', copied: 'Copied', done: 'Done',
      nick: 'Name', nick_ph: 'how to show you', about: 'About', about_ph: 'a few words about you', avatar: 'Avatar', avatar_ph: 'image link', save: 'Save', saved: 'Saved.', change_tag: 'change tag', tag_ph: 'tag (name)',
      pubkey: 'Public key', show_key: 'Show key', hide: 'Hide',
      rep_t: 'Reputation', rep_posts: 'messages', rep_react: 'reactions', rep_sites: 'sites', rep_days: 'days in network', rep_score: 'score',
      need_id: 'Identity needed: create one in profile.',
      post_ph: 'message…', send: 'Send', feed_empty: 'This channel is empty. Be the first.', sending: 'Sending…',
      channels: 'Channels', room_ph: 'channel name', create: 'Create', general: 'general',
      claim_ph: 'name, e.g. mysite.nt', claim: 'Claim', claim_t: 'Claim a new name',
      my_names: 'My names', open: 'Open', publish: 'Publish', no_names: 'No names yet. Claim one above.',
      open_t: 'Open a name', open_ph: 'name to open', go: 'Go',
      pub_t: 'Publish under name', pub_html: 'HTML of the page or game', published: 'Published.', site_none: 'Nothing published under this name yet.',
      set_lang: 'Language', set_accounts: 'Accounts', set_active: 'active', set_switch: 'Switch', set_add: 'Add account', set_add_ph: 'private key (64 hex)', set_new: 'Create new',
      set_storage: 'Storage', set_used: 'used', set_accs: 'accounts', set_notif: 'Notifications', forget: 'Forget active key', forget_q: 'Forget the active account key? No backup, no return.',
      back: 'Back', offline: 'Relays unreachable, check your connection.', err: 'Failed.',
    },
  };
  var lang = localStorage.getItem('scz_lang') || 'ru';
  function t(k) { return (DICT[lang] && DICT[lang][k]) || DICT.ru[k] || k; }
  function setLang(l) { lang = l; localStorage.setItem('scz_lang', l); render(); }

  /* ---------- helpers ---------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); };
  var hashN = function (s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  function identicon(pk, nm) {
    var seed = pk || nm || '?', hue = hashN(seed) % 360, h2 = (hue + 50) % 360;
    var ch = (nm || '').trim() ? [].concat(nm.trim()[0])[0].toUpperCase().replace(/[&<>]/g, '') : '';
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='76' height='76'><defs><linearGradient id='a' x1='0' y1='0' x2='76' y2='76'><stop offset='0' stop-color='hsl(" + hue + " 65% 56%)'/><stop offset='1' stop-color='hsl(" + h2 + " 60% 42%)'/></linearGradient></defs><rect width='76' height='76' rx='38' fill='url(#a)'/>" + (ch ? "<text x='38' y='51' font-family='system-ui' font-size='34' font-weight='600' fill='white' text-anchor='middle'>" + ch + "</text>" : "") + "</svg>";
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  // аватар: грузим картинку напрямую; если ссылка не открылась, откат на идентикон
  function avImg(pk, nm, pic, size, cls) {
    var ident = identicon(pk, nm);
    var attrs = (cls ? 'class="' + cls + '" ' : '') + 'width="' + size + '" height="' + size + '" style="border-radius:50%;object-fit:cover"';
    if (pic && /^(https?:|data:)/i.test(pic)) return '<img ' + attrs + ' src="' + esc(pic) + '" onerror="this.onerror=null;this.src=\'' + ident + '\'">';
    return '<img ' + attrs + ' src="' + ident + '">';
  }
  function applyAvatars() {}
  function when(ts) { var d = new Date(ts * 1000); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function toast(s) { var el = document.querySelector('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); } el.textContent = s; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('on'); }, 2200); }
  function copy(s) { return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return false; }); }
  function fmtBytes(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }

  // иконки Tabler Icons (MIT). Кнопка с понятной иконкой = иконка, не текст.
  var IC = {
    back: '<path d="M5 12l14 0"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/>',
    go: '<path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>',
    copy: '<path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/>',
    save: '<path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2"/><path d="M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M14 4l0 4l-6 0l0 -4"/>',
    send: '<path d="M10 14l11 -11"/><path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5"/>',
    switch: '<path d="M21 17l-18 0"/><path d="M6 10l-3 -3l3 -3"/><path d="M3 7l18 0"/><path d="M18 20l3 -3l-3 -3"/>',
    open: '<path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"/><path d="M11 13l9 -9"/><path d="M15 4h5v5"/>',
    plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
    search: '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>',
    edit: '<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12l5 5l10 -10"/>',
  };
  function icon(n, s) { return '<svg class="ic" width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (IC[n] || '') + '</svg>'; }
  function ibtn(id, ic, title) { return '<button class="iconbtn"' + (id ? ' id="' + id + '"' : '') + ' title="' + esc(title || '') + '">' + icon(ic) + '</button>'; }

  /* npub (bech32) для тега */
  var CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function polymod(v) { var GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3], chk = 1; for (var p = 0; p < v.length; p++) { var top = chk >> 25; chk = ((chk & 0x1ffffff) << 5) ^ v[p]; for (var i = 0; i < 5; i++) chk ^= ((top >> i) & 1) ? GEN[i] : 0; } return chk; }
  function hrpExpand(h) { var r = [], i; for (i = 0; i < h.length; i++) r.push(h.charCodeAt(i) >> 5); r.push(0); for (i = 0; i < h.length; i++) r.push(h.charCodeAt(i) & 31); return r; }
  function checksum(h, d) { var v = hrpExpand(h).concat(d).concat([0, 0, 0, 0, 0, 0]), mod = polymod(v) ^ 1, r = []; for (var p = 0; p < 6; p++) r.push((mod >> 5 * (5 - p)) & 31); return r; }
  function convertbits(data, from, to, pad) { var acc = 0, bits = 0, ret = [], maxv = (1 << to) - 1; for (var p = 0; p < data.length; p++) { acc = (acc << from) | data[p]; bits += from; while (bits >= to) { bits -= to; ret.push((acc >> bits) & maxv); } } if (pad && bits > 0) ret.push((acc << (to - bits)) & maxv); return ret; }
  function npub(hex) { var b = [], i; for (i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16)); var d = convertbits(b, 8, 5, true), comb = d.concat(checksum('npub', d)), s = 'npub1'; for (i = 0; i < comb.length; i++) s += CHARSET.charAt(comb[i]); return s; }
  function npubShort(pk) { var n = npub(pk); return n.slice(0, 10) + '…' + n.slice(-4); }
  function tagText(handle, pk) { if (handle) return '@' + handle.replace(/\.(nt|me)$/i, ''); return pk ? npubShort(pk) : ''; }

  /* ---------- мост к узлу + реле ---------- */
  var api = {
    status: function () { return fetch('/api/identity/status').then(function (r) { return r.json(); }); },
    create: function () { return fetch('/api/identity/create', { method: 'POST' }).then(function (r) { return r.json(); }); },
    add: function (sk) { return fetch('/api/identity/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sk: sk }) }).then(function (r) { return r.json(); }); },
    switch: function (pubkey) { return fetch('/api/identity/switch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: pubkey }) }).then(function (r) { return r.json(); }); },
    accounts: function () { return fetch('/api/identity/accounts').then(function (r) { return r.json(); }); },
    export: function () { return fetch('/api/identity/export').then(function (r) { return r.json(); }); },
    forget: function () { return fetch('/api/identity/forget', { method: 'POST' }).then(function (r) { return r.json(); }); },
    storage: function () { return fetch('/api/storage').then(function (r) { return r.json(); }); },
  };
  window.nostr = {
    getPublicKey: function () { return fetch('/api/nostr/pubkey').then(function (r) { return r.json(); }).then(function (j) { if (!j.pubkey) throw new Error('no_key'); return j.pubkey; }); },
    signEvent: function (ev) { return fetch('/api/nostr/sign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) }).then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw new Error(j.error); return j; }); },
    getRelays: function () { return Promise.resolve({}); },
  };
  function socks() { return RELAYS.map(function (u) { try { return new WebSocket(u); } catch (e) { return null; } }).filter(Boolean); }
  function query(filters, opts) {
    opts = opts || {}; var list = Array.isArray(filters) ? filters : [filters]; var seen = new Map(); var ws = socks();
    return new Promise(function (resolve) {
      var c = 0, done = false; var fin = function () { if (done) return; done = true; clearTimeout(tm); try { ws.forEach(function (w) { w.close(); }); } catch (e) {} resolve(Array.from(seen.values()).sort(function (a, b) { return b.created_at - a.created_at; })); };
      var tm = setTimeout(fin, opts.timeout || 4500);
      ws.forEach(function (s) { s.onopen = function () { try { s.send(JSON.stringify(['REQ', 'q'].concat(list))); } catch (e) {} }; s.onmessage = function (m) { try { var a = JSON.parse(m.data); if (a[0] === 'EVENT' && a[2]) { if (!seen.has(a[2].id)) seen.set(a[2].id, a[2]); } else if (a[0] === 'EOSE') { s.close(); if (++c >= ws.length) fin(); } } catch (e) {} }; s.onerror = function () { if (++c >= ws.length) fin(); }; });
    });
  }
  async function publish(tmpl) {
    var signed = await window.nostr.signEvent(tmpl); var msg = JSON.stringify(['EVENT', signed]); var ws = socks();
    await Promise.all(ws.map(function (s) { return new Promise(function (res) { var tm = setTimeout(function () { try { s.close(); } catch (e) {} res(); }, 4500); s.onopen = function () { try { s.send(msg); } catch (e) {} }; s.onmessage = function (m) { try { if (JSON.parse(m.data)[0] === 'OK') { clearTimeout(tm); s.close(); res(); } } catch (e) {} }; s.onerror = function () { clearTimeout(tm); res(); }; }); }));
    return signed;
  }
  window.noet = { me: function () { return window.nostr.getPublicKey().then(function (pk) { return { pubkey: pk }; }); }, publish: publish, query: query, relays: RELAYS.slice() };

  var profCache = new Map();
  async function profileOf(pk) { if (profCache.has(pk)) return profCache.get(pk); var evs = await query({ kinds: [0], authors: [pk], limit: 1 }); var p = {}; try { p = evs[0] ? JSON.parse(evs[0].content) : {}; } catch (e) {} profCache.set(pk, p); return p; }
  async function namesOf(pk) { try { var evs = await query({ kinds: [KIND.claim], authors: [pk], limit: 100 }); return evs.filter(function (e) { return /\.(me|nt)$/i.test((e.tags.find(function (x) { return x[0] === 'd'; }) || [])[1] || ''); }).sort(function (a, b) { return a.created_at - b.created_at; }).map(function (e) { return (e.tags.find(function (x) { return x[0] === 'd'; }) || [])[1]; }); } catch (e) { return []; } }

  /* ---------- состояние ---------- */
  var me = { hasKey: false, pubkey: null, profile: null, handle: '', names: [] };
  async function refreshMe() {
    try {
      var s = await api.status(); me.hasKey = !!s.hasKey; me.pubkey = s.pubkey || null;
      if (s.hasKey) {
        profCache.delete(s.pubkey); me.profile = await profileOf(s.pubkey); me.names = await namesOf(s.pubkey);
        // тег = выбранное основное имя (profile.primary), иначе самое раннее
        me.handle = (me.profile.primary && me.names.indexOf(me.profile.primary) >= 0) ? me.profile.primary : (me.names[0] || '');
      } else { me.profile = null; me.handle = ''; me.names = []; }
    } catch (e) { me = { hasKey: false, pubkey: null, profile: null, handle: '', names: [] }; }
  }

  /* ---------- роутер/шелл ---------- */
  var ROUTES = ['search', 'messenger', 'sites', 'profile', 'settings'];
  function route() { var raw = (location.hash || '').replace(/^#\/?/, ''); var parts = raw ? raw.split('/').map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } }) : []; return { name: ROUTES.indexOf(parts[0]) >= 0 ? parts[0] : 'search', parts: parts }; }
  function go() { location.hash = '#/' + Array.prototype.slice.call(arguments).map(encodeURIComponent).join('/'); }

  function header() {
    var r = route().name;
    var nick = me.hasKey ? ((me.profile && me.profile.name) || (me.handle ? me.handle.replace(/\.(nt|me)$/i, '') : t('guest'))) : t('guest');
    var nav = [['messenger', 'nav_msg'], ['sites', 'nav_sites'], ['profile', 'nav_me'], ['settings', 'nav_set']];
    var chip = '<a class="hchip" data-go="profile">' + avImg(me.pubkey, nick, me.profile && me.profile.picture, 27) +
      '<span class="ci"><span class="nm">' + esc(nick) + '</span>' + (me.hasKey ? '<span class="tg">' + esc(tagText(me.handle, me.pubkey)) + '</span>' : '<span class="tg">' + esc(t('create_id')) + '</span>') + '</span></a>';
    return '<header class="hdr"><a class="hbrand" data-go="search"><img src="/logo.svg"><span>SCZ</span></a>' +
      '<nav class="hnav">' + nav.map(function (n) { return '<a data-go="' + n[0] + '" class="' + (r === n[0] ? 'on' : '') + '">' + esc(t(n[1])) + '</a>'; }).join('') + '</nav>' + chip + '</header>';
  }
  function mount(inner, after) {
    document.getElementById('app').innerHTML = header() + inner;
    document.querySelectorAll('[data-go]').forEach(function (a) { a.onclick = function () { go(a.dataset.go); }; });
    if (after) after();
    applyAvatars();
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  function nows() { return Math.floor(Date.now() / 1000); }
  function noKey(e) { return e && String(e.message || e).indexOf('no_key') >= 0; }
  function setMsg(id, txt, cls) { var el = document.getElementById(id); if (el) { el.textContent = txt || ''; el.className = 'msg ' + (cls || ''); } }

  /* ---------- поиск (главная, как в расширении) ---------- */
  var _index = null;
  function stripHtml(h) { return String(h || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim(); }
  async function buildIndex() {
    if (_index) return _index;
    var evs = await query([{ kinds: [KIND.claim], '#t': ['noet-name'], limit: 1000 }, { kinds: [0], limit: 1000 }, { kinds: [KIND.page], limit: 1000 }]);
    var prof = {}; evs.filter(function (e) { return e.kind === 0; }).forEach(function (e) { if (!prof[e.pubkey] || e.created_at > (prof[e.pubkey]._ts || 0)) { try { var p = JSON.parse(e.content); p._ts = e.created_at; prof[e.pubkey] = p; } catch (x) {} } });
    var owner = {};
    evs.filter(function (e) { return e.kind === KIND.claim && /\.(me|nt)$/i.test((e.tags.find(function (t) { return t[0] === 'd'; }) || [])[1] || ''); }).forEach(function (c) { var n = (c.tags.find(function (t) { return t[0] === 'd'; }) || [])[1]; if (!owner[n] || c.created_at < owner[n].ts) owner[n] = { pk: c.pubkey, ts: c.created_at }; });
    var pageBy = {};
    evs.filter(function (e) { return e.kind === KIND.page; }).forEach(function (e) { var n = (e.tags.find(function (t) { return t[0] === 'd'; }) || [])[1]; if (!n || !owner[n] || e.pubkey !== owner[n].pk) return; if (pageBy[n] && pageBy[n]._ts > e.created_at) return; var txt = ''; var c = e.content || ''; try { var o = JSON.parse(c); txt = o.html ? stripHtml(o.html) : ''; } catch (x) { txt = stripHtml(c); } pageBy[n] = { text: txt.slice(0, 1500), _ts: e.created_at }; });
    _index = Object.keys(owner).map(function (n) { var p = prof[owner[n].pk] || {}, pg = pageBy[n] || {}; return { name: n, handle: n.replace(/\.(me|nt)$/i, ''), dn: p.name || n.replace(/\.(me|nt)$/i, ''), about: p.about || '', text: pg.text || '', pk: owner[n].pk, pic: p.picture }; });
    return _index;
  }
  function score(m, q) { if (m.handle === q) return 100; if (m.handle.indexOf(q) === 0) return 85; if (m.handle.indexOf(q) >= 0) return 70; if ((m.dn || '').toLowerCase().indexOf(q) >= 0) return 55; if ((m.about || '').toLowerCase().indexOf(q) >= 0) return 30; if ((m.text || '').toLowerCase().indexOf(q) >= 0) return 18; return 0; }
  function vSearch() {
    mount('<div class="searchpage"><div class="mark"><img src="/logo.svg"><h1>SCZ</h1></div>' +
      '<form class="sb" id="sf"><input id="q" placeholder="' + esc(t('search_ph')) + '" autocomplete="off" autofocus>' + ibtn('', 'search', t('search_ph')) + '</form>' +
      '<div id="sres"></div></div>', function () {
        var box = document.getElementById('sres'), inp = document.getElementById('q');
        document.querySelector('#sf .iconbtn').onclick = function (e) { e.preventDefault(); doSearch(inp.value); };
        document.getElementById('sf').onsubmit = function (e) { e.preventDefault(); doSearch(inp.value); };
        var deb; inp.addEventListener('input', function () { clearTimeout(deb); deb = setTimeout(function () { doSearch(inp.value); }, 250); });
        async function doSearch(q) {
          q = (q || '').trim().toLowerCase(); if (!q) { box.innerHTML = ''; return; }
          box.innerHTML = '<div class="empty">' + esc(t('searching')) + '</div>';
          try {
            var idx = await buildIndex();
            var hit = idx.map(function (m) { return { m: m, s: score(m, q) }; }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.m; });
            if (!hit.length) { box.innerHTML = '<div class="empty">' + esc(t('nothing')) + '</div>'; return; }
            box.innerHTML = hit.slice(0, 20).map(function (m) { return '<div class="sr" data-name="' + esc(m.name) + '">' + avImg(m.pk, m.dn, m.pic, 36) + '<div style="min-width:0"><div><span class="srn">' + esc(m.dn) + '</span> <span class="srh">' + esc(m.name) + '</span></div>' + (m.text ? '<div class="srt">' + esc(m.text.slice(0, 90)) + '</div>' : '') + '</div></div>'; }).join('');
            applyAvatars();
            box.querySelectorAll('.sr').forEach(function (r) { r.onclick = function () { go('sites', 'open', r.dataset.name); }; });
          } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
        }
      });
  }

  /* ---------- профиль ---------- */
  function vProfile() {
    if (!me.hasKey) return vProfileNew();
    var dn = (me.profile && me.profile.name) || (me.handle ? me.handle.replace(/\.(nt|me)$/i, '') : t('guest'));
    var tag = tagText(me.handle, me.pubkey);
    mount('<div class="wrap">' +
      '<div class="card"><div class="idhead">' + avImg(me.pubkey, dn, me.profile && me.profile.picture, 76, 'av') +
      '<div style="min-width:0"><div class="dn">' + esc(dn) + '</div><div id="tagrow" class="tagrow"><span class="tag' + (me.handle ? '' : ' none') + '">' + esc(me.handle ? tag : t('no_tag')) + '</span>' + ibtn('tagedit', 'edit', t('change_tag')) + '</div></div></div>' +
      '<label>' + esc(t('nick')) + '</label><input id="pn" placeholder="' + esc(t('nick_ph')) + '" value="' + esc((me.profile && me.profile.name) || '') + '">' +
      '<label>' + esc(t('avatar')) + '</label><input id="pp" placeholder="' + esc(t('avatar_ph')) + '" value="' + esc((me.profile && me.profile.picture) || '') + '">' +
      '<label>' + esc(t('about')) + '</label><textarea id="pa" placeholder="' + esc(t('about_ph')) + '">' + esc((me.profile && me.profile.about) || '') + '</textarea>' +
      '<div class="row"><button class="iconbtn pri" id="psave" title="' + esc(t('save')) + '">' + icon('save') + '</button><span class="msg" id="pmsg"></span></div></div>' +
      '<div class="card"><div class="row" style="justify-content:space-between"><span class="mut">' + esc(t('pubkey')) + '</span>' + ibtn('cpk', 'copy', t('copy')) + '</div><div class="mono" style="margin-top:.4rem">' + esc(me.pubkey) + '</div></div>' +
      '<div class="card"><div style="font-weight:700;margin-bottom:.7rem">' + esc(t('rep_t')) + '</div><div class="rep" id="rep"><div class="spin"></div></div></div>' +
      '</div>', function () {
        document.getElementById('cpk').onclick = function () { copy(me.pubkey).then(function () { toast(t('copied')); }); };
        document.getElementById('psave').onclick = async function () {
          var meta = Object.assign({}, me.profile || {}, { name: val('pn'), about: val('pa'), picture: val('pp'), lang: lang }); setMsg('pmsg', '…');
          try { await publish({ kind: 0, content: JSON.stringify(meta), tags: [], created_at: nows() }); profCache.delete(me.pubkey); await refreshMe(); vProfile(); toast(t('saved')); }
          catch (e) { setMsg('pmsg', noKey(e) ? t('need_id') : t('offline'), 'err'); }
        };
        // сменить тег: выбрать/занять имя и сделать его основным (primary в профиле)
        document.getElementById('tagedit').onclick = function () {
          var cur = me.handle ? me.handle.replace(/\.(nt|me)$/i, '') : '';
          var opts = (me.names || []).map(function (n) { return '<option' + (n === me.handle ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
          document.getElementById('tagrow').innerHTML = (me.names && me.names.length > 1 ? '<select id="tsel" style="width:auto;margin:0;display:inline-block">' + opts + '</select> ' : '') +
            '<span class="tag">@</span><input id="th" value="' + esc(cur) + '" placeholder="' + esc(t('tag_ph')) + '" style="width:8rem;display:inline-block;margin:0"> ' + ibtn('tok', 'check', t('save')) + ' <span class="msg" id="tmsg" style="display:inline"></span>';
          var th = document.getElementById('th'); th.focus();
          var sel = document.getElementById('tsel'); if (sel) sel.onchange = function () { th.value = sel.value.replace(/\.(nt|me)$/i, ''); };
          document.getElementById('tok').onclick = async function () {
            var v = (val('th') || '').trim().toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '');
            if (!v) { setMsg('tmsg', t('err'), 'err'); return; }
            if (!/\.[a-z]{2,}$/.test(v)) v = v + '.nt';
            setMsg('tmsg', '…');
            try {
              if ((me.names || []).indexOf(v) < 0) await publish({ kind: KIND.claim, content: '', tags: [['d', v], ['t', 'noet-name']], created_at: nows() });
              var meta = Object.assign({}, me.profile || {}, { primary: v });
              await publish({ kind: 0, content: JSON.stringify(meta), tags: [], created_at: nows() });
              profCache.delete(me.pubkey); await refreshMe(); vProfile(); toast(t('saved'));
            } catch (e) { setMsg('tmsg', noKey(e) ? t('need_id') : t('offline'), 'err'); }
          };
        };
        loadReputation();
      });
  }
  async function loadReputation() {
    var box = document.getElementById('rep'); if (!box) return;
    try {
      var evs = await query({ authors: [me.pubkey], kinds: [1, 7, 31002], limit: 500 });
      var posts = 0, react = 0, sites = 0, first = nows();
      evs.forEach(function (e) { if (e.kind === 1) posts++; else if (e.kind === 7) react++; else if (e.kind === 31002) sites++; if (e.created_at < first) first = e.created_at; });
      var days = evs.length ? Math.max(1, Math.round((nows() - first) / 86400)) : 0;
      var score = Math.round(posts + react * 0.2 + sites * 5);
      function cell(n, k) { return '<div><div class="n">' + n + '</div><div class="k">' + esc(t(k)) + '</div></div>'; }
      box.innerHTML = cell(score, 'rep_score') + cell(posts, 'rep_posts') + cell(react, 'rep_react') + cell(sites, 'rep_sites') + cell(days, 'rep_days');
    } catch (e) { box.innerHTML = '<span class="mut">' + esc(t('offline')) + '</span>'; }
  }
  function vProfileNew() {
    mount('<div class="wrap"><h1>' + esc(t('id_title')) + '</h1>' +
      '<div class="card"><button id="create">' + esc(t('create_id')) + '</button></div>' +
      '<div class="card"><label>' + esc(t('have_key')) + '</label><input id="imp" placeholder="' + esc(t('import_ph')) + '" autocomplete="off" spellcheck="false"><button class="ghost" id="doimp">' + esc(t('import')) + '</button><div class="msg" id="imsg"></div></div></div>', function () {
        document.getElementById('create').onclick = async function () { try { var r = await api.create(); await refreshMe(); vBackup(r.nsec); } catch (e) { setMsg('imsg', t('err'), 'err'); } };
        document.getElementById('doimp').onclick = async function () { var v = (val('imp') || '').trim().toLowerCase(); var m = v.match(/[0-9a-f]{64}/); if (m) v = m[0]; if (!/^[0-9a-f]{64}$/.test(v)) { setMsg('imsg', t('bad_key'), 'err'); return; } var r = await api.add(v); if (r.error) { setMsg('imsg', t('bad_key'), 'err'); return; } await api.switch(r.pubkey); await refreshMe(); go('profile'); render(); };
      });
  }
  function vBackup(nsec) {
    mount('<div class="wrap"><h1>' + esc(t('backup_t')) + '</h1><p class="mut">' + esc(t('backup_w')) + '</p><div class="card"><div class="row" style="align-items:flex-start"><div class="mono" style="flex:1">' + esc(nsec) + '</div>' + ibtn('cp', 'copy', t('copy')) + '</div><div class="row" style="margin-top:.7rem"><button id="dn">' + esc(t('done')) + '</button></div></div></div>', function () {
      document.getElementById('cp').onclick = function () { copy(nsec).then(function () { toast(t('copied')); }); };
      document.getElementById('dn').onclick = function () { go('profile'); render(); };
    });
  }

  /* ---------- настройки ---------- */
  function vSettings() {
    var notif = localStorage.getItem('scz_notif') === '1';
    mount('<div class="wrap"><h1>' + esc(t('nav_set')) + '</h1>' +
      '<div class="card"><div class="kv"><span class="k">' + esc(t('set_lang')) + '</span><span class="seg"><button data-l="ru" class="' + (lang === 'ru' ? 'on' : '') + '">RU</button><button data-l="en" class="' + (lang === 'en' ? 'on' : '') + '">EN</button></span></div></div>' +
      '<div class="card"><div style="font-weight:700;margin-bottom:.5rem">' + esc(t('set_accounts')) + '</div><div id="accs"><div class="spin"></div></div>' +
      '<div class="row" style="margin-top:.7rem"><input id="addk" placeholder="' + esc(t('set_add_ph')) + '" style="flex:1;margin:0" autocomplete="off" spellcheck="false"><button class="ghost" id="addbtn">' + esc(t('set_add')) + '</button></div>' +
      '<div class="row" style="margin-top:.5rem"><button id="newacc">' + esc(t('set_new')) + '</button><span class="msg" id="amsg"></span></div></div>' +
      '<div class="card"><div class="kv"><span class="k">' + esc(t('set_notif')) + '</span><span class="toggle ' + (notif ? 'on' : '') + '" id="ntog"></span></div></div>' +
      '<div class="card"><div class="kv"><span class="k">' + esc(t('set_storage')) + '</span><span id="stor" class="mut">…</span></div></div>' +
      '<div class="card"><button class="danger" id="forget">' + esc(t('forget')) + '</button></div>' +
      '</div>', function () {
        document.querySelectorAll('[data-l]').forEach(function (b) { b.onclick = function () { setLang(b.dataset.l); }; });
        document.getElementById('ntog').onclick = function (e) { var on = e.target.classList.toggle('on'); localStorage.setItem('scz_notif', on ? '1' : '0'); };
        document.getElementById('addbtn').onclick = async function () { var v = (val('addk') || '').trim().toLowerCase(); var m = v.match(/[0-9a-f]{64}/); if (m) v = m[0]; if (!/^[0-9a-f]{64}$/.test(v)) { setMsg('amsg', t('bad_key'), 'err'); return; } var r = await api.add(v); if (r.error) { setMsg('amsg', t('bad_key'), 'err'); return; } document.getElementById('addk').value = ''; setMsg('amsg', '', 'ok'); loadAccounts(); };
        document.getElementById('newacc').onclick = async function () { try { var r = await api.create(); await refreshMe(); vBackup(r.nsec); } catch (e) { setMsg('amsg', t('err'), 'err'); } };
        document.getElementById('forget').onclick = async function () { if (!confirm(t('forget_q'))) return; await api.forget(); await refreshMe(); render(); };
        loadAccounts();
        api.storage().then(function (s) { var el = document.getElementById('stor'); if (el) el.textContent = fmtBytes(s.bytes || 0) + ' · ' + (s.accounts || 0) + ' ' + t('set_accs'); }).catch(function () {});
      });
  }
  async function loadAccounts() {
    var box = document.getElementById('accs'); if (!box) return;
    try {
      var data = await api.accounts(); var list = data.accounts || [], active = data.active;
      if (!list.length) { box.innerHTML = '<div class="mut">' + esc(t('no_names')) + '</div>'; return; }
      box.innerHTML = list.map(function (pk) {
        return '<div class="acc" data-pk="' + esc(pk) + '">' + avImg(pk, '', '', 34) + '<div style="min-width:0"><div class="nm" data-nm="' + esc(pk) + '">' + esc(npubShort(pk)) + '</div><div class="tg">' + esc(npubShort(pk)) + '</div></div>' +
          (pk === active ? '<span class="badge">' + esc(t('set_active')) + '</span>' : '<button class="iconbtn" data-sw="' + esc(pk) + '" style="margin-left:auto" title="' + esc(t('set_switch')) + '">' + icon('switch') + '</button>') + '</div>';
      }).join('');
      applyAvatars();
      box.querySelectorAll('[data-sw]').forEach(function (b) { b.onclick = async function () { await api.switch(b.dataset.sw); await refreshMe(); render(); }; });
      list.forEach(function (pk) { profileOf(pk).then(function (p) { if (p && p.name) { var el = box.querySelector('[data-nm="' + pk + '"]'); if (el) el.textContent = p.name; } }); });
    } catch (e) { box.innerHTML = '<div class="mut">' + esc(t('offline')) + '</div>'; }
  }

  /* ---------- мессенджер ---------- */
  var FEED_TAG = 'scz.zone.feed';
  function topicOf(room) { return room ? 'scz.room.' + room : FEED_TAG; }
  function hasTag(ev, v) { return (ev.tags || []).some(function (x) { return x[0] === 't' && x[1] === v; }); }
  function spammy(ev) { return (ev.tags || []).filter(function (x) { return x[0] === 't'; }).length > 12; }
  function vMessenger() {
    var room = route().parts[1] || '';
    var topic = topicOf(room);
    var title = room ? '#' + room : '#' + t('general');
    mount('<div class="wrap wide"><h1>' + esc(t('nav_msg')) + '</h1>' +
      '<div class="msgr">' +
      '<aside class="chans card"><div class="chans-h">' + esc(t('channels')) + '<button class="addch" id="addch">+</button></div>' +
      '<div id="chanlist"><div class="spin" style="margin:.5rem auto"></div></div>' +
      '<div id="newch" style="display:none;margin-top:.5rem"><input id="nr" placeholder="' + esc(t('room_ph')) + '"><button class="ghost" id="mkroom" style="width:100%">' + esc(t('create')) + '</button></div></aside>' +
      '<section class="chat card"><div class="chat-h">' + esc(title) + '</div><div id="list" class="feed"><div class="empty"><div class="spin" style="margin:0 auto"></div></div></div>' +
      (me.hasKey ? '<div class="composer"><textarea id="txt" placeholder="' + esc(t('post_ph')) + '"></textarea><div class="row" style="justify-content:flex-end"><span class="msg" id="smsg" style="flex:1"></span><button class="iconbtn pri" id="send" title="' + esc(t('send')) + '">' + icon('send') + '</button></div></div>' : '<div class="composer mut">' + esc(t('need_id')) + '</div>') +
      '</section></div></div>', function () {
        renderChannels(room);
        document.getElementById('addch').onclick = function () { var n = document.getElementById('newch'); n.style.display = n.style.display === 'none' ? 'block' : 'none'; };
        document.getElementById('mkroom').onclick = function () { var v = (val('nr') || '').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 24); if (v) go('messenger', v); };
        if (me.hasKey) document.getElementById('send').onclick = async function () {
          var txt = (val('txt') || '').trim(); if (!txt) return; setMsg('smsg', t('sending'));
          try { await publish({ kind: 1, content: txt, tags: [['t', topic]], created_at: nows() }); document.getElementById('txt').value = ''; setMsg('smsg', ''); loadFeed(topic); }
          catch (e) { setMsg('smsg', noKey(e) ? t('need_id') : t('offline'), 'err'); }
        };
        loadFeed(topic);
      });
  }
  function renderChannels(active) {
    var box = document.getElementById('chanlist'); if (!box) return;
    function paint(rooms) {
      var html = '<a class="chan ' + (!active ? 'on' : '') + '" data-room="">#' + esc(t('general')) + '</a>';
      rooms.sort().forEach(function (r) { html += '<a class="chan ' + (active === r ? 'on' : '') + '" data-room="' + esc(r) + '">#' + esc(r) + '</a>'; });
      box.innerHTML = html;
      box.querySelectorAll('[data-room]').forEach(function (a) { a.onclick = function () { a.dataset.room ? go('messenger', a.dataset.room) : go('messenger'); }; });
    }
    paint(active ? [active] : []);
    query({ kinds: [1], limit: 200 }).then(function (evs) { var rooms = {}; evs.forEach(function (e) { (e.tags || []).forEach(function (x) { if (x[0] === 't' && x[1].indexOf('scz.room.') === 0) rooms[x[1].slice(9)] = 1; }); }); if (active) rooms[active] = 1; paint(Object.keys(rooms)); });
  }
  async function loadFeed(topic) {
    var list = document.getElementById('list'); if (!list) return;
    try {
      var evs = await query({ kinds: [1], '#t': [topic], limit: 100 });
      evs = evs.filter(function (e) { return hasTag(e, topic) && !spammy(e); }).sort(function (a, b) { return a.created_at - b.created_at; });
      if (!evs.length) { list.innerHTML = '<div class="empty">' + esc(t('feed_empty')) + '</div>'; return; }
      list.innerHTML = evs.map(function (e) { return '<div class="item" data-pk="' + esc(e.pubkey) + '"><span class="who">' + esc(e.pubkey.slice(0, 8) + '…') + '</span><span class="when">' + esc(when(e.created_at)) + '</span><div class="txt">' + esc(e.content) + '</div></div>'; }).join('');
      list.scrollTop = list.scrollHeight;
      var pks = {}; evs.forEach(function (e) { pks[e.pubkey] = 1; });
      Object.keys(pks).forEach(function (pk) { profileOf(pk).then(function (p) { if (p && p.name) list.querySelectorAll('.item[data-pk="' + pk + '"] .who').forEach(function (w) { w.textContent = p.name; }); }); });
    } catch (e) { list.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }

  /* ---------- домены и сайты ---------- */
  function slugName(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48); }
  function vSites() {
    var parts = route().parts;
    if (parts[1] === 'open' && parts[2]) return vSiteView(parts[2]);
    if (parts[1] === 'pub' && parts[2]) return vPublish(parts[2]);
    mount('<div class="wrap"><h1>' + esc(t('nav_sites')) + '</h1>' +
      (me.hasKey ? '<div class="card"><label>' + esc(t('claim_t')) + '</label><div class="row"><input id="cn" placeholder="' + esc(t('claim_ph')) + '" style="flex:1;margin:0"><button id="claim">' + esc(t('claim')) + '</button></div><div class="msg" id="cmsg"></div></div>' +
        '<h2>' + esc(t('my_names')) + '</h2><div class="card" id="names"><div class="spin"></div></div>' : '<div class="card mut">' + esc(t('need_id')) + '</div>') +
      '<div class="card"><label>' + esc(t('open_t')) + '</label><div class="row"><input id="on" placeholder="' + esc(t('open_ph')) + '" style="flex:1;margin:0">' + ibtn('ob', 'go', t('go')) + '</div></div>' +
      '</div>', function () {
        document.getElementById('ob').onclick = function () { var v = slugName(val('on')); if (v) go('sites', 'open', v); };
        if (me.hasKey) {
          document.getElementById('claim').onclick = async function () { var v = slugName(val('cn')); if (!v) return; if (!/\.[a-z]{2,}$/.test(v)) v = v + '.nt'; setMsg('cmsg', '…'); try { await publish({ kind: KIND.claim, content: '', tags: [['d', v], ['t', 'noet-name']], created_at: nows() }); setMsg('cmsg', t('published'), 'ok'); if (!me.handle) me.handle = v; loadNames(); } catch (e) { setMsg('cmsg', noKey(e) ? t('need_id') : t('offline'), 'err'); } };
          loadNames();
        }
      });
  }
  async function loadNames() {
    var box = document.getElementById('names'); if (!box) return;
    try {
      var evs = await query({ kinds: [KIND.claim], authors: [me.pubkey], limit: 100 });
      var names = {}; evs.forEach(function (e) { var d = (e.tags.find(function (x) { return x[0] === 'd'; }) || [])[1]; if (d) names[d] = 1; });
      var list = Object.keys(names).sort();
      if (!list.length) { box.innerHTML = '<div class="empty">' + esc(t('no_names')) + '</div>'; return; }
      box.innerHTML = list.map(function (n) { return '<div class="nameitem"><span class="mono" style="flex:1">' + esc(n) + '</span><button class="iconbtn" data-open="' + esc(n) + '" title="' + esc(t('open')) + '">' + icon('open') + '</button><button data-pub="' + esc(n) + '">' + esc(t('publish')) + '</button></div>'; }).join('');
      box.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { go('sites', 'open', b.dataset.open); }; });
      box.querySelectorAll('[data-pub]').forEach(function (b) { b.onclick = function () { go('sites', 'pub', b.dataset.pub); }; });
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }
  function vPublish(name) {
    mount('<div class="wrap"><div class="row" style="margin-bottom:.7rem">' + ibtn('', 'back', t('back')) + '<span class="mono">' + esc(name) + '</span></div>' +
      '<h1>' + esc(t('pub_t')) + '</h1>' +
      '<div class="card"><textarea id="phtml" class="code" placeholder="' + esc(t('pub_html')) + '">&lt;!doctype html&gt;\n&lt;h1&gt;Привет, зона&lt;/h1&gt;</textarea>' +
      '<div class="row"><button id="pub">' + esc(t('publish')) + '</button>' + ibtn('popen', 'open', t('open')) + '<span class="msg" id="pmsg"></span></div></div></div>', function () {
        document.querySelector('.wrap .iconbtn').onclick = function () { go('sites'); };
        query({ kinds: [KIND.page], '#d': [name], authors: [me.pubkey], limit: 1 }).then(function (evs) { if (evs[0] && evs[0].content) document.getElementById('phtml').value = evs[0].content; });
        document.getElementById('popen').onclick = function () { go('sites', 'open', name); };
        document.getElementById('pub').onclick = async function () { var html = val('phtml'); if (!html) return; setMsg('pmsg', '…'); try { await publish({ kind: KIND.page, content: html, tags: [['d', name]], created_at: nows() }); setMsg('pmsg', t('published'), 'ok'); } catch (e) { setMsg('pmsg', noKey(e) ? t('need_id') : t('offline'), 'err'); } };
      });
  }
  var GATEWAYS = ['https://{cid}.ipfs.dweb.link/', 'https://ipfs.io/ipfs/{cid}/'];
  async function fetchIpfs(cid) { for (var i = 0; i < GATEWAYS.length; i++) { try { var r = await fetch(GATEWAYS[i].replace('{cid}', cid), { signal: AbortSignal.timeout(8000) }); if (r.ok) { var txt = await r.text(); if (txt) return txt; } } catch (e) {} } return ''; }
  async function pageHtml(content) {
    var c = content || '';
    if (/^\s*\{/.test(c)) { try { var o = JSON.parse(c); if (typeof o.html === 'string' && o.html) return o.html; if (o.cid) return await fetchIpfs(o.cid); } catch (e) {} }
    return c;
  }
  async function vSiteView(name) {
    // та же шапка, что везде (без лишнего), + сайт на весь экран под ней
    document.getElementById('app').innerHTML = '<div class="siteholder">' + header() + '<div class="sitewrap" id="site"><div class="empty"><div class="spin" style="margin:0 auto"></div></div></div></div>';
    document.querySelectorAll('[data-go]').forEach(function (a) { a.onclick = function () { go(a.dataset.go); }; });
    applyAvatars();
    var box = document.getElementById('site');
    try {
      var claims = await query({ kinds: [KIND.claim], '#d': [name], limit: 50 }); claims.sort(function (a, b) { return a.created_at - b.created_at; });
      var owner = claims[0] ? claims[0].pubkey : null;
      var pages = await query({ kinds: [KIND.page], '#d': [name], limit: 20 });
      // предпочесть страницу владельца имени, иначе самую свежую (совместимо с расширением)
      var ownerPages = owner ? pages.filter(function (p) { return p.pubkey === owner; }) : [];
      var pick = (ownerPages.length ? ownerPages : pages).sort(function (a, b) { return b.created_at - a.created_at; })[0];
      if (!pick) { box.innerHTML = '<div class="empty">' + esc(t('site_none')) + '</div>'; return; }
      var html = await pageHtml(pick.content);
      if (!html) { box.innerHTML = '<div class="empty">' + esc(t('site_none')) + '</div>'; return; }
      var bridge = '<scr' + 'ipt src="/scz-embed.js"></scr' + 'ipt>';
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, function (m) { return m + bridge; }) : bridge + html;
      var ifr = document.createElement('iframe'); ifr.className = 'sitefull'; box.innerHTML = ''; box.appendChild(ifr); ifr.srcdoc = html;
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }

  function render() { var r = route().name; if (r === 'messenger') return vMessenger(); if (r === 'sites') return vSites(); if (r === 'profile') return vProfile(); if (r === 'settings') return vSettings(); vSearch(); }
  window.addEventListener('hashchange', render);
  (async function boot() { await refreshMe(); render(); })();
})();
