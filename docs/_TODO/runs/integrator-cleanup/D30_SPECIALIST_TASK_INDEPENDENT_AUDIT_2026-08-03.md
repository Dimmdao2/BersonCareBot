# Track D D30-P1 — independent audit: specialist-task scheduled delivery

Роль: independent auditor. Канон: `AGENTS.md` §5, §10, §24. Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`
Р-D30; `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md` Ш0.1/Ш1/Ш3; worker brief
`docs/_TODO/runs/briefs/TRACK_D_D30_SPECIALIST_TASK_SCHEDULING_BRIEF.md`; audit brief
`docs/_TODO/runs/briefs/TRACK_D_D30_SPECIALIST_TASK_AUDIT_BRIEF.md`. Продуктовый коммит: `2e30f3b90888791727684b0d6b728a35fbefa211`.

## Вердикт: **MUST FIX**

Три достижимых нарушения, все доказаны fault injection/чтением диффа против структурных гейтов, killed/not-killed
ниже. Отчёт воркера не использовался как доказательство — весь diff прочитан целиком, kill-set по авторитету
составлен до детального разбора тестов, poведенческие пункты проверены fault injection на throwaway PostgreSQL.

## Kill-set и результат

| # | требование (брифа/плана) | метод | результат |
|---|---|---|---|
| 1 | create/update атомарно пишут task + queue intents; отказ queue-write откатывает task | fault injection, disposable PG | **killed** — PASS |
| 2 | complete/delete/reschedule терминализируют старые ещё не отправленные intents | fault injection, disposable PG | **killed** для pending/dead путей — PASS; **NOT KILLED** для гонки с уже `processing` строкой — MUST FIX (находка 3) |
| 3 | write producer + legacy tick используют один deterministic event_id, без дубля | fault injection, disposable PG | **killed** — PASS |
| 4 | worker не принимает продуктовых решений, сохраняет retry/dead semantics | реальный unit-suite диффа (`outgoingDeliveryWorker.scope.test.ts`) + чтение диспетчеризации | **killed** — PASS |
| 5 | `organization_id` fail-closed участвует в tenant scope и claim; existing producers не сломаны | чтение diff + `resolve_outgoing_delivery_scope` live-проверка | **частично killed**: новая `specialist_task_reminder` ветка — PASS; существующая `reminder_dispatch` ветка — **MUST FIX** (находка 1, регрессия) |
| 6 | `schedulerDecisionGuard` ловит прямой, alias, dynamic и re-export обходы четырёх форм | fault injection против `findSchedulerDecisionViolations` (9 проб) | **NOT KILLED 6/9** — MUST FIX (находка 2) |
| 7 | не создана вторая очередь/дублирующий repository | чтение diff + grep схем | **killed** — PASS, единственный новый write-port (`pgOutgoingDeliveryQueue.ts`) поверх существующей `public.outgoing_delivery_queue` |
| 8 | временная `9999` не в journal; gate-обход узко ограничен | чтение diff + `check-drizzle-journal-sync.sh` прогон | **killed** — PASS (см. ниже) |
| 9 | D21 reminder delivery, CMS/tariffs/billing не затронуты | чтение diff (файловый список) + live-проверка функции | diff не трогает CMS/tariffs/billing/identity D25-29 напрямую; **D21 reminder delivery затронут регрессией** (находка 1) — MUST FIX |

**Killed: 12/15 достижимых проверок (считая 9 проб гейта отдельно + 6 поведенческих пунктов). Not killed: 3** —
находки 1, 2, 3 ниже. Плюс отдельный механический gate-fail: webapp `tsc --noEmit` красный на файле самого диффа
(находка 4).

---

## Находка 1 (MUST FIX, наивысший приоритет) — миграция `9999` откатывает D21/D5-канонизацию `reminder_dispatch`

`app.resolve_outgoing_delivery_scope` уже была канонизирована миграцией `0312_reminder_rules_scheduler_canonical_local.sql`
(присутствует в родителе `2e30f3b90` — проверено `git show 2e30f3b90^:apps/webapp/db/drizzle-migrations/0312_...sql`):
ветка `reminder_dispatch` там джойнит **канонический** `public.reminder_rules` (`rule.integrator_rule_id = occurrence.rule_id`).
Аудируемая миграция `9999_d30_specialist_task_delivery_queue_local.sql` делает `CREATE OR REPLACE` той же функции,
но её ветка `reminder_dispatch` джойнит **легаси** `integrator.user_reminder_rules` (`rule.id = occurrence.rule_id`) —
таблицу, в которую с D5 никто больше не пишет (`grep -rln "insert.*user_reminder_rules" apps/webapp/src apps/integrator/src` → пусто).
Файл `9999_...sql` целиком не содержит ни одного упоминания `public.reminder_rules`
(`grep -n "reminder_rules" apps/webapp/db/drizzle-migrations/9999_d30_specialist_task_delivery_queue_local.sql` →
только `integrator.user_reminder_rules`).

Поскольку миграции применяются в порядке имени файла, `9999` идёт ПОСЛЕ `0312` и молча отменяет её канонизацию для
этой функции (обе — `CREATE OR REPLACE` одной и той же `app.resolve_outgoing_delivery_scope`).

**Live-доказательство** (throwaway PostgreSQL 16, unix-socket, `initdb -A trust`): применил `0312`, вставил occurrence
с `organization_id = NULL` и rule, существующий только в каноническом `public.reminder_rules` (ровно тот сценарий,
ради которого D5/D21 переносили резолюцию на канонический стол) — резолюция верна:
`{"organization_id":"...a1","resolution":"tenant"}`. Применил поверх `9999` (та же строка, тот же вызов) —
резолюция сломана: `{"organization_id":null,"resolution":"organization_missing"}`. Тот же ряд, что резолвился до
диффа, после диффа не резолвится и уйдёт в dead-letter с `TENANT_SCOPE_ORGANIZATION_MISSING` вместо доставки.

Прямое нарушение явного пункта брифа «D21 reminder delivery… не затронуты» — затронут, регрессией.

**Фикс:** ветка `reminder_dispatch` в `9999_...sql` должна наследовать джойн из `0312` (`public.reminder_rules`,
`rule.integrator_rule_id = occurrence.rule_id`), не резервировать легаси-таблицу.

---

## Находка 2 (MUST FIX) — `schedulerDecisionGuard` не ловит собственный мандатный фикстур плана и большинство алиас/dynamic обходов

План (`D30_SCHEDULER_REVERSAL_PLAN.md` Ш0.1, раздел 4) прямо требует: «гейт загорается на фикстуре… и на
`offsetMs: offsetMinutes * 60 * 1000`». Это дословный acceptance-критерий шага, который этот же коммит закрывает.
Гейт его не ловит. Fault injection (`findSchedulerDecisionViolations`, 9 проб, прямой вызов функции из diff):

| # | проба | категория | результат |
|---|---|---|---|
| 1 | `offsetMs: offsetMinutes * 60 * 1000` (дословный фикстур плана) | direct/arithmetic | **NOT KILLED** — `[]` |
| 2 | `let offsetMs = 900000; ({ offsetMs: offsetMs })` | alias (let, не const) | **NOT KILLED** — `[]` |
| 3 | `const a=15;const b=a;const c=b;({offsetMinutes:c})` | alias (const-чейн) | killed — обнаружено |
| 4 | `'Напомина' + 'ние: приём'` в поле `text` | dynamic (конкатенация) | **NOT KILLED** — `[]` |
| 5 | `job.offsetMs = 900000` (не объектный литерал) | dynamic (assignment-expr) | **NOT KILLED** — `[]` |
| 6 | `job[key] = 900000`, `key='offsetMs'` | dynamic (bracket) | **NOT KILLED** — `[]` |
| 7 | `if (['visit','followup'].includes(rule.reminderKind))` | dynamic (не `===`) | **NOT KILLED** — `[]` |
| 8 | `` db.raw(`select * from public.system_settings`) `` (тег не `sql`) | dynamic (нестандартный тег) | **NOT KILLED** — `[]` |
| 9 | `import { X } from '../shared/c.js'; ({text: X})` | re-export | не поймано — **но это признанная граница самого плана** («Решение, спрятанное в модуль вне списка путей и импортированное, гейт не поймает», Ш0.1) — не новая находка |

**6 из 9 достижимых проб не пойманы** (probe 9 — задокументированная и принятая границa, не считается). Пробы 1, 4,
5, 6, 7, 8 — реалистичные формы того же самого нарушения, против которого гейт написан (буквальные примеры из
`bookingLifecycleRoute.ts`), просто чуть иначе оформленные (арифметика вместо голого литерала, `let` вместо `const`,
конкатенация вместо литерала, присваивание вместо объектного литерала, `.includes()` вместо `===`, нестандартный
sql-тег). Самотесты, добавленные этим же коммитом (`schedulerDecisionGuard.test.ts`), тестируют более слабую
фикстуру (`const offset = 15; { offsetMinutes: offset }`), а не мандатную `offsetMinutes * 60 * 1000` — то есть
несоответствие гейта плану прошло бы мимо любой проверки «тесты зелёные».

**Фикс:** минимум — научить `resolvesToLiteral` разворачивать простую арифметику (`*`, `+`) над литералами/константами
и убрать ограничение «только `const`» для алиасов; научить `isMessageProperty`+`expressionHasRussianText` видеть
`BinaryExpression`-конкатенацию; ловить `job.field = literal`/`job['field'] = literal`; расширить `hasLiteralComparison`
на `.includes()`/`.some()` над бизнес-полем. Самотесты обязаны включать дословный фикстур плана.

---

## Находка 3 (MUST FIX) — гонка «уже забрано (`processing`) + правка без смены `remind_at`» доставляет устаревший payload

`eventId` строится только из `taskId` + `remindAt` + `channel` (не из `title`/`description`). Если владелец меняет
только заголовок задачи, `remind_at` не меняется → `event_id` совпадает со старым. `enqueueReady()` обновляет payload
через `ON CONFLICT (event_id) DO UPDATE … WHERE status IN ('pending','failed_retryable')` — предикат НЕ включает
`processing`; при недостижении WHERE Postgres молча пропускает и INSERT, и UPDATE (ведёт себя как `DO NOTHING`).
`update()` следом вызывает `terminalizeUnsentSpecialistTaskReminders(..., exceptEventIds: [тот же event_id])` —
строка исключена из терминализации, потому что новый и старый `event_id` совпали. Итог: строка, которую в этот
момент уже вычитал воркер (`status='processing'`, старый `payload_json` в памяти воркера), не обновляется и не
терминализируется — уйдёт со старым заголовком.

**Live-доказательство** (тот же throwaway PostgreSQL): создал задачу («OLD TITLE», `remind_at=T`) через реальный
`createPgSpecialistTasksPort` → одна `pending`-строка. Вручную выполнил `UPDATE … SET status='processing'`
(та же SQL-форма, которой `claimDueOutgoingDeliveries` реально забирает строку). Вызвал реальный `port.update()`
с новым заголовком («NEW TITLE»), `remind_at` не менял. Строка после: `status='processing'`,
`payload_json` содержит «OLD TITLE», не содержит «NEW TITLE» — старый payload переживает правку и уйдёт как есть.

Прямое нарушение пункта брифа «update/cancel/delete cannot deliver stale intent» / «старый payload не уходит» —
именно для этого узкого, но детерминированного (не таймингового) окна.

**Фикс:** либо делать `event_id` чувствительным к содержимому (не только к `remind_at`), либо расширить
`onConflictDoUpdate`'s `WHERE` и `terminalizeUnsentSpecialistTaskReminders`'s исключение так, чтобы `processing`-строка
с изменившимся содержимым всегда терминализировалась (а не молча выживала под старым `event_id`), даже когда
`remind_at` не менялся.

---

## Находка 4 (MUST FIX, механический gate) — webapp `tsc --noEmit` красный на файле этого же диффа

```
src/modules/specialist-tasks/prepareReminderDeliveries.test.ts(41,69): error TS2345:
  Argument of type 'string | null' is not assignable to parameter of type 'string | number | boolean'.
