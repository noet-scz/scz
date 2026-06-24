// SCZ — звонок. WebRTC между участниками напрямую, без своих серверов. Топология host-star
// (клиент-форвардер = создатель комнаты), сигналинг — эфемерные события на реле, подпись в
// Rust. Камера + демонстрация экрана. getUserMedia работает: вебвью Tauri = secure context.
import { t } from '../i18n.js';
import * as id from '../sdk/identity.js';
import { openSignal } from '../sdk/relays.js';
import { esc, resolveName, shortPk, copy, toast } from '../ui.js';

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
const CALL_KIND = 21000;   // эфемерный диапазон: реле не хранят сигналинг

export async function mountCall(view, ctx) {
  const me = ctx.me();
  if (!me.hasKey) {
    view.innerHTML = `<div class="wrap"><h1>${esc(t('call_title'))}</h1>
      <div class="box mut">${esc(t('call_need_key'))} <a id="go">${esc(t('create_identity'))}</a></div></div>`;
    view.querySelector('#go').onclick = () => ctx.go('profile');
    return;
  }

  let engine = null;
  function lobby() {
    if (engine) { engine.stop(); engine = null; }
    view.innerHTML = `<div class="wrap">
      <h1>${esc(t('call_title'))}</h1><p class="sub">${esc(t('call_sub'))}</p>
      <div class="box"><button id="start">${esc(t('call_start'))}</button></div>
      <div class="box">
        <div class="mut" style="margin-bottom:.5rem">${esc(t('call_join'))}</div>
        <input id="code" placeholder="${esc(t('call_code_ph'))}" autocomplete="off" spellcheck="false">
        <button class="ghost" id="join">${esc(t('call_join'))}</button>
        <div class="msg" id="msg"></div>
      </div>
    </div>`;
    view.querySelector('#start').onclick = () => start(me.pubkey, true);
    view.querySelector('#join').onclick = () => {
      let v = (view.querySelector('#code').value || '').trim().toLowerCase();
      const m = v.match(/[0-9a-f]{64}/); if (m) v = m[0];
      if (!/^[0-9a-f]{64}$/.test(v)) { const e = view.querySelector('#msg'); e.textContent = t('err_bad_key'); e.className = 'msg err'; return; }
      start(v, v === me.pubkey);
    };
  }

  function start(room, isHost) {
    engine = runCall(view, { me: me.pubkey, room, isHost, onLeave: lobby });
  }

  lobby();
  return () => { if (engine) { try { engine.stop(); } catch {} engine = null; } };
}

