// SCZ — нативное окно узла. Тонкий шелл: показывает, что узел поднят, и открывает зону в
// браузере. Управление личностью и приложения живут в зоне (в браузере), не здесь.
const invoke = (c, a) => window.__TAURI__.core.invoke(c, a);

const DICT = {
  ru: {
    title: 'SCZ', tagline: 'Узел зоны: личность, связь, обновление.',
    node_on: 'Узел работает', node_off: 'Узел не запущен',
    address: 'Адрес зоны', identity: 'Личность', id_yes: 'есть', id_no: 'нет, создашь в зоне',
    open: 'Открыть SCZ в браузере', open_hint: 'Зона откроется в твоём браузере. Там личность, мессенджер, домены, сайты, игры, репутация.',
    check_upd: 'Проверить обновления', checking: 'Проверяю…', up_to_date: 'Установлена последняя версия.',
    update_found: 'Доступна версия', install: 'Обновить и перезапустить', updating: 'Обновляю…', upd_err: 'Обновление недоступно.',
  },
  en: {
    title: 'SCZ', tagline: 'Zone node: identity, connectivity, updates.',
    node_on: 'Node is running', node_off: 'Node is not running',
    address: 'Zone address', identity: 'Identity', id_yes: 'present', id_no: 'none, create it in the zone',
    open: 'Open SCZ in the browser', open_hint: 'The zone opens in your browser. Identity, messenger, domains, sites, games, reputation live there.',
    check_upd: 'Check for updates', checking: 'Checking…', up_to_date: 'You are on the latest version.',
    update_found: 'Version available', install: 'Update and restart', updating: 'Updating…', upd_err: 'Update unavailable.',
  },
};
let lang = localStorage.getItem('scz_lang') || 'ru';
const t = (k) => (DICT[lang] && DICT[lang][k]) || DICT.ru[k] || k;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let url = '', status = { hasKey: false }, up = 0;

async function refresh() {
  try { url = await invoke('gateway_url'); } catch { url = ''; }
  try { status = await invoke('identity_status'); } catch { status = { hasKey: false }; }
}

function render() {
  const on = !!url && !/:0\//.test(url);
  document.getElementById('app').innerHTML = `
    <div class="node">
      <img class="logo" src="./logo.svg" alt="SCZ">
      <h1>${esc(t('title'))}</h1>
      <p class="tag">${esc(t('tagline'))}</p>
      <div class="card">
        <div class="row"><span><span class="dot ${on ? '' : 'off'}"></span>${esc(on ? t('node_on') : t('node_off'))}</span></div>
        <div class="row"><span class="k">${esc(t('identity'))}</span><span class="v">${esc(status.hasKey ? t('id_yes') : t('id_no'))}</span></div>
      </div>
      <button class="pri" id="open" ${on ? '' : 'disabled'}>${esc(t('open'))}</button>
      <button class="ghost" id="upd">${esc(t('check_upd'))}</button>
      <div class="msg" id="umsg"></div>
      <div class="langs">
        <button data-l="ru" class="${lang === 'ru' ? 'on' : ''}">RU</button>
        <button data-l="en" class="${lang === 'en' ? 'on' : ''}">EN</button>
      </div>
    </div>`;

  const open = document.getElementById('open');
  if (open) open.onclick = () => invoke('open_zone').catch(() => {});
  document.querySelectorAll('[data-l]').forEach((b) => { b.onclick = () => { lang = b.dataset.l; localStorage.setItem('scz_lang', lang); render(); }; });

  const umsg = document.getElementById('umsg');
  document.getElementById('upd').onclick = async () => {
    umsg.className = 'msg'; umsg.textContent = t('checking');
    try {
      const v = await invoke('check_update');
      if (!v) { umsg.classList.add('ok'); umsg.textContent = t('up_to_date'); return; }
      umsg.textContent = t('update_found') + ' ' + v;
      const btn = document.getElementById('upd');
      btn.textContent = t('install');
      btn.onclick = async () => { btn.disabled = true; umsg.textContent = t('updating'); try { await invoke('install_update'); } catch (e) { umsg.className = 'msg err'; umsg.textContent = t('upd_err'); btn.disabled = false; } };
    } catch (e) { umsg.className = 'msg err'; umsg.textContent = t('upd_err'); }
  };
}

async function boot() {
  if (!window.__TAURI__) { document.getElementById('app').innerHTML = '<div class="boot">Запусти приложение SCZ.</div>'; return; }
  await refresh();
  render();
}
boot();
