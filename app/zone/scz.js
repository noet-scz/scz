// SCZ зона: SPA в браузере, отдаётся локальным узлом (приложением). Подпись идёт в узел
// (/api/nostr/sign), данные живут на публичных реле, имена и сайты публикуются как события.
// Это «всё остальное в браузере за счёт приложения» вместо расширения.
(function () {
  'use strict';
  var RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
  var KIND = { profile: 0, post: 1, react: 7, page: 31002, claim: 31111 };

  /* ---------- i18n ---------- */
  var DICT = {
    ru: {
      nav_home: 'Главная', nav_msg: 'Мессенджер', nav_sites: 'Домены и сайты', nav_me: 'Профиль',
      guest: 'Гость', create_id: 'Создать личность', loading: 'Загружаю…',
      home_lead: 'Твоя зона: личность, общение, свои сайты и игры на доменах. Без серверов компаний, всё через твой узел.',
      t_msg: 'Мессенджер', d_msg: 'Каналы и личная лента сообщества.',
      t_sites: 'Домены и сайты', d_sites: 'Займи имя, залей свой сайт или игру, открой в браузере.',
      t_me: 'Профиль и репутация', d_me: 'Ключ, профиль, твоя репутация в сети.',
      id_title: 'Личность', id_lead: 'Ключ это твоя личность. Без почты и паролей.', id_none: 'Личности пока нет.',
      have_key: 'Уже есть ключ?', import_ph: 'приватный ключ (64 hex)', import: 'Импортировать', bad_key: 'Ключ должен быть 64 hex.',
      backup_t: 'Сохрани ключ', backup_w: 'Потеряешь ключ, потеряешь личность. Скопируй и спрячь.',
      copy: 'Скопировать', copied: 'Скопировано', done: 'Готово',
      yours: 'Твоя личность', pubkey: 'Публичный ключ', show_key: 'Показать ключ', hide: 'Спрятать',
      forget: 'Забыть ключ', forget_q: 'Забыть ключ? Без бэкапа не вернуть.',
      name: 'имя', about: 'о себе', avatar: 'ссылка на аватар (необязательно)', save: 'Сохранить', saved: 'Сохранено.',
      rep_t: 'Репутация', rep_lead: 'Считается локально по твоим действиям в сети, не покупается.',
      rep_posts: 'сообщений', rep_react: 'реакций', rep_sites: 'сайтов', rep_days: 'дней в сети', rep_score: 'счёт',
      need_id: 'Нужна личность: создай её в профиле.',
      msg_t: 'Мессенджер', msg_lead: 'Общая лента и каналы. Сообщения подписаны и видны всем участникам.',
      post_ph: 'написать…', post: 'Отправить', feed_empty: 'Пусто. Напиши первым.', posting: 'Отправляю…',
      rooms: 'Каналы', new_room: 'Новый канал', room_ph: 'название канала', general: 'общий',
      sites_t: 'Домены и сайты', sites_lead: 'Имя в зоне это твой адрес. Под ним публикуешь сайт, страницу или игру.',
      claim_ph: 'имя, например mysite.nt', claim: 'Занять имя', my_names: 'Мои имена',
      pub_t: 'Опубликовать сайт или игру', pub_name: 'под именем', pub_html: 'HTML страницы или игры',
      pub_btn: 'Опубликовать', open: 'Открыть', published: 'Опубликовано.', no_names: 'Имён пока нет, займи имя выше.',
      open_ph: 'имя, чтобы открыть', go: 'Перейти', site_none: 'Под этим именем пока ничего не опубликовано.',
      offline: 'Реле недоступны, проверь сеть.', err: 'Не получилось, попробуй ещё раз.',
    },
    en: {
      nav_home: 'Home', nav_msg: 'Messenger', nav_sites: 'Domains & sites', nav_me: 'Profile',
      guest: 'Guest', create_id: 'Create identity', loading: 'Loading…',
      home_lead: 'Your zone: identity, messaging, your own sites and games on domains. No company servers, all through your node.',
      t_msg: 'Messenger', d_msg: 'Channels and a community feed.',
      t_sites: 'Domains & sites', d_sites: 'Claim a name, upload your site or game, open it in the browser.',
      t_me: 'Profile & reputation', d_me: 'Key, profile, your reputation in the network.',
      id_title: 'Identity', id_lead: 'A key is your identity. No email, no password.', id_none: 'No identity yet.',
      have_key: 'Already have a key?', import_ph: 'private key (64 hex)', import: 'Import', bad_key: 'Key must be 64 hex.',
      backup_t: 'Back up your key', backup_w: 'Lose the key, lose the identity. Copy and store it.',
      copy: 'Copy', copied: 'Copied', done: 'Done',
      yours: 'Your identity', pubkey: 'Public key', show_key: 'Show key', hide: 'Hide',
      forget: 'Forget key', forget_q: 'Forget the key? No backup, no return.',
      name: 'name', about: 'about you', avatar: 'avatar url (optional)', save: 'Save', saved: 'Saved.',
      rep_t: 'Reputation', rep_lead: 'Computed locally from your actions, not bought.',
      rep_posts: 'messages', rep_react: 'reactions', rep_sites: 'sites', rep_days: 'days in network', rep_score: 'score',
      need_id: 'Identity needed: create one in profile.',
      msg_t: 'Messenger', msg_lead: 'Shared feed and channels. Messages are signed and visible to everyone.',
      post_ph: 'write…', post: 'Send', feed_empty: 'Empty. Be the first.', posting: 'Sending…',
      rooms: 'Channels', new_room: 'New channel', room_ph: 'channel name', general: 'general',
      sites_t: 'Domains & sites', sites_lead: 'A name in the zone is your address. Under it you publish a site, page or game.',
      claim_ph: 'name, e.g. mysite.nt', claim: 'Claim name', my_names: 'My names',
      pub_t: 'Publish a site or game', pub_name: 'under name', pub_html: 'HTML of the page or game',
      pub_btn: 'Publish', open: 'Open', published: 'Published.', no_names: 'No names yet, claim one above.',
      open_ph: 'name to open', go: 'Go', site_none: 'Nothing published under this name yet.',
      offline: 'Relays unreachable, check your connection.', err: 'Failed, try again.',
    },
  };
  var lang = localStorage.getItem('scz_lang') || 'ru';
  function t(k) { return (DICT[lang] && DICT[lang][k]) || DICT.ru[k] || k; }
  function setLang(l) { lang = l; localStorage.setItem('scz_lang', l); render(); }

  /* ---------- helpers ---------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); };
  var shortPk = function (pk) { return pk ? pk.slice(0, 10) + '…' : ''; };
  var hashN = function (s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  function avatar(pk, nm, pic) {
    if (pic && /^(https?:|data:)/i.test(pic)) return pic;
    var seed = pk || nm || '?', hue = hashN(seed) % 360, h2 = (hue + 50) % 360;
    var ch = (nm || '').trim() ? [].concat(nm.trim()[0])[0].toUpperCase().replace(/[&<>]/g, '') : '';
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><defs><linearGradient id='a' x1='0' y1='0' x2='64' y2='64'><stop offset='0' stop-color='hsl(" + hue + " 65% 56%)'/><stop offset='1' stop-color='hsl(" + h2 + " 60% 42%)'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(#a)'/>" + (ch ? "<text x='32' y='43' font-family='system-ui' font-size='30' font-weight='600' fill='white' text-anchor='middle'>" + ch + "</text>" : "") + "</svg>";
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  function when(ts) { var d = new Date(ts * 1000); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function toast(s) { var el = document.querySelector('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); } el.textContent = s; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('on'); }, 2200); }
  function copy(s) { return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return false; }); }

  /* ---------- мост к узлу: подпись личностью (window.nostr) ---------- */
  var api = {
    status: function () { return fetch('/api/identity/status').then(function (r) { return r.json(); }); },
    create: function () { return fetch('/api/identity/create', { method: 'POST' }).then(function (r) { return r.json(); }); },
    import: function (sk) { return fetch('/api/identity/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sk: sk }) }).then(function (r) { return r.json(); }); },
    export: function () { return fetch('/api/identity/export').then(function (r) { return r.json(); }); },
    forget: function () { return fetch('/api/identity/forget', { method: 'POST' }).then(function (r) { return r.json(); }); },
  };
  window.nostr = {
    getPublicKey: function () { return fetch('/api/nostr/pubkey').then(function (r) { return r.json(); }).then(function (j) { if (!j.pubkey) throw new Error('no_key'); return j.pubkey; }); },
    signEvent: function (ev) { return fetch('/api/nostr/sign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) }).then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw new Error(j.error); return j; }); },
    getRelays: function () { return Promise.resolve({}); },
  };

  /* ---------- реле: query/publish (window.noet) ---------- */
  function openSocks() { return RELAYS.map(function (u) { try { return new WebSocket(u); } catch (e) { return null; } }).filter(Boolean); }
  function query(filters, opts) {
    opts = opts || {}; var list = Array.isArray(filters) ? filters : [filters]; var seen = new Map(); var socks = openSocks();
    return new Promise(function (resolve) {
      var closed = 0, done = false;
      var fin = function () { if (done) return; done = true; clearTimeout(tm); try { socks.forEach(function (w) { w.close(); }); } catch (e) {} resolve([].concat(Array.from(seen.values())).sort(function (a, b) { return b.created_at - a.created_at; })); };
      var tm = setTimeout(fin, opts.timeout || 4500);
      socks.forEach(function (ws) {
        ws.onopen = function () { try { ws.send(JSON.stringify(['REQ', 'q', ].concat(list))); } catch (e) {} };
        ws.onmessage = function (m) { try { var a = JSON.parse(m.data); if (a[0] === 'EVENT' && a[2]) { if (!seen.has(a[2].id)) seen.set(a[2].id, a[2]); } else if (a[0] === 'EOSE') { ws.close(); if (++closed >= socks.length) fin(); } } catch (e) {} };
        ws.onerror = function () { if (++closed >= socks.length) fin(); };
      });
    });
  }
  async function publish(tmpl) {
    var signed = await window.nostr.signEvent(tmpl);
    var msg = JSON.stringify(['EVENT', signed]); var socks = openSocks();
    await Promise.all(socks.map(function (ws) {
      return new Promise(function (res) {
        var tm = setTimeout(function () { try { ws.close(); } catch (e) {} res(); }, 4500);
        ws.onopen = function () { try { ws.send(msg); } catch (e) {} };
        ws.onmessage = function (m) { try { if (JSON.parse(m.data)[0] === 'OK') { clearTimeout(tm); ws.close(); res(); } } catch (e) {} };
        ws.onerror = function () { clearTimeout(tm); res(); };
      });
    }));
    return signed;
  }
  window.noet = { me: function () { return window.nostr.getPublicKey().then(function (pk) { return { pubkey: pk }; }); }, publish: publish, query: query, relays: RELAYS.slice() };

  var nameCache = new Map();
  async function profileOf(pk) {
    if (nameCache.has(pk)) return nameCache.get(pk);
    var evs = await query({ kinds: [0], authors: [pk], limit: 1 });
    var p = {}; try { p = evs[0] ? JSON.parse(evs[0].content) : {}; } catch (e) {}
    nameCache.set(pk, p); return p;
  }

  /* ---------- состояние ---------- */
  var me = { hasKey: false, pubkey: null, profile: null };
  async function refreshMe() {
    try { var s = await api.status(); me.hasKey = !!s.hasKey; me.pubkey = s.pubkey || null; if (s.hasKey) me.profile = await profileOf(s.pubkey); else me.profile = null; } catch (e) { me = { hasKey: false, pubkey: null, profile: null }; }
  }

  /* ---------- роутер/шелл ---------- */
  var ROUTES = ['home', 'messenger', 'sites', 'profile'];
  function route() { var h = (location.hash || '').replace(/^#\/?/, '').split('/'); return { name: ROUTES.indexOf(h[0]) >= 0 ? h[0] : 'home', arg: h[1] ? decodeURIComponent(h[1]) : '' }; }
  function go(r) { location.hash = '#/' + r; }

  function shell(inner) {
    var r = route().name;
    var nm = me.hasKey ? ((me.profile && me.profile.name) || shortPk(me.pubkey)) : t('guest');
    var navItems = [['home', '⌂', 'nav_home'], ['messenger', '✉', 'nav_msg'], ['sites', '⬡', 'nav_sites'], ['profile', '○', 'nav_me']];
    return '<div class="shell"><aside class="side">' +
      '<div class="brand"><img src="/logo.svg"><span>SCZ</span></div>' +
      '<nav class="nav">' + navItems.map(function (n) { return '<a data-go="' + n[0] + '" class="' + (r === n[0] ? 'on' : '') + '"><span class="ic">' + n[1] + '</span><span class="t">' + esc(t(n[2])) + '</span></a>'; }).join('') + '</nav>' +
      '<div class="sp"></div>' +
      '<div class="chip" data-go="profile"><img src="' + avatar(me.pubkey, nm, me.profile && me.profile.picture) + '"><div><div class="nm">' + esc(nm) + '</div><div class="sub">' + esc(me.hasKey ? t('nav_me') : t('create_id')) + '</div></div></div>' +
      '<div class="row" style="padding:0 .6rem .7rem;gap:.3rem"><button class="ghost" data-lang="ru" style="flex:1">RU</button><button class="ghost" data-lang="en" style="flex:1">EN</button></div>' +
      '</aside><main class="main">' + inner + '</main></div>';
  }

  function mount(html, after) {
    document.getElementById('app').innerHTML = shell(html);
    document.querySelectorAll('[data-go]').forEach(function (a) { a.onclick = function () { go(a.dataset.go); }; });
    document.querySelectorAll('[data-lang]').forEach(function (b) { b.onclick = function () { setLang(b.dataset.lang); }; });
    if (after) after();
  }

  /* ---------- views ---------- */
  function vHome() {
    mount('<div class="wrap"><div class="row" style="gap:.7rem;margin-bottom:.3rem"><img src="/logo.svg" width="40" height="40"><h1>SCZ</h1></div>' +
      '<p class="lead">' + esc(t('home_lead')) + '</p>' +
      '<div class="grid">' +
      '<a class="tile" data-go="messenger"><div class="ti">' + esc(t('t_msg')) + '</div><div class="de">' + esc(t('d_msg')) + '</div></a>' +
      '<a class="tile" data-go="sites"><div class="ti">' + esc(t('t_sites')) + '</div><div class="de">' + esc(t('d_sites')) + '</div></a>' +
      '<a class="tile" data-go="profile"><div class="ti">' + esc(t('t_me')) + '</div><div class="de">' + esc(t('d_me')) + '</div></a>' +
      '</div></div>');
  }

  /* профиль + репутация */
  function setMsg(id, txt, cls) { var el = document.getElementById(id); if (el) { el.textContent = txt || ''; el.className = 'msg ' + (cls || ''); } }
  function vProfile() {
    if (!me.hasKey) return vProfileNew();
    mount('<div class="wrap"><h1>' + esc(t('yours')) + '</h1>' +
      '<div class="box"><div class="row" style="gap:.7rem;margin-bottom:.5rem"><img class="av" width="46" height="46" style="border-radius:50%" src="' + avatar(me.pubkey, me.profile && me.profile.name, me.profile && me.profile.picture) + '"><div><div style="font-weight:700">' + esc((me.profile && me.profile.name) || t('guest')) + '</div><div class="mut" style="font-size:.8rem">' + esc(t('pubkey')) + '</div></div></div>' +
      '<div class="mono">' + esc(me.pubkey) + '</div>' +
      '<div class="row" style="margin-top:.5rem"><button class="ghost" id="cpk">' + esc(t('copy')) + '</button><button class="ghost" id="skbtn">' + esc(t('show_key')) + '</button></div>' +
      '<div class="mono" id="skbox" style="display:none;margin-top:.5rem"></div></div>' +
      '<div class="box"><div class="mut" style="margin-bottom:.5rem">' + esc(t('nav_me')) + '</div>' +
      '<input id="pn" placeholder="' + esc(t('name')) + '" value="' + esc((me.profile && me.profile.name) || '') + '">' +
      '<textarea id="pa" placeholder="' + esc(t('about')) + '">' + esc((me.profile && me.profile.about) || '') + '</textarea>' +
      '<input id="pp" placeholder="' + esc(t('avatar')) + '" value="' + esc((me.profile && me.profile.picture) || '') + '">' +
      '<div class="row"><button id="psave">' + esc(t('save')) + '</button><span class="msg" id="pmsg"></span></div></div>' +
      '<div class="box"><div class="row" style="justify-content:space-between"><div style="font-weight:700">' + esc(t('rep_t')) + '</div></div>' +
      '<div class="mut" style="font-size:.84rem;margin:.2rem 0 .7rem">' + esc(t('rep_lead')) + '</div>' +
      '<div class="rep" id="rep"><div class="spin"></div></div></div>' +
      '<div class="box"><button class="danger" id="forget">' + esc(t('forget')) + '</button></div></div>', function () {
        document.getElementById('cpk').onclick = function () { copy(me.pubkey).then(function () { toast(t('copied')); }); };
        var shown = false;
        document.getElementById('skbtn').onclick = function (e) { var b = document.getElementById('skbox'); if (shown) { b.style.display = 'none'; shown = false; e.target.textContent = t('show_key'); return; } api.export().then(function (j) { b.textContent = j.sk || ''; b.style.display = 'block'; shown = true; e.target.textContent = t('hide'); }); };
        document.getElementById('psave').onclick = async function () {
          var meta = { name: val('pn'), about: val('pa'), picture: val('pp') };
          setMsg('pmsg', '…');
          try { await publish({ kind: 0, content: JSON.stringify(meta), tags: [], created_at: nows() }); nameCache.delete(me.pubkey); await refreshMe(); setMsg('pmsg', t('saved'), 'ok'); }
          catch (e) { setMsg('pmsg', noKey(e) ? t('need_id') : t('offline'), 'err'); }
        };
        document.getElementById('forget').onclick = async function () { if (!confirm(t('forget_q'))) return; await api.forget(); await refreshMe(); render(); };
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
    mount('<div class="wrap"><h1>' + esc(t('id_title')) + '</h1><p class="lead">' + esc(t('id_lead')) + '</p>' +
      '<div class="box"><button id="create">' + esc(t('create_id')) + '</button></div>' +
      '<div class="box"><div class="mut" style="margin-bottom:.5rem">' + esc(t('have_key')) + '</div>' +
      '<input id="imp" placeholder="' + esc(t('import_ph')) + '" autocomplete="off" spellcheck="false">' +
      '<button class="ghost" id="doimp">' + esc(t('import')) + '</button><div class="msg" id="imsg"></div></div></div>', function () {
        document.getElementById('create').onclick = async function () { try { var r = await api.create(); await refreshMe(); vBackup(r.nsec); } catch (e) { setMsg('imsg', t('err'), 'err'); } };
        document.getElementById('doimp').onclick = async function () {
          var v = (val('imp') || '').trim().toLowerCase(); var m = v.match(/[0-9a-f]{64}/); if (m) v = m[0];
          if (!/^[0-9a-f]{64}$/.test(v)) { setMsg('imsg', t('bad_key'), 'err'); return; }
          var r = await api.import(v); if (r.error) { setMsg('imsg', t('bad_key'), 'err'); return; } await refreshMe(); go('home'); render();
        };
      });
  }
  function vBackup(nsec) {
    mount('<div class="wrap"><h1>' + esc(t('backup_t')) + '</h1><p class="lead">' + esc(t('backup_w')) + '</p>' +
      '<div class="box"><div class="mono" style="margin-bottom:.6rem">' + esc(nsec) + '</div>' +
      '<div class="row"><button id="cp">' + esc(t('copy')) + '</button><button class="ghost" id="dn">' + esc(t('done')) + '</button></div></div></div>', function () {
        document.getElementById('cp').onclick = function () { copy(nsec).then(function () { toast(t('copied')); }); };
        document.getElementById('dn').onclick = function () { go('home'); render(); };
      });
  }

  /* мессенджер: общая лента + каналы */
  var FEED_TAG = 'scz.zone.feed';
  function hasTag(ev, v) { return (ev.tags || []).some(function (x) { return x[0] === 't' && x[1] === v; }); }
  function spammy(ev) { return (ev.tags || []).filter(function (x) { return x[0] === 't'; }).length > 12; }
  function vMessenger() {
    var room = route().arg || '';
    var topic = room ? 'scz.room.' + room : FEED_TAG;
    mount('<div class="wrap"><h1>' + esc(t('msg_t')) + '</h1><p class="lead">' + esc(t('msg_lead')) + '</p>' +
      '<div class="box"><div class="row" style="justify-content:space-between"><div style="font-weight:700">' + esc(t('rooms')) + '</div></div>' +
      '<div class="row" id="rooms" style="margin:.5rem 0"><a class="pill" data-room="">#' + esc(t('general')) + '</a></div>' +
      '<div class="row"><input id="nr" placeholder="' + esc(t('room_ph')) + '" style="flex:1;margin:0"><button class="ghost" id="mkroom">' + esc(t('new_room')) + '</button></div></div>' +
      (me.hasKey ? '<div class="box"><textarea id="txt" placeholder="' + esc(t('post_ph')) + '"></textarea><div class="row"><button id="send">' + esc(t('post')) + '</button><span class="msg" id="smsg"></span></div></div>' : '<div class="box mut">' + esc(t('need_id')) + '</div>') +
      '<div id="list"><div class="empty"><div class="spin" style="margin:0 auto"></div></div></div></div>', function () {
        renderRooms(room);
        document.getElementById('mkroom').onclick = function () { var v = (val('nr') || '').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 24); if (v) go('messenger/' + encodeURIComponent(v)); };
        if (me.hasKey) document.getElementById('send').onclick = async function () {
          var txt = (val('txt') || '').trim(); if (!txt) return; setMsg('smsg', t('posting'));
          try { await publish({ kind: 1, content: txt, tags: [['t', topic]], created_at: nows() }); document.getElementById('txt').value = ''; setMsg('smsg', ''); loadFeed(topic); }
          catch (e) { setMsg('smsg', noKey(e) ? t('need_id') : t('offline'), 'err'); }
        };
        loadFeed(topic);
      });
  }
  function renderRooms(active) {
    // показываем известные каналы из недавних событий
    query({ kinds: [1], limit: 200 }).then(function (evs) {
      var rooms = {};
      evs.forEach(function (e) { (e.tags || []).forEach(function (x) { if (x[0] === 't' && x[1].indexOf('scz.room.') === 0) rooms[x[1].slice(9)] = 1; }); });
      var box = document.getElementById('rooms'); if (!box) return;
      var html = '<a class="pill" data-room="" ' + (!active ? 'style="border-color:var(--acc);color:var(--fg)"' : '') + '>#' + esc(t('general')) + '</a>';
      Object.keys(rooms).sort().forEach(function (r) { html += '<a class="pill" data-room="' + esc(r) + '" ' + (active === r ? 'style="border-color:var(--acc);color:var(--fg)"' : '') + '>#' + esc(r) + '</a>'; });
      box.innerHTML = html;
      box.querySelectorAll('[data-room]').forEach(function (a) { a.onclick = function () { go(a.dataset.room ? 'messenger/' + encodeURIComponent(a.dataset.room) : 'messenger'); }; });
    });
  }
  async function loadFeed(topic) {
    var list = document.getElementById('list'); if (!list) return;
    try {
      var evs = await query({ kinds: [1], '#t': [topic], limit: 100 });
      evs = evs.filter(function (e) { return hasTag(e, topic) && !spammy(e); });
      if (!evs.length) { list.innerHTML = '<div class="empty">' + esc(t('feed_empty')) + '</div>'; return; }
      list.innerHTML = evs.map(function (e) { return '<div class="item" data-pk="' + esc(e.pubkey) + '"><span class="who">' + esc(shortPk(e.pubkey)) + '</span><span class="when">' + esc(when(e.created_at)) + '</span><div class="txt">' + esc(e.content) + '</div></div>'; }).join('');
      var pks = {}; evs.forEach(function (e) { pks[e.pubkey] = 1; });
      Object.keys(pks).forEach(function (pk) { profileOf(pk).then(function (p) { if (p && p.name) list.querySelectorAll('.item[data-pk="' + pk + '"] .who').forEach(function (w) { w.textContent = p.name; }); }); });
    } catch (e) { list.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }

  /* домены и сайты */
  function slugName(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48); }
  function vSites() {
    var openArg = route().arg;
    if (openArg) return vSiteView(openArg);
    mount('<div class="wrap"><h1>' + esc(t('sites_t')) + '</h1><p class="lead">' + esc(t('sites_lead')) + '</p>' +
      (me.hasKey ? '<div class="box"><div class="row"><input id="cn" placeholder="' + esc(t('claim_ph')) + '" style="flex:1;margin:0"><button id="claim">' + esc(t('claim')) + '</button></div><div class="msg" id="cmsg"></div></div>' : '<div class="box mut">' + esc(t('need_id')) + '</div>') +
      '<div class="box"><div class="mut" style="margin-bottom:.5rem">' + esc(t('open')) + '</div><div class="row"><input id="on" placeholder="' + esc(t('open_ph')) + '" style="flex:1;margin:0"><button class="ghost" id="ob">' + esc(t('go')) + '</button></div></div>' +
      (me.hasKey ? '<h2>' + esc(t('my_names')) + '</h2><div id="names"><div class="spin"></div></div>' +
        '<div class="box"><div style="font-weight:700;margin-bottom:.5rem">' + esc(t('pub_t')) + '</div>' +
        '<div class="row" style="margin-bottom:.5rem"><span class="mut">' + esc(t('pub_name')) + '</span><select id="pname" style="flex:1;margin:0"></select></div>' +
        '<textarea id="phtml" class="code" placeholder="' + esc(t('pub_html')) + '">&lt;!doctype html&gt;\n&lt;h1&gt;Привет, зона&lt;/h1&gt;</textarea>' +
        '<div class="row"><button id="pub">' + esc(t('pub_btn')) + '</button><span class="msg" id="pmsg2"></span></div></div>' : '') +
      '</div>', function () {
        document.getElementById('ob').onclick = function () { var v = slugName(val('on')); if (v) go('sites/' + encodeURIComponent(v)); };
        if (me.hasKey) {
          document.getElementById('claim').onclick = async function () {
            var v = slugName(val('cn')); if (!v) return; if (!/\.[a-z]{2,}$/.test(v)) v = v + '.nt';
            setMsg('cmsg', '…');
            try { await publish({ kind: KIND.claim, content: '', tags: [['d', v], ['t', 'noet-name']], created_at: nows() }); setMsg('cmsg', t('published'), 'ok'); loadNames(); }
            catch (e) { setMsg('cmsg', noKey(e) ? t('need_id') : t('offline'), 'err'); }
          };
          document.getElementById('pub').onclick = async function () {
            var nm = val('pname'), html = val('phtml'); if (!nm || !html) return; setMsg('pmsg2', '…');
            try { await publish({ kind: KIND.page, content: html, tags: [['d', nm]], created_at: nows() }); setMsg('pmsg2', t('published'), 'ok'); }
            catch (e) { setMsg('pmsg2', noKey(e) ? t('need_id') : t('offline'), 'err'); }
          };
          loadNames();
        }
      });
  }
  async function loadNames() {
    var box = document.getElementById('names'), sel = document.getElementById('pname'); if (!box) return;
    try {
      var evs = await query({ kinds: [KIND.claim], authors: [me.pubkey], limit: 100 });
      var names = {}; evs.forEach(function (e) { var d = (e.tags.find(function (x) { return x[0] === 'd'; }) || [])[1]; if (d) names[d] = 1; });
      var list = Object.keys(names).sort();
      if (!list.length) { box.innerHTML = '<div class="empty">' + esc(t('no_names')) + '</div>'; if (sel) sel.innerHTML = ''; return; }
      box.innerHTML = list.map(function (n) { return '<div class="item"><div class="row" style="justify-content:space-between"><span class="mono">' + esc(n) + '</span><button class="ghost" data-open="' + esc(n) + '">' + esc(t('open')) + '</button></div></div>'; }).join('');
      box.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { go('sites/' + encodeURIComponent(b.dataset.open)); }; });
      if (sel) sel.innerHTML = list.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('');
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }
  async function vSiteView(name) {
    mount('<div class="wrap"><div class="row" style="margin-bottom:.6rem;justify-content:space-between"><button class="ghost" data-go="sites">← ' + esc(t('sites_t')) + '</button><span class="mono">' + esc(name) + '</span></div><div id="site"><div class="empty"><div class="spin" style="margin:0 auto"></div></div></div></div>', async function () {
      var box = document.getElementById('site');
      try {
        // владелец = самая ранняя заявка (OTS), страница = свежая 31002 владельца
        var claims = await query({ kinds: [KIND.claim], '#d': [name], limit: 50 });
        claims.sort(function (a, b) { return a.created_at - b.created_at; });
        var owner = claims[0] ? claims[0].pubkey : me.pubkey;
        var pages = await query({ kinds: [KIND.page], '#d': [name], authors: [owner], limit: 10 });
        pages.sort(function (a, b) { return b.created_at - a.created_at; });
        if (!pages[0] || !pages[0].content) { box.innerHTML = '<div class="empty">' + esc(t('site_none')) + '</div>'; return; }
        // рендер опубликованного сайта/игры в iframe того же origin (узел),
        // window.nostr/window.noet доступны через инжект моста
        var bridge = '<scr' + 'ipt src="/scz-embed.js"></scr' + 'ipt>';
        var html = pages[0].content;
        html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, function (m) { return m + bridge; }) : bridge + html;
        var ifr = document.createElement('iframe'); ifr.className = 'site'; box.innerHTML = ''; box.appendChild(ifr);
        ifr.srcdoc = html;
      } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
    });
  }

  /* ---------- утилиты ---------- */
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  function nows() { return Math.floor(Date.now() / 1000); }
  function noKey(e) { return e && String(e.message || e).indexOf('no_key') >= 0; }

  function render() {
    var r = route().name;
    if (r === 'home') return vHome();
    if (r === 'messenger') return vMessenger();
    if (r === 'sites') return vSites();
    if (r === 'profile') return vProfile();
    vHome();
  }

  window.addEventListener('hashchange', render);
  (async function boot() { await refreshMe(); render(); })();
})();
