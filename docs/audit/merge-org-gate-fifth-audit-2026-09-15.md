# Э1, пятый независимый адверсарный аудит — зубы новой пробы и класс уникальных индексов

**Предмет:** клон `/home/dev/dev-projects/bcb-wt-merge-org-gate`, ветка `wt/merge-org-gate`.
Поверхность Э1 живёт на `c522f6021`; голова дерева — `6231e8642` (слияние `feat/doctor-ui-rebuild`,
видео-звонок и настройки). `git diff --name-only c522f6021..HEAD | grep -iE "merge|privileg|platform_user"`
пусто — ни один файл Э1 после `c522f6021` не менялся, поэтому аудит головы = аудит `c522f6021`.
**Оракул:** `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18/§18а/§18б; план
`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э1. **Аудитор:** `claude-opus-5`.

## ВЕРДИКТ: FAIL

Оба пункта четвёртого аудита **закрыты**, я подтвердил это своими прогонами:

- **Д1 (у тестов не было зубов) — закрыт.** Новая проба исполняет движок из исходника против живого
  PostgreSQL. Из 14 инъекций 12 краснеют, включая три класса ТИХОЙ потери медицинских данных, которые
  стена базы не ловит вовсе.
- **Д2 (канон-случай падал на `23505 uq_user_phone_history_user_active`) — закрыт.** Собственный прогон:
  заметка в клинике A против заметки в клинике B при двух живых строках `user_phone_history` сливается,
  обе заметки остаются при своих клиниках, оба интервала истории телефона целы, текущий ровно один.

Не принимается по двум новым пунктам:

- **Н1 (блокирующий, против приёмочной строки Э1).** План Э1 дословно требует: «две с назначениями в
  одной — нет». Постоянная проба этого не держит. Из десяти медицинских категорий гейта она защищает
  **одну** — `doctor_notes`. Переклассификация любой из остальных девяти в «не блокеры» оставляет пробу
  зелёной 10/10 и `tsc` на нуле, включая все три категории, названные каноном §18 поимённо:
  **назначения**, **назначенные упражнения**, **отслеживание симптомов**.
- **Н2 (блокирующий, ложное заявление о защите).** `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md:108`
  утверждает, что проба «покрывает … **каждую** коллизию уникальных индексов на пути переноса».
  Замер живой DEV: таких индексов **16**, проба создаёт коллизию у **6**. Сам код при этом верен —
  все десять непокрытых я проверил своим прогоном, каждый закрыт.

## Как проверялось

Движок импортируется из **исходника** (`packages/platform-merge/src/pgPlatformUserMerge.ts`), не из
`dist`. Всё — одна транзакция на именованной `bcb_webapp_dev`, savepoint на сценарий, внешняя
транзакция всегда кончается `ROLLBACK`. Собственное id-пространство (`b7e2…`, `c9e3…`), чтобы не
пересечься с пространством пробы (`a5e1…`). После каждой инъекции — `git checkout --` и `git status`.

Артефакты этого хода:
`merge-org-gate-fifth-audit-live-proof-2026-09-15.mjs` (девять сценариев: канон-случай + непокрытые
индексы), `merge-org-gate-fifth-audit-gate-gap-2026-09-15.mjs` (один вход Н1),
`merge-org-gate-fifth-audit-reclassify-injection-2026-09-15.py` (тип-чистая инъекция).

## Точка 1 — зубы новой пробы: ЕСТЬ, но узкие

Базовая линия:

```
sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-merge-org-gate && RUN_PLATFORM_USER_MERGE_DB=1 \
  exec apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs'
→ proof_status=PASS scenarios=10 rollback=complete residual_rows=0 · duration_ms 957 · pass 1 fail 0
```

