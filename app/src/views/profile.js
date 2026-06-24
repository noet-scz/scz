// SCZ — экран личности: создание/импорт/бэкап ключа и редактор профиля (правила §5/§6).
import { t } from '../i18n.js';
import * as id from '../sdk/identity.js';
import { identity } from '../sdk/primitives.js';
import { esc, avatar, copy, toast } from '../ui.js';

export async function mountProfile(view, ctx) {
  const me = ctx.me();
  if (!me.hasKey) return renderNew(view, ctx);
  return renderHave(view, ctx);
}

function setMsg(el, text, cls) { if (el) { el.textContent = text || ''; el.className = 'msg ' + (cls || ''); } }

function renderNew(view, ctx) {
  view.innerHTML = `<div class="wrap">
    <h1>${esc(t('profile_title'))}</h1>
    <p class="sub">${esc(t('profile_sub'))}</p>
    <div class="box">
      <button id="create">${esc(t('create_identity'))}</button>
    </div>
    <div class="box">
      <div class="mut" style="margin-bottom:.5rem">${esc(t('have_key'))}</div>
      <input id="imp" placeholder="${esc(t('import_ph'))}" autocomplete="off" spellcheck="false">
      <button class="ghost" id="doimp">${esc(t('import_btn'))}</button>
      <div class="msg" id="msg"></div>
    </div>
  </div>`;
  view.querySelector('#create').onclick = async () => {
    try {
      const r = await id.create();
      await ctx.refreshMe();
      showBackup(view, ctx, r.nsec);
    } catch (e) { setMsg(view.querySelector('#msg'), t('err_generic'), 'err'); }
  };
  view.querySelector('#doimp').onclick = async () => {
    let v = (view.querySelector('#imp').value || '').trim().toLowerCase();
    const m = v.match(/[0-9a-f]{64}/); if (m) v = m[0];
    if (!/^[0-9a-f]{64}$/.test(v)) { setMsg(view.querySelector('#msg'), t('err_bad_key'), 'err'); return; }
    try { await id.importKey(v); await ctx.refreshMe(); ctx.go('feed'); }
    catch { setMsg(view.querySelector('#msg'), t('err_bad_key'), 'err'); }
  };
}

function showBackup(view, ctx, nsec) {
  view.innerHTML = `<div class="wrap">
    <h1>${esc(t('backup_now'))}</h1>
    <p class="sub">${esc(t('backup_warn'))}</p>
    <div class="box">
      <div class="mono" style="margin-bottom:.6rem">${esc(nsec)}</div>
      <div class="row"><button id="copy">${esc(t('copy'))}</button><button class="ghost" id="done">${esc(t('save'))}</button></div>
    </div>
  </div>`;
  view.querySelector('#copy').onclick = async () => { if (await copy(nsec)) toast(t('copied')); };
  view.querySelector('#done').onclick = () => ctx.go('feed');
}

async function renderHave(view, ctx) {
  const me = ctx.me();
  let prof = me.profile || {};
  try { prof = await identity.profile(me.pubkey); } catch {}
  view.innerHTML = `<div class="wrap">
    <h1>${esc(t('your_identity'))}</h1>
    <div class="box">
      <div class="row" style="gap:.7rem;margin-bottom:.6rem">
        <img class="avatar" width="48" height="48" src="${avatar(me.pubkey, prof.name, prof.picture)}">
        <div><div style="font-weight:600">${esc(prof.name || t('guest'))}</div>
        <div class="mut" style="font-size:.8rem">${esc(t('pubkey'))}</div></div>
      </div>
      <div class="mono">${esc(me.pubkey)}</div>
      <div class="row" style="margin-top:.6rem"><button class="ghost" id="copypk">${esc(t('copy'))}</button>
      <button class="ghost" id="showkey">${esc(t('show_key'))}</button></div>
      <div class="mono" id="keybox" style="margin-top:.5rem;display:none"></div>
    </div>

    <div class="box">
      <div class="mut" style="margin-bottom:.5rem">${esc(t('edit_profile'))}</div>
      <input id="name" placeholder="${esc(t('name_ph'))}" value="${esc(prof.name || '')}">
      <textarea id="about" placeholder="${esc(t('about_ph'))}">${esc(prof.about || '')}</textarea>
      <input id="pic" placeholder="${esc(t('avatar_ph'))}" value="${esc(prof.picture || '')}">
      <div class="row"><button id="save">${esc(t('save'))}</button><span class="msg" id="msg"></span></div>
    </div>

    <div class="box">
      <button class="danger" id="forget">${esc(t('forget'))}</button>
    </div>
  </div>`;

  view.querySelector('#copypk').onclick = async () => { if (await copy(me.pubkey)) toast(t('copied')); };
  let shown = false;
  view.querySelector('#showkey').onclick = async (e) => {
    const box = view.querySelector('#keybox');
    if (shown) { box.style.display = 'none'; shown = false; e.target.textContent = t('show_key'); return; }
    try { const sk = await id.exportKey(); box.textContent = sk; box.style.display = 'block'; shown = true; e.target.textContent = t('hide_key'); } catch {}
  };
  view.querySelector('#save').onclick = async () => {
    const meta = {
      name: view.querySelector('#name').value.trim(),
      about: view.querySelector('#about').value.trim(),
      picture: view.querySelector('#pic').value.trim(),
    };
    setMsg(view.querySelector('#msg'), '…');
    try { await identity.setProfile(meta); await ctx.refreshMe(); setMsg(view.querySelector('#msg'), t('profile_saved'), 'ok'); }
    catch (e) { setMsg(view.querySelector('#msg'), e && e.toString().includes('no_key') ? t('err_no_key') : t('err_offline'), 'err'); }
  };
  view.querySelector('#forget').onclick = async () => {
    if (!confirm(t('forget_confirm'))) return;
    try { await id.forget(); await ctx.refreshMe(); ctx.go('profile'); renderRouteReload(); } catch {}
  };
}

function renderRouteReload() { location.reload(); }
