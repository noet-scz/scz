// SCZ — шелл и роутер. Единый сайдбар + один чип личности на всех экранах (правило §5).
import { t, getLang, setLang } from './i18n.js';
import * as id from './sdk/identity.js';
import { identity } from './sdk/primitives.js';
import { avatar, esc, shortPk } from './ui.js';
import { mountFeed } from './views/feed.js';
import { mountProfile } from './views/profile.js';
import { mountSpaces } from './views/spaces.js';
import { mountWiki } from './views/wiki.js';
import { mountCall } from './views/call.js';

const ROUTES = {
  feed: { icon: '◎', label: 'nav_feed', mount: mountFeed },
  spaces: { icon: '⬡', label: 'nav_spaces', mount: mountSpaces },
  wiki: { icon: '✎', label: 'nav_wiki', mount: mountWiki },
  call: { icon: '◉', label: 'nav_call', mount: mountCall },
  profile: { icon: '○', label: 'nav_profile', mount: mountProfile },
};
const ORDER = ['feed', 'spaces', 'wiki', 'call', 'profile'];

let me = { hasKey: false, pubkey: null, profile: null };
let cleanup = null;

const ctx = {
  me: () => me,
  go: (route) => { location.hash = '#/' + route; },
  refreshMe,
};

async function refreshMe() {
  try {
    const s = await id.status();
    me = { hasKey: !!s.hasKey, pubkey: s.pubkey || null, profile: me.profile };
    if (s.hasKey) { try { me.profile = await identity.profile(s.pubkey); } catch {} }
    else me.profile = null;
  } catch { me = { hasKey: false, pubkey: null, profile: null }; }
  renderChip();
}

function currentRoute() {
  const h = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
  return ROUTES[h] ? h : 'feed';
}

function shell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="brand"><span class="logo"></span><span class="nm">SCZ</span></div>
        <nav class="nav">${ORDER.map((r) => `<a data-route="${r}"><span class="ic">${ROUTES[r].icon}</span><span class="t">${esc(t(ROUTES[r].label))}</span></a>`).join('')}</nav>
        <div class="sp"></div>
        <div class="chip" id="chip"></div>
        <div class="langs">
          <button data-lang="ru" class="${getLang() === 'ru' ? 'on' : ''}">RU</button>
          <button data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">EN</button>
        </div>
      </aside>
      <main class="main"><div id="view"></div></main>
    </div>`;
  app.querySelectorAll('.nav a').forEach((a) => { a.onclick = () => ctx.go(a.dataset.route); });
  app.querySelector('#chip').onclick = () => ctx.go('profile');
  app.querySelectorAll('.langs button').forEach((b) => { b.onclick = () => setLang(b.dataset.lang); });
  renderChip();
  renderRoute();
}

function renderChip() {
  const chip = document.getElementById('chip');
  if (!chip) return;
  if (me.hasKey) {
    const nm = (me.profile && me.profile.name) || shortPk(me.pubkey);
    chip.innerHTML = `<img src="${avatar(me.pubkey, nm, me.profile && me.profile.picture)}"><div><div class="nm">${esc(nm)}</div><div class="sub">${esc(t('edit_profile'))}</div></div>`;
  } else {
    chip.innerHTML = `<img src="${avatar('guest', t('guest'))}"><div><div class="nm">${esc(t('guest'))}</div><div class="sub">${esc(t('create_identity'))}</div></div>`;
  }
}

function setActiveNav(route) {
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === route));
}

async function renderRoute() {
  const route = currentRoute();
  setActiveNav(route);
  if (typeof cleanup === 'function') { try { cleanup(); } catch {} cleanup = null; }
  const view = document.getElementById('view');
  view.innerHTML = `<div class="wrap"><div class="boot"><div class="spin"></div></div></div>`;
  try {
    const ret = await ROUTES[route].mount(view, ctx);
    cleanup = typeof ret === 'function' ? ret : null;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="wrap"><div class="empty">${esc(t('err_generic'))}</div></div>`;
  }
}

window.addEventListener('hashchange', renderRoute);
document.addEventListener('scz:lang', () => { shell(); });

async function boot() {
  if (!window.__TAURI__) {
    document.getElementById('app').innerHTML = '<div class="boot"><div class="empty">Запусти через приложение SCZ (Tauri).</div></div>';
    return;
  }
  document.documentElement.lang = getLang();
  await refreshMe();
  shell();
}
boot();
