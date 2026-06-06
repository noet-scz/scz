// СЦЗ — резолвер (слой доступа, §4.5)
//
// Открыть страницу по ИМЕНИ, а не по хешу:
//   имя  --(реестр)-->  CID  --(локальный узел IPFS)-->  страница
//
// Контент тянется через ЛОКАЛЬНЫЙ узел (RPC API :5001), БЕЗ публичных шлюзов
// (§4.5: «прямое обращение к IPFS без гейтвеев»). ipfs.io/dweb.link не участвуют.
//
// Зависимостей нет: node:http + встроенный fetch (Node 18+).

import http from 'node:http';

const PORT = Number(process.env.RESOLVER_PORT || 8088);
const REGISTRY = process.env.REGISTRY_URL || 'http://127.0.0.1:5050';
const IPFS_API = process.env.IPFS_API || 'http://127.0.0.1:5001'; // локальный узел, не публичный шлюз

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function indexPage(res) {
  let names = {};
  try { names = await (await fetch(`${REGISTRY}/names`)).json(); } catch { /* реестр недоступен */ }
  const items = Object.entries(names)
    .map(([n, r]) => `<li><a href="/${encodeURIComponent(n)}">${esc(n)}</a> &rarr; <code>${esc(r.cid)}</code></li>`)
    .join('') || '<li><i>реестр пуст</i></li>';
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset=utf-8><title>СЦЗ · резолвер</title>
<body style="font:16px/1.6 system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1rem;background:#0f1115;color:#e6e6e6">
<h1>СЦЗ · резолвер (PoC)</h1>
<p>имя &rarr; CID (реестр-времянка) &rarr; IPFS (локальный узел, без публичных шлюзов)</p>
<ul>${items}</ul>`);
}

const server = http.createServer(async (req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '').trim(); }
  catch { name = ''; }

  if (!name) return indexPage(res);

  // 1) имя -> CID через реестр
  let cid;
  try {
    const r = await fetch(`${REGISTRY}/resolve/${encodeURIComponent(name.toLowerCase())}`);
    if (!r.ok) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><meta charset=utf-8><h1>404</h1><p>имя <b>${esc(name)}</b> не зарегистрировано в реестре</p>`);
    }
    cid = (await r.json()).cid;
  } catch {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('реестр недоступен');
  }

  // 2) CID -> страница через локальный узел (RPC cat, без гейтвеев)
  try {
    const ipfs = await fetch(`${IPFS_API}/api/v0/cat?arg=${encodeURIComponent(cid + '/index.html')}`, { method: 'POST' });
    const buf = Buffer.from(await ipfs.arrayBuffer());
    if (!ipfs.ok) {
      res.writeHead(504, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end(`узел не отдал контент (${ipfs.status}): ${buf.toString('utf8').slice(0, 200)}`);
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-scz-name': encodeURIComponent(name), 'x-scz-cid': cid });
    return res.end(buf);
  } catch {
    res.writeHead(504, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('локальный IPFS-узел недоступен (запущен ли daemon?)');
  }
});

server.listen(PORT, () => {
  console.log(`[resolver] :${PORT} → реестр ${REGISTRY} → IPFS ${IPFS_API} (без публичных шлюзов)`);
});
