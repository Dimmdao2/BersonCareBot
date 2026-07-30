# Единая база задач (общая с мозгом) — для лид-агента BersonCare

**Что является карточкой и когда допустим `add`: [`TASKDB_RULES.md`](TASKDB_RULES.md). Этот файл описывает порт
и статусы; при конфликте гранулярности побеждает `TASKDB_RULES.md`.**

Цельные workstream-карточки по этому репозиторию ведём в ОБЩЕЙ базе задач (Postgres мозга), проект = `bcb`.
Зачем: владелец одним запросом видит «что ждёт его ответа» по всем проектам; ничего не теряется;
не нужно перечитывать документы.

Содержимое карточки по решению владельца 30.07.2026: короткое название, статус, ссылка на канонический план
и обязательное краткое понятное описание сути workstream. Ход, подробности, решения, вопросы, проверки
и доказательства живут в плане, а не в narrative-полях карточки.

## КРИТИЧНО: только через утилиту-порт, НИКОГДА сырым SQL

- Работать с задачами ТОЛЬКО через `node /home/dev/brain/tools/taskdb.mjs`.
- НИКОГДА не трогать таблицу `plan_tasks` напрямую — ни `psql`, ни `INSERT/UPDATE/SELECT` из кода/ORM.
  Один порт = согласованность транзакций + единая точка контроля доступа (чужой не полезет в БД мимо).
- Не хватает операции — допиши САМУ утилиту (через Нео), не обходи её.
- Если `add` разрешён гейтом `TASKDB_RULES.md`, бери возвращённый `#id` и используй ИМЕННО его в последующих
  `set` (агенты пишут параллельно — номера не угадывать).

Инструмент (запускать как есть, из любой папки):

- посмотреть свои задачи: `node /home/dev/brain/tools/taskdb.mjs list bcb` (или `list` — все)
- найти задачу: `node /home/dev/brain/tools/taskdb.mjs find bcb "<подстрока>"`
- что ждёт ответа владельца: `node /home/dev/brain/tools/taskdb.mjs waiting`
- исключение для нового owner-requested/approved workstream:
  `node /home/dev/brain/tools/taskdb.mjs add "<заголовок>" "<обязательное краткое понятное описание>" bcb-lead bcb --plan docs/_TODO/<plan>.md`
- взять следующую (для авто): `node /home/dev/brain/tools/taskdb.mjs next-json bcb`
- отметить статус: `node /home/dev/brain/tools/taskdb.mjs set <id> status <todo|doing|blocked|done>`
- служебные поля: `set <id> owner_waiting true` | `set <id> seal_test true` | `set <id> seal_audit true` |
  `set <id> commit_ref <hash>`. Narrative `note`/`question` не заполнять.

Правило: начал задачу — `status doing`; упёрся в решение владельца — записал точный вопрос в план,
поставил `status blocked` + служебный `owner_waiting true`; довёл и проверил — `status done` + требуемые
seals/`commit_ref`. Владелец видит состояние в карточке, а содержание — по одной ссылке на план.

Для workstream-карточки перед `status done` обязательна полная матрица каждого referenced atomic owner checkbox:
code/test/runtime evidence либо явный owner defer/cancel со ссылкой и причиной. Aggregate worker `done`, audit
`PASS`, обычный blocker или перенос в несогласованный follow-up не закрывают taskdb-карточку; она остаётся
`doing/blocked`, синхронно с plan/roadmap/LOG.
