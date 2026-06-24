// noet — имена без сервера (P5). Имя→владелец вычисляется КЛИЕНТОМ из подписанных
// заявок (kind 31111) на публичных реле; очерёдность якорится в Bitcoin через
// OpenTimestamps (бесплатно, без газа, без нашего сервера). Никакого доверенного
// судьи: самая ранняя проанкоренная заявка побеждает, считает любой одинаково.
//
// Модуль чистый и портативный (node для тестов + страница расширения). Хеши на чистом
// JS, чтобы работать и там, где нет crypto.subtle.
//
// Календари OTS возвращают на POST /digest сериализованный Timestamp над нашим
// дайджестом. Парсер реплеит операции (append/prepend/sha256/ripemd160) до аттестаций:
//   pending  → ссылка на календарь (ещё не в Bitcoin)
//   bitcoin  → высота блока; сверяем merkle с реальным блоком → доказанное время.

export const CALENDARS = ['https://alice.btc.calendar.opentimestamps.org', 'https://bob.btc.calendar.opentimestamps.org'];
export const BLOCK_APIS = ['https://blockstream.info/api', 'https://mempool.space/api'];
const PENDING = h2b('83dfe30d2ef90c8e'), BITCOIN = h2b('0588960d73d71901');

/* ---------- байты/хеши ---------- */
function h2b(h) { return Uint8Array.from(h.match(/.{2}/g).map((x) => parseInt(x, 16))); }
function b2h(u) { return Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join(''); }
function cat(a, b) { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; }
function eq(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
function b64dec(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function b64enc(u) { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }

const _K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
export function sha256(msg) {
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const l = msg.length, withOne = l + 1, pad = (56 - (withOne % 64) + 64) % 64, total = withOne + pad + 8;
  const m = new Uint8Array(total); m.set(msg); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(total - 8, Math.floor((l * 8) / 0x100000000), false); dv.setUint32(total - 4, (l * 8) >>> 0, false);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) { const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3); const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10); w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0; }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) { const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g); const t1 = (h + S1 + ch + _K[t] + w[t]) >>> 0; const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c); const t2 = (S0 + maj) >>> 0; h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32), dv2 = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => dv2.setUint32(i * 4, v >>> 0, false));
  return out;
}
// ripemd160 (нужен для реплея OTS-операций bitcoin-пути)
export function ripemd160(msg) {
  const rol = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
  const f = (j, x, y, z) => j < 16 ? (x ^ y ^ z) : j < 32 ? ((x & y) | (~x & z)) : j < 48 ? ((x | ~y) ^ z) : j < 64 ? ((x & z) | (y & ~z)) : (x ^ (y | ~z));
  const K = [0, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e], KK = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0];
  const r = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13];
  const rr = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11];
  const s = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6];
  const ss = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11];
  const l = msg.length, pad = (56 - ((l + 1) % 64) + 64) % 64, total = l + 1 + pad + 8;
  const m = new Uint8Array(total); m.set(msg); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(total - 8, (l * 8) >>> 0, true); dv.setUint32(total - 4, Math.floor((l * 8) / 0x100000000), true);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const X = new Uint32Array(16);
  for (let i = 0; i < total; i += 64) {
    for (let j = 0; j < 16; j++) X[j] = dv.getUint32(i + j * 4, true);
    let a = h0, b = h1, c = h2, d = h3, e = h4, A = h0, B = h1, C = h2, D = h3, E = h4;
    for (let j = 0; j < 80; j++) {
      const grp = Math.floor(j / 16);
      let t = (a + f(j, b, c, d) + X[r[j]] + K[grp]) >>> 0; t = (rol(t, s[j]) + e) >>> 0; a = e; e = d; d = rol(c, 10); c = b; b = t;
      let tt = (A + f(79 - j, B, C, D) + X[rr[j]] + KK[grp]) >>> 0; tt = (rol(tt, ss[j]) + E) >>> 0; A = E; E = D; D = rol(C, 10); C = B; B = tt;
    }
    const t = (h1 + c + D) >>> 0; h1 = (h2 + d + E) >>> 0; h2 = (h3 + e + A) >>> 0; h3 = (h4 + a + B) >>> 0; h4 = (h0 + b + C) >>> 0; h0 = t;
  }
  const out = new Uint8Array(20), o = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((v, i) => o.setUint32(i * 4, v >>> 0, true));
  return out;
}

/* ---------- разбор сериализованного OTS Timestamp ---------- */
function readVarint(buf, p) { let res = 0, shift = 0, b; do { b = buf[p.i++]; res += (b & 0x7f) * Math.pow(2, shift); shift += 7; } while (b & 0x80); return res; }
function parseTs(buf, p, msg, out) {
  for (;;) { if (buf[p.i] === 0xff) { p.i++; parseChild(buf, p, msg, out); continue; } parseChild(buf, p, msg, out); return; } }
function parseChild(buf, p, msg, out) {
  const tag = buf[p.i++];
  if (tag === 0x00) {
    const magic = buf.subarray(p.i, p.i + 8); p.i += 8;
    const len = readVarint(buf, p); const payload = buf.subarray(p.i, p.i + len); p.i += len;
    if (eq(magic, BITCOIN)) { const pp = { i: 0 }; out.push({ type: 'bitcoin', height: readVarint(payload, pp), merkle: msg.slice() }); }
    else if (eq(magic, PENDING)) { const pp = { i: 0 }; const ul = readVarint(payload, pp); out.push({ type: 'pending', uri: new TextDecoder().decode(payload.subarray(pp.i, pp.i + ul)), commitment: msg.slice() }); }
    return;
  }
  let m = msg;
  if (tag === 0xf0 || tag === 0xf1) { const len = readVarint(buf, p); const op = buf.subarray(p.i, p.i + len); p.i += len; m = tag === 0xf0 ? cat(msg, op) : cat(op, msg); }
  else if (tag === 0x08) m = sha256(msg);
  else if (tag === 0x03) m = ripemd160(msg);
  else throw new Error('ots op 0x' + tag.toString(16));
  parseTs(buf, p, m, out);
}
// разобрать «голый» Timestamp (ответ календаря /digest|/timestamp) над дайджестом
export function parseTimestamp(bytes, startDigest) { const out = []; parseTs(bytes, { i: 0 }, startDigest.slice(), out); return out; }

