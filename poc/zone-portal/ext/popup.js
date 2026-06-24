// noet — управление личностью в расширении. Ключ хранится в chrome.storage и
// никогда не покидает расширение (страницы подписывают через window.nostr → bridge).
import { schnorr } from './vendor/noble-secp256k1.js';

const api = globalThis.browser || globalThis.chrome;
const u8hex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');
const hex2u8 = (h) => Uint8Array.from(h.match(/.{2}/g).map((b) => parseInt(b, 16)));
const view = document.getElementById('view');

const getSk = async () => (await api.storage.local.get('noet_sk')).noet_sk || null;
const setSk = (sk) => api.storage.local.set({ noet_sk: sk });
const pubOf = (sk) => u8hex(schnorr.getPublicKey(hex2u8(sk)));
const npub = (pk) => pk;   // показываем hex; npub-кодирование не обязательно

function backup(sk, pk) {
  const text = 'noet — приватный ключ (никому не показывай):\n' + sk + '\n\nпубличный ключ:\n' + pk + '\n\nПотеряешь ключ — потеряешь личность.';
  const a = document.createElement('a');
  a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
  a.download = 'noet-ключ.txt'; a.click();
}

// Лаунчер: надёжная точка входа на мобильном. Тап по иконке -> кнопки открывают зону
// в новой вкладке, минуя адресную строку (она на телефоне часто уводит имя в поиск).
function launcher() {
  return `
    <a href="http://noet.nt/" target="_blank"><button class="pri">Открыть noet</button></a>
    <button class="gho" id="goCall">Видеозвонок</button>
    <div class="row2">
      <a href="http://relay.nt/" target="_blank"><button class="gho">Лента</button></a>
      <a href="http://people.nt/" target="_blank"><button class="gho">Люди</button></a>
    </div>
    <div class="sep"></div>`;
}

async function render() {
  const sk = await getSk();
  if (sk) {
    const pk = pubOf(sk);
    view.innerHTML = launcher() + `
      <h2>Твоя личность</h2>
      <div class="pk">${npub(pk)}</div>
      <a href="http://id.nt/" target="_blank"><button class="pri">Моя страница и профиль</button></a>
      <button class="gho" id="backup">Скачать бэкап ключа</button>
      <div class="sep"></div>
      <button class="lnk danger" id="forget">Забыть ключ в этом браузере</button>`;
    document.getElementById('backup').onclick = () => backup(sk, pk);
    document.getElementById('forget').onclick = async () => {
      if (!confirm('Забыть ключ? Без бэкапа личность не вернуть.')) return;
      await api.storage.local.remove(['noet_sk', 'noet_perms']); render();
    };
  } else {
    view.innerHTML = launcher() + `
      <h2>Личность</h2>
      <p>Личность это твой ключ. Без почты и паролей.</p>
      <button class="pri" id="create">Создать личность</button>
      <div class="sep"></div>
      <p>Уже есть ключ?</p>
      <input id="imp" placeholder="приватный ключ (64 hex)" autocomplete="off">
      <button class="gho" id="doimp">Импортировать</button>
      <div id="msg" class="ok"></div>`;
    document.getElementById('create').onclick = async () => {
      const sk = u8hex(schnorr.utils.randomPrivateKey());
      await setSk(sk); const pk = pubOf(sk); backup(sk, pk); render();
    };
    document.getElementById('doimp').onclick = async () => {
      let v = (document.getElementById('imp').value || '').trim().toLowerCase();
      const m = v.match(/[0-9a-f]{64}/); if (m) v = m[0];
      if (!/^[0-9a-f]{64}$/.test(v)) { document.getElementById('msg').textContent = 'Ключ должен быть 64 hex.'; document.getElementById('msg').style.color = '#ff6b6b'; return; }
      await setSk(v); render();
    };
  }
  // звонок: открываем страницу расширения напрямую (надёжнее адресной строки на телефоне)
  const gc = document.getElementById('goCall');
  if (gc) gc.onclick = () => api.tabs.create({ url: api.runtime.getURL('call.html') });
}
render();
