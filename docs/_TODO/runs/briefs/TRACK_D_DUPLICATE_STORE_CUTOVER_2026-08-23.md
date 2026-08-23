# Track D — цельный physical cutover подтверждённых копий данных

## Роль и результат

Ты один сильный `worker-hard`. Это не исследование и не серия мелких находок: за один ход доведи до конечного
состояния весь перечисленный ниже подтверждённый Track-D scope, проверь его, напиши отчёт и закоммить все свои
изменения явными путями. Не заканчивай ход с незакоммиченным деревом.

Результат для человека: у одной сущности остаётся одно каноническое место хранения и один writer/read path;
интегратор больше не хранит вторую копию продуктовых данных и не требует retry для её исцеления.

## Authority — прочитать до правок

1. `AGENTS.md`: маршрут; «Как решать, что делать»; §1 migrations/rights; §5; §7; §9–§10; §24.
2. `docs/OWNER_DECISIONS.md`, раздел `Track D — текущий scope`.
3. `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`: D15b/5, D15b/6, D25, D26 и более поздние
   записи 23.08.
4. `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/18-duplication-sweep.md`.
5. `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/22-identity-migration.md` — числовая история полезна,
   но баннер файла прямо указывает, какие статусы устарели; текущий authority выше.
6. `docs/_TODO/runs/integrator-cleanup/D30_REMINDER_M2M_RETIREMENT_INDEPENDENT_AUDIT_2026-08-23.md` как
   уже принятое соседнее конечное состояние, не как новый scope.

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «generic webhook не создаёт
аккаунт; token-bound webapp flow принимает только self-owned messenger contact, сверяет номер, фиксирует
подтверждение и доставляет код; интегратор не создаёт аккаунт и не решает merge.»

Перед реализацией проверь более поздние owner-регистры и обратные ссылки по каждому D-ID. Плановая проза проигрывает
более позднему решению владельца.

## Измеренная текущая база scope

Это входные факты переписи 23.08 на `feat/doctor-ui-rebuild` и named DEV `bcb_webapp_dev`; перемерь их текущими
read-only средствами перед проектированием миграции и приведи в отчёте точную команду рядом с каждым числом.

1. `platform_users` / `user_identity`: 304 / 294 строк; 294 пары; расхождений ФИО в парах 0; 10 активных
   `platform_users` без `user_identity`. Все десять — специалисты, созданные 22.08. Текущий
   `app.provision_specialist_owner` обновляет прежнее зеркало, но не гарантирует создание `user_identity`.
2. `integrator.user_reminder_delivery_logs` / `public.reminder_delivery_events`: 1735 / 1735; все 1735 связаны
   через `integrator_delivery_log_id`, расхождений и сирот 0. Это две физические копии одного delivery fact.
3. Одновременные `user_id text` и `platform_user_id uuid`:
   `lfk_complexes` 1/1, `symptom_entries` 618/618, `symptom_trackings` 262/262,
   `user_channel_preferences` 122/122, `message_log` 0/0. Живой код всё ещё читает/пишет оба ключа.
4. Одновременные `integrator_user_id` и `platform_user_id`:
   `reminder_occurrence_history` 2467/2467/2105 согласованных,
   `reminder_rules` 46 total / 27 с обоими / 22 согласованных,
   `support_conversations` 261 total / 15 с обоими / 11 согласованных,
   `content_access_grants_webapp` пустая. Несогласованные старые integrator-ключи — хвост merge/cutover;
   не перезаписывай уже канонический `platform_user_id` старым значением.

## Обязательный scope — один проход

### A. ФИО: `user_identity` остаётся единственным домом

- Гарантируй `user_identity` для каждого неслитого канонического `platform_users`, включая provisioning нового
  owner/specialist; исправь все writer paths через существующий identity/DB-port chokepoint.
- Forward migration должна fail-closed сверить/дозаполнить отсутствующие строки, после чего удалить legacy FIO
  storage из `platform_users` и зависимые dual-write/COALESCE/fallback paths. Учитывай фактический текущий набор
  FIO/identity колонок, а не историческое число из документа.
- Не возвращай старое создание аккаунтов из generic bot webhook. Token-bound регистрационный flow D25 остаётся
  единственным разрешённым направлением; этот этап не создаёт второй регистрационный путь.

### B. Напоминания: один delivery journal

- Канонический продуктовый журнал — `public.reminder_delivery_events`; интегратор остаётся адаптером доставки.
- Переведи единственного оставшегося читателя/писателя на существующий public DB-port path, затем forward migration
  удаляет `integrator.user_reminder_delivery_logs`, ссылочную колонку/ограничения и retry/healing второй записи.
