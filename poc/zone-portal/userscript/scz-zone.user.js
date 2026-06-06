// ==UserScript==
// @name         СЦЗ — зона (резолвер + поиск)
// @namespace    scz.zone
// @version      0.1
// @description  Резолвер имён *.зона и поиск по самоуправляемой цифровой зоне СЦЗ прямо в браузере
// @author       СЦЗ
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      __PORTAL_HOST__
// @run-at       document-idle
// @noframes
// ==/UserScript==
(function () {
  'use strict';
  const PORTAL = '__PORTAL_BASE__';
  const ZONE_RE = /\.(зона|zone)$/i;

  // --- запрос к порталу (обходит mixed-content и CORS) ---
  function gmGet(path) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET', url: PORTAL + path, timeout: 20000,
        onload: (r) => resolve({ status: r.status, text: r.responseText }),
        onerror: () => resolve({ status: 0, text: '' }),
        ontimeout: () => resolve({ status: 0, text: '' }),
      });
    });
  }

  // --- стили ---
  try {
    GM_addStyle(`
      #scz-fab{position:fixed;right:18px;bottom:18px;width:52px;height:52px;border-radius:50%;
        background:#7c5cff;color:#fff;font-size:24px;display:grid;place-items:center;cursor:pointer;
        z-index:2147483646;box-shadow:0 6px 20px rgba(0,0,0,.45);user-select:none}
      #scz-fab:hover{filter:brightness(1.1)}
      #scz-ov{position:fixed;inset:0;background:rgba(8,9,12,.72);z-index:2147483647;display:none}
      #scz-panel{position:absolute;top:0;right:0;width:min(560px,100%);height:100%;background:#0f1115;
        color:#e7e9ee;font:15px/1.5 system-ui,sans-serif;box-shadow:-8px 0 30px rgba(0,0,0,.5);
        display:flex;flex-direction:column}
      #scz-panel *{box-sizing:border-box}
      .scz-hd{padding:14px 16px;border-bottom:1px solid #262b36;display:flex;gap:8px;align-items:center}
      .scz-hd b{font-size:16px}.scz-x{margin-left:auto;cursor:pointer;color:#9aa3b2;font-size:20px}
      .scz-row{display:flex;gap:8px;padding:10px 16px}
      .scz-row input{flex:1;background:#171a21;border:1px solid #262b36;border-radius:9px;color:#e7e9ee;padding:9px 12px;font-size:14px}
      .scz-row button{background:#7c5cff;border:0;border-radius:9px;color:#fff;padding:0 14px;cursor:pointer}
      #scz-body{flex:1;overflow:auto;padding:0 16px 16px}
      .scz-item{background:#171a21;border:1px solid #262b36;border-radius:10px;padding:11px 13px;margin:8px 0;cursor:pointer}
      .scz-item:hover{border-color:#7c5cff}
      .scz-item .t{color:#b9a8ff;font-size:15px}.scz-item .u{color:#9aa3b2;font-size:12px;margin:2px 0}
      .scz-item .s{color:#cdd2db;font-size:13px;margin-top:3px}
      #scz-view{width:100%;height:100%;border:1px solid #262b36;border-radius:10px;background:#fff;display:none}
      .scz-mut{color:#9aa3b2;padding:10px 0;font-size:13px}
    `);
  } catch (e) { /* строгий CSP — стили частично */ }

  // --- разметка виджета ---
  const fab = document.createElement('div');
  fab.id = 'scz-fab'; fab.textContent = '⬡'; fab.title = 'Зона СЦЗ (Alt+Z)';
  const ov = document.createElement('div'); ov.id = 'scz-ov';
  ov.innerHTML = `
    <div id="scz-panel">
      <div class="scz-hd"><b>⬡ Зона СЦЗ</b><span class="scz-x" id="scz-close">✕</span></div>
      <div class="scz-row">
        <input id="scz-addr" placeholder="имя.зона — открыть напрямую">
        <button id="scz-go">Открыть</button>
      </div>
      <div class="scz-row" style="padding-top:0">
        <input id="scz-q" placeholder="поиск по зоне…">
        <button id="scz-search">Найти</button>
      </div>
      <div id="scz-body"><div class="scz-mut">Загрузка каталога зоны…</div></div>
    </div>`;
  document.body.appendChild(fab);
  document.body.appendChild(ov);

  const body = ov.querySelector('#scz-body');
  const addr = ov.querySelector('#scz-addr');
  const q = ov.querySelector('#scz-q');

  function open() { ov.style.display = 'block'; loadDir(); addr.focus(); }
  function close() { ov.style.display = 'none'; }
  fab.addEventListener('click', open);
  ov.querySelector('#scz-close').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'z' || e.key === 'Z' || e.code === 'KeyZ')) { e.preventDefault(); ov.style.display === 'block' ? close() : open(); }
    if (e.key === 'Escape' && ov.style.display === 'block') close();
  });

  // --- каталог ---
  async function loadDir() {
    const r = await gmGet('/api/names');
    if (r.status !== 200) { body.innerHTML = '<div class="scz-mut">портал недоступен (' + r.status + ')</div>'; return; }
    let names = {}; try { names = JSON.parse(r.text); } catch {}
    const keys = Object.keys(names);
    body.innerHTML = '<div class="scz-mut">Сайты зоны (' + keys.length + '):</div>' +
      keys.map((n) => itemHtml({ name: n, title: names[n].title, cid: names[n].cid })).join('') || '<div class="scz-mut">зона пуста</div>';
    bindItems();
  }

  function itemHtml(it) {
    return '<div class="scz-item" data-name="' + enc(it.name) + '"><div class="t">' + enc(it.title || it.name) +
      '</div><div class="u">' + enc(it.name) + (it.cid ? ' · ' + enc(it.cid.slice(0, 16)) + '…' : '') + '</div>' +
      (it.snippet ? '<div class="s">' + enc(it.snippet) + '</div>' : '') + '</div>';
  }
  function bindItems() {
    body.querySelectorAll('.scz-item').forEach((el) => el.addEventListener('click', () => openName(el.dataset.name)));
  }
  function enc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // --- поиск ---
  async function doSearch() {
    const term = q.value.trim(); if (!term) { loadDir(); return; }
    body.innerHTML = '<div class="scz-mut">ищу…</div>';
    const r = await gmGet('/api/search?q=' + encodeURIComponent(term));
    let items = []; try { items = JSON.parse(r.text); } catch {}
    body.innerHTML = items.length ? items.map(itemHtml).join('') : '<div class="scz-mut">по «' + enc(term) + '» ничего не найдено</div>';
    bindItems();
  }
  ov.querySelector('#scz-search').addEventListener('click', doSearch);
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  // --- открыть сайт зоны по имени ---
  async function openName(name) {
    name = (name || '').trim().toLowerCase(); if (!name) return;
    if (!ZONE_RE.test(name)) name += '.зона';
    body.innerHTML = '<div class="scz-mut">открываю ' + enc(name) + '…</div>';
    const r = await gmGet('/raw/' + encodeURIComponent(name));
    if (r.status !== 200) { body.innerHTML = '<div class="scz-mut">имя «' + enc(name) + '» не найдено в зоне</div>'; return; }
    body.innerHTML = '';
    const back = document.createElement('div'); back.className = 'scz-mut';
    back.innerHTML = '⬡ ' + enc(name) + ' &nbsp; <a href="#" style="color:#7c5cff">← к каталогу</a>';
    back.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); loadDir(); });
    const fr = document.createElement('iframe'); fr.id = 'scz-view'; fr.setAttribute('sandbox', 'allow-same-origin');
    fr.style.display = 'block';
    body.appendChild(back); body.appendChild(fr);
    fr.srcdoc = r.text;
    fr.addEventListener('load', () => hookZoneLinks(fr));
  }

  // перехват внутризонных ссылок (#zone:имя и *.зона) внутри отрендеренного сайта
  function hookZoneLinks(fr) {
    let doc; try { doc = fr.contentDocument; } catch { return; }
    if (!doc) return;
    doc.querySelectorAll('a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      let target = null;
      if (href.startsWith('#zone:')) target = href.slice(6);
      else if (ZONE_RE.test(href.replace(/^\/+/, ''))) target = href.replace(/^\/+/, '');
      if (target) a.addEventListener('click', (e) => { e.preventDefault(); openName(target); });
      else if (/^https?:/i.test(href)) a.setAttribute('target', '_blank');
    });
  }

  ov.querySelector('#scz-go').addEventListener('click', () => openName(addr.value));
  addr.addEventListener('keydown', (e) => { if (e.key === 'Enter') openName(addr.value); });

  // --- переписать .зона-ссылки на ОБЫЧНОЙ странице → открывать через оверлей ---
  function rewriteHostLinks() {
    document.querySelectorAll('a[href]').forEach((a) => {
      if (a.dataset.sczDone) return;
      let host = '';
      try { host = new URL(a.href, location.href).hostname; } catch { host = ''; }
      const raw = a.getAttribute('href') || '';
      const cand = ZONE_RE.test(host) ? host : (raw.startsWith('#zone:') ? raw.slice(6) : '');
      if (cand && ZONE_RE.test(cand)) {
        a.dataset.sczDone = '1'; a.title = 'открыть в зоне СЦЗ';
        a.addEventListener('click', (e) => { e.preventDefault(); open(); openName(cand); });
      }
    });
  }
  rewriteHostLinks();
  new MutationObserver(rewriteHostLinks).observe(document.body, { childList: true, subtree: true });

  console.log('[СЦЗ] юзерскрипт активен · портал', PORTAL);
})();
