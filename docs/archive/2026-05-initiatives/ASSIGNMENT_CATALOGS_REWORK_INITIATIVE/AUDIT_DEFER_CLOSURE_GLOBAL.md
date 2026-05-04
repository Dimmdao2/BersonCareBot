# AUDIT_DEFER_CLOSURE_GLOBAL — ASSIGNMENT_CATALOGS_REWORK (defer-wave D1–D6)

**Дата первичного D6:** 2026-05-04  
**Последнее обновление (финальная сверка PROMPTS D6 — AUDIT):** 2026-05-04  
**Последний FIX (PROMPTS D6 — FIX):** 2026-05-04  

**Именованный вход к этапу 6:** [`AUDIT_STAGE_D6.md`](AUDIT_STAGE_D6.md) — краткий указатель; полный текст аудита — **ниже в этом документе**.

**Источники свода:** stage-аудиты [`AUDIT_STAGE_D1.md`](AUDIT_STAGE_D1.md) … [`AUDIT_STAGE_D4.md`](AUDIT_STAGE_D4.md); [`LOG.md`](LOG.md) (записи D1–D4, D4 FIX, D6); продуктовый план [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §5 / §7 / §8.2; [`DEFER_CLOSURE_MASTER_PLAN.md`](DEFER_CLOSURE_MASTER_PLAN.md), [`STAGE_D6_PLAN.md`](STAGE_D6_PLAN.md).

**D5:** отдельный **`AUDIT_STAGE_D5.md`** **не** входил в охват (этап на **owner pause**, spike/audit D5 не выполнялись) — согласно [`STAGE_D6_PLAN.md`](STAGE_D6_PLAN.md) §2 и [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md) §0.

---

## 1. Verdict

| Критерий | Статус |
|----------|--------|
| **Итог defer-wave (D1–D4 + фиксация D5 + D6)** | **PASS** |
| **Critical / major по D1–D4 на дату финальной сверки** | **Нет открытых** (см. §3) |
| **D5** | **`deferred (owner pause, 2026-05-04)`** — допустимое закрытие D6; **`AUDIT_STAGE_D5.md`** отсутствует (ожидаемо). |
| **Продуктовый план §5 / §7 / §8.2 vs код** | **Согласовано** в пределах явных defer/backlog (§5–§6). |
| **«Не делаем» (publication_status extra, bulk API)** | **Не протекло** (§7). |
| **`DROP tests.scoring_config` (`0040`)** | **В репозитории выполнено**; **dev** — миграции прогнаны для теста; **prod** — см. §8 и **R2** в §9. |

---

## 2. Источники финального аудита (явный охват)

| Источник | Использование |
|----------|----------------|
| [`AUDIT_STAGE_D1.md`](AUDIT_STAGE_D1.md) | Verdict PASS; MANDATORY critical/major — закрыты (§1, §9–§10). |
| [`AUDIT_STAGE_D2.md`](AUDIT_STAGE_D2.md) | Verdict PASS; §9 «Открытых инструкций нет» после FIX 2026-05-03. |
| [`AUDIT_STAGE_D3.md`](AUDIT_STAGE_D3.md) | Status PASS; §6 / MANDATORY: **critical/major на дату аудита не выявлены**; low закрыты FIX 2026-05-03. |
| [`AUDIT_STAGE_D4.md`](AUDIT_STAGE_D4.md) | Verdict PASS после FIX-D4-L1; §7 Critical/Major — **нет**; MANDATORY закрыт. |
| [`LOG.md`](LOG.md) | Факты EXEC/FIX D1–D4, D6, defer-closure code (`scoring_config`, и т.д.). |
| Продуктовый план §5 | Таблица Q1–Q7 — сверка с этапами D1–D4 и статусом D5 (§5). |
| Продуктовый план §7 / §8.2 | Backlog, «не делаем», E2E, DROP, D5 (§6–§8). |
| **`AUDIT_STAGE_D5.md`** | **Не использовался** — файл отсутствует (D5 не выходил из паузы). |

---

## 3. Critical / major — сводная проверка по D1–D4

Перекрёстная сверка формулировок в stage-аудитах на предмет **незакрытых** блокеров уровня **critical** / **major**:

| Stage | Critical | Major | Закрытие / комментарий |
|-------|------------|-------|-------------------------|
| **D1** | Нет открытых | Нет открытых | §1 Verdict: MANDATORY (critical/major) **закрыты** (см. §10). |
| **D2** | — | — | §9 MANDATORY: после FIX 2026-05-03 **открытых инструкций нет**. |
| **D3** | Не выявлены на дату аудита | Не выявлены | §6 / MANDATORY: **critical / major** не применимы; low закрыты FIX. |
| **D4** | Нет | Нет | §7 MANDATORY: **Critical** и **Major** — пусто; FIX-D4-L1 закрыл minor L1. |

**Вывод:** на дату **финальной сверки** незакрытых **critical/major** по контур defer-wave **D1–D4 не остаётся**.

---

## 4. Сводка этапов D1–D5 и артефакты

| Stage | Статус | Аудит / план |
|-------|--------|----------------|
| **D1** — Q6, `measure_kinds` | **done** | [`AUDIT_STAGE_D1.md`](AUDIT_STAGE_D1.md) — **PASS** |
| **D2** — Q1, `assessmentKind` в БД | **done** | [`AUDIT_STAGE_D2.md`](AUDIT_STAGE_D2.md) — **PASS** |
| **D3** — Q3, типы рекомендаций в БД | **done** | [`AUDIT_STAGE_D3.md`](AUDIT_STAGE_D3.md) — **PASS** |
| **D4** — Q2, qualitative в инстансе | **done** | [`AUDIT_STAGE_D4.md`](AUDIT_STAGE_D4.md) — **PASS** (FIX-D4-L1 2026-05-04) |
| **D5** — Q4, `domain` → `kind` | **`deferred (owner pause, 2026-05-04)`** | [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md) §0; **`AUDIT_STAGE_D5.md`** нет. |

[`DEFER_CLOSURE_MASTER_PLAN.md`](DEFER_CLOSURE_MASTER_PLAN.md) §3: D6 зафиксирован как завершённый документом настоящего файла.

---

## 5. Статус **D5** (`domain` → `kind`) и **Q4**

| Факт | Деталь |
|------|--------|
| **Продукт** | [`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §5 Q4, §7 backlog, §8.2: колонка **`domain`**, UI «Тип»; переименование в **`kind`** — **отдельный этап** после оценки объёма. |
| **2026-05-04** | **Owner pause:** [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md) §0 — spike / gate / EXEC **не запускать** до снятия паузы (запись в `LOG` / плане). |
| **Аудит D5** | **`AUDIT_STAGE_D5.md`** отсутствует — **корректно** для текущего статуса. |
| **Код** | Drizzle [`recommendations.ts`](../../../../apps/webapp/db/schema/recommendations.ts) — поле **`domain`**; расхождения с целевым именем `kind` **не** введены в коде (ожидаемо при defer). |

**Residual D5:** после снятия паузы — spike + gate по [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md) §2; при Go — миграция/API/UI по §3 плана; при No-go — defer с evidence в `LOG` и учёт в следующем глобальном аудите при необходимости.

---

## 6. Продуктовый план §5 (Q1–Q7) vs факт

| # | Вопрос (§5) | Статус сверки |
|---|-------------|----------------|
| Q1 | `assessmentKind` → справочник БД | **PASS** (D2) |
| Q2 | `qualitative` в инстансе | **PASS** (D4 + FIX-L1) |
| Q3 | Типы рекомендаций / `domain` + БД | **PASS** (D3) |
| Q4 | `domain` vs `kind` | **Согласовано defer** (D5 pause, колонка `domain` в схеме) |
| Q5 | UUID-textarea test-sets | **N/A** для D-wave (закрытие вне D1–D6) |
| Q6 | `measure_kinds` | **PASS** (D1) |
| Q7 | Коммент каталога рекомендации | **PASS** (решение «не вводим»; B7 вне D-wave) |

---

## 7. Продуктовый план §7 / §8.2 и «не делаем»

| Тема | Статус сверки |
|------|----------------|
| `publication_status` на exercises / clinical tests / recommendations | **Не вводим** — в схеме только **`test_sets.publication_status`** ([`clinicalTests.ts`](../../../../apps/webapp/db/schema/clinicalTests.ts)); у таблицы **`tests`** и **`recommendations`** колонки **нет**. |
| Отдельный **bulk** API контейнеров | **Не планируем** — по `apps/webapp/src/app/api` нет путей **`/bulk`**, **`bulkItems`**, **`bulk-`**. |
| Расширение Playwright/CI E2E | **Не** планируется (§8.2); отдельная проверка CI в этом аудите **не** требовалась. |

---

## 8. `DROP tests.scoring_config` (`0040`) — решение, план и факт

**Продуктовый план** ([`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §7 backlog, §8.2): колонка **не нужна**; инженерный follow-up: миграция **`DROP COLUMN`**, удаление fallback в коде/снимках, тесты; **dev** — миграции прогнаны для теста (2026-05-04); на **prod** — backup по [`deploy/HOST_DEPLOY_README.md`](../../../../deploy/HOST_DEPLOY_README.md).

| Проверка | Результат | Evidence |
|----------|-----------|----------|
| Миграция в репозитории | **Есть** | [`0040_drop_tests_scoring_config.sql`](../../../../apps/webapp/db/drizzle-migrations/0040_drop_tests_scoring_config.sql) |
| Drizzle `tests` | **Без `scoring_config`** | [`clinicalTests.ts`](../../../../apps/webapp/db/schema/clinicalTests.ts) — JSONB **`scoring`**, снимок программы использует `scoringConfig` из **`scoring`** ([`LOG.md`](LOG.md) defer-closure 2026-05-03). |
| **Остаточный план (ops)** | Вне репозитория | **Dev:** миграции (включая **`0040`**) прогнаны для теста. **Prod:** на **каждой** production БД применить журнал миграций, включающий **`0040`**, после backup/runbook. |

---

## 9. Residual risks / follow-up

| ID | Риск / хвост | Комментарий |
|----|----------------|-------------|
| R1 | **D5** | Owner pause; объём `domain`→`kind` не оценён (нет spike). |
| R2 | **Prod миграции** | **defer (ops)** — проверка на **prod** хосте вне репозитория; **dev** — миграции (включая `0040`) прогнаны для теста. [`deploy/HOST_DEPLOY_README.md`](../../../../deploy/HOST_DEPLOY_README.md). |
| R3 | **Термин Q4** | В UI/API до D5 остаётся **`domain`** / query `domain`. |
| R4 | **E2E** | Приёмка по §8.2 — ручной smoke; автоматический e2e — только по отдельному решению. |
| R5 | **Паритет SSR vs REST** | D3 фиксирует известные различия транспорта для невалидного `domain` (HTML vs JSON) — не блокер defer-wave; см. [`AUDIT_STAGE_D3.md`](AUDIT_STAGE_D3.md) §3. |

---

## 10. MANDATORY post D6

**Открытых MANDATORY по закрытию defer-wave нет.**

Рекомендуемые шаги: см. §9; после снятия паузы D5 — [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md); при смене API — [`api.md`](../../../../apps/webapp/src/app/api/api.md).

---

## 11. Проверки (sanity) при финальной сверке

```bash
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts src/modules/treatment-program/testSetSnapshotView.test.ts
pnpm --dir apps/webapp exec tsc --noEmit
```

**Факт 2026-05-04 (повторный прогон):** vitest **26** passed, `tsc --noEmit` **ok**.

---

## 12. FIX (PROMPTS D6 — `AUDIT_DEFER_CLOSURE_GLOBAL`)

**Дата:** 2026-05-04  

### Critical / Major

- В глобальном аудите **не зафиксированы** открытые **critical/major** по D1–D4 (§3). **Устранение в коде не требуется.**

### Minor / §9 residual — закрытие в смысле FIX (defer / accepted / documented)

| ID | Тема | Итог FIX |
|----|------|----------|
| **R1** | D5 `domain`→`kind` | **defer** — owner pause; без изменений кода до [`STAGE_D5_PLAN.md`](STAGE_D5_PLAN.md) §0. |
| **R2** | Prod миграции `0040`+ | **defer (ops)** — **prod** вне репозитория; **dev** — миграции прогнаны для теста (см. [`LOG.md`](LOG.md)). |
| **R3** | Термин Q4 | **accepted** — колонка `domain` при defer D5; не дефект. |
| **R4** | E2E / CI | **defer** — §8.2 продуктового плана; не входит в defer-wave. |
| **R5** | SSR vs REST невалидный `domain` | **documented defer** — см. [`AUDIT_STAGE_D3.md`](AUDIT_STAGE_D3.md) §3; отдельное продуктовое решение при необходимости. |

### Барьер перед push

Выполнены **`pnpm install --frozen-lockfile`** и **`pnpm run ci`** (корень репозитория) — **PASS** (см. [`LOG.md`](LOG.md) запись D6 FIX).

---

## 13. Closure

Defer-wave **D1–D4** закрыта **PASS**-аудитами; **critical/major** по ним **не открыты**. **D5** — **`deferred (owner pause)`** без `AUDIT_STAGE_D5`. Ограничения §8.2 соблюдены. **`scoring_config`** на таблице **`tests`** снят в репозитории; **dev** — миграции прогнаны; **prod** — §8 (**§12 FIX** фиксирует residual **R1–R5** без новых изменений кода).
