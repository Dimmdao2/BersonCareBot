# Б3 — разбор файлов живой БД, которые раннер не видит

**Authority:** `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, блок Б, пункт **Б3** и пункт **М4**
(«22 нарушения» на 31.07). Владелец 31.07 дословно: «надо их проверить, что они вообще тестируют
и нужны ли они».

## Расхождение со старым числом (22 → 30)

Свежий замер (02.08, `find` на диске против `vitest exec vitest list --filesOnly`) даёт **30**
файлов, не 22. Точную построчную сверку со старым списком дать нельзя — список 31.07 в
репозитории не сохранён, зафиксирована только команда и итоговое число. Это расхождение
зафиксировано, а не скрыто.

## Два разных явления внутри «раннер не видит» — критично для понимания

Свежий diff «диск минус `vitest list --filesOnly`» смешивает два разных класса, и это нужно
разделить, иначе можно принять решение по неверной причине:

### Класс 1 — ложная тревога (10 файлов `*.postgres.integration.test.ts`)

Эти файлы **реально гоняются в CI** через отдельный `vitest.postgres.config.ts` и job
`test-webapp-postgres` (`.github/workflows/ci.yml`, `pnpm run test:webapp:postgres`). Они не видны
голому `vitest list --filesOnly` только потому, что эта команда не передаёт `--config` и проверяет
только `vitest.config.ts`. Это дефект способа измерения, не покрытия:

- `pgDisposableHarness.postgres.integration.test.ts` — смок-тест самого харнесса Б1.
- `pgDisposableHarnessLifecycle.postgres.integration.test.ts` — регрессия на две prod-опасные
  поломки харнесса (снос чужого кластера, потеря data dir при упавшем `pg_ctl stop`).
- `bookingOwnershipAuditGaps.postgres.integration.test.ts`, `bookingOwnershipMigration.postgres.integration.test.ts`,
  `bookingOwnershipWriters.postgres.integration.test.ts` — единственное покрытие миграции `0309`
  (rollback на неоднозначной идентичности, org-wall после миграции).
- `pgDoctorBroadcastDelivery.postgres.integration.test.ts` — атомарность commit/rollback рассылки.
- `pgEmailOtpPublicAtomicConsume.postgres.integration.test.ts` — пилот Б1/Б3 от 02.08, уже принят.
- `reminderCallbackCapabilities.postgres.integration.test.ts` — D7, fail-closed SECURITY DEFINER
  под настоящей ролью `app_patient`.
- `reminderOccurrenceD21Migration.postgres.integration.test.ts` — охраняет ещё не выполненный
  cutover 0322 на TEST/PROD (см. `docs/_TODO/WORK_ORDER.md`, commit `7d1f2fe11`); переоценить после
  cutover.
- `reminderRulesD5Migration.postgres.integration.test.ts` — acceptance-оракул для ещё открытого
  D5 forward-repair (`TRACK_D_D5_FORWARD_MIGRATION_REPAIR_BRIEF.md`), сейчас нагружен работой.

**Вердикт по классу 1: (d) оставить как есть**, действие не требуется.

### Класс 2 — настоящие сироты (20 файлов `*.devDb.integration.test.ts`)

Независимо подтверждено (мной, не только субагентом): все 20 обёрнуты в
`describe.skipIf(!enabled)`, где `enabled` требует комбинацию `RUN_<ИМЯ>_DEV_DB=1 &&
USE_REAL_DATABASE=1`. Ни один из 20 конкретных флагов не встречается НИГДЕ, кроме самого тестового
файла — grep по `package.json`, `.github/workflows/*.yml`, `*.sh`, `.env*` во всём репозитории даёт
ноль совпадений на каждый флаг. `vitest.config.ts` (`fast`-проект) явно исключает
`src/**/*.devDb.integration.test.ts` (строка ~42), другие проекты (`unit`/`route`/`ui`) его не
подхватывают. **Эти 20 не запускаются нигде и никогда** — ни в CI, ни локально по умолчанию.

## Разбор всех 20 (три независимых параллельных прохода, только чтение)

Критерий — не «нужна ли живая БД», а работает ли тест по-настоящему (канон `AGENTS.md` §10a: тест
проверяет поведение, а не текст исходника/обстоятельства запуска). Полные таблицы с построчными
цитатами — в логах трёх research-агентов этой сессии; здесь — консолидированный вывод.

| Файл | Тавтология? | Нужен? | Решение |
|---|---|---|---|
| `adminAuditLog.devDb.integration.test.ts` | Нет | Да, единственное покрытие `listAdminAuditLog`/`countOpenAutoMergeConflicts` | **MIGRATE** на Б1 |
| `platformUserFullPurge.devDb.integration.test.ts` | Нет | Да, но покрывает только read-хелпер, не саму деструктивную очистку (В6 всё ещё открыт) | **MIGRATE** на Б1 |
| `platformUserMergePreview.devDb.integration.test.ts` | Нет | Да, единственное покрытие preview слияния | **MIGRATE** на Б1 |
| `orgBrandRevisionGuard.devDb.integration.test.ts` | Нет (поведение триггера), но последний блок — RLS/ACL-метаданные, не поведение | Да — закрывает реальный HIGH-2 из аудита 25.07 | **СПЛИТ**: поведение триггера → Б1; последний блок → A1 (`verify-a1-rls-conformance.mjs`) |
| `pgAuthRateLimitEvents.devDb.integration.test.ts` | Нет | Да, единственное покрытие security-релевантного rate-limiter | **MIGRATE** на Б1 |
| `pgBookingScheduling.deactivateWorkingHours.devDb.integration.test.ts` | Нет | Да, единственный сторож конкретного prod-бага (taskdb #821 §7, перепутанный порядок аргументов) | **MIGRATE** на Б1 |
| `pgBookingScheduling.readChokepoint.devDb.integration.test.ts` | Нет | Да, единственное non-mocked доказательство отсутствия cross-tenant утечки при параллельных чтениях | **MIGRATE** на Б1 |
| `pgDoctorAnalyticsMetricAccounts.devDb.integration.test.ts` | Слабо — shape-only, `if (!orgId) return` даёт vacuous pass на пустой базе | Да, но требует усиления assertions при переносе | **MIGRATE + усилить** |
| `pgDoctorClients.appointmentJoin.devDb.integration.test.ts` | Нет | Да, единственная проверка temporal phone-recycling join (тонкая SQL-логика) | **MIGRATE** на Б1 |
| `pgDoctorClients.devDb.integration.test.ts` | Слабо — shape-only | Да, но требует усиления assertions | **MIGRATE + усилить** |
| `pgDoctorPhase13d.devDb.integration.test.ts` | **Да, тавтология по факту** — единственная проверка `Array.isArray(rows)` прошла бы и при пустом, и при неверном результате | Волна 3 давно выкачена, но это единственное покрытие `pgDoctorMotivationQuotesEditor.ts` | **УДАЛЕНО этим коммитом** — см. «Что теряется» ниже |
| `pgEmailChallengeAtomicAttempts.devDb.integration.test.ts` | Нет — доказывает блокировку через `pg_blocking_pids`, не sleep | Да, единственное доказательство atomic-increment под реальной конкуренцией | **MIGRATE** на Б1 |
| `pgOtpDecayingLockoutAtomicEscalation.devDb.integration.test.ts` | Нет | Да, единственное доказательство неспособности потерять цикл эскалации при гонке | **MIGRATE** на Б1 |
| `pgPatientBookings.devDb.integration.test.ts` | Нет, но неглубокий смок | Да — единственный тест, гоняющий настоящий SQL (не мок) | **MIGRATE** на Б1 |
| `pgPhase14DCommsTail.devDb.integration.test.ts` | Нет | Частично — единственное покрытие реального SQL двух портов | **MIGRATE** на Б1 |
| `pgPhoneChallengeAtomicAttempts.devDb.integration.test.ts` | Нет | Да, сильно — юнит-тест мокает `runWebappSql` и не может доказать сериализацию; это единственное доказательство | **MIGRATE** на Б1, приоритетно |
| `pgPlatformUserMerge.devDb.integration.test.ts` | Нет | Да, единственный тест реального эффекта транзакции слияния | **MIGRATE** на Б1 |
| `pgProgramItemDiscussion.doctorComments.devDb.integration.test.ts` | Нет | Да — уже один раз поймал реальный баг (дубликат `id` в CTE, см. докстринг файла) | **MIGRATE** на Б1 |
| `pgSupportCommunication.devDb.integration.test.ts` | Нет | Частично — единственное покрытие реального SQL, мок есть только для route-тестов | **MIGRATE** на Б1 |
| `pgUserProjection.devDb.integration.test.ts` | Нет, но узко — только not-found-ветки | Частично — ветки успеха вообще не покрыты нигде | **MIGRATE + расширить** на найденную ветку |

**Класс 2, итог: 19 из 20 — реальные, небанальные тесты без замены, у которых нет ни одного шанса
покраснеть — их просто не запускают. Только 1 из 20 (`pgDoctorPhase13d`) — тавтология, для которой
удаление защитимо.**

## Решение владельца (02.08, эта сессия)

Владелец выбрал: **перенести большинство на одноразовый Б1-харнесс, чтобы они реально заработали в
CI; удалить только `pgDoctorPhase13d`** — по рекомендации разбора, не «вырезать все 20».

## Что теряется удалением `pgDoctorPhase13d.devDb.integration.test.ts`

Честно: `pgDoctorMotivationQuotesEditor.ts` (`listQuotesForEditor`, `upsertQuote`, `setQuoteArchived`,
`setQuoteActive`, `reorderQuotes`) — живой production-код, выбранный в `buildAppDeps.ts:527-528` —
остаётся **без какого-либо автоматического теста**, включая мок-юнит. Удалённый файл и до удаления
не давал реальной защиты (`Array.isArray` проходит и на сломанном запросе), но формально это была
единственная строка, упоминающая эти функции в тестах. Если этот модуль важен, ему нужен новый тест
с содержательными assertions — это не входит в объём Б3, отдельный вопрос владельцу/будущая задача.

## Дальше

Перенос 19 файлов на Б1-харнесс (с усилением трёх слабых) — отдельная, более крупная работа, взятая
в работу тремя параллельными Codex-воркерами сразу после этого коммита (см. очередь аудита,
записи `b3-migrate-1/2/3`).
