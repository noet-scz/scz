// noet — дом/поиск. Отдельный файл, т.к. на странице расширения инлайн-скрипты запрещены CSP.
const go = (h) => { location.href = 'http://' + h + '/'; };
document.getElementById('mine').onclick = (e) => { e.preventDefault(); go('id.nt'); };
document.getElementById('people').onclick = (e) => { e.preventDefault(); go('people.nt'); };
document.getElementById('feed').onclick = (e) => { e.preventDefault(); go('relay.nt'); };
document.getElementById('dev').onclick = (e) => { e.preventDefault(); go('dev.nt'); };
document.getElementById('f').addEventListener('submit', (e) => {
  e.preventDefault();
  let v = (document.getElementById('q').value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!v) return;
  if (!/\.(nt|me)$/.test(v)) v += '.me';   // «nyx» → «nyx.me»
  go(v);
});