/* ---------- сеть (инъектируемая, чтобы тестить) ---------- */
const httpBytes = async (url, opts) => new Uint8Array(await (await fetch(url, opts)).arrayBuffer());
const httpJson = async (url) => (await fetch(url)).json();
const httpText = async (url) => (await fetch(url)).text();

// заштамповать дайджест: POST в календарь → сериализованный Timestamp (pending)
export async function otsStamp(digest, fetchBytes = httpBytes) {
  for (const cal of CALENDARS) {
    try {
      const proof = await fetchBytes(cal + '/digest', { method: 'POST', headers: { 'content-type': 'application/octet-stream', accept: 'application/octet-stream' }, body: digest });
      if (proof && proof.length) return { calendar: cal, proof: b64enc(proof) };
    } catch (e) { /* следующий календарь */ }
  }
  return null;
}

// доказанное время заявки (unix-сек) если OTS-proof уже в Bitcoin и сверен с блоком;
// иначе null (заявка ещё провизорная — анкеринг занимает часы)
export async function provenTime(digest, proofB64, net = {}) {
  const fetchBytes = net.fetchBytes || httpBytes, blockApis = net.blockApis || BLOCK_APIS;
  let atts; try { atts = parseTimestamp(b64dec(proofB64), digest); } catch (e) { return null; }
  let bt = atts.find((a) => a.type === 'bitcoin');
  if (!bt) {
    // апгрейд: спросить календарь про продолжение от commitment до Bitcoin
    const pend = atts.find((a) => a.type === 'pending'); if (!pend) return null;
    try {
      const cont = await fetchBytes(pend.uri.replace(/\/$/, '') + '/timestamp/' + b2h(pend.commitment));
      const catts = parseTimestamp(cont, pend.commitment);
      bt = catts.find((a) => a.type === 'bitcoin'); if (!bt) return null;
    } catch (e) { return null; }
  }
  // сверка: merkle из proof == merkle_root реального блока (в обратном порядке байт)
  const wantMerkle = b2h(bt.merkle.slice().reverse());
  for (const api of blockApis) {
    try {
      const hash = (await (net.fetchText || httpText)(api + '/block-height/' + bt.height)).trim();
      const blk = await (net.fetchJson || httpJson)(api + '/block/' + hash);
      if (blk && blk.merkle_root === wantMerkle) return blk.timestamp;
    } catch (e) { /* следующий api */ }
  }
  return null;
}

/* ---------- заявки и резолв ---------- */
export const claimEvent = (name, target) => ({ kind: 31111, tags: [['d', name], ['t', 'noet-name'], ['target', String(target || '')]], content: '' });
// proof в отдельном событии (подписывает кто угодно): e=id заявки, content=base64 OTS
export const proofEvent = (name, claimId, proofB64) => ({ kind: 31112, tags: [['d', name], ['e', claimId]], content: proofB64 });
const tag = (ev, k) => (((ev.tags || []).find((t) => t[0] === k) || [])[1]) || '';
export const claimOwner = (ev) => ({ owner: ev.pubkey, target: tag(ev, 'target'), claim: ev });

// имя→владелец из заявок на публичных реле, КЛИЕНТСКИ. Один претендент → он владелец.
// Коллизия → самая ранняя проанкоренная в Bitcoin побеждает; провизорные позади;
// ничья → меньший id. Судьи/сервера нет.
export async function resolveName(name, opts) {
  const claims = (await opts.query({ kinds: [31111], '#d': [name], limit: 50 })) || [];
  const valid = [];
  for (const ev of claims) { if (tag(ev, 'd') !== name) continue; if (opts.verifySig && !(await opts.verifySig(ev))) continue; valid.push(ev); }
  if (!valid.length) return null;
  if (valid.length === 1) return claimOwner(valid[0]);
  // OTS-proof лежит в ОТДЕЛЬНОМ событии 31112 (e=id заявки), чтобы не ломать подпись
  // заявки и чтобы апгрейдить proof мог кто угодно
  const proofs = {};
  const pevs = (await opts.query({ kinds: [31112], '#d': [name], limit: 100 })) || [];
  for (const pe of pevs) { const cid = tag(pe, 'e'); if (cid && pe.content && !proofs[cid]) proofs[cid] = pe.content; }
  const pt = opts.provenTime || provenTime;   // хук для тестов; в проде — реальная проверка
  const ranked = [];
  for (const ev of valid) {
    const proof = proofs[ev.id];
    let t = null; if (proof) t = await Promise.resolve(pt(h2b(ev.id), proof, opts.net || {})).catch(() => null);
    ranked.push({ ev, t });
  }
  ranked.sort((a, b) => { const at = a.t == null ? Infinity : a.t, btt = b.t == null ? Infinity : b.t; if (at !== btt) return at - btt; return a.ev.id < b.ev.id ? -1 : 1; });
  return claimOwner(ranked[0].ev);
}

export const _util = { h2b, b2h, b64enc, b64dec };
