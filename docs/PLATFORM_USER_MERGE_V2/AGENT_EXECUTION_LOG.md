# Platform User Merge v2 — Agent execution log

Хронология работ по инициативе v2. Формат записи: дата, автор/агент, что сделано, ссылки на PR/коммиты, проверки.

---

## Шаблон записи

```text
### YYYY-MM-DD — краткий заголовок

- Scope: (например Deploy 2 / integrator canonical path)
- Изменения: …
- PR: …
- Проверки: pnpm run ci / vitest … / SQL …
- Риски / follow-up: …
```

---

## 2026-04-09 — Инициализация docs-пакета

- Создана папка `docs/PLATFORM_USER_MERGE_V2/` с MASTER_PLAN, stage-документами, CHECKLISTS, CUTOVER_RUNBOOK, `sql/README` и шаблонами диагностики.
- Обновлены `docs/README.md` и `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` (ссылка на v2).

---

## 2026-04-10 — Stage A v1 stabilization (code + test audit)

- **Scope:** [`STAGE_A_V1_STABILIZATION.md`](STAGE_A_V1_STABILIZATION.md); контекст — [`MASTER_PLAN.md`](MASTER_PLAN.md), [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md), [`../REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md`](../REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md).
- **Runtime-код не менялся** (явных дефектов в путях v1 не выявлено).

### Checks performed

1. Сверка с архитектурным контрактом: ingestion merge-class → `202` + аудит; strict purge / manual merge → отдельные audit actions; UI «Лог операций» / `openAutoMergeConflictCount` описаны в `PLATFORM_USER_MERGE.md` и согласованы с кодом на уровне grep + чтения ключевых файлов.
2. **Audit actions (код):** подтверждена запись `user_purge`, `user_purge_external_retry` в `strictPlatformUserPurge.ts`; `user_merge` в `manualPlatformUserMerge.ts`; `auto_merge_conflict` / `auto_merge_conflict_anomaly` через `conflictAudit.logAutoMergeConflict` в `apps/webapp/src/app/api/integrator/events/route.ts` (`upsertOpenConflictLog` / `writeAuditLog`). UI-фильтры в `AdminAuditLogSection.tsx` включают перечисленные action codes.
3. **503-loop / merge-class ingestion:** в `modules/integrator/events.ts` — `isMergeDomainConflict` + `acceptAfterMergeConflict` → `accepted: true` для `MergeConflictError` / `MergeDependentConflictError` на `user.upserted`, `contact.linked`, `preferences.updated`; для `appointment.record.upserted` — отдельная ветка: конфликт при `ensureClientFromAppointmentProjection` логируется, выставляется `appointmentMergeConflict`, отключаются `findByPhone` / `findByIntegratorId`; внешний `catch` снова прогоняет `acceptAfterMergeConflict`. Телефон для ensure берётся из top-level и `payloadJson.phone` / `phoneNormalized` / `phone_normalized` (как в финальном pass execution log). **`POST` route:** `status = result.accepted ? 202 : retryable === false ? 422 : 503` — совпадает с документацией.
4. **Merge / purge регрессии (статика):** в `pgPlatformUserMerge.ts` сохранён жёсткий запрет «два разных non-null `integrator_user_id`» (`MergeConflictError`); ручной merge с `role === client`, запрет `both` при channel-conflict — по коду на месте (см. также историю финального pass в `STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md`).
5. **Автотесты (целевые):** `vitest` — `events.test.ts`, `strictPlatformUserPurge.test.ts`, `manualPlatformUserMerge.test.ts`, `pgPlatformUserMerge.test.ts`, `integrator/events/route.test.ts` — **5 файлов, 99 тестов, OK**.
6. **Полный `pnpm run ci`:** в первом прогоне — падение на `webapp` typecheck (`MediaCardActionsMenu.tsx`, `asChild`). **Follow-up той же даты:** после исправления в дереве и чистого `apps/webapp/.next` — **полный `pnpm run ci` OK** (см. запись ниже).

### Findings

