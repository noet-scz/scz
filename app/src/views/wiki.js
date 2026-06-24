// SCZ — вики: страницы по ключу (kind 30078, версии по d-тегу), связи [[Имя]], удаление.
import { t } from '../i18n.js';
import { artifact } from '../sdk/primitives.js';
import { esc, when, resolveName, shortPk } from '../ui.js';

const TOPIC = 'scz-wiki';

export async function mountWiki(view, ctx) {
  const me = ctx.me();
  let pages = {};   // slug -> свежая версия

  const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  const dOf = (ev) => { const t2 = (ev.tags || []).find((x) => x[0] === 'd'); return t2 ? t2[1] : ''; };
  const titleOf = (ev) => { const t2 = (ev.tags || []).find((x) => x[0] === 'title'); return t2 ? t2[1] : dOf(ev) || 'страница'; };
  const isDeleted = (ev) => (ev.tags || []).some((x) => x[0] === 'deleted');

  function render(md) {
    return String(md || '').replace(/\r/g, '').split(/\n{2,}/).map((block) => {
      const b = block.trim(); if (!b) return '';
      if (/^#\s+/.test(b)) return '<h2>' + esc(b.replace(/^#\s+/, '')) + '</h2>';
      const h = esc(b).replace(/\n/g, '<br>').replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
        const sl = slug(name); const cls = pages[sl] ? 'wl' : 'wl new';
        return '<a class="' + cls + '" data-go="' + esc(sl) + '">' + esc(name) + '</a>';
      });
      return '<p>' + h + '</p>';
    }).join('');
  }

  async function load() {
    const all = await artifact.query({ kinds: [30078], topic: TOPIC, key: true, limit: 500 });
    pages = {};
    all.forEach((ev) => { const d = dOf(ev); if (!d) return; if (!pages[d] || ev.created_at > pages[d].created_at) pages[d] = ev; });
    Object.keys(pages).forEach((d) => { if (isDeleted(pages[d])) delete pages[d]; });
  }

  function head(extra) {
    return `<div class="wrap"><h1>${esc(t('wiki_title'))}</h1><p class="sub">${esc(t('wiki_sub'))}</p>${extra}</div>`;
  }

  function viewIndex() {
    const keys = Object.keys(pages).sort((a, b) => pages[b].created_at - pages[a].created_at);
    const listHtml = keys.length
      ? `<div class="box pglist">${keys.map((k) => `<a data-go="${esc(k)}">${esc(titleOf(pages[k]))}</a>`).join('')}</div>`
      : `<div class="empty">${esc(t('wiki_empty'))}</div>`;
    view.innerHTML = head(`${me.hasKey ? `<div class="row" style="margin-bottom:1rem"><button id="new">${esc(t('wiki_new'))}</button></div>` : ''}${listHtml}`);
    if (me.hasKey) view.querySelector('#new').onclick = () => viewEdit('');
    wire();
  }

  async function viewPage(sl) {
    const ev = pages[sl];
    if (!ev) {
      view.innerHTML = head(`<div class="row" style="margin-bottom:.6rem"><button class="ghost" id="back">← ${esc(t('wiki_all'))}</button></div>
        <h2>${esc(sl)}</h2><p class="mut">${esc(t('wiki_none_yet'))}</p>
        ${me.hasKey ? `<div class="row"><button id="make">${esc(t('wiki_create_it'))}</button></div>` : ''}`);
      view.querySelector('#back').onclick = viewIndex;
      if (me.hasKey) view.querySelector('#make').onclick = () => viewEdit(sl);
      return;
    }
    const author = await resolveName(ev.pubkey).then((n) => n || shortPk(ev.pubkey)).catch(() => shortPk(ev.pubkey));
    view.innerHTML = head(`<div class="row" style="margin-bottom:.6rem">
        <button class="ghost" id="back">← ${esc(t('wiki_all'))}</button>
        ${me.hasKey ? `<button class="ghost" id="edit">${esc(t('wiki_edit'))}</button><button class="ghost danger" id="del">${esc(t('delete'))}</button>` : ''}
        <span class="msg" id="pmsg"></span></div>
      <h1 style="font-size:1.4rem">${esc(titleOf(ev))}</h1>
      <div class="mut" style="font-size:.8rem;margin-bottom:.6rem">${esc(t('edited_by'))} ${esc(author)} · ${esc(when(ev.created_at))}</div>
      <article>${render(ev.content)}</article>`);
    view.querySelector('#back').onclick = viewIndex;
    if (me.hasKey) {
      view.querySelector('#edit').onclick = () => viewEdit(sl);
      view.querySelector('#del').onclick = async () => {
        if (!confirm(t('wiki_del_confirm'))) return;
        const pmsg = view.querySelector('#pmsg'); pmsg.textContent = '…';
        try { await artifact.publish({ key: sl, topic: TOPIC, content: '', tags: [['title', titleOf(ev)], ['deleted', '1']] }); await load(); viewIndex(); }
        catch (e) { pmsg.textContent = (e && e.toString().includes('no_key')) ? t('err_no_key') : t('err_offline'); pmsg.className = 'msg err'; }
      };
    }
    wire();
  }

  function viewEdit(sl) {
    const ev = sl && pages[sl];
    const title = ev ? titleOf(ev) : '';
    view.innerHTML = head(`<div class="row" style="margin-bottom:.6rem"><button class="ghost" id="cancel">← ${esc(t('cancel'))}</button></div>
      <div class="box">
        <input id="t" placeholder="${esc(t('wiki_title_ph'))}" value="${esc(title)}">
        <textarea id="b" placeholder="${esc(t('wiki_body_ph'))}" style="min-height:11rem">${esc(ev ? ev.content : '')}</textarea>
        <div class="row"><button id="save">${esc(t('save'))}</button><span class="msg" id="msg"></span></div>
      </div>`);
    view.querySelector('#cancel').onclick = () => (sl ? viewPage(sl) : viewIndex());
    view.querySelector('#save').onclick = async () => {
      const ti = view.querySelector('#t').value.trim(), body = view.querySelector('#b').value;
      const msg = view.querySelector('#msg');
      if (!ti) { msg.textContent = t('wiki_need_title'); msg.className = 'msg err'; return; }
      const key = sl || slug(ti); if (!key) { msg.textContent = t('wiki_need_title'); msg.className = 'msg err'; return; }
      msg.textContent = '…'; msg.className = 'msg';
      try { await artifact.publish({ key, topic: TOPIC, content: body, tags: [['title', ti]] }); await load(); viewPage(key); }
      catch (e) { msg.textContent = (e && e.toString().includes('no_key')) ? t('err_no_key') : t('err_offline'); msg.className = 'msg err'; }
    };
  }

  function wire() {
    view.querySelectorAll('[data-go]').forEach((a) => { a.onclick = () => viewPage(a.dataset.go); });
  }

  view.innerHTML = head(`<div class="empty"><div class="spin" style="margin:0 auto"></div></div>`);
  try { await load(); viewIndex(); }
  catch { view.innerHTML = head(`<div class="empty">${esc(t('err_offline'))}</div>`); }
}
