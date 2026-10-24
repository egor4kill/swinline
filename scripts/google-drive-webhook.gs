// ====================================================================
// SWINLINE → Google Drive: вебхук для архива истории игр
//
// КАК ПОДКЛЮЧИТЬ (5 минут):
// 1. Открой https://script.google.com → «Новый проект»
// 2. Удали всё из Code.gs и вставь этот код ЦЕЛИКОМ
// 3. Нажми «Развернуть» → «Новое развертывание»
// 4. Тип (значок шестерёнки) → «Веб-приложение»
//    - Описание: swinline archive
//    - Выполнять как: «От моего имени» (Execute as: Me)
//    - Доступ: «Все» (Anyone) — защита секретом в URL ниже
// 5. Нажми «Развернуть», разреши доступ к Google Drive (разово)
// 6. Скопируй URL веб-приложения (заканчивается на /exec)
//    и отправь его ИИ-агенту — он добавит его в архиватор.
//    URL уже можно использовать как есть: токен подставляется
//    автоматически (?token=...).
//
// Архив будет складываться в папку «SWINLINE» на твоём Диске,
// файл на месяц: game-history-2026-10.md (перезаписывается целиком).
// ====================================================================

var SECRET = '7453335a9b2c59bc5fbdb6b978f9951168a7f68b622c6e50';

function doPost(e) {
  if (!e.parameter || !e.parameter.token || e.parameter.token !== SECRET) {
    return ContentService.createTextOutput('forbidden').setCode(403);
  }
  var body = JSON.parse(e.postData.contents);
  var folder = getOrCreateFolder('SWINLINE');
  var it = folder.getFilesByName(body.filename);
  var file;
  if (it.hasNext()) {
    file = it.next();
    file.setContent(body.content);
  } else {
    file = folder.createFile(body.filename, body.content, MimeType.PLAIN_TEXT);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true, id: file.getId() }));
}

function doGet() {
  return ContentService.createTextOutput('SWINLINE archive webhook: POST only').setCode(405);
}

function getOrCreateFolder(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
