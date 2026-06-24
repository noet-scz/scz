// noet — window.noet: тонкий слой данных для страниц-приложений (доски, блоги, игры).
// Поверх window.nostr (подпись) + публичные wss-реле (хранение). Данные привязаны к
// ключу пользователя и портативны. Инжектится в MAIN-мир, как window.nostr.
(() => {
  if (window.noet) return;
  const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];

  const open = () => RELAYS.map((u) => { try { return new WebSocket(u); } catch { return null; } }).filter(Boolean);

  async function me() {
    if (!window.nostr) throw new Error('noet: расширение не активно');
    return { pubkey: await window.nostr.getPublicKey() };
  }

  // подписать через расширение и разослать в реле
  async function publish(event) {
    if (!window.nostr) throw new Error('noet: расширение не активно');
    const signed = await window.nostr.signEvent(event);
    const msg = JSON.stringify(['EVENT', signed]);
    const socks = open();
    await Promise.allSettled(socks.map((ws) => new Promise((res) => {
      const t = setTimeout(() => { try { ws.close(); } catch {} res(); }, 4500);
      ws.onopen = () => { try { ws.send(msg); } catch {} };
      ws.onmessage = (m) => { try { const a = JSON.parse(m.data); if (a[0] === 'OK') { clearTimeout(t); ws.close(); res(); } } catch {} };
      ws.onerror = () => { clearTimeout(t); res(); };
    })));
    return signed;
  }

  // запрос событий по фильтрам Nostr (kinds/authors/#tag/...), дедуп по id
  function query(filters, opts = {}) {
    const timeout = opts.timeout || 4500;
    const list = Array.isArray(filters) ? filters : [filters];
    const seen = new Map();
    const socks = open();
    return new Promise((resolve) => {
      let closed = 0;
      const finish = () => { try { socks.forEach((w) => w.close()); } catch {} resolve([...seen.values()].sort((a, b) => b.created_at - a.created_at)); };
      const t = setTimeout(finish, timeout);
      socks.forEach((ws) => {
        ws.onopen = () => { try { ws.send(JSON.stringify(['REQ', 'q', ...list])); } catch {} };
        ws.onmessage = (m) => { try { const a = JSON.parse(m.data); if (a[0] === 'EVENT') { const ev = a[2]; if (ev && !seen.has(ev.id)) seen.set(ev.id, ev); } else if (a[0] === 'EOSE') { ws.close(); if (++closed >= socks.length) { clearTimeout(t); finish(); } } } catch {} };
        ws.onerror = () => { if (++closed >= socks.length) { clearTimeout(t); finish(); } };
      });
    });
  }

  window.noet = { me, publish, query, relays: RELAYS.slice() };
})();