| № | инъекция | проба |
|---|---|---|
| I1 | гейт теряет разрез по организации (`ON … IS NOT DISTINCT FROM …` → `ON true`) | **КРАСНАЯ** — 2 сценария: пара из разных клиник перестала сливаться |
| I2 | `IS NOT DISTINCT FROM` → `=` | **КРАСНАЯ** — две неатрибутированные истории слились молча |
| I3a | свойство `automaticProbe` у `doctor_notes` удалено | **КРАСНАЯ** — `TypeError: record.automaticProbe is not a function` |
| I3b | `doctor_notes` переклассифицирована в «не блокеры» (тип чист) | **КРАСНАЯ** — 2 сценария |
| I3c | **`treatment_program_instances` переклассифицирована** (тип чист) | ⛔ **ЗЕЛЁНАЯ 10/10**, `tsc` exit 0 |
| I4a | снят `reason !== 'manual'` — гейт применяется и к ручному | **КРАСНАЯ** — 2 сценария |
| I4b | вызов гейта удалён совсем | **КРАСНАЯ** — 2 сценария |
| I5a | `reconcileActiveTreatmentProgramInstancesForMerge` → no-op | **КРАСНАЯ** (`23505 uq_treatment_program_instances_one_active_per_patient`) |
| I5b | `reconcileActivePhoneHistoryForMerge` → no-op | **КРАСНАЯ** (`23505 uq_user_phone_history_user_active`) |
| I5c | `reconcileOpenTestAttemptsForMerge` → no-op | **КРАСНАЯ** (`23505 idx_test_attempts_one_open_per_item_patient`) |
| I5d | `consolidateDailyDoctorNotesForMerge` → no-op | **КРАСНАЯ** (`23505 uq_doctor_notes_daily_author`) |
| I5e | `reconcilePatientLfkAssignmentsForMerge` → no-op | ⛔ **ЗЕЛЁНАЯ 10/10** |
| I6 | тихая потеря текста заметки (`string_agg` → `MIN`) | **КРАСНАЯ** — `не совпало /note-108/` |
| I7 | тихая потеря результата теста (перенос `test_results` отключён) | **КРАСНАЯ** — `results: 2 → 1` |
| I8 | тихая потеря интервала истории телефона (закрытие → удаление) | **КРАСНАЯ** — `total: 2 → 1` |

Важное для линейки владельца: I6/I7/I8 — классы, которых стена базы **не видит** (никакого `23505`,
данные просто исчезают). Проба их ловит. Значит она не пересказ Postgres; у пяти сценариев стена стоит
первой линией, но утверждения в них проверяют результат на ВЫХОДЕ цепочки, а не факт отсутствия `23505`.

## Н1 — проба не держит половину приёмочной строки Э1

Плановая формулировка Э1: «две учётки с назначениями в разных клиниках сливаются; **две с назначениями в
одной — нет**». Канон §18 называет блокирующие категории поимённо: «назначения, заметки, назначенные
упражнения, отслеживание симптомов, заполненная карточка клиента».

Среди десяти сценариев пробы блокировку авто-слияния проверяют три, и все три — про `doctor_notes`
(одна организация, `NULL`-организация). Сценария «две активные программы ВРАЧА в одной клинике,
автоматический путь → блок» нет: `s5` берёт разные клиники, `s10` идёт ручным путём, где гейт не
применяется вовсе.

Переклассификация записи из `MEDICAL_HISTORY_RECORDS` в `NON_BLOCKING_MERGE_RECORDS` — операция, законная
по типам (`NonBlockingMergeRecord` объявляет `automaticProbe?: never`). Типовая конструкция, введённая
четвёртым кругом, закрывает только «запись осталась в медицинском списке без пробы»; «запись вынесли из
списка» она не закрывает.

```
для t in clinical_visit doctor_notes symptom_trackings patient_lfk_assignments treatment_program_instances:
  python3 docs/audit/merge-org-gate-fifth-audit-reclassify-injection-2026-09-15.py $t && <прогон пробы>

clinical_visit               → proof_status=PASS scenarios=10   ⛔
doctor_notes                 → not ok 1                          ✓
symptom_trackings            → proof_status=PASS scenarios=10   ⛔
patient_lfk_assignments      → proof_status=PASS scenarios=10   ⛔
treatment_program_instances  → proof_status=PASS scenarios=10   ⛔
```

**Инъекция не пустая — она меняет живое поведение.** Конкретный вход и неверный исход
(`merge-org-gate-fifth-audit-gate-gap-2026-09-15.mjs`): две `platform_users` с `role='client'`, у каждой
строка `treatment_program_instances` с `assignment_source='doctor'` и ОДНИМ И ТЕМ ЖЕ `organization_id`;
автоматический путь `reason='phone_bind'`.

