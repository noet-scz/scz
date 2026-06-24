// SCZ — словарь RU/EN. Все видимые строки через t(key) (правило §4). Дефолт RU.
const DICT = {
  ru: {
    guest: 'Гость', login_create: 'Создать личность', loading: 'Загружаю…',
    nav_feed: 'Лента', nav_spaces: 'Сообщества', nav_wiki: 'Вики', nav_call: 'Звонок', nav_profile: 'Профиль',
    you: 'Вы', save: 'Сохранить', cancel: 'Отмена', create: 'Создать', open: 'Открыть', delete: 'Удалить', back: 'Назад', copy: 'Скопировать', copied: 'Скопировано',
    err_generic: 'Что-то пошло не так, попробуй ещё раз.',
    err_no_key: 'Нужна личность: создай её на экране профиля.',
    err_bad_key: 'Ключ должен быть 64 hex-символа.',
    err_offline: 'Реле недоступны. Проверь подключение к сети.',
    // profile
    profile_title: 'Личность', profile_sub: 'Твой ключ это твоя личность. Без почты и паролей.',
    profile_none: 'Личности пока нет.', create_identity: 'Создать личность',
    have_key: 'Уже есть ключ?', import_ph: 'приватный ключ (64 hex)', import_btn: 'Импортировать',
    your_identity: 'Твоя личность', pubkey: 'Публичный ключ',
    backup_now: 'Сохрани ключ сейчас', backup_warn: 'Потеряешь ключ, потеряешь личность. Скопируй и спрячь надёжно.',
    show_key: 'Показать приватный ключ', hide_key: 'Спрятать', forget: 'Забыть ключ на этом устройстве',
    forget_confirm: 'Забыть ключ? Без бэкапа личность не вернуть.',
    name_ph: 'имя', about_ph: 'о себе', avatar_ph: 'ссылка на аватар (необязательно)',
    profile_saved: 'Профиль сохранён.', edit_profile: 'Профиль',
    // feed
    feed_title: 'Лента', feed_sub: 'Подписанные сообщения. Видны всем участникам сети.',
    feed_ph: 'что нового?', feed_post: 'Опубликовать', feed_empty: 'Пока пусто. Напиши первым.', feed_posting: 'Публикую…',
    // spaces
    spaces_title: 'Сообщества', spaces_sub: 'Пространства со своей лентой. Создай своё или загляни в чужое.',
    space_name_ph: 'название сообщества', space_about_ph: 'о чём оно (необязательно)', space_create: 'Создать сообщество',
    spaces_empty: 'Сообществ пока не видно. Создай первое.', space_post_ph: 'написать в сообщество',
    // wiki
    wiki_title: 'Вики', wiki_sub: 'Страницы со связями [[Имя]]. Любой может создать и править.',
    wiki_new: 'Новая страница', wiki_title_ph: 'заголовок',
    wiki_body_ph: 'текст. [[Другая страница]] это ссылка. Пустая строка это абзац, # это подзаголовок.',
    wiki_empty: 'Пока нет страниц.', wiki_edit: 'Править', wiki_all: 'Все страницы',
    wiki_none_yet: 'Такой страницы ещё нет.', wiki_create_it: 'Создать её',
    wiki_need_title: 'Нужен заголовок.', wiki_del_confirm: 'Удалить страницу? Её можно будет создать заново.', edited_by: 'правил',
    // call
    call_title: 'Звонок', call_sub: 'Видео между участниками напрямую, без серверов. Камера и демонстрация экрана.',
    call_start: 'Начать звонок', call_join: 'Войти по коду', call_code_ph: 'код комнаты (64 hex)',
    call_invite: 'Код приглашения', call_invite_hint: 'Отправь этот код тем, кого зовёшь. Звонок идёт через твой компьютер.',
    call_connecting: 'Подключаюсь к хосту…', call_host_you: 'Ты хост',
    mic_on: 'Микрофон', mic_off: 'Включить мик', cam_on: 'Камера', cam_off: 'Включить камеру',
    screen_share: 'Показать экран', screen_stop: 'Остановить показ', leave: 'Выйти',
    call_no_media: 'Нет доступа к камере и микрофону. Разреши доступ и попробуй снова.',
    call_audio_only: 'Камера недоступна, только звук.', screen_on: 'Демонстрация экрана включена.',
    call_ended: 'Звонок завершён.', call_need_key: 'Чтобы звонить, создай личность на экране профиля.',
  },
  en: {
    guest: 'Guest', login_create: 'Create identity', loading: 'Loading…',
    nav_feed: 'Feed', nav_spaces: 'Communities', nav_wiki: 'Wiki', nav_call: 'Call', nav_profile: 'Profile',
    you: 'You', save: 'Save', cancel: 'Cancel', create: 'Create', open: 'Open', delete: 'Delete', back: 'Back', copy: 'Copy', copied: 'Copied',
    err_generic: 'Something went wrong, try again.',
    err_no_key: 'Identity needed: create one on the profile screen.',
    err_bad_key: 'Key must be 64 hex characters.',
    err_offline: 'Relays are unreachable. Check your connection.',
    profile_title: 'Identity', profile_sub: 'Your key is your identity. No email, no password.',
    profile_none: 'No identity yet.', create_identity: 'Create identity',
    have_key: 'Already have a key?', import_ph: 'private key (64 hex)', import_btn: 'Import',
    your_identity: 'Your identity', pubkey: 'Public key',
    backup_now: 'Back up your key now', backup_warn: 'Lose the key, lose the identity. Copy and store it safely.',
    show_key: 'Show private key', hide_key: 'Hide', forget: 'Forget key on this device',
    forget_confirm: 'Forget the key? Without a backup the identity is gone.',
    name_ph: 'name', about_ph: 'about you', avatar_ph: 'avatar url (optional)',
    profile_saved: 'Profile saved.', edit_profile: 'Profile',
    feed_title: 'Feed', feed_sub: 'Signed messages, visible to everyone on the network.',
    feed_ph: "what's new?", feed_post: 'Post', feed_empty: 'Empty for now. Be the first.', feed_posting: 'Posting…',
    spaces_title: 'Communities', spaces_sub: 'Spaces with their own feed. Create one or visit others.',
    space_name_ph: 'community name', space_about_ph: 'what it is about (optional)', space_create: 'Create community',
    spaces_empty: 'No communities yet. Create the first one.', space_post_ph: 'post to the community',
    wiki_title: 'Wiki', wiki_sub: 'Pages linked by [[Name]]. Anyone can create and edit.',
    wiki_new: 'New page', wiki_title_ph: 'title',
    wiki_body_ph: 'text. [[Another page]] is a link. A blank line is a paragraph, # is a subheading.',
    wiki_empty: 'No pages yet.', wiki_edit: 'Edit', wiki_all: 'All pages',
    wiki_none_yet: 'No such page yet.', wiki_create_it: 'Create it',
    wiki_need_title: 'A title is required.', wiki_del_confirm: 'Delete the page? It can be created again later.', edited_by: 'edited by',
    call_title: 'Call', call_sub: 'Video directly between participants, no servers. Camera and screen sharing.',
    call_start: 'Start a call', call_join: 'Join by code', call_code_ph: 'room code (64 hex)',
    call_invite: 'Invite code', call_invite_hint: 'Send this code to people you invite. The call runs through your computer.',
    call_connecting: 'Connecting to host…', call_host_you: 'You are the host',
    mic_on: 'Microphone', mic_off: 'Unmute', cam_on: 'Camera', cam_off: 'Turn camera on',
    screen_share: 'Share screen', screen_stop: 'Stop sharing', leave: 'Leave',
    call_no_media: 'No access to camera and microphone. Allow access and try again.',
    call_audio_only: 'Camera unavailable, audio only.', screen_on: 'Screen sharing on.',
    call_ended: 'Call ended.', call_need_key: 'To call, create an identity on the profile screen.',
  },
};

let lang = (typeof localStorage !== 'undefined' && localStorage.getItem('scz_lang')) || 'ru';
export function getLang() { return lang; }
export function setLang(l) {
  if (!DICT[l]) return;
  lang = l;
  try { localStorage.setItem('scz_lang', l); } catch {}
  document.documentElement.lang = l;
  document.dispatchEvent(new Event('scz:lang'));
}
export function t(k) {
  return (DICT[lang] && DICT[lang][k]) || DICT.ru[k] || k;
}
