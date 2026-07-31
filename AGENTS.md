# Инструкции для AI-агентов — BersonCareBot

## Поиск по коду — сначала code-search, потом слепой grep

Есть готовый гибридный поиск по коду над индексом репозитория (BM25 + семантика, деградация до BM25). Для вопросов
«где в коде X / кто вызывает Y / где определён Z» СНАЧАЛА зови его, а не грепай вслепую по всему репо:

    node /home/dev/brain/tools/code-search.mjs "<запрос>" --repo bcb [-k N]

Печатает `path:строки` + сниппет. `grep`/`glob` — только для точных строк, которые уже знаешь. Касается и субагентов.

Этот файл — **единая точка входа** для агентов Cursor. Cursor автоматически подхватывает `AGENTS.md` в корне репозитория.

**Канонический источник правил:** `.cursor/rules/*.mdc` и `.cursor/rules/test-execution-policy.md`. При расхождении приоритет у файлов в `.cursor/rules/` (там есть `globs` и `alwaysApply` для scoped-правил). При изменении правил обновляйте **оба** места.

**Вопрос сам по себе не является командой.** Он не разрешает начинать, менять, переделывать, запускать или
останавливать работу, если в нём нет явной инструкции. Но правило применяется к частям сообщения, а не ко всему
сообщению целиком:

1. Если сообщение содержит и вопрос, и явную задачу — ответить на вопрос **и выполнить задачу**.
2. Вопрос по ходу уже порученной работы не ставит её на паузу и не отменяет. После ответа продолжать, если владелец
   явно не сказал остановиться, поставить на паузу, отменить или изменить scope.
3. Из вопроса нельзя домысливать новую работу; из отсутствия повторной команды «продолжай» нельзя домысливать
   остановку уже порученной работы.

**Не высасывай проблемы из пальца.** Делай только необходимый и достаточный объём — минимум, чтобы требуемое
поведение работало. Аудитор ищет только важные ошибки: обязательное поведение реально не работает; достижима
уязвимость/обход security boundary; возможны data loss/corruption/неверные деньги; реально ломается
build/runtime/integration. Каждый `MUST FIX` обязан назвать конкретный достижимый сценарий, impact и точное
нарушенное требование/правило. Style/preferences, теоретические edge cases без actual path, extra hardening,
alternative architecture и «можно сделать лучше» — не findings; без обязательных доказательств finding удалить.

**STOP-GATE: сначала существующие документы и scripts, потом действия.** Для ЛЮБОЙ существенной задачи агент НЕ имеет права изобретать последовательность, писать новый SQL/script, менять код или запускать команды, пока не:

1. прочитал `AGENTS.md`, `README.md`, `docs/README.md` и релевантные docs/rules/runbooks по теме;
2. нашёл существующие scripts/docs через code-search и точечное чтение;
3. явно зафиксировал, какие существующие источники являются каноном для текущего действия.

Для server/deploy/prod/test/env/DB/backup/migration/backfill/reconcile/cutover/clean dump это правило абсолютное и блокирующее.
Если найденный документ противоречит плану агента — документ побеждает, агент перестраивает план.

**Перед существенной работой** прочитайте также:

