# Инструкции для AI-агентов — BersonCareBot

## 🔴 ГЛАВНОЕ ПРАВИЛО: перед действием проверь, нет ли на него правила

Прежде чем писать код, заводить файл, запускать агента, трогать базу, ветку или деплой — открой раздел
«Маршрут» ниже и прочитай разделы своей области. Правило почти всегда уже есть; выполнять по наитию там,
где оно написано, — самая частая и самая дорогая ошибка в этом репозитории.

**Читать файл целиком не требуется.** Маршрут ведёт к нужным разделам по маске путей.

**Смысл:** правила здесь написаны не из вкуса, а после провалов, каждый из которых что-то стоил. Агент,
который их не открыл, повторяет ровно тот провал, ради которого правило и появилось.

Этот файл — единственный канонический текст правил для агентов всех моделей и для Cursor.
`.cursor/rules/000-start-here.mdc` зеркалит раздел «Маршрут» ниже для автоподачи Cursor и текста не дублирует;
`.cursor/rules/tests-check-behaviour-not-circumstances.mdc` и `.cursor/rules/test-execution-policy.md` — отдельные
исключения по чужому scope (см. [§10a](#10a-тест-проверяет-поведение-а-не-текст-исходника-и-не-обстоятельства-запуска),
[§10](#10-test-execution-and-audit-policy)). `CLAUDE.md` — вход со ссылкой сюда.


---

## Маршрут

Ниже — карта «где что искать», не пересказ правил. Открывай только свои разделы по маске путей; §1–§24 —
единственный канонический текст.

### Читают ВСЕ независимо от области

- Задачи ведутся только через `taskdb`-порт (`node /home/dev/brain/tools/taskdb.mjs`), никогда сырым SQL — [§1](#1-онбординг-и-server-conventions).
- Параллельная работа — своя ветка `wt/<workstream>`, не общий `feat`; после воркера — независимый аудит, слияние в `feat` — только после него — [§24](#24-оркестрация-субагентов).
- К базе — только через порт своего приложения на drizzle (webapp и integrator одинаково), сырой SQL для нового кода запрещён — [§5](#5-clean-architecture-изоляция-модулей).
- PROD — только хост `135.106.162.170`; трогать только по явному разрешению владельца, `sudo` там не выполнять — [§1](#1-онбординг-и-server-conventions), [§1b](#1b-безопасность-dev-среды-изоляция-от-прод-и-реальных-каналов).
- Коммит/пуш — полное дерево как есть на диске, без правок «заодно»; в оркестрации `git add -A` запрещён — [§7](#7-git-коммит-и-пуш), [§24](#24-оркестрация-субагентов).
- Полный `pnpm run ci` — только перед deploy/merge/repo-level изменением; между коммитами — step/phase — [§9](#9-full-ci-gate), [§10](#10-test-execution-and-audit-policy).
- Ответ по умолчанию — краткий ИТОГ, без навязанных «если хочешь, могу ещё» — [§13](#13-формат-ответа-итог), [§14](#14-коммуникация-без-навязанных-концовок).

### По маске путей / области работы

| Маска / область работы                                                                       | Раздел(ы)                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/webapp/src/app/app/patient/**`, `apps/webapp/src/shared/ui/patient/**`                  | [§15](#15-patient-ui-shared-primitives) · [§17](#17-patient--doctor-ui-isolation) · [§18](#18-пациент-лфк--программа-реабилитации) · [§19](#19-patient-media-playback-hls--mp4) |
| `apps/webapp/src/app/app/doctor/**`, `apps/webapp/src/app/app/settings/**`, `apps/webapp/src/shared/ui/doctor/**` | [§16](#16-doctor-ui-shared-primitives) · [§17](#17-patient--doctor-ui-isolation) · [§20](#20-cms-единый-layout-медиа-пикера)                                    |
| Любой UI-текст/копирайтинг; любой `<Select>`/`SelectTrigger`                                    | [§21](#21-ui-тексты-без-избыточных-пояснений) · [§22](#22-ui-select--displaylabel)                                                                              |
| `apps/webapp/db/schema/**`, `**/migrations/**/*.sql`, новые таблицы/колонки/write-paths          | [§1](#1-онбординг-и-server-conventions) подраздел «Миграции» · [§4a](#4a-saas-foundation-aware-development)                                                    |
| `apps/webapp/src/modules/**`, `apps/integrator/src/**`, `**/app/api/**/route.ts`                | [§5](#5-clean-architecture-изоляция-модулей)                                                                                                                    |
| Интеграции, `system_settings`, новые env-переменные для ключей/URL                              | [§2](#2-critical-конфигурация-интеграций-только-в-бд) · [§3](#3-runtime-config-env-vs-database) · [§4](#4-system_settings-одна-таблица-public-зеркала-нет)      |
| `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `apps/webapp/e2e/**`                           | [§10a](#10a-тест-проверяет-поведение-а-не-текст-исходника-и-не-обстоятельства-запуска) · [§10b](#10b-канон-написания-тестов) · [§11](#11-webapp-тесты-компактность)      |
| `psql`, `DATABASE_URL`, `deploy/**`, любая server/host/prod-операция                             | [§1](#1-онбординг-и-server-conventions) · [§6](#6-host-postgresql-и-database_url) · [§9](#9-full-ci-gate)                                                       |
| Локальный dev-запуск, dev-bypass, живое UI-тестирование                                         | [§1a](#1a-локальный-dev-и-тестирование-ui)                                                                                                                      |
| `.cursor/plans/*.plan.md`, ведение многоэтапного плана                                          | [§12](#12-plan-authoring-and-execution-standard)                                                                                                                |
| Команда «коммит» / «пуш»                                                                        | [§7](#7-git-коммит-и-пуш) · [§8](#8-команда-пуш)                                                                                                                |
| Codex-агент, выбор языка ответа                                                                 | [§14a](#14a-языковая-политика-codex)                                                                                                                            |
| Запуск/аудит/параллель субагентов, оркестрация плана                                            | [§24](#24-оркестрация-субагентов)                                                                                                                               |

Полное оглавление — заголовки `## N.` ниже по файлу, в порядке §1–§24. `docs/ORCHESTRATION_BINDINGS.md` —
обязательный практический канон оркестрации, побеждает generic материалы `docs/AGENT_AUTORUN_SCHEME.md` в
repo-specific вопросах; читать оба для любой оркестрованной/автономной работы.

---

## Поиск по коду — сначала code-search, потом слепой grep

Есть готовый гибридный поиск по коду над индексом репозитория (BM25 + семантика, деградация до BM25). Для вопросов
«где в коде X / кто вызывает Y / где определён Z» СНАЧАЛА зови его, а не грепай вслепую по всему репо:

    node /home/dev/brain/tools/code-search.mjs "<запрос>" --repo bcb [-k N]

Печатает `path:строки` + сниппет. `grep`/`glob` — только для точных строк, которые уже знаешь. Касается и субагентов.

### Вопрос не запускает и не останавливает работу

Сообщение с вопросом и явной задачей — ответить на вопрос и выполнить задачу. Вопрос по ходу уже порученной работы
не ставит её на паузу и не отменяет; продолжать без повторной команды «продолжай». Из вопроса нельзя домысливать
новую работу, а из отсутствия повторной команды — домысливать остановку уже начатой.

**Смысл:** иначе владелец не может спросить о ходе работы, не рискуя, что агент истолкует вопрос как «стоп».

### Аудит/ревью ищет только реальные нарушения, не стиль

Finding существует только если: обязательное поведение реально не работает, достижима уязвимость/обход security
boundary, возможны data loss/corruption/неверные деньги, либо реально ломается build/runtime/integration. Каждый
`MUST FIX` называет конкретный достижимый сценарий, impact и точное нарушенное требование/правило.
Style/preferences, теоретический edge case без пути воспроизведения, extra hardening, alternative architecture —
не finding; без доказательства удалить.

**Смысл:** находка без достижимого сценария неотличима от вкусовщины и топит в шуме реальные находки; критерий
приёмки должен быть бинарным, а не «мне кажется лучше».

## 1. Онбординг и server conventions

### STOP-GATE: сначала существующие документы и scripts, потом действия

Для любой существенной задачи (в первую очередь server/deploy/prod/test/env/DB/backup/migration/backfill/
reconcile/cutover/clean dump) агент до первого действия обязан: прочитать `AGENTS.md`, `README.md`,
`docs/README.md` и релевантные docs/rules/runbooks по теме; найти существующие scripts/docs через code-search и
точечное чтение; явно зафиксировать, какой источник — канон для текущего действия. До этого запрещено изобретать
последовательность, писать новый SQL/script, менять код или запускать команды. Найденный документ, если
противоречит плану агента, побеждает — план перестраивается.

**Смысл:** канон и существующие скрипты уже содержат подтверждённые host-факты и известные грабли; агент,
начавший с изобретения своей команды, рискует повторить уже решённую ошибку.

Перед существенной работой читать также: `docs/ARCHITECTURE/SERVER CONVENTIONS.md`,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` ([§1a](#1a-локальный-dev-и-тестирование-ui)),
`deploy/HOST_DEPLOY_README.md`, `docs/AGENT_AUTORUN_SCHEME.md` + `docs/ORCHESTRATION_BINDINGS.md` (для любой
оркестрованной/автономной работы).

### Server conventions — источник фактов, не догадка

`docs/ARCHITECTURE/SERVER CONVENTIONS.md` — источник правды для любого server/deploy/prod/systemd/nginx/env/path/
port/DB/backup/migration/backfill/reconcile/cutover вопроса: использовать точные имена и пути оттуда, никогда не
изобретать/угадывать пути, имена сервисов, env-файлов, БД, портов, URL, пользователей.

**Хост-идентичность — блокирующий гейт:** DEV/RELAY/TEST — `151.241.228.122`; PROD — единственно
`135.106.162.170`. Локальные остатки `/opt/projects/bersoncarebot`, файлы `*.prod`, юниты
`bersoncarebot-*-prod.service`, публичные домены и слово «сервер» на `151.x` НЕ являются признаком PROD. Перед
любой PROD-командой доказать target-host = `135.106.162.170` и получить явное разрешение владельца. На PROD
sudoers не считается безопасной границей: агент не выполняет там `sudo` и не касается PROD без отдельного явного
owner-разрешения (`docs/ARCHITECTURE/SERVER CONVENTIONS.md` §«КРИТИЧНО: deploy»).

`psql`: никогда не выдавать голый `psql "$DATABASE_URL"` — см. [§6](#6-host-postgresql-и-database_url).

Если нужный runtime-факт отсутствует или не подтверждён документом: сказать явно, что значение
отсутствует/не подтверждено; дать точные команды для обнаружения на хосте; затем зафиксировать найденный
non-secret факт в документации (пути, unit-имена, порты, БД, env-ключи, URL, владение). Секреты, пароли, токены,
строки подключения с кредами в docs не писать.

**Смысл:** незафиксированный факт заставляет каждый следующий чат заново искать то же самое; секрет в docs
утекает шире, чем нужно для операционной пользы записи.

### Задачи — только через taskdb-порт, не сырой SQL

Канон гранулярности и единственное правило для `add`: [`docs/TASKDB_RULES.md`](docs/TASKDB_RULES.md) — он
побеждает список ниже и [`docs/SHARED_TASKDB.md`](docs/SHARED_TASKDB.md) (канон порта и статусов). Все задачи
репозитория ведутся в общей базе задач (проект `bcb`) только через утилиту-порт:

```
node /home/dev/brain/tools/taskdb.mjs <cmd>
```

Команды: `list bcb` — мои задачи · `find bcb "<подстрока>"` — поиск · `waiting` — что ждёт владельца ·
`set <id> <field> <value>` (например `set <id> status <todo|doing|blocked|done>`) ·
`add "<заголовок>" "<обязательное краткое понятное описание>" bcb-lead bcb --plan docs/_TODO/<plan>.md` —
исключение, не обычный шаг.

**Действие по умолчанию — найти существующий workstream, а не завести карточку:** `find` → открыть его план →
дописать туда чекбокс/пункт этапа/новый этап. `add` — исключение только для нового цельного workstream по
просьбе/одобрению владельца, после `find`; пустое описание запрещено. Своя находка и решение владельца карточкой
не становятся — решение вписывается туда, где описана проблема (в существующий план или канон).

Карточка содержит только название, статус, ссылку на план и краткое понятное описание. Narrative
`note`/`question`/`meta` не использовать для хода, решений, проверок или доказательств — всё это в плане.
`owner_waiting`, `auto_ok`, seals, acceptance, `commit_ref` — служебное состояние порта.

Никогда не писать в таблицу `plan_tasks` напрямую — ни `psql`, ни `INSERT/UPDATE/SELECT` из кода/ORM: один порт
= согласованные транзакции + единая точка контроля доступа; недостающую операцию дописывать в утилиту, не
обходить её. `accepted`/`accepted_at` ставит только владелец — «done» ≠ «accepted».

Дисциплина статусов: начал → `status doing`; упёрся в решение владельца → зафиксировал вопрос и контекст в плане,
`status blocked` + `owner_waiting true`; довёл и проверил → `status done` + требуемые seals/`commit_ref`. Ход и
ответ владельца — в план/канон, не в карточку.

Для workstream-карточки `done` означает закрытие каждого referenced atomic owner checkbox матрицей
code/test/runtime evidence; aggregate worker `done` или audit `PASS` недостаточны. Пока строка открыта или имеет
обычный blocker, taskdb остаётся `doing/blocked`; закрыть строку без реализации можно только явным owner
defer/cancel с трассируемой ссылкой и причиной, синхронизированными с plan/roadmap/LOG.

Гранулярность: одна карточка = один цельный workstream; этапы, чекбоксы, полное ТЗ — в каноническом плане под
`docs/_TODO/`. `title` — короткое имя workstream, `block` — ссылка на план + краткое обязательное описание
сути/границы (не полное ТЗ). Слои состояния: `status` → `seal_test`/`seal_audit` (агент проверил) →
`accepted`(+`accepted_at`) — владелец принял. Гейт автономного лупа: воркер берёт существующую карточку только
при `status∈(todo,doing) AND owner_waiting=false AND auto_ok=true`; `auto_ok` управляет запуском, а не разрешает
`add`.

**Смысл:** одна карточка на весь workstream и запрет писать в БД мимо порта не дают истории раздвоиться на «что
реально сделано» и «что записано»; находка агента и решение владельца — ход работы, а не новая единица учёта.

### Чек-листы и коммиты: три состояния галочки, отметка тем же коммитом

Полный канон разметки: [`docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md`](docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md)
§6.4 — читать целиком перед первой правкой плана; связь с коммитами —
[`docs/ORCHESTRATION_BINDINGS.md`](docs/ORCHESTRATION_BINDINGS.md) §«Разметка чек-листов и связь с коммитами».

Три состояния, не больше: `[ ]` открыто (включая отложенное владельцем) · `[x]` сделано + доказательство в
строке · `[-] ~~текст~~ — ОТМЕНЕНО ВЛАДЕЛЬЦЕМ <дата>: <причина>`. Плюс две прозаические формы вне боксов:
`ВЕДЁТСЯ В <файл>:<строка>` (та же работа принадлежит другому плану) и обычный регламент/процедура текстом.
Отложенность пишется один раз в шапке плана, не на каждом боксе.

Убить бокс может только владелец: исполнитель ставит `[x]` с доказательством либо превращает бокс в
прозаический указатель; «отпало»/«никогда не строили» остаётся `[ ]` и уходит вопросом владельцу. Текст
требования не переписывать — зачеркнуть и дописать причину; составной пункт с частичным done — расщепить на
атомарные.

Галочка ставится ТЕМ ЖЕ коммитом, что и код, с доказательством в строке (хеш, `file:line` или лично
запущенная проверка) — сообщение коммита доказательством поведения не является. Сообщение коммита обязано
содержать `#NNNN` карточки, почему, чем доказано, какой пункт какого плана закрывает и что не сделано.

Устное решение владельца записывать немедленно в документ, который он читает — отсутствие в git означает «не
записали», не «не было». Записать решение — не значит завести задачу: решение вписывается туда, где описана
проблема (полный гейт новой карточки — [`docs/TASKDB_RULES.md`](docs/TASKDB_RULES.md)). Назначать исполнителем
владельца, ставить сроки и помечать «агентам не брать» — не решение агента, даже если владелец сказал «я это
сделаю» — это его слова о себе, не наряд.

**Смысл:** галочка без доказательства в строке и привязки к коммиту неотличима от честной ошибки; три состояния
вместо произвольных меток убирают случай, когда один ярлык значит и «сделано», и «ещё нет».

### Прогон тестов и сборок — через общий замок хоста

Полный `pnpm run ci` и любой полный прогон тестов на общем DEV/TEST-хосте запускается только через
`/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"`; остальные ждут в очереди автоматически (flock). Точечные
проверки (один файл vitest, typecheck, lint) можно запускать напрямую — они короткие и общий ресурс не держат.
Уровень проверки — по [§9](#9-full-ci-gate) и [§10](#10-test-execution-and-audit-policy).

**Смысл:** общий CPU/RAM и общий build-lock Next держат все процессы хоста разом; без единого замка
параллельные полные прогоны толкаются за ресурс и гасят друг друга.

### CI / lint / build-предупреждения — делегировать Sonnet, не гнать в Opus

Оркестратор (дорогая модель) не расследует логи и не правит файлы сам. Как только нужен зелёный CI/lint/build —
спаунить механического Sonnet-агента: прогнать нужный gate; для нового кода править тесты, а не откатывать код
под устаревший тест ([§10](#10-test-execution-and-audit-policy) подраздел «CI: тесты подгоняются под код»);
чинить предупреждения и ошибки; сложное/неочевидное/требующее решения владельца — вынести оркестратору, не
хачить.

**Смысл:** механический run+fix-цикл не требует дорогой модели; чтение логов дорогой моделью жжёт контекст и
токены оркестрации без выигрыша в качестве.

### Deploy / push

`feat/doctor-ui-rebuild` (dev) — коммитить и пушить свободно. `main`/`test` — никогда не пушить/мёрджить без
прямой команды владельца. Два репо: `origin` (`Dimmdao2/BersonCareBot`, dev/backup, прод-деплой выключен) и
`dimmdao` (`dimmdao/BersonCareBot`, производственный). Прод-деплой только вручную: `dimmdao` → Actions →
«Deploy (production)» (`workflow_dispatch`, `confirm=deploy`) → аппрув окружения `production`; гейты — зелёный
CI на коммите + human-approval. Далее SSH под `deploy` запускает `deploy/host/deploy-prod.sh` (хост, путь
`/opt/projects/bersoncarebot`). Детали: `deploy/HOST_DEPLOY_README.md`.

### Индекс/векторы по коду — спросить перед сканом

Перед `grep`/чтением файлов целиком по всему репо — сперва индекс (дешевле по токенам): смысл/«где логика X» →
`bash /home/dev/brain/tools/codeq.sh "<запрос>" --repo bcb [--k N]` (семантический); точное имя/строка/символ →
`bash /home/dev/brain/tools/code-search.sh "<строка>" --repo bcb [-k N]` (лексический). Переиндексировать после
объёмных правок: `bash /home/dev/brain/tools/code-index-pg.sh --repo /home/dev/dev-projects/BersonCareBot --repo-name bcb`.

**Смысл:** индекс уже посчитан и стоит на порядок дешевле полного grep/чтения по репозиторию.

### Миграции: индекс на горячую колонку — в том же PR

Индекс — часть каждого PR, добавляющего таблицу/колонку, по которой будут фильтровать/сортировать под
нагрузкой: мультитенантные `org_id`/`clinic_id`, владелец строки `user_id`/`patient_id`/`doctor_id` (особенно с
`created_at DESC`), таймстемпы event/delivery/reminder-таблиц, ключи идемпотентности/дедупа (`UNIQUE INDEX`).

На маленькой/новой таблице — обычный `CREATE INDEX IF NOT EXISTS` прямо в миграции. На уже большой — только
`CREATE INDEX CONCURRENTLY` вне транзакции миграции (при раннере, оборачивающем всё в транзакцию — отдельный
online-шаг), иначе лок на запись на время построения. Композитный порядок колонок: сначала равенство (`org_id`,
`user_id`), потом диапазон/сортировка (`created_at DESC`). Канон ёмкости и топологии:
[`docs/ARCHITECTURE/SCALING_AND_LAUNCH_CAPACITY.md`](docs/ARCHITECTURE/SCALING_AND_LAUNCH_CAPACITY.md).

Ревью и reality-аудит считают отсутствие индекса на новой горячей колонке замечанием, не мелочью.

**Смысл:** индекс дёшев на пустой таблице и требует online-построения на уже большой; добавленный отдельным PR
он либо не доезжает вовсе, либо доезжает под нагрузкой без `CONCURRENTLY` и кладёт запись на время построения.

---

## 1a. Локальный dev и тестирование UI

_Канон: [`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`](docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md)_

### Запуск

| Команда                                 | Назначение                        |
| --------------------------------------- | --------------------------------- |
| `pnpm run dev`                          | integrator + webapp (полный стек) |
| `pnpm run webapp:dev`                   | только webapp (`127.0.0.1:5200`)  |
| `pnpm run dev:turbo`                    | webapp, Turbopack (быстрый HMR)   |
| `pnpm --dir apps/webapp run dev:visual` | webapp + file polling (VM/Docker) |
| `pnpm run dev:integrator`               | только API `:4200`                |
| `pnpm run worker:dev` / `scheduler:dev` | фоновые процессы integrator       |
| `pnpm run dev:stop`                     | освободить dev-порты 5200/4200    |

Перед UI-тестом: `pnpm run migrate`, env из `.env` + `apps/webapp/.env.dev`.

### Dev-bypass (вход без Telegram)

Требуется `ALLOW_DEV_AUTH_BYPASS=true` в `apps/webapp/.env.dev`. Хост — **`http://127.0.0.1:5200`**, не `localhost`.

| `token`            | Роль                                                         |
| ------------------ | ------------------------------------------------------------ |
| `dev:admin`        | врач + admin mode (настройки, audit-log)                     |
| `dev:clinic-admin` | администратор/owner своей dev-клиники, без global admin mode |
| `dev:doctor`       | только кабинет специалиста                                   |
| `dev:client`       | пациент                                                      |

```
http://127.0.0.1:5200/api/auth/dev-bypass?token=dev%3Aadmin
# затем /app/doctor/clients или полный URL страницы
```

Проверка: `curl -s -c /tmp/c.cookies -L "…dev-bypass…"` → `curl -s -b /tmp/c.cookies http://127.0.0.1:5200/api/me`.

Чистый public/login без сессии: `/api/auth/dev-public`; явная регистрация кабинета:
`/api/auth/dev-public?view=registration`. Это dev-only clear-session helper, не отдельная authenticated role.

**Скриншоты авторизованных страниц без браузер-MCP** (headless chromium, двухшаговая схема с флашем cookie) — канон в [`LOCAL_DEV_AND_AGENT_TESTING.md`](docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md) §4.7. Главное: `next` для doctor/admin игнорируется; на auth-шаге chromium запускать **без** `--virtual-time-budget` (иначе cookie не сохранится в профиль).

**Не путать:** `system_settings.dev_mode` в БД — тестовые аккаунты в аналитике, не вход.

Подробности, curl, browser MCP, типовые сценарии — в каноническом документе выше.

---

## 1b. Безопасность dev-среды: изоляция от прод и реальных каналов

Среды разнесены: текущий `151.241.228.122` — DEV/RELAY/TEST; PROD — только `135.106.162.170`.
DEV идёт из репо (`pnpm dev` → webapp `:5200` + integrator `:4200`, env `/.env` +
`apps/webapp/.env.dev`, БД `bcb_webapp_dev`). TEST — `/opt/projects/bersoncarebot-test`, env `*.test`,
юниты `bersoncarebot-*-test.service`, БД `bersoncarebot_test`. Старые local `/opt/projects/bersoncarebot`,
`*.prod` и `bersoncarebot-*-prod.service` на `151.x` — запрещённые замаскированные остатки.
Канонические пути — только из `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.

**Смысл:** DEV/TEST и PROD физически разные среды на разных хостах; смешение кредов, доставки или доступа между
ними означает либо утечку реального секрета в песочницу, либо случайную реальную отправку/запись из dev.

### 1. Реальные креды — только на проде, никогда в dev-env

- DEV/TEST на `151.x` НЕ должны содержать реальных prod-секретов внешних каналов:
  `TELEGRAM_BOT_TOKEN`, `MAX_API_KEY` / `MAX_WEBHOOK_SECRET`,
  `SMSC_API_KEY`, реальные PROD `S3_*`. Реальные prod-секреты живут только на `135.x`; локальные `*.test`
  содержат только TEST-креды и обязательные send-safety ограничения.
- Retired Rubitime keys (`RUBITIME_API_KEY` / `RUBITIME_WEBHOOK_TOKEN`) не должны возвращаться ни в DEV/TEST,
  ни в текущий runtime: архивные env/one-shot материалы не являются источником конфигурации.
- В dev обязательно: `NODE_ENV=development`, send-креды пустые, `MAX_ENABLED=false` / `SMSC_ENABLED=false`,
  `INTEGRATOR_SHARED_SECRET` — dev-значение (совпадает в обоих dev-файлах).
- Нашёл реальные креды в dev-env — это инцидент: очистить и сообщить владельцу (ротация — на его стороне).

### 2. Dev никогда не инициирует реальную доставку

- В `development` доставка должна быть no-op/мок (логируем «отправили бы X», реально не шлём; без ошибок).
- Агент НЕ выполняет действий, способных отправить реальное сообщение/SMS в Telegram/SMSC/MAX
  или записать в реальный S3 из dev (тестовые записи, рассылки, ретраи доставки, ручные триггеры).
- `INTEGRATOR_API_URL` в dev обязан указывать на локальный `127.0.0.1:4200`, не на прод.

### 3. Dev-БД — изменяемая рабочая песочница

- `bcb_webapp_dev` разрешено сидировать и произвольно менять для разработки, UX и скриншотов.
- Pending migrations применяются к существующей DEV-БД только через
  `bash deploy/host/migrate-dev.sh --preflight`, затем `bash deploy/host/migrate-dev.sh --execute`.
- TEST→DEV destructive refresh удалён решением владельца 2026-07-30. Обычная разработка не копирует TEST
  и не пересоздаёт DEV.
- Данные из DEV можно использовать внутри команды агентов для разработки и UX-аудита. Не коммитить DB dumps,
  cookie jars и runtime exports. Запрет реальной доставки из §2 сохраняется независимо от состава DEV-БД.

### 4. Прод изолирован — не трогать из dev

- Агент на `151.x` НИКОГДА не подключается к `135.x`, PROD-БД, PROD-сервисам/интегратору/вебхукам и не
  использует локальные остатки `*.prod` как доступ к PROD. Любая PROD-операция требует отдельного явного
  owner-запроса с указанием PROD и проверки target-host = `135.106.162.170` по
  `SERVER CONVENTIONS.md` (+ раздел [Host: PostgreSQL](#6-host-postgresql-и-database_url)).

### 5. Секреты не читать и не печатать

- Не раскрывать значения `.env`/секретов в выводе; если значение реально нужно — маскировать
  (например `… | sed -E 's/(=.{0,4}).*/\1****/'`).
- Не вставлять токены/пароли/строки подключения с кредами в чат, логи, коммиты, доки (в доки — только
  non-secret операционные факты, см. правило онбординга).

### 6. Не удалять кэш/билд работающих серверов вслепую

- Перед `rm -rf .next` (и аналогичной очисткой build-output) проверить запущенные процессы
  (`pgrep -af next`): удаление билда роняет локальные dev/preview-инстансы и прод `next start`,
  если они читают этот каталог.

---

## 2. CRITICAL: конфигурация интеграций только в БД

Не добавлять и не использовать новые env-переменные для конфигурации интеграций; не хранить ключи/токены и
webhook URL интеграций в env. Источник правды — `system_settings` (scope `admin`) в webapp DB:
- ключи входят в `apps/webapp/src/modules/system-settings/types.ts` (`ALLOWED_KEYS`);
- значения редактируются через admin settings flow (`/api/admin/settings` + Settings UI);
- таблица org-aware: глобальные умолчания — строки с `organization_id IS NULL`, override клиники — тот же
  `key`/`scope` с непустым `organization_id`; текущий admin Settings UI пишет глобально, если flow явно не
  передаёт organization context.

Integrator и webapp читают ключи/URI интеграций только через DB-backed accessors: webapp —
`apps/webapp/src/infra/repos/pgSystemSettings.ts`, integrator — `apps/integrator/src/infra/db/publicSystemSettings.ts`
(если нет документированного процесс-специфичного accessor'а). CI проверяет прямые чтения в обход accessor'а
через `apps/webapp/scripts/check-system-settings-accessors.mjs`. Env остаётся только для process
bootstrap/infra (`DATABASE_URL`, `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`). Любая новая интеграция, предлагающая
env-переменные для ключей/URI, невалидна и требует редизайна на DB config.

Настройки живут в ОДНОЙ таблице `public.system_settings`; интегратор читает её напрямую, зеркала
`integrator.system_settings` нет — см. [§4](#4-system_settings-одна-таблица-public-зеркала-нет),
`docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`, `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`.

**Смысл:** env читается процессом при старте и требует редеплоя на каждое изменение; секрет/URL в env также
чаще утекает в логи запуска и дампы конфигурации, чем строка в администрируемой таблице с UI-редактированием.

---

## 3. Runtime config: env vs database

При добавлении или переносе конфигурации: env-переменные — только для инфраструктурных connection strings
(`DATABASE_URL`) и process-level deploy defaults, не tenant-specific (`NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`).
Webapp `system_settings` (scope `admin`) — для ключей/токенов интеграций, webhook URL, и любых операционных
значений, редактируемых без редеплоя (публичные URL, feature flags, IANA timezone для пользовательских текстов,
whitelists). Новые ключи добавляются в `ALLOWED_KEYS` (`apps/webapp/src/modules/system-settings/types.ts`) и
выводятся в admin Settings UI, если они user-facing. Settings UI пишет глобальные умолчания
(`organization_id IS NULL`), если flow явно не передал organization context; override клиники — тот же
key/scope плюс непустой `organization_id`, с сохранением отката на глобальный NULL.

Интегратор читает настройки напрямую из `public.system_settings`
(`apps/integrator/src/infra/db/publicSystemSettings.ts`); зеркала `integrator.system_settings` нет. Прод и тест —
одна PostgreSQL со схемами `integrator` и `public` (`docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`). Новые env
для значений, которым место в `system_settings`, не добавлять — см. [§4](#4-system_settings-одна-таблица-public-зеркала-нет).

Канон: `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`.

**Смысл:** значение, которое должен менять админ без редеплоя, обязано жить там, где до него дотягивается
Settings UI и права доступа — в env этого нет ни у кого, кроме того, кто может задеплоить процесс заново.

---

## 4. system_settings: одна таблица public, зеркала нет

Прод и тест — одна PostgreSQL со схемами `public` и `integrator` (`docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`).
Настройки живут ТОЛЬКО в `public.system_settings`; интегратор читает их напрямую
(`apps/integrator/src/infra/db/publicSystemSettings.ts`). Зеркала `integrator.system_settings`, синхронизации и
очереди между схемами нет.

Обязательные правила:

1. **Не заводить второе хранилище настроек** — ни таблицу, ни файл, ни кэш «на всякий случай»; читатель
   обращается к `public.system_settings` там, где значение нужно.
2. **Запись из webapp — только через** `createSystemSettingsService().updateSetting` (или тот же путь API
   настроек) — единая точка валидации ключа, нормализации значения и прав.
3. **Новые ключи** — сначала в `ALLOWED_KEYS` (`apps/webapp/src/modules/system-settings/types.ts`), один и тот
   же `key` и `scope` для всех потребителей; разных имён под один смысл не заводить.
4. `organization_id IS NULL` — глобальное значение по умолчанию; строка с непустым `organization_id` —
   переопределение клиники, чтение обязано откатываться на глобальную строку.
5. **Миграции и сиды** пишут настройку в `public.system_settings` и всё — дублировать больше некуда.

**Смысл:** второе хранилище требует синхронизации, а несинхронизированная копия расходится с источником молча;
единственная таблица делает расхождение структурно невозможным.

## 4a. SaaS Foundation-aware development

Канон: `docs/RULES/SAAS_FOUNDATION_AWARE_DEVELOPMENT.md`. Перед добавлением/изменением таблиц, колонок, миграций,
репозиториев, API, write-paths или фоновых задач учитывать текущее направление `SAAS_FOUNDATION`: shared-DB
SaaS, tenant = `Organization`, будущая изоляция данных.

- Новые clinical/patient-facing/doctor-facing/booking/messaging/notification/media/catalog/product/payment/
  entitlement/integration/settings/staff/admin данные не должны быть глобальными по умолчанию.
- До реализации выбрать ownership path: прямой `organization_id`, scoped parent, `specialist_id`,
  patient/enrollment, appointment, program instance или настоящий global catalog.
- Если ownership неочевиден — не добавлять unscoped таблицу/поле; пометить `needs_decision` и оставить design
  note для dev-lead/владельца.
- Не добавлять ad hoc RLS/policy enforcement до канонических этапов `DB_ACCESS_CHOKEPOINT` + `SAAS_FOUNDATION`;
  допустимы dormant/backward-compatible поля, индексы, backfill/compat планы и сервисные проверки.
- Не переносить tenant/org integration settings в env — они остаются DB-backed через `system_settings` ([§4](#4-system_settings-одна-таблица-public-зеркала-нет)).
- Не усиливать single-clinic/single-doctor assumption: если текущая модель уже использует `organizationId`/
  `specialistId`/scoped parent, новый код обязан продолжать этот путь.

**Смысл:** unscoped таблица, добавленная сегодня «для простоты», становится миграцией с backfill и риском
смешения данных клиник, когда изоляция дойдёт до этого места — дешевле выбрать ownership path сразу.

---

## 5. Clean Architecture: изоляция модулей

### Доступ к базе — оба приложения, без исключений

Правило действует одинаково в `apps/webapp/**` и `apps/integrator/**` — нет отдельных правил «для интегратора».
К базе — только через порт своего приложения на drizzle: у интегратора `apps/integrator/src/infra/db/**`, у
вебаппа `infra/repos/*` плюс порты модулей; из доменного, сценарного и роут-кода к базе не ходят. Сырой SQL
(`pool.query(...)`, `db.query(...)`, `txDb.query(...)` с текстом запроса) для нового кода запрещён; существующий
сырой SQL — техдолг, правится отдельными работами, не «заодно». Стиль соседнего файла не авторитет: сырой SQL
рядом не разрешает писать так же. Бриф исполнителя, который трогает базу, обязан цитировать этот раздел.

**Смысл:** правило про доступ к базе, лежащее в разделе про модули только одного приложения, не считывается
исполнителем, работающим в другом приложении, — писать его как применимое к обоим сразу и цитировать в брифе.

### Absolute rules for ALL agents

Every module in `apps/webapp/src/modules/` must follow strict layered isolation:

### 1. Modules MUST NOT import infra directly (DB + repos)

**Architecture rule:** `modules/*` must not reach `@/infra/db/*` or `@/infra/repos/*` — use `modules/*/ports.ts`, infra implementations, and DI (`buildAppDeps`).

**ESLint (phase 0, webapp):** `no-restricted-imports` enforces **only** those two families for `src/modules/**` and `src/app/api/**/route.ts`. It does **not** flag other `@/infra/*` imports (for example `@/infra/s3/client`, `@/infra/logging/*`) — those are still discouraged where a port exists; a stricter or wider rule would be a **separate** change and backlog sync.

```
FORBIDDEN in modules/**/*.ts (non-test) — and what ESLint currently errors on:
  import { getPool } from "@/infra/db/client"     // error
  import { x } from "@/infra/repos/pgSomething" // error

Not auto-failed by phase-0 ESLint (still use ports / follow project rules):
  import { createS3Client } from "@/infra/s3/client"
```

Legacy violations of the **ESLint patterns** are allowlisted in `apps/webapp/eslint.config.mjs` — **do NOT add new files to the allowlist**.

### 1a. Product absolutes (TREATMENT_PROGRAM_INITIATIVE)

From `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md` — same as "Абсолютные запреты" items 4–6:

- **LFK catalog and complex templates:** a doctor-facing **complex template** groups exercises for faster inclusion in **treatment programs**; it must not sprawl into a competing domain beside assignments/programs. **Schema changes** to `lfk_exercises`, `lfk_exercise_media`, `lfk_complex_templates`, `lfk_complex_template_exercises`, `lfk_complexes`, `lfk_complex_exercises`, `lfk_sessions`, `patient_lfk_assignments` are **allowed** when justified (Drizzle migrations, rollout/compatibility plan, regression coverage). A former hard ban "do not alter these tables" was a **phase gate** and is **lifted**. **Do not** introduce a parallel "LFK engine" that replaces the programs/assignment path without an explicit product decision.
- **Do not build a separate "course engine"** with its own stage/progress logic. A **course** is a link to a `treatment_program_template` (and instance creation reuses the same assignment path as the program feature).
- **No database FK on `item_ref_id`** — polymorphic reference; validate only in the service layer.

### 1b. Process absolutes (TREATMENT_PROGRAM_INITIATIVE)

From `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md` — same as "Абсолютные запреты" items 7–8:

- **Do not mix initiative phases.** One phase per logical batch of work; do not start phase N+1 before phase N passes its gate. Step vs phase validation: раздел [Test execution policy](#10-test-execution-and-audit-policy).
- **Do not change the GitHub CI workflow** without an explicit team decision. Full CI/deploy/merge expectation: раздел [Full CI gate](#9-full-ci-gate) (`pnpm install --frozen-lockfile && pnpm run ci` when the full-CI gate applies).

Integration keys (DB not env), onboarding, and the full Drizzle checklist remain in `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md` and other `.cursor/rules/*`. Always read that file when working on this initiative.

### 2. Correct dependency direction

```
route.ts / page.tsx / server action
  → app-layer/di/buildAppDeps.ts (composition root)
    → modules/*/service.ts (business logic)
      → modules/*/ports.ts (port interface — defined HERE, not in infra)
        → infra/repos/pg*.ts (implementation of port)
```

### 3. Port types belong in modules, not infra

```
CORRECT:
  modules/treatment-program/ports.ts — defines TreatmentProgramPort interface
  infra/repos/pgTreatmentProgram.ts — implements TreatmentProgramPort

WRONG:
  infra/repos/pgTreatmentProgram.ts — defines AND implements the port
  modules/treatment-program/service.ts — imports type from infra/repos/
```

### 4. Route handlers are thin

Route handlers (`app/api/**/route.ts`) do ONLY:

- Parse request (headers, body, params)
- Validate input (Zod schema)
- Authenticate/authorize (session, guards)
- Call service via buildAppDeps()
- Return HTTP response

Route handlers MUST NOT contain business logic, database queries, or direct infra calls.

### 5. New entities use Drizzle ORM

All new database tables and queries must use Drizzle ORM:

- Schema in `apps/webapp/db/schema/*.ts`
- Migrations via `drizzle-kit generate` + `drizzle-kit migrate`
- Types inferred from schema (`typeof table.$inferSelect`)
- No raw SQL (`pool.query(...)`) for new features
- Follow раздел [SaaS Foundation-aware development](#4a-saas-foundation-aware-development): before adding a table/column/write path, choose the ownership path (`organization_id`, scoped parent, `specialist_id`, patient/enrollment, appointment, program instance, or true global catalog).

### 6. Service receives dependencies via injection

```typescript
// CORRECT — service receives port via factory
export function createTreatmentProgramService(port: TreatmentProgramPort) {
  return {
    async assignToPatient(params) {
      /* uses port */
    },
  };
}

// WRONG — service grabs pool directly
export function assignToPatient(params) {
  const pool = getPool(); // FORBIDDEN
  await pool.query('INSERT INTO ...'); // FORBIDDEN
}
```

### 7. buildAppDeps() is called ONLY from

- `page.tsx` (React Server Components)
- `route.ts` (API route handlers)
- Server actions (`actions.ts`)
- Top-level `app-layer/` orchestration

**NEVER** from `modules/*`. If a module needs deps, they must be injected.

### Enforcement

- ESLint `no-restricted-imports` in `apps/webapp/eslint.config.mjs`
- Legacy violations tracked in `docs/archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/LEGACY_CLEANUP_BACKLOG.md`
- Adding new files to the ESLint allowlist requires explicit justification in PR description

---

## 6. Host: PostgreSQL и DATABASE_URL

### Сбой без env

Команда `psql "$DATABASE_URL"` при **не заданном** в shell `DATABASE_URL` ведёт себя как подключение к локальному сокету от имени пользователя ОС (часто `root`) → `FATAL: role "root" does not exist`.

### Жёсткое требование для агентов

1. **Никогда** не выдавать пользователю «голый» `psql "$DATABASE_URL"` / `psql "$INTEGRATOR_DATABASE_URL"` без блока, который **сначала** подгружает нужный env-файл на хосте.
2. Любая инструкция с SQL должна быть **цельной для copy-paste** и называть среду: `set -a` →
   `source <файл из SERVER CONVENTIONS>` → `set +a` → затем `psql` или `-f`. Текущий `151.241.228.122`
   допускает только DEV/TEST env. PROD env используется только в отдельно разрешённой PROD-сессии на
   `135.106.162.170`.
3. Явно писать, **какой контекст** нужен: после **unification** (см. `SERVER CONVENTIONS.md`, `DATABASE_UNIFIED_POSTGRES.md`) `DATABASE_URL` в `api.prod` и `webapp.prod` обычно **одинаковый**; различайте схемы **`public`** vs **`integrator`** (`SET search_path`, префиксы таблиц). Для **legacy** cutover/dev с двумя кластерами — `INTEGRATOR_DATABASE_URL` из `cutover.prod` или второй env-файл.

Канонические host identity и пути к env — только из `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (не придумывать).

**Смысл:** без явной загрузки env `psql "$DATABASE_URL"` подключается локальным сокетом от пользователя ОС —
ошибка выглядит как «роль не существует», а не как «забыл env», и стоит расследования каждый раз заново.

### Шаблоны production — только удалённый `135.106.162.170`

**Никогда не выполнять эти блоки на текущем `151.241.228.122`.** Локальные `*.prod` — остатки старой
топологии, а `bersoncarebot-*-prod.service` замаскированы.

**Через `api.prod`** (integrator-процесс; та же БД, что webapp, если unified):

```bash
set -a && source /opt/env/bersoncarebot/api.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT current_database();"
```

**Через `webapp.prod`** (аналогично при unified — та же база):

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT current_database();"
```

Проверка, что переменная задана (секрет не печатается):

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
[ -n "$DATABASE_URL" ] && echo "DATABASE_URL ok" || echo "MISSING DATABASE_URL"
```

Cutover / два URL — см. `SERVER CONVENTIONS.md` (`cutover.prod`, `INTEGRATOR_DATABASE_URL`).

### Dev

Пути к локальным `.env` — только из `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (например webapp dev: `apps/webapp/.env.dev`). Тот же принцип: **сначала** загрузить файл, в котором задан `DATABASE_URL`, **потом** `psql`.

На `151.x` в локальном PostgreSQL живут DEV (`bcb_webapp_dev`) и TEST (`bersoncarebot_test`).
Настоящая PROD-БД находится на `135.x`, не является локальной базой этого хоста и из DEV не открывается.

### Пересоздание / обновление dev-базы из prod-дампа

Канон с командами и граблями — [`docs/ARCHITECTURE/DB_DUMPS/README.md`](docs/ARCHITECTURE/DB_DUMPS/README.md) (раздел «Пересоздание dev-базы из prod-дампа»). Чего **не** делать (ломали вживую): `pg_restore --clean` поверх живой схемы; `--single-transaction` (откат из-за `COMMENT ON EXTENSION`); `REASSIGN OWNED BY bcb_webapp_prod` (может задеть shared/legacy local objects — владельца задавать через `--no-owner --role=bcb_webapp_dev_user`; настоящий PROD на `135.x` из этого flow не открывается). Пересоздание базы — только суперюзер `postgres` (роли `bcb_*` без `CREATEDB`): дать команды пользователю, не запускать самому. Миграциями «с нуля» схему не собирать — базу+леджер даёт дамп, `pnpm migrate` накатывает дельту.

### Скрипты в репозитории

Если в комментарии к SQL написано «подставьте `DATABASE_URL`» — для хоста всегда дописывай полный префикс `set -a && source …` из таблицы выше, иначе команда неполная.

---

## 7. Git: коммит и пуш

### COMMIT — только зафиксировать то, что уже на диске

**Если пользователь просит только «коммит» / `commit` / «закоммить» (без задачи «поправь код» в том же сообщении):**

1. **НЕ редактировать** файлы проекта в этом шаге — ни `StrReplace`/`Write`, ни «мелкие правки перед коммитом», ни правки по мотивам просмотра диффа.
2. **НЕ устраивать** обзор диффов для переписывания или «улучшения» — коммит фиксирует **текущее** состояние рабочей копии.
3. **Действия в shell:** застейджить всё изменённое как есть → закоммитить, например:
   `git add -A && git commit -m "<сообщение>"`  
   (если пользователь **явно** сузил scope — только перечисленные пути, см. ниже).

Сообщение коммита — по смыслу уже сделанной работы, без новых правок в файлах ради сообщения.

### Git: коммит и пуш — полное дерево по умолчанию

На запросы вида **«коммит»**, **«commit»**, **«закоммить»**, **«пуш»**, **«push»**, **«запушь»**, **«закоммить и запушь»** (и любые эквиваленты без уточнения файлов):

1. **ВСЕГДА** готовить коммит по **всему** текущему рабочему дереву: `git add -A` (или эквивалент «добавить все изменения, включая новые и удалённые»), затем `git commit` с осмысленным сообщением — **без изменения содержимого файлов в этом шаге** (см. блок выше).
2. **Не** делать самовольную «выборку» (`git add` только части файлов, `git add path1 path2`, interactive staging) из соображений «не захватить несвязанное» или «аккуратный коммит», если пользователь **этого явно не просил**.

### Единственное исключение

Сужать scope **только** если пользователь **явно** указал иное, например:

- перечислены конкретные пути или файлы;
- формулировки вроде «только этот файл», «частичный коммит», «без документации», «исключи X».

В таком случае следовать указанному scope.

### Связь с «пуш»

Для сценария **`пуш`** (validation + commit + push) шаг commit выполняется с тем же принципом: **полное дерево как есть**, без правок файлов «в процессе коммита», пока пользователь явно не ограничил файлы. Детали validation/full-CI gate — в разделах [Команда «пуш»](#8-команда-пуш), [Test execution policy](#10-test-execution-and-audit-policy) и [Full CI gate](#9-full-ci-gate).

**Смысл:** коммит по запросу «коммит» — это снимок состояния диска, а не приглашение улучшить код по пути; смешение
двух действий в одном шаге прячет незапрошенные правки внутри «просто коммита».

---

## 8. Команда «пуш»

Если пользователь пишет `пуш` (или эквиваленты: "push", "запушь"), агент должен трактовать это как полный поток:

1. Запустить validation по масштабу изменения:
   - обычный docs-only / micro-stage / одно-приложенческий backup-push: step/phase gate из раздела [Test execution policy](#10-test-execution-and-audit-policy);
   - deploy / merge / integration checkpoint / repo-level risk: full CI gate из раздела [Full CI gate](#9-full-ci-gate).
2. Если есть изменения — сделать commit по **всему** рабочему дереву (`git add -A`), если пользователь **явно** не указал иной scope файлов (см. раздел [Git: коммит](#7-git-коммит-и-пуш)). **На шаге commit не менять содержимое файлов** — только застейджить и закоммитить текущее состояние.
3. Выполнить `git push` в текущую ветку/remote.

Не отвечать уточнением "сначала нужно закоммитить?" в этом сценарии — commit является частью команды `пуш`.

Примечание: сам факт `push` в feature-ветку не повышает validation до full CI. Full CI нужен перед deploy, merge/integration checkpoints, repo-level изменениями или по явной просьбе пользователя.

**Смысл:** «пуш» — это одна команда пользователя на три действия; уточняющий вопрос «закоммитить сначала?» просто
теряет время, если сам смысл слова уже включает commit.

---

## 9. Full CI gate

Многоуровневые прогоны во время работы (step / phase, без лишнего `ci`) — в разделе [Test execution policy](#10-test-execution-and-audit-policy). **Этот раздел** фиксирует случаи, когда нужен полный корневой `ci`.

**Канон:** полный `pnpm run ci` НЕ является обязательным перед каждым `git push` / backup-push в feature-ветку. Обычный micro-stage push допускается после подходящего step/phase gate из раздела [Test execution policy](#10-test-execution-and-audit-policy).

### Когда full CI обязателен

Выполнить полный набор, который агрегирует корневой `ci`, перед:

- deploy / production deploy / staging deploy / prod-readiness gate;
- merge/sync/integration checkpoint между ветками, особенно перед merge в `main`, `test`, `feat/doctor-ui-rebuild` или другую общую интеграционную ветку;
- глобальным этапом инициативы, который меняет несколько приложений, shared-пакеты, root/tooling config, CI workflow, lockfile, миграционный контракт, DB-access chokepoint, RLS/policy/invariant framework или DI-контракты между приложениями;
- явной просьбой пользователя: «полный CI», «как в GitHub», «перед деплоем», «перед merge», «перед релизом».

Обычный docs-only, одно-приложенческий или micro-stage backup-push в текущую feature-ветку **не требует** full CI, если локальный gate по масштабу изменения прошёл.

### После падения CI — ускоренный цикл

Если full `pnpm run ci` был уместен по правилам выше, упал в середине и вносится локальный фикс, **разрешено** не перезапускать весь `ci` на каждой итерации:

- сначала прогнать упавший шаг (или ещё уже — конкретный test file),
- затем догнать хвост пайплайна через `ci:resume:*` из корневого `package.json`:
  - `ci:resume:after-lint`
  - `ci:resume:after-typecheck`
  - `ci:resume:after-test`
  - `ci:resume:after-test-webapp`
  - `ci:resume:after-test-media-worker`
  - `ci:resume:after-build`
  - `ci:resume:after-build-webapp`

Это ускорение действует **только между правками**. Перед deploy/merge/final integration gate полный барьер ниже остаётся обязательным в полном виде, если после последнего полного прогона были изменения.

Выполнять:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

(`pnpm check` — алиас того же `ci`.)

Состав `ci` задаётся корневым `package.json` (например: `lint`, `typecheck`, `test`, `test:webapp`, `build`, `build:webapp`, `audit`). Если `pnpm run ci` прошёл локально на актуальном дереве, ожидается зелёный GitHub Actions для того же коммита.

**Не выполнять deploy/merge/final integration без успешного `pnpm run ci`** в сценариях выше. Повторно гонять `ci` без новых изменений кода — не требуется (reuse — в test-execution-policy).

**Смысл:** полный `ci` на каждый push микроправки не покупает уверенности сверх step/phase-gate, а стоит времени
и общего build-lock хоста; резервировать его для точек, где реально нужна полная гарантия — deploy/merge/repo-level.

---

## 10. Test execution and audit policy

_Полный канон уровней/аудита: `.cursor/rules/test-execution-policy.md` — этот раздел его короткая форма._

Связь с push/deploy/merge: обычный push в feature-ветку использует validation по масштабу изменения; full CI gate описан в разделе [Full CI gate](#9-full-ci-gate) и нужен перед deploy, merge/integration checkpoints и repo-level изменениями. Этот раздел задаёт поведение **между** коммитами и при аудите.

### Приоритет правил (policy vs pre-push)

**По умолчанию все проверки между коммитами и при аудите** определяются **этим** разделом (уровни step / phase / full CI только когда здесь разрешено).

**Исключение:** раздел [Full CI gate](#9-full-ci-gate) включается **только** для deploy, merge/integration checkpoints, repo-level изменений или явной просьбы пользователя прогнать полный CI. Нельзя подменять повседневную работу «более безопасным» полным `ci`, если нет repo-level риска.

### Принцип

Полный прогон всего репозитория (`pnpm run ci`) **не** является нормой после каждого маленького изменения. Нужны три уровня: **step** → **phase** → **full CI**, плюс **аудит без лишних прогонов**.

Приоритет сигнала: скорость и полезный результат, а не избыточные повторы.

### CI: тесты подгоняются под код, а не код под тесты

Падает тест после изменения кода → разобраться, что изменилось и каково намеренное поведение. Если новое
поведение верное — обновить тест под новый код, не откатывать рабочие правки. Откатывать код к старому
поведению можно только если установлено, что изменение было ошибочным (регрессия), а не «так проще пройти
старый тест». Не уверен, что верно — тест или код → стоп, спросить владельца/ведущего; никогда не подгонять
код под тест молча. Full CI запускать под контролем агента, понимающего, что и зачем проверяет каждый тест;
слабому субагенту Full CI поручать только с этой инструкцией явно.

**Смысл:** код — носитель намеренного поведения, тест — его проверка; откат кода ради зелёного теста меняет
намерение молча и теряет уже сделанную работу, а не чинит регрессию.

### Уровни

#### Step-level (по умолчанию после точечных правок)

**Разрешено:** таргетированные тесты (Vitest по файлу/паттерну), линт/тайпчек затронутого приложения, узкий ESLint по путям при необходимости.

**Запрещено:** `pnpm run ci` / `pnpm check`, осознанный прогон **всех** тестов монорепы без repo-уровня риска.

**Fallback, если нет однозначного файла/паттерна для Vitest:** не расширять до full CI. Подняться максимум до **phase-level** затронутого приложения (полный `test` этого `apps/*`). Автоматический переход к `pnpm run ci` из-за «не нашёл таргет» **запрещён**, пока нет признаков repo-уровня или deploy/merge/integration сценария.

**Примеры команд (этот репозиторий):**

- Integrator, один файл/паттерн: `pnpm --dir apps/integrator test -- <path-or-pattern>`
- Webapp, один файл/паттерн: `pnpm --dir apps/webapp test -- <path-or-pattern>`
- Тайпчек одного приложения: `pnpm --dir apps/integrator typecheck` или `pnpm --dir apps/webapp typecheck`
- Линт webapp: `pnpm --dir apps/webapp lint` (корневой `pnpm lint` охватывает весь репо — тяжелее, на step-level использовать осознанно)

#### Phase-level (логический этап в рамках одного приложения закончен)

**Разрешено:** полный набор тестов **только** того приложения, которое меняли; его полный `typecheck`/`lint`; при необходимости локальные e2e этого приложения (`test:e2e` в `package.json` приложения).

**Запрещено:** полный CI без признаков repo-уровня (см. ниже).

**Примеры:**

- Все тесты integrator: `pnpm test` (корень) или `pnpm --dir apps/integrator test` без аргументов после Vitest
- Все тесты webapp: `pnpm test:webapp` или `pnpm --dir apps/webapp test` без аргументов
- Узкий webapp: `pnpm test:webapp:fast` (проект Vitest `fast`) или `pnpm test:webapp:inprocess` (проект `inprocess`; в GitHub Actions только на `push` в `main`)

#### Webapp Vitest / e2e: не раздувать

При добавлении или правке тестов в `apps/webapp` соблюдать **компактность** (импорты `page.tsx`, число файлов, таймауты): см. раздел [Webapp-тесты](#11-webapp-тесты-компактность) и `apps/webapp/e2e/README.md`.

#### Full CI (ограниченно)

**Разрешено** в том числе:

- перед deploy / production-readiness / release gate;
- перед merge/sync/integration checkpoint между ветками;
- после изменений в shared-пакетах, корневых конфигах (`tsconfig`, ESLint, Vitest), workflows CI, lockfile/зависимостях, контрактах/DI на уровне нескольких приложений.

**Запрещено:** повторять полный CI без новых изменений кода; гонять полный CI после каждого микрошага; «на всякий случай» без repo-риска.

**Команда (как в GitHub-эквиваленте локально):** `pnpm install --frozen-lockfile && pnpm run ci` (алиас: `pnpm check`). Состав `ci`: см. корневой `package.json` (`lint`, `typecheck`, `test`, `test:webapp`, `build`, `build:webapp`, `audit`).

### Strong reuse rule

**Повторный запуск тех же тестов или полного CI без изменений кода после последнего успешного прогона — ошибка стратегии** (включая «на всякий случай»).

Если проверки уже выполнялись и **код не менялся** → **не** запускать снова (ни `ci`, ни полный пакет тестов приложения, ни тот же таргет), кроме случая, когда пользователь **явно** просит повтор.

### CI resume (после падения шага)

Если полный `pnpm run ci` упал на конкретном шаге и после фикса вы хотите проверить продолжение цепочки:

- **не** перезапускайте `pnpm run ci` целиком на каждой итерации;
- запускайте сначала упавший шаг (или ещё уже: таргетный тест/файл);
- затем запускайте «хвост» после него через `ci:resume:*` из корневого `package.json`.

**Доступные хвосты:**

- после `lint`: `pnpm run ci:resume:after-lint`
- после `typecheck`: `pnpm run ci:resume:after-typecheck`
- после `test` (integrator): `pnpm run ci:resume:after-test`
- после `test:webapp`: `pnpm run ci:resume:after-test-webapp`
- после `test:media-worker`: `pnpm run ci:resume:after-test-media-worker`
- после `build`: `pnpm run ci:resume:after-build`
- после `build:webapp`: `pnpm run ci:resume:after-build-webapp`

**Важно:** перед deploy/merge/final integration остаётся обязательным барьер из раздела [Full CI gate](#9-full-ci-gate) (`pnpm install --frozen-lockfile && pnpm run ci`). Обычный feature-branch backup-push не требует full CI сам по себе.

### Логи

По умолчанию: что запущено + итог (pass/fail). Полный вывод прогона — при ошибке или по явной просьбе пользователя.

### Выбор уровня (decision rule)

- точечная правка в одном модуле → **step**;
- законченный кусок работы внутри одного приложения → **phase** для этого приложения;
- затронут общий пакет, CI, lockfile, корневые типы/контракты, несколько приложений → **full CI** перед deploy/merge/integration checkpoint.

**Если scope не удаётся определить однозначно:** выбирать **phase-level** для наиболее вероятного приложения, **не** full CI до появления признаков repo-уровня или deploy/merge/integration сценария.

### Антипаттерны

- полный CI после каждого изменения;
- дублировать тот же прогон без новых коммитов/файлов;
- аудит как «сначала запустить всё максимально».

### Audit validation

Аудит **не** заменяется автоматическим полным CI. Он проверяет **достаточность** уже сделанного, а не «прогнать максимум».

#### Audit hard rule

**Аудит не имеет права начинаться с запуска тестов или `pnpm run ci`.** Первым шагом CI/тесты как «сразу проверим» — **запрещены**.

Первый шаг аудита **всегда** строго в таком порядке:

1. Прочитать latest atomic owner checklist, linked detailed plan и supersession map; выписать in-scope IDs и полный
   текст. Audit brief обязан цитировать этот scope; roadmap summary или одна ссылка на plan недостаточны.
2. Анализ изменённых файлов / диффа и матрица `checkbox → evidence`.
3. Определение scope и пакета (`local` | `app` | `repo`).
4. Сверка с тем, что исполнитель уже гонял; менялся ли код после последнего прогона (reuse).

Только **после** пунктов 1–4 допускается запуск **недостающих** проверок по уровням из этого раздела. Финальный
audit report содержит строку
`PASS|FAIL|BLOCKED → code evidence → test evidence → runtime evidence → deferred/blocker reason` на каждый
checkbox; `N/A` требует причины, defer/cancel — явного owner ruling со ссылкой. Общий PASS при пропуске пункта
недействителен и не разрешает stage/taskdb/LOG status `done`, пока referenced checkbox открыт. Находка вне owner
checklist — только regression/repo-rule, owner question или recommendation.

#### Уровни и full CI в аудите

1. Сопоставить scope с уровнем:
   - `local` → таргет/модуль; **не** полный набор тестов приложения и **не** full CI;
   - `app` → полный тест **этого** приложения допустим; full CI — только если есть repo-факторы;
   - `repo` → полный CI уместен.

2. **Full CI в аудите** — только при признаках repo-уровня (shared, контракты/DI между приложениями, корневые конфиги тулчейна, lockfile, CI, build-скрипты на корне).

**Порядок мышления в аудите:** анализ диффа → достаточность уже выполненного → добор точечных проверок. Не: «запустить всё и посмотреть».

#### Cost rule

**Аудит не должен быть дороже выполнения задачи.** Если аудит инициирует **больше** прогонов (или тяжелее уровень), чем было разумно при самой реализации — стратегия **неверна**; нужно остановиться и сузить scope.

Круги worker→аудит→коррекция не запрещены сами по себе, пока каждый круг закрывает разное и чек-лист движется —
режим полностью описан в [§24](#24-оркестрация-субагентов). Изменивший код auditor/correction owner не
принимает собственный fix — нужен независимый re-audit.

### Dev-DB opt-in smoke-тесты

Ряд Vitest-тестов в `apps/webapp` скрыт за флагами `RUN_<DOMAIN>_DEV_DB=1` (плюс `USE_REAL_DATABASE=1` и `DATABASE_URL`). По умолчанию они **пропускаются** (`describe.skipIf`) и **не входят в CI**. Текущий legacy-набор сохраняет локальный **read-only** контракт. Новые DEV-DB тесты, расширение набора и mutating smoke заморожены до отдельного аудита ролей/стен, стабилизации схемы БД и явного owner-go. Полное соглашение: `.cursor/rules/test-execution-policy.md` §«Dev-DB opt-in smoke-тесты».

---

## 10a. Тест проверяет ПОВЕДЕНИЕ, а не текст исходника и не обстоятельства запуска

_Источник: `.cursor/rules/tests-check-behaviour-not-circumstances.mdc` — отдельный файл, на него завязан
механический гейт запуска агентов; этот раздел — его короткая форма._

Тест имеет право на жизнь, если одной строкой называется конкретная поломка, которую он поймает, в форме
«подали такое — получили неправильное такое», и эта поломка правдоподобна; «проверяет корректность» — не
ответ. Спор решает арбитр, не мнение: внести названную поломку в код руками и проверить, покраснел ли тест —
не покраснел, значит он не ловит то, ради чего написан. Фильтр годности применяет не автор теста — автор
всегда найдёт оправдание своему тесту.

### ⛔ Как НЕ надо

1. **Читать исходник и сверять его текст** — `expect(src).toContain('some("literal")')` ловит смену кавычек, не поведение.
2. **Сравнивать позиции символов в файле** — `expect(src.indexOf(a)).toBeLessThan(src.indexOf(b))` утверждает порядок строк в исходнике, а не поведение.
3. **Считать вхождения в тексте** — `expect(src.match(/fn/g)?.length).toBeGreaterThanOrEqual(N)` — тот же пиннинг текста в форме, похожей на проверку значения.
4. **Вмораживать `файл:строка` в ожидаемое значение** — номер строки едет от любой правки файла. Путь — можно, номер строки в `toEqual` — нельзя; номер показывать в тексте ошибки, вычисляя его в момент падения (`expect(x, \`строки: ${lines}\`).toEqual(paths)`).
5. **Сверять текст `.sql` деплоя или миграции** — дублирует деплой и делает это хуже: зеленеет, когда SQL написан верно, но не применён к живой базе, и краснеет при простом переформатировании. Права ролей/RLS/владение таблицами проверяет деплой (`assert_*`-шаги) против живой БД, не текстовый тест.
6. **Привязываться к обстоятельствам запуска** — относительный путь от текущего каталога, `new Date()` без подмены таймеров, часовой пояс/локаль/абсолютный путь бокса. Путь к файлу — только от самого файла теста (`import.meta.url`); время — `vi.useFakeTimers()`/`vi.setSystemTime()`; часовой пояс и локаль — задавать явно.
7. **Проверять только, что вызвана собственная заглушка** — `expect(mockedRepo.save).toHaveBeenCalled()` ничего не знает о результате. Законно только когда предмет проверки — сам факт обращения к границе (нужные аргументы при ошибке, отсутствие вызова в запрещённой ветке); тест, на 80% состоящий из таких утверждений, не проверяет ничего.
8. **Закреплять тестом собственную ошибку реализации** — не суметь починить код и подогнать под него тест.

### ✅ Как надо

- **Поведение:** подали вход — получили выход; что внутри функции — тесту знать не положено.
- **Безопасность:** неверный пароль → отказ; повтор → задержка; чужая клиника → пусто.
- **Доступ к данным:** полная DB/RLS-матрица — после отдельного аудита ролей/стен, стабилизации схемы БД и
  owner-go ([§10b](#10b-канон-написания-тестов)); до этого fake/DEV-smoke не доказательство DB/RLS, новый DB-тест не писать.
- **Структуру кода**, если она правда важна, проверять по дереву разбора (`typescript` уже в зависимостях), не
  регуляркой по тексту: разбор по дереву не замечает кавычек и переносов строк.
- **Гейт с самотестом:** механическая проверка обязана иметь тест «сломай специально — убедись, что заметил».

### Проверь себя перед коммитом

1. Назови одной строкой поломку, которую ловит твой тест. Не смог — удали тест.
2. Внеси эту поломку в код руками. Тест покраснел? Нет — он бесполезен.
3. Переформатируй затронутые файлы. Тест покраснел? Значит он про текст, а не про поведение.
4. Запусти из другого каталога. Упал? Значит он про обстоятельства запуска.

**Смысл:** тест, зелёный вне зависимости от реальной поломки, создаёт ложное чувство защиты; тест, красный от
переформатирования, обесценивает красный цвет для всего набора и делает подгонку теста под код нормой.

## 10b. Канон написания тестов

_Полный канон: `.cursor/rules/test-execution-policy.md` §«Канон написания тестов: необходимый и достаточный
объём» — этот раздел его короткая форма._

Цель — не максимум тестов и не максимум безопасности любой ценой. Тест нужен только тогда, когда он защищает
названное поведение от правдоподобной поломки. Перед созданием или сохранением теста агент обязан ответить:

1. **Что именно сломается?** Одна конкретная фраза вида «при входе X система ошибочно делает/возвращает Y».
2. **Зачем это защищать?** Какое наблюдаемое последствие будет у пользователя, данных, денег, интеграции,
   доступности или безопасности, если теста не будет?
3. **Откуда взят oracle?** Только требование владельца, канонический план/контракт, внешний протокол,
   подтверждённый дефект или ранее наблюдавшееся стабильное поведение. Проверяемая реализация не может сама
   придумать ожидаемый результат.
4. **Нет ли уже достаточной защиты?** Другой тест или механический гейт считается защитой только при точной
   ссылке на реально запускающий его CI workflow/job. Скрипт, package alias или выключенный workflow не считается.
5. **Какой самый дешёвый публичный слой видит эту поломку?** Использовать его; не поднимать БД/UI/E2E, если тот
   же класс ошибки полностью ловится unit/route-тестом.

Нет конкретной поломки или независимого oracle — **тест не писать**. Неясное продуктовое ожидание — `OWNER
QUESTION`, а не догадка агента. Coverage, размер/сложность файла, приватная функция, желание «подстраховаться» или
сам факт рефакторинга не являются основанием для теста. Refactor без изменения уже защищённого поведения нового
теста не требует.

### Какой файл писать

- `*.unit.test.ts` — чистая бизнес-логика через публичный API модуля;
- `fast-check` используется внутри unit-теста; отдельного суффикса для property-based tests нет;
- `*.contract.test.ts` — только настоящий контракт между границами или сервисами;
- `*.route.test.ts` — наблюдаемая HTTP-семантика;
- `*.ui.test.tsx` — поведение, наблюдаемое только через UI;
- `*.postgres.integration.test.ts` — реальное поведение одноразовой PostgreSQL, но **только после отдельного
  owner-go из следующего раздела**.

Тестировать каждую функцию отдельно не нужно. Внутренние функции покрываются через публичное поведение модуля;
прямой unit оправдан только для самостоятельного публичного бизнес-правила. Один сценарий не размножается по
unit/route/UI/E2E: defense-in-depth допустим, только если каждый слой ловит другой класс поломки.
Если заявлено поведение маршрута, `*.route.test.ts` вызывает настоящий публичный handler/proxy вместе с его wiring:
прямой вызов guard/service не доказывает, что маршрут вообще использует эту защиту.

### Что автоматизируется

- Production Zod-схема остаётся единственным источником формы данных; не создавать параллельную test DSL/schema.
- Fishery/builders строят setup; `fast-check` генерирует и shrink-ит входы; типизированный `test.each` перебирает
  примеры и роли. Они не придумывают бизнес-ожидание.
- AI может подготовить черновик, но человек/оркестратор проверяет независимый oracle.
- Тест не воспроизводит алгоритм кодирования, подписи или протокола нашей реализации, чтобы изготовить себе oracle:
  некорректные и граничные значения строятся публичным builder/encoder модуля. Независимая реализация внешнего
  опубликованного протокола по его спецификации допустима — запрет касается копии собственного кода.
- Целевая мутация/fault injection обязательна один раз на каждый независимый класс поломки — отдельный путь
  отказа/решения, а не на каждый `it` и не на `describe` целиком. Результат записывается как
  «что сломано → какое утверждение покраснело». Не строить ради этого новый глобальный фреймворк, если достаточно
  локальной проверки.

Заглушки допустимы на внешних границах. `toHaveBeenCalled*` не является самостоятельным oracle внутренней
реализации. Для наблюдаемого side effect (отправка, платёж, аудит, постановка в очередь) допустимо проверять точные
аргументы и отсутствие вызова в запрещённой ветке.

Не писать тесты текста исходников/SQL, порядка внутренних вызовов и обстоятельств запуска. Не дублировать unit-тестом
append-only/journal/chokepoint-инвариант, если он уже доказан действующим fail-closed CI-гейтом с точной ссылкой на
workflow. Legacy keep-set не даёт исключения из этих правил.

### DB/RLS — после аудита и стабилизации БД

Полная PostgreSQL/RLS/ACL/concurrency-матрица строится **после отдельного аудита ролей и стен, стабилизации схемы
БД и явного owner-go**. До этого:

- не создавать новую DB/RLS test-механику и фиктивные `*.postgres.integration.test.ts`;
- не подключать новые тесты напрямую к общей `bcb_webapp_dev`;
- не выдавать fake repository/DEV-smoke за доказательство PostgreSQL, транзакций или RLS;
- существующие legacy `*.devDb.integration.test.ts` не расширять и не считать merge-гейтом;
- DB-free unit/route-тест может проверять решение до порта, но не заявляет DB/RLS гарантию.

### Слепой список поломок составляет аудитор, а не автор теста

Полный текст (протокол, роль запуска, критерий приёмки): `.cursor/rules/test-execution-policy.md`
§«Слепой список поломок составляет АУДИТОР, а не автор теста».

Воркер пишет тесты и не подтверждает их годность сам. Аудитор — отдельным проходом, роль запуска
`auditor-live` (обычный read-only `auditor` физически не может внести поломку) — составляет список поломок по
плану и решениям владельца, НЕ читая тестов, вносит их в код и прогоняет лично; смена автора теста эту слепоту
не заменяет, она лишь переносит её на аудитора. Критерий приёмки — убиты ВСЕ названные планом поломки,
процентного порога нет; тест, не покрасневший ни на одной чужой поломке, считается отсутствующим независимо от
цвета прогона. Дорогой (сильная модель, слепой список) — только первый аудит новой поверхности; повторный
прогон уже составленного списка по починенному коду — дешёвая модель или сам воркер в конце починки, без новой
сессии (см. [§24](#24-оркестрация-субагентов) «Дорогой аудит — только первый»).

**Смысл:** арбитра для теста сегодня выбирает автор теста после того, как тест уже написан, — поэтому арбитр
подтверждает ровно то, что автор и так покрыл, и пропускает то, о чём автор не подумал. Слепой список,
составленный не автором и до чтения тестов, — единственный способ поймать непокрытое.

### Что проверяет аудитор тестов

Аудитор не ищет максимум замечаний. Он отклоняет тест только при реальной ложной защите, неработоспособности,
уязвимости или нарушении этого канона. Для каждого нового/сохранённого теста он проверяет:

1. названы поломка и последствие;
2. oracle независим от проверяемой реализации;
3. выбран самый дешёвый публичный слой и нет бессмысленного дубля;
4. файл реально выбирается своим Vitest project/CI job; zero-file или висячий include не считается зелёным;
5. для каждого нового независимого класса поломки записано
   «целевая мутация/fault injection → покрасневшее утверждение»;
6. DB/RLS не имитируется до owner-go;
7. **свой слепой список поломок составлен по плану ДО чтения тестов и прогнан лично** (раздел выше);
   отчёт содержит «что сломано → какое утверждение покраснело» и число непойманного.

Стиль, вкусовые улучшения и «можно покрыть ещё» не являются audit findings.

## 11. Webapp-тесты: компактность

Цель — не раздувать время прогона, граф модулей и число файлов без явной продуктовой необходимости.

### Импорты App Router `page.tsx`

- В `*.unit.test.ts`, `*.route.test.ts` и `*.ui.test.tsx` не импортировать `page.tsx` ради проверки внутреннего
  модуля. Выбирать узкую публичную границу: API модуля, HTTP handler/proxy или пользовательское поведение компонента.
- Редкий настоящий e2e со страницей должен защищать сквозное поведение, которое нельзя дешевле наблюдать через
  unit/route/UI, и не должен дублировать те же сценарии на каждом слое.

### RTL и `React.lazy`

- Чанки под ленивые вкладки/импорты — прогрев в **`beforeAll`** (`Promise.all` + `import(...)`), иначе растут флаки и соблазн поднимать таймауты.

### Файлы и дубли

- Предпочитать **расширение существующего** тест-файла той же зоны ответственности вместо нового файла с одним-двумя `it`, если нет причины изолировать (разный setup, другой глобальный мок).
- **Не** копировать одни и те же тяжёлые импорты/моки в несколько файлов без необходимости.

### Таймауты

- В `apps/webapp/vitest.config.ts` проекты `fast`, `unit`, `route` и `ui` используют одинаковые по умолчанию
  `testTimeout` 20s и `hookTimeout` 25s — медленные `it` без обоснования должны падать.
- **Не** поднимать глобальные `testTimeout` / `hookTimeout` в `vitest.config.ts` «чтобы стало зелёно». Сначала уменьшить холодный граф (прогрев, меньше импортов страниц), затем при необходимости — **точечный** `timeout` на конкретный `it`/`beforeAll`.

### Куда смотреть

- Канон по e2e и скриптам: `apps/webapp/e2e/README.md`, шаблон замеров: `apps/webapp/e2e/CI_BASELINE.md`.
- Уровни прогона (step / phase / CI): раздел [Test execution policy](#10-test-execution-and-audit-policy).

**Смысл:** каждый лишний импорт `page.tsx` и непрогретый ленивый чанк умножается на число тестов, которые его
тянут — холодный граф модулей раздувает время прогона быстрее, чем растёт покрытие.

---

## 12. Plan Authoring And Execution Standard

**Цель:** чтобы агентские планы были подробными, проверяемыми и безопасными по области изменений.

### Обязательные правила

1. **Декомпозиция по умолчанию**
   - Если пользователь не просил иначе, делать подробный план уровня Cursor-агента: этапы -> шаги -> проверки -> критерии закрытия.

2. **Чек-листы на каждый шаг**
   - Для каждого шага добавлять короткий checklist с **локальными** проверяемыми пунктами: `rg`, релевантные unit/интеграционные тесты, `lint` / `typecheck` по затронутому пакету при необходимости, короткий smoke.
   - **Не требовать** в плане полный корневой `pnpm run ci` после **каждого** шага или после **каждого** небольшого плана — это дорого и снижает готовность планов к исполнению.
   - Не помечать шаг как закрытый без фактической проверки, подходящей по масштабу шага.
   - Roadmap/epic summary не заменяет linked detailed plan. Каждый owner requirement и позднее уточнение — отдельный
     atomic checkbox; worker и auditor читают весь linked authority, получают exact IDs/полный текст и возвращают
     матрицу `status → code evidence → test evidence → runtime evidence → deferred/blocker reason`.
   - Новое owner-уточнение сразу заменяет старое; противоречащий текст удалить либо пометить
     `SUPERSEDED — <date>, replaced by <section/id>`. Два несовместимых active-требования запрещены. `N/A`
     требует причины, defer/cancel — явного owner ruling со ссылкой. Missing/unclassified checkbox запрещает
     `done/PASS`.
   - Audit brief цитирует ID и полный текст linked plan/checklist scope; ссылка на план или roadmap summary не
     являются достаточным заданием.

3. **Scope boundaries (безопасные рамки)**
   - Явно указывать, какие директории/файлы **разрешено** трогать.
   - Явно фиксировать, что **вне scope** (не менять соседние системы, UI/архитектуру/миграции, если это не запрошено).
   - Любое расширение scope сначала согласовать с пользователем.

4. **Запрет размытого «опционально»**
   - В `.cursor/plans/*.plan.md` **не** использовать для шагов внутри scope формулировки вроде «опционально», «optional», «по желанию», «если успеем», «можно позже» — это неисполняемые обязательства и их по умолчанию **никто не делает**.
   - Каждый пункт либо **входит в Definition of Done** с `todo`, проверками и явным закрытием, либо имеет
     трассируемое основание для `status: cancelled`. Atomic owner requirement агент может отменить/деферить **только**
     по явному owner ruling (`path/section/date + reason`). Не-owner mechanical plan item агент может пометить
     `cancelled` только когда governing plan authority явно разрешает такую отмену/условие, со ссылкой; это не закрывает
     и не скрывает связанный owner checkbox. Иначе пункт остаётся `todo/blocked` либо выносится владельцу вопросом, а
     не исчезает во «вне scope» / backlog.
   - При исполнении плана агент **не** добавляет «опциональные» хвосты задач без явного запроса пользователя.

5. **Execution log обязателен**
   - Для инициативных задач требовать и вести `LOG.md` в профильной папке docs.
   - В логе фиксировать: что сделано, какие проверки выполнены, какие решения приняты, что сознательно не делали.
   - `LOG.md`, roadmap/stage status и taskdb не помечаются `done/completed/PASS`, пока referenced checkbox открыт.
     Исключение — только явный owner defer/cancel с трассируемой ссылкой и причиной на соответствующей строке.

6. **Правила перед исполнением**
   - Перед реализацией обязательно прочитать релевантные `.cursor/rules/*.mdc` и следовать им.
   - Если есть конфликт правил, приоритет у always-apply и более узкоспециализированных правил по теме.

7. **Корректность статусов в файле плана**
   - Проверять консистентность `todos`/`status` в самом plan-файле.
   - После завершения работ обновлять статусы (`pending` -> `in_progress` -> `completed`/`cancelled`) без пропусков.
   - Aggregate worker `done` или audit `PASS` не меняет checkbox status автоматически: закрывается только строка с
     достаточным code/test/runtime evidence либо явным owner defer/cancel. Blocker без owner defer оставляет stage
     незавершённым.
   - **Обязательная процедура при полном закрытии плана** (все пункты выполнены или явно отменены, Definition of Done закрыт): для файлов **`.cursor/plans/*.plan.md`** — **не завершать сессию**, пока не выполнено ниже. Иначе Cursor часто оставляет план «висящим» (активный **Build** / незакрытый run).
     1. В начале файла должен быть валидный блок **`---` YAML frontmatter `---`** (как в `.cursor/plans/archive/hls_private_bucket_proxy.plan.md`): не оставлять план только с markdown без frontmatter.
     2. Поля **`name`** и **`overview`** — осмысленные непустые строки (не `""`).
     3. Массив **`todos`**: у **каждого** элемента с **`id`** и **`content`** выставить **`status: completed`** для
        сделанного. `status: cancelled` требует обязательную ссылку+причину: для owner requirement — явный owner
        ruling; для non-owner mechanical item — заранее разрешяющее это условие governing plan authority. Agent
        convenience/short reason недостаточны и не закрывают связанный owner scope. Не оставлять `todos: []` при
        непустом теле плана с DoD, если по смыслу были шаги — лучше перечислить те же шаги с `completed`.
     4. **`isProject`**: `false` по умолчанию; `true` только если план изначально заведён как долгоживущий project-tracker по согласованию.
     5. В markdown-теле плана выровнять **Definition of Done** / чеклисты (`[x]` / `[ ]`) с фактическими **`todos.status`**.
     6. Если пользователь **запретил** править конкретный plan-файл — один раз явно написать в ответе, что процедуру закрытия frontmatter нужно сделать вручную или снять запрет.

8. **Синхронная документация**
   - При изменениях по теме плана обновлять соответствующую проектную документацию в той же области (README модуля, initiative docs, runbook/API docs).
   - Не трогать immutable-документы, если явно помечены как baseline.
   - При owner correction синхронизировать detailed checklist, routing roadmap, LOG и затронутый style/architecture
     canon в одном проходе; старую активную формулировку не оставлять конфликтовать. Taskdb-карточку не превращать в
     второй журнал: там меняется только статус, ссылка на план или, если изменилась сама суть workstream, его
     краткое понятное описание.

9. **Перенос плана из `~/.cursor/plans/` в монорепо (`.cursor/plans/archive/`)**
   - Канон: **`git mv <исходный-файл> .cursor/plans/archive/<имя>.plan.md`**; если файл ещё не отслеживается git — **`mv`** в каталог архива, затем **`git add`**.
   - **Не** оставлять во `~/.cursor/plans/` **stub** («см. репозиторий») как второй источник правды.
   - **Не** воссоздавать план через Read → Write полного текста из чата вместо **переноса того же файла** (потеря байт-в-байт, лишний diff, расхождение с тем, что было в IDE).
   - Обновление frontmatter (`status`, `todos`) и правки тела — **после переноса**, только в файле внутри репозитория (если пользователь не запретил правки).

### Полный CI (`pnpm run ci`)

- **В тексте плана** явно различать:
  - **Обычный финал задачи / маленький план:** достаточно целевых проверок из чек-листа (часто — затронутые тесты + lint/typecheck по области).
  - **Большой многоэтапный план:** один финальный прогон **`pnpm run ci`** (или эквивалент из корневого `package.json`) после завершения всего объёма или перед передачей в merge — указать это один раз в Definition of Done / критериях приёмки.
  - **Deploy / merge / integration checkpoint:** полный CI обязателен по правилам репозитория (см. раздел [Full CI gate](#9-full-ci-gate)) — **не** дублировать это как требование после каждого подпункта плана. Обычный feature-branch backup-push после локального gate не требует full CI сам по себе.

### Дополнительно (без лишнего усложнения)

- В каждом плане добавлять краткий блок **Definition of Done** (3-7 измеримых пунктов).
- Для удалений сначала делать `rg`-проверку на runtime-использование, затем удалять.
- В финале всегда давать короткий отчёт: изменённые области, результаты проверок, что намеренно не делали.

**Смысл:** план без атомарных чекбоксов и явного scope позволяет закрыть этап отчётом «сделано», не доказав
это по каждому требованию; roadmap-сжатие вместо детального плана — тот же провал в другой обёртке.

---

## 13. Формат ответа: ИТОГ

- Если пользователь **не просил** разбор кода, файлов, цитат, диффов и пошаговую трассировку реализации — отвечать **кратко**, с блоком **ИТОГ** (или эквивалентной одной сжатой формулировкой вывода).
- **Не** включать в такой ответ: большие фрагменты кода, длинные списки путей/идентификаторов, подробные цепочки вызовов — **до тех пор**, пока пользователь явно не попросил «где в коде», «покажи код», «детали», «trace» и т.п.
- Если для точности нужны 1–2 коротких упоминания (имя сервиса, таблица, эндпойнт) — допустимо одной строкой без развёрнутых блоков.
- Когда пользователь **явно просит** код или локализацию в репозитории — применять обычные правила проекта (ссылки на код, точность, инструменты).

**Смысл:** нераспрошенная трассировка реализации тратит время читателя на детали, о которых он не просил.

---

## 14. Коммуникация без навязанных концовок

Отвечать строго по запросу пользователя, без обязательных «хвостов» в конце. Запрещено: добавлять фразы вида
«Если хочешь, могу…», «Могу ещё…», «Дальше могу…», когда пользователь этого не просил; навязывать follow-up
шаги и дополнительные задачи; завершать ответ engagement-фразами «скажи — и сделаю». Разрешено: предлагать
следующий шаг только если пользователь явно попросил варианты/рекомендации; задавать только необходимые
уточняющие вопросы по текущей задаче.

**Смысл:** навязанное «могу ещё» после каждого ответа — не полезная информация, а шаблонный шум, который
приходится игнорировать каждый раз заново.

---

## 14a. Языковая политика Codex

Отвечать владельцу по-русски, если он явно не попросил другой язык. Internal reasoning summaries, execution
plans, inter-agent prompts/reports и working notes — на английском (дешевле по токенам). Язык существующих
проектных документов и цитируемого исходного текста сохранять — не переводить русскоязычные доки/UI-тексты
ради этого правила.

**Смысл:** внутренние рассуждения не читает владелец, и их токенная цена ниже на английском; документы и
UI-тексты читает владелец и пользователи, их язык определяется аудиторией, а не правилом про служебный обмен.

---

## 15. Patient UI Shared Primitives

При работе с patient pages (`apps/webapp/src/app/app/patient/**`) сначала использовать готовые shared стили и UI-примитивы.

### Источники по умолчанию

1. `docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`
2. `apps/webapp/src/shared/ui/patientVisual.ts`
3. `apps/webapp/src/shared/ui/patient/PatientCatalogMediaStaticThumb.tsx` (превью каталожного медиа в списках/модалках)
4. `apps/webapp/src/shared/ui/patient/primitives/*` — shadcn-копии для patient zone (**не** `@/components/ui/**` в patient routes: ESLint + [§17](#17-patient--doctor-ui-isolation))
5. `apps/webapp/src/app/globals.css` (`#app-shell-patient` токены)

### Обязательные правила

- Не писать новый локальный custom UI для карточек/кнопок/бейджей/accordion-like/form controls, если уже есть shared/shadcn решение.
- Не переносить home-specific geometry из `app/app/patient/home/patientHomeCardStyles.ts` на внутренние страницы.
- Для новых page-redesign/style-pass задач переиспользовать patient primitives и shadcn base, а не создавать "одноразовый chrome" внутри route-компонента.

### Медиа: превью только картинка (кабинет пациента)

Для **всех** страниц и блоков `apps/webapp/src/app/app/patient/**`:

- **Миниатюры и строки списков** (карточки, модалки, таймлайны): только **статичное изображение** — `PatientCatalogMediaStaticThumb` (`apps/webapp/src/shared/ui/patient/PatientCatalogMediaStaticThumb.tsx`) + `MediaThumb` (`apps/webapp/src/shared/ui/media/MediaThumb.tsx`) и модели из `mediaPreviewUiModel` (превью воркера `previewSmUrl` для видео, исходный URL для image/gif). Обложки ЛФК — по-прежнему `lfkCoverToPreviewUi` + `MediaThumb`.
- **Запрещено** на превью: тег `<video>`, иконка «кино» (Film) или декоративный оверлей плеера **вместо** картинки. Воспроизведение видео — **только** на целевой странице контента / в компоненте с полноценным плеером (например `PatientContentAdaptiveVideo`).
- **Иконка плеера на кнопке/ссылке** («Начать разминку», «Начать занятие») допустима как **призыв к действию**, не как замена превью медиа.

### Когда кастом допустим

Кастом возможен только при явной продуктовой причине и отсутствии подходящего shared/shadcn варианта. Причину нужно зафиксировать в docs/LOG активной инициативы.

**Смысл:** локальный custom UI рядом с готовым shared-примитивом дублирует поддержку одного и того же паттерна
в двух местах, и они молча расходятся при следующей правке стиля.

---

## 16. Doctor UI Shared Primitives

При работе с кабинетом врача/админа (`apps/webapp/src/app/app/doctor/**`) и связанными shared-компонентами сначала использовать канон дизайн-системы проекта, а не локальные одноразовые обёртки.

### Источники по умолчанию (порядок чтения)

1. [`docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`](docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md) — паттерны секций, списков, каталогов, карточки клиента, диалоги, KPI, mobile.
2. [`apps/webapp/src/shared/ui/doctorVisual.ts`](apps/webapp/src/shared/ui/doctorVisual.ts) — page-level class constants (`doctorSectionCardClass`, `doctorSectionTitleClass`, `doctorEmptyStateClass`, catalog rows, …).
3. [`apps/webapp/src/app/app/doctor/clients/doctorClientCardChrome.ts`](apps/webapp/src/app/app/doctor/clients/doctorClientCardChrome.ts) — shell и панели карточки клиента (entity-card), без дубля в `doctorVisual`.
4. [`apps/webapp/src/shared/ui/doctorWorkspaceLayout.ts`](apps/webapp/src/shared/ui/doctorWorkspaceLayout.ts) — контейнер страницы, sticky toolbar каталога.
5. [`apps/webapp/src/shared/ui/doctor/`](apps/webapp/src/shared/ui/doctor/) — каталог, toolbar, `DoctorSection` / `DoctorSectionHeader` / `DoctorEmptyState` / `DoctorMetricList`.
6. [`apps/webapp/src/shared/ui/doctor/primitives/*`](apps/webapp/src/shared/ui/doctor/primitives/) — shadcn-копии doctor zone (**не** `@/components/ui/**` в doctor routes; ESLint + [§17](#17-patient--doctor-ui-isolation)). Источник для копирования: `components/ui/`.
7. Журнал унификации (исключения, cancelled routes): [`docs/archive/2026-06-initiatives/DOCTOR_UI_UNIFICATION_INITIATIVE/README.md`](docs/archive/2026-06-initiatives/DOCTOR_UI_UNIFICATION_INITIATIVE/README.md).

Плотность UI **не откатывать** — см. [`docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_PLAN.md`](docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_PLAN.md).

### Обязательные правила

- **Reuse-first:** перед новой секцией/списком/тулбаром проверить гайд §3–§8 и `doctorVisual` / `shared/ui/doctor/`.
- **Не** добавлять локальные «самописные» карточки, заголовки и empty states, если покрывает `DoctorSection`, `DoctorEmptyState` или константы из `doctorVisual.ts`.
- **Page-level секции:** `doctorSectionCardClass` (или `<DoctorSection>`) — радиус `12px`, внутренний отступ `18px`, `gap-3`, **без** `shadow-sm` и **без** `rounded-2xl`.
- **Заголовки:** `doctorSectionTitleClass` / `doctorPageTitleClass` / `doctorClientSectionTitleClass` — **запрещены** голые `<h2>` / `<h3>` без `className`.
- **Карточка клиента:** только chrome из `doctorClientCardChrome.ts`; вкладки и overview — primary/secondary/stacked по гайду §9.
- **Каталоги (split-layout):** эталон — `exercises/ExercisesPageClient.tsx`; стек `DoctorCatalogPageLayout` + `DoctorCatalogFiltersToolbar` + `CatalogSplitLayout`; primary action — `doctorCatalogToolbarPrimaryActionClassName`.
- **Диалоги:** shadcn `Dialog` с шириной из гайда §14; не inline-раскрытие деструктивных действий вне Dialog.
- **Кнопки:** primary — `default` / `size="sm"`; **не** `ghost` как основное действие (гайд §16).
- **Select:** при нечитаемом `value` — `displayLabel` на `SelectTrigger` (см. раздел [UI: Select](#22-ui-select--displaylabel)).

### Области вне этого канона (не унифицировать здесь)

- `admin/booking/**`, `booking-merge` — владеет [`BOOKING_REWORK_INITIATIVE`](docs/BOOKING_REWORK_INITIATIVE/ROADMAP.md).
- `admin/app-settings`, `admin/auth`, `admin/integrations`, `admin/technical` — отдельные admin forms.
- Пациентский UI (`/app/patient/**`) — [`PATIENT_APP_UI_STYLE_GUIDE.md`](docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md) и раздел [Patient UI](#15-patient-ui-shared-primitives).

### CMS медиа-пикер

Модалки выбора файла из библиотеки — раздел [CMS media picker](#20-cms-единый-layout-медиа-пикера) (`MediaPickerShell` / `MediaPickerPanel`).

### Когда кастом допустим

Только при явной продуктовой причине и отсутствии паттерна в гайде; кратко зафиксировать в LOG соответствующей инициативы или в PR. Новые npm-зависимости ради UI — не добавлять.

### Единый визуальный язык и шкала (гайд §A–§C)

- Doctor canvas — exact `#F6F4EF` через `--doctor-page-gap-background: var(--bc-canvas)`; page header и
  основные поверхности остаются белыми. Глубина — тонкие границы/лёгкие поверхности, не тени (§A). `shadow-*` —
  только floating (медиакарточки §11, поповеры, drag), **не** на page-level секциях/KPI.
- Semantic primary кабинета врача — ровно `#406ca7` через зональный `--primary`; кнопки, ссылки, active/focus и другие primary-consumers используют semantic-классы, а не локальный hex. Patient/public tokens и destructive/warning/info роли не перекрашивать.
- Chrome-типографика — закрытый набор §B.1: page-title `text-base`, section `text-sm`, обычный body `text-sm`, **первичная строка списка** `text-base font-normal`, meta `text-xs`, KPI `doctorMetricValueClass` (`text-2xl`). Micro-роль `text-[10px]`/`text-[11px]` — только бейджи/календарь/оси графиков/mono. Запрещено: `text-[13px]`, `text-lg`, `text-xl`, `text-3xl`.
- Контролы doctor-zone: input/select-триггер/база кнопки — `h-8`/`h-[32px]` + радиус `24px`; фактическая поверхность input белая; поле и кнопка/select в одной строке совпадают.
- Радиусы (§A.3): page-block `12px`, KPI `8px`, doctor button/input/select trigger `24px`; `rounded-2xl` запрещён. Явный радиус caller (`rounded-none`, icon override и т.п.) сохраняется.
- Исключение навигации: main doctor sidebar/mobile menu items не являются button pills и сохраняют минимальный
  shared near-rectangular menu radius; 24px control radius на menu rows не распространяется. Section tabs имеют
  отдельный rounded contract.
- Основные flat-list строки переиспользуют геометрию списка «На сопровождении» на странице «Сегодня», без локальных
  числовых копий отступов; между пунктами divider ровно `1px #f0efeb`, full-row hover для интерактивных списков;
  первичная строка крупнее и легче (`text-base font-normal`).
- active/hover/focus — словарь §A.4 (active = `bg-primary/15 text-primary`/`ring`, не жирная заливка и не хардкод-hex).
- KPI-метрика — `doctorMetricValueClass` из `doctorVisual.ts`, не локальный `text-3xl`.

**Смысл:** токены дизайн-системы задают единую шкалу; локальный hex или произвольный radius не согласуется с
соседними экранами и расходится при следующем визуальном пересмотре.

### Быстрая самопроверка перед сдачей

```bash
rg "rounded-2xl|<h2>[^<]" apps/webapp/src/app/app/doctor --glob "*.tsx"
rg "text-\[13px\]|text-lg|text-xl|text-3xl" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor --glob "*.tsx"
rg "doctorSectionCardClass|DoctorSection|doctorClientCardChrome" apps/webapp/src/app/app/doctor/<зона>
```

---

## 17. Patient / Doctor UI Isolation

При правках patient или doctor product zones соблюдать физическое разделение UI и CSS.

### CSS

| Файл                             | Подключение                                                |
| -------------------------------- | ---------------------------------------------------------- |
| `app/styles/tailwind-engine.css` | `app/layout.tsx` (Tailwind + shadcn `:root`)               |
| `app/styles/patient.css`         | `app/app/layout.tsx`, `app/book/layout.tsx`                |
| `app/styles/doctor.css`          | `app/app/doctor/layout.tsx`, `app/app/settings/layout.tsx` |
| `app/styles/landing.css`         | `app/page.tsx`                                             |

**Запрещено:** импорт `globals.css`, дублирование `patient.css` в `app/patient/layout.tsx`.

### UI trees

- Patient: `shared/ui/patient/**` + `@/shared/ui/patient/primitives/*`
- Doctor/settings: `shared/ui/doctor/**` + `@/shared/ui/doctor/primitives/*`
- Shells: `PatientAppShell`, `DoctorAppShell` (не общий `AppShell`)

### ESLint

Patient zone и doctor zone — `no-restricted-imports` в `eslint.config.mjs`:

- Patient routes/modules **и** `shared/ui/patient/**`: не импортируют `@/shared/ui/doctor/**` или `@/components/ui/**`
- Doctor routes/settings **и** `shared/ui/doctor/**`: не импортируют `@/shared/ui/patient/**` или `@/components/ui/**`

Исключение: `app/layout.tsx` — `TooltipProvider` из `@/shared/ui/patient/primitives/tooltip`.

### Канон

- Patient UI: `docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`, раздел [Patient UI](#15-patient-ui-shared-primitives)
- Doctor UI: `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`, раздел [Doctor UI](#16-doctor-ui-shared-primitives)
- Инициатива split: `docs/archive/2026-06-initiatives/PATIENT_DOCTOR_UI_SPLIT_INITIATIVE/`

### Новые компоненты

Копировать shadcn из `components/ui/` в нужную `*/primitives/`; cross-import между patient и doctor **запрещён**.

**Смысл:** общий CSS/UI-дерево между зонами означает, что правка стиля в одной незаметно перекрашивает другую;
физическое разделение делает эту утечку невозможной на уровне сборки, а не только по договорённости.

---

## 18. Пациент: «ЛФК» = программа реабилитации

### Продуктовый смысл (русский UI и коммуникация с пользователем)

В **кабинете пациента** (`apps/webapp/src/app/app/patient/**`) фразы **«ЛФК»**, **«ЛФК занятие»**, **«программа ЛФК»** и близкие формулировки в пользовательских текстах означают **программу реабилитации** (назначенный план лечения / реабилитационная программа в смысле `treatment_program` / напоминания `rehab_program`), а **не** отдельный сценарий «каталог комплексов ЛФК» как главную сущность.

### Запрет в области пациентского UX

- **Не** проектировать и **не** возвращать опору пациентского пути на **«комплекс ЛФК»** как на самостоятельную сущность навигации (списки комплексов, первичный сценарий «выбери комплекс», отдельный раздел приложения под legacy-модель дневника по комплексам).
- Новые экраны, подсказки и CTA для пациента по «что делать по ЛФК» вести через **программу реабилитации** и связанные с ней действия/напоминания (`rehab_program`, чек-лист программы и т.д.), а не через отдельный patient-flow вокруг `lfk_complex`.

### Отделение от технической модели

- В **коде, API и БД** по-прежнему могут встречаться идентификаторы вроде `lfk_complex`, `linked_object_type`, таблицы каталога ЛФК — это **не** требование немедленно переименовывать схему; правило про **тексты и UX для пациента** и про **смысл слова «ЛФК» в продукте** ортогонально эволюции DDL каталога ЛФК (см. `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md`).

### Агентам при правках

- При добавлении/правке **русских строк** в patient routes — сверяться с формулировкой **«программа реабилитации»** там, где речь о назначенном плане, а не восстанавливать «комплекс» как пользовательский термин.
- При аудите напоминаний и дневника: не предлагать «вернуть комплексы» как основной ответ пациенту; предлагать поверхность **программы реабилитации** и согласованные с ней правила.

**Смысл:** слово в пользовательском тексте и слово в схеме БД — разные вещи; продуктовый термин можно менять
без миграции схемы, а перепутанные термины в UX возвращают пациента к устаревшей ментальной модели «комплекса».

---

## 19. Patient media playback (HLS / MP4)

_Scoped: `apps/webapp/src/app/app/patient/**`, media components._

- Для **файлового** видео в `apps/webapp/src/app/app/patient/**` и в **Markdown-теле** страниц контента (`MarkdownEmbeddedLink`, `@/shared/ui/markdown/MarkdownEmbeddedLink.tsx`) используй **`PatientMediaPlaybackVideo`** (`@/shared/ui/media/PatientMediaPlaybackVideo`). Не добавляй «голый» `<video>` с прямым URL или отдельный progressive-only плеер вне этого компонента.
- **Миниатюры** в списках пациента — по-прежнему только картинка (`PatientCatalogMediaStaticThumb`); воспроизведение — только в полноценном плеере.
- **Быстрый превью видео** в `MediaPickerQuickPreviewDialog` использует тот же `PatientMediaPlaybackVideo` (единый стек с кабинетом пациента).
- Режим доставки задаёт только **`GET /api/media/[id]/playback`** и внутренняя логика fallback при сбое HLS; **нет** UI для выбора **формата** (HLS vs MP4). При **двух и более** строках в **`hls.qualities`** и воспроизведении через **`hls.js`** допускается выбор **разрешения** и индикация текущего варианта; при нативном HLS — только «авто»; при отсутствии поддержки **`hls.js`** при выдаче HLS включается progressive MP4 и селектор качества скрывается — см. `docs/ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md`.
- Если на сервере JSON не резолвили — передай `initialPlayback={null}`; компонент сам запросит `/playback` на клиенте (сессия обязательна для успешного ответа).
- Для извлечения `mediaId` из пути каталога и тела Markdown: **`parseApiMediaIdFromPlayableUrl`**, при необходимости **`parseApiMediaIdFromMarkdownHref`** (`@/shared/lib/parseApiMediaIdFromPlayableUrl`).

Документация: `docs/ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md`.

**Смысл:** отдельный самодельный плеер вне `PatientMediaPlaybackVideo` не получает fallback-логику HLS→MP4 и
расходится с единым поведением воспроизведения при следующем изменении формата доставки.

---

## 20. CMS: единый layout медиа-пикера

_Scoped: doctor CMS media pickers._

При добавлении или изменении **модалок выбора файла из медиабиблиотеки** в doctor CMS:

- Используйте **`MediaPickerShell`** + **`MediaPickerPanel`** из [`apps/webapp/src/shared/ui/media/MediaPickerShell.tsx`](apps/webapp/src/shared/ui/media/MediaPickerShell.tsx) и [`apps/webapp/src/shared/ui/media/MediaPickerPanel.tsx`](apps/webapp/src/shared/ui/media/MediaPickerPanel.tsx).
- Не дублируйте отдельные обёртки `Dialog`/`Sheet` с другой шириной и своим блоком «поиск + список», если сценарий — тот же паттерн (библиотека + опционально загрузка с устройства).
- Поведенческие отличия (фильтр по `kind`, папки и «только новые» для упражнений, показ сортировки) задаются **пропсами** `MediaPickerPanel`, а не копипастой разметки.
- Вкладка загрузки с устройства: после `POST /api/media/upload` результат сверяется с `kind` (`isPickedRowAllowedForKind`); при несовпадении показывайте пользователю понятный текст (как в текущей реализации), не вызывайте `onPick`. Ошибки API мапятся на русский текст (`mapUploadErrorByCode`).
- Для Markdown не дублируйте логику «картинка vs ссылка»: используйте [`markdownSnippetForMediaUrl`](apps/webapp/src/shared/ui/markdown/markdownMediaSnippet.ts) и передавайте в колбэк `kind`/`mimeType` из выбранной строки библиотеки.

Исключения (свой layout без этих компонентов) допустимы только при **явной продуктовой причине**; в PR кратко опишите, почему общий контейнер не подошёл.

Связанные входные точки: `MediaLibraryPickerDialog`, `MediaLibraryInsertDialog`.

**Смысл:** второй самописный layout модалки выбора файла дублирует поведение (upload, фильтр по kind, ошибки)
в двух местах, и они расходятся при следующей правке одного из них.

---

## 21. UI: тексты без избыточных пояснений

При реализации или правке UI (пациентский кабинет, админка, публичные экраны):

- **Не** добавлять «от себя» дополнительные заголовки секций, вводные абзацы, поясняющие подписи под элементами, декоративные подзаголовки и развёрнутые hint-тексты, если задача или спецификация этого **явно** не требуют.
- Сохранять лаконичность; ориентироваться на существующие экраны и паттерны проекта.
- Если кажется, что не хватает пояснения — по умолчанию **не** дописывать его в интерфейсе; уточнение — через постановку/продукт, а не через самовольные строки в коде.

**Исключения (разрешено без отдельного запроса):** доступность (`aria-*`, скрытые для вида но читаемые подписи), обязательные сообщения об ошибках/валидации, тексты жёстко зафиксированные в документации по конкретному экрану для этой задачи.

**Смысл:** пояснение, придуманное агентом по ходу реализации, — это продуктовое решение, принятое без продукта;
дописанный текст в интерфейсе живёт дольше задачи, ради которой его добавили.

---

## 22. UI: Select — displayLabel

Проект использует `@base-ui/react/select` через `apps/webapp/src/components/ui/select.tsx`.

### Проблема

Пока список опций **ещё не смонтирован** (типично до первого открытия/focus), `SelectValue` **без дочерних узлов** может отрисовать **сырое `value`** (uuid, англ. ключ enum, `__none__` и т.д.), даже если у `SelectItem` задан человекочитаемый текст.

### Что делать при новых селекторах

Если `value` **не совпадает** с тем, что должен видеть пользователь (русская подпись):

1. **Предпочтительно (рекомендуемый паттерн):** проп **`displayLabel`** на `<SelectTrigger>` —
   автоматически оборачивает подпись в `<SelectValue>`, `children` при этом не нужны:
   ```tsx
   <SelectTrigger displayLabel={options.find(o => o.value === val)?.label}>
   ```
2. Либо: передать **`items`** на `<Select>` — карта `value → подпись` или массив `{ value, label }` (см. JSDoc в `select.tsx` и тип `SelectRootProps["items"]` в Base UI).
3. Либо: явные дети **`<SelectValue>…</SelectValue>`**, вычисленные из текущего `value`.
4. Дополнительно при сложных опциях: **`label`** на `<SelectItem>` (пробрасывается в Base UI).

### Ограничения

- Не менять ради этого **роль**, **тип контрола**, **поведение** (контролируемое значение, `onValueChange`) и **внешний вид** триггера — только источник текста для отображения выбранного значения.

### Переиспользование

Общие карты для повторяющихся полей — в `apps/webapp/src/shared/ui/selectOpaqueValueLabels.ts` (или рядом с доменом), чтобы не дублировать строки.

**Смысл:** до первого монтирования списка опций `SelectValue` не знает человекочитаемый текст и без явного
источника отрисовывает сырое значение — пользователь видит uuid или enum-ключ вместо подписи.

---

## 23. Справочник вне `.cursor/rules`

Постоянные инструкции — в этом файле, разделы 1–24, и в разделе «Маршрут» в начале файла. Ниже —
**документы и паттерны**, которые Cursor не подставляет автоматически, но агенту нужно знать по задаче.

### Состояние `.cursor/rules/`

Текст каждого правила живёт только в `AGENTS.md`. `.cursor/rules/` содержит три файла:

| Файл                                              | Роль                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `000-start-here.mdc`                              | `alwaysApply: true`; тело зеркалит раздел «Маршрут» этого файла для автоподачи Cursor, текст не дублирует |
| `tests-check-behaviour-not-circumstances.mdc`     | Исключение: механический гейт запуска агентов завязан на этот путь — см. [§10a](#10a-тест-проверяет-поведение-а-не-текст-исходника-и-не-обстоятельства-запуска) |
| `test-execution-policy.md`                        | Исключение: чужой scope, не трогать — см. [§10](#10-test-execution-and-audit-policy), [§10b](#10b-канон-написания-тестов) |

`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` ([§1a](#1a-локальный-dev-и-тестирование-ui)) — канон
репозитория, не rule-файл, Cursor его не подаёт автоматически.

### Архитектура и контракты

| Документ                                                                                                   | Когда читать                                            |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                                                                       | Integrator: слои, запреты, runtime-процессы             |
| [`apps/webapp/INTEGRATOR_CONTRACT.md`](apps/webapp/INTEGRATOR_CONTRACT.md)                                 | M2M webapp↔integrator, idempotency, webhooks            |
| [`docs/ARCHITECTURE/DB_STRUCTURE.md`](docs/ARCHITECTURE/DB_STRUCTURE.md)                                   | Карта таблиц PostgreSQL (`public` + `integrator`)       |
| [`docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`](docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md)         | Маршруты врача/admin, меню                              |
| [`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md) | Что в env, что в `system_settings`                      |
| [`docs/RULES/README.md`](docs/RULES/README.md)                                                             | Нормативы исполнения (программы лечения, reminders DDL) |
| [`docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md`](docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md)       | Программы лечения, Drizzle, фазовые gate                |

### Модули в коде (`*.md` рядом с кодом)

В `apps/*/src/**` лежат `имя_папки.md` с контрактом модуля (auth, api, reminders, …). При правке модуля **сначала** откройте соседний `*.md`; индекс webapp-модулей: [`apps/webapp/src/modules/modules.md`](apps/webapp/src/modules/modules.md).

### Планы инициатив

`.cursor/plans/` и `docs/*_INITIATIVE/` — **задачи и журналы**, не standing rules. Не смешивать с `AGENTS.md`. Закрытые планы: `.cursor/plans/archive/`.

### Известные пересечения правил

- **Patient UI primitives vs isolation (§15 vs §17):** в patient/doctor **routes** импорт `@/components/ui/**` запрещён ESLint — используйте `shared/ui/patient/primitives` или `shared/ui/doctor/primitives`. Канонический shadcn живёт в `components/ui/` как **источник для копирования**, не для прямого импорта в product zones.
- **`dev_mode` (БД) vs `ALLOW_DEV_AUTH_BYPASS` (env):** разные вещи — см. [§1a](#1a-локальный-dev-и-тестирование-ui).

### Деплой и ops (кратко)

| Тема                     | Документ                                                                   |
| ------------------------ | -------------------------------------------------------------------------- |
| Host deploy, cron, nginx | [`deploy/HOST_DEPLOY_README.md`](deploy/HOST_DEPLOY_README.md)             |
| Env-шаблоны              | [`deploy/env/README.md`](deploy/env/README.md)                             |
| Backfill / cutover       | [`deploy/DATA_MIGRATION_CHECKLIST.md`](deploy/DATA_MIGRATION_CHECKLIST.md) |
| `psql` на production     | §6 + полный префикс `set -a && source /opt/env/...`                        |

---

## 24. Оркестрация субагентов

**Канон:** общий метод — [`docs/AGENT_AUTORUN_SCHEME.md`](docs/AGENT_AUTORUN_SCHEME.md), обязательные актуальные
привязки этого репозитория — [`docs/ORCHESTRATION_BINDINGS.md`](docs/ORCHESTRATION_BINDINGS.md); при конфликте
общих заметок этого раздела с bindings побеждает `ORCHESTRATION_BINDINGS.md`. Раздел «Универсальный режим
исполнения многоэтапного плана» там — полный канон многоэтапного плана; ниже — его короткая форма плюс
операционные правила запуска субагентов.

### Стоп — по повтору одной проблемы, а не по счёту кругов

Круги worker→аудит→коррекция не запрещены и не считаются провалом сами по себе, пока каждый круг закрывает
разное и чек-лист движется. Сигнал тревоги — топтание на одной и той же (или соседней) проблеме два круга
подряд: тогда сначала эскалация (сильнее модель у аудитора и у фиксера, больше контекста и свободы), а не стоп.
Стоп — только если и два таких усиленных прохода не решили ту же проблему: `status blocked` + вопрос владельцу,
не следующий круг.

Дополнительно к режиму этапа: независимые слайсы с непересекающимся file-scope гнать параллельно (≤3), не по
очереди; приёмка владельца — в середине плана, не только в финале («audit PASS» само по себе не значит
«готово» — готово = галочка чек-листа владельца + зелёный CI + живая проверка); развилки владельца — заранее
одним листом (рекомендация + safe-default по каждой), не гадать в середине этапа; ранее объявленные
завершёнными планы без построчной owner-checklist matrix сначала проходят reconciliation полного linked plan —
доказанное не повторяется, каждый фактический residual остаётся `[ ]` с exact task до downstream work.

**Смысл:** предохранитель на счёт кругов останавливает работу, даже когда каждый круг находит новую реальную
проблему; предохранитель на повтор одной и той же проблемы ловит именно застревание, не путая его с прогрессом.

### Дорогой аудит — только первый

Первый слепой аудит по новой поверхности (модуль, ветка решения, гейт) — сильная модель, единица — этап или
модуль целиком, не мелкий слайс. Список поломок фиксируется файлом-kill-set и прогоняется механически: круг 2+
— дешёвая модель, либо сам воркер в конце своей починки без новой сессии, по уже составленному списку. Новый
слепой аудит заказывается только на новую поверхность, не на «те же тесты после правки». Применение к тестам —
[§10b](#10b-канон-написания-тестов) «Слепой список поломок составляет аудитор».

**Смысл:** дорого стоит составление списка поломок — это суждение; прогон уже названного списка суждения не
требует и проверяем по логу, платить за него второй раз не за что.

### Роли и стоимость

- Дорогая модель (оркестратор) делает ТОЛЬКО: планирование, брифы, ревью, интеграцию. **Всю реализацию (включая «мелкий» код) отдавать Sonnet-субагентам.** Не писать рутинный код самому — это жжёт контекст чата и токены.
- Для планирования / перепроверки плана дорогая модель допустима. Уровень модели/мышления подбирать под задачу (мелкая правка → дешевле; рискованная архитектура → дороже).

### Параллелизм и ветка на workstream

- **Ориентир нагрузки: до 3 фоновых агентов одновременно** (тяжёлые build/dev — меньше). Лишнее — в очередь, не «веером».
- Независимые слайсы с непересекающимся file-scope гнать параллельно (в пределах лимита), а не по очереди.
  Сериализуется только конкуренция за общий ресурс (единый dev-сервер под живой скрин, heavy CI под mutex).
- **Каждый параллельный поток — в своей ветке `wt/<workstream>`, не в общем `feat`.** Клон — единица изоляции
  дерева, ветка — единица приёмки и отката; воркер коммитит только в неё. В `feat` не коммитит никто, кроме
  лида, и только слиянием `--no-ff` принятой ветки, после независимого аудита — не после отчёта исполнителя.
  В очереди аудита регистрируется ветка и sha. Пересечение файлов между живыми ветками лид называет в брифе
  каждого потока заранее.

**Смысл:** ветка — это возможность откатить или отклонить весь workstream целиком; общая ветка на несколько
потоков превращает отклонение одного из них в хирургию по несведённому диффу, а не в `git branch -D`.

### Бриф агента (self-contained)

- В брифе: пути, эталон, ограничения, шаги проверки, **exact atomic checkbox IDs/текст + supersession map**,
  **запрет commit в main / push**. Ссылка только на roadmap summary — неполный brief; холодный старт — агент ничего
  не доводит «по памяти». Worker и auditor читают весь linked authority, получают один checklist и сдают построчную
  матрицу `code/test/runtime evidence` либо точную deferred/blocker reason. Audit brief цитирует ID и полный текст
  linked scope. Aggregate `done/PASS` не закрывает stage/taskdb/LOG при открытой строке без owner defer.
- **Запрещать бесконечные циклы ожидания** (напр. «жди, пока поднимется порт N») — только с таймаутом/числом попыток. Иначе агент НЕ падает, а ВИСНЕТ навсегда (в панели — «Running» часами).
- По возможности **не давать агенту поднимать dev-сервер**: реализация = код + typecheck + тесты + commit (в своём worktree, без push). Живую проверку (скриншоты) делать отдельно — оркестратором или коротким verify-агентом. Меньше зависаний.

### Git в среде агентов (КРИТИЧНО)

- cwd ненадёжен → все git-команды с явным `git -C <main-checkout>`.
- Только явный `git add <пути>`. **Никогда `git add -A`** — однажды это втянуло в коммит файлы параллельного чата.
- Агенты иногда ветвятся от УСТАРЕВШЕЙ базы. Новый/перезапущенный агент: STEP 0 — `git merge <ветка-feat> --no-edit` + проверить маркер актуальности (`grep` известной строки), иначе остановиться и доложить.
- В общий feat не пушить без нужды; только **fast-forward, без `--force`**. Пуш feat может опубликовать неотправленные коммиты ПАРАЛЛЕЛЬНОГО чата — координировать.

### Живость агентов

- При запуске **оценивать длительность и ставить себе напоминалку** (ScheduleWakeup) на проверку живости. Не полагаться только на нотификацию о завершении — агенты тихо умирают/виснут.
- Проверка живости БЕЗ чтения транскрипта: `git worktree list` + коммиты на ветке агента; список задач (пусто = не отслеживается/мёртв); нотификация о завершении. ⚠️ Размер `.output`-файла НЕнадёжен (почти всегда ~179 байт) — не использовать как сигнал.
- Мёртв/завис → проверить его worktree `git status` на несохранённое (салвадж) → прибрать (`git worktree remove --force`; если locked — сперва `git worktree unlock`) → перезапустить с корректной базой.
- Codex-субагенты, зависшие в UI/лимите после `wait_agent completed/failed`, чистить через CLI: сначала `codex delete --help`, затем точечно `codex delete --force <subagent-session-uuid>`. Удалять только известные UUID текущей оркестрации; не трогать основную Codex-сессию и системные `app-server`/`proxy`/`codex-code-mode-host`. После удаления проверить процессы `ps -eo pid,ppid,stat,lstart,cmd | rg 'codex|multi_agent|subagent|<plan-key>|vitest|tsx'`. Упоминание UUID в родительском `.codex`-логе не считать живой сессией. Результат писать только в devlog/taskdb той задачи, к которой агенты реально относились.

### Интеграция и уборка

- Интегрировать вывод агентов **по одному**: посмотреть diff/скриншоты → typecheck/тесты → merge (ff или 3-way) в feat → удалить worktree агента.
- Убирать за собой dev-серверы и worktree: висящие серверы/worktree перегружают среду и могут заклинивать новых агентов.
- Перед запуском проверять, не делает ли ту же работу **параллельный чат** (чужие ветки/worktree вида `claude/*`) — чтобы не дублировать.
- Панель Background tasks может показывать «фантомы» (Running) после завершения процессов; их `TaskStop` не находит — чистить кнопкой Clear, а реальные процессы проверять через `ps` / порты.