- Поведение v1 по аудиту, ответам **202** на merge-class конфликты ingestion и защите от ambiguous relink на `appointment.record.upserted` **согласовано** с `PLATFORM_USER_MERGE.md` и с журналом strict purge / manual merge.
- **Hard blocker `different_non_null_integrator_user_id`** остаётся до завершения v2 (integrator-side canonical merge) — явно в коде merge engine и в MASTER_PLAN / архитектурном doc.
- Ограничения v1 из execution log **не пересматривались как новые дефекты:** нет replay `preferences.updated` после конфликта; вызов `handleIntegratorEvent` без `conflictAudit` может дать `accepted: true` без строки в БД (некритичный dev/test path).
- **Прод-эксплуатация** (журнал `bersoncarebot-webapp-prod`, строки `admin_audit_log` на реальном хосте) в этом прогоне **не проверялась** — нет доступа к окружению; рекомендация Stage A для оператора при подозрении на loop остаётся в силе.
- **~~Блокер для «merge PR → CI → deploy»~~** (устранён follow-up той же даты): ранее красный webapp typecheck по `MediaCardActionsMenu.tsx` — **не** регрессия v1 merge/purge; исправление — см. запись «Stage A follow-up» ниже.

### Gate verdict (Stage A — пути v1 merge/purge/conflict)

**PASS** — по репозиторию: экстренный hotfix по v1 merge/purge/conflict path **не выявлен**; целевые тесты v1 зелёные. На момент первой записи полный CI падал на typecheck в `MediaCardActionsMenu.tsx` — **закрыто в follow-up той же даты** (см. запись ниже).

---

## 2026-04-10 — Stage A follow-up: закрытие замечаний AUDIT_STAGE_A (CI)

- **Scope:** только Stage A / [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md) — пункт MANDATORY FIX про webapp typecheck (`MediaCardActionsMenu.tsx`). Пути v1 merge/purge/integrator **не менялись**.
- **Код:** в дереве уже применено исправление без `DropdownMenuItem asChild`: «Открыть в новой вкладке» через `onClick` + `window.open(..., "noopener,noreferrer")` в `apps/webapp/src/app/app/doctor/content/library/MediaCardActionsMenu.tsx` (совместимость с типами `@/components/ui/dropdown-menu` на базе `@base-ui/react`).
- **Проверки:** `pnpm install --frozen-lockfile && pnpm run ci` из корня — **OK** (после `rm -rf apps/webapp/.next`, без параллельного `next build`).
- **Документы:** обновлён [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md) (§1.5, §4, MANDATORY FIX §1 помечен выполненным).
- **Findings:** регрессий v1 PUM нет; операторский контур прод (логи, `admin_audit_log` на хосте) по-прежнему вне автоматического прогона.
- **Gate verdict:** **PASS (repository + CI)** для инженерного критерия Stage A; прод-наблюдение — по [`STAGE_A_V1_STABILIZATION.md`](STAGE_A_V1_STABILIZATION.md).

---

## 2026-04-10 — Stage A повторный аудит (pass 2)

