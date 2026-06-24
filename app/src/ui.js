// SCZ — мелкие помощники UI: экранирование, аватар, имена, тосты, даты.
import { identity } from './sdk/primitives.js';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const shortPk = (pk) => (pk ? pk.slice(0, 10) + '…' : '');
const hashN = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

export function avatar(pubkey, name, picture) {
  if (picture && /^(https?:|data:)/i.test(picture)) return picture;
  const seed = pubkey || name || '?', hue = hashN(seed) % 360, hue2 = (hue + 50) % 360;
  const ch = (name || '').trim() ? [...name.trim()][0].toUpperCase().replace(/[&<>]/g, '') : '';
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><defs><linearGradient id='a' x1='0' y1='0' x2='64' y2='64'><stop offset='0' stop-color='hsl(" + hue + " 65% 56%)'/><stop offset='1' stop-color='hsl(" + hue2 + " 60% 42%)'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(#a)'/>" + (ch ? "<text x='32' y='43' font-family='system-ui' font-size='30' font-weight='600' fill='white' text-anchor='middle'>" + ch + "</text>" : "") + "</svg>";
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

const _names = new Map(), _pending = new Map();
export function cachedName(pk) { return _names.get(pk); }
export async function resolveName(pk) {
  if (_names.has(pk)) return _names.get(pk);
  if (_pending.has(pk)) return _pending.get(pk);
  const p = identity.profile(pk).then((pr) => { const n = (pr && pr.name) || ''; _names.set(pk, n); return n; }).catch(() => { _names.set(pk, ''); return ''; });
  _pending.set(pk, p);
  return p;
}

export function toast(s) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = s; el.classList.add('on');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2200);
}
export async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
export function when(ts) { const d = new Date(ts * 1000); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