- `README.md`
- `docs/README.md`
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md`
- `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` — **dev-серверы, dev-bypass вход в кабинеты, живое UI-тестирование**
- `deploy/HOST_DEPLOY_README.md`
- `docs/AGENT_AUTORUN_SCHEME.md` — общий метод автопрохода; `docs/ORCHESTRATION_BINDINGS.md` — **обязательный практический канон BersonCare**, который побеждает generic/host материалы в repo-specific вопросах. Читать оба для любой оркестрованной/автономной работы.
- `docs/archive/2026-07-rubitime-retirement/README.md` — **архив выведенного 2026-07-27 Rubitime-контура**. Это исторические доказательства и one-shot материалы, не руководство по текущему runtime.

---

## Оглавление

1. [Онбординг и server conventions](#1-онбординг-и-server-conventions)
   1a. [Локальный dev и тестирование UI](#1a-локальный-dev-и-тестирование-ui)
   1b. [Безопасность dev-среды: изоляция от прод](#1b-безопасность-dev-среды-изоляция-от-прод-и-реальных-каналов)
2. [CRITICAL: конфигурация интеграций только в БД](#2-critical-конфигурация-интеграций-только-в-бд)
3. [Runtime config: env vs database](#3-runtime-config-env-vs-database)
4. [system_settings: одна таблица public, зеркала нет](#4-system_settings-одна-таблица-public-зеркала-нет)
   4a. [SaaS Foundation-aware development](#4a-saas-foundation-aware-development)
5. [Clean Architecture: изоляция модулей](#5-clean-architecture-изоляция-модулей)
6. [Host: PostgreSQL и DATABASE_URL](#6-host-postgresql-и-database_url)
7. [Git: коммит и пуш](#7-git-коммит-и-пуш)
8. [Команда «пуш»](#8-команда-пуш)
9. [Full CI gate](#9-full-ci-gate)
10. [Test execution and audit policy](#10-test-execution-and-audit-policy)
    10a. [Тест проверяет поведение, а не текст и не обстоятельства запуска](#10a-тест-проверяет-поведение-а-не-текст-и-не-обстоятельства-запуска)
    10b. [Канон написания тестов](#10b-канон-написания-тестов)
11. [Webapp-тесты: компактность](#11-webapp-тесты-компактность)
12. [Plan Authoring And Execution Standard](#12-plan-authoring-and-execution-standard)
13. [Формат ответа: ИТОГ](#13-формат-ответа-итог)
14. [Коммуникация без навязанных концовок](#14-коммуникация-без-навязанных-концовок)
    14a. [Языковая политика Codex](#14a-языковая-политика-codex)
15. [Patient UI Shared Primitives](#15-patient-ui-shared-primitives)
16. [Doctor UI Shared Primitives](#16-doctor-ui-shared-primitives)
17. [Patient / Doctor UI Isolation](#17-patient--doctor-ui-isolation)
18. [Пациент: «ЛФК» = программа реабилитации](#18-пациент-лфк--программа-реабилитации)
19. [Patient media playback (HLS / MP4)](#19-patient-media-playback-hls--mp4) — _scoped: patient routes_
20. [CMS: единый layout медиа-пикера](#20-cms-единый-layout-медиа-пикера) — _scoped: doctor CMS_
21. [UI: тексты без избыточных пояснений](#21-ui-тексты-без-избыточных-пояснений)
22. [UI: Select — displayLabel](#22-ui-select--displaylabel)
23. [Справочник вне .cursor/rules](#23-справочник-вне-cursorrules)
24. [Оркестрация субагентов](#24-оркестрация-субагентов)

---

## 1. Онбординг и server conventions

_Источник: `.cursor/rules/server-conventions-and-doc-onboarding.mdc` (alwaysApply)_

- **STOP-GATE: сначала существующие документы и scripts, потом действия.** Для ЛЮБОЙ существенной задачи агент НЕ имеет права изобретать последовательность, писать новый SQL/script, менять код или запускать команды, пока не:
  1. прочитал `AGENTS.md`, `README.md`, `docs/README.md` и релевантные docs/rules/runbooks по теме;
  2. нашёл существующие scripts/docs через code-search и точечное чтение;
  3. явно зафиксировал, какие существующие источники являются каноном для текущего действия.
     Для server/deploy/prod/test/env/DB/backup/migration/backfill/reconcile/cutover/clean dump это правило абсолютное и блокирующее.
     Если найденный документ противоречит плану агента — документ побеждает, агент перестраивает план.
- At the start of every new chat, first familiarize yourself with core project docs before giving substantial guidance:
  - `README.md`
  - `docs/README.md`
  - `docs/ARCHITECTURE/SERVER CONVENTIONS.md`
  - `deploy/HOST_DEPLOY_README.md`
- For any server, deploy, prod, systemd, nginx, env, path, port, DB, backup, migration, backfill, reconcile, or cutover question:
  - Treat `docs/ARCHITECTURE/SERVER CONVENTIONS.md` as the primary source of truth for confirmed runtime facts.
  - Use exact names and paths from that file. Never invent or guess paths, service names, env file names, DB names, ports, URLs, or users.
- **Host identity — blocking gate:** current `151.241.228.122` is DEV/RELAY/TEST only; PROD is only
  `135.106.162.170`. Local `/opt/projects/bersoncarebot`, `*.prod` and `bersoncarebot-*-prod.service` are stale,
  masked remnants, not runtime PROD. Before any PROD action prove target-host = `135.106.162.170` and obtain
  explicit owner permission.
- **PostgreSQL on host:** Never instruct bare `psql "$DATABASE_URL"`. Load the env for the explicitly named
  DEV/TEST/PROD target; PROD `*.prod` is allowed only on `135.x`. See раздел
  [Host: PostgreSQL](#6-host-postgresql-и-database_url). Commands must be copy-paste complete.
- If a required runtime fact is missing or not explicitly confirmed in docs:
  - Say clearly that the value is missing/unconfirmed.
  - Give exact commands to discover it on the host.
  - Then update the documentation with the newly confirmed non-secret fact so the next chat does not repeat the discovery.
- When adding discovered server facts to docs:
  - Store only non-secret operational facts in docs (paths, unit names, port numbers, DB names, env key names, URLs, users, ownership).
  - Never write secrets, passwords, tokens, or full credential-bearing connection strings into repo docs.

**Production-хост `135.106.162.170`:** sudoers нельзя считать безопасной границей; агент не выполняет там
`sudo` и вообще не касается PROD без отдельного явного owner-разрешения. Подробно:
`docs/ARCHITECTURE/SERVER CONVENTIONS.md` §«КРИТИЧНО: deploy».

### Задачи — только через taskdb-порт, не сырой SQL

**Канон гранулярности и единственное правило для `add`: [`docs/TASKDB_RULES.md`](docs/TASKDB_RULES.md).**
Он побеждает общие списки команд в [`.cursor/rules/unified-task-db.mdc`](.cursor/rules/unified-task-db.mdc)
и [`docs/SHARED_TASKDB.md`](docs/SHARED_TASKDB.md); те остаются каноном порта и статусов.

- Цельные workstream-карточки репозитория ведём в ОБЩЕЙ базе задач (проект `bcb`) **только** через утилиту-порт:

  ```
  node /home/dev/brain/tools/taskdb.mjs <cmd>
  ```

  Основные команды: `list bcb` · `find bcb "<подстрока>"` · `waiting` · `set <id> <field> <value>`.
  Сначала `find` и дополнение канонического плана; `add` допустим только для нового цельного owner-requested или
  owner-approved workstream по гейту `docs/TASKDB_RULES.md`.
  Карточка содержит только название, статус, ссылку на план и обязательное краткое понятное описание.
  Narrative `note`/`question`/`meta` не использовать для хода, решений, проверок или доказательств: всё это
  записывается в план. `owner_waiting`, `auto_ok`, seals, acceptance и `commit_ref` — служебное состояние порта.

- **НИКОГДА** не лезть в таблицу `plan_tasks` напрямую — ни `psql`, ни `INSERT/UPDATE/SELECT` из кода/ORM. Один порт = согласованные транзакции + единая точка контроля доступа. Не хватает операции — допиши утилиту (через ведущего/Нео), не обходи её.

- **`accepted` / `accepted_at`** — **только владелец**. Агент НЕ ставит `accepted`. «done» ≠ «accepted».

- Дисциплина статусов: начал → `status doing`; упёрся в решение владельца → записал точный вопрос и контекст
  в план, поставил `status blocked` + служебный `owner_waiting true`; довёл и проверил → `status done` +
  требуемые seals/`commit_ref`. Ход и ответ владельца фиксируй в плане/каноне, карточку ими не дополняй.
- Для workstream-карточки `done` означает закрытие **каждого** referenced atomic owner checkbox по матрице
  code/test/runtime evidence. Aggregate worker `done` или audit `PASS` недостаточны. Пока строка открыта или имеет
  обычный blocker, taskdb остаётся `doing/blocked`; закрыть строку без реализации можно только по явному owner
  defer/cancel с трассируемой ссылкой и причиной, синхронизированными с plan/roadmap/LOG.

---

## Операционные правила (добавлено через Claude, 2026-06): проверки · deploy · индекс · задачи

### Прогон тестов и сборок — напрямую разрешено

- **🔴 РЕШЕНИЕ ВЛАДЕЛЬЦА 29.07.2026: полный CI в моменте — ТОЛЬКО ОДИН.** `pnpm run ci` и любой полный прогон тестов запускать ИСКЛЮЧИТЕЛЬНО через общий замок: `/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"`. Остальные ждут в очереди автоматически (flock), писать протоколы вручную не нужно.
- **Почему:** `151.x` — общий DEV/TEST-хост; параллельные прогоны толкаются за CPU/RAM и общий замок сборки
  Next. Цена уже заплачена 29.07: три одновременных прогона получили
  `Another next build process is already running`, прогон CI потерян впустую. PROD на этом хосте нет.
- ⛔ **Решение владельца от 2026-07-09 «требование обязательного запуска через `run-tests.sh` временно снято» — SUPERSEDED 29.07.2026.** Не ссылаться на него: именно оно привело к тому, что агенты честно читали канон и шли мимо замка.
- Точечные проверки (`vitest` по одному файлу, `typecheck`, `lint`) по-прежнему можно запускать напрямую — они короткие и общий ресурс не держат.
- Уровень проверки выбирается по `.cursor/rules/test-execution-policy.md` и `.cursor/rules/pre-push-ci.mdc`: step/phase/full CI по масштабу риска, без лишних повторов. Команды и результаты проверок указывать честно.

### CI / lint / build / fix-warnings — делегировать Sonnet, не гнать в Opus

- **Opus** = оркестрация + принятие решений. **Sonnet** = механический run+fix цикл.
- Как только нужен зелёный CI / починить lint / build / предупреждения — **сразу** спаунить одного Sonnet-агента с промптом:
  1. прогони нужный gate напрямую, например `pnpm run ci` для full CI или более узкую команду по `test-execution-policy`;
  2. для НОВОГО кода → правь **тесты** (не регрессируй код под устаревшим тестом);
  3. предупреждения и ошибки — чини;
  4. сложное / неочевидное / нужно решение владельца → неси ведущему на выбор, не хачь.
- Ведущий (Opus) **не расследует логи, не правит файлы, не читает ошибки сам** — только бридж для сложных решений, которые Sonnet вынес.

### Deploy / push

- **`feat/doctor-ui-rebuild`** (dev): коммить и пушить свободно (авто-push ок).
- **`main` / `test`: НИКОГДА не пушить/мёрджить без прямой команды владельца.**
- **Два репо:** `origin` = `Dimmdao2/BersonCareBot` (dev/backup; прод-деплой выключен `if:false`). `dimmdao` = `dimmdao/BersonCareBot` — **производственный**.
- **Прод-деплой — ручной:** в `dimmdao` → Actions → workflow **«Deploy (production)»** (`workflow_dispatch`, ввод `confirm=deploy`) → аппрув окружения `production`. Гейты: зелёный CI на коммите + human-approval. Затем SSH под юзером `deploy` запускает `deploy/host/deploy-prod.sh` (хост: `git pull main` → проверка заранее установленных root-owned units → build → `pnpm migrate` → restart). Установка/замена units — отдельный root-only bootstrap, не право deploy. Хост `135.106.162.170`, путь `/opt/projects/bersoncarebot`, секреты `DEPLOY_SSH_KEY/USER/HOST/PATH` + read-only deploy-key для pull. Детали: `deploy/HOST_DEPLOY_README.md`.

