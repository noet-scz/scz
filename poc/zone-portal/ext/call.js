// noet — видеозвонок без своих серверов. Только компьютеры участников: медиа идёт по
// WebRTC (DTLS-SRTP), сигналинг — эфемерные Nostr-события на публичных реле. Своего VPS/
// TURN/SFU нет.
//
// Топология: HOST-STAR (клиент-SFU). Один участник = хост (создатель комнаты, его pubkey
// и есть id комнаты). Гости соединяются ТОЛЬКО с хостом; хост принимает медиа каждого и
// форвардит остальным. Зачем не mesh: в mesh каждый аплоадит N-1 потоков и всё умирает на
// ~5. В host-star гость шлёт 1 поток вверх, принимает N-1 — поэтому >5 видео реально.
// Узкое место — аплинк ХОСТА (на низком разрешении дом тянет ~6-8; дальше нужен узел-
// форвардер дерева, это следующий шаг). Хост — единственный, кто шлёт offer => нет glare.
//
// Захват камеры/экрана работает, потому что страница расширения = secure context. В http-
// зоне (id.nt/…) getUserMedia запрещён, поэтому звонок и живёт здесь, а не в контенте.
import { schnorr } from './vendor/noble-secp256k1.js';

const api = globalThis.browser || globalThis.chrome;
const $ = (s) => document.querySelector(s);
const u8hex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');
const hex2u8 = (h) => Uint8Array.from(h.match(/.{2}/g).map((b) => parseInt(b, 16)));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---- sha256 чистый JS (id события Nostr, без WebCrypto) ---- */
const _K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function sha256hex(str){const rotr=(x,n)=>(x>>>n)|(x<<(32-n));const bytes=new TextEncoder().encode(str),l=bytes.length;const withOne=l+1,pad=(56-(withOne%64)+64)%64,total=withOne+pad+8;const m=new Uint8Array(total);m.set(bytes);m[l]=0x80;const dv=new DataView(m.buffer);dv.setUint32(total-8,Math.floor((l*8)/0x100000000),false);dv.setUint32(total-4,(l*8)>>>0,false);let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;const w=new Uint32Array(64);for(let i=0;i<total;i+=64){for(let t=0;t<16;t++)w[t]=dv.getUint32(i+t*4,false);for(let t=16;t<64;t++){const s0=rotr(w[t-15],7)^rotr(w[t-15],18)^(w[t-15]>>>3);const s1=rotr(w[t-2],17)^rotr(w[t-2],19)^(w[t-2]>>>10);w[t]=(w[t-16]+s0+w[t-7]+s1)>>>0;}let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;for(let t=0;t<64;t++){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g);const t1=(h+S1+ch+_K[t]+w[t])>>>0;const S0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c);const t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;}const hx=(x)=>('00000000'+(x>>>0).toString(16)).slice(-8);return hx(h0)+hx(h1)+hx(h2)+hx(h3)+hx(h4)+hx(h5)+hx(h6)+hx(h7);}

/* ---- состояние ---- */
const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
let RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
const CALL_KIND = 21000;   // эфемерный диапазон (20000-29999): реле не хранят сигналинг

let SK = null, ME = null, ROOM = null, IS_HOST = false;
let localStream = null, camTrack = null, screenTrack = null, sharing = false;
let micOn = true, camOn = true;
const localVideoSenders = new Set();   // отправители НАШЕГО видео (для replaceTrack при шеринге)

const peers = new Map();    // pubkey -> { pc, pendingIce:[], making:false }  (хост: по гостю; гость: единственный = HOST)
const streamOwner = new Map();   // streamId -> pubkey (карта «чей поток», объявляет хост)
const names = new Map();    // pubkey -> отображаемое имя
const seen = new Set();     // id обработанных событий
let sockets = [];

