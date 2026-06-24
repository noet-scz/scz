// SCZ — лента: публикация и чтение подписанных сообщений (noet, kind 1).
import { t } from '../i18n.js';
import { artifact } from '../sdk/primitives.js';
import { subscribe } from '../sdk/relays.js';
import { esc, when, resolveName, shortPk, avatar, toast } from '../ui.js';

const FEED_TOPIC = 'scz';   // общий тег ленты зоны

export async function mountFeed(view, ctx) {
  const me = ctx.me();
  view.innerHTML = `<div class="wrap">
    <h1>${esc(t('feed_title'))}</h1>
    <p class="sub">${esc(t('feed_sub'))}</p>
    ${me.hasKey ? `<div class="box">
      <textarea id="txt" placeholder="${esc(t('feed_ph'))}"></textarea>
      <div class="row"><button id="post">${esc(t('feed_post'))}</button><span class="msg" id="msg"></span></div>
    </div>` : `<div class="box mut">${esc(t('err_no_key'))} <a id="goprof">${esc(t('create_identity'))}</a></div>`}
    <div id="list"><div class="empty"><div class="spin" style="margin:0 auto"></div></div></div>
  </div>`;

  if (!me.hasKey) view.querySelector('#goprof').onclick = () => ctx.go('profile');

  const list = view.querySelector('#list');
  const seen = new Set();
  const items = [];

  function row(ev) {
    const nm = resolveNameSync(ev.pubkey);
    return `<div class="item" data-pk="${esc(ev.pubkey)}">
      <span class="who">${esc(nm)}</span><span class="when">${esc(when(ev.created_at))}</span>
      <div class="txt">${esc(ev.content)}</div></div>`;
  }
  const _nameCache = new Map();
  function resolveNameSync(pk) { return _nameCache.get(pk) || shortPk(pk); }
  async function fillNames(scope) {
    const pks = [...new Set([...scope.querySelectorAll('.item')].map((el) => el.dataset.pk))];
    for (const pk of pks) {
      const n = await resolveName(pk); if (n) { _nameCache.set(pk, n);
        scope.querySelectorAll(`.item[data-pk="${CSS.escape(pk)}"] .who`).forEach((w) => { w.textContent = n; }); }
    }
  }
  function paint() {
    items.sort((a, b) => b.created_at - a.created_at);
    if (!items.length) { list.innerHTML = `<div class="empty">${esc(t('feed_empty'))}</div>`; return; }
    list.innerHTML = items.slice(0, 200).map(row).join('');
    fillNames(list);
  }

  try {
    const evs = await artifact.query({ kinds: [1], topic: FEED_TOPIC, limit: 80 });
    evs.forEach((ev) => { if (!seen.has(ev.id)) { seen.add(ev.id); items.push(ev); } });
    paint();
  } catch { list.innerHTML = `<div class="empty">${esc(t('err_offline'))}</div>`; }

  const unsub = subscribe({ kinds: [1], '#t': [FEED_TOPIC], since: Math.floor(Date.now() / 1000) }, (ev) => {
    if (seen.has(ev.id)) return; seen.add(ev.id); items.push(ev); paint();
  });

  if (me.hasKey) {
    view.querySelector('#post').onclick = async () => {
      const txt = view.querySelector('#txt').value.trim();
      if (!txt) return;
      const msg = view.querySelector('#msg'); msg.textContent = t('feed_posting'); msg.className = 'msg';
      try {
        const ev = await artifact.publish({ topic: FEED_TOPIC, content: txt });
        view.querySelector('#txt').value = ''; msg.textContent = '';
        if (!seen.has(ev.id)) { seen.add(ev.id); items.push(ev); paint(); }
      } catch (e) {
        msg.textContent = (e && e.toString().includes('no_key')) ? t('err_no_key') : t('err_offline');
        msg.className = 'msg err';
      }
    };
  }

  return () => { try { unsub(); } catch {} };
}