- **Scope:** полная сверка [`STAGE_A_V1_STABILIZATION.md`](STAGE_A_V1_STABILIZATION.md), исправлений первого аудита ([`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md) MANDATORY §1), актуальности [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md) и связанных записей в этом логе.
- **Код (выборочно):** audit actions в `strictPlatformUserPurge.ts` / `manualPlatformUserMerge.ts` / `integrator/events/route.ts`; merge-class → `202` в `events.ts` + `route.ts`; hard blocker integrator id в `pgPlatformUserMerge.ts` (стр. ~120–124) и preview; `MediaCardActionsMenu.tsx` — без `asChild`, `window.open` с `noopener,noreferrer`.
- **Checks performed:** целевой `vitest` (5 файлов v1 PUM / integrator) — **99 passed**; полный **`pnpm run ci`** из корня — **OK**.
- **Findings:** регрессий v1 merge/purge/conflict не обнаружено; документ `AUDIT_STAGE_A.md` обновлён (§1.1, §3, новый §5 pass 2). Прод-хост и `admin_audit_log` на окружении не смотрелись.
- **Gate verdict:** **PASS (repository + CI)**; организационный чекбокс Stage A «команда готова к 4-шаговому деплою» — вне автоматической верификации.

---

## 2026-04-10 — Stage 1: integrator canonical schema (`merged_into_user_id`)

- **Scope:** [`STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md`](STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md) — только DDL integrator + документация схемы.
- **Изменения:** core-миграция `20260410_0001_users_merged_into_user_id.sql` — колонка `users.merged_into_user_id`, FK на `users(id)`, CHECK `IS NULL OR <> id`, partial index `idx_users_merged_into_user_id`; обновлены `apps/integrator/src/infra/db/schema.md`, `docs/ARCHITECTURE/DB_STRUCTURE.md` §1.1.
- **Webapp / blocker:** поведение webapp не менялось; hard blocker `different_non_null_integrator_user_id` **не снимался**.
- **Проверки:** `pnpm install --frozen-lockfile`; `vitest --run` (файлы `writePort.userUpsert.test.ts`, `userLookup.test.ts`) — **5 passed**; полный **`pnpm run ci`** из корня — **OK** (lint, typecheck, integrator 619 tests, webapp tests, build integrator + webapp, `pnpm audit --prod`).
- **Gate verdict:** **PASS (repository + CI)** для Stage 1 schema-only: DDL и доки в репо согласованы; поведение приложений не затронуто.

---

## 2026-04-10 — Stage 1 follow-up: AUDIT_STAGE_1 замечания

- **Scope:** только Stage 1 / закрытие необязательных замечаний из [`AUDIT_STAGE_1.md`](AUDIT_STAGE_1.md) (§3 CHECKLISTS, §4 контекст `STAGE_1`, синхронизация integrator schema dump); runtime webapp и blocker **без изменений**.
- **Документы:** [`STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md`](STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md) — явное разделение схемы до/после Deploy 1; [`CHECKLISTS.md`](CHECKLISTS.md) Deploy 1 — CHECK и имена constraint/index как в миграции; [`integrator_bersoncarebot_dev_schema.sql`](../ARCHITECTURE/DB_DUMPS/integrator_bersoncarebot_dev_schema.sql) — колонка + CHECK + index + FK; [`AUDIT_STAGE_1.md`](AUDIT_STAGE_1.md) — §7 follow-up и отметки об устранении.
- **Проверки:** `vitest --run` (`writePort.userUpsert.test.ts`, `userLookup.test.ts`) — **5 passed**; **`pnpm run ci`** из корня — **OK**.
- **Gate verdict:** **PASS** — замечания аудита закрыты; Stage 1 артефакты согласованы.

---

## 2026-04-10 — Stage 1 повторный аудит (pass 2)

- **Scope:** полная повторная сверка [`AUDIT_STAGE_1.md`](AUDIT_STAGE_1.md) §1–§5, follow-up §7, [`STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md`](STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md), [`CHECKLISTS.md`](CHECKLISTS.md) Deploy 1, [`schema.md`](../../apps/integrator/src/infra/db/schema.md), [`DB_STRUCTURE.md`](../ARCHITECTURE/DB_STRUCTURE.md) §1.1, дамп [`integrator_bersoncarebot_dev_schema.sql`](../ARCHITECTURE/DB_DUMPS/integrator_bersoncarebot_dev_schema.sql), [`MASTER_PLAN.md`](MASTER_PLAN.md) Stage 1.
- **Микроправка в pass 2:** в `STAGE_1` § «Предлагаемый DDL» имя индекса выровнено с репозиторием (`idx_users_merged_into_user_id`).
- **Checks performed:** чтение/сверка файлов + **`pnpm install --frozen-lockfile` && `pnpm run ci`** — **OK** (integrator 619 / webapp 1391 passed).
- **Findings:** несоответствий Stage 1 не выявлено; живой `db:migrate` на хосте в прогоне не выполнялся.
- **Gate verdict:** **PASS (repository + CI)** — см. [`AUDIT_STAGE_1.md`](AUDIT_STAGE_1.md) §8.

---

## 2026-04-10 — Stage 2: canonical read/write path (integrator)

- **Scope:** [`STAGE_2_CANONICAL_READ_WRITE_PATH.md`](STAGE_2_CANONICAL_READ_WRITE_PATH.md) — подготовка путей без merge и без снятия webapp blocker.
- **Код integrator:** `apps/integrator/src/infra/db/repos/canonicalUserId.ts` — разрешение цепочки `users.merged_into_user_id` (лимит глубины, защита от циклов); `resolveCanonicalUserIdFromIdentityId` для payload `identities.id` → канонический `users.id`. `writePort.ts` — перед `enqueueProjectionEvent` канонизация `integratorUserId` (и составных idempotency-ключей с user id); для `support.conversation.opened` / `support.question.created` в payload уходит канонический **users.id** после lookup identity → user. **Guards:** `channelUsers.setUserPhone` — контакт пишется на канонический `user_id`; `writePort` для `reminders.rule.upsert`, `content.access.grant.create`, `mailing.log.append` — доменная запись на канонический user id.
- **Webapp / blocker:** hard blocker `different_non_null_integrator_user_id` **не снимался**.
- **Тесты:** `canonicalUserId.test.ts`; обновлены `writePort.*.test.ts` (моки `users`/`identities`), `channelUsers.test.ts` (`setUserPhone`), `projectionKeys.test.ts` (идемпотентность alias vs winner).
- **Проверки:** `pnpm install --frozen-lockfile` && **`pnpm run ci`** из корня — **OK** (integrator 627 tests, webapp 1391 tests, build, `pnpm audit --prod`).
- **Gate verdict:** **PASS (repository + CI)** для Stage 2 canonical write path + outbox payload/idempotency; webapp blocker не трогался.

---

## 2026-04-10 — Stage 2 follow-up: AUDIT_STAGE_2 §2.2 (support idempotency fingerprint)

- **Scope:** закрытие FINDING из [`AUDIT_STAGE_2.md`](AUDIT_STAGE_2.md) §2.2 в границах Stage 2 (без Stage 3 identity/state).
- **Код:** `hashPayloadExcludingKeys` в `apps/integrator/src/infra/db/repos/projectionKeys.ts`; `writePort.ts` — для `support.conversation.opened` и `support.question.created` fingerprint idempotency без поля `integratorUserId`, payload для webapp полный с каноническим `integratorUserId`.
- **Документы:** обновлён [`AUDIT_STAGE_2.md`](AUDIT_STAGE_2.md) (§2.2 **PASS**, §6 follow-up, MANDATORY §4, §5).
- **Проверки:** `pnpm install --frozen-lockfile` && **`pnpm run ci`** из корня — **OK** (integrator **628** tests, webapp 1391 tests, build, `pnpm audit --prod`).
- **GAP §3.2** (telegram_state / identity alias): намеренно не закрывался — Stage 3.
- **Gate verdict:** **PASS (repository + CI)** для follow-up AUDIT_STAGE_2 §2.2.

---

## 2026-04-10 — Stage 2 pass 2: AUDIT повторный + nested appointment payload

- **Scope:** [`AUDIT_STAGE_2.md`](AUDIT_STAGE_2.md) §7; [`STAGE_2_CANONICAL_READ_WRITE_PATH.md`](STAGE_2_CANONICAL_READ_WRITE_PATH.md) — политика redirect/reject; nested `integrator_user_id` / `integratorUserId` в projection для `appointment.record.upserted`.
- **Код:** `canonicalizeIntegratorUserIdKeysInObject` в `canonicalUserId.ts`; `booking.upsert` — клон `payloadJson` для outbox с канонизацией, `rubitime_records` хранит исходный JSON.
- **Тесты:** `canonicalUserId.test.ts`, `writePort.appointments.test.ts`.
- **Проверки:** `pnpm install --frozen-lockfile` && **`pnpm run ci`** из корня — **OK** (integrator **630** tests, webapp 1391 tests, build, `pnpm audit --prod`).
- **Gate verdict:** **PASS (repository + CI)** для pass 2 Stage 2.

---

## 2026-04-10 — Stage 3: transactional integrator merge + projection_outbox realignment

- **Scope:** [`STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md`](STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md) — merge двух `users.id` в integrator DB, перенос FK, `merged_into_user_id`, политика outbox без нарушения `UNIQUE(idempotency_key)`.
- **Код integrator:** `apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts` — `mergeIntegratorUsers(winnerId, loserId, options)` в одной `db.tx`; блокировка строк `users` через `SELECT … ORDER BY id ASC FOR UPDATE`; перенос `identities` (пары duplicate `(resource, external_id)` → repoint `telegram_state` / `message_drafts` / `conversations` / `user_questions`, удаление loser identity; затем массовый `UPDATE identities.user_id`); дедуп и `UPDATE` для `contacts`, `user_reminder_rules`, `content_access_grants`, `user_subscriptions`, `mailing_logs`; realign `projection_outbox` для **`pending` только** (rewrite payload + пересчёт idempotency по правилам как в `writePort`, при конфликте ключа — `status = 'cancelled'` + `last_error`); финально `UPDATE users SET merged_into_user_id` для loser. `projectionOutboxMergePolicy.ts` — deep replace user id в JSON и `recomputeProjectionIdempotencyKeyAfterMerge` по типам событий (rewrite / dedup; replay через новый ключ при отсутствии коллизии).
- **Тесты:** `projectionOutboxMergePolicy.test.ts`, `mergeIntegratorUsers.test.ts` (lock order, dry-run, dedup ветка).
- **Проверки:** `pnpm install --frozen-lockfile` && **`pnpm run ci`** из корня — **OK** (integrator **642** tests на момент первой поставки; после follow-up — **646**, см. следующий блок).
- **Webapp / blocker:** hard blocker webapp **не снимался**; Stage 4 realignment webapp — отдельно.
- **Gate verdict:** **PASS (repository + CI)** после успешного полного CI (интегратор + webapp + build + audit).

---

## 2026-04-10 — Stage 3 follow-up: AUDIT_STAGE_3 MANDATORY §1–§5

- **Scope:** [`AUDIT_STAGE_3.md`](AUDIT_STAGE_3.md) — закрытие FINDING/GAP первоначального аудита; только integrator Stage 3.
- **Код:** `mergeIntegratorUsers` — идемпотентный no-op при `loser.merged_into_user_id === winner` (`alreadyMerged: true`); ошибка, если loser указывает на **другого** пользователя. Outbox realign — только `pending`; расширенный отбор строк через `payload::text LIKE` для quoted `integratorUserId` / `integrator_user_id`. JSDoc merge + обновления [`STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md`](STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md). `projectionHealth.ts` + `scripts/projection-health.mjs` — поле **`cancelledCount`** (отдельно от `dead`; gate не деградирует только из‑за cancelled).
- **Документы:** [`AUDIT_STAGE_3.md`](AUDIT_STAGE_3.md) §10 follow-up; [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) Deploy 3; [`CHECKLISTS.md`](CHECKLISTS.md) Deploy 3.
- **Тесты:** `mergeIntegratorUsers.test.ts` (alreadyMerged / wrong-alias), `projectionHealth.test.ts` (`cancelledCount`, degraded не от cancelled).
- **Проверки:** `pnpm install --frozen-lockfile` && **`pnpm run ci`** из корня — **OK** (integrator **646** tests, webapp **1391** tests, build, `pnpm audit --prod`).
- **Gate verdict:** **PASS (repository + CI)** после зелёного полного CI.

---

## 2026-04-10 — Stage 4: webapp projection realignment (integrator_user_id)

- **Scope:** [`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md) — после integrator merge перепривязать webapp projection-таблицы с `integrator_user_id` с loser на winner; gate — ноль строк с loser id.
- **SQL (webapp):** [`sql/preview_webapp_realignment_collisions.sql`](sql/preview_webapp_realignment_collisions.sql), [`sql/realign_webapp_integrator_user_id.sql`](sql/realign_webapp_integrator_user_id.sql); обновлён [`sql/README.md`](sql/README.md) (job-скрипт, шаги gate evidence).
- **Код webapp:** `apps/webapp/scripts/realign-webapp-integrator-user-projection.ts` + `pnpm realign-webapp-integrator-user`; `apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts` + unit-тесты.
- **Стратегия:** rekey через `UPDATE` для всех целевых таблиц; перед этим `DELETE` loser-строк, дублирующих `(winner, topic)` / `(winner, mailing)` на `user_subscriptions_webapp` и `mailing_logs_webapp` (как dedup в integrator `mergeIntegratorUsers`). `support_questions` / `support_question_messages` — только через `conversation_id`, отдельного столбца `integrator_user_id` нет.
- **Проверки:** `pnpm install --frozen-lockfile` && **`pnpm run ci`** из корня — **OK** (integrator **646** tests, webapp **1394** tests, build, `pnpm audit --prod`).
- **Gate verdict:** **PASS (repository + CI)** для Stage 4 артефактов (SQL + job + тесты парсинга/инвентаря таблиц).

---

## 2026-04-10 — Stage 4 follow-up: AUDIT_STAGE_4 §3 (единый gate SQL)

- **Scope:** только Stage 4 / закрытие GAP из [`AUDIT_STAGE_4.md`](AUDIT_STAGE_4.md) §3 — дублирование UNION между `diagnostics_webapp_integrator_user_id.sql` и job.
- **Код:** `WEBAPP_INTEGRATOR_USER_ID_GATE_TABLE_SPECS`, `buildWebappLoserIntegratorUserIdGateUnionSql` / `buildWebappLoserIntegratorUserIdDiagnosticsSqlNodePg`, `fullDiagnosticsWebappIntegratorUserIdSqlFileContent` в `webappIntegratorUserProjectionRealignment.ts`; `realign-webapp-integrator-user-projection.ts` использует билдер; vitest сверяет файл в `docs/.../sql/` с каноническим содержимым + равенство множеств gate/update таблиц.
- **Документы:** обновлены [`AUDIT_STAGE_4.md`](AUDIT_STAGE_4.md) (§3, §5, §6 MANDATORY §2, §8 follow-up), [`sql/README.md`](sql/README.md).
- **Проверки:** `pnpm install --frozen-lockfile` && **`pnpm run ci`** из корня — **OK** (integrator **646** tests, webapp **1397** tests, build, `pnpm audit --prod`).
- **Gate verdict:** **PASS (repository + CI)** для follow-up AUDIT Stage 4.

---

## 2026-04-10 — Stage 3 / Stage 4: закрытие док-хвостов (спеки + runbook + чеклисты)

- **Scope:** сверка выполнения Stage 3–4 в репозитории с документами; без изменения runtime-кода merge/realignment.
- **Документы:** [`STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md`](STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md) — блок «Реализация в репозитории» (пути к `mergeIntegratorUsers`, `projectionOutboxMergePolicy`, projection health); [`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md) — актуальные SQL/job, уточнение support questions, gate через diagnostics; [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) Deploy 3 — пошаговый webapp realignment + gate; [`CHECKLISTS.md`](CHECKLISTS.md) Deploy 3 — конкретные пути; [`README.md`](README.md) пакета — ссылки на AUDIT_STAGE_3/4 и Stage 4 код; [`AUDIT_STAGE_3.md`](AUDIT_STAGE_3.md) / [`AUDIT_STAGE_4.md`](AUDIT_STAGE_4.md) §6 — число webapp tests **1397** (монорепо).
- **Проверки:** `pnpm --dir apps/integrator exec vitest run` — **646** passed; `pnpm --dir apps/webapp exec vitest run` — **1397** passed; полный **`pnpm run ci`** из корня — **OK** (lint, typecheck, build, `pnpm audit --prod`).