/* ---- Nostr-сигналинг ---- */
async function loadConfig() {
  try { const r = await fetch('https://noet-scz.github.io/noet/dist/config.json', { cache: 'no-cache', signal: AbortSignal.timeout(5000) });
    if (r.ok) { const c = await r.json(); if (Array.isArray(c.relays) && c.relays.length) RELAYS = c.relays; } } catch {}
}
async function getKey() { return (await api.storage.local.get('noet_sk')).noet_sk || null; }
async function signEv(ev) {
  ev.pubkey = ME; ev.created_at = Math.floor(Date.now() / 1000); ev.tags = ev.tags || []; ev.content = ev.content || '';
  ev.id = sha256hex(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]));
  ev.sig = u8hex(await schnorr.sign(hex2u8(ev.id), hex2u8(SK)));
  return ev;
}
function connectRelays(onEvent) {
  RELAYS.forEach((url) => {
    let ws; try { ws = new WebSocket(url); } catch { return; }
    ws.onopen = () => { try { ws.send(JSON.stringify(['REQ', 'c', { kinds: [CALL_KIND], '#r': [ROOM], since: Math.floor(Date.now() / 1000) - 3 }])); } catch {} };
    ws.onmessage = (m) => { try { const a = JSON.parse(m.data); if (a[0] === 'EVENT' && a[2]) onEvent(a[2]); } catch {} };
    ws.onerror = () => {};
    sockets.push(ws);
  });
}
async function publish(obj, toPub) {
  if (!ME) return;
  const tags = [['r', ROOM]]; if (toPub) tags.push(['p', toPub]);
  let ev; try { ev = await signEv({ kind: CALL_KIND, tags, content: JSON.stringify(obj) }); } catch { return; }
  const msg = JSON.stringify(['EVENT', ev]);
  sockets.forEach((w) => { try { if (w.readyState === 1) w.send(msg); } catch {} });
}

/* ---- WebRTC ---- */
// perfect negotiation (паттерн MDN): обе стороны могут инициировать, glare разруливается
// ролями polite/impolite. Так и медиа гостя (новые m-line), и форвардинг хоста, и
// ренеготиация при входе/выходе проходят без ручного «кто offerer».
function makePc(remotePub) {
  const pc = new RTCPeerConnection({ iceServers: STUN });
  const p = { pc, pendingIce: [], making: false, ignore: false, polite: !IS_HOST };   // хост impolite, гость polite
  peers.set(remotePub, p);
  // наши дорожки в каждое соединение (камера/мик), запоминаем видео-отправителей
  if (localStream) for (const tr of localStream.getTracks()) { const s = pc.addTrack(tr, localStream); if (tr.kind === 'video') localVideoSenders.add(s); }
  streamOwner.set(localStream.id, ME);
  pc.onicecandidate = (e) => { if (e.candidate) publish({ t: 'ice', c: e.candidate }, remotePub); };
  pc.ontrack = (e) => onRemoteTrack(remotePub, e);
  pc.onconnectionstatechange = () => { const st = pc.connectionState; if (st === 'failed' || st === 'closed') dropPeer(remotePub); };
  pc.onnegotiationneeded = async () => {
    try { p.making = true; await pc.setLocalDescription(); publish({ t: 'desc', sdp: pc.localDescription }, remotePub); }
    catch (e) { console.warn('negotiation', e); } finally { p.making = false; }
  };
  return p;
}
async function flushIce(p) { while (p.pendingIce.length) { try { await p.pc.addIceCandidate(p.pendingIce.shift()); } catch {} } }

// ХОСТ форвардит дорожку источника src всем ОСТАЛЬНЫМ гостям
function forwardTrack(srcPub, track, stream) {
  streamOwner.set(stream.id, srcPub);
  for (const [pub, p] of peers) {
    if (pub === srcPub) continue;
    // не дублируем: добавляем дорожку этого потока, если её там ещё нет
    const has = p.pc.getSenders().some((s) => s.track === track);
    if (!has) { try { p.pc.addTrack(track, stream); } catch {} }
  }
  announceMap();
}
function announceMap() {
  if (!IS_HOST) return;
  const map = {}; for (const [sid, pub] of streamOwner) map[sid] = pub;
  publish({ t: 'map', map });
}

function onRemoteTrack(remotePub, e) {
  const stream = e.streams[0] || new MediaStream([e.track]);
  if (IS_HOST) {
    // медиа гостя: показать у себя и форварднуть остальным
    streamOwner.set(stream.id, remotePub);
    forwardTrack(remotePub, e.track, stream);
    upsertTile(remotePub, stream);
  } else {
    // гость: поток от хоста ИЛИ форварднутый другого участника. Владельца берём из карты
    const owner = streamOwner.get(stream.id);
    upsertTile(owner || stream.id, stream, !owner);   // имя уточним, когда придёт map
  }
}