### 🔴 Индекс/векторы по коду — ГОТОВ, используй ПЕРЕД сканом кода (экономит токены всем)

- По репо построен семантический индекс кода (pgvector, ~13k кусков, e5-1024; освежается инкрементально по `file_sha`). **ПРАВИЛО СТАРТА: прежде чем лезть в код `grep`/чтением файлов целиком — сперва спроси индекс** (дешевле по токенам и быстрее):
  - смысл / «где логика X, что отвечает за Y» → `bash /home/dev/brain/tools/codeq.sh "<запрос>" --repo bcb [--k N]` (семантический, вектор);
  - точное имя / строка / символ → `bash /home/dev/brain/tools/code-search.sh "<строка>" --repo bcb [-k N]` (лексический BM25).
  - Пара работает: смысл→`codeq`, имя→`code-search`; ОБА перед сканом репо.
- Переиндексировать до текущего HEAD (если правил много файлов и ищешь только что написанное): `bash /home/dev/brain/tools/code-index-pg.sh --repo /home/dev/dev-projects/BersonCareBot --repo-name bcb`.
- Ключи/ссылки индекса можно хранить в `meta` задач (ниже).

### Задачи — расширенные конвенции (доп. к разделу «taskdb-порт» выше)

- **Гранулярность:** только по [`docs/TASKDB_RULES.md`](docs/TASKDB_RULES.md): одна карточка = один цельный
  workstream; этапы, чекбоксы, полное ТЗ и детали живут в одном каноническом плане под `docs/_TODO/`.
- **`title`** = короткое имя цельного workstream. **`block`** = ссылка на план + обязательное краткое
  понятное описание сути/границы, не полное ТЗ. Ход, детали, решения, вопросы, проверки и доказательства —
  только в плане; `note`/`question`/`meta` для narrative не использовать. **`commit_ref`** = служебная ссылка на коммит.
- **Слои состояния:** `status` (todo/doing/blocked/done) → `seal_test`/`seal_audit` (агент проверил) → **`accepted`** (+`accepted_at`) = **ВЛАДЕЛЕЦ принял**. «done» ≠ «accepted».
- **Гейт автономного лупа:** воркер берёт существующую карточку только при
  `status∈(todo,doing) AND owner_waiting=false AND auto_ok=true`. `auto_ok` управляет запуском, а не разрешает
  `add`: мелкая работа и находки остаются пунктами плана.
- Планы/аудиты/логи остаются файлами. В карточке — одна ссылка на канонический план; остальные документы
  маршрутизируются из него, а не перечисляются в карточке.

### 🔴 Чек-листы и коммиты: три состояния галочки, отметка тем же коммитом, номер карточки в сообщении (владелец, 2026-07-29)

_Полный канон разметки: [`docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md`](docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md) **§6.4** — читать целиком перед первой правкой плана. Связь с коммитами: [`docs/ORCHESTRATION_BINDINGS.md`](docs/ORCHESTRATION_BINDINGS.md) §«Разметка чек-листов и связь с коммитами»._

- **Состояний три, не два и не шесть** (владелец 29.07, заменяет редакцию 27.07): `[ ]` открыто (включая
  отложенное владельцем) · `[x]` сделано + доказательство в строке · `[-] ~~текст~~ — ОТМЕНЕНО ВЛАДЕЛЬЦЕМ
  <дата>: «его слова»`. Плюс две формы, которые боксами НЕ являются: `ВЕДЁТСЯ В <файл>:<строка>` прозой
  (та же работа принадлежит другому плану) и регламент/процедура обычным текстом.
- **Метки `↪️ ВЫТЕСНЕНО`, `⏸ ОТЛОЖЕНО`, `🧊 ЗАМОРОЖЕНО` упразднены 29.07.** Причина измерена: `ВЫТЕСНЕНО`
  стояло и на «сделано», и на «ещё не сделано» — в одном файле одной датой, различие пряталось в свободном
  тексте. Отложенность теперь пишется один раз в ШАПКЕ плана, а не на каждом боксе.
- **Убить бокс может только владелец.** Исполнитель ставит `[x]` с доказательством либо превращает бокс в
  прозаический указатель. «Отпало», «никогда не строили» — остаётся `[ ]` и уходит вопросом владельцу.
- **Текст требования не переписывать НИКОГДА** — зачеркнуть и дописать причину. Составной пункт, где часть
  сделана, — расщепить на атомарные (число открытых может вырасти, это правильно).
- **Галочка ставится ТЕМ ЖЕ коммитом, что и код.** Доказательство обязательно в строке: хеш, `file:line` или
  прогон, который ты сам запустил. Сообщение коммита доказательством поведения НЕ является.
- **В сообщении коммита обязателен `#NNNN`** карточки, плюс: почему, чем доказано, какой пункт какого плана
  закрывает, и что НЕ сделано. Без номера связь «код ↔ план» восстанавливается только чтением кода.
- **Устное решение владельца записывать НЕМЕДЛЕННО** в тот документ, который он читает. «Нет в git» = «не
  записали», а не «не было»; грепом провенанс устного распоряжения не проверяется.
- **Записать решение ≠ завести задачу.** Владелец 28.07: «я просил? убирай свой самовол». Решение вписывается
  ТУДА, ГДЕ ОПИСАНА ПРОБЛЕМА — в существующий план или канон. Полный гейт новой карточки —
  [`docs/TASKDB_RULES.md`](docs/TASKDB_RULES.md). Назначать исполнителем владельца, ставить сроки и помечать «агентам не брать» — не твоё
  решение, даже когда он сказал «я это сделаю».

### Миграции: индекс на горячую колонку — в том же PR (владелец, 2026-07-20)

_Источник: `.cursor/rules/db-migrations-hot-column-indexes.mdc` (globs на миграции/схему)_

- Индекс — **не «потом»**, а часть КАЖДОГО PR, добавляющего таблицу/колонку под фильтр-сортировку. Горячие
  классы: `org_id`/`clinic_id`/tenant (RLS), `user_id`+`created_at` (списки/ленты), таймстемпы event/delivery-
  таблиц (аналитика), уникальные ключи дедупа.
- Большая таблица → только `CREATE INDEX CONCURRENTLY`. Ревью/аудит: таблица/горячая колонка без индекса = замечание.
- Канон рантайм-ёмкости и топологии старта: [`docs/ARCHITECTURE/SCALING_AND_LAUNCH_CAPACITY.md`](docs/ARCHITECTURE/SCALING_AND_LAUNCH_CAPACITY.md).

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

_Источник: `.cursor/rules/dev-prod-isolation-no-real-creds.mdc` (alwaysApply)_

