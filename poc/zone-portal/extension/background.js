// СЦЗ — расширение зоны .scz (Chromium MV3)
//
// Что делает: ставит PAC, по которому ВСЕ хосты *.scz идут на прокси-резолвер зоны,
// а весь остальной трафик — DIRECT (обычный интернет не затрагивается).
// Тогда http://search.scz/ , http://manifest.scz/ открываются в браузере по имени.
//
// ВАЖНО (DPI): прокси указывает на 127.0.0.1:8090 — локальный конец SSH-туннеля до VPS.
// Сначала подними туннель (в норме держать открытым):
//     ssh -N -L 8090:127.0.0.1:8090 root@144.31.25.136
// Тогда браузер ходит только на localhost, а SSH несёт всё шифрованным до VPS —
// DPI не видит cleartext-Host и не рубит (см. §9.2). Без туннеля на DPI-сети не работает.
// На сети без DPI можно поставить PROXY = '144.31.25.136:8090' и обойтись без туннеля.
//
// Клик по иконке расширения — включить/выключить.

const PROXY = '127.0.0.1:8090'; // локальный конец SSH-туннеля до прокси-резолвера зоны
const TLD = 'scz';

const PAC = `function FindProxyForURL(url, host) {
  if (shExpMatch(host, "*.${TLD}")) return "PROXY ${PROXY}";
  return "DIRECT";
}`;

function enable() {
  return chrome.proxy.settings.set({
    value: { mode: 'pac_script', pacScript: { data: PAC, mandatory: false } },
    scope: 'regular',
  });
}
function disable() {
  return chrome.proxy.settings.clear({ scope: 'regular' });
}

async function setState(on) {
  if (on) await enable(); else await disable();
  await chrome.storage.local.set({ on });
  chrome.action.setBadgeBackgroundColor({ color: on ? '#7c5cff' : '#555' });
  chrome.action.setBadgeText({ text: on ? 'ON' : 'OFF' });
  chrome.action.setTitle({ title: `Зона .${TLD}: ${on ? 'включена' : 'выключена'} (клик — переключить)` });
}

// включаем по умолчанию при установке/старте браузера
chrome.runtime.onInstalled.addListener(() => setState(true));
chrome.runtime.onStartup.addListener(async () => {
  const { on } = await chrome.storage.local.get('on');
  setState(on !== false);
});

// клик по иконке — тумблер
chrome.action.onClicked.addListener(async () => {
  const { on } = await chrome.storage.local.get('on');
  setState(on === false); // если было выкл — включить, и наоборот
});