```
--- ЧИСТЫЙ ИСХОДНИК ---
ЗАБЛОКИРОВАНО — MergeDependentConflictError: medical_history: automatic merge requires support (conflict inside one organization)
--- ПОД ИНЪЕКЦИЕЙ (переклассификация назначений) ---
СЛИЛОСЬ МОЛЧА — назначения обеих сторон одной клиники теперь на одной учётке (2 шт.)
--- tsc под той же инъекцией ---
TSC EXIT=0
```

Отказ дорогой и молчаливый по §10a: медицинские назначения двух разных людей внутри одной клиники
оказываются на одной учётке, оператор ничего не видит, врач разбирать не вызывается. Ровно то, ради
чего Э1 и заводился.

## Н2 — «каждая коллизия уникальных индексов» покрыта не вся

Свой список, из живой DEV, независимо: сначала из исходника пакета выбраны все пары «таблица → колонка,
которую `UPDATE … SET <col> = target` переставляет на выжившего» (56 пар), затем по ним взяты уникальные
индексы, где эта колонка входит в КЛЮЧ.

```
psql -d bcb_webapp_dev -f <запрос по pg_index × 56 пар>   → 16 строк
psql -d bcb_webapp_dev -c "… pg_constraint … contype='x'" → 1 exclusion-ограничение
```

**Exclusion-ограничение одно и к слиянию отношения не имеет:**
`be_appointments_specialist_no_overlap EXCLUDE USING gist (specialist_id WITH =, tstzrange(start_at,end_at) WITH &&)`.
Ключ — специалист и время; слияние переставляет `platform_user_id`, ни одна колонка ключа не меняется,
новое нарушение возникнуть не может.

**16 индексов на пути переноса. Проба создаёт коллизию у 6:**

| индекс | сценарий пробы |
|---|---|
| `uq_doctor_notes_daily_author` | s4 |
| `uq_user_phone_history_user_active` | s6 |
| `idx_user_channel_preferences_one_auth_pref` | s7 |
| `uq_native_push_targets_user_token` | s8 |
| `idx_test_attempts_one_open_per_item_patient` | s9 |
| `uq_treatment_program_instances_one_active_per_patient` | s5, s10 |

**Десять — не создаёт.** Каждый из них я проверил сам; ВСЕ закрыты в коде
(`merge-org-gate-fifth-audit-live-proof-2026-09-15.mjs`, 9 сценариев PASS, `residual_rows=0`):

| индекс | мой сценарий | итог |
|---|---|---|
| `idx_patient_lfk_assign_active_template` | B: один шаблон активен у обоих, ручной | PASS — дубль деактивирован, обе строки целы |
| `uq_symptom_trackings_general_wellbeing_active_platform_user` | C: дневник самочувствия у обоих, авто | PASS |
| `uq_symptom_trackings_warmup_feeling_active_platform_user` | тот же код (`SINGLETON_SYMPTOM_KEYS`) | закрыт тем же путём |
| `uq_patient_specialist_links_active_pair` | D: один специалист активен у обоих, авто | PASS — дубль `ended`, обе строки переехали |
| `patient_diary_day_snapshots_…_pk` | E: один и тот же день у обоих, авто | PASS |
| `program_item_discussion_reads_pkey` | F: один элемент программы прочитан обоими, авто | PASS |
| `broadcast_audit_recipients_…_pk` | G: одна рассылка ушла обоим, авто | PASS |
| `user_password_credentials_pkey` | H: пароль у обоих, ручной | PASS — дубль удалён, у target остался свой |
| `uq_user_channel_preferences_platform_user_channel` | I: ОДИН И ТОТ ЖЕ канал у обоих, ручной | PASS |
| `user_channel_preferences_user_id_channel_code_key` | тот же сценарий I | PASS |

Сверх 16 на пути переноса есть ещё 12 уникальных индексов на таблицах, куда слияние пишет через
`INSERT … ON CONFLICT … DO UPDATE` + `DELETE` дубля (`material_ratings`, `be_patient_booking_profiles`,
`patient_daily_warmup_presentations`, `product_analytics_user_hourly` ×2, `user_notification_topics`,
`user_notification_topic_channels`, `email_send_cooldowns`, `platform_user_contacts`, `user_contacts` ×2,
`user_identity`). Там арбитр назван в самом операторе, коллизия невозможна по построению. Проба их
тоже не трогает.