async function onSignal(ev) {
  if (ev.pubkey === ME) return;
  if (seen.has(ev.id)) return; seen.add(ev.id);
  const pTag = (ev.tags.find((t) => t[0] === 'p') || [])[1];
  let msg; try { msg = JSON.parse(ev.content); } catch { return; }
  const from = ev.pubkey;

  if (msg.t === 'map') {   // карта «чей поток» от хоста — релейблим тайлы
    if (from !== ROOM) return;   // карте доверяем только от хоста
    Object.entries(msg.map || {}).forEach(([sid, pub]) => { streamOwner.set(sid, pub); relabelStream(sid, pub); });
    return;
  }
  if (msg.t === 'bye') { if (from === ROOM) endByHost(); else dropPeer(from); return; }

  // ХОСТ: новый гость объявился -> поднять соединение (negotiationneeded сам зашлёт offer)
  if (IS_HOST && msg.t === 'join') { if (!peers.has(from)) makePc(from); return; }

  if (pTag && pTag !== ME) return;   // адресное не мне

  if (msg.t === 'desc') {   // perfect negotiation: единый offer/answer-канал
    let p = peers.get(from);
    if (!p) { if (from === ROOM || IS_HOST) p = makePc(from); else return; }
    const desc = msg.sdp;
    const collision = desc.type === 'offer' && (p.making || p.pc.signalingState !== 'stable');
    p.ignore = !p.polite && collision;
    if (p.ignore) return;
    try {
      await p.pc.setRemoteDescription(desc); await flushIce(p);
      if (desc.type === 'offer') { await p.pc.setLocalDescription(); publish({ t: 'desc', sdp: p.pc.localDescription }, from); }
    } catch (e) { console.warn('desc', e); }
  } else if (msg.t === 'ice') {
    const p = peers.get(from); if (!p) return;
    if (p.pc.remoteDescription && p.pc.remoteDescription.type) { try { await p.pc.addIceCandidate(msg.c); } catch {} }
    else p.pendingIce.push(msg.c);
  }
}

function dropPeer(pub) {
  const p = peers.get(pub); if (!p) return;
  try { p.pc.close(); } catch {}
  peers.delete(pub);
  // хост: убрать форвард его дорожек у остальных (renegotiation сработает сама)
  removeTile(pub);
  if (IS_HOST) { for (const [sid, owner] of streamOwner) if (owner === pub) streamOwner.delete(sid); announceMap(); }
  updateCount();
}

/* ---- медиа ---- */
async function startMedia(constraints) {
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  camTrack = localStream.getVideoTracks()[0] || null;
  camOn = !!camTrack; micOn = !!localStream.getAudioTracks()[0];
  streamOwner.set(localStream.id, ME);
  upsertTile(ME, localStream, false, true);
}
function replaceOutgoingVideo(track) { localVideoSenders.forEach((s) => { try { s.replaceTrack(track); } catch {} }); }
async function shareScreen() {
  if (sharing) return stopShare();
  let ds; try { ds = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false }); }
  catch { return; }   // пользователь отменил выбор окна
  screenTrack = ds.getVideoTracks()[0];
  replaceOutgoingVideo(screenTrack);
  screenTrack.onended = () => stopShare();
  sharing = true;
  const t = tiles.get(ME); if (t) { t.classList.add('sharing'); t.querySelector('video').srcObject = ds; }
  updateControls(); toast('Демонстрация экрана включена');
}
function stopShare() {
  if (!sharing) return;
  try { if (screenTrack) screenTrack.stop(); } catch {}
  replaceOutgoingVideo(camOn ? camTrack : null);
  sharing = false; screenTrack = null;
  const t = tiles.get(ME); if (t) { t.classList.remove('sharing'); t.querySelector('video').srcObject = localStream; }
  updateControls();
}
function toggleMic() { micOn = !micOn; localStream.getAudioTracks().forEach((t) => t.enabled = micOn); updateControls(); refreshBadges(ME); }
function toggleCam() {
  camOn = !camOn;
  if (camTrack) camTrack.enabled = camOn;
  if (!sharing) { const t = tiles.get(ME); if (t) t.classList.toggle('camoff', !camOn); }
  updateControls(); refreshBadges(ME);
}