- Durable intent/queue, реальная попытка доставки и канонический audit/event не смешиваются: не удаляй
  `public.outgoing_delivery_queue`, delivery intents или честную историю попыток, если это разные факты.

### C. Старые text user IDs

- Во всех пяти измеренных таблицах оставь только `platform_user_id uuid`; переведи schema, ports, writers,
  readers, filters, purge/merge и тесты. Миграция проверяет паритет и только затем удаляет `user_id text`.
- Не создавай compat-колонку, view с обратной записью или второй helper-путь под старый ключ.

### D. Старые integrator user IDs

- В четырёх измеренных таблицах оставь только `platform_user_id`; разберись с каждой mismatch-группой через
  существующий merge/canonical-user graph. Канонический platform UUID побеждает stale integrator ID.
- Переведи все writers/readers/constraints/indexes/merge/purge paths, затем миграция fail-closed удаляет
  `integrator_user_id`. Пустая таблица не исключение: схема тоже должна стать конечной.
- Не возвращай удалённые integrator identity tables или HTTP sync.

## Архитектурные ограничения

- Применяй `AGENTS.md` §5 «Один общий проход»: варианты одной операции параметризуют существующую точку. Перед
  каждой новой function/wrapper/service явно проверь, можно ли расширить текущий chokepoint; новый параллельный
  путь без доказанной границы запрещён.
- Новый runtime raw SQL запрещён. Оба приложения ходят к БД только через свой Drizzle DB-port. Migration SQL
  остаётся migration SQL.
- Никаких `any`, ослабления strict typing, silent catch/fallback и двойной записи «временно для совместимости».
- Миграция schema B — новый timestamp-forward файл; journal/snapshot синхронизировать штатно. В миграции запрещены
  `GRANT`, `REVOKE`, `CREATE ROLE`, `CREATE POLICY`; права меняются через declaration/relation-access и генератор.
  До отчёта сделай полный разбор прав каждого изменённого/удалённого объекта по §1.
- Если существующий порт уже выражает нужное действие, расширь его вместо новой функции. Если новый seam всё же
  нужен, отчёт обязан объяснить невозможность консолидации.

## Явно вне scope

- Любые ветки, файлы и планы инициативы Therapysto/branding/night; не переключать, не сливать, не удалять.
- `patient_bookings` против `be_appointments`; `be_specialists.full_name`; branding-пары — OWNER QUESTION, не работа.
- Intent/queue против event/history, audit snapshots, rollups, read-only projections без обратной записи — не
  считать дубликатом только по похожим полям.
- PROD, TEST deploy/mutation, токены, реальные webhook, cronport, push, полный CI.
- Не удалять ветку или worktree после завершения.

## Проверки и evidence

1. До кода составь карту всех readers/writers/constraints/indexes для четырёх классов; сначала `code-search`, затем
   точный поиск известных символов. Сохрани карту в отчёте.
2. Добавь/обнови только поведенческие тесты, которые доказывают: новый specialist получает identity; generic webhook
   не создаёт человека; journal пишется один раз; каждый writer сохраняет UUID без legacy key; merged/stale
   integrator ID не переписывает канонический UUID.
3. Прогони targeted tests, lint/typecheck затронутых приложений, migration journal/migrator self-test,
   migration-order/privilege/function-census/generator checks и `git diff --check`. Full CI не запускай — его делает
   лид после landing на интеграционной голове.
4. Named DEV не мутировать. Если нужен долгий rollback-only preflight, подготовь точную команду и оставь его
   отдельным lead/auditor-live gate; не заканчивай ход в ожидании фонового процесса.
5. Отчёт:
   `docs/_TODO/runs/integrator-cleanup/TRACK_D_DUPLICATE_STORE_CUTOVER_2026-08-23.md`.
   В нём: before/after census с командами, карта writers/readers, миграционный порядок, разбор прав, тесты,
   оставшиеся owner questions и честное NOT DONE.
6. Коммит явными путями, без `git add -A`, сообщение с `#987`, зачем, evidence и NOT DONE. Не push.

## Готовность

Готово только если все четыре класса имеют один physical store/key и один runtime path в итоговом diff, targeted
gates зелёные, report и commit существуют, дерево чистое. Если один класс обнаружится неэквивалентным по фактам,
не маскируй это частичным сносом: сохрани выполненные безопасные классы одним коммитом, назови точный blocker с
доказательством и не расширяй scope.
