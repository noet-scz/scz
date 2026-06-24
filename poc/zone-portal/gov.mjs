// noet — управление: поручительства, доступы, репутация. Только роль реестра.
//
// Всё это подписанные Nostr-события; реестр их проверяет и хранит в gov.json:
//   8001 поручительство          (p = за кого)
//   8002 отзыв поручительства    (p = за кого)
//   8010 доступ                  (p = кому, scope = что, until = до когда unix, redelegate = "1")
//   8011 отзыв доступа           (e = id события-доступа)
//   8020 запрос инвайта          (одноразовый, свежий)
//
// Правила открыты и детерминированы: /api/gov отдаёт всё, /api/people — разбор
// репутации, /api/export — полную копию (право форка). Репутация гейтит ЁМКОСТЬ
// (квоту, поддомены, право ручаться и получать доступ), но НЕ власть над правилами
// (концепция §5: иначе плутократия). Владелец экземпляра назван явно (§2.1).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// «Законы» — числа правил. Меняются правкой кода держателями доступа (см. манифест).
export const LAW = {
  vouchMinRep: 5,      // ручаться можно с такой репутацией (вес ниже неё не считается)
  granteeMinRep: 3,    // получать доступ не от владельца можно с такой
  maxChain: 3,         // глубина передачи доступа дальше
  vouchWeight: 0.25,   // вклад поручителя = его репутация * это, в пределах [1..10]
  iter: 3,             // итераций пересчёта весов (фиксировано = детерминировано)
  tenureStep: 0.5,     // + за каждый полный месяц стажа (потолок 12 месяцев)
  siteScore: 2,        // + за живой сайт (не заглушку), считаются максимум 3
  decayDays: 120,      // дольше без активности — репутация делится на 2
  quotaBaseMB: 5, quotaPerRep: 1, quotaMaxMB: 100,   // квота публикации, МБ
  subsBase: 1, subsPerRep: 5,                        // поддоменов: 1 + репутация/5
  inviteFreshSec: 600, // свежесть подписанного запроса инвайта
};

export const SCOPES = { invite: 'выдавать инвайты', 'relay.mod': 'модерация реле' }; // + zone:<имя.nt>