/* ---- UI: тайлы ---- */
const grid = $('#grid'); const tiles = new Map();   // pubkey -> .tile
function tileLabel(pub) { return names.get(pub) || (pub === ME ? 'Вы' : (pub && pub.length >= 8 ? pub.slice(0, 8) + '…' : 'участник')); }
function upsertTile(key, stream, pending, isMe) {
  let t = tiles.get(key);
  if (!t) {
    t = document.createElement('div'); t.className = 'tile' + (isMe ? ' me' : '');
    t.innerHTML = '<video autoplay playsinline' + (isMe ? ' muted' : '') + '></video><div class="novid">●</div><div class="badge"></div><span class="lbl"></span>';
    grid.appendChild(t); tiles.set(key, t);
  }
  const v = t.querySelector('video');
  if (stream && v.srcObject !== stream) v.srcObject = stream;
  t.querySelector('.lbl').textContent = pending ? 'участник…' : tileLabel(key);
  if (!isMe && key && key.length === 64) ensureName(key);
  updateCount(); refreshBadges(key);
  return t;
}
function relabelStream(sid, pub) {   // у гостя тайл создавался по streamId до прихода карты
  const t = tiles.get(sid); if (t && pub && pub !== sid) { tiles.delete(sid); tiles.set(pub, t); }
  const tt = tiles.get(pub); if (tt) { tt.querySelector('.lbl').textContent = tileLabel(pub); if (pub.length === 64) ensureName(pub); }
}
function removeTile(key) { const t = tiles.get(key); if (t) { try { t.remove(); } catch {} tiles.delete(key); } updateCount(); }
function refreshBadges(key) {
  const t = tiles.get(key); if (!t) return; const b = t.querySelector('.badge'); if (!b) return;
  if (key === ME) b.innerHTML = (!micOn ? '<span>🔇</span>' : '') + (!camOn && !sharing ? '<span>🎥✕</span>' : '');
}
function updateCount() { const n = tiles.size; $('#cnt').textContent = n ? (n + (n > 4 ? ' · много участников, качество снижено' : '')) : ''; applyQuality(n); }
function updateControls() {
  $('#mic').classList.toggle('off', !micOn); $('#mic').textContent = micOn ? '🎙 Микрофон' : '🔇 Включить мик';
  $('#cam').classList.toggle('off', !camOn); $('#cam').textContent = camOn ? '🎥 Камера' : '🎥 Включить камеру';
  $('#screen').classList.toggle('pri', sharing); $('#screen').textContent = sharing ? '🖥 Остановить показ' : '🖥 Показать экран';
}

// адаптация качества: чем больше участников, тем ниже разрешение исходящего видео,
// чтобы аплинк хоста и сеть гостей тянули >5 (host-star, без сервера)
let _lastCap = 0;
async function applyQuality(n) {
  if (sharing) return;
  const cap = n >= 7 ? { w: 320, h: 240, fps: 15, kbps: 120 } : n >= 4 ? { w: 480, h: 360, fps: 20, kbps: 250 } : { w: 640, h: 480, fps: 30, kbps: 600 };
  if (cap.w === _lastCap) return; _lastCap = cap.w;
  try { if (camTrack) await camTrack.applyConstraints({ width: cap.w, height: cap.h, frameRate: cap.fps }); } catch {}
  for (const s of localVideoSenders) { try { const pr = s.getParameters(); pr.encodings = [{ maxBitrate: cap.kbps * 1000 }]; await s.setParameters(pr); } catch {} }
}

// имя участника из Nostr-профиля (kind 0), разово
const _nameReq = new Set();
function ensureName(pub) {
  if (names.has(pub) || _nameReq.has(pub)) return; _nameReq.add(pub);
  let done = false; const socks = RELAYS.map((u) => { try { return new WebSocket(u); } catch { return null; } }).filter(Boolean);
  const fin = () => { try { socks.forEach((w) => w.close()); } catch {} };
  setTimeout(fin, 4000);
  socks.forEach((ws) => {
    ws.onopen = () => { try { ws.send(JSON.stringify(['REQ', 'p', { kinds: [0], authors: [pub], limit: 1 }])); } catch {} };
    ws.onmessage = (m) => { try { const a = JSON.parse(m.data); if (a[0] === 'EVENT' && a[2] && !done) { const pr = JSON.parse(a[2].content || '{}'); if (pr.name) { done = true; names.set(pub, pr.name); const t = tiles.get(pub); if (t) t.querySelector('.lbl').textContent = pr.name; fin(); } } } catch {} };
  });
}

