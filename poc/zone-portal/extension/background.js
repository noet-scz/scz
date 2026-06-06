// noet — расширение зоны .nt (Chromium MV3, Vivaldi/Chrome/Brave/Edge).
//
// Ставит PAC: все хосты *.nt идут на локальный резолвер зоны (127.0.0.1:8090),
// остальной трафик — DIRECT (обычный интернет не затрагивается). Тогда
// http://search.nt/ , http://relay.nt/ , http://manifest.nt/ открываются по имени.
// Резолвер крутится локально (systemd), туннель/VPS для просмотра не нужны.
//
// Клик по иконке — включить/выключить.

const PROXY = '127.0.0.1:8090';
const TLD = 'nt';

const PAC = `function FindProxyForURL(url, host) {
  if (shExpMatch(host, "*.${TLD}")) return "PROXY ${PROXY}";
  return "DIRECT";
}`;

const enable = () => chrome.proxy.settings.set({ value: { mode: 'pac_script', pacScript: { data: PAC, mandatory: false } }, scope: 'regular' });
const disable = () => chrome.proxy.settings.clear({ scope: 'regular' });

async function setState(on) {
  if (on) await enable(); else await disable();
  await chrome.storage.local.set({ on });
  chrome.action.setBadgeBackgroundColor({ color: on ? '#7c5cff' : '#555' });
  chrome.action.setBadgeText({ text: on ? 'ON' : 'OFF' });
  chrome.action.setTitle({ title: `noet — зона .${TLD}: ${on ? 'включена' : 'выключена'} (клик: переключить)` });
}

chrome.runtime.onInstalled.addListener(() => setState(true));
chrome.runtime.onStartup.addListener(async () => {
  const { on } = await chrome.storage.local.get('on');
  setState(on !== false);
});
chrome.action.onClicked.addListener(async () => {
  const { on } = await chrome.storage.local.get('on');
  setState(on === false);
});
