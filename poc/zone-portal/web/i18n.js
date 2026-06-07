// noet — i18n. Один словарь, window.t(key). Дефолт RU, выбор хранится в localStorage.
(function () {
  const DICT = {
    ru: {
      guest: 'Гость', login: 'Войти', logout: 'Выйти', account: 'Аккаунт', profile: 'Профиль',
      search_nav: 'Поиск', relay_nav: 'Реле', hide: 'Спрятать', back: 'Назад', cancel: 'Отмена',
      // search
      search_ph: 'искать в зоне', searching: 'ищу…', nothing: 'ничего не найдено',
      // relay
      relay_title: 'Реле', relay_sub: 'общее пространство зоны',
      empty_relay: 'пока тихо. Будь первым.', compose_ph: 'написать в реле…', send: 'Отправить',
      gate: 'Чтобы писать, нужно войти.', gate_read: 'Войди, чтобы видеть реле.', today: 'сегодня', yesterday: 'вчера',
      // account
      acc_welcome: 'Личность noet', acc_guest_hint: 'Ты не вошёл. Личность это твой ключ, без почты и паролей.',
      create_identity: 'Создать личность', have_key: 'У меня уже есть ключ', import_key: 'Импортировать ключ',
      import_ph: 'приватный ключ (64 hex)', key_ready: 'Ключ готов и сохранён в этом браузере.',
      download_backup: 'Скачать бэкап', backup_warn: 'Сохрани бэкап. Потеряешь ключ — потеряешь личность.',
      choose_handle: 'Выбери имя в зоне', handle_ph: '2–20 символов: a-z 0-9 _', invite_ph: 'инвайт-код',
      register_btn: 'Зарегистрироваться', signin_btn: 'Войти этим ключом',
      your_profile: 'Твой профиль', display_name: 'Отображаемое имя', dname_ph: 'как тебя показывать',
      avatar_lbl: 'Аватар: ссылка на картинку или эмодзи', avatar_ph: '🜂 или https://…',
      about_lbl: 'О себе', about_ph: 'пара слов', save: 'Сохранить', saved: 'Сохранено',
      your_names: 'Мои имена', no_names: 'пока нет', claim_title: 'Занять имя',
      name_ph: 'blog.nt', cid_ph: 'CID (bafy…)', claim_btn: 'Занять', claimed: 'занято',
      create_page: 'Создать страницу', page_name: 'Имя в зоне', page_title: 'Заголовок',
      page_title_ph: 'о чём страница', page_body: 'Текст',
      page_body_ph: 'Пиши свободно. Пустая строка это новый абзац, строка с # это заголовок.',
      publish_btn: 'Опубликовать', published: 'Опубликовано:',
      show_backup: 'Скачать бэкап ключа', forget_key: 'Забыть ключ в этом браузере',
      forget_confirm: 'Забыть ключ в этом браузере? Без бэкапа личность не вернуть.',
      key_label: 'ключ', signed_in_as: 'Вход выполнен',
      // errors
      err_bad_sig: 'Подпись не прошла.', err_bad_challenge: 'Срок входа истёк, попробуй ещё раз.',
      err_bad_handle: 'Имя: 2–20 символов a-z 0-9 _.', err_handle_taken: 'Это имя уже занято.',
      err_invite_invalid: 'Инвайт неверный или уже использован.', err_need_login: 'Сначала войди.',
      err_name_format: 'Имя должно быть вида blog.nt.', err_name_taken: 'Имя занято другим участником.',
      err_need_cid: 'Нужен CID.', err_no_key: 'В этом браузере нет ключа.',
      err_network: 'Нет связи, попробуй ещё раз.', err_generic: 'Что-то пошло не так, попробуй ещё раз.',
    },
    en: {
      guest: 'Guest', login: 'Sign in', logout: 'Sign out', account: 'Account', profile: 'Profile',
      search_nav: 'Search', relay_nav: 'Relay', hide: 'Hide', back: 'Back', cancel: 'Cancel',
      search_ph: 'search the zone', searching: 'searching…', nothing: 'nothing found',
      relay_title: 'Relay', relay_sub: 'shared space of the zone',
      empty_relay: 'quiet so far. Be the first.', compose_ph: 'write to the relay…', send: 'Send',
      gate: 'Sign in to post.', gate_read: 'Sign in to see the relay.', today: 'today', yesterday: 'yesterday',
      acc_welcome: 'noet identity', acc_guest_hint: 'You are not signed in. Your identity is a key, no email or passwords.',
      create_identity: 'Create identity', have_key: 'I already have a key', import_key: 'Import key',
      import_ph: 'private key (64 hex)', key_ready: 'Key is ready and stored in this browser.',
      download_backup: 'Download backup', backup_warn: 'Save the backup. Lose the key, lose the identity.',
      choose_handle: 'Choose your zone handle', handle_ph: '2–20 chars: a-z 0-9 _', invite_ph: 'invite code',
      register_btn: 'Register', signin_btn: 'Sign in with this key',
      your_profile: 'Your profile', display_name: 'Display name', dname_ph: 'how to show you',
      avatar_lbl: 'Avatar: image link or emoji', avatar_ph: '🜂 or https://…',
      about_lbl: 'About', about_ph: 'a few words', save: 'Save', saved: 'Saved',
      your_names: 'My names', no_names: 'none yet', claim_title: 'Claim a name',
      name_ph: 'blog.nt', cid_ph: 'CID (bafy…)', claim_btn: 'Claim', claimed: 'claimed',
      create_page: 'Create a page', page_name: 'Zone name', page_title: 'Title',
      page_title_ph: 'what the page is about', page_body: 'Text',
      page_body_ph: 'Write freely. A blank line starts a paragraph, a line with # is a heading.',
      publish_btn: 'Publish', published: 'Published:',
      show_backup: 'Download key backup', forget_key: 'Forget key on this device',
      forget_confirm: 'Forget the key on this device? Without a backup the identity is gone.',
      key_label: 'key', signed_in_as: 'Signed in',
      err_bad_sig: 'Signature check failed.', err_bad_challenge: 'Login expired, try again.',
      err_bad_handle: 'Handle: 2–20 chars a-z 0-9 _.', err_handle_taken: 'That handle is taken.',
      err_invite_invalid: 'Invite is invalid or already used.', err_need_login: 'Sign in first.',
      err_name_format: 'Name must look like blog.nt.', err_name_taken: 'Name taken by another member.',
      err_need_cid: 'CID required.', err_no_key: 'No key in this browser.',
      err_network: 'Network error, try again.', err_generic: 'Something went wrong, try again.',
    },
  };
  let lang = localStorage.getItem('noet_lang');
  if (!lang) lang = (navigator.language || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en';
  window.noetLang = () => lang;
  window.setLang = (l) => { lang = DICT[l] ? l : 'ru'; localStorage.setItem('noet_lang', lang); window.dispatchEvent(new Event('noetlang')); };
  window.t = (k) => (DICT[lang] && DICT[lang][k]) || DICT.ru[k] || k;
})();
