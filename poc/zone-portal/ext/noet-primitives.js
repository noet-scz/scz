// noet — примитивы конструктора поверх низкоуровневого ядра (noet.me/publish/query).
// ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ: один и тот же файл наращивает window.noet и в sandbox-рендере
// noet-контента, и на обычных страницах (content script). Ничего из ядра не требует,
// кроме публикации и запроса ПОДПИСАННЫХ событий — поэтому одинаков везде.
//
// Пять примитивов (docs/02-primitives.md): Identity, Space, Artifact, Relation, Policy.
// Ядро не знает слов «форум», «блог», «лайк» — это композиции примитивов снаружи.
(function () {
  var n = window.noet;
  if (!n || typeof n.publish !== 'function' || n.space) return;   // нужно ядро, один раз

  // kind'ы: переиспользуем готовые NIP где есть, свой минтим только под Space/Policy/Page
  var KIND = {
    profile: 0, contacts: 3, post: 1, react: 7, article: 30023, file: 1063,
    space: 31000, policy: 31001, page: 31002, appdata: 30078,
  };

  var now = function () { return Math.floor(Date.now() / 1000); };
  var tagVal = function (ev, k) { var t = (ev.tags || []).find(function (x) { return x[0] === k; }); return t ? t[1] : null; };
  var parse = function (ev) { try { return JSON.parse((ev && ev.content) || '{}'); } catch (e) { return {}; } };
  var arr = function (x) { return x == null ? [] : [].concat(x); };
  var rid = function () { return Math.random().toString(36).slice(2, 10); };
  var slug = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'space'; };
  // координата адресуемого события (NIP-33): kind:pubkey:d
  var coord = function (ev) { return ev.kind + ':' + ev.pubkey + ':' + (tagVal(ev, 'd') || ''); };
  var parseCoord = function (c) { var p = String(c).split(':'); return { kind: +p[0], pubkey: p[1], d: p.slice(2).join(':') }; };
  var coordOf = function (s) { return typeof s === 'string' ? s : (s && s.coord) || ''; };
  // оставить по координате только свежую версию (адресуемые события заменяются)
  var latest = function (evs) {
    var by = {}; evs.forEach(function (e) { var c = coord(e); if (!by[c] || e.created_at > by[c].created_at) by[c] = e; });
    return Object.keys(by).map(function (k) { return by[k]; });
  };

  // ---------- Identity: кто действует ----------
  var identity = {
    me: function () { return n.me(); },
    get: async function (pubkey) {
      var evs = await n.query({ kinds: [KIND.profile], authors: [pubkey], limit: 1 });
      return evs[0] ? Object.assign({ pubkey: pubkey }, parse(evs[0])) : { pubkey: pubkey };
    },
    follows: async function (pubkey) {
      var evs = await n.query({ kinds: [KIND.contacts], authors: [pubkey], limit: 1 });
      return evs[0] ? (evs[0].tags || []).filter(function (t) { return t[0] === 'p'; }).map(function (t) { return t[1]; }) : [];
    },
  };

  // ---------- Space: универсальное пространство ----------
  // type — строка (feed/forum/board/wiki/market/page/…). Ядро её НЕ интерпретирует,
  // это делает шаблон-рендерер. Владелец = автор события.
  var space = {
    create: async function (opts) {
      opts = opts || {};
      var d = opts.id || (slug(opts.title) + '-' + rid().slice(0, 4));
      var tags = [['d', d], ['name', opts.title || d]];
      if (opts.type) tags.push(['type', opts.type]);
      var content = JSON.stringify({ type: opts.type || 'feed', title: opts.title || d, about: opts.about || '', policy: opts.policy || null });
      var ev = await n.publish({ kind: KIND.space, tags: tags, content: content, created_at: now() });
      return { id: d, coord: coord(ev), type: opts.type || 'feed', title: opts.title || d, owner: ev.pubkey, event: ev };
    },
    get: async function (ref) {
      var c = typeof ref === 'string' ? parseCoord(ref) : { kind: KIND.space, pubkey: ref.owner, d: ref.id };
      var evs = await n.query({ kinds: [c.kind || KIND.space], authors: [c.pubkey], '#d': [c.d], limit: 1 });
      if (!evs[0]) return null;
      var m = parse(evs[0]);
      return { id: c.d, coord: coord(evs[0]), type: m.type, title: m.title, about: m.about, owner: evs[0].pubkey, policy: m.policy, event: evs[0] };
    },
    list: async function (opts) {
      opts = opts || {};
      var f = { kinds: [KIND.space], limit: opts.limit || 100 };
      if (opts.owner) f.authors = arr(opts.owner);
      if (opts.type) f['#type'] = [opts.type];
      return latest(await n.query(f)).map(function (e) { var m = parse(e); return { id: tagVal(e, 'd'), coord: coord(e), type: m.type, title: m.title, owner: e.pubkey }; });
    },
  };

  // ---------- Artifact: единица содержимого ----------
  // мелкое (текст/json) — событие целиком; крупное (файл) — CID в IPFS, в событии ссылка.
  // принадлежность пространству — a-тег; ключ изменяемого — d-тег (30078).
  var artifact = {
    publish: async function (opts) {
      opts = opts || {};
      var kind = opts.kind || (opts.type === 'article' ? KIND.article : opts.type === 'file' ? KIND.file : opts.key ? KIND.appdata : KIND.post);
      var tags = arr(opts.tags).slice();
      if (opts.space) tags.push(['a', coordOf(opts.space)]);
      if (opts.key) tags.push(['d', opts.key]);
      arr(opts.topic).forEach(function (t) { tags.push(['t', t]); });
      if (opts.cid) { tags.push(['cid', opts.cid]); tags.push(['imeta', 'url ipfs://' + opts.cid]); }
      var content = typeof opts.content === 'string' ? opts.content : JSON.stringify(opts.content || {});
      return await n.publish({ kind: kind, tags: tags, content: content, created_at: now() });
    },
    query: async function (opts) {
      opts = opts || {};
      var f = { limit: opts.limit || 100 };
      f.kinds = opts.kinds || [KIND.post, KIND.article, KIND.file, KIND.appdata];
      if (opts.space) f['#a'] = [coordOf(opts.space)];
      if (opts.author) f.authors = arr(opts.author);
      if (opts.topic) f['#t'] = arr(opts.topic);
      if (opts.since) f.since = opts.since;
      var evs = await n.query(f);
      return opts.key ? latest(evs) : evs;
    },
    get: async function (id) { var e = await n.query({ ids: [id], limit: 1 }); return e[0] || null; },
  };

  // ---------- Relation: связи между сущностями ----------
  // связи это теги/события: reply — событие-ответ с e-тегами (NIP-10); react — kind 7;
  // mention — p-тег; произвольная типизированная — rel-тег. Граф один, прочтений много.
  var relation = {
    add: async function (opts) {
      opts = opts || {};
      var type = opts.type || 'ref';
      var tags = arr(opts.tags).slice();
      if (opts.space) tags.push(['a', coordOf(opts.space)]);
      arr(opts.topic).forEach(function (t) { tags.push(['t', t]); });
      if (type === 'react') {
        tags.push(['e', opts.to]); if (opts.toAuthor) tags.push(['p', opts.toAuthor]);
        return await n.publish({ kind: KIND.react, tags: tags, content: opts.content || '+', created_at: now() });
      }
      if (type === 'reply') {
        if (opts.root && opts.root !== opts.to) tags.push(['e', opts.root, '', 'root']);
        tags.push(['e', opts.to, '', opts.root ? 'reply' : 'root']);
        if (opts.toAuthor) tags.push(['p', opts.toAuthor]);
        return await n.publish({ kind: KIND.post, tags: tags, content: opts.content || '', created_at: now() });
      }
      if (type === 'mention') { tags.push(['p', opts.to]); return await n.publish({ kind: KIND.post, tags: tags, content: opts.content || '', created_at: now() }); }
      tags.push(['rel', type, opts.to]); if (opts.toAuthor) tags.push(['p', opts.toAuthor]);
      return await n.publish({ kind: KIND.post, tags: tags, content: opts.content || '', created_at: now() });
    },
    // что ссылается на цель (ответы, реакции, типизированные связи)
    query: async function (opts) {
      opts = opts || {};
      var f = { limit: opts.limit || 200 };
      if (opts.to) f['#e'] = arr(opts.to);
      if (opts.type === 'react') f.kinds = [KIND.react];
      else if (opts.kinds) f.kinds = opts.kinds;
      return await n.query(f);
    },
  };

  // ---------- Policy: правила взаимодействия ----------
  // set — публикует адресуемое 31001 (нужна подпись владельца). can — КЛИЕНТСКАЯ
  // подсказка для UI; настоящую проверку делает сервер/реле.
  var policy = {
    set: async function (scope, rules) {
      var d = typeof scope === 'string' ? scope : (scope.id || scope.coord || 'global');
      var ev = await n.publish({ kind: KIND.policy, tags: [['d', d]], content: JSON.stringify(rules || {}), created_at: now() });
      return { scope: d, coord: coord(ev), rules: rules, event: ev };
    },
    get: async function (scope) {
      var d = typeof scope === 'string' ? scope : (scope.id || 'global');
      var f = { kinds: [KIND.policy], '#d': [d], limit: 1 };
      if (scope && scope.owner) f.authors = [scope.owner];
      var evs = await n.query(f);
      return evs[0] ? parse(evs[0]) : null;
    },
    can: async function (opts) {
      opts = opts || {};
      var rules = opts.rules || (opts.scope ? await policy.get(opts.scope) : null) || {};
      var action = opts.action || 'post';
      var need = (rules[action] && rules[action].minRep) || 0;
      if (!need) return { allowed: true };
      var rep = opts.rep;
      if (rep == null && typeof n.reputation === 'function') { try { rep = await n.reputation(opts.pubkey); } catch (e) {} }
      if (rep == null) return { allowed: true, hint: true, reason: 'репутация неизвестна, проверит сервер' };
      return { allowed: rep >= need, need: need, rep: rep };
    },
  };

  n.identity = identity;
  n.space = space;
  n.artifact = artifact;
  n.relation = relation;
  n.policy = policy;
  n.kinds = KIND;
  n.coord = coord;
  n.version = '1.0';
})();
