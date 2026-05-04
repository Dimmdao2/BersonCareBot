# AUDIT_DEFER_CLOSURE_GLOBAL — ASSIGNMENT_CATALOGS_REWORK (defer-wave D1–D6)

**Дата:** 2026-05-04  
**Источники:** [`DEFER_CLOSURE_MASTER_PLAN.md`](DEFER_CLOSURE_MASTER_PLAN.md), [`STAGE_D6_PLAN.md`](STAGE_D6_PLAN.md), [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §5 / §7 / §8.2, stage-аудиты D1–D4, [`LOG.md`](LOG.md).

---

## 1. Verdict

| Критерий | Статус |
|----------|--------|
| **Итог defer-wave (D1–D4 + фиксация D5 + D6)** | **PASS** |
| **Открытые critical/major по D1–D4** | **Нет** (stage-аудиты PASS / закрыты FIX) |
| **D5** | **`deferred (owner pause, 2026-05-04)`** — допустимое закрытие D6 по [`STAGE_D6_PLAN.md`](STAGE_D6_PLAN.md); **`AUDIT_STAGE_D5.md` отсутствует** (ожидаемо). |
| **Продуктовый план §5/§7/§8.2 vs код** | **Согласовано** в пределах явных defer/backlog (§3–§4). |
| **«Не делаем» (publication_status extra, bulk API)** | **Не протекло** (§5). |
| **`DROP clinical_tests.scoring_config`** | **Выполнено в репозитории** (§6). |

**Резidual:** см. §7. Новый объём (D5 после снятия паузы, ops на prod для миграций) — вне этого закрытия.

---

## 2. Сводка этапов D1–D5 и артефакты

| Stage | Статус | Аудит / план |
|-------|--------|----------------|
| **D1** — Q6, доступ к `measure_kinds` | **done** | [`AUDIT_STAGE_D1.md`](AUDIT_STAGE_D1.md) — **PASS** |
| **D2** — Q1, `assessmentKind` в БД | **done** | [`AUDIT_STAGE_D2.md`](AUDIT_STAGE_D2.md) — **PASS** |
| **D3** — Q3, типы рекомендаций в БД | **done** | [`AUDIT_STAGE_D3.md`](AUDIT_STAGE_D3.md) — **PASS** |
| **D4** — Q2, qualitative в инстансе | **done** | [`AUDIT_STAGE_D4.md`](AUDIT_STAGE_D4.md) — **PASS** (включая FIX-D4-L1 2026-05-04) |
| **D5** — Q4, `domain` → `kind` | **`deferred (owner pause)`** | [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md) §0; spike/EXEC не выполнялись; **`AUDIT_STAGE_D5.md`** нет — **не требуется** до выхода из паузы. |

Согласованность с [`DEFER_CLOSURE_MASTER_PLAN.md`](DEFER_CLOSURE_MASTER_PLAN.md) §3 (текущий статус): D1–D4 **done**, D5 **deferred (owner pause)**, D6 закрывается настоящим файлом.

---

## 3. Продуктовый план §5 (открытые вопросы) vs факт

| # | Вопрос (§5) | Ожидание журнала | Факт кода / инициативы | Статус |
|---|-------------|------------------|-------------------------|--------|
| Q1 | `assessmentKind` | Системный справочник БД | D2 + миграция `clinical_assessment_kind`, репозиторий/формы/API | **PASS** |
| Q2 | `qualitative` в инстансе | Общий контур прогресса | D4 + `patientSubmitTestResult` / `maybeCompleteStageFromItems`, FIX-L1 | **PASS** |
| Q3 | `recommendations.domain` / типы | Справочник БД, legacy read tolerant | D3 + `recommendation_type` | **PASS** |
| Q4 | `domain` vs `kind` | До отдельного эпика `domain`, UI «Тип»; опционально `kind` | Колонка **`domain`** в Drizzle [`recommendations.ts`](../../apps/webapp/db/schema/recommendations.ts); D5 **на паузе** — **PASS** как соответствие §8.2 |
| Q5 | UUID-textarea test-sets | Закрыто 2026-05-03 | Вне defer D1–D6; B3 scope — не перепроверялось в этом аудите | **N/A** (вне D-wave) |
| Q6 | `measure_kinds` | Доступ к справочнику | D1 | **PASS** |
| Q7 | Коммент каталога рекомендации | Не вводим отдельно; `bodyMd` | Соответствует продуктовому решению; деталь B7 — вне D-wave | **PASS** |

---

## 4. Продуктовый план §7 (backlog) и §8.2 — явные решения

| Тема (§7 / §8.2) | Проверка | Статус |
|------------------|----------|--------|
| `DROP clinical_tests.scoring_config` | Решение владельца: колонка не нужна | **Выполнено в дереве** — см. §6 |
| `domain` → `kind` | Отложено 2026-05-04 | **Зафиксировано** в §7 ТЗ + `STAGE_D5_PLAN`; код не переименован — **ожидаемо** |
| `publication_status` на exercises / clinical tests / recommendations | **Не вводим** | В [`apps/webapp/db/schema`](../../apps/webapp/db/schema): **`publication_status` только у `test_sets`** ([`clinicalTests.ts`](../../apps/webapp/db/schema/clinicalTests.ts) внутри таблицы `test_sets`); у `tests` и `recommendations` колонки **нет** — **PASS** |
| Отдельный **bulk** API состава контейнеров | **Не планируем** | `rg` по `apps/webapp/src/app/api` — **нет** путей вида `/bulk` для test-sets / шаблонов в смысле отдельного публичного bulk-ресурса — **PASS** (серверные batch-actions внутри существующих маршрутов не считаются нарушением формулировки §8.2) |
| Расширение Playwright/CI E2E | **Не** планируется | Не проверялось изменение CI — **соответствует** §8.2 |

---

## 5. Решения «не делаем» — отсутствие протечек

### 5.1 `publication_status` на упражнениях / клинических тестах / рекомендациях

- **Клинические тесты (`tests`):** в схеме Drizzle — `isArchived`, `scoring`, `assessmentKind`, `bodyRegionId`; **нет** `publication_status` ([`clinicalTests.ts`](../../apps/webapp/db/schema/clinicalTests.ts)).
- **Рекомендации:** **нет** `publication_status` ([`recommendations.ts`](../../apps/webapp/db/schema/recommendations.ts)).
- **Упражнения ЛФК:** в индексированных схемах **нет** `publication_status` (поиск по `apps/webapp/db/schema` — только `test_sets`).

### 5.2 Отдельный bulk API

- Поиск по `apps/webapp/src/app/api`: вхождения **`/bulk`**, **`bulkItems`**, **`bulk-`** — **не найдены** на момент аудита.

---

## 6. `DROP clinical_tests.scoring_config` vs миграции и код

| Проверка | Результат | Evidence |
|----------|-----------|----------|
| Миграция в репозитории | **Есть** | [`0040_drop_tests_scoring_config.sql`](../../apps/webapp/db/drizzle-migrations/0040_drop_tests_scoring_config.sql) — `ALTER TABLE "tests" DROP COLUMN IF EXISTS "scoring_config";` |
| Drizzle-схема `tests` | **Колонки `scoring_config` нет** | [`clinicalTests.ts`](../../apps/webapp/db/schema/clinicalTests.ts) — поле **`scoring`** (JSONB), не `scoring_config` |
| Лог инициативы | **Зафиксировано** | [`LOG.md`](LOG.md) — блок 2026-05-03 (defer-closure code) про DROP и снимок `scoringConfig` из колонки **`scoring`** |

**Ops:** применение миграции на **production** — вне объёма этого аудита; следовать [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) и бэкапам из продуктового §7.

---

## 7. Residual risks / follow-up

| Риск / хвост | Комментарий |
|--------------|-------------|
| **D5** | До снятия **owner pause** spike/Go-No-go не выполнялись; объём переименования `domain`→`kind` неизвестен. |
| **Prod миграции** | Убедиться, что на целевых БД применены миграции ветки defer (в т.ч. `0040`), отдельно от merge в `main`. |
| **Q4 naming** | Пользовательский и кодовый термин `domain` остаётся до этапа D5 или отдельного эпика. |
| **E2E** | Ручной smoke по программе/каталогам остаётся каноном §8.2. |

---

## 8. MANDATORY / follow-up инструкции (post D6)

**Открытых MANDATORY по закрытию defer-wave нет.**

Рекомендуемые **необязательные** следующие шаги (вне обязательного D6):

1. После снятия паузы D5 — spike + gate по [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md).
2. Ops: подтверждение `0040` (и соседних D-миграций) на production.
3. При изменении контрактов — синхронизация [`api.md`](../../apps/webapp/src/app/api/api.md).

---

## 9. Проверки (sanity), выполненные при закрытии D6

Документо-ориентированный аудит; регресс кода не менялся. Выполнено для уверенности в недавно трогавшихся зонах D4:

```bash
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts src/modules/treatment-program/testSetSnapshotView.test.ts
pnpm --dir apps/webapp exec tsc --noEmit
```

Ожидание: **зелёный** vitest/tsc (как при последнем D4 FIX). **Факт 2026-05-04:** vitest **26** passed, `tsc --noEmit` **ok**.

---

## 10. Closure

Defer-wave **D1–D4** закрыта stage-аудитами; **D5** формально зафиксирован как **`deferred (owner pause)`** без `AUDIT_STAGE_D5`; **D6** — настоящий глобальный аудит. Продуктовые ограничения §8.2 по `publication_status` / bulk API **соблюдены**; **`scoring_config`** в схеме приложения **снят**, миграция DROP **в репозитории есть**.
