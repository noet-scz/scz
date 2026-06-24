// SCZ — сообщества (Space): список, создание, лента сообщества.
import { t } from '../i18n.js';
import { space, artifact } from '../sdk/primitives.js';
import { subscribe } from '../sdk/relays.js';
import { esc, when, resolveName, shortPk } from '../ui.js';

export async function mountSpaces(view, ctx) {
  let cleanup = null;
  const me = ctx.me();

  async function list() {
    if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
    view.innerHTML = `<div class="wrap">
      <h1>${esc(t('spaces_title'))}</h1>
      <p class="sub">${esc(t('spaces_sub'))}</p>
      ${me.hasKey ? `<div class="box">
        <input id="sname" placeholder="${esc(t('space_name_ph'))}">
        <input id="sabout" placeholder="${esc(t('space_about_ph'))}">
        <div class="row"><button id="screate">${esc(t('space_create'))}</button><span class="msg" id="smsg"></span></div>
      </div>` : ''}
      <div id="slist"><div class="empty"><div class="spin" style="margin:0 auto"></div></div></div>
    </div>`;

    if (me.hasKey) view.querySelector('#screate').onclick = async () => {
      const title = view.querySelector('#sname').value.trim();
      if (!title) return;
      const msg = view.querySelector('#smsg'); msg.textContent = '…'; msg.className = 'msg';
      try { const s = await space.create({ title, about: view.querySelector('#sabout').value.trim() }); open(s.coord, s.title); }
      catch (e) { msg.textContent = (e && e.toString().includes('no_key')) ? t('err_no_key') : t('err_offline'); msg.className = 'msg err'; }
    };

    const slist = view.querySelector('#slist');
    try {
      const spaces = await space.list({ limit: 100 });
      if (!spaces.length) { slist.innerHTML = `<div class="empty">${esc(t('spaces_empty'))}</div>`; return; }
      slist.innerHTML = spaces.map((s) => `<div class="item" data-coord="${esc(s.coord)}" data-title="${esc(s.title || s.id)}" style="cursor:pointer">
        <div style="font-weight:600">${esc(s.title || s.id)}</div>
        ${s.about ? `<div class="mut" style="font-size:.85rem;margin-top:.2rem">${esc(s.about)}</div>` : ''}
      </div>`).join('');
      slist.querySelectorAll('.item').forEach((el) => { el.onclick = () => open(el.dataset.coord, el.dataset.title); });
    } catch { slist.innerHTML = `<div class="empty">${esc(t('err_offline'))}</div>`; }
  }

  async function open(coord, title) {
    if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
    const topic = 'scz-space:' + coord;
    view.innerHTML = `<div class="wrap">
      <div class="row" style="margin-bottom:.6rem"><button class="ghost" id="back">← ${esc(t('spaces_title'))}</button></div>
      <h1>${esc(title)}</h1>
      ${me.hasKey ? `<div class="box">
        <textarea id="txt" placeholder="${esc(t('space_post_ph'))}"></textarea>
        <div class="row"><button id="post">${esc(t('feed_post'))}</button><span class="msg" id="msg"></span></div>
      </div>` : `<div class="box mut">${esc(t('err_no_key'))}</div>`}
      <div id="list"><div class="empty"><div class="spin" style="margin:0 auto"></div></div></div>
    </div>`;
    view.querySelector('#back').onclick = () => list();

    const listEl = view.querySelector('#list');
    const seen = new Set(); const items = [];
    const nameCache = new Map();
    function paint() {
      items.sort((a, b) => b.created_at - a.created_at);
      if (!items.length) { listEl.innerHTML = `<div class="empty">${esc(t('feed_empty'))}</div>`; return; }
      listEl.innerHTML = items.map((ev) => `<div class="item" data-pk="${esc(ev.pubkey)}">
        <span class="who">${esc(nameCache.get(ev.pubkey) || shortPk(ev.pubkey))}</span>
        <span class="when">${esc(when(ev.created_at))}</span>
        <div class="txt">${esc(ev.content)}</div></div>`).join('');
      [...new Set(items.map((i) => i.pubkey))].forEach(async (pk) => {
        const n = await resolveName(pk); if (n) { nameCache.set(pk, n);
          listEl.querySelectorAll(`.item[data-pk="${CSS.escape(pk)}"] .who`).forEach((w) => { w.textContent = n; }); }
      });
    }
    try {
      const evs = await artifact.query({ kinds: [1], topic, limit: 100 });
      evs.forEach((ev) => { if (!seen.has(ev.id)) { seen.add(ev.id); items.push(ev); } });
      paint();
    } catch { listEl.innerHTML = `<div class="empty">${esc(t('err_offline'))}</div>`; }

    const unsub = subscribe({ kinds: [1], '#t': [topic], since: Math.floor(Date.now() / 1000) }, (ev) => {
      if (seen.has(ev.id)) return; seen.add(ev.id); items.push(ev); paint();
    });
    cleanup = () => { try { unsub(); } catch {} };

    if (me.hasKey) view.querySelector('#post').onclick = async () => {
      const txt = view.querySelector('#txt').value.trim(); if (!txt) return;
      const msg = view.querySelector('#msg'); msg.textContent = t('feed_posting'); msg.className = 'msg';
      try { const ev = await artifact.publish({ topic, content: txt }); view.querySelector('#txt').value = ''; msg.textContent = '';
        if (!seen.has(ev.id)) { seen.add(ev.id); items.push(ev); paint(); } }
      catch (e) { msg.textContent = (e && e.toString().includes('no_key')) ? t('err_no_key') : t('err_offline'); msg.className = 'msg err'; }
    };
  }

  await list();
  return () => { if (cleanup) { try { cleanup(); } catch {} } };
}
