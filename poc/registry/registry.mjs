// СЦЗ — реестр имён (ВРЕМЯНКА для PoC, §4.3)
//
// ⚠️ Судья очерёдности здесь = ЭТОТ сервер, а значит его хозяин = ты.
//    Это сознательный временный компромисс «бесплатно-но-хозяин». Не продакшен.
//    Честный вариант без хозяина — смарт-контракт на L2 (см. §4.3, Фаза 2).
//
// Что автоматизировано: РАЗДАЧА имён (правило — код).
// Что НЕ автоматизировано: разбор споров «имя моё, а не его» — это людям (§4.3).
//
// Зависимостей нет: только встроенный node:http / node:fs.

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DB = join(__dir, 'registry.json');
const PORT = Number(process.env.REGISTRY_PORT || 5050);

// §4.4: резерв системных и односложных имён — только через «мультисиг», не «успел»
const RESERVED = new Set(['gov', 'core', 'admin', 'root', 'scz', 'sys', 'зона', 'zone', 'ядро', 'гов']);

const NAME_RE = /^([a-zа-яё0-9-]{1,32})\.(зона|zone)$/iu;
const labelOf = (name) => { const m = name.match(NAME_RE); return m ? m[1].toLowerCase() : null; };
const isReserved = (label) => RESERVED.has(label) || [...label].length === 1; // односложное = одна буква

function loadDB() {
  if (existsSync(DB)) return JSON.parse(readFileSync(DB, 'utf8'));
  const init = {
    note: 'ВРЕМЯНКА: судья очерёдности = этот сервер (хозяин = ты). Не продакшен. См. §4.3.',
    names: {},
  };
  writeFileSync(DB, JSON.stringify(init, null, 2));
  return init;
}
let db = loadDB();
const save = () => writeFileSync(DB, JSON.stringify(db, null, 2));

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(obj, null, 2));
};
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)); });

const server = http.createServer(async (req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { p = req.url; }

  if (req.method === 'GET' && p === '/health')
    return json(res, 200, { ok: true, note: db.note, count: Object.keys(db.names).length });

  if (req.method === 'GET' && p === '/names') return json(res, 200, db.names);

  if (req.method === 'GET' && p.startsWith('/resolve/')) {
    const name = p.slice('/resolve/'.length).toLowerCase();
    const rec = db.names[name];
    return rec ? json(res, 200, { name, ...rec }) : json(res, 404, { error: 'имя не зарегистрировано', name });
  }

  if (req.method === 'POST' && p === '/register') {
    let data; try { data = JSON.parse((await readBody(req)) || '{}'); } catch { return json(res, 400, { error: 'bad json' }); }
    const name = String(data.name || '').toLowerCase().trim();
    const cid = String(data.cid || '').trim();
    const owner = String(data.owner || 'anon').trim();
    const label = labelOf(name);
    if (!label) return json(res, 400, { error: 'имя должно быть вида label.зона', name });
    if (!cid) return json(res, 400, { error: 'нужен cid' });
    if (isReserved(label)) return json(res, 403, { error: 'системное/односложное имя — только через мультисиг (§4.4)', name });
    if (db.names[name]) return json(res, 409, { error: 'занято; первым пришёл — первым занял, судья очерёдности = сервер', name, current: db.names[name] });
    db.names[name] = { cid, owner, ts: Date.now(), judge: 'врёменный-сервер(хозяин=ты)' };
    save();
    return json(res, 201, { name, ...db.names[name] });
  }

  // Имитация решения мультисига: выдать резервное имя (§4.4 — «по решению, а не по успел»)
  if (req.method === 'POST' && p === '/admin/grant') {
    let data; try { data = JSON.parse((await readBody(req)) || '{}'); } catch { return json(res, 400, { error: 'bad json' }); }
    const name = String(data.name || '').toLowerCase().trim();
    const cid = String(data.cid || '').trim();
    const owner = String(data.owner || 'multisig').trim();
    if (!labelOf(name)) return json(res, 400, { error: 'имя должно быть вида label.зона', name });
    db.names[name] = { cid, owner, ts: Date.now(), judge: 'admin/grant(имитация-мультисига)' };
    save();
    return json(res, 201, { name, ...db.names[name] });
  }

  json(res, 404, { error: 'нет такого маршрута' });
});

server.listen(PORT, () => {
  console.log(`[registry] ВРЕМЯНКА на :${PORT} — судья очерёдности = ЭТОТ сервер (хозяин = ты).`);
  console.log(`[registry] Не продакшен. Честный вариант без хозяина — L2-контракт (§4.3).`);
});
