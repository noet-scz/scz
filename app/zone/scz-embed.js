// SCZ — мост для опубликованных сайтов и игр. Инжектится в их HTML. Даёт window.nostr
// (подпись через локальный узел) и window.noet (данные на реле). Тот же origin (узел),
// поэтому fetch к /api/* работает напрямую.
(function () {
  if (window.nostr && window.noet) return;
  var RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
  window.nostr = window.nostr || {
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
  window.noet = window.noet || { me: function () { return window.nostr.getPublicKey().then(function (pk) { return { pubkey: pk }; }); }, publish: publish, query: query, relays: RELAYS.slice() };
})();
