// SCZ зона: SPA в браузере, отдаётся локальным узлом. Подпись в узле (/api/nostr/sign),
// данные на публичных реле. Личность = ключ; ник (имя) и тег (хэндл/npub) это разное.
(function () {
  'use strict';
  var RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
  var KIND = { profile: 0, post: 1, react: 7, page: 31002, claim: 31111 };

  /* ---------- i18n ---------- */
  var DICT = {
    ru: {
      nav_home: 'Главная', nav_msg: 'Мессенджер', nav_sites: 'Домены и сайты', nav_me: 'Профиль',
      guest: 'Гость', create_id: 'Создать личность', no_tag: 'без тега',
      home_lead: 'Твоя зона: личность, общение, свои сайты и игры на доменах. Через твой узел, без серверов компаний.',
      t_msg: 'Мессенджер', d_msg: 'Каналы и общая лента сообщества.',
      t_sites: 'Домены и сайты', d_sites: 'Займи имя, залей свой сайт или игру, открой в браузере.',
      t_me: 'Профиль и репутация', d_me: 'Ключ, ник и тег, твоя репутация.',
      id_title: 'Личность', id_lead: 'Ключ это твоя личность. Без почты и паролей.',
      have_key: 'Уже есть ключ?', import_ph: 'приватный ключ (64 hex)', import: 'Импортировать', bad_key: 'Ключ должен быть 64 hex.',
      backup_t: 'Сохрани ключ', backup_w: 'Потеряешь ключ, потеряешь личность. Скопируй и спрячь.',
      copy: 'Скопировать', copied: 'Скопировано', done: 'Готово',
      yours: 'Твоя личность', nick: 'Ник', tag: 'Тег', pubkey: 'Публичный ключ', show_key: 'Показать ключ', hide: 'Спрятать',
      forget: 'Забыть ключ', forget_q: 'Забыть ключ? Без бэкапа не вернуть.',
      tag_hint: 'Тег это твой адрес в зоне. Заведи его на вкладке Домены, заняв имя.',
      name_ph: 'ник (как показывать)', about_ph: 'о себе', avatar_ph: 'ссылка на аватар (необязательно)', save: 'Сохранить', saved: 'Сохранено.',
      rep_t: 'Репутация', rep_lead: 'Считается локально по твоим действиям, не покупается.',
      rep_posts: 'сообщений', rep_react: 'реакций', rep_sites: 'сайтов', rep_days: 'дней в сети', rep_score: 'счёт',
      need_id: 'Нужна личность: создай её в профиле.',
      msg_lead: 'Слева каналы, справа чат. Сообщения подписаны и видны всем участникам.',
      post_ph: 'сообщение…', send: 'Отправить', feed_empty: 'В этом канале пусто. Напиши первым.', sending: 'Отправляю…',
      channels: 'Каналы', add_channel: 'Новый канал', room_ph: 'название канала', create: 'Создать', general: 'общий',
      sites_lead: 'Имя в зоне это твой адрес. Под ним публикуешь сайт, страницу или игру.',
      claim_ph: 'имя, например mysite.nt', claim: 'Занять', claim_t: 'Занять новое имя',
      my_names: 'Мои имена', open: 'Открыть', publish: 'Опубликовать', no_names: 'Имён пока нет. Займи имя выше.',
      open_other_t: 'Открыть чужое имя', open_ph: 'имя, чтобы открыть', go: 'Перейти',
      pub_t: 'Опубликовать под именем', pub_html: 'HTML страницы или игры', published: 'Опубликовано.', site_none: 'Под этим именем пока ничего не опубликовано.',
      back: 'Назад', offline: 'Реле недоступны, проверь сеть.', err: 'Не получилось, попробуй ещё раз.',
    },
    en: {
      nav_home: 'Home', nav_msg: 'Messenger', nav_sites: 'Domains & sites', nav_me: 'Profile',
      guest: 'Guest', create_id: 'Create identity', no_tag: 'no tag',
      home_lead: 'Your zone: identity, messaging, your own sites and games on domains. Through your node, no company servers.',
      t_msg: 'Messenger', d_msg: 'Channels and a shared community feed.',
      t_sites: 'Domains & sites', d_sites: 'Claim a name, upload your site or game, open it in the browser.',
      t_me: 'Profile & reputation', d_me: 'Key, nick and tag, your reputation.',
      id_title: 'Identity', id_lead: 'A key is your identity. No email, no password.',
      have_key: 'Already have a key?', import_ph: 'private key (64 hex)', import: 'Import', bad_key: 'Key must be 64 hex.',
      backup_t: 'Back up your key', backup_w: 'Lose the key, lose the identity. Copy and store it.',
      copy: 'Copy', copied: 'Copied', done: 'Done',
      yours: 'Your identity', nick: 'Nick', tag: 'Tag', pubkey: 'Public key', show_key: 'Show key', hide: 'Hide',
      forget: 'Forget key', forget_q: 'Forget the key? No backup, no return.',
      tag_hint: 'A tag is your address in the zone. Get one on the Domains tab by claiming a name.',
      name_ph: 'nick (display name)', about_ph: 'about you', avatar_ph: 'avatar url (optional)', save: 'Save', saved: 'Saved.',
      rep_t: 'Reputation', rep_lead: 'Computed locally from your actions, not bought.',
      rep_posts: 'messages', rep_react: 'reactions', rep_sites: 'sites', rep_days: 'days in network', rep_score: 'score',
      need_id: 'Identity needed: create one in profile.',
      msg_lead: 'Channels on the left, chat on the right. Messages are signed and public.',
      post_ph: 'message…', send: 'Send', feed_empty: 'This channel is empty. Be the first.', sending: 'Sending…',
      channels: 'Channels', add_channel: 'New channel', room_ph: 'channel name', create: 'Create', general: 'general',
      sites_lead: 'A name in the zone is your address. Under it you publish a site, page or game.',
      claim_ph: 'name, e.g. mysite.nt', claim: 'Claim', claim_t: 'Claim a new name',
      my_names: 'My names', open: 'Open', publish: 'Publish', no_names: 'No names yet. Claim one above.',
      open_other_t: 'Open another name', open_ph: 'name to open', go: 'Go',
      pub_t: 'Publish under name', pub_html: 'HTML of the page or game', published: 'Published.', site_none: 'Nothing published under this name yet.',
      back: 'Back', offline: 'Relays unreachable, check your connection.', err: 'Failed, try again.',
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
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><defs><linearGradient id='a' x1='0' y1='0' x2='64' y2='64'><stop offset='0' stop-color='hsl(" + hue + " 65% 56%)'/><stop offset='1' stop-color='hsl(" + h2 + " 60% 42%)'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(#a)'/>" + (ch ? "<text x='32' y='43' font-family='system-ui' font-size='30' font-weight='600' fill='white' text-anchor='middle'>" + ch + "</text>" : "") + "</svg>";
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  // картинка аватара с откатом на идентикон, если ссылка не загрузилась
  window.sczFb = function (img) { img.onerror = null; img.src = img.getAttribute('data-fb'); };
  function avImg(pk, nm, pic, size, cls) {
    var fb = identicon(pk, nm);
    var src = pic && /^(https?:|data:)/i.test(pic) ? pic : fb;
    return '<img ' + (cls ? 'class="' + cls + '" ' : '') + 'width="' + size + '" height="' + size + '" style="border-radius:50%" src="' + esc(src) + '" data-fb="' + esc(fb) + '" onerror="sczFb(this)">';
  }
  function when(ts) { var d = new Date(ts * 1000); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function toast(s) { var el = document.querySelector('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); } el.textContent = s; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('on'); }, 2200); }
  function copy(s) { return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return false; }); }

  /* npub (bech32) для тега, когда имя не занято */
  var CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function polymod(v) { var GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3], chk = 1; for (var p = 0; p < v.length; p++) { var top = chk >> 25; chk = ((chk & 0x1ffffff) << 5) ^ v[p]; for (var i = 0; i < 5; i++) chk ^= ((top >> i) & 1) ? GEN[i] : 0; } return chk; }
  function hrpExpand(h) { var r = [], i; for (i = 0; i < h.length; i++) r.push(h.charCodeAt(i) >> 5); r.push(0); for (i = 0; i < h.length; i++) r.push(h.charCodeAt(i) & 31); return r; }
  function checksum(h, d) { var v = hrpExpand(h).concat(d).concat([0, 0, 0, 0, 0, 0]), mod = polymod(v) ^ 1, r = []; for (var p = 0; p < 6; p++) r.push((mod >> 5 * (5 - p)) & 31); return r; }
  function convertbits(data, from, to, pad) { var acc = 0, bits = 0, ret = [], maxv = (1 << to) - 1; for (var p = 0; p < data.length; p++) { acc = (acc << from) | data[p]; bits += from; while (bits >= to) { bits -= to; ret.push((acc >> bits) & maxv); } } if (pad && bits > 0) ret.push((acc << (to - bits)) & maxv); return ret; }
  function npub(hex) { var b = [], i; for (i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16)); var d = convertbits(b, 8, 5, true), comb = d.concat(checksum('npub', d)), s = 'npub1'; for (i = 0; i < comb.length; i++) s += CHARSET.charAt(comb[i]); return s; }
  function tagOf() { if (me.handle) return me.handle; if (!me.pubkey) return ''; var n = npub(me.pubkey); return n.slice(0, 10) + '…' + n.slice(-4); }

  /* ---------- мост к узлу + реле ---------- */
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
  async function handleOf(pk) { try { var evs = await query({ kinds: [KIND.claim], authors: [pk], limit: 50 }); evs.sort(function (a, b) { return a.created_at - b.created_at; }); return evs[0] ? ((evs[0].tags.find(function (x) { return x[0] === 'd'; }) || [])[1] || '') : ''; } catch (e) { return ''; } }

  /* ---------- состояние ---------- */
  var me = { hasKey: false, pubkey: null, profile: null, handle: '' };
  async function refreshMe() {
    try { var s = await api.status(); me.hasKey = !!s.hasKey; me.pubkey = s.pubkey || null; if (s.hasKey) { me.profile = await profileOf(s.pubkey); me.handle = await handleOf(s.pubkey); } else { me.profile = null; me.handle = ''; } }
    catch (e) { me = { hasKey: false, pubkey: null, profile: null, handle: '' }; }
  }

  /* ---------- роутер/шелл ---------- */
  var ROUTES = ['messenger', 'sites', 'profile'];
  function route() { var raw = (location.hash || '').replace(/^#\/?/, ''); var parts = raw ? raw.split('/').map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } }) : []; return { name: ROUTES.indexOf(parts[0]) >= 0 ? parts[0] : 'messenger', parts: parts }; }
  function go() { location.hash = '#/' + Array.prototype.slice.call(arguments).map(encodeURIComponent).join('/'); }

  function shell(inner) {
    var r = route().name;
    var nick = me.hasKey ? ((me.profile && me.profile.name) || t('guest')) : t('guest');
    var tag = me.hasKey ? (tagOf() || t('no_tag')) : '';
    var nav = [['messenger', '✉', 'nav_msg'], ['sites', '⬡', 'nav_sites'], ['profile', '○', 'nav_me']];
    return '<div class="shell"><aside class="side">' +
      '<div class="brand"><img src="/logo.svg"><span>SCZ</span></div>' +
      '<nav class="nav">' + nav.map(function (n) { return '<a data-go="' + n[0] + '" class="' + (r === n[0] ? 'on' : '') + '"><span class="ic">' + n[1] + '</span><span class="t">' + esc(t(n[2])) + '</span></a>'; }).join('') + '</nav>' +
      '<div class="sp"></div>' +
      '<div class="chip" data-go="profile">' + avImg(me.pubkey, nick, me.profile && me.profile.picture, 34, 'av') + '<div class="ci"><div class="nm">' + esc(nick) + '</div>' + (me.hasKey ? '<div class="tg">' + esc(tag) + '</div>' : '<div class="tg">' + esc(t('create_id')) + '</div>') + '</div></div>' +
      '<div class="langs"><button data-lang="ru" class="' + (lang === 'ru' ? 'on' : '') + '">RU</button><button data-lang="en" class="' + (lang === 'en' ? 'on' : '') + '">EN</button></div>' +
      '</aside><main class="main">' + inner + '</main></div>';
  }
  function mount(html, after) {
    document.getElementById('app').innerHTML = shell(html);
    document.querySelectorAll('[data-go]').forEach(function (a) { a.onclick = function () { go(a.dataset.go); }; });
    document.querySelectorAll('[data-lang]').forEach(function (b) { b.onclick = function () { setLang(b.dataset.lang); }; });
    if (after) after();
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  function nows() { return Math.floor(Date.now() / 1000); }
  function noKey(e) { return e && String(e.message || e).indexOf('no_key') >= 0; }
  function setMsg(id, txt, cls) { var el = document.getElementById(id); if (el) { el.textContent = txt || ''; el.className = 'msg ' + (cls || ''); } }

  /* ---------- профиль ---------- */
  function vProfile() {
    if (!me.hasKey) return vProfileNew();
    var tag = tagOf();
    mount('<div class="wrap"><h1>' + esc(t('yours')) + '</h1>' +
      '<div class="box"><div class="row" style="gap:.8rem;align-items:center">' + avImg(me.pubkey, me.profile && me.profile.name, me.profile && me.profile.picture, 52, 'av') +
      '<div><div class="idnick">' + esc((me.profile && me.profile.name) || t('guest')) + '</div>' +
      '<div class="idtag">' + esc(tag || t('no_tag')) + '</div></div></div>' +
      '<div class="kv" style="margin-top:.7rem"><span class="k">' + esc(t('pubkey')) + '</span></div><div class="mono">' + esc(me.pubkey) + '</div>' +
      '<div class="row" style="margin-top:.5rem"><button class="ghost" id="cpk">' + esc(t('copy')) + '</button><button class="ghost" id="skbtn">' + esc(t('show_key')) + '</button></div>' +
      '<div class="mono" id="skbox" style="display:none;margin-top:.5rem"></div></div>' +
      '<div class="box">' +
      '<input id="pn" placeholder="' + esc(t('name_ph')) + '" value="' + esc((me.profile && me.profile.name) || '') + '">' +
      '<textarea id="pa" placeholder="' + esc(t('about_ph')) + '">' + esc((me.profile && me.profile.about) || '') + '</textarea>' +
      '<input id="pp" placeholder="' + esc(t('avatar_ph')) + '" value="' + esc((me.profile && me.profile.picture) || '') + '">' +
      '<div class="row"><button id="psave">' + esc(t('save')) + '</button><span class="msg" id="pmsg"></span></div></div>' +
      '<div class="box"><div style="font-weight:700;margin-bottom:.6rem">' + esc(t('rep_t')) + '</div><div class="rep" id="rep"><div class="spin"></div></div></div>' +
      '<div class="box"><button class="danger" id="forget">' + esc(t('forget')) + '</button></div></div>', function () {
        document.getElementById('cpk').onclick = function () { copy(me.pubkey).then(function () { toast(t('copied')); }); };
        var shown = false;
        document.getElementById('skbtn').onclick = function (e) { var b = document.getElementById('skbox'); if (shown) { b.style.display = 'none'; shown = false; e.target.textContent = t('show_key'); return; } api.export().then(function (j) { b.textContent = j.sk || ''; b.style.display = 'block'; shown = true; e.target.textContent = t('hide'); }); };
        document.getElementById('psave').onclick = async function () {
          var meta = { name: val('pn'), about: val('pa'), picture: val('pp') }; setMsg('pmsg', '…');
          try { await publish({ kind: 0, content: JSON.stringify(meta), tags: [], created_at: nows() }); profCache.delete(me.pubkey); await refreshMe(); vProfile(); toast(t('saved')); }
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
    mount('<div class="wrap"><h1>' + esc(t('id_title')) + '</h1>' +
      '<div class="box"><button id="create">' + esc(t('create_id')) + '</button></div>' +
      '<div class="box"><div class="k" style="margin-bottom:.5rem">' + esc(t('have_key')) + '</div><input id="imp" placeholder="' + esc(t('import_ph')) + '" autocomplete="off" spellcheck="false"><button class="ghost" id="doimp">' + esc(t('import')) + '</button><div class="msg" id="imsg"></div></div></div>', function () {
        document.getElementById('create').onclick = async function () { try { var r = await api.create(); await refreshMe(); vBackup(r.nsec); } catch (e) { setMsg('imsg', t('err'), 'err'); } };
        document.getElementById('doimp').onclick = async function () { var v = (val('imp') || '').trim().toLowerCase(); var m = v.match(/[0-9a-f]{64}/); if (m) v = m[0]; if (!/^[0-9a-f]{64}$/.test(v)) { setMsg('imsg', t('bad_key'), 'err'); return; } var r = await api.import(v); if (r.error) { setMsg('imsg', t('bad_key'), 'err'); return; } await refreshMe(); go('home'); render(); };
      });
  }
  function vBackup(nsec) {
    mount('<div class="wrap"><h1>' + esc(t('backup_t')) + '</h1><p class="lead">' + esc(t('backup_w')) + '</p><div class="box"><div class="mono" style="margin-bottom:.6rem">' + esc(nsec) + '</div><div class="row"><button id="cp">' + esc(t('copy')) + '</button><button class="ghost" id="dn">' + esc(t('done')) + '</button></div></div></div>', function () {
      document.getElementById('cp').onclick = function () { copy(nsec).then(function () { toast(t('copied')); }); };
      document.getElementById('dn').onclick = function () { go('home'); render(); };
    });
  }

  /* ---------- мессенджер: каналы слева, чат справа ---------- */
  var FEED_TAG = 'scz.zone.feed';
  function topicOf(room) { return room ? 'scz.room.' + room : FEED_TAG; }
  function hasTag(ev, v) { return (ev.tags || []).some(function (x) { return x[0] === 't' && x[1] === v; }); }
  function spammy(ev) { return (ev.tags || []).filter(function (x) { return x[0] === 't'; }).length > 12; }
  function vMessenger() {
    var room = route().parts[1] || '';
    var topic = topicOf(room);
    var title = room ? '#' + room : '#' + t('general');
    mount('<div class="wrap"><h1>' + esc(t('nav_msg')) + '</h1>' +
      '<div class="msgr">' +
      '<aside class="chans box"><div class="chans-h">' + esc(t('channels')) + '<button class="addch" id="addch" title="' + esc(t('add_channel')) + '">+</button></div>' +
      '<div id="chanlist"><div class="spin" style="margin:.5rem auto"></div></div>' +
      '<div id="newch" style="display:none;margin-top:.5rem"><input id="nr" placeholder="' + esc(t('room_ph')) + '"><button class="ghost" id="mkroom" style="width:100%">' + esc(t('create')) + '</button></div></aside>' +
      '<section class="chat box"><div class="chat-h">' + esc(title) + '</div><div id="list" class="feed"><div class="empty"><div class="spin" style="margin:0 auto"></div></div></div>' +
      (me.hasKey ? '<div class="composer"><textarea id="txt" placeholder="' + esc(t('post_ph')) + '"></textarea><div class="row" style="justify-content:flex-end"><span class="msg" id="smsg" style="flex:1"></span><button id="send">' + esc(t('send')) + '</button></div></div>' : '<div class="composer mut">' + esc(t('need_id')) + '</div>') +
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
      (me.hasKey ? '<div class="box"><div class="k" style="margin-bottom:.5rem">' + esc(t('claim_t')) + '</div><div class="row"><input id="cn" placeholder="' + esc(t('claim_ph')) + '" style="flex:1;margin:0"><button id="claim">' + esc(t('claim')) + '</button></div><div class="msg" id="cmsg"></div></div>' +
        '<h2>' + esc(t('my_names')) + '</h2><div id="names"><div class="spin"></div></div>' : '<div class="box mut">' + esc(t('need_id')) + '</div>') +
      '<div class="box"><div class="k" style="margin-bottom:.5rem">' + esc(t('open_other_t')) + '</div><div class="row"><input id="on" placeholder="' + esc(t('open_ph')) + '" style="flex:1;margin:0"><button class="ghost" id="ob">' + esc(t('go')) + '</button></div></div>' +
      '</div>', function () {
        document.getElementById('ob').onclick = function () { var v = slugName(val('on')); if (v) go('sites', 'open', v); };
        if (me.hasKey) {
          document.getElementById('claim').onclick = async function () { var v = slugName(val('cn')); if (!v) return; if (!/\.[a-z]{2,}$/.test(v)) v = v + '.nt'; setMsg('cmsg', '…'); try { await publish({ kind: KIND.claim, content: '', tags: [['d', v], ['t', 'noet-name']], created_at: nows() }); setMsg('cmsg', t('published'), 'ok'); me.handle = me.handle || v; loadNames(); } catch (e) { setMsg('cmsg', noKey(e) ? t('need_id') : t('offline'), 'err'); } };
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
      box.innerHTML = list.map(function (n) { return '<div class="item"><div class="row" style="justify-content:space-between;gap:.5rem"><span class="mono" style="flex:1">' + esc(n) + '</span><button class="ghost" data-open="' + esc(n) + '">' + esc(t('open')) + '</button><button data-pub="' + esc(n) + '">' + esc(t('publish')) + '</button></div></div>'; }).join('');
      box.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { go('sites', 'open', b.dataset.open); }; });
      box.querySelectorAll('[data-pub]').forEach(function (b) { b.onclick = function () { go('sites', 'pub', b.dataset.pub); }; });
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }
  function vPublish(name) {
    mount('<div class="wrap"><div class="row" style="margin-bottom:.6rem"><button class="ghost" data-go="sites">← ' + esc(t('back')) + '</button></div>' +
      '<h1>' + esc(t('pub_t')) + ' ' + esc(name) + '</h1>' +
      '<div class="box"><textarea id="phtml" class="code" placeholder="' + esc(t('pub_html')) + '">&lt;!doctype html&gt;\n&lt;h1&gt;Привет, зона&lt;/h1&gt;</textarea>' +
      '<div class="row"><button id="pub">' + esc(t('publish')) + '</button><button class="ghost" data-go2="open">' + esc(t('open')) + '</button><span class="msg" id="pmsg"></span></div></div></div>', function () {
        // подставим последнюю версию, если уже публиковали
        query({ kinds: [KIND.page], '#d': [name], authors: [me.pubkey], limit: 1 }).then(function (evs) { if (evs[0] && evs[0].content) document.getElementById('phtml').value = evs[0].content; });
        document.querySelector('[data-go2]').onclick = function () { go('sites', 'open', name); };
        document.getElementById('pub').onclick = async function () { var html = val('phtml'); if (!html) return; setMsg('pmsg', '…'); try { await publish({ kind: KIND.page, content: html, tags: [['d', name]], created_at: nows() }); setMsg('pmsg', t('published'), 'ok'); } catch (e) { setMsg('pmsg', noKey(e) ? t('need_id') : t('offline'), 'err'); } };
      });
  }
  var GATEWAYS = ['https://{cid}.ipfs.dweb.link/', 'https://ipfs.io/ipfs/{cid}/'];
  async function fetchIpfs(cid) { for (var i = 0; i < GATEWAYS.length; i++) { try { var r = await fetch(GATEWAYS[i].replace('{cid}', cid), { signal: AbortSignal.timeout(8000) }); if (r.ok) { var txt = await r.text(); if (txt) return txt; } } catch (e) {} } return ''; }
  // контент страницы: сырой HTML, либо старый формат расширения JSON {html} или {cid}
  async function pageHtml(content) {
    var c = content || '';
    if (/^\s*\{/.test(c)) { try { var o = JSON.parse(c); if (typeof o.html === 'string' && o.html) return o.html; if (o.cid) return await fetchIpfs(o.cid); } catch (e) {} }
    return c;
  }
  async function vSiteView(name) {
    var app = document.getElementById('app');
    app.innerHTML = '<div class="siteview"><div class="sitebar"><button class="ghost" id="sback">← ' + esc(t('back')) + '</button><span class="mono">' + esc(name) + '</span><span style="width:5rem"></span></div><div class="sitewrap" id="site"><div class="empty"><div class="spin" style="margin:0 auto"></div></div></div></div>';
    document.getElementById('sback').onclick = function () { go('sites'); };
    var box = document.getElementById('site');
    try {
      var claims = await query({ kinds: [KIND.claim], '#d': [name], limit: 50 }); claims.sort(function (a, b) { return a.created_at - b.created_at; });
      var owner = claims[0] ? claims[0].pubkey : me.pubkey;
      var pages = await query({ kinds: [KIND.page], '#d': [name], authors: [owner], limit: 10 }); pages.sort(function (a, b) { return b.created_at - a.created_at; });
      if (!pages[0]) { box.innerHTML = '<div class="empty">' + esc(t('site_none')) + '</div>'; return; }
      var html = await pageHtml(pages[0].content);
      if (!html) { box.innerHTML = '<div class="empty">' + esc(t('site_none')) + '</div>'; return; }
      var bridge = '<scr' + 'ipt src="/scz-embed.js"></scr' + 'ipt>';
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, function (m) { return m + bridge; }) : bridge + html;
      var ifr = document.createElement('iframe'); ifr.className = 'sitefull'; box.innerHTML = ''; box.appendChild(ifr); ifr.srcdoc = html;
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }

  function render() { var r = route().name; if (r === 'sites') return vSites(); if (r === 'profile') return vProfile(); vMessenger(); }
  window.addEventListener('hashchange', render);
  (async function boot() { await refreshMe(); render(); })();
})();