Среды разнесены: текущий `151.241.228.122` — DEV/RELAY/TEST; PROD — только `135.106.162.170`.
DEV идёт из репо (`pnpm dev` → webapp `:5200` + integrator `:4200`, env `/.env` +
`apps/webapp/.env.dev`, БД `bcb_webapp_dev`). TEST — `/opt/projects/bersoncarebot-test`, env `*.test`,
юниты `bersoncarebot-*-test.service`, БД `bersoncarebot_test`. Старые local `/opt/projects/bersoncarebot`,
`*.prod` и `bersoncarebot-*-prod.service` на `151.x` — запрещённые замаскированные остатки.
Канонические пути — только из `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.

1. **Реальные PROD-креды — только на `135.x`.** DEV/TEST на `151.x` не содержат реальных prod-секретов
   внешних каналов; `*.test` содержат только TEST-креды и обязательные send-safety ограничения.
   В dev: `NODE_ENV=development`, send-креды пустые, `MAX_ENABLED=false` / `SMSC_ENABLED=false`.
   Нашёл PROD-креды на `151.x` — инцидент: сообщить владельцу, не использовать и не печатать.
2. **Dev не шлёт реально.** В `development` доставка = no-op/мок. Не делать действий, способных отправить реальное сообщение/SMS в Telegram / SMSC / MAX или записать в реальный S3 из dev (тестовые записи, рассылки, ретраи). `INTEGRATOR_API_URL` в dev — только локальный `127.0.0.1:4200`.
3. **Dev-БД = изменяемая песочница.** `bcb_webapp_dev` разрешено сидировать и менять для разработки/UX. Текущие миграции применяются недеструктивно через `bash deploy/host/migrate-dev.sh --preflight`, затем `bash deploy/host/migrate-dev.sh --execute`. TEST→DEV destructive refresh удалён решением владельца 2026-07-30: обычной разработке не нужно копировать TEST или пересоздавать DEV. Не коммитить dumps/cookie jars/runtime exports; запрет реальной доставки из dev сохраняется.
4. **Прод не трогать из dev.** Не подключаться к `135.x`, PROD-БД, PROD-сервисам/вебхукам и не использовать
   локальные остатки `*.prod`. PROD-операция требует отдельного явного owner-запроса с указанием PROD и проверки
   target-host = `135.106.162.170` по SERVER CONVENTIONS (+ раздел
   [Host: PostgreSQL](#6-host-postgresql-и-database_url)).
5. **Секреты не печатать.** Значения `.env`/секретов — маскировать; не вставлять креды в чат / логи / коммиты / доки.
6. **Не удалять `.next`/кэш работающих серверов вслепую** — сперва `pgrep -af next`.

---

## 2. CRITICAL: конфигурация интеграций только в БД

_Источник: `.cursor/rules/000-critical-integration-config-in-db.mdc` (alwaysApply)_

## Absolute rule for all agents

- **Do not add or use new env vars for integration configuration.**
- **Do not store integration API keys/tokens in env.**
- **Do not store integration webhook URLs/URIs in env.**
- **Use `system_settings` (scope `admin`) as the source of truth.**

## Mandatory storage target

- Store integration config in webapp DB table `system_settings` with `scope='admin'`.
- Keys must be included in `apps/webapp/src/modules/system-settings/types.ts` (`ALLOWED_KEYS`).
- Values must be editable via admin settings flow (`/api/admin/settings` + Settings UI).
- `system_settings` is org-aware: global defaults are rows with `organization_id IS NULL`; org-specific
  overrides use the same `key` and `scope` with a non-null `organization_id`. The current admin
  Settings UI remains global unless a setting flow explicitly passes organization context.

## Integrator/webapp implementation rule

- Integrator and webapp must read integration keys/URIs from DB-backed config accessors.
- Env can remain only for process bootstrap/infra (`DATABASE_URL`, `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`) and temporary backward-compat fallback during migration.
- Any new integration feature that proposes env vars for keys/URIs is considered invalid and must be redesigned to DB config.
- Настройки живут в ОДНОЙ таблице `public.system_settings`; интегратор читает её напрямую. Зеркала `integrator.system_settings` больше нет (удалено 29.07.2026, задача #1076) — см. раздел [system_settings](#4-system_settings-одна-таблица-public-зеркала-нет), `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`.

---

## 3. Runtime config: env vs database

_Источник: `.cursor/rules/runtime-config-env-vs-db.mdc` (alwaysApply)_

When adding or moving configuration:

### Use environment variables only for

- Infrastructure connection strings (e.g. `DATABASE_URL`).
- Process-level deploy defaults that must not be tenant-specific: `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`.

### Use webapp `system_settings` (scope `admin`) for

- Integration API keys/tokens and integration webhook URLs/URIs.
- Operational values editable without redeploy: public URLs, feature flags, **IANA timezones for business-facing text**, whitelists, etc.
- Keys must be added to `ALLOWED_KEYS` in `apps/webapp/src/modules/system-settings/types.ts` and exposed in admin Settings UI when user-facing.
- Current Settings UI writes global defaults (`organization_id IS NULL`) unless a flow explicitly passes
  organization context. Org-specific overrides use the same key/scope plus non-null `organization_id`
  and must preserve global NULL fallback.

### Integrator

- Интегратор читает настройки **напрямую** из `public.system_settings` (`apps/integrator/src/infra/db/publicSystemSettings.ts`). Зеркала и проталкивания из webapp больше нет — удалено 29.07.2026 (задача #1076). Прод и тест — **одна** PostgreSQL со схемами `integrator` и `public`.
- Do not add new env vars for values that belong in `system_settings`.
- При добавлении и изменении ключей — раздел [system_settings](#4-system_settings-одна-таблица-public-зеркала-нет): хранилище одно, второго заводить нельзя.

See `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`.

---

## 4. system_settings: одна таблица public, зеркала нет

_Источник: `.cursor/rules/system-settings-single-source.mdc` (alwaysApply)_

**Отменяет прежний раздел про зеркало (29.07.2026, решение владельца).** Прод и тест — одна PostgreSQL со схемами `public` и `integrator`. Настройки живут ТОЛЬКО в `public.system_settings`; интегратор читает их напрямую (`apps/integrator/src/infra/db/publicSystemSettings.ts`). Таблица `integrator.system_settings` удалена миграцией `20260729_0001_drop_integrator_system_settings_mirror.sql`, синхронизации между схемами больше нет.

Обязательные правила:

1. **Не заводить второе хранилище настроек** — ни таблицу, ни файл, ни кэш «на всякий случай». Читатель обращается к `public.system_settings` там, где значение нужно.
2. **Запись из webapp — только через** `createSystemSettingsService().updateSetting` (или тот же путь API настроек): единая точка валидации ключа, нормализации значения и прав.
3. **Новые ключи** — сначала в `ALLOWED_KEYS` (`apps/webapp/src/modules/system-settings/types.ts`), один и тот же `key` и `scope` для всех потребителей.
4. `organization_id IS NULL` — глобальное значение; строка с непустым `organization_id` — переопределение клиники, чтение обязано откатываться на глобальную строку.
5. **Миграции и сиды** пишут настройку в `public.system_settings` и всё — дублировать больше некуда.

Почему убрали (чтобы не отстроили заново): зеркало **писалось на каждое изменение и не читалось ниоткуда** — на dev перед сносом 71 вставка, 0 обновлений, 0 чтений по индексу. Ради него жили SECURITY DEFINER функция `app.enqueue_platform_system_settings_sync` с белым списком из 21 ключа, её генератор SQL, два проверяющих скрипта и вид задания `system_settings_sync` в очереди; список ключей был переписан руками в трёх местах и сверялся регуляркой по тексту — из-за чего полный CI 29.07 упал от одной смены кавычек. Разбор: задача `#1076`.

## 4a. SaaS Foundation-aware development

_Источник: `.cursor/rules/saas-foundation-aware-development.mdc` (alwaysApply) + `docs/RULES/SAAS_FOUNDATION_AWARE_DEVELOPMENT.md`_

Перед добавлением или изменением таблиц, колонок, миграций, репозиториев, API, write-paths или фоновых задач учитывай текущее направление `SAAS_FOUNDATION`: shared-DB SaaS, tenant = `Organization`, будущая изоляция данных.

