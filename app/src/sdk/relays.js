// SCZ — сетевой слой Фазы-0 (времянка §11): публичные Nostr-реле через WebSocket.
// query/subscribe/publish поверх них. Подпись — в Rust (signEvent). Целевое: libp2p
// GossipSub (§04), сюда же ляжет та же сигнатура query/publish/subscribe.
import { signEvent } from './identity.js';

export const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];

let _sid = 0;
const subId = () => 'scz' + (++_sid);

// Разовый запрос: открыть реле, REQ, собрать события до EOSE/таймаута, вернуть отсортированными.
export function query(filters, opts = {}) {
  const list = Array.isArray(filters) ? filters : [filters];
  const seen = new Map();
  let socks;
  try { socks = RELAYS.map((u) => new WebSocket(u)); } catch { return Promise.resolve([]); }
  const id = subId();
  return new Promise((resolve) => {
    let closed = 0, done = false;
    const fin = () => {
      if (done) return; done = true; clearTimeout(t);
      try { socks.forEach((w) => w.close()); } catch {}
      resolve([...seen.values()].sort((a, b) => b.created_at - a.created_at));
    };
    const t = setTimeout(fin, opts.timeout || 4500);
    socks.forEach((ws) => {
      ws.onopen = () => { try { ws.send(JSON.stringify(['REQ', id, ...list])); } catch {} };
      ws.onmessage = (m) => {
        try {
          const a = JSON.parse(m.data);
          if (a[0] === 'EVENT' && a[2]) { const ev = a[2]; if (!seen.has(ev.id)) seen.set(ev.id, ev); }
          else if (a[0] === 'EOSE') { try { ws.send(JSON.stringify(['CLOSE', id])); ws.close(); } catch {} if (++closed >= socks.length) fin(); }
        } catch {}
      };
      ws.onerror = () => { if (++closed >= socks.length) fin(); };
    });
  });
}

// Живая подписка: вызывает onEvent на каждое событие. Возвращает close().
export function subscribe(filters, onEvent, opts = {}) {
  const list = Array.isArray(filters) ? filters : [filters];
  const id = subId();
  const seen = new Set();
  let socks = [];
  try { socks = RELAYS.map((u) => new WebSocket(u)); } catch { return () => {}; }
  socks.forEach((ws) => {
    ws.onopen = () => { try { ws.send(JSON.stringify(['REQ', id, ...list])); } catch {} };
    ws.onmessage = (m) => {
      try {
        const a = JSON.parse(m.data);
        if (a[0] === 'EVENT' && a[1] === id && a[2]) { const ev = a[2]; if (!seen.has(ev.id)) { seen.add(ev.id); onEvent(ev); } }
      } catch {}
    };
    ws.onerror = () => {};
  });
  return () => { try { socks.forEach((w) => { try { w.send(JSON.stringify(['CLOSE', id])); } catch {} w.close(); }); } catch {} };
}

// Подписать (в Rust) и разослать. Возвращает подписанное событие.
export async function publish(template) {
  const ev = await signEvent(template);   // бросит no_key, если нет личности
  const msg = JSON.stringify(['EVENT', ev]);
  let socks;
  try { socks = RELAYS.map((u) => new WebSocket(u)); } catch { return ev; }
  await Promise.allSettled(socks.map((ws) => new Promise((res) => {
    const t = setTimeout(() => { try { ws.close(); } catch {} res(); }, 4500);
    ws.onopen = () => { try { ws.send(msg); } catch {} };
    ws.onmessage = (m) => { try { if (JSON.parse(m.data)[0] === 'OK') { clearTimeout(t); ws.close(); res(); } } catch {} };
    ws.onerror = () => { clearTimeout(t); res(); };
  })));
  return ev;
}

// Лёгкий публикатор для сигналинга звонка: своё соединение держим открытым отдельно.
// Возвращает { send(template), close() }. send подписывает в Rust и шлёт во все реле.
export function openSignal(filters, onEvent) {
  const id = subId();
  const seen = new Set();
  let socks = [];
  try { socks = RELAYS.map((u) => new WebSocket(u)); } catch {}
  socks.forEach((ws) => {
    ws.onopen = () => { try { ws.send(JSON.stringify(['REQ', id, ...(Array.isArray(filters) ? filters : [filters])])); } catch {} };
    ws.onmessage = (m) => { try { const a = JSON.parse(m.data); if (a[0] === 'EVENT' && a[1] === id && a[2]) { const ev = a[2]; if (!seen.has(ev.id)) { seen.add(ev.id); onEvent(ev); } } } catch {} };
    ws.onerror = () => {};
  });
  return {
    async send(template) {
      const ev = await signEvent(template);
      const msg = JSON.stringify(['EVENT', ev]);
      socks.forEach((w) => { try { if (w.readyState === 1) w.send(msg); } catch {} });
      return ev;
    },
    close() { try { socks.forEach((w) => { try { w.send(JSON.stringify(['CLOSE', id])); } catch {} w.close(); }); } catch {} },
  };
}