```
`encodeURIComponent(task.remindAt)` — `SpecialistTaskRow.remindAt` типизирован как `string | null`. Требуемый
«оба typecheck» gate не проходит на самом диффе; тест дальше по логике при этом зелёный (`vitest` не типизирует),
поэтому unit-прогон эту красноту не ловит и её легко пропустить, ориентируясь только на `vitest`.

**Фикс:** `encodeURIComponent(task.remindAt ?? '')` или эквивалент, как уже сделано в самом продуктовом коде
(`prepareReminderDeliveries.ts`'s `eventId()`).

---

## Не найдено нарушений (проверено и закрыто)

- **Атомарность create/update.** Fault injection: заставил второй `enqueueReady()` внутри `create()` упасть
  (throwaway CHECK-констрейнт на `channel`) — весь `db.transaction()` откатился, ни `specialist_tasks`, ни
  `outgoing_delivery_queue` строк не осталось. PASS.
- **Дедуп write-producer + legacy tick.** Создал задачу (write-producer path, 1 строка) → тут же вызвал
  `enqueueDueReminders()` (legacy tick path) на ту же задачу → строка осталась ровно одна (тот же `event_id`,
  `ON CONFLICT`). PASS.
- **Reschedule/delete терминализация (pending/dead случаи).** Reschedule: старая `pending`-строка стала `dead`,
  новая `pending`-строка на новый `remind_at` создана, ровно одна. Delete: `pending`-строка стала `dead`. PASS —
  see Находка 3 для единственного не закрытого угла (гонка с `processing`).
- **Worker: retry/dead semantics, отсутствие продуктовых решений.** Реальный `outgoingDeliveryWorker.scope.test.ts`
  из диффа (9/9 тестов зелёные): `specialist_task_reminder` доставляется без чтения бизнес-полей, retryable-ошибка
  остаётся durable (`rescheduled`), permanent уходит в `quarantined`/dead, а не «второй канон» вроде `reminder_sent_at`.
  Чтением кода подтверждено: новая ветка `GENERIC_TRANSPORT_QUEUE_KINDS` в `outgoingDeliveryWorker.ts` включена
  ПОСЛЕ `resolveOutgoingDeliveryScope`/tenant-quarantine, то есть новый kind проходит тот же fail-closed scope-гейт,
  что и остальные kinds, а не в обход него.
- **Fail-closed tenant scope для НОВОГО kind.** `prepareSpecialistTaskReminderDeliveries()` возвращает `[]`, если
  `task.organizationId` не задан — по построению каждая `specialist_task_reminder`-строка несёт `organization_id`;
  функция резолюции коротко замыкает на нём (`stored_organization_id IS NOT NULL → tenant`). Существующие
  producers (без `organization_id`) продолжают идти через прежний per-kind резолвер без изменений — не сломаны.
- **Вторая очередь/дублирующий repository.** Единственный новый write-port — `pgOutgoingDeliveryQueue.ts` поверх
  существующей `public.outgoing_delivery_queue`; ни новой таблицы, ни новой Drizzle-схемы очереди в диффе нет
  (`grep outgoing_delivery_queue|message_retry_jobs apps/webapp/db/schema/*.ts` — только существующие объекты).
- **Journal-gate.** `9999_d30_specialist_task_delivery_queue_local.sql` отсутствует в
  `apps/webapp/db/drizzle-migrations/meta/_journal.json` (проверено grep по точному tag). Обход в
  `check-drizzle-journal-sync.sh` узко завязан на `base == 9999_*` И первую строку файла (маркер
  `-- TEMPORARY HIGH LOCAL NUMBER`) — не открывает произвольный обход для других номеров. Тот же паттерн уже
  используется `0312` («TEMPORARY LOCAL MIGRATION NUMBER 0312») — устоявшаяся конвенция репозитория, а не новинка
  этого диффа. Постоянная лазейка не создана; но сам bypass-блок в скрипте не самоуничтожается — лиду при land
  предстоит убрать его вместе с переносом номера/journal-записи, как и требует бриф; отдельным MUST FIX не считаю,
  т.к. это явно описанное ожидание брифа, а не находка.
- **D18 projection-health / raw-SQL boundary, identity D25–D29, CMS/tariffs/billing.** Список файлов диффа
  (`git show 2e30f3b90 --name-only`) не содержит путей этих областей; `check-no-new-raw-sql.mjs` — OK.

## Прогнанные команды

```
# integrator
cd apps/integrator && node_modules/.bin/vitest run src/infra/runtime/scheduler/schedulerDecisionGuard.test.ts
cd apps/integrator && node_modules/.bin/vitest run src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts
cd apps/integrator && node_modules/.bin/vitest run src/infra/runtime/scheduler/ src/infra/runtime/worker/ src/infra/db/repos/outgoingDeliveryQueue
  → 7 files / 45 tests PASS (targeted; excludes deleted audit-scratch file)
cd apps/integrator && node_modules/.bin/tsc --noEmit                              → exit 0
cd apps/integrator && ../../node_modules/.bin/eslint src/infra/db/repos/outgoingDeliveryQueue.ts src/infra/delivery/deliveryContract.ts \
  src/infra/runtime/scheduler/schedulerDecisionGuard.ts src/infra/runtime/scheduler/schedulerDecisionGuard.test.ts \
  src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.ts
                                                                                     → clean
cd apps/integrator && node ../../scripts/check-queue-port-boundary.mjs             → OK
pnpm run check:d30-scheduler-lock-concurrency                                      → PASS (piece 1, piece 2)
pnpm run check:d30-outgoing-delivery-claim-concurrency                             → PASS (piece 4a, 4b, 4c)

# webapp
cd apps/webapp && node_modules/.bin/vitest run src/modules/specialist-tasks/       → 1 file / 2 tests PASS
cd apps/webapp && node_modules/.bin/tsc --noEmit
  → FAIL: prepareReminderDeliveries.test.ts(41,69) TS2345 (находка 4)
cd apps/webapp && node_modules/.bin/eslint <11 touched files>                      → clean
cd apps/webapp && bash scripts/check-drizzle-journal-sync.sh                       → OK
cd apps/webapp && node ../../scripts/check-no-new-raw-sql.mjs                      → OK (integrator 7 / webapp 20 manifest files)

# repo root
git diff --check 2e30f3b90^..2e30f3b90 -- .                                        → exit 0, no output
```

## Fault injection (disposable PostgreSQL, throwaway — не DEV/TEST/PROD)

Приватный кластер PostgreSQL 16 под `/tmp` (`initdb -A trust --no-locale`, unix-socket-only), одноразовая база,
поднят и остановлен в рамках проверки (`pg_ctl … stop`, каталог удалён). DDL — минимальный слепок реальных таблиц
(`public.specialist_tasks`, `public.outgoing_delivery_queue`, `public.reminder_rules`,
`integrator.user_reminder_rules`, `integrator.user_reminder_occurrences`); функции `app.resolve_outgoing_delivery_scope`
скопированы дословно из `0312_...sql` и `9999_...sql`. Реальные Drizzle-порты под аудитом
(`createPgSpecialistTasksPort`, `createPgOutgoingDeliveryQueueWritePort`) импортированы из исходников и вызваны
напрямую — не переписаны и не замоканы. Один throwaway CHECK-констрейнт (`channel <> 'FORCE_FAIL'`) использован
как контролируемый триггер сбоя queue-write для проверки атомарности (эквивалент любого реального сбоя записи —
constraint violation, обрыв соединения). Скрипт и добавленный `.auditscratch.test.ts` с 9 пробами гейта —
audit-only, оба удалены после прогона (`git status` — чистое дерево, см. ниже).

## Уборка

Все audit-only файлы (`apps/webapp/scripts/audit-d30-specialist-task-delivery.mjs`,
`apps/integrator/src/infra/runtime/scheduler/schedulerDecisionGuard.auditscratch.test.ts`) удалены после прогона.
DEV/TEST/PROD не затронуты — вся live-проверка шла на приватном throwaway-кластере. `git status` перед коммитом
этого отчёта — чистое дерево кроме самого отчёта.

## Итог

**MUST FIX** — четыре находки (регрессия D21-резолюции, слабый `schedulerDecisionGuard` против собственного
мандатного фикстура и большинства dynamic/alias обходов, гонка stale-payload при `processing`+без-смены-`remind_at`,
красный webapp typecheck). Атомарность, дедуп, tenant fail-closed для нового kind, worker retry/dead semantics,
единая очередь и journal-gate — подтверждены, повторного blind-аудита той же поверхности после фикса не требуется
(§24.5/24.6) — воркер чинит по этому отчёту, оркестратор проверяет итоговый diff и прогоняет тот же набор команд
до зелёного.
