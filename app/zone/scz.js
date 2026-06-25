// SCZ зона: SPA в браузере, отдаётся локальным узлом. Подпись в узле (/api/nostr/sign),
// данные на публичных реле. Дизайн перенесён с расширения.
(function () {
  'use strict';
  var RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
  var KIND = { profile: 0, post: 1, react: 7, page: 31002, claim: 31111 };

  /* ---------- i18n ---------- */
  var DICT = {
    ru: {
      nav_msg: 'Лента', nav_sites: 'Домены', nav_me: 'Профиль', nav_set: 'Настройки',
      nav_people: 'Люди', nav_wiki: 'Вики', nav_call: 'Звонок', nav_comm: 'Сообщества',
      search_ph: 'искать в зоне', searching: 'ищу…', nothing: 'Ничего не нашлось',
      tab_feed: 'Лента', tab_dm: 'Личные', dm_ph: 'зашифрованное сообщение…', dm_to_ph: 'кому (npub или 64 hex)', dm_empty: 'Выбери собеседника или напиши новому.', dm_none: 'Пока нет переписок.', dm_locked: 'зашифровано',
      people_empty: 'Пока никого не видно.', rep_of: 'Репутация', open_site: 'Сайт',
      wiki_new: 'Новая страница', wiki_title_ph: 'заголовок', wiki_body_ph: 'текст. [[Другая страница]] это ссылка. Пустая строка это абзац, # это подзаголовок.', wiki_empty: 'Пока нет страниц.', wiki_all: 'Все страницы', wiki_none: 'Такой страницы ещё нет.', wiki_make: 'Создать', wiki_del_q: 'Удалить страницу? Её можно создать заново.', edited_by: 'правил',
      call_start: 'Начать звонок', call_join: 'Войти по коду', call_code_ph: 'код комнаты (64 hex)', call_invite: 'Код приглашения', call_connecting: 'Подключаюсь…', call_host: 'Ты хост', mic_on: 'Микрофон', mic_off: 'Вкл. мик', cam_on: 'Камера', cam_off: 'Вкл. камеру', screen_share: 'Показать экран', screen_stop: 'Остановить показ', leave: 'Выйти', call_need: 'Нужна личность для звонка.', call_nomedia: 'Нет доступа к камере и микрофону.', call_audio: 'Камера недоступна, только звук.',
      comm_title: 'Сообщества', comm_new_ph: 'название сообщества', comm_about_ph: 'о чём оно', comm_create: 'Создать', comm_empty: 'Сообществ пока нет. Создай первое.', comm_join: 'Вступить', comm_joined: 'Вы участник', comm_members: 'участников', comm_post_ph: 'написать в сообщество', comm_lobby: 'Лента', comm_gov: 'Решения', comm_const: 'Конституция', comm_const_ph: 'правила сообщества', comm_fork: 'Форкнуть',
      gov_new_ph: 'предложение для голосования', gov_propose: 'Предложить', gov_empty: 'Предложений пока нет.', gov_yes: 'За', gov_no: 'Против', gov_weight: 'вес по репутации',
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
      bad_domain: 'Имя вида name.nt, с точкой и доменом.', taken: 'Имя уже занято.', need_rep: 'Набери репутацию (напиши в ленте), чтобы занимать имена и публиковать.', del_name: 'Удалить имя', del_name_q: 'Удалить имя? Оно освободится.',
      set_lang: 'Язык', set_accounts: 'Аккаунты', set_active: 'активный', set_switch: 'Войти', set_add: 'Добавить аккаунт', set_add_ph: 'приватный ключ (64 hex)', set_new: 'Создать новый',
      set_storage: 'Хранилище', set_used: 'занято', set_accs: 'аккаунтов', set_notif: 'Уведомления', forget: 'Забыть активный ключ', forget_q: 'Забыть ключ активного аккаунта? Без бэкапа не вернуть.',
      back: 'Назад', offline: 'Реле недоступны, проверь сеть.', err: 'Не получилось.',
    },
    en: {
      nav_msg: 'Feed', nav_sites: 'Domains', nav_me: 'Profile', nav_set: 'Settings',
      nav_people: 'People', nav_wiki: 'Wiki', nav_call: 'Call', nav_comm: 'Communities',
      search_ph: 'search the zone', searching: 'searching…', nothing: 'Nothing found',
      tab_feed: 'Feed', tab_dm: 'Direct', dm_ph: 'encrypted message…', dm_to_ph: 'to (npub or 64 hex)', dm_empty: 'Pick a chat or message someone new.', dm_none: 'No chats yet.', dm_locked: 'encrypted',
      people_empty: 'Nobody here yet.', rep_of: 'Reputation', open_site: 'Site',
      wiki_new: 'New page', wiki_title_ph: 'title', wiki_body_ph: 'text. [[Another page]] is a link. Blank line is a paragraph, # is a subheading.', wiki_empty: 'No pages yet.', wiki_all: 'All pages', wiki_none: 'No such page yet.', wiki_make: 'Create', wiki_del_q: 'Delete the page? It can be created again.', edited_by: 'edited by',
      call_start: 'Start a call', call_join: 'Join by code', call_code_ph: 'room code (64 hex)', call_invite: 'Invite code', call_connecting: 'Connecting…', call_host: 'You are the host', mic_on: 'Microphone', mic_off: 'Unmute', cam_on: 'Camera', cam_off: 'Camera on', screen_share: 'Share screen', screen_stop: 'Stop sharing', leave: 'Leave', call_need: 'Identity needed to call.', call_nomedia: 'No camera/microphone access.', call_audio: 'Camera unavailable, audio only.',
      comm_title: 'Communities', comm_new_ph: 'community name', comm_about_ph: 'what it is about', comm_create: 'Create', comm_empty: 'No communities yet. Create the first.', comm_join: 'Join', comm_joined: 'You are a member', comm_members: 'members', comm_post_ph: 'post to the community', comm_lobby: 'Feed', comm_gov: 'Decisions', comm_const: 'Constitution', comm_const_ph: 'community rules', comm_fork: 'Fork',
      gov_new_ph: 'proposal to vote on', gov_propose: 'Propose', gov_empty: 'No proposals yet.', gov_yes: 'For', gov_no: 'Against', gov_weight: 'reputation-weighted',
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
      bad_domain: 'Use name.nt, with a dot and a TLD.', taken: 'Name already taken.', need_rep: 'Build reputation (post in the feed) to claim names and publish.', del_name: 'Delete name', del_name_q: 'Delete the name? It will be freed.',
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
    if (pic && /^(https?:|data:)/i.test(pic)) {
      // http(s) тянем через прокси узла (обход хотлинк-защиты imgur и пр.); data: напрямую
      var src = /^data:/i.test(pic) ? pic : '/api/img?u=' + encodeURIComponent(pic);
      return '<img ' + attrs + ' src="' + esc(src) + '" onerror="this.onerror=null;this.src=\'' + ident + '\'">';
    }
    return '<img ' + attrs + ' src="' + ident + '">';
  }
  function applyAvatars() {}
  function when(ts) { var d = new Date(ts * 1000); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  // выбрать картинку, ужать в canvas, отдать data URI (инлайн в событие, без IPFS/аккаунтов)
  function pickImage(maxDim, maxChars, cb) {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = function () { var f = inp.files && inp.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { var img = new Image(); img.onload = function () { var w = img.width, h = img.height, sc = Math.min(1, maxDim / Math.max(w, h)); var cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc)); var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; cv.getContext('2d').drawImage(img, 0, 0, cw, ch); var q = 0.85, out = cv.toDataURL('image/jpeg', q); while (out.length > maxChars && q > 0.4) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); } cb(out); }; img.onerror = function () {}; img.src = r.result; }; r.readAsDataURL(f); };
    inp.click();
  }
  // картинка из тега image события: data: напрямую, http(s) через прокси узла
  function postImg(ev) { var it = (ev.tags || []).find(function (x) { return x[0] === 'image'; }); if (!it || !it[1]) return ''; var u = it[1]; var src = /^data:/i.test(u) ? u : '/api/img?u=' + encodeURIComponent(u); return '<img class="postimg" loading="lazy" src="' + esc(src) + '">'; }
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
    photo: '<path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/>',
    trash: '<path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>',
    video: '<path d="M15 10l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -1.447 .894l-4.553 -2.276v-4z"/><path d="M3 6m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z"/>',
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
  function npubDecode(s) { if (!/^npub1[0-9a-z]+$/i.test(s)) return null; var pos = s.lastIndexOf('1'); var data = []; for (var i = pos + 1; i < s.length; i++) { var d = CHARSET.indexOf(s[i]); if (d < 0) return null; data.push(d); } var words = data.slice(0, -6); var bytes = convertbits(words, 5, 8, false); if (!bytes || bytes.length !== 32) return null; return bytes.map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function toPubkey(s) { s = (s || '').trim(); if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase(); return npubDecode(s); }
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
    encrypt: function (pubkey, plaintext) { return fetch('/api/nostr/encrypt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: pubkey, plaintext: plaintext }) }).then(function (r) { return r.json(); }); },
    decrypt: function (pubkey, content) { return fetch('/api/nostr/decrypt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: pubkey, content: content }) }).then(function (r) { return r.json(); }); },
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

  // примитивы поверх реле (как в расширении): artifact (контент по ключу/теме), space (сообщество)
  KIND.space = 31000; KIND.appdata = 30078;
  var coordOf = function (ev) { return ev.kind + ':' + ev.pubkey + ':' + ((ev.tags.find(function (x) { return x[0] === 'd'; }) || [])[1] || ''); };
  var latestByCoord = function (evs) { var by = {}; evs.forEach(function (e) { var c = coordOf(e); if (!by[c] || e.created_at > by[c].created_at) by[c] = e; }); return Object.keys(by).map(function (k) { return by[k]; }); };
  var artifact = {
    publish: function (o) { o = o || {}; var k = o.kind || (o.key ? KIND.appdata : KIND.post); var tg = (o.tags || []).slice(); if (o.key) tg.push(['d', o.key]); [].concat(o.topic || []).forEach(function (x) { tg.push(['t', x]); }); return publish({ kind: k, tags: tg, content: typeof o.content === 'string' ? o.content : JSON.stringify(o.content || {}), created_at: nows() }); },
    query: async function (o) { o = o || {}; var f = { limit: o.limit || 200, kinds: o.kinds || [KIND.post] }; if (o.topic) f['#t'] = [].concat(o.topic); if (o.author) f.authors = [].concat(o.author); var evs = await query(f); if (o.topic) { var tp = [].concat(o.topic); evs = evs.filter(function (e) { return (e.tags || []).some(function (x) { return x[0] === 't' && tp.indexOf(x[1]) >= 0; }); }); } return o.key ? latestByCoord(evs) : evs; },
  };
  var space = {
    create: async function (o) { o = o || {}; var d = (String(o.title || 'space').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'space') + '-' + Math.random().toString(36).slice(2, 6); var tags = [['d', d], ['name', o.title || d]]; if (o.type) tags.push(['type', o.type]); var ev = await publish({ kind: KIND.space, tags: tags, content: JSON.stringify({ type: o.type || 'feed', title: o.title || d, about: o.about || '' }), created_at: nows() }); return { id: d, coord: coordOf(ev), title: o.title || d, owner: ev.pubkey }; },
    list: async function (o) { o = o || {}; var evs = latestByCoord(await query({ kinds: [KIND.space], limit: o.limit || 100 })); return evs.map(function (e) { var m = {}; try { m = JSON.parse(e.content); } catch (x) {} return { id: (e.tags.find(function (y) { return y[0] === 'd'; }) || [])[1], coord: coordOf(e), title: m.title, about: m.about, owner: e.pubkey, created_at: e.created_at }; }).sort(function (a, b) { return b.created_at - a.created_at; }); },
    get: async function (coord) { var p = String(coord).split(':'); var kind = +p[0], pub = p[1], d = p.slice(2).join(':'); var evs = await query({ kinds: [kind || KIND.space], authors: [pub], '#d': [d], limit: 1 }); if (!evs[0]) return null; var m = {}; try { m = JSON.parse(evs[0].content); } catch (x) {} return { id: d, coord: coord, title: m.title, about: m.about, owner: pub }; },
  };
  // живой сигналинг для звонка: держим сокеты, шлём подписанные эфемерные события
  function openSignal(filters, onEvent) {
    var list = Array.isArray(filters) ? filters : [filters]; var seen = new Set(); var ws = socks();
    ws.forEach(function (s) { s.onopen = function () { try { s.send(JSON.stringify(['REQ', 'c'].concat(list))); } catch (e) {} }; s.onmessage = function (m) { try { var a = JSON.parse(m.data); if (a[0] === 'EVENT' && a[1] === 'c' && a[2]) { if (!seen.has(a[2].id)) { seen.add(a[2].id); onEvent(a[2]); } } } catch (e) {} }; s.onerror = function () {}; });
    return { send: async function (tmpl) { var ev = await window.nostr.signEvent(tmpl); var msg = JSON.stringify(['EVENT', ev]); ws.forEach(function (w) { try { if (w.readyState === 1) w.send(msg); } catch (e) {} }); return ev; }, close: function () { try { ws.forEach(function (w) { try { w.send(JSON.stringify(['CLOSE', 'c'])); } catch (e) {} w.close(); }); } catch (e) {} } };
  }

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
  var ROUTES = ['search', 'messenger', 'comm', 'people', 'wiki', 'call', 'sites', 'profile', 'settings'];
  function route() { var raw = (location.hash || '').replace(/^#\/?/, ''); var parts = raw ? raw.split('/').map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } }) : []; return { name: ROUTES.indexOf(parts[0]) >= 0 ? parts[0] : 'search', parts: parts }; }
  function go() { location.hash = '#/' + Array.prototype.slice.call(arguments).map(encodeURIComponent).join('/'); }

  function header() {
    var r = route().name;
    var nick = me.hasKey ? ((me.profile && me.profile.name) || (me.handle ? me.handle.replace(/\.(nt|me)$/i, '') : t('guest'))) : t('guest');
    var nav = [['messenger', 'nav_msg'], ['comm', 'nav_comm'], ['people', 'nav_people'], ['wiki', 'nav_wiki'], ['sites', 'nav_sites']];
    var chip = '<a class="hchip" data-go="profile">' + avImg(me.pubkey, nick, me.profile && me.profile.picture, 27) +
      '<span class="ci"><span class="nm">' + esc(nick) + '</span>' + (me.hasKey ? '<span class="tg">' + esc(tagText(me.handle, me.pubkey)) + '</span>' : '<span class="tg">' + esc(t('create_id')) + '</span>') + '</span></a>';
    return '<header class="hdr"><a class="hbrand" data-go="search"><img src="/logo.svg"><span>SCZ</span></a>' +
      '<nav class="hnav">' + nav.map(function (n) { return '<a data-go="' + n[0] + '" class="' + (r === n[0] ? 'on' : '') + '">' + esc(t(n[1])) + '</a>'; }).join('') + '</nav>' + chip + '</header>';
  }
  function mount(inner, after) {
    document.getElementById('app').innerHTML = header() + inner;
    document.querySelectorAll('[data-go]').forEach(function (a) { a.onclick = function () { location.hash = '#/' + a.dataset.go.split('/').map(encodeURIComponent).join('/'); }; });
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
    var evs = await query([{ kinds: [KIND.claim], '#t': ['noet-name'], limit: 1000 }, { kinds: [0], limit: 1000 }, { kinds: [KIND.page], limit: 1000 }, { kinds: [5], limit: 1000 }]);
    var prof = {}; evs.filter(function (e) { return e.kind === 0; }).forEach(function (e) { if (!prof[e.pubkey] || e.created_at > (prof[e.pubkey]._ts || 0)) { try { var p = JSON.parse(e.content); p._ts = e.created_at; prof[e.pubkey] = p; } catch (x) {} } });
    var del = {}; evs.filter(function (e) { return e.kind === 5; }).forEach(function (e) { (e.tags || []).forEach(function (x) { if (x[0] === 'e') del[x[1]] = 1; }); });
    var owner = {};
    // только реальные имена зоны: формат label.tld, не тестовые (p\d+-…), не удалённые (kind 5)
    evs.filter(function (e) { return e.kind === KIND.claim && validDomain((e.tags.find(function (t) { return t[0] === 'd'; }) || [])[1]) && !del[e.id]; }).forEach(function (c) { var n = (c.tags.find(function (t) { return t[0] === 'd'; }) || [])[1]; if (!owner[n] || c.created_at < owner[n].ts) owner[n] = { pk: c.pubkey, ts: c.created_at }; });
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
      '<label>' + esc(t('avatar')) + '</label><div class="row" style="margin-bottom:.55rem"><input id="pp" placeholder="' + esc(t('avatar_ph')) + '" value="' + esc((me.profile && me.profile.picture) || '') + '" style="flex:1;margin:0">' + ibtn('pupload', 'photo', t('avatar')) + '</div>' +
      '<label>' + esc(t('about')) + '</label><textarea id="pa" placeholder="' + esc(t('about_ph')) + '">' + esc((me.profile && me.profile.about) || '') + '</textarea>' +
      '<div class="row"><button class="iconbtn pri" id="psave" title="' + esc(t('save')) + '">' + icon('save') + '</button><span class="msg" id="pmsg"></span></div></div>' +
      '<div class="card"><div class="row" style="justify-content:space-between"><span class="mut">' + esc(t('pubkey')) + '</span>' + ibtn('cpk', 'copy', t('copy')) + '</div><div class="mono" style="margin-top:.4rem">' + esc(me.pubkey) + '</div></div>' +
      '<div class="card"><div style="font-weight:700;margin-bottom:.7rem">' + esc(t('rep_t')) + '</div><div class="rep" id="rep"><div class="spin"></div></div></div>' +
      '</div>', function () {
        document.getElementById('cpk').onclick = function () { copy(me.pubkey).then(function () { toast(t('copied')); }); };
        document.getElementById('pupload').onclick = function () { pickImage(512, 140000, function (d) { document.getElementById('pp').value = d; var av = document.querySelector('.idhead .av'); if (av) { av.removeAttribute('onerror'); av.src = d; } }); };
        document.getElementById('psave').onclick = async function () {
          var meta = Object.assign({}, me.profile || {}, { name: val('pn'), about: val('pa'), picture: val('pp'), lang: lang }); setMsg('pmsg', '…');
          try { await publish({ kind: 0, content: JSON.stringify(meta), tags: [], created_at: nows() }); me.profile = meta; profCache.set(me.pubkey, meta); vProfile(); toast(t('saved')); }
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
              if ((me.names || []).indexOf(v) < 0) { await publish({ kind: KIND.claim, content: '', tags: [['d', v], ['t', 'noet-name']], created_at: nows() }); me.names = (me.names || []).concat([v]); }
              var meta = Object.assign({}, me.profile || {}, { primary: v });
              await publish({ kind: 0, content: JSON.stringify(meta), tags: [], created_at: nows() });
              me.profile = meta; me.handle = v; profCache.set(me.pubkey, meta); vProfile(); toast(t('saved'));
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
    var parts = route().parts;
    if (parts[1] === 'dm') return vDM(parts[2] || '');
    var room = parts[1] || '';
    var topic = topicOf(room);
    var title = room ? '#' + room : '#' + t('general');
    var pendImg = null;
    mount('<div class="wrap wide"><div class="tabs"><a class="tab on" data-go="messenger">' + esc(t('tab_feed')) + '</a><a class="tab" data-go="messenger/dm">' + esc(t('tab_dm')) + '</a></div>' +
      '<div class="msgr">' +
      '<aside class="chans card"><div class="chans-h">' + esc(t('channels')) + '<button class="addch" id="addch">+</button></div>' +
      '<div id="chanlist"><div class="spin" style="margin:.5rem auto"></div></div>' +
      '<div id="newch" style="display:none;margin-top:.5rem"><input id="nr" placeholder="' + esc(t('room_ph')) + '"><button class="ghost" id="mkroom" style="width:100%">' + esc(t('create')) + '</button></div></aside>' +
      '<section class="chat card"><div class="chat-h">' + esc(title) + '</div><div id="list" class="feed"><div class="empty"><div class="spin" style="margin:0 auto"></div></div></div>' +
      (me.hasKey ? '<div class="composer"><textarea id="txt" placeholder="' + esc(t('post_ph')) + '"></textarea><div class="row"><button class="iconbtn" id="attach" title="' + esc(t('avatar')) + '">' + icon('photo') + '</button><span class="msg" id="smsg" style="flex:1"></span><button class="iconbtn pri" id="send" title="' + esc(t('send')) + '">' + icon('send') + '</button></div></div>' : '<div class="composer mut">' + esc(t('need_id')) + '</div>') +
      '</section></div></div>', function () {
        renderChannels(room);
        document.getElementById('addch').onclick = function () { var n = document.getElementById('newch'); n.style.display = n.style.display === 'none' ? 'block' : 'none'; };
        document.getElementById('mkroom').onclick = function () { var v = (val('nr') || '').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 24); if (v) go('messenger', v); };
        if (me.hasKey) {
          document.getElementById('attach').onclick = function () { pickImage(900, 180000, function (d) { pendImg = d; document.getElementById('attach').classList.add('onv'); toast(t('saved')); }); };
          document.getElementById('send').onclick = async function () {
            var txt = (val('txt') || '').trim(); if (!txt && !pendImg) return; setMsg('smsg', t('sending'));
            var tags = [['t', topic]]; if (pendImg) tags.push(['image', pendImg]);
            try { await publish({ kind: 1, content: txt, tags: tags, created_at: nows() }); document.getElementById('txt').value = ''; pendImg = null; document.getElementById('attach').classList.remove('onv'); setMsg('smsg', ''); loadFeed(topic); }
            catch (e) { setMsg('smsg', noKey(e) ? t('need_id') : t('offline'), 'err'); }
          };
        }
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
      list.innerHTML = evs.map(function (e) { return '<div class="item" data-pk="' + esc(e.pubkey) + '"><span class="who">' + esc(e.pubkey.slice(0, 8) + '…') + '</span><span class="when">' + esc(when(e.created_at)) + '</span><div class="txt">' + esc(e.content) + '</div>' + postImg(e) + '</div>'; }).join('');
      list.scrollTop = list.scrollHeight;
      var pks = {}; evs.forEach(function (e) { pks[e.pubkey] = 1; });
      Object.keys(pks).forEach(function (pk) { profileOf(pk).then(function (p) { if (p && p.name) list.querySelectorAll('.item[data-pk="' + pk + '"] .who').forEach(function (w) { w.textContent = p.name; }); }); });
    } catch (e) { list.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }

  /* ---------- домены и сайты ---------- */
  var MIN_REP = 3;
  function isTestName(n) { return /^p\d+-[0-9a-f]{5,}\.(me|nt)$/i.test(n || ''); }
  function validDomain(s) { s = String(s || '').trim().toLowerCase(); return (/^[a-z0-9][a-z0-9-]{0,61}\.[a-z]{2,24}$/.test(s) && !isTestName(s)) ? s : null; }
  function slugName(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48); }
  function vSites() {
    var parts = route().parts;
    if (parts[1] === 'open' && parts[2]) return vSiteView(parts[2]);
    if (parts[1] === 'pub' && parts[2]) return vPublish(parts[2]);
    mount('<div class="wrap"><h1>' + esc(t('nav_sites')) + '</h1>' +
      (me.hasKey ? '<h2 style="margin-top:0">' + esc(t('my_names')) + '</h2><div class="card" id="names"><div class="spin"></div></div>' +
        '<div class="card"><label>' + esc(t('claim_t')) + '</label><div class="row"><input id="cn" placeholder="' + esc(t('claim_ph')) + '" style="flex:1;margin:0"><button id="claim">' + esc(t('claim')) + '</button></div><div class="msg" id="cmsg"></div></div>' : '<div class="card mut">' + esc(t('need_id')) + '</div>') +
      '<div class="card"><label>' + esc(t('open_t')) + '</label><div class="row"><input id="on" placeholder="' + esc(t('open_ph')) + '" style="flex:1;margin:0">' + ibtn('ob', 'go', t('go')) + '</div></div>' +
      '</div>', function () {
        document.getElementById('ob').onclick = function () { var v = validDomain(val('on')); if (v) go('sites', 'open', v); else { /* открыть как ввели, вдруг существующее */ var raw = (val('on') || '').trim().toLowerCase(); if (raw) go('sites', 'open', raw); } };
        if (me.hasKey) {
          loadNames();
          document.getElementById('claim').onclick = async function () {
            var v = validDomain(val('cn'));
            if (!v) { setMsg('cmsg', t('bad_domain'), 'err'); return; }
            if ((me.names || []).indexOf(v) >= 0) { setMsg('cmsg', t('taken'), 'err'); return; }
            setMsg('cmsg', '…');
            try { await publish({ kind: KIND.claim, content: '', tags: [['d', v], ['t', 'noet-name']], created_at: nows() }); setMsg('cmsg', t('published'), 'ok'); me.names = (me.names || []).concat([v]); if (!me.handle) me.handle = v; loadNames(); } catch (e) { setMsg('cmsg', noKey(e) ? t('need_id') : t('offline'), 'err'); }
          };
        }
      });
  }
  async function loadNames() {
    var box = document.getElementById('names'); if (!box) return;
    try {
      var evs = await query([{ kinds: [KIND.claim], authors: [me.pubkey], limit: 200 }, { kinds: [5], authors: [me.pubkey], limit: 200 }]);
      var del = {}; evs.filter(function (e) { return e.kind === 5; }).forEach(function (e) { (e.tags || []).forEach(function (x) { if (x[0] === 'e') del[x[1]] = 1; }); });
      var byName = {}; // имя -> массив id заявок (живых)
      evs.filter(function (e) { return e.kind === KIND.claim && !del[e.id]; }).forEach(function (e) { var d = (e.tags.find(function (x) { return x[0] === 'd'; }) || [])[1]; if (!d) return; (byName[d] = byName[d] || []).push(e.id); });
      var list = Object.keys(byName).sort();
      me.names = list;
      if (!list.length) { box.innerHTML = '<div class="empty">' + esc(t('no_names')) + '</div>'; return; }
      box.innerHTML = list.map(function (n) { return '<div class="nameitem"><span class="mono" style="flex:1">' + esc(n) + '</span><button class="iconbtn" data-open="' + esc(n) + '" title="' + esc(t('open')) + '">' + icon('open') + '</button><button data-pub="' + esc(n) + '">' + esc(t('publish')) + '</button><button class="iconbtn" data-del="' + esc(n) + '" title="' + esc(t('del_name')) + '">' + icon('trash') + '</button></div>'; }).join('');
      box.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { go('sites', 'open', b.dataset.open); }; });
      box.querySelectorAll('[data-pub]').forEach(function (b) { b.onclick = function () { go('sites', 'pub', b.dataset.pub); }; });
      box.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = async function () { var n = b.dataset.del; if (!confirm(t('del_name_q'))) return; try { await publish({ kind: 5, content: '', tags: byName[n].map(function (id) { return ['e', id]; }), created_at: nows() }); me.names = (me.names || []).filter(function (x) { return x !== n; }); if (me.handle === n) me.handle = me.names[0] || ''; _index = null; var row = b.closest('.nameitem'); if (row) row.remove(); if (!me.names.length) box.innerHTML = '<div class="empty">' + esc(t('no_names')) + '</div>'; } catch (e) {} }; });
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
        var allow = (me.names || []).indexOf(name) >= 0; // публиковать можно только под своим именем
        document.getElementById('pub').onclick = async function () { if (!allow) { setMsg('pmsg', t('taken'), 'err'); return; } var r = await repCells(me.pubkey).catch(function () { return { score: 0 }; }); if (r.score < MIN_REP) { setMsg('pmsg', t('need_rep'), 'err'); return; } var html = val('phtml'); if (!html) return; setMsg('pmsg', '…'); try { await publish({ kind: KIND.page, content: html, tags: [['d', name]], created_at: nows() }); setMsg('pmsg', t('published'), 'ok'); } catch (e) { setMsg('pmsg', noKey(e) ? t('need_id') : t('offline'), 'err'); } };
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

  /* ---------- репутация (общая) ---------- */
  async function repCells(pk) {
    var evs = await query({ authors: [pk], kinds: [1, 7, 31002], limit: 500 });
    var posts = 0, react = 0, sites = 0, first = nows();
    evs.forEach(function (e) { if (e.kind === 1) posts++; else if (e.kind === 7) react++; else if (e.kind === 31002) sites++; if (e.created_at < first) first = e.created_at; });
    var days = evs.length ? Math.max(1, Math.round((nows() - first) / 86400)) : 0;
    var score = Math.round(posts + react * 0.2 + sites * 5);
    function c(n, k) { return '<div><div class="n">' + n + '</div><div class="k">' + esc(t(k)) + '</div></div>'; }
    return { score: score, html: c(score, 'rep_score') + c(posts, 'rep_posts') + c(react, 'rep_react') + c(sites, 'rep_sites') + c(days, 'rep_days') };
  }

  /* ---------- Люди ---------- */
  function vPeople() {
    var pk = route().parts[1];
    if (pk) return vPerson(pk);
    mount('<div class="wrap"><h1>' + esc(t('nav_people')) + '</h1><div id="ppl"><div class="empty"><div class="spin" style="margin:0 auto"></div></div></div></div>', async function () {
      var box = document.getElementById('ppl');
      try {
        var idx = await buildIndex();
        if (!idx.length) { box.innerHTML = '<div class="empty">' + esc(t('people_empty')) + '</div>'; return; }
        box.innerHTML = idx.map(function (m) { return '<div class="sr" data-go="people/' + esc(m.pk) + '">' + avImg(m.pk, m.dn, m.pic, 36) + '<div style="min-width:0"><div><span class="srn">' + esc(m.dn) + '</span> <span class="srh">@' + esc(m.handle) + '</span></div></div></div>'; }).join('');
        document.querySelectorAll('#ppl [data-go]').forEach(function (a) { a.onclick = function () { go('people', a.dataset.go.split('/')[1]); }; });
      } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
    });
  }
  async function vPerson(pk) {
    var prof = await profileOf(pk).catch(function () { return {}; });
    var nm = prof.name || npubShort(pk);
    mount('<div class="wrap"><div class="row" style="margin-bottom:.6rem">' + ibtn('', 'back', t('back')) + '</div>' +
      '<div class="card"><div class="idhead">' + avImg(pk, nm, prof.picture, 76, 'av') + '<div style="min-width:0"><div class="dn">' + esc(nm) + '</div><div class="tag mono">' + esc(npubShort(pk)) + '</div></div></div>' +
      (prof.about ? '<div class="mut">' + esc(prof.about) + '</div>' : '') + '</div>' +
      '<div class="card"><div style="font-weight:700;margin-bottom:.7rem">' + esc(t('rep_of')) + '</div><div class="rep" id="rep"><div class="spin"></div></div></div>' +
      '<div class="row"><button id="dm">' + esc(t('tab_dm')) + '</button></div></div>', function () {
        document.querySelector('.wrap .iconbtn').onclick = function () { go('people'); };
        document.getElementById('dm').onclick = function () { go('messenger', 'dm', pk); };
        repCells(pk).then(function (r) { var b = document.getElementById('rep'); if (b) b.innerHTML = r.html; }).catch(function () {});
      });
  }

  /* ---------- Личные сообщения (NIP-04) ---------- */
  async function vDM(peer) {
    if (!me.hasKey) { mount('<div class="wrap"><div class="card mut">' + esc(t('need_id')) + '</div></div>'); return; }
    if (!peer) {
      mount('<div class="wrap wide"><div class="tabs"><a class="tab" data-go="messenger">' + esc(t('tab_feed')) + '</a><a class="tab on" data-go="messenger/dm">' + esc(t('tab_dm')) + '</a></div>' +
        '<div class="card"><div class="row"><input id="to" placeholder="' + esc(t('dm_to_ph')) + '" style="flex:1;margin:0">' + ibtn('toGo', 'go', t('go')) + '</div></div>' +
        '<div id="convos"><div class="spin" style="margin:1rem auto"></div></div></div>', function () {
          document.getElementById('toGo').onclick = function () { var pk = toPubkey(val('to')); if (pk) go('messenger', 'dm', pk); };
          loadConvos();
        });
      return;
    }
    var prof = await profileOf(peer).catch(function () { return {}; });
    var nm = prof.name || npubShort(peer);
    mount('<div class="wrap wide"><div class="row" style="margin-bottom:.6rem;justify-content:space-between"><div class="row">' + ibtn('', 'back', t('back')) + '<b>' + esc(nm) + '</b> <span class="mut mono">' + esc(npubShort(peer)) + '</span></div>' + ibtn('dmcall', 'video', t('nav_call')) + '</div>' +
      '<div class="card chatcard" style="padding:0"><div id="dmlist" class="feed"><div class="empty"><div class="spin" style="margin:0 auto"></div></div></div>' +
      '<div class="composer"><textarea id="dmtxt" placeholder="' + esc(t('dm_ph')) + '"></textarea><div class="row" style="justify-content:flex-end"><span class="msg" id="dmmsg" style="flex:1"></span><button class="iconbtn pri" id="dmsend" title="' + esc(t('send')) + '">' + icon('send') + '</button></div></div></div></div>', function () {
        document.querySelector('.wrap .iconbtn').onclick = function () { go('messenger', 'dm'); };
        document.getElementById('dmcall').onclick = async function () { var back = location.hash; try { var enc = await api.encrypt(peer, CALL_MARK + me.pubkey); if (!enc.error) await publish({ kind: 4, content: enc.content, tags: [['p', peer]], created_at: nows() }); } catch (e) {} runCall(me.pubkey, true, back); };
        document.getElementById('dmsend').onclick = async function () {
          var txt = (val('dmtxt') || '').trim(); if (!txt) return; setMsg('dmmsg', t('sending'));
          try { var enc = await api.encrypt(peer, txt); if (enc.error) throw new Error(enc.error); await publish({ kind: 4, content: enc.content, tags: [['p', peer]], created_at: nows() }); document.getElementById('dmtxt').value = ''; setMsg('dmmsg', ''); loadDM(peer); }
          catch (e) { setMsg('dmmsg', t('offline'), 'err'); }
        };
        loadDM(peer);
      });
  }
  async function loadConvos() {
    var box = document.getElementById('convos'); if (!box) return;
    try {
      var evs = await query([{ kinds: [4], '#p': [me.pubkey], limit: 200 }, { kinds: [4], authors: [me.pubkey], limit: 200 }]);
      var peers = {};
      evs.forEach(function (e) { var other = e.pubkey === me.pubkey ? (e.tags.find(function (x) { return x[0] === 'p'; }) || [])[1] : e.pubkey; if (other && other !== me.pubkey) { if (!peers[other] || e.created_at > peers[other]) peers[other] = e.created_at; } });
      var list = Object.keys(peers).sort(function (a, b) { return peers[b] - peers[a]; });
      if (!list.length) { box.innerHTML = '<div class="empty">' + esc(t('dm_none')) + '</div>'; return; }
      box.innerHTML = list.map(function (pk) { return '<div class="sr" data-peer="' + esc(pk) + '">' + avImg(pk, '', '', 36) + '<div style="min-width:0"><span class="srn" data-nm="' + esc(pk) + '">' + esc(npubShort(pk)) + '</span></div></div>'; }).join('');
      applyAvatars();
      box.querySelectorAll('[data-peer]').forEach(function (r) { r.onclick = function () { go('messenger', 'dm', r.dataset.peer); }; });
      list.forEach(function (pk) { profileOf(pk).then(function (p) { if (p && p.name) { var el = box.querySelector('[data-nm="' + pk + '"]'); if (el) el.textContent = p.name; } }); });
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }
  async function loadDM(peer) {
    var box = document.getElementById('dmlist'); if (!box) return;
    try {
      var evs = await query([{ kinds: [4], authors: [me.pubkey], '#p': [peer], limit: 200 }, { kinds: [4], authors: [peer], '#p': [me.pubkey], limit: 200 }]);
      evs.sort(function (a, b) { return a.created_at - b.created_at; });
      if (!evs.length) { box.innerHTML = '<div class="empty">' + esc(t('dm_empty')) + '</div>'; return; }
      var parts = await Promise.all(evs.map(function (e) { return api.decrypt(peer, e.content).then(function (r) { return { e: e, txt: r.plaintext || ('[' + t('dm_locked') + ']') }; }).catch(function () { return { e: e, txt: '[' + t('dm_locked') + ']' }; }); }));
      box.innerHTML = parts.map(function (x) { var mine = x.e.pubkey === me.pubkey; var cr = callRoom(x.txt); var body = cr ? '<button class="ghost calljoin" data-room="' + esc(cr) + '">' + icon('video') + ' ' + esc(t('nav_call')) + '</button>' : esc(x.txt); return '<div class="dmrow ' + (mine ? 'mine' : '') + '"><div class="bub">' + body + '<span class="when">' + esc(when(x.e.created_at)) + '</span></div></div>'; }).join('');
      box.querySelectorAll('.calljoin').forEach(function (b) { b.onclick = function () { var r = b.dataset.room; runCall(r, r === me.pubkey, location.hash); }; });
      box.scrollTop = box.scrollHeight;
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }

  /* ---------- Вики ---------- */
  var WIKI_TOPIC = 'scz-wiki';
  function vWiki() {
    var pages = {};
    var slug = function (s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48); };
    var dOf = function (ev) { var x = (ev.tags || []).find(function (y) { return y[0] === 'd'; }); return x ? x[1] : ''; };
    var titleOf = function (ev) { var x = (ev.tags || []).find(function (y) { return y[0] === 'title'; }); return x ? x[1] : dOf(ev) || 'страница'; };
    var isDel = function (ev) { return (ev.tags || []).some(function (y) { return y[0] === 'deleted'; }); };
    function renderMd(md) {
      return String(md || '').replace(/\r/g, '').split(/\n{2,}/).map(function (block) {
        var b = block.trim(); if (!b) return ''; if (/^#\s+/.test(b)) return '<h2>' + esc(b.replace(/^#\s+/, '')) + '</h2>';
        return '<p>' + esc(b).replace(/\n/g, '<br>').replace(/\[\[([^\]]+)\]\]/g, function (_, n) { var sl = slug(n); return '<a class="wl' + (pages[sl] ? '' : ' new') + '" data-wiki="' + esc(sl) + '">' + esc(n) + '</a>'; }) + '</p>';
      }).join('');
    }
    function host(extra) { return '<div class="wrap"><h1>' + esc(t('nav_wiki')) + '</h1>' + extra + '</div>'; }
    function wire() { document.querySelectorAll('[data-wiki]').forEach(function (a) { a.onclick = function () { viewPage(a.dataset.wiki); }; }); }
    async function load() { var all = await artifact.query({ kinds: [30078], topic: WIKI_TOPIC, key: true, limit: 500 }); pages = {}; all.forEach(function (ev) { var d = dOf(ev); if (!d) return; if (!pages[d] || ev.created_at > pages[d].created_at) pages[d] = ev; }); Object.keys(pages).forEach(function (d) { if (isDel(pages[d])) delete pages[d]; }); }
    function index() {
      var keys = Object.keys(pages).sort(function (a, b) { return pages[b].created_at - pages[a].created_at; });
      mount(host((me.hasKey ? '<div class="row" style="margin-bottom:1rem"><button id="new">' + esc(t('wiki_new')) + '</button></div>' : '') + (keys.length ? '<div class="card pglist">' + keys.map(function (k) { return '<a data-wiki="' + esc(k) + '">' + esc(titleOf(pages[k])) + '</a>'; }).join('') + '</div>' : '<div class="empty">' + esc(t('wiki_empty')) + '</div>')), function () { if (me.hasKey) document.getElementById('new').onclick = function () { edit(''); }; wire(); });
    }
    async function viewPage(sl) {
      var ev = pages[sl];
      if (!ev) { mount(host('<div class="row" style="margin-bottom:.6rem">' + ibtn('wback', 'back', t('wiki_all')) + '</div><h2>' + esc(sl) + '</h2><p class="mut">' + esc(t('wiki_none')) + '</p>' + (me.hasKey ? '<button id="mk">' + esc(t('wiki_make')) + '</button>' : '')), function () { document.getElementById('wback').onclick = index; if (me.hasKey) document.getElementById('mk').onclick = function () { edit(sl); }; }); return; }
      var who = await profileOf(ev.pubkey).then(function (p) { return p.name || npubShort(ev.pubkey); }).catch(function () { return npubShort(ev.pubkey); });
      mount(host('<div class="row" style="margin-bottom:.6rem">' + ibtn('wback', 'back', t('wiki_all')) + (me.hasKey ? ibtn('wedit', 'edit', t('wiki_edit')) + ibtn('wdel', 'save', t('delete')) : '') + '<span class="msg" id="wmsg"></span></div>' +
        '<h1 style="font-size:1.4rem">' + esc(titleOf(ev)) + '</h1><div class="mut" style="font-size:.8rem;margin-bottom:.6rem">' + esc(t('edited_by')) + ' ' + esc(who) + ' · ' + esc(when(ev.created_at)) + '</div><article>' + renderMd(ev.content) + '</article>'), function () {
          document.getElementById('wback').onclick = index;
          if (me.hasKey) {
            document.getElementById('wedit').onclick = function () { edit(sl); };
            document.getElementById('wdel').innerHTML = icon('back'); document.getElementById('wdel').title = t('delete');
            document.getElementById('wdel').onclick = async function () { if (!confirm(t('wiki_del_q'))) return; setMsg('wmsg', '…'); try { await artifact.publish({ key: sl, topic: WIKI_TOPIC, content: '', tags: [['title', titleOf(ev)], ['deleted', '1']] }); await load(); index(); } catch (e) { setMsg('wmsg', t('offline'), 'err'); } };
          }
          wire();
        });
    }
    function edit(sl) {
      var ev = sl && pages[sl]; var ti = ev ? titleOf(ev) : '';
      mount(host('<div class="row" style="margin-bottom:.6rem">' + ibtn('wcancel', 'back', t('back')) + '</div><div class="card"><input id="wt" placeholder="' + esc(t('wiki_title_ph')) + '" value="' + esc(ti) + '"><textarea id="wb" class="code" placeholder="' + esc(t('wiki_body_ph')) + '">' + esc(ev ? ev.content : '') + '</textarea><div class="row"><button class="iconbtn pri" id="wsave" title="' + esc(t('save')) + '">' + icon('save') + '</button><span class="msg" id="wmsg"></span></div></div>'), function () {
        document.getElementById('wcancel').onclick = function () { sl ? viewPage(sl) : index(); };
        document.getElementById('wsave').onclick = async function () { var ti2 = (val('wt') || '').trim(), body = val('wb'); if (!ti2) { setMsg('wmsg', t('wiki_title_ph'), 'err'); return; } var key = sl || slug(ti2); if (!key) return; setMsg('wmsg', '…'); try { await artifact.publish({ key: key, topic: WIKI_TOPIC, content: body, tags: [['title', ti2]] }); await load(); viewPage(key); } catch (e) { setMsg('wmsg', noKey(e) ? t('need_id') : t('offline'), 'err'); } };
      });
    }
    mount(host('<div class="empty"><div class="spin" style="margin:0 auto"></div></div>'), function () {});
    load().then(index).catch(function () { mount(host('<div class="empty">' + esc(t('offline')) + '</div>')); });
  }

  /* ---------- Сообщества ---------- */
  function vComm() {
    var coord = route().parts[1];
    if (coord) return vCommunity(coord);
    mount('<div class="wrap"><div class="row" style="justify-content:space-between;align-items:center"><h1 style="margin:0">' + esc(t('comm_title')) + '</h1>' +
      (me.hasKey ? '<button class="ghost" id="newc">+ ' + esc(t('comm_create')) + '</button>' : '') + '</div>' +
      (me.hasKey ? '<div class="card" id="ncard" style="display:none;margin-top:1rem"><input id="cnm" placeholder="' + esc(t('comm_new_ph')) + '"><input id="cab" placeholder="' + esc(t('comm_about_ph')) + '"><div class="row"><button id="cmk">' + esc(t('comm_create')) + '</button><span class="msg" id="cmsg"></span></div></div>' : '') +
      '<div id="clist" style="margin-top:1rem"><div class="spin" style="margin:1rem auto"></div></div></div>', function () {
        if (me.hasKey) {
          document.getElementById('newc').onclick = function () { var n = document.getElementById('ncard'); n.style.display = n.style.display === 'none' ? 'block' : 'none'; if (n.style.display === 'block') document.getElementById('cnm').focus(); };
          document.getElementById('cmk').onclick = async function () { var title = (val('cnm') || '').trim(); if (!title) return; setMsg('cmsg', '…'); try { var s = await space.create({ title: title, about: (val('cab') || '').trim(), type: 'community' }); go('comm', s.coord); } catch (e) { setMsg('cmsg', noKey(e) ? t('need_id') : t('offline'), 'err'); } };
        }
        loadComms();
      });
  }
  async function loadComms() {
    var box = document.getElementById('clist'); if (!box) return;
    try { var list = await space.list({ limit: 100 }); if (!list.length) { box.innerHTML = '<div class="empty">' + esc(t('comm_empty')) + '</div>'; return; }
      box.innerHTML = list.map(function (s) { return '<div class="card commrow" data-coord="' + esc(s.coord) + '"><div style="font-weight:700">' + esc(s.title || s.id) + '</div>' + (s.about ? '<div class="mut" style="font-size:.88rem;margin-top:.2rem">' + esc(s.about) + '</div>' : '') + '</div>'; }).join('');
      box.querySelectorAll('.commrow').forEach(function (el) { el.onclick = function () { go('comm', el.dataset.coord); }; });
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }
  async function vCommunity(coord) {
    var tab = route().parts[2] || 'feed';
    var topic = 'scz.comm:' + coord, govTopic = 'scz.gov:' + coord, joinTopic = 'scz.commjoin:' + coord;
    var sp = null; try { sp = await space.get(coord); } catch (e) {}
    var title = sp ? (sp.title || sp.id) : coord;
    mount('<div class="wrap wide"><div class="row" style="margin-bottom:.4rem;justify-content:space-between"><div class="row">' + ibtn('', 'back', t('comm_title')) + '<h1 style="margin:0">' + esc(title) + '</h1></div>' + (me.hasKey ? ibtn('commcall', 'video', t('nav_call')) : '') + '</div>' +
      '<div class="tabs"><a class="tab ' + (tab === 'feed' ? 'on' : '') + '" data-go="comm/' + encodeURIComponent(coord) + '/feed">' + esc(t('comm_lobby')) + '</a><a class="tab ' + (tab === 'gov' ? 'on' : '') + '" data-go="comm/' + encodeURIComponent(coord) + '/gov">' + esc(t('comm_gov')) + '</a></div>' +
      (me.hasKey ? '<div class="row" style="margin-bottom:.8rem"><button class="ghost" id="join">' + esc(t('comm_join')) + '</button><span class="mut" id="mem"></span></div>' : '') +
      '<div id="cbody"></div></div>', function () {
        document.querySelector('.wrap .iconbtn').onclick = function () { go('comm'); };
        // members
        query({ kinds: [1], '#t': [joinTopic], limit: 500 }).then(function (evs) { var m = {}; evs.forEach(function (e) { m[e.pubkey] = 1; }); var el = document.getElementById('mem'); if (el) el.textContent = Object.keys(m).length + ' ' + t('comm_members'); });
        if (me.hasKey) document.getElementById('join').onclick = async function () { try { await publish({ kind: 1, content: '', tags: [['t', joinTopic]], created_at: nows() }); toast(t('comm_joined')); } catch (e) {} };
        if (me.hasKey) document.getElementById('commcall').onclick = async function () { var back = location.hash; try { await publish({ kind: 1, content: CALL_MARK + me.pubkey, tags: [['t', topic]], created_at: nows() }); } catch (e) {} runCall(me.pubkey, true, back); };
        if (tab === 'gov') govBody(coord, govTopic); else commFeed(topic);
      });
  }
  function commFeed(topic) {
    var body = document.getElementById('cbody'); if (!body) return; var pendImg = null;
    body.innerHTML = (me.hasKey ? '<div class="card"><textarea id="ct" placeholder="' + esc(t('comm_post_ph')) + '"></textarea><div class="row"><button class="iconbtn" id="cattach" title="' + esc(t('avatar')) + '">' + icon('photo') + '</button><span class="msg" id="ctm" style="flex:1"></span><button class="iconbtn pri" id="cpost" title="' + esc(t('send')) + '">' + icon('send') + '</button></div></div>' : '') + '<div id="cfeed"><div class="spin" style="margin:1rem auto"></div></div>';
    if (me.hasKey) {
      document.getElementById('cattach').onclick = function () { pickImage(900, 180000, function (d) { pendImg = d; document.getElementById('cattach').classList.add('onv'); toast(t('saved')); }); };
      document.getElementById('cpost').onclick = async function () { var txt = (val('ct') || '').trim(); if (!txt && !pendImg) return; setMsg('ctm', t('sending')); var tags = [['t', topic]]; if (pendImg) tags.push(['image', pendImg]); try { await publish({ kind: 1, content: txt, tags: tags, created_at: nows() }); document.getElementById('ct').value = ''; pendImg = null; document.getElementById('cattach').classList.remove('onv'); setMsg('ctm', ''); loadCommFeed(topic); } catch (e) { setMsg('ctm', t('offline'), 'err'); } };
    }
    loadCommFeed(topic);
  }
  async function loadCommFeed(topic) {
    var box = document.getElementById('cfeed'); if (!box) return;
    try { var evs = (await query({ kinds: [1], '#t': [topic], limit: 100 })).filter(function (e) { return hasTag(e, topic) && !spammy(e); }).sort(function (a, b) { return b.created_at - a.created_at; });
      if (!evs.length) { box.innerHTML = '<div class="empty">' + esc(t('feed_empty')) + '</div>'; return; }
      box.innerHTML = evs.map(function (e) { var cr = callRoom(e.content); var txt = cr ? '<button class="ghost calljoin" data-room="' + esc(cr) + '">' + icon('video') + ' ' + esc(t('nav_call')) + '</button>' : esc(e.content); return '<div class="card"><span class="who" data-pk="' + esc(e.pubkey) + '">' + esc(e.pubkey.slice(0, 8) + '…') + '</span><span class="when">' + esc(when(e.created_at)) + '</span><div class="txt">' + txt + '</div>' + postImg(e) + '</div>'; }).join('');
      box.querySelectorAll('.calljoin').forEach(function (b) { b.onclick = function () { var r = b.dataset.room; runCall(r, r === me.pubkey, location.hash); }; });
      var pks = {}; evs.forEach(function (e) { pks[e.pubkey] = 1; }); Object.keys(pks).forEach(function (pk) { profileOf(pk).then(function (p) { if (p && p.name) box.querySelectorAll('.who[data-pk="' + pk + '"]').forEach(function (w) { w.textContent = p.name; }); }); });
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }
  function govBody(coord, govTopic) {
    var body = document.getElementById('cbody'); if (!body) return;
    body.innerHTML = (me.hasKey ? '<div class="card"><input id="gp" placeholder="' + esc(t('gov_new_ph')) + '"><div class="row"><button id="gpost">' + esc(t('gov_propose')) + '</button><span class="msg" id="gm"></span></div></div>' : '') + '<div class="mut" style="font-size:.82rem;margin-bottom:.6rem">' + esc(t('gov_weight')) + '</div><div id="gov"><div class="spin" style="margin:1rem auto"></div></div>';
    if (me.hasKey) document.getElementById('gpost').onclick = async function () { var txt = (val('gp') || '').trim(); if (!txt) return; setMsg('gm', '…'); try { await publish({ kind: 1, content: txt, tags: [['t', govTopic], ['proposal', '1']], created_at: nows() }); document.getElementById('gp').value = ''; setMsg('gm', ''); loadGov(govTopic); } catch (e) { setMsg('gm', t('offline'), 'err'); } };
    loadGov(govTopic);
  }
  async function loadGov(govTopic) {
    var box = document.getElementById('gov'); if (!box) return;
    try {
      var props = (await query({ kinds: [1], '#t': [govTopic], limit: 100 })).filter(function (e) { return hasTag(e, govTopic) && (e.tags || []).some(function (x) { return x[0] === 'proposal'; }); }).sort(function (a, b) { return b.created_at - a.created_at; });
      if (!props.length) { box.innerHTML = '<div class="empty">' + esc(t('gov_empty')) + '</div>'; return; }
      var ids = props.map(function (p) { return p.id; });
      var votes = await query({ kinds: [7], '#e': ids, limit: 1000 });
      // вес по репутации (квадратичный): один батч-запрос постов всех голосовавших
      var voters = {}; votes.forEach(function (v) { voters[v.pubkey] = 1; });
      var counts = {}; if (Object.keys(voters).length) { var vp = await query({ kinds: [1], authors: Object.keys(voters), limit: 1000 }); vp.forEach(function (e) { counts[e.pubkey] = (counts[e.pubkey] || 0) + 1; }); }
      var weight = function (pk) { return Math.max(1, Math.round(Math.sqrt((counts[pk] || 0) + 1))); };
      var tally = {}; var mine = {};
      votes.forEach(function (v) { var pid = (v.tags.find(function (x) { return x[0] === 'e'; }) || [])[1]; if (!pid) return; tally[pid] = tally[pid] || { yes: 0, no: 0 }; if (v.content === '-') tally[pid].no += weight(v.pubkey); else tally[pid].yes += weight(v.pubkey); if (v.pubkey === me.pubkey) mine[pid] = v.content === '-' ? 'no' : 'yes'; });
      box.innerHTML = props.map(function (p) { var tl = tally[p.id] || { yes: 0, no: 0 }; return '<div class="card"><div>' + esc(p.content) + '</div><div class="row" style="margin-top:.5rem;align-items:center">' +
        '<button class="ghost' + (mine[p.id] === 'yes' ? ' onv' : '') + '" data-vote="+" data-pid="' + esc(p.id) + '">' + esc(t('gov_yes')) + ' ' + tl.yes + '</button>' +
        '<button class="ghost' + (mine[p.id] === 'no' ? ' onv' : '') + '" data-vote="-" data-pid="' + esc(p.id) + '">' + esc(t('gov_no')) + ' ' + tl.no + '</button></div></div>'; }).join('');
      if (me.hasKey) box.querySelectorAll('[data-vote]').forEach(function (b) { b.onclick = async function () { try { await publish({ kind: 7, content: b.dataset.vote, tags: [['e', b.dataset.pid]], created_at: nows() }); loadGov(govTopic); } catch (e) {} }; });
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(t('offline')) + '</div>'; }
  }

  /* ---------- Звонок (host-star, как в расширении) ---------- */
  var STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
  var CALL_KIND = 21000;
  // звонок не отдельная вкладка: он начинается из диалога или сообщества. Сюда попадают
  // по ссылке-приглашению #/call/<room> (кнопка «войти в звонок» в чате).
  function vCall() {
    var room = route().parts[1];
    if (me.hasKey && room && /^[0-9a-f]{64}$/.test(room)) { runCall(room, room === me.pubkey, '#/messenger'); return; }
    go('messenger');
  }
  var CALL_MARK = 'scz:call:';
  function callRoom(c) { var m = /^scz:call:([0-9a-f]{64})$/.exec((c || '').trim()); return m ? m[1] : null; }
  function runCall(ROOM, IS_HOST, back) {
    var ME = me.pubkey, peers = new Map(), streamOwner = new Map(), tiles = new Map(), localVideoSenders = new Set();
    var localStream = null, camTrack = null, screenTrack = null, sharing = false, micOn = true, camOn = true, sig = null, stopped = false, helloIv = null;
    mount('<div class="wrap wide"><div class="row" style="justify-content:space-between;margin-bottom:.6rem"><div class="row">' + ibtn('cinvite', 'copy', t('call_invite')) + '<span class="mut" id="chint" style="font-size:.85rem"></span></div></div>' +
      '<div class="callgrid" id="grid"></div><div class="callbar"><button class="ghost" id="mic">' + esc(t('mic_on')) + '</button><button class="ghost" id="cam">' + esc(t('cam_on')) + '</button><button class="ghost" id="scr">' + esc(t('screen_share')) + '</button><button class="danger" id="leave">' + esc(t('leave')) + '</button></div><div class="msg" id="cmsg2"></div></div>', function () {
        document.getElementById('cinvite').onclick = function () { copy(ROOM).then(function () { toast(t('copied')); }); };
        document.getElementById('leave').onclick = function () { stop(true); };
        document.getElementById('mic').onclick = toggleMic; document.getElementById('cam').onclick = toggleCam; document.getElementById('scr').onclick = shareScreen;
        document.getElementById('chint').textContent = IS_HOST ? t('call_host') : t('call_connecting');
        boot();
      });
    var grid = function () { return document.getElementById('grid'); };
    function tileLabel(p) { return p === ME ? t('you') : (p && p.length === 64 ? p.slice(0, 8) + '…' : 'участник'); }
    function upsertTile(key, stream, isMe) { var tl = tiles.get(key); if (!tl) { tl = document.createElement('div'); tl.className = 'tile' + (isMe ? ' me' : ''); tl.innerHTML = '<video autoplay playsinline ' + (isMe ? 'muted' : '') + '></video><span class="lbl"></span>'; if (grid()) grid().appendChild(tl); tiles.set(key, tl); } var v = tl.querySelector('video'); if (stream && v.srcObject !== stream) v.srcObject = stream; tl.querySelector('.lbl').textContent = tileLabel(key); }
    function removeTile(k) { var tl = tiles.get(k); if (tl) { try { tl.remove(); } catch (e) {} tiles.delete(k); } }
    function makePc(rp) {
      var pc = new RTCPeerConnection({ iceServers: STUN }); var p = { pc: pc, pendingIce: [], making: false, ignore: false, polite: !IS_HOST }; peers.set(rp, p);
      if (localStream) localStream.getTracks().forEach(function (tr) { var s = pc.addTrack(tr, localStream); if (tr.kind === 'video') localVideoSenders.add(s); });
      if (localStream) streamOwner.set(localStream.id, ME);
      pc.onicecandidate = function (e) { if (e.candidate) send({ t: 'ice', c: e.candidate }, rp); };
      pc.ontrack = function (e) { var st = e.streams[0] || new MediaStream([e.track]); if (IS_HOST) { streamOwner.set(st.id, rp); for (var pr of peers) { if (pr[0] === rp) continue; if (!pr[1].pc.getSenders().some(function (s) { return s.track === e.track; })) { try { pr[1].pc.addTrack(e.track, st); } catch (x) {} } } announceMap(); upsertTile(rp, st); } else { upsertTile(streamOwner.get(st.id) || st.id, st); } };
      pc.onconnectionstatechange = function () { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') dropPeer(rp); };
      pc.onnegotiationneeded = async function () { try { p.making = true; await pc.setLocalDescription(); send({ t: 'desc', sdp: pc.localDescription }, rp); } catch (e) {} finally { p.making = false; } };
      return p;
    }
    function announceMap() { if (!IS_HOST) return; var map = {}; for (var so of streamOwner) map[so[0]] = so[1]; send({ t: 'map', map: map }); }
    async function flushIce(p) { while (p.pendingIce.length) { try { await p.pc.addIceCandidate(p.pendingIce.shift()); } catch (e) {} } }
    function dropPeer(pub) { var p = peers.get(pub); if (!p) return; try { p.pc.close(); } catch (e) {} peers.delete(pub); removeTile(pub); if (IS_HOST) { for (var so of streamOwner) if (so[1] === pub) streamOwner.delete(so[0]); announceMap(); } }
    async function onSig(ev) {
      if (ev.pubkey === ME || stopped) return; var pTag = (ev.tags.find(function (x) { return x[0] === 'p'; }) || [])[1]; var msg; try { msg = JSON.parse(ev.content); } catch (e) { return; } var from = ev.pubkey;
      if (msg.t === 'map') { if (from !== ROOM) return; Object.keys(msg.map || {}).forEach(function (sid) { streamOwner.set(sid, msg.map[sid]); var tl = tiles.get(sid); if (tl && msg.map[sid] !== sid) { tiles.delete(sid); tiles.set(msg.map[sid], tl); tl.querySelector('.lbl').textContent = tileLabel(msg.map[sid]); } }); return; }
      if (msg.t === 'bye') { if (from === ROOM && !IS_HOST) endByHost(); else dropPeer(from); return; }
      if (msg.t === 'join') { if (IS_HOST && !peers.has(from)) makePc(from); return; }
      if (pTag && pTag !== ME) return;
      if (msg.t === 'desc') { var p = peers.get(from); if (!p) { if (from === ROOM || IS_HOST) p = makePc(from); else return; } var d = msg.sdp; var collision = d.type === 'offer' && (p.making || p.pc.signalingState !== 'stable'); p.ignore = !p.polite && collision; if (p.ignore) return; try { await p.pc.setRemoteDescription(d); await flushIce(p); if (d.type === 'offer') { await p.pc.setLocalDescription(); send({ t: 'desc', sdp: p.pc.localDescription }, from); } var h = document.getElementById('chint'); if (h) h.textContent = IS_HOST ? t('call_host') : ''; } catch (e) {} }
      else if (msg.t === 'ice') { var p2 = peers.get(from); if (!p2) return; if (p2.pc.remoteDescription && p2.pc.remoteDescription.type) { try { await p2.pc.addIceCandidate(msg.c); } catch (e) {} } else p2.pendingIce.push(msg.c); }
    }
    async function send(obj, toPub) { if (!sig || stopped) return; var tags = [['r', ROOM]]; if (toPub) tags.push(['p', toPub]); try { await sig.send({ kind: CALL_KIND, tags: tags, content: JSON.stringify(obj) }); } catch (e) {} }
    function replaceOut(track) { localVideoSenders.forEach(function (s) { try { s.replaceTrack(track); } catch (e) {} }); }
    async function shareScreen() { if (sharing) return stopShare(); var ds; try { ds = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false }); } catch (e) { return; } screenTrack = ds.getVideoTracks()[0]; replaceOut(screenTrack); screenTrack.onended = stopShare; sharing = true; var tl = tiles.get(ME); if (tl) { tl.classList.add('sharing'); tl.querySelector('video').srcObject = ds; } controls(); }
    function stopShare() { if (!sharing) return; try { if (screenTrack) screenTrack.stop(); } catch (e) {} replaceOut(camOn ? camTrack : null); sharing = false; screenTrack = null; var tl = tiles.get(ME); if (tl) { tl.classList.remove('sharing'); tl.querySelector('video').srcObject = localStream; } controls(); }
    function toggleMic() { micOn = !micOn; localStream.getAudioTracks().forEach(function (t2) { t2.enabled = micOn; }); controls(); }
    function toggleCam() { camOn = !camOn; if (camTrack) camTrack.enabled = camOn; controls(); }
    function controls() { var mic = document.getElementById('mic'), cam = document.getElementById('cam'), scr = document.getElementById('scr'); if (mic) mic.textContent = micOn ? t('mic_on') : t('mic_off'); if (cam) cam.textContent = camOn ? t('cam_on') : t('cam_off'); if (scr) scr.textContent = sharing ? t('screen_stop') : t('screen_share'); }
    function endByHost() { var m = document.getElementById('cmsg2'); if (m) m.textContent = t('leave'); stop(false); }
    function stop(announce) { if (stopped) return; stopped = true; clearInterval(helloIv); if (announce) { try { send({ t: 'bye' }); } catch (e) {} } try { if (localStream) localStream.getTracks().forEach(function (t2) { t2.stop(); }); } catch (e) {} for (var pr of peers) { try { pr[1].pc.close(); } catch (e) {} } peers.clear(); setTimeout(function () { try { if (sig) sig.close(); } catch (e) {} }, 300); location.hash = back || '#/messenger'; }
    async function boot() {
      try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 480 } }); }
      catch (e) { try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); camOn = false; toast(t('call_audio')); } catch (e2) { var m = document.getElementById('cmsg2'); if (m) { m.textContent = t('call_nomedia'); m.className = 'msg err'; } return; } }
      camTrack = localStream.getVideoTracks()[0] || null; streamOwner.set(localStream.id, ME); upsertTile(ME, localStream, true); controls();
      sig = openSignal({ kinds: [CALL_KIND], '#r': [ROOM], since: nows() - 3 }, onSig);
      if (!IS_HOST) { var ann = function () { if (!peers.size && !stopped) send({ t: 'join' }, ROOM); }; ann(); helloIv = setInterval(function () { if (peers.size) { clearInterval(helloIv); var h = document.getElementById('chint'); if (h) h.textContent = ''; } else ann(); }, 2500); }
    }
    window.addEventListener('beforeunload', function () { try { send({ t: 'bye' }); } catch (e) {} });
  }

  function render() {
    var r = route().name;
    if (r === 'messenger') return vMessenger();
    if (r === 'comm') return vComm();
    if (r === 'people') return vPeople();
    if (r === 'wiki') return vWiki();
    if (r === 'call') return vCall();
    if (r === 'sites') return vSites();
    if (r === 'profile') return vProfile();
    if (r === 'settings') return vSettings();
    vSearch();
  }
  window.addEventListener('hashchange', render);
  (async function boot() { await refreshMe(); render(); })();
})();