- Новые clinical / patient-facing / doctor-facing / booking / messaging / notification / media / catalog / product / payment / entitlement / integration / settings / staff/admin данные не должны быть глобальными по умолчанию.
- До реализации выбери ownership path: прямой `organization_id`, scoped parent, `specialist_id`, patient/enrollment, appointment, program instance или настоящий global catalog.
- Если ownership неочевиден — не добавляй unscoped таблицу/поле. Пометь подпункт как `needs_decision` и оставь design note для dev-lead/владельца.
- Не добавляй ad hoc RLS/policy enforcement до канонических этапов `DB_ACCESS_CHOKEPOINT` + `SAAS_FOUNDATION`; допустимы dormant/backward-compatible поля, индексы, backfill/compat планы и сервисные проверки.
- Не переноси tenant/org integration settings в env; они остаются DB-backed через `system_settings` и mirror-правила.
- Не усиливай single-clinic/single-doctor assumption. Если текущая модель уже использует `organizationId` / `specialistId` / scoped parent, новый код обязан продолжать этот путь.

---

## 5. Clean Architecture: изоляция модулей

_Источник: `.cursor/rules/clean-architecture-module-isolation.mdc` (alwaysApply)_

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

_Источник: `.cursor/rules/host-psql-database-url.mdc` (alwaysApply)_

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

_Источник: `.cursor/rules/git-commit-push-full-worktree.mdc` (alwaysApply)_

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

---

## 8. Команда «пуш»

_Источник: `.cursor/rules/push-means-ci-commit-push.mdc` (alwaysApply)_

Если пользователь пишет `пуш` (или эквиваленты: "push", "запушь"), агент должен трактовать это как полный поток:

