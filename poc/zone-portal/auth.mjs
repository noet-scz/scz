// СЦЗ — авторизация: личность = Nostr-ключ, гейт на участие.
//
// Вход: клиент подписывает Nostr-событие (kind 22242, NIP-42-стиль) с тегом
// ["challenge", <выданный сервером challenge>]. Сервер проверяет:
//   id == sha256(serialize(event)) и schnorr.verify(sig, id, pubkey) и challenge свеж.
// Новый pubkey => регистрация: нужен свободный инвайт + уникальный хэндл.
// Привратник (кто раздаёт инвайты) = основатель — ВРЕМЯНКА, хозяин назван (§2.1).

import { schnorr } from './vendor/noble-secp256k1.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHmac, createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MEMBERS = process.env.MEMBERS_FILE || join(__dir, 'members.json');
const INVITES = process.env.INVITES_FILE || join(__dir, 'invites.json');
const SECRET_FILE = join(__dir, '.session-secret');

const HANDLE_RE = /^[a-z0-9_]{2,20}$/;
const CHALLENGE_TTL = 5 * 60 * 1000;        // 5 мин
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 дней

const load = (f, def) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : def);
let members = load(MEMBERS, {}); // pubkeyHex -> {handle, ts, invitedBy}
let invites = load(INVITES, {}); // code -> {createdBy, usedBy|null, ts}
const saveMembers = () => writeFileSync(MEMBERS, JSON.stringify(members, null, 2));
const saveInvites = () => writeFileSync(INVITES, JSON.stringify(invites, null, 2));

const SECRET = existsSync(SECRET_FILE) ? readFileSync(SECRET_FILE) : (() => { const s = randomBytes(32); writeFileSync(SECRET_FILE, s); return s; })();
const mac = (s) => createHmac('sha256', SECRET).update(s).digest('hex');
const sha256hex = (buf) => createHash('sha256').update(buf).digest('hex');
const hexToBytes = (h) => Uint8Array.from(h.match(/.{1,2}/g).map((b) => parseInt(b, 16)));

// ---- challenge (stateless, подписан HMAC) ----
export function newChallenge() {
  const body = `${randomBytes(16).toString('hex')}.${Date.now() + CHALLENGE_TTL}`;
  return `${body}.${mac('chal:' + body)}`;
}
function challengeOk(c) {
  if (typeof c !== 'string') return false;
  const p = c.split('.'); if (p.length !== 3) return false;
  if (mac('chal:' + p[0] + '.' + p[1]) !== p[2]) return false;
  return Date.now() <= Number(p[1]);
}

// ---- сессия (stateless, подписана HMAC) ----
const makeSession = (pubkey) => { const body = `${pubkey}.${Date.now() + SESSION_TTL}`; return `${body}.${mac('sess:' + body)}`; };
export function sessionPubkey(token) {
  if (!token) return null;
  const p = String(token).split('.'); if (p.length !== 3) return null;
  if (mac('sess:' + p[0] + '.' + p[1]) !== p[2]) return null;
  if (Date.now() > Number(p[1])) return null;
  return p[0];
}

// ---- проверка Nostr-события ----
function eventId(ev) {
  return sha256hex(Buffer.from(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags || [], ev.content || '']), 'utf8'));
}
async function verifyEvent(ev) {
  if (!ev || typeof ev !== 'object' || !ev.pubkey || !ev.id || !ev.sig) return false;
  if (eventId(ev) !== ev.id) return false;
  try { return await schnorr.verify(hexToBytes(ev.sig), hexToBytes(ev.id), hexToBytes(ev.pubkey)); } catch { return false; }
}

// ---- API ----
export async function login({ event, handle, invite }) {
  if (!(await verifyEvent(event))) return { code: 401, error: 'подпись не прошла', errcode: 'bad_sig' };
  const ch = ((event.tags || []).find((t) => t[0] === 'challenge') || [])[1];
  if (!challengeOk(ch)) return { code: 401, error: 'challenge невалиден или протух', errcode: 'bad_challenge' };
  const pubkey = event.pubkey;
  let m = members[pubkey];
  if (!m) {
    handle = String(handle || '').toLowerCase().trim();
    // пустой хэндл = тихая проверка «этот ключ участник?»; не ошибка для показа
    if (!handle) return { code: 401, error: 'ключ ещё не зарегистрирован', errcode: 'need_register' };
    if (!HANDLE_RE.test(handle)) return { code: 400, error: 'хэндл: 2–20 символов [a-z0-9_]', errcode: 'bad_handle' };
    if (Object.values(members).some((x) => x.handle === handle)) return { code: 409, error: 'хэндл занят', errcode: 'handle_taken' };
    // инвайт необязателен (открытая регистрация); если дан — гасим его
    let invitedBy = 'open';
    if (invite) {
      const inv = invites[invite];
      if (!inv || inv.usedBy) return { code: 403, error: 'инвайт неверный или уже использован', errcode: 'invite_invalid' };
      inv.usedBy = pubkey; inv.usedTs = Date.now(); saveInvites(); invitedBy = inv.createdBy || 'founder';
    }
    m = members[pubkey] = { handle, ts: Date.now(), invitedBy };
    saveMembers();
    return { ok: true, token: makeSession(pubkey), pubkey, handle, registered: true };
  }
  return { ok: true, token: makeSession(pubkey), pubkey, handle: m.handle, registered: false };
}

export function me(token) {
  const pk = sessionPubkey(token); if (!pk) return null;
  const m = members[pk]; if (!m) return null;
  return { pubkey: pk, handle: m.handle, since: m.ts };
}

export function createInvite(by = 'founder') {
  const code = randomBytes(6).toString('hex');
  invites[code] = { createdBy: by, usedBy: null, ts: Date.now() };
  saveInvites();
  return code;
}
export const handleOf = (pubkey) => (members[pubkey] || {}).handle || null;
export const allMembers = () => members;   // читается gov-модулем (репутация/доступы)
export const pubkeyOfHandle = (handle) => { const e = Object.entries(members).find(([, m]) => m.handle === handle); return e ? e[0] : null; };
export const allHandles = () => Object.fromEntries(Object.entries(members).map(([pk, m]) => [pk, m.handle]));
export const stats = () => ({ members: Object.keys(members).length, invitesFree: Object.values(invites).filter((i) => !i.usedBy).length });

// Проверка произвольного Nostr-события (для реле): id == sha256(serialize) и schnorr.verify.
export const verifyNostr = (ev) => verifyEvent(ev);