Заявление в `PLATFORM_USER_MERGE.md:108` неверно ровно на слове «каждую». Правка документа — не мой ход.

## Точка 2 — опт-ин `RUN_PLATFORM_USER_MERGE_DB=1`: что CI НЕ проверяет

Файл **попадает** в CI-шаг `pnpm test:db-privileges` (`node --test deploy/postgres/privileges/*.test.mjs`)
и отчитывается там `# SKIP` — тихо исчезнуть, оставаясь в каталоге под этим именем, он не может:

```
/home/dev/brain/host-orch/run-tests.sh "pnpm test:db-privileges"
→ tests 382 · pass 186 · fail 0 · skipped 196 · EXIT=0
node --test deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs
→ ok 1 … # SKIP · pass 0 · fail 0 · skipped 1
node --check … → OK ;  npx eslint … → 0 (проверено инъекцией: две ошибки no-unused-vars, exit 1)
```

**Чего CI НЕ проверяет сегодня:**

1. **Что файл вообще там лежит.** `node scripts/check-test-runner-visibility.mjs` (гейт «файл дошёл до
   раннера» из §10a) знает три проекта — integrator 129, webapp 558, media-worker 21 — и каталог
   `deploy/postgres/privileges/` не знает вовсе. Переименование, перенос или удаление файла CI не заметит.
2. **Связь со своим предметом.** Движок подключается динамическим импортом по СТРОКЕ
   `packages/platform-merge/src/pgPlatformUserMerge.ts` и по имени `mergePlatformUsersInTransaction`.
   `.mjs` не входит ни в один `tsconfig` (`packages/platform-merge/tsconfig.json`: `"include": ["src/**/*"]`),
   поэтому переименование символа или перенос файла движка дают зелёный CI и мёртвую пробу.
3. **Ничего из самого поведения:** ни SQL фикстур, ни `expected`, ни утверждений `verify`. Без флага
   исполняется только тело модуля (константы и массив сценариев) — синтаксис и разрешение импортов
   `node:*`, не более.

## Точка 3 — см. Н2 · Точка 4 — канон-случай: СЛИВАЕТСЯ

Мой сценарий A, никакой связи с фикстурами пробы: у target заметка врача в клинике A, у дубликата —
в клинике B (разные авторы), у КАЖДОГО строка `user_phone_history` с `valid_to IS NULL` и разными
`valid_from` (`2026-01-01`, `2026-02-01`). Путь автоматический, `reason='phone_bind'`.

```
PASS  A. КАНОН §18: заметка A против заметки B + две живые истории телефона (auto)
```

Утверждения, каждое проверено отдельно: обе заметки на выжившем и **каждая при своей клинике**
(`note-target-orgA`→`ORG_A`, `note-dup-orgB`→`ORG_B`); в `user_phone_history` ровно **2** строки, обе на
выжившем, активна ровно **1**, `valid_from` старого интервала не переписан; у дубликата
`merged_into_id = target`. Ни одна строка не осталась на дубликате. `residual_rows=0`.

## Точка 5 — миграция: чиста по §1, на DEV НЕ применена, старые строки не нарушает

`apps/webapp/db/drizzle-migrations/20260914T214345_scope_active_treatment_program_to_organization.sql`.

- **§1 «миграция не выдаёт прав»:** `grep -nE "GRANT|REVOKE|CREATE POLICY|ALTER .*OWNER|SECURITY DEFINER"`
  → ни одного вхождения. Оба блока несут `-- BCB-MIGRATION-OWNER: app_object_owner`, ведущий блок несёт
  `-- BCB-MIGRATION-VERIFY`. Имя в формате `YYYYMMDDTHHMMSS_slug`. Новых таблиц нет — декларации не нужно.
- **НЕ применена, по интроспекции:**
  `SELECT indexdef FROM pg_indexes WHERE indexname='uq_treatment_program_instances_one_active_per_patient'`
  → `USING btree (patient_user_id) WHERE (status = 'active'::text)` — прежняя, без организации.
  Журнал подтверждает то же (`tag LIKE '%scope_active_treatment%'` → 0 строк), но решает интроспекция.
- **Старые строки не нарушают:** `GROUP BY organization_id, patient_user_id HAVING count(*) > 1` по
  `status='active'` → пусто. Активных строк 64, из них с `organization_id IS NULL` — 0.

