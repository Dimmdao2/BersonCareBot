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