export function makeGov({ verify, members, handleOf, file }) {
  let db = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  db.vouches ||= []; db.delegations ||= []; db.revocations ||= []; db.usedInvites ||= [];
  const save = () => writeFileSync(file, JSON.stringify(db, null, 2));
  const dup = (arr, id) => arr.some((e) => e.id === id);
  const tag = (ev, name) => (((ev.tags || []).find((t) => t[0] === name) || [])[1]) || '';

  // владелец экземпляра: задан явно, иначе самый ранний участник (форкер своего
  // экземпляра автоматически владелец — машина-то его)
  function owner() {
    if (db.owner) return db.owner;
    let best = null, ts = Infinity;
    for (const [pk, m] of Object.entries(members())) if ((m.ts || 0) < ts) { best = pk; ts = m.ts || 0; }
    return best;
  }
  const isOwner = (pk) => !!pk && pk === owner();

  const revoked = () => new Set(db.revocations.map((r) => tag(r, 'e')));

  // доступ действителен: не отозван, не истёк, а выдавший — владелец или сам держит
  // этот scope по живой цепочке с правом передачи (глубина ограничена, циклы отсечены)
  function delegationValid(d, depth = 0, seen = new Set()) {
    if (depth > LAW.maxChain || seen.has(d.id)) return false;
    seen.add(d.id);
    if (revoked().has(d.id)) return false;
    const until = Number(tag(d, 'until') || 0);
    if (until && Date.now() / 1000 > until) return false;
    if (isOwner(d.pubkey)) return true;
    const scope = tag(d, 'scope');
    return db.delegations.some((p) => p.id !== d.id && tag(p, 'p') === d.pubkey && tag(p, 'scope') === scope
      && tag(p, 'redelegate') === '1' && p.created_at <= d.created_at && delegationValid(p, depth + 1, seen));
  }
  const activeDelegations = () => db.delegations.filter((d) => delegationValid(d));
  function scopesOf(pk) {
    const out = new Set();
    for (const d of activeDelegations()) if (tag(d, 'p') === pk) out.add(tag(d, 'scope'));
    return [...out];
  }
  const hasScope = (pk, scope) => isOwner(pk) || activeDelegations().some((d) => tag(d, 'p') === pk && tag(d, 'scope') === scope);
  const canRedelegate = (pk, scope) => isOwner(pk) || activeDelegations().some((d) => tag(d, 'p') === pk && tag(d, 'scope') === scope && tag(d, 'redelegate') === '1');

  // активные поручительства: по паре (кто → за кого) последнее слово решает (8001/8002)
  function activeVouches() {
    const last = new Map();
    for (const v of db.vouches) {
      const k = v.pubkey + '>' + tag(v, 'p');
      const cur = last.get(k);
      // >= : при равной секунде побеждает добавленное позже (порядок в журнале)
      if (!cur || v.created_at >= cur.created_at) last.set(k, v);
    }
    return [...last.values()].filter((v) => v.kind === 8001);
  }

  // репутация: чистая функция от публичных данных (участники, поручительства, имена).
  // Sybil-пол: вес поручителя считается только если его репутация >= vouchMinRep
  // (владелец — всегда: доверие к нему по построению, и это названо, а не спрятано).
  function reputation(regNames) {
    const mem = members(); const now = Date.now();
    const sitesOf = {}, lastNameTs = {};
    for (const r of Object.values(regNames || {})) {
      if (!r.owner || !mem[r.owner]) continue;
      if (!(r.raw && r.raw.placeholder)) sitesOf[r.owner] = (sitesOf[r.owner] || 0) + 1;
      lastNameTs[r.owner] = Math.max(lastNameTs[r.owner] || 0, r.ts || 0);
    }
    const base = {}, bd = {};
    for (const [pk, m] of Object.entries(mem)) {
      const tenure = Math.min(12, Math.floor((now - (m.ts || now)) / (30 * 864e5))) * LAW.tenureStep;
      const sites = Math.min(3, sitesOf[pk] || 0) * LAW.siteScore;
      base[pk] = 1 + tenure + sites;
      bd[pk] = { base: 1, tenure, sites, vouches: [] };
    }
    const av = activeVouches().filter((v) => mem[v.pubkey] && mem[tag(v, 'p')]);
    const counts = (r, from) => isOwner(from) || (r[from] || 0) >= LAW.vouchMinRep;
    const weight = (r, from) => Math.min(10, Math.max(1, (r[from] || 0) * LAW.vouchWeight));
    let r = { ...base };
    for (let i = 0; i < LAW.iter; i++) {
      const next = { ...base };
      for (const v of av) if (counts(r, v.pubkey)) next[tag(v, 'p')] += weight(r, v.pubkey);
      r = next;
    }
    const lastEvTs = {};
    for (const e of db.vouches.concat(db.delegations)) lastEvTs[e.pubkey] = Math.max(lastEvTs[e.pubkey] || 0, (e.created_at || 0) * 1000);
    const out = {};
    for (const pk of Object.keys(mem)) {
      for (const v of av) if (tag(v, 'p') === pk && counts(r, v.pubkey))
        bd[pk].vouches.push({ from: handleOf(v.pubkey) || v.pubkey.slice(0, 8), weight: +weight(r, v.pubkey).toFixed(1) });
      const lastAct = Math.max(mem[pk].ts || 0, lastNameTs[pk] || 0, lastEvTs[pk] || 0);
      const idle = now - lastAct > LAW.decayDays * 864e5;
      out[pk] = { score: +((idle ? r[pk] / 2 : r[pk])).toFixed(1), ...bd[pk], idle };
    }
    return out;
  }

  // ёмкость из репутации (владелец без лимитов: это его машина, и это сказано прямо)
  function capacity(pk, regNames) {
    if (isOwner(pk)) return { rep: null, quotaMB: Infinity, maxSubs: Infinity, canVouch: true, canReceive: true, owner: true };
    const rep = (reputation(regNames)[pk] || { score: 0 }).score;
    return {
      rep,
      quotaMB: Math.min(LAW.quotaMaxMB, LAW.quotaBaseMB + Math.floor(rep * LAW.quotaPerRep)),
      maxSubs: LAW.subsBase + Math.floor(rep / LAW.subsPerRep),
      canVouch: rep >= LAW.vouchMinRep,
      canReceive: rep >= LAW.granteeMinRep,
    };
  }

  async function checkEvent(ev, kinds) {
    if (!ev || !kinds.includes(ev.kind)) return 'не то событие';
    if (!members()[ev.pubkey]) return 'автор не участник';
    if (!(await verify(ev))) return 'подпись не прошла';
    return null;
  }

  return {
    owner, isOwner, hasScope, canRedelegate, scopesOf, reputation, capacity,
    setOwner(pk) { db.owner = pk; save(); },

    async addVouch(ev, regNames) {
      const bad = await checkEvent(ev, [8001, 8002]); if (bad) return { error: bad };
      const to = tag(ev, 'p');
      if (!members()[to]) return { error: 'этот ключ не участник' };
      if (to === ev.pubkey) return { error: 'за себя ручаться нельзя' };
      if (ev.kind === 8001 && !capacity(ev.pubkey, regNames).canVouch) return { error: `ручаться можно с репутацией ${LAW.vouchMinRep}` };
      if (dup(db.vouches, ev.id)) return { error: 'дубль' };
      db.vouches.push(ev); save();
      return { ok: true };
    },

    async addDelegation(ev, regNames) {
      const bad = await checkEvent(ev, [8010]); if (bad) return { error: bad };
      const to = tag(ev, 'p'), scope = tag(ev, 'scope');
      if (!scope) return { error: 'не указан доступ' };
      if (!members()[to]) return { error: 'этот ключ не участник' };
      if (to === ev.pubkey) return { error: 'самому себе не нужно' };
      if (!canRedelegate(ev.pubkey, scope)) return { error: 'у тебя нет права выдавать этот доступ' };
      if (!isOwner(ev.pubkey) && !capacity(to, regNames).canReceive) return { error: `получать доступ можно с репутацией ${LAW.granteeMinRep}` };
      if (dup(db.delegations, ev.id)) return { error: 'дубль' };
      db.delegations.push(ev); save();
      return { ok: true };
    },

    async addRevocation(ev) {
      const bad = await checkEvent(ev, [8011]); if (bad) return { error: bad };
      const target = db.delegations.find((d) => d.id === tag(ev, 'e'));
      if (!target) return { error: 'нет такого доступа' };
      if (!(isOwner(ev.pubkey) || target.pubkey === ev.pubkey)) return { error: 'отозвать может выдавший или владелец' };
      if (dup(db.revocations, ev.id)) return { error: 'дубль' };
      db.revocations.push(ev); save();
      return { ok: true };
    },

    // подписанный одноразовый запрос инвайта от держателя доступа 'invite'
    async useInviteEvent(ev) {
      const bad = await checkEvent(ev, [8020]); if (bad) return { error: bad };
      if (Math.abs(Date.now() / 1000 - (ev.created_at || 0)) > LAW.inviteFreshSec) return { error: 'запрос протух, подпиши заново' };
      if (db.usedInvites.includes(ev.id)) return { error: 'этот запрос уже использован' };
      if (!hasScope(ev.pubkey, 'invite')) return { error: 'нет доступа к инвайтам' };
      db.usedInvites.push(ev.id);
      if (db.usedInvites.length > 5000) db.usedInvites = db.usedInvites.slice(-2000);
      save();
      return { ok: true, by: handleOf(ev.pubkey) || ev.pubkey };
    },

    publicState() {
      const o = owner();
      return {
        owner: { pubkey: o, handle: handleOf(o) || null },
        law: LAW,
        scopes: SCOPES,
        delegations: activeDelegations().map((d) => ({
          id: d.id, from: handleOf(d.pubkey) || d.pubkey, to: handleOf(tag(d, 'p')) || tag(d, 'p'),
          from_pk: d.pubkey, to_pk: tag(d, 'p'), scope: tag(d, 'scope'),
          until: Number(tag(d, 'until') || 0) || null, redelegate: tag(d, 'redelegate') === '1', ts: d.created_at,
        })),
        vouches: activeVouches().map((v) => ({
          from: handleOf(v.pubkey) || v.pubkey, to: handleOf(tag(v, 'p')) || tag(v, 'p'),
          from_pk: v.pubkey, to_pk: tag(v, 'p'), ts: v.created_at,
        })),
      };
    },
    raw: () => db,
  };
}