## Факты в отчёт (задачами не становятся)

1. **Подраздела «Линейка владельца (15.09)», на который ссылается бриф, в этом клоне НЕТ.**
   `grep -rn "Линейка владельца" .` по всему репозиторию пусто; `AGENTS.md` — 2253 строки, `15.09` в нём
   не встречается ни разу. Текст живёт на неприземлённой ветке `wt/canon-test-ruler` (`e87646087`).
   Линейку я применил по цитате из того коммита.
2. **Проба сама изготавливает состояние ПОСЛЕ миграции.** Если живой индекс не той формы, она делает
   `DROP INDEX` + `CREATE UNIQUE INDEX … (organization_id, patient_user_id) NULLS NOT DISTINCT` внутри
   своей транзакции. Значит сценарии s5/s10 доказывают поведение после миграции, а не нынешнее поведение
   DEV. Побочный эффект: `DROP INDEX` берёт `AccessExclusiveLock` на `treatment_program_instances`
   (замерено) и держит его всю транзакцию — ~1 с на общей DEV при каждом прогоне.
3. **Линейка владельца против оставшегося теста этой поверхности.**
   `apps/webapp/src/infra/platformUserMergePreviewMeaningfulData.unit.test.ts` — единственный тест,
   ссылающийся на изменённые файлы webapp. Вопрос 2 линейки («придётся ли править при честной правке
   кода») — да: он утверждает ТЕКСТ SQL (`expect(call.sql).not.toMatch(/IS NULL/)`,
   `toMatch(/platform_user_id = \$\d+::uuid OR user_id = \$\d+::text/)`), и любое честное переписывание
   этого запроса — переименование параметра, перестановка ветвей `OR`, вынос в CTE — красит его при
   неизменном поведении. Вопрос 3 («виден ли результат на выходе цепочки») — нет: `fakePool` возвращает
   захардкоженный счётчик, предикат никогда не исполняется, `expect(sum).toBeGreaterThan(0)` — тавтология
   заглушки. Это §10a «Как НЕ надо» №1, №5 и №7. Инцидент за тестом реальный (аудит F2), поэтому решение
   о его судьбе — владельца, не аудитора.
4. **Предпосадочный маршрут §1 на DEV отказывает, и не из-за этой миграции** (подтверждаю наблюдение
   четвёртого круга):
   `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot`
   → `bcb_webapp_dev records 1 migration(s) as applied whose objects are not in the catalog: absent:
   constraint org_enrollments_portal_activation_check on public.be_booking_form_fields (from
   20260914T111500_leads_core)`, exit 1. Расхождение леджера соседней ветки; до приземления Э1 его
   кто-то должен закрыть. `declaration.ts` этого клона побайтно совпадает с каноническим чекаутом, так
   что seed реестра внутри preflight ничего не сдвинул.
5. **Схема Drizzle и миграция по-прежнему разошлись** (наблюдение четвёртого круга, не закрыто):
   `apps/webapp/db/schema/treatmentProgramInstances.ts:61-63` объявляет индекс без `NULLS NOT DISTINCT`,
   миграция создаёт с ним. `drizzle-kit generate` выдаст дрейф. Поведенчески права миграция: reconcile
   сравнивает организации через `IS NOT DISTINCT FROM`.

## Прогоны и уборка

- `npx tsc -p packages/platform-merge/tsconfig.json --noEmit` → exit 0.
- `pnpm --dir apps/webapp exec vitest run --project unit <затронутые>` → 2 файла / 4 теста PASS.
- `pnpm test:db-privileges` под замком хоста → 382 теста, 0 падений, exit 0.
- Продуктовый код не изменён ни одной строкой: после всех 20 инъекций `git status` чист.
- На DEV не осталось ни одной строки трёх моих id-пространств (`a5e1…`, `b7e2…`, `c9e3…`) — все счётчики 0.
- Индекс `uq_treatment_program_instances_one_active_per_patient` на DEV в прежней форме; миграция ветки
  в леджере отсутствует.

## Что осталось за рамками этого хода

Полный `pnpm run ci`, живая приёмка на TEST, галочка Э1 в плане, приземление и пуш. Строка вердикта в
`feat` не пишется — ветка закрыта владельцем, строка отдана ведущему текстом.