// ---- движок звонка ----
function runCall(view, { me: ME, room: ROOM, isHost: IS_HOST, onLeave }) {
  const peers = new Map();       // pubkey -> { pc, pendingIce, making, ignore, polite }
  const streamOwner = new Map(); // streamId -> pubkey
  const tiles = new Map();       // key -> .tile
  const nameCache = new Map();
  const localVideoSenders = new Set();
  let localStream = null, camTrack = null, screenTrack = null, sharing = false;
  let micOn = true, camOn = true, sig = null, stopped = false, helloIv = null;

  view.innerHTML = `<div class="wrap">
    <div class="row" style="margin-bottom:.6rem;justify-content:space-between">
      <div class="row"><button class="ghost" id="invite">${esc(t('call_invite'))}</button><span class="mut" id="hint" style="font-size:.85rem"></span></div>
    </div>
    <div class="callgrid" id="grid"></div>
    <div class="callbar">
      <button class="ghost" id="mic">${esc(t('mic_on'))}</button>
      <button class="ghost" id="cam">${esc(t('cam_on'))}</button>
      <button class="ghost" id="screen">${esc(t('screen_share'))}</button>
      <button class="danger" id="leave">${esc(t('leave'))}</button>
    </div>
    <div class="msg" id="cmsg" style="margin-top:.6rem"></div>
  </div>`;
  const grid = view.querySelector('#grid');
  const hint = view.querySelector('#hint');
  view.querySelector('#invite').onclick = async () => { if (await copy(ROOM)) toast(t('copied')); };
  view.querySelector('#leave').onclick = () => stop(true);
  view.querySelector('#mic').onclick = toggleMic;
  view.querySelector('#cam').onclick = toggleCam;
  view.querySelector('#screen').onclick = shareScreen;
  hint.textContent = IS_HOST ? t('call_host_you') : t('call_connecting');

  // ---- tiles ----
  function tileLabel(pub) { return nameCache.get(pub) || (pub === ME ? t('you') : shortPk(pub)); }
  function upsertTile(key, stream, isMe) {
    let tile = tiles.get(key);
    if (!tile) {
      tile = document.createElement('div'); tile.className = 'tile' + (isMe ? ' me' : '');
      tile.innerHTML = `<video autoplay playsinline ${isMe ? 'muted' : ''}></video><span class="lbl"></span>`;
      grid.appendChild(tile); tiles.set(key, tile);
    }
    const v = tile.querySelector('video');
    if (stream && v.srcObject !== stream) v.srcObject = stream;
    tile.querySelector('.lbl').textContent = tileLabel(key);
    if (!isMe && key && key.length === 64) resolveName(key).then((n) => { if (n) { nameCache.set(key, n); const tt = tiles.get(key); if (tt) tt.querySelector('.lbl').textContent = n; } });
    return tile;
  }
  function relabel(sid, pub) {
    const tl = tiles.get(sid);
    if (tl && pub && pub !== sid) { tiles.delete(sid); tiles.set(pub, tl); }
    const tt = tiles.get(pub); if (tt) tt.querySelector('.lbl').textContent = tileLabel(pub);
  }
  function removeTile(key) { const tl = tiles.get(key); if (tl) { try { tl.remove(); } catch {} tiles.delete(key); } }

  // ---- WebRTC (perfect negotiation) ----
  function makePc(remotePub) {
    const pc = new RTCPeerConnection({ iceServers: STUN });
    const p = { pc, pendingIce: [], making: false, ignore: false, polite: !IS_HOST };
    peers.set(remotePub, p);
    if (localStream) for (const tr of localStream.getTracks()) { const s = pc.addTrack(tr, localStream); if (tr.kind === 'video') localVideoSenders.add(s); }
    if (localStream) streamOwner.set(localStream.id, ME);
    pc.onicecandidate = (e) => { if (e.candidate) send({ t: 'ice', c: e.candidate }, remotePub); };
    pc.ontrack = (e) => onRemoteTrack(remotePub, e);
    pc.onconnectionstatechange = () => { const st = pc.connectionState; if (st === 'failed' || st === 'closed') dropPeer(remotePub); };
    pc.onnegotiationneeded = async () => {
      try { p.making = true; await pc.setLocalDescription(); send({ t: 'desc', sdp: pc.localDescription }, remotePub); }
      catch (e) { console.warn('nn', e); } finally { p.making = false; }
    };
    return p;
  }
  async function flushIce(p) { while (p.pendingIce.length) { try { await p.pc.addIceCandidate(p.pendingIce.shift()); } catch {} } }

  function forwardTrack(srcPub, track, stream) {
    streamOwner.set(stream.id, srcPub);
    for (const [pub, p] of peers) {
      if (pub === srcPub) continue;
      if (!p.pc.getSenders().some((s) => s.track === track)) { try { p.pc.addTrack(track, stream); } catch {} }
    }
    announceMap();
  }
  function announceMap() {
    if (!IS_HOST) return;
    const map = {}; for (const [sid, pub] of streamOwner) map[sid] = pub;
    send({ t: 'map', map });
  }
  function onRemoteTrack(remotePub, e) {
    const stream = e.streams[0] || new MediaStream([e.track]);
    if (IS_HOST) { streamOwner.set(stream.id, remotePub); forwardTrack(remotePub, e.track, stream); upsertTile(remotePub, stream); }
    else { const owner = streamOwner.get(stream.id); upsertTile(owner || stream.id, stream); }
  }

  async function onSignal(ev) {
    if (ev.pubkey === ME || stopped) return;
    const pTag = (ev.tags.find((x) => x[0] === 'p') || [])[1];
    let msg; try { msg = JSON.parse(ev.content); } catch { return; }
    const from = ev.pubkey;

    if (msg.t === 'map') { if (from !== ROOM) return; Object.entries(msg.map || {}).forEach(([sid, pub]) => { streamOwner.set(sid, pub); relabel(sid, pub); }); return; }
    if (msg.t === 'bye') { if (from === ROOM && !IS_HOST) endByHost(); else dropPeer(from); return; }
    if (msg.t === 'join') { if (IS_HOST && !peers.has(from)) makePc(from); return; }  // host: pc -> negotiationneeded зашлёт offer
    if (pTag && pTag !== ME) return;

    if (msg.t === 'desc') {
      let p = peers.get(from);
      if (!p) { if (from === ROOM || IS_HOST) p = makePc(from); else return; }
      const desc = msg.sdp;
      const collision = desc.type === 'offer' && (p.making || p.pc.signalingState !== 'stable');
      p.ignore = !p.polite && collision;
      if (p.ignore) return;
      try {
        await p.pc.setRemoteDescription(desc); await flushIce(p);
        if (desc.type === 'offer') { await p.pc.setLocalDescription(); send({ t: 'desc', sdp: p.pc.localDescription }, from); }
        if (hint) hint.textContent = IS_HOST ? t('call_host_you') : '';
      } catch (e) { console.warn('desc', e); }
    } else if (msg.t === 'ice') {
      const p = peers.get(from); if (!p) return;
      if (p.pc.remoteDescription && p.pc.remoteDescription.type) { try { await p.pc.addIceCandidate(msg.c); } catch {} }
      else p.pendingIce.push(msg.c);
    }
  }

  function dropPeer(pub) {
    const p = peers.get(pub); if (!p) return;
    try { p.pc.close(); } catch {} peers.delete(pub); removeTile(pub);
    if (IS_HOST) { for (const [sid, owner] of streamOwner) if (owner === pub) streamOwner.delete(sid); announceMap(); }
  }

  // ---- сигналинг ----
  async function send(obj, toPub) {
    if (!sig || stopped) return;
    const tags = [['r', ROOM]]; if (toPub) tags.push(['p', toPub]);
    try { await sig.send({ kind: CALL_KIND, tags, content: JSON.stringify(obj) }); } catch {}
  }

  // ---- медиа ----
  async function startMedia() {
    try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 480 } }); }
    catch {
      try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); camOn = false; toast(t('call_audio_only')); }
      catch { throw new Error('no_media'); }
    }
    camTrack = localStream.getVideoTracks()[0] || null;
    streamOwner.set(localStream.id, ME);
    upsertTile(ME, localStream, true);
  }
  function replaceOutgoingVideo(track) { localVideoSenders.forEach((s) => { try { s.replaceTrack(track); } catch {} }); }
  async function shareScreen() {
    if (sharing) return stopShare();
    let ds; try { ds = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false }); } catch { return; }
    screenTrack = ds.getVideoTracks()[0];
    replaceOutgoingVideo(screenTrack);
    screenTrack.onended = () => stopShare();
    sharing = true;
    const tl = tiles.get(ME); if (tl) { tl.classList.add('sharing'); tl.querySelector('video').srcObject = ds; }
    updateControls(); toast(t('screen_on'));
  }
  function stopShare() {
    if (!sharing) return;
    try { if (screenTrack) screenTrack.stop(); } catch {}
    replaceOutgoingVideo(camOn ? camTrack : null);
    sharing = false; screenTrack = null;
    const tl = tiles.get(ME); if (tl) { tl.classList.remove('sharing'); tl.querySelector('video').srcObject = localStream; }
    updateControls();
  }
  function toggleMic() { micOn = !micOn; localStream.getAudioTracks().forEach((tr) => tr.enabled = micOn); updateControls(); }
  function toggleCam() { camOn = !camOn; if (camTrack) camTrack.enabled = camOn; updateControls(); }
  function updateControls() {
    const mic = view.querySelector('#mic'), cam = view.querySelector('#cam'), scr = view.querySelector('#screen');
    if (mic) mic.textContent = micOn ? t('mic_on') : t('mic_off');
    if (cam) cam.textContent = camOn ? t('cam_on') : t('cam_off');
    if (scr) scr.textContent = sharing ? t('screen_stop') : t('screen_share');
  }

  function endByHost() { const m = view.querySelector('#cmsg'); if (m) m.textContent = t('call_ended'); stop(false); }

  function stop(announce) {
    if (stopped) return; stopped = true;
    clearInterval(helloIv);
    if (announce) { try { send({ t: 'bye' }); } catch {} }
    try { if (localStream) localStream.getTracks().forEach((tr) => tr.stop()); } catch {}
    try { if (screenTrack) screenTrack.stop(); } catch {}
    for (const [, p] of peers) { try { p.pc.close(); } catch {} }
    peers.clear();
    setTimeout(() => { try { if (sig) sig.close(); } catch {} }, 300);
    if (typeof onLeave === 'function') onLeave();
  }

  // ---- запуск ----
  (async () => {
    try { await startMedia(); } catch { const m = view.querySelector('#cmsg'); if (m) { m.textContent = t('call_no_media'); m.className = 'msg err'; } return; }
    updateControls();
    sig = openSignal({ kinds: [CALL_KIND], '#r': [ROOM], since: Math.floor(Date.now() / 1000) - 3 }, onSignal);
    if (!IS_HOST) {
      const announce = () => { if (!peers.size && !stopped) send({ t: 'join' }, ROOM); };
      announce(); helloIv = setInterval(() => { if (peers.size) { clearInterval(helloIv); if (hint) hint.textContent = ''; } else announce(); }, 2500);
    }
  })();

  window.addEventListener('beforeunload', () => { try { send({ t: 'bye' }); } catch {} });
  return { stop: () => stop(true) };
}
