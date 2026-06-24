// SCZ — примитивы поверх сети (§08_APPLICATIONS): Identity, Space, Artifact, Relation.
// Приложения собираются из них, ядро (реле/подпись) не трогают. Kind'ы переиспользуют NIP,
// свои минтим только под Space/Page.
import { query, publish } from './relays.js';

export const KIND = { profile: 0, post: 1, space: 31000, page: 31002, appdata: 30078 };

const now = () => Math.floor(Date.now() / 1000);
const tagVal = (ev, k) => { const t = (ev.tags || []).find((x) => x[0] === k); return t ? t[1] : null; };
const parse = (ev) => { try { return JSON.parse((ev && ev.content) || '{}'); } catch { return {}; } };
const arr = (x) => (x == null ? [] : [].concat(x));
const coord = (ev) => ev.kind + ':' + ev.pubkey + ':' + (tagVal(ev, 'd') || '');
const latest = (evs) => { const by = {}; evs.forEach((e) => { const c = coord(e); if (!by[c] || e.created_at > by[c].created_at) by[c] = e; }); return Object.values(by); };

// ---- Identity ----
export const identity = {
  async profile(pubkey) {
    const evs = await query({ kinds: [KIND.profile], authors: [pubkey], limit: 1 });
    return evs[0] ? Object.assign({ pubkey }, parse(evs[0])) : { pubkey };
  },
  async setProfile(meta) {
    return publish({ kind: KIND.profile, tags: [], content: JSON.stringify(meta || {}), created_at: now() });
  },
};

// ---- Space ----
export const space = {
  async create({ title, about, type }) {
    const d = (String(title || 'space').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'space') + '-' + Math.random().toString(36).slice(2, 6);
    const tags = [['d', d], ['name', title || d]];
    if (type) tags.push(['type', type]);
    const ev = await publish({ kind: KIND.space, tags, content: JSON.stringify({ type: type || 'feed', title: title || d, about: about || '' }), created_at: now() });
    return { id: d, coord: coord(ev), title: title || d, owner: ev.pubkey, event: ev };
  },
  async list({ limit } = {}) {
    const evs = latest(await query({ kinds: [KIND.space], limit: limit || 100 }));
    return evs.map((e) => { const m = parse(e); return { id: tagVal(e, 'd'), coord: coord(e), title: m.title, about: m.about, owner: e.pubkey, created_at: e.created_at }; })
      .sort((a, b) => b.created_at - a.created_at);
  },
};

// ---- Artifact (содержимое) ----
export const artifact = {
  // key -> адресуемое (30078, версии по d-тегу); иначе обычный пост (1) с темой(и)
  async publish({ key, topic, content, tags, kind }) {
    const k = kind || (key ? KIND.appdata : KIND.post);
    const tg = arr(tags).slice();
    if (key) tg.push(['d', key]);
    arr(topic).forEach((t) => tg.push(['t', t]));
    return publish({ kind: k, tags: tg, content: typeof content === 'string' ? content : JSON.stringify(content || {}), created_at: now() });
  },
  async query({ kinds, topic, author, key, limit }) {
    const f = { limit: limit || 200, kinds: kinds || [KIND.post] };
    if (topic) f['#t'] = arr(topic);
    if (author) f.authors = arr(author);
    const evs = await query(f);
    return key ? latest(evs) : evs;
  },
};

export const util = { tagVal, parse, coord, now };
