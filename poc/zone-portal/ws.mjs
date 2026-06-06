// noet — минимальное Nostr-реле поверх WebSocket (RFC6455), без зависимостей.
//
// Говорит на NIP-01: клиент шлёт ["REQ",sub,...filters] / ["EVENT",ev] / ["CLOSE",sub],
// реле отвечает ["EVENT",sub,ev] / ["EOSE",sub] / ["OK",id,bool,msg].
// События — настоящие подписанные Nostr-события; подпись проверяет verify() (schnorr/BIP340).
// Хранилище — в памяти + дамп в relay-events.json (последние MAX).

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_EVENTS = 5000;
const MAX_CONTENT = 8000;

// ---------- хранилище событий ----------
export function makeRelay({ verify, file }) {
  let events = [];           // массив событий по возрастанию created_at
  const byId = new Set();    // дедуп
  const clients = new Set(); // активные сокеты-обёртки

  if (file && existsSync(file)) {
    try {
      const arr = JSON.parse(readFileSync(file, 'utf8'));
      for (const ev of arr) if (!byId.has(ev.id)) { byId.add(ev.id); events.push(ev); }
      events.sort((a, b) => a.created_at - b.created_at);
    } catch { /* битый дамп — игнор */ }
  }
  let saveTimer = null;
  const persist = () => {
    if (!file || saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; try { writeFileSync(file, JSON.stringify(events.slice(-MAX_EVENTS))); } catch {} }, 800);
  };

  const matches = (ev, f) => {
    if (f.ids && !f.ids.includes(ev.id)) return false;
    if (f.authors && !f.authors.includes(ev.pubkey)) return false;
    if (f.kinds && !f.kinds.includes(ev.kind)) return false;
    if (f.since && ev.created_at < f.since) return false;
    if (f.until && ev.created_at > f.until) return false;
    for (const k of Object.keys(f)) {
      if (k[0] !== '#') continue;
      const tag = k.slice(1), want = f[k];
      const got = (ev.tags || []).filter((t) => t[0] === tag).map((t) => t[1]);
      if (!want.some((v) => got.includes(v))) return false;
    }
    return true;
  };
  const queryFilters = (filters) => {
    const out = [];
    for (const ev of events) if (filters.some((f) => matches(ev, f))) out.push(ev);
    let limit = Math.min(...filters.map((f) => f.limit || MAX_EVENTS));
    if (!isFinite(limit)) limit = MAX_EVENTS;
    return out.slice(-limit);
  };

  async function ingest(ev) {
    if (!ev || typeof ev !== 'object') return [false, 'invalid: not an object'];
    if (typeof ev.content === 'string' && ev.content.length > MAX_CONTENT) return [false, 'invalid: content too long'];
    if (byId.has(ev.id)) return [true, 'duplicate'];
    let ok = false; try { ok = await verify(ev); } catch { ok = false; }
    if (!ok) return [false, 'invalid: signature'];
    byId.add(ev.id);
    events.push(ev);
    events.sort((a, b) => a.created_at - b.created_at);
    if (events.length > MAX_EVENTS) { const drop = events.splice(0, events.length - MAX_EVENTS); for (const d of drop) byId.delete(d.id); }
    persist();
    // рассылка по подпискам всех клиентов
    for (const c of clients) for (const [sub, filters] of c.subs) if (filters.some((f) => matches(ev, f))) c.send(['EVENT', sub, ev]);
    return [true, ''];
  }

  async function onMessage(client, raw) {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(msg)) return;
    const [type, ...rest] = msg;
    if (type === 'EVENT') {
      const ev = rest[0];
      const [ok, m] = await ingest(ev);
      client.send(['OK', (ev && ev.id) || '', ok, m]);
    } else if (type === 'REQ') {
      const sub = String(rest[0]);
      const filters = rest.slice(1).filter((f) => f && typeof f === 'object');
      client.subs.set(sub, filters.length ? filters : [{}]);
      for (const ev of queryFilters(client.subs.get(sub))) client.send(['EVENT', sub, ev]);
      client.send(['EOSE', sub]);
    } else if (type === 'CLOSE') {
      client.subs.delete(String(rest[0]));
    }
  }

  // ---------- приклеиваемся к http-серверу ----------
  function isRelay(req) {
    const host = (req.headers.host || '').toLowerCase().split(':')[0];
    if (host.startsWith('relay.')) return true;
    try { const u = new URL(req.url, 'http://x'); if (/^relay\./i.test(u.hostname) || u.pathname.startsWith('/relay')) return true; } catch {}
    return /relay\./i.test(req.url || '') || (req.url || '').startsWith('/relay');
  }

  function attach(server) {
    server.on('upgrade', (req, socket) => {
      if ((req.headers.upgrade || '').toLowerCase() !== 'websocket' || !isRelay(req)) { socket.destroy(); return; }
      const key = req.headers['sec-websocket-key'];
      if (!key) { socket.destroy(); return; }
      const accept = createHash('sha1').update(key + GUID).digest('base64');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
      );
      const client = { socket, subs: new Map(), send: (obj) => writeFrame(socket, JSON.stringify(obj)) };
      clients.add(client);
      let buf = Buffer.alloc(0);
      let frag = null; // сборка фрагментов: {op, chunks:[]}
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        for (;;) {
          const fr = readFrame(buf);
          if (!fr) break;
          buf = fr.rest;
          if (fr.opcode === 0x8) { try { socket.end(); } catch {} return; }       // close
          if (fr.opcode === 0x9) { writeFrame(socket, fr.payload, 0xA); continue; } // ping -> pong
          if (fr.opcode === 0xA) continue;                                          // pong
          if (fr.opcode === 0x0) { if (frag) frag.chunks.push(fr.payload); }         // continuation
          else { frag = { op: fr.opcode, chunks: [fr.payload] }; }
          if (fr.fin && frag) {
            const data = Buffer.concat(frag.chunks); const op = frag.op; frag = null;
            if (op === 0x1) onMessage(client, data.toString('utf8'));
          }
        }
      });
      const bye = () => { clients.delete(client); try { socket.destroy(); } catch {} };
      socket.on('close', bye); socket.on('error', bye);
    });
  }

  return { attach, ingest, queryFilters, stats: () => ({ events: events.length, clients: clients.size }) };
}

// ---------- кадрирование (RFC6455) ----------
function readFrame(buf) {
  if (buf.length < 2) return null;
  const b0 = buf[0], b1 = buf[1];
  const fin = (b0 & 0x80) !== 0, opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f, off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10; }
  let mask = null;
  if (masked) { if (buf.length < off + 4) return null; mask = buf.subarray(off, off + 4); off += 4; }
  if (buf.length < off + len) return null;
  let payload = Buffer.from(buf.subarray(off, off + len));
  if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  return { fin, opcode, payload, rest: buf.subarray(off + len) };
}
function writeFrame(socket, data, opcode = 0x1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.from([0x80 | opcode, len]); }
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  try { socket.write(Buffer.concat([header, payload])); } catch {}
}