/* ---- экраны/ошибки ---- */
function showMsg(html) { const m = $('#msg'); m.innerHTML = html; m.style.display = 'flex'; }
function hideMsg() { $('#msg').style.display = 'none'; }
let _tt = null;
function toast(s) { const el = $('#toast'); el.textContent = s; el.classList.add('on'); clearTimeout(_tt); _tt = setTimeout(() => el.classList.remove('on'), 2200); }
function goHome() { location.href = 'http://noet.nt/'; }
function endByHost() { showMsg('<h2>Звонок завершён</h2><p>Хост закрыл комнату.</p><p><a id="bk" href="http://noet.nt/">Вернуться в noet</a></p>'); cleanup(); }
function cleanup() { try { sockets.forEach((w) => w.close()); } catch {} for (const [, p] of peers) { try { p.pc.close(); } catch {} } peers.clear(); }

/* ---- запуск ---- */
async function main() {
  $('#home').onclick = (e) => { e.preventDefault(); leave(); };
  await loadConfig();
  SK = await getKey();
  if (!SK) {
    showMsg('<h2>Нужна личность</h2><p>Звонок подписывается твоим ключом noet. Создай личность в расширении (иконка noet), затем вернись.</p><p><a href="http://id.nt/">Открыть профиль</a></p>');
    return;
  }
  try { ME = u8hex(schnorr.getPublicKey(hex2u8(SK))); } catch { showMsg('<h2>Ошибка ключа</h2><p>Не удалось прочитать личность. Переустанови расширение.</p>'); return; }
  names.set(ME, 'Вы');

  const qp = new URLSearchParams(location.search);
  ROOM = (qp.get('room') || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(ROOM)) { ROOM = ME; IS_HOST = true; const u = new URL(location.href); u.searchParams.set('room', ROOM); history.replaceState(null, '', u); }
  else IS_HOST = (ROOM === ME);

  // захват камеры/микрофона (экран — отдельной кнопкой). Фолбэк: только звук
  try { await startMedia({ audio: true, video: { width: 640, height: 480 } }); }
  catch {
    try { await startMedia({ audio: true, video: false }); toast('Камера недоступна, только звук'); }
    catch { showMsg('<h2>Нет доступа к камере и микрофону</h2><p>Разреши доступ в браузере и обнови страницу. Без устройств можно только смотреть и слушать (в этой версии нужен хотя бы микрофон).</p><p><a href="http://noet.nt/">Назад в noet</a></p>'); return; }
  }
  updateControls();

  connectRelays(onSignal);
  if (IS_HOST) {
    $('#hint').textContent = 'Ты хост. Нажми «Пригласить» и отправь ссылку. Звонок идёт через твой компьютер, без серверов.';
  } else {
    $('#hint').textContent = 'Подключаюсь к хосту…';
    // объявляемся хосту, повторяем пока он не ответит offer'ом
    const announce = () => { if (!peers.size) publish({ t: 'join' }, ROOM); };
    announce(); const iv = setInterval(() => { if (peers.size) { clearInterval(iv); $('#hint').textContent = ''; } else announce(); }, 2500);
  }

  // кнопки
  $('#mic').onclick = toggleMic;
  $('#cam').onclick = toggleCam;
  $('#screen').onclick = shareScreen;
  $('#leave').onclick = leave;
  $('#invite').onclick = invite;
}
async function invite() {
  const link = 'http://call.nt/?room=' + ROOM;
  try { await navigator.clipboard.writeText(link); toast('Ссылка-приглашение скопирована'); }
  catch { toast(link); }
}
function leave() {
  try { publish({ t: 'bye' }); } catch {}
  try { if (localStream) localStream.getTracks().forEach((t) => t.stop()); } catch {}
  cleanup(); goHome();
}
window.addEventListener('beforeunload', () => { try { publish({ t: 'bye' }); } catch {} });
main();
