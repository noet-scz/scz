// noet — провайдер window.nostr (NIP-07), MAIN-мир content script. Определяет
// window.nostr в странице; реальная подпись и ключ — в bridge.js (ISOLATED-мир),
// сюда возвращается только результат. Любая страница noet (и сторонние Nostr-приложения)
// получают личность через стандартный window.nostr.
(() => {
  if (window.nostr) return;            // уже есть провайдер (например другой NIP-07) — не трогаем
  let seq = 0;
  const pending = new Map();

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.__noetNostr !== 'res') return;
    const p = pending.get(d.id); if (!p) return;
    pending.delete(d.id);
    if (d.error) p.reject(new Error(d.error)); else p.resolve(d.result);
  });

  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    window.postMessage({ __noetNostr: 'req', id, method, params }, '*');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('noet: таймаут')); } }, 120000);
  });

  window.nostr = {
    getPublicKey: () => call('getPublicKey'),
    signEvent: (event) => call('signEvent', event),
    getRelays: () => call('getRelays'),
    nip04: {
      encrypt: () => Promise.reject(new Error('nip04 не поддержан')),
      decrypt: () => Promise.reject(new Error('nip04 не поддержан')),
    },
    _noet: true,
  };
})();