1. Запустить validation по масштабу изменения:
   - обычный docs-only / micro-stage / одно-приложенческий backup-push: step/phase gate из раздела [Test execution policy](#10-test-execution-and-audit-policy);
   - deploy / merge / integration checkpoint / repo-level risk: full CI gate из раздела [Full CI gate](#9-full-ci-gate).
2. Если есть изменения — сделать commit по **всему** рабочему дереву (`git add -A`), если пользователь **явно** не указал иной scope файлов (см. раздел [Git: коммит](#7-git-коммит-и-пуш)). **На шаге commit не менять содержимое файлов** — только застейджить и закоммитить текущее состояние.
3. Выполнить `git push` в текущую ветку/remote.

Не отвечать уточнением "сначала нужно закоммитить?" в этом сценарии — commit является частью команды `пуш`.

Примечание: сам факт `push` в feature-ветку не повышает validation до full CI. Full CI нужен перед deploy, merge/integration checkpoints, repo-level изменениями или по явной просьбе пользователя.

---

## 9. Full CI gate

_Источник: `.cursor/rules/pre-push-ci.mdc` (alwaysApply)_

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

---

## 10. Test execution and audit policy

_Источник: `.cursor/rules/test-execution-policy.md` (alwaysApply)_

Связь с push/deploy/merge: обычный push в feature-ветку использует validation по масштабу изменения; full CI gate описан в разделе [Full CI gate](#9-full-ci-gate) и нужен перед deploy, merge/integration checkpoints и repo-level изменениями. Этот раздел задаёт поведение **между** коммитами и при аудите.

### Приоритет правил (policy vs pre-push)

**По умолчанию все проверки между коммитами и при аудите** определяются **этим** разделом (уровни step / phase / full CI только когда здесь разрешено).

**Исключение:** раздел [Full CI gate](#9-full-ci-gate) включается **только** для deploy, merge/integration checkpoints, repo-level изменений или явной просьбы пользователя прогнать полный CI. Нельзя подменять повседневную работу «более безопасным» полным `ci`, если нет repo-level риска.

### Принцип

Полный прогон всего репозитория (`pnpm run ci`) **не** является нормой после каждого маленького изменения. Нужны три уровня: **step** → **phase** → **full CI**, плюс **аудит без лишних прогонов**.

Приоритет сигнала: скорость и полезный результат, а не избыточные повторы.

### Падающий тест после правок — чинить ТЕСТ под код, не наоборот

Канон: [`.cursor/rules/ci-fix-test-not-rollback-code.mdc`](.cursor/rules/ci-fix-test-not-rollback-code.mdc) (`alwaysApply`). Кратко:

- Упал тест после изменения кода → разберись, **каково намеренное поведение**. Если новое поведение верное (мы его и хотели) → **обнови тест** под новый код. **НЕ откатывай рабочие правки**, лишь бы зелёный устаревший тест.
- Откат кода к старому поведению допустим **только** если установлено, что изменение было ошибочным (регрессия), а не «потому что так проще пройти старый тест».
- Не уверен, тест или код верен → **СТОП, спроси ведущего/владельца**. Никогда не «подгоняй код под тест» молча.
- **Full CI запускать под контролем старшего агента (lead)**, который понимает назначение каждого теста; слабому субагенту Full CI — только с явной этой инструкцией.

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

Число audit-проходов задаёт risk-sized режим `docs/ORCHESTRATION_BINDINGS.md`: presentation/layout/text/mechanical
stage получает worker + **один** independent audit без serial nit-picking rounds. Этот раздел не разрешает добавлять
повторные аудиты ради заполнения evidence: `FAIL/BLOCKED` останавливает такой stage без automatic
fixer/correction/re-audit и обрабатывается по stop/scope правилам bindings. Multi-round correction разрешён только
high-risk stage; изменивший код auditor/correction owner не принимает собственный fix — нужен независимый re-audit.

### Dev-DB opt-in smoke-тесты

Ряд Vitest-тестов в `apps/webapp` скрыт за флагами `RUN_<DOMAIN>_DEV_DB=1` (плюс `USE_REAL_DATABASE=1` и `DATABASE_URL`). По умолчанию они **пропускаются** (`describe.skipIf`) и **не входят в CI**. Текущий legacy-набор сохраняет локальный **read-only** контракт. Новые DEV-DB тесты, расширение набора и mutating smoke заморожены до отдельного аудита ролей/стен, стабилизации схемы БД и явного owner-go. Полное соглашение: `.cursor/rules/test-execution-policy.md` §«Dev-DB opt-in smoke-тесты».

---

## 10a. Тест проверяет поведение, а не текст и не обстоятельства запуска

_Источник: `.cursor/rules/tests-check-behaviour-not-circumstances.mdc` (alwaysApply) — там разбор с примерами кода._

Правило из ревизии набора 29.07.2026 (`docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`). Замер: прогон форматтера — преобразование с заведомо нулевым изменением поведения — при зелёной базе (1792 файла / 10 815 тестов) уронил 53 теста, и **52 из них проверяли текст исходника**, а не работу кода.

**Критерий годности.** Назови одной строкой конкретную поломку, которую тест поймает: «подали такое — получили неправильное такое». Не смог назвать — теста быть не должно. Спор решает арбитр, а не мнение: внеси поломку в код руками и посмотри, покраснел ли тест.

**Так НЕ надо** (каждый пункт — реальный случай из этого репозитория):

- читать исходник и сверять его текст (`expect(src).toContain('fn("literal")')`) — ловит кавычки;
- сравнивать позиции символов в файле — утверждает порядок строк, а не поведение;
- считать вхождения подстроки в исходнике — тот же пиннинг текста, только маскируется под проверку значения;
- вмораживать `файл:строка` в ожидаемое значение — путь можно, номер строки нельзя: он едет от любой правки. Номер вычисляй в момент падения и печатай в тексте ошибки;
- сверять текст `.sql` деплоя или миграции — **удаляем сразу** (решение владельца 29.07): деплой проверяет то же против живой базы и строже, а текстовый тест зеленеет, когда SQL написан, но не применён;
- привязываться к обстоятельствам запуска: путь от текущего каталога, `new Date()` без подмены таймеров, часовой пояс, локаль, случайность, абсолютный путь бокса, живой хост;
- проверять только факт вызова собственной заглушки;
- подгонять тест под сломанный код — поэтому фильтр годности применяет **не автор теста**.

**Так надо.** Поведение (вход → выход), безопасность (неверный пароль → отказ, повтор → задержка, чужая клиника → пусто). Доступ к данным проверяется на одноразовой PostgreSQL только после аудита ролей/стен, стабилизации БД и owner-go; до этого fake/DEV-smoke не является DB/RLS-доказательством. Если структуру кода правда надо охранять — разбирай **дерево разбора TypeScript**, а не текст регуляркой (`typescript` уже в зависимостях). У любого механического гейта обязан быть самотест «сломай специально — убедись, что заметил»; действующий пример — негативный самотест gitleaks в `.github/workflows/security.yml`.

## 10b. Канон написания тестов

_Источник: `.cursor/rules/test-execution-policy.md` §«Канон написания тестов: необходимый и достаточный объём»._
_Решения владельца 30.07.2026; независимый разбор —_
_`docs/_TODO/TESTSUITE_DECISION_POLICY_OPUS5_AUDIT_2026-07-30.md`._

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

### 🔴 Слепой список поломок составляет АУДИТОР, а не автор теста (владелец, 31.07.2026)

Владелец 31.07: «надо передать эту роль аудитору а не кодеру… И в гейт порта агентов — то есть автоматически
передавать воркеру что он не пишет тесты [не сертифицирует их], а аудитору — что без тестов не принимается аудит».

**Замер, из-за которого правило появилось:** на уровне 2 интегратора аудитор внёс 20 собственных поломок —
**13 прошли незамеченными**, среди них вечный ретрай падающей строки и запись статуса вместо причины в журнал.
Тесты были написаны по канону, с «арбитром» у каждого. Причина структурная: арбитра выбирает автор теста ПОСЛЕ
написания теста, поэтому арбитр подтверждает ровно то, что автор и так покрыл.

1. **Воркер пишет тесты и не подтверждает их годность** — его арбитры это пояснение, не доказательство.
2. **Аудитор составляет список поломок ПО ПЛАНУ и решениям владельца, НЕ ЧИТАЯ тестов**, вносит их в код и
   прогоняет лично. Слепота списка и есть механизм; смена автора теста её не заменяет — она переносит слепоту
   на аудитора, и мерить его работу становится некому.
3. **Роль запуска — `auditor-live`:** обычный `auditor` уходит в песочницу read-only и физически не может внести
   поломку (так первый аудит уровня 2 выдал предсказания вместо прогонов).
4. **Критерий приёмки — «убиты ВСЕ названные планом поломки», процентного порога нет** (Google на каждом диффе
   гейтит бинарно, не процентом: процент набивается дешёвыми мутантами).
5. **Тест, не покрасневший ни на одной чужой поломке, считается отсутствующим** независимо от цвета прогона.
6. **Дорогой — только ПЕРВЫЙ аудит (владелец, 01.08):** «первый слепой аудит — да. Повторно — только механика
   по уже готовым тестам/поломкам, и там агент попроще, может и сам воркер делать, там нет смысла новые сессии
   запускать». Круг 1 — слепой аудит сильной моделью (исследование, один раз). Круг 2+ — прогон **уже
   составленного** списка по починенному коду: дешёвая модель или сам воркер в конце своей починки, без новой
   сессии. Это не самосертификация: список составлен слепо и зафиксирован ДО починки, воркер лишь исполняет его.
   Новый слепой аудит — только на НОВУЮ поверхность (новый модуль, ветка решения, гейт), не на «те же тесты
   после правки».

_Полный контекст и порядок работ: `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` §«ПОРЯДОК РАБОТ v2», блок М._

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

_Источник: `.cursor/rules/webapp-tests-lean-no-bloat.mdc` (alwaysApply)_

Цель — не раздувать время прогона, граф модулей и число файлов без явной продуктовой необходимости.

### Импорты App Router `page.tsx`

- **`e2e/*inprocess*.test.ts`:** не добавлять новые холодные `import("@/app/.../page")` «рядом с кейсом». Расширять только общий smoke — `apps/webapp/e2e/smoke-app-router-rsc-pages-inprocess.test.ts`, либо обходиться контрактными тестами (route, deps, тонкие модули).
- **`e2e/*.test.ts` в проекте `fast`:** если нужен реальный `page`, один раз в **`beforeAll`** с `import()`, не в каждом `it` (см. `doctor-clients-scope-redirects.test.ts`).

### RTL и `React.lazy`

- Чанки под ленивые вкладки/импорты — прогрев в **`beforeAll`** (`Promise.all` + `import(...)`), иначе растут флаки и соблазн поднимать таймауты.

### Файлы и дубли

- Предпочитать **расширение существующего** тест-файла той же зоны ответственности вместо нового файла с одним-двумя `it`, если нет причины изолировать (разный setup, другой глобальный мок).
- **Не** копировать одни и те же тяжёлые импорты/моки в несколько файлов без необходимости.

### Таймауты

- В `apps/webapp/vitest.config.ts` проекты **`fast`** и **`inprocess`** используют одинаковые по умолчанию **`testTimeout` (20s)** и **`hookTimeout` (25s)** — медленные `it` без прогрева должны падать. Холодный импорт большого графа — только в **`beforeAll(..., timeout)`** с явным лимитом (см. smoke и `doctor-clients-scope-redirects`), **не** поднимать глобально отдельный «мягкий» потолок вроде 30s для `it`.
- **Не** поднимать глобальные `testTimeout` / `hookTimeout` в `vitest.config.ts` «чтобы стало зелёно». Сначала уменьшить холодный граф (прогрев, меньше импортов страниц), затем при необходимости — **точечный** `timeout` на конкретный `it`/`beforeAll`.

### Куда смотреть

- Канон по e2e и скриптам: `apps/webapp/e2e/README.md`, шаблон замеров: `apps/webapp/e2e/CI_BASELINE.md`.
- Уровни прогона (step / phase / CI): раздел [Test execution policy](#10-test-execution-and-audit-policy).

---

## 12. Plan Authoring And Execution Standard

_Источник: `.cursor/rules/plan-authoring-execution-standard.mdc` (alwaysApply)_

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
     `SUPERSEDED — <date>, replaced by <section/id>`. `N/A` требует причины, defer/cancel — явного owner ruling со
     ссылкой. Missing/unclassified checkbox запрещает `done/PASS`.
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

---

## 13. Формат ответа: ИТОГ

_Источник: `.cursor/rules/answer-itog-without-code-unless-asked.mdc` (alwaysApply)_

- Если пользователь **не просил** разбор кода, файлов, цитат, диффов и пошаговую трассировку реализации — отвечать **кратко**, с блоком **ИТОГ** (или эквивалентной одной сжатой формулировкой вывода).
- **Не** включать в такой ответ: большие фрагменты кода, длинные списки путей/идентификаторов, подробные цепочки вызовов — **до тех пор**, пока пользователь явно не попросил «где в коде», «покажи код», «детали», «trace» и т.п.
- Если для точности нужны 1–2 коротких упоминания (имя сервиса, таблица, эндпойнт) — допустимо одной строкой без развёрнутых блоков.
- Когда пользователь **явно просит** код или локализацию в репозитории — применять обычные правила проекта (ссылки на код, точность, инструменты).

---

## 14. Коммуникация без навязанных концовок

_Источник: `.cursor/rules/no-unsolicited-followups.mdc` (alwaysApply)_

**Инструкция для агентов:** отвечать строго по запросу пользователя, без обязательных «хвостов» в конце.

Запрещено:

- добавлять в конце сообщений фразы вида «Если хочешь, могу…», «Могу ещё…», «Дальше могу…», когда пользователь этого не просил;
- навязывать follow-up шаги и дополнительные задачи;
- завершать ответ engagement-фразами «скажи — и сделаю».

Разрешено:

- предлагать следующий шаг **только** если пользователь явно попросил варианты/рекомендации;
- задавать только необходимые уточняющие вопросы по текущей задаче.

Приоритет: краткий, прямой, уважительный ответ без лишних предложений.

---

## 14a. Языковая политика Codex

_Источник: `.cursor/rules/codex-language-policy.mdc` (alwaysApply)_

- Отвечать владельцу по-русски, если он явно не попросил другой язык.
- Internal reasoning summaries, execution plans, inter-agent prompts/reports, and working notes should be in English to reduce token overhead.
- Preserve the language of existing project documents and quoted source text; do not translate Russian-facing docs or UI copy just to follow the internal-work rule.

---

## 15. Patient UI Shared Primitives

_Источник: `.cursor/rules/patient-ui-shared-primitives.mdc` (alwaysApply)_

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

---

## 16. Doctor UI Shared Primitives

_Источник: `.cursor/rules/doctor-ui-shared-primitives.mdc` (alwaysApply)_

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

- **SUPERSEDED 2026-07-22:** прежнее правило о белом/inherited workspace background. Latest owner authority
  `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2 + Design DNA v1.0 устанавливают exact doctor
  canvas `#F6F4EF`; page header и основные поверхности остаются белыми. Глубина — тонкие
  границы/лёгкие поверхности, не тени (§A). `shadow-*` — только floating, **не** на page-level секциях/KPI.
- Semantic primary кабинета врача — ровно `#406ca7` через зональный `--primary`; кнопки, ссылки, active/focus и другие primary-consumers используют semantic-классы, а не локальный hex. Patient/public tokens и destructive/warning/info роли не перекрашивать.
- Chrome-типографика — закрытый набор §B.1: page-title `text-base`, section `text-sm`, обычный body `text-sm`, **первичная строка списка** `text-base font-normal`, meta `text-xs`, KPI `doctorMetricValueClass` (`text-2xl`). Micro-роль `text-[10px]`/`text-[11px]` — только бейджи/календарь/оси графиков/mono. Запрещено: `text-[13px]`, `text-lg`, `text-xl`, `text-3xl`.
- Контролы doctor-zone: input/select-триггер/база кнопки — `h-8`/`h-[32px]` + радиус `24px`; фактическая поверхность input белая; поле и кнопка/select в одной строке совпадают.
- Радиусы owner G6 (§A.3): page-block `12px`, KPI `8px`, doctor button/input/select trigger `24px`; `rounded-2xl` запрещён. Явный радиус caller (`rounded-none`, icon override и т.п.) сохраняется.
- Navigation exception: main sidebar/mobile menu items не являются button pills и сохраняют минимальный shared
  menu radius; 24px control radius на menu rows не распространяется. Section tabs имеют отдельный rounded contract.
- Основные flat-list строки переиспользуют геометрию списка «На сопровождении» на странице «Сегодня», без локальных
  числовых копий отступов; между пунктами divider ровно `1px #f0efeb`, hover покрывает всю полосу строки; первичная
  строка крупнее и легче (`text-base font-normal`).
- active/hover/focus — словарь §A.4 (active = `bg-primary/15 text-primary`/`ring`, не жирная заливка и не хардкод-hex).
- KPI-метрика — `doctorMetricValueClass` из `doctorVisual.ts`, не локальный `text-3xl`.

### Быстрая самопроверка перед сдачей

```bash
rg "rounded-2xl|<h2>[^<]" apps/webapp/src/app/app/doctor --glob "*.tsx"
rg "text-\[13px\]|text-lg|text-xl|text-3xl" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor --glob "*.tsx"
rg "doctorSectionCardClass|DoctorSection|doctorClientCardChrome" apps/webapp/src/app/app/doctor/<зона>
```

---

## 17. Patient / Doctor UI Isolation

_Источник: `.cursor/rules/patient-doctor-ui-isolation.mdc`_

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

---

## 18. Пациент: «ЛФК» = программа реабилитации

_Источник: `.cursor/rules/patient-lfk-means-rehab-program.mdc` (alwaysApply)_

**Решение зафиксировано: с 2026-05-09.**

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

---

## 19. Patient media playback (HLS / MP4)

_Источник: `.cursor/rules/patient-media-playback-video.mdc` (scoped: `apps/webapp/src/app/app/patient/**`, media components)_

- Для **файлового** видео в `apps/webapp/src/app/app/patient/**` и в **Markdown-теле** страниц контента (`MarkdownEmbeddedLink`, `@/shared/ui/markdown/MarkdownEmbeddedLink.tsx`) используй **`PatientMediaPlaybackVideo`** (`@/shared/ui/media/PatientMediaPlaybackVideo`). Не добавляй «голый» `<video>` с прямым URL или отдельный progressive-only плеер вне этого компонента.
- **Миниатюры** в списках пациента — по-прежнему только картинка (`PatientCatalogMediaStaticThumb`); воспроизведение — только в полноценном плеере.
- **Быстрый превью видео** в `MediaPickerQuickPreviewDialog` использует тот же `PatientMediaPlaybackVideo` (единый стек с кабинетом пациента).
- Режим доставки задаёт только **`GET /api/media/[id]/playback`** и внутренняя логика fallback при сбое HLS; **нет** UI для выбора **формата** (HLS vs MP4). При **двух и более** строках в **`hls.qualities`** и воспроизведении через **`hls.js`** допускается выбор **разрешения** и индикация текущего варианта; при нативном HLS — только «авто»; при отсутствии поддержки **`hls.js`** при выдаче HLS включается progressive MP4 и селектор качества скрывается — см. `docs/ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md`.
- Если на сервере JSON не резолвили — передай `initialPlayback={null}`; компонент сам запросит `/playback` на клиенте (сессия обязательна для успешного ответа).
- Для извлечения `mediaId` из пути каталога и тела Markdown: **`parseApiMediaIdFromPlayableUrl`**, при необходимости **`parseApiMediaIdFromMarkdownHref`** (`@/shared/lib/parseApiMediaIdFromPlayableUrl`).

Документация: `docs/ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md`.

---

## 20. CMS: единый layout медиа-пикера

_Источник: `.cursor/rules/cms-unified-media-picker-layout.mdc` (scoped: doctor CMS media pickers)_

При добавлении или изменении **модалок выбора файла из медиабиблиотеки** в doctor CMS:

- Используйте **`MediaPickerShell`** + **`MediaPickerPanel`** из [`apps/webapp/src/shared/ui/media/MediaPickerShell.tsx`](apps/webapp/src/shared/ui/media/MediaPickerShell.tsx) и [`apps/webapp/src/shared/ui/media/MediaPickerPanel.tsx`](apps/webapp/src/shared/ui/media/MediaPickerPanel.tsx).
- Не дублируйте отдельные обёртки `Dialog`/`Sheet` с другой шириной и своим блоком «поиск + список», если сценарий — тот же паттерн (библиотека + опционально загрузка с устройства).
- Поведенческие отличия (фильтр по `kind`, папки и «только новые» для упражнений, показ сортировки) задаются **пропсами** `MediaPickerPanel`, а не копипастой разметки.
- Вкладка загрузки с устройства: после `POST /api/media/upload` результат сверяется с `kind` (`isPickedRowAllowedForKind`); при несовпадении показывайте пользователю понятный текст (как в текущей реализации), не вызывайте `onPick`. Ошибки API мапятся на русский текст (`mapUploadErrorByCode`).
- Для Markdown не дублируйте логику «картинка vs ссылка»: используйте [`markdownSnippetForMediaUrl`](apps/webapp/src/shared/ui/markdown/markdownMediaSnippet.ts) и передавайте в колбэк `kind`/`mimeType` из выбранной строки библиотеки.

Исключения (свой layout без этих компонентов) допустимы только при **явной продуктовой причине**; в PR кратко опишите, почему общий контейнер не подошёл.

Связанные входные точки: `MediaLibraryPickerDialog`, `MediaLibraryInsertDialog`.

---

## 21. UI: тексты без избыточных пояснений

_Источник: `.cursor/rules/ui-copy-no-excess-labels.mdc` (alwaysApply)_

При реализации или правке UI (пациентский кабинет, админка, публичные экраны):

- **Не** добавлять «от себя» дополнительные заголовки секций, вводные абзацы, поясняющие подписи под элементами, декоративные подзаголовки и развёрнутые hint-тексты, если задача или спецификация этого **явно** не требуют.
- Сохранять лаконичность; ориентироваться на существующие экраны и паттерны проекта.
- Если кажется, что не хватает пояснения — по умолчанию **не** дописывать его в интерфейсе; уточнение — через постановку/продукт, а не через самовольные строки в коде.

**Исключения (разрешено без отдельного запроса):** доступность (`aria-*`, скрытые для вида но читаемые подписи), обязательные сообщения об ошибках/валидации, тексты жёстко зафиксированные в документации по конкретному экрану для этой задачи.

---

## 22. UI: Select — displayLabel

_Источник: `.cursor/rules/ui-select-trigger-display-label.mdc` (alwaysApply)_

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

---

## 23. Справочник вне `.cursor/rules`

Постоянные инструкции — в `.cursor/rules/` и разделах 1–22 выше. Ниже — **документы и паттерны**, которые Cursor не подставляет автоматически, но агенту нужно знать по задаче.

### Покрытие `.cursor/rules` → `AGENTS.md`

Все **22** файла из `.cursor/rules/` (21× `.mdc` + `test-execution-policy.md`) продублированы в разделах 1–22. Исключение по смыслу: §1a ([`LOCAL_DEV_AND_AGENT_TESTING.md`](docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md)) — канон репозитория, не rule-файл.

| Файл                                  | В AGENTS | Примечание                                                                                                                  |
| ------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `patient-doctor-ui-isolation.mdc`     | §17      | **Нет YAML frontmatter** (`alwaysApply`/`globs`) — правило не scoped в IDE; опирайтесь на §17 при правках patient/doctor UI |
| `cms-unified-media-picker-layout.mdc` | §20      | `alwaysApply: false` — только doctor CMS media pickers                                                                      |
| `patient-media-playback-video.mdc`    | §19      | scoped: patient routes                                                                                                      |

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

## Справка: файлы правил

| Файл                                        | alwaysApply           | globs (если scoped)             |
| ------------------------------------------- | --------------------- | ------------------------------- |
| `000-critical-integration-config-in-db.mdc` | да                    | —                               |
| `answer-itog-without-code-unless-asked.mdc` | да                    | —                               |
| `clean-architecture-module-isolation.mdc`   | да                    | —                               |
| `cms-unified-media-picker-layout.mdc`       | нет                   | doctor CMS                      |
| `doctor-ui-shared-primitives.mdc`           | да                    | —                               |
| `git-commit-push-full-worktree.mdc`         | да                    | —                               |
| `host-psql-database-url.mdc`                | да                    | —                               |
| `no-unsolicited-followups.mdc`              | да                    | —                               |
| `patient-doctor-ui-isolation.mdc`           | нет (нет frontmatter) | patient + doctor zones; см. §17 |
| `patient-lfk-means-rehab-program.mdc`       | да                    | —                               |
| `patient-media-playback-video.mdc`          | нет                   | patient routes, media           |
| `patient-ui-shared-primitives.mdc`          | да                    | —                               |
| `plan-authoring-execution-standard.mdc`     | да                    | —                               |
| `pre-push-ci.mdc`                           | да                    | —                               |
| `push-means-ci-commit-push.mdc`             | да                    | —                               |
| `runtime-config-env-vs-db.mdc`              | да                    | —                               |
| `server-conventions-and-doc-onboarding.mdc` | да                    | —                               |
| `system-settings-integrator-mirror.mdc`     | да                    | —                               |
| `test-execution-policy.md`                  | да                    | —                               |
| `ui-copy-no-excess-labels.mdc`              | да                    | —                               |
| `ui-select-trigger-display-label.mdc`       | да                    | —                               |
| `webapp-tests-lean-no-bloat.mdc`            | да                    | —                               |

**Документация репозитория (не rule-файл):** [`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`](docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md) — §1a; [`docs/ARCHITECTURE/DB_STRUCTURE.md`](docs/ARCHITECTURE/DB_STRUCTURE.md) — §23.

**Не включено в этот файл:** `.cursor/plans/` — это архив задач и планов инициатив, а не постоянные инструкции для агентов.

---

## 24. Оркестрация субагентов

_Правила выведены из практики (2026-06): тихие смерти/зависания агентов, git-факапы в общем чек-ауте, дублирование с параллельным чатом._

**Канон:** общий метод — [`docs/AGENT_AUTORUN_SCHEME.md`](docs/AGENT_AUTORUN_SCHEME.md), обязательные актуальные
привязки этого репозитория — [`docs/ORCHESTRATION_BINDINGS.md`](docs/ORCHESTRATION_BINDINGS.md). При конфликте
старых практических заметок этого раздела с bindings побеждает `ORCHESTRATION_BINDINGS.md`.

**Режим ведения плана из многих этапов (обязателен для ЛЮБОГО плана):** глубина аудита по риску этапа + жёсткий
потолок кругов (presentation/механика = worker + ОДИН аудит; >2 correction-раундов без закрытия чек-листа = СТОП +
вопрос владельцу, не новый круг); параллель независимых слайсов с непересекающимся file-scope; приёмка владельца в
СЕРЕДИНЕ плана, не только в финале («audit PASS» сам по себе ≠ «готово»); развилки владельца — заранее одним листом.
Полностью — раздел «Универсальный режим исполнения многоэтапного плана» в `docs/ORCHESTRATION_BINDINGS.md`.

### Роли и стоимость

- Дорогая модель (оркестратор) делает ТОЛЬКО: планирование, брифы, ревью, интеграцию. **Всю реализацию (включая «мелкий» код) отдавать Sonnet-субагентам.** Не писать рутинный код самому — это жжёт контекст чата и токены.
- Для планирования / перепроверки плана дорогая модель допустима. Уровень модели/мышления подбирать под задачу (мелкая правка → дешевле; рискованная архитектура → дороже).

### Параллелизм

- **Ориентир нагрузки: до 3 фоновых агентов одновременно** (тяжёлые build/dev — меньше). Лишнее — в очередь, не «веером».
- **Независимые слайсы с непересекающимся file-scope гнать ПАРАЛЛЕЛЬНО (в пределах лимита), а не по очереди** — см.
  режим исполнения в `docs/ORCHESTRATION_BINDINGS.md`. Сериализуется только конкуренция за общий ресурс (единый
  dev-сервер под живой скрин, heavy CI под mutex).
- 🔴 **Каждый параллельный поток — В СВОЕЙ ВЕТКЕ `wt/<workstream>`, не в общем `feat` (владелец, 31.07.2026).**
  Клон изолирует дерево, ветка — приёмку и откат. В `feat` попадает только слияние `--no-ff` **после
  независимого аудита**, и делает его лид. Прежняя редакция «клон — ветка та же» отменена: она стоила
  несведённого коммита на 107 файлов, который нельзя ни принять по частям, ни отклонить, и переплетённой
  истории, где не видно, что откуда приехало. Полный текст с замером — `docs/ORCHESTRATION_BINDINGS.md`,
  раздел «Ветка на workstream, а не общий `feat`».

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
