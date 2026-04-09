# Audit — Stage A (v1 stabilization before v2)

**Дата первичного аудита:** 2026-04-10  
**Follow-up (закрытие замечаний AUDIT):** 2026-04-10 — MANDATORY FIX §1 (`MediaCardActionsMenu` / typecheck) закрыт; полный **`pnpm run ci`** — **OK**.  
**Повторный аудит (pass 2):** 2026-04-10 — полная сверка пунктов Stage A, правок первого аудита и документации; см. [§5](#5-повторный-аудит-stage-a-pass-2).  
**Источник требований:** [`STAGE_A_V1_STABILIZATION.md`](STAGE_A_V1_STABILIZATION.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md)

---

## 1) Evidence: v1 стабилен перед v2

### 1.1 Журнал агента (каноническая запись Stage A)

В [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) есть полная запись **«2026-04-10 — Stage A v1 stabilization (code + test audit)»** плюс **«Stage A follow-up»** и запись **повторного аудита** (pass 2), с:

- перечнем **Checks performed** (audit actions, 503 vs 202, merge/purge статика, тесты, `pnpm run ci`);
- **Findings** (согласованность с архитектурой, ограничения v1, отсутствие прод-проверки; первый прогон CI падал на typecheck — устранено follow-up и подтверждено pass 2);
- **Gate verdict: PASS** для путей v1 merge/purge/conflict; полный CI зелёный после follow-up и повторно в pass 2.

Эта запись — основной **репозиторный** evidence по Stage A.

### 1.2 История инициативы strict purge / manual merge

[`../REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md`](../REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md) фиксирует поэтапную реализацию v1, финальные правки (client-only merge, channel conflict, email_verified_at, appointment phone из `payloadJson`, DB-only `media_files` в preflight, audit artifact для retry) и прогоны тестов. Это вторичный evidence: **дизайн и регрессии v1 документированы и закрыты в коде**.

### 1.3 Согласование кода с контрактом ingestion

| Требование Stage A / архитектуры | Где подтверждено |
|----------------------------------|------------------|
| Merge-class (`MergeConflictError` / `MergeDependentConflictError`) → не бесконечный **503** | `apps/webapp/src/modules/integrator/events.ts` — `acceptAfterMergeConflict`; production `apps/webapp/src/app/api/integrator/events/route.ts` — `conflictAudit` + **HTTP 202** при `result.accepted` |
| `appointment.record.upserted` без ambiguous fallback после конфликта | `events.ts`: `appointmentMergeConflict`, отключение `findByPhone` / `findByIntegratorId`; телефон из top-level и `payloadJson` |
| Аудит конфликтов | `route.ts`: `upsertOpenConflictLog` / `writeAuditLog` для `auto_merge_conflict` / `auto_merge_conflict_anomaly` |

### 1.4 Автотесты (целевой набор v1)

На момент аудита прогонялись и проходили **5 файлов, 99 тестов**:

- `src/modules/integrator/events.test.ts`
- `src/infra/strictPlatformUserPurge.test.ts`
- `src/infra/manualPlatformUserMerge.test.ts`
- `src/infra/repos/pgPlatformUserMerge.test.ts`
- `src/app/api/integrator/events/route.test.ts`

Команда (из корня репозитория):

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/integrator/events.test.ts \
  src/infra/strictPlatformUserPurge.test.ts \
  src/infra/manualPlatformUserMerge.test.ts \
  src/infra/repos/pgPlatformUserMerge.test.ts \
  src/app/api/integrator/events/route.test.ts
```

### 1.5 Ограничения evidence (честно)

- **Production:** строки `admin_audit_log`, журнал `bersoncarebot-webapp-prod`, разбор открытых `auto_merge_conflict` на хосте в этом аудите **не проверялись** (нет доступа к окружению). Stage A рекомендует оператору смотреть UI «Лог операций» и логи при подозрении на loop — это остаётся **обязательным операционным слоем**, не заменяемым только код-ревью.
- **Полный CI:** после закрытия замечания AUDIT (замена недопустимого `DropdownMenuItem asChild` на `onClick` + `window.open` в `MediaCardActionsMenu.tsx`, совместимо с `@base-ui/react` `Menu.Item`) **`pnpm run ci` проходит** на чистом `apps/webapp/.next` (избегать параллельного `next build` и «битого» кэша — иначе возможны lock/ENOENT; это ограничение окружения, не v1 PUM).

**Вывод по п.1:** Evidence v1 стабильности **достаточен на уровне репозитория + целевых тестов + зелёного полного CI**; **недостаточен** только для полного operational sign-off без прод-наблюдения (п.2 MANDATORY FIX).

---

## 2) Blocker `different_non_null_integrator_user_id` до v2 — явно зафиксирован

### 2.1 Документация

| Документ | Формулировка |
|----------|--------------|
| [`STAGE_A_V1_STABILIZATION.md`](STAGE_A_V1_STABILIZATION.md) | Явно: hard blocker **остаётся до завершения v2** |
| [`MASTER_PLAN.md`](MASTER_PLAN.md) | v1 запрещает merge при разных non-null `integrator_user_id` (`different_non_null_integrator_user_id`); v2 снимает разрыв через integrator-side canonical merge |
| [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md) | Таблица hard blockers: код `different_non_null_integrator_user_id`, снятие **только в v2** |
| [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) (2026-04-10) | Findings: blocker остаётся до v2, согласован с кодом и MASTER_PLAN |

### 2.2 Код (исполняемый контракт)

**Merge engine** — выброс `MergeConflictError`, если оба `integrator_user_id` non-null и различны:

```120:124:apps/webapp/src/infra/repos/pgPlatformUserMerge.ts
  const iA = a.integrator_user_id?.trim() || null;
  const iB = b.integrator_user_id?.trim() || null;
  if (iA && iB && iA !== iB) {
    throw new MergeConflictError("merge: two different non-null integrator_user_id", [targetId, duplicateId]);
  }
```

*(Номера строк — на момент повторного аудита; при сдвигах искать по тексту ошибки и условию `iA && iB`.)*

**Preview (admin UI)** — тот же смысл под кодом `different_non_null_integrator_user_id`:

```274:282:apps/webapp/src/infra/platformUserMergePreview.ts
  const iT = normStr(target.integrator_user_id);
  const iD = normStr(duplicate.integrator_user_id);
  if (iT != null && iD != null && iT !== iD) {
    hardBlockers.push({
      code: "different_non_null_integrator_user_id",
      message:
        "Both users have different non-null integrator_user_id — merge blocked (phantom user / projection risk).",
      details: { targetIntegratorUserId: iT, duplicateIntegratorUserId: iD },
    });
  }
```

**Тесты:** `pgPlatformUserMerge.test.ts`, `platformUserMergePreview.test.ts`, `adminMergeAccountsLogic.test.ts` (см. grep по репозиторию).

**Вывод по п.2:** Blocker **тройной фиксации** — продуктовые доки, архитектурный doc, merge engine + preview + тесты. Снятие возможно только после **v2** (integrator canonical merge + согласованный webapp flow по MASTER_PLAN).

---

## 3) `AGENT_EXECUTION_LOG.md` — полнота записи Stage A

Проверено наличие **всех** ожидаемых элементов в записи от **2026-04-10**:

| Элемент | Статус |
|---------|--------|
| Scope и ссылки на Stage A / MASTER_PLAN / PLATFORM_USER_MERGE / execution log | OK |
| **Checks performed** (нумерованный список) | OK |
| **Findings** (включая blocker до v2, ограничения v1, прод не проверялся, CI) | OK |
| **Gate verdict** | OK (PASS; CI — зелёный после follow-up, подтверждён pass 2) |
| Запись **follow-up** (CI / `MediaCardActionsMenu`) | OK |
| Запись **повторного аудита** pass 2 | OK (после добавления в `AGENT_EXECUTION_LOG`) |

**Вердикт по п.3:** записи **полные** относительно целей Stage A в репозитории (первичный аудит + follow-up + pass 2).

---

## 4) Итоговый verdict аудита Stage A

| Критерий | Статус |
|----------|--------|
| Evidence стабильности v1 (код + тесты + журналы в repo + полный CI) | **Удовлетворён**, оговорка: прод-наблюдение оператором |
| Явная фиксация `different_non_null_integrator_user_id` до v2 | **Удовлетворён** |
| Полная запись в `AGENT_EXECUTION_LOG.md` | **Удовлетворён** |

**Общий verdict:** **PASS (repository + CI)** — v1 merge/purge/conflict регрессий не выявлено; полный CI зелёный после закрытия typecheck-замечания. Остаётся операторский контур Stage A на проде (MANDATORY FIX п.2). **Подтверждено повторным аудитом (§5).**

---

## 5) Повторный аудит Stage A (pass 2)

**Дата:** 2026-04-10. **Цель:** проверить все пункты [`STAGE_A_V1_STABILIZATION.md`](STAGE_A_V1_STABILIZATION.md), исправления после первого аудита и согласованность `AUDIT_STAGE_A.md` / `AGENT_EXECUTION_LOG.md` с деревом.

### 5.1 Чек-лист против Stage A

| Пункт Stage A | Проверка (pass 2) | Результат |
|---------------|-------------------|-----------|
| Сигналы `user_purge`, `user_merge`, `user_purge_external_retry` в коде / UI | `strictPlatformUserPurge.ts`, `manualPlatformUserMerge.ts`; dropdown действий в `AdminAuditLogSection.tsx` | OK |
| `auto_merge_conflict`, `auto_merge_conflict_anomaly`, `openAutoMergeConflictCount` | `integrator/events/route.ts` + `adminAuditLog.ts`; бейдж в `AdminAuditLogSection.tsx` | OK |
| Ingestion merge-class → не 503-loop, **202** + аудит | `events.ts` (`acceptAfterMergeConflict`, `appointmentMergeConflict`); `route.ts` строка статуса `202` при `accepted` | OK |
| Фиксация результата в журнале | `AGENT_EXECUTION_LOG.md` — три связанные записи (первичный, follow-up, pass 2) | OK |
| Явно: **hard blocker `different_non_null_integrator_user_id` до v2** | `STAGE_A_V1_STABILIZATION.md` §фиксация; `PLATFORM_USER_MERGE.md`; `pgPlatformUserMerge.ts` + preview | OK |
| Gate: нет экстренного hotfix по v1 merge/purge/conflict | Статический обзор + тесты + CI — новых дефектов не найдено | OK (repo) |
| Gate: команда готова к 4-шаговому деплою | Организационный критерий | **Вне scope репозитория** — подтверждает команда |

### 5.2 Правки первого аудита (MANDATORY FIX §1)

| Ожидание | Факт в дереве |
|----------|----------------|
| Нет `DropdownMenuItem asChild` для «Открыть в новой вкладке» | `MediaCardActionsMenu.tsx`: `onClick` → `window.open(..., "noopener,noreferrer")` | OK |
| Webapp typecheck / полный CI | `pnpm install --frozen-lockfile && pnpm run ci` из корня — **OK** (pass 2) | OK |

### 5.3 Документация (дрифт после первого аудита)

| Документ | Действие pass 2 |
|----------|-----------------|
| `AUDIT_STAGE_A.md` §1.1 | Уточнены формулировки (не оставлять «красный CI» как текущее состояние без контекста); добавлены pass 2 и ссылка на §5 |
| `AUDIT_STAGE_A.md` §3 | Таблица дополнена строками follow-up и pass 2 |
| `AUDIT_STAGE_A.md` §2.2 | Примечание о номерах строк при сдвигах |
| `AGENT_EXECUTION_LOG.md` | Новая запись «повторный аудит pass 2» |

### 5.4 Автоматические проверки (pass 2)

- Целевой набор v1 (5 файлов): **99 тестов, OK**.
- Полный **`pnpm run ci`**: **OK** (lint, typecheck, integrator + webapp tests, build, `audit --prod`).

### 5.5 Verdict pass 2

**PASS (repository + CI)** — совпадает с §4; расхождений с кодом не выявлено. **Production / операторский контур** по-прежнему не верифицировался автоматически (MANDATORY FIX §2).

---

## MANDATORY FIX INSTRUCTIONS

1. **~~Восстановить зелёный `pnpm run ci` (webapp typecheck).~~ — ВЫПОЛНЕНО в дереве**  
   - **Файл:** `apps/webapp/src/app/app/doctor/content/library/MediaCardActionsMenu.tsx`  
   - **Решение:** пункт «Открыть в новой вкладке» — `DropdownMenuItem` с `onClick` → `window.open(item.url, "_blank", "noopener,noreferrer")` (без `asChild`; UI-kit — `@base-ui/react` `Menu.Item` через обёртку проекта).  
   - **Проверка:** `pnpm install --frozen-lockfile && pnpm run ci` из корня — **OK** (follow-up 2026-04-10). При локальных сбоях `next build` сначала удалить `apps/webapp/.next` и не запускать два `next build` параллельно.

2. **Операционный контур Stage A (если ещё не закрыт).**  
   - Разобрать открытые `auto_merge_conflict` по политике продукта.  
   - При подозрении на 503-loop: логи webapp-prod + сверка с `events.ts` / `integrator/events/route.ts`.  
   - Убедиться, что новые классы ошибок strict purge / manual merge сопровождаются записями в `admin_audit_log` (см. [`STAGE_A_V1_STABILIZATION.md`](STAGE_A_V1_STABILIZATION.md)).

3. **Не снимать** hard blocker `different_non_null_integrator_user_id` в webapp до завершения соответствующего этапа v2 (integrator DDL + canonical merge + realignment + feature flag по MASTER_PLAN). Любой PR, ослабляющий этот guard без v2, считается **недопустимым**.

---

## Ссылки

- [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md)  
- [`STAGE_A_V1_STABILIZATION.md`](STAGE_A_V1_STABILIZATION.md)  
- [`MASTER_PLAN.md`](MASTER_PLAN.md)  
- [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md)  
- [`../REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md`](../REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md)
