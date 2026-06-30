# Единая база задач (общая с мозгом) — для лид-агента BersonCare

Все задачи по этому репозиторию ведём в ОБЩЕЙ базе задач (Postgres мозга), проект = `bcb`.
Зачем: владелец одним запросом видит «что ждёт его ответа» по всем проектам; ничего не теряется;
не нужно перечитывать документы.

## КРИТИЧНО: только через утилиту-порт, НИКОГДА сырым SQL
- Работать с задачами ТОЛЬКО через `node /home/dev/brain/tools/taskdb.mjs`.
- НИКОГДА не трогать таблицу `plan_tasks` напрямую — ни `psql`, ни `INSERT/UPDATE/SELECT` из кода/ORM.
  Один порт = согласованность транзакций + единая точка контроля доступа (чужой не полезет в БД мимо).
- Не хватает операции — допиши САМУ утилиту (через Нео), не обходи её.
- При `add` бери возвращённый `#id` и используй ИМЕННО его в последующих `set` (агенты пишут параллельно — номера не угадывать).

Инструмент (запускать как есть, из любой папки):
- посмотреть свои задачи:      `node /home/dev/brain/tools/taskdb.mjs list bcb`  (или `list` — все)
- найти задачу:                `node /home/dev/brain/tools/taskdb.mjs find bcb "<подстрока>"`
- что ждёт ответа владельца:    `node /home/dev/brain/tools/taskdb.mjs waiting`
- добавить задачу:              `node /home/dev/brain/tools/taskdb.mjs add "<заголовок>" "<блок>" bcb-lead bcb`
- взять следующую (для авто):   `node /home/dev/brain/tools/taskdb.mjs next-json bcb`
- отметить статус:              `node /home/dev/brain/tools/taskdb.mjs set <id> status <todo|doing|blocked|done>`
- ход/ошибка/вопрос/печати:     `set <id> note "..."` | `set <id> question "..."` | `set <id> owner_waiting true` | `set <id> seal_test true` | `set <id> commit_ref <hash>`

Правило: начал задачу — `status doing`; упёрся в решение владельца — `status blocked` + `owner_waiting true` + `question`;
довёл и проверил — `status done` + `seal_test true` + `commit_ref`. Так владелец видит реальную картину без чтения файлов.
