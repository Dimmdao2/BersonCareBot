# EXECUTION AUDIT TEMPLATE — ASSIGNMENT_CATALOGS_REWORK

После закрытия B7: сводный аудит инициативы в [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md) (и при необходимости [`AUDIT_PREPUSH_POSTFIX.md`](AUDIT_PREPUSH_POSTFIX.md) для полного CI). По этапам — отдельный `AUDIT_STAGE_BX.md`. Шаблон ниже можно копировать в новый файл или в секцию `AUDIT_GLOBAL.md`.

---

# ASSIGNMENT_CATALOGS_REWORK_EXECUTION_AUDIT — <Stage / Full Initiative>

**Дата:** YYYY-MM-DD  
**Scope:** Stage BX / B1–B7 full initiative  
**Source plan:** [`STAGE_BX_PLAN.md`](STAGE_BX_PLAN.md) / [`MASTER_PLAN.md`](MASTER_PLAN.md)

## 1. Verdict

- **Status:** PASS / PASS WITH RISKS / FAIL
- **Summary:** 2–4 предложения о том, что реально закрыто.

## 2. Scope Verification

| Requirement | Source | Status | Evidence |
|---|---|---|---|
| ... | `STAGE_BX_PLAN.md` §... / ТЗ §3 | PASS/FAIL | file/test/check |

## 3. Changed Files

| File | Purpose | Risk |
|---|---|---|
| `apps/webapp/...` | ... | low/medium/high |

## 4. Architecture Rules Check

- [ ] `modules/*` не импортируют `@/infra/db/*` или `@/infra/repos/*`.
- [ ] Route handlers тонкие: parse/auth/validate → service → response.
- [ ] Новые таблицы/queries сделаны через Drizzle.
- [ ] Ports в `modules/*/ports.ts`, реализации в `infra/repos/*`.
- [ ] `buildAppDeps()` только из route/page/action/app-layer.
- [ ] Не добавлены integration env vars.

## 5. UI Contract Check (doctor)

- [ ] Разрешённые primitives: `Button`, `Input`, `Label`, `Textarea`, `Select`, `Dialog`, `Badge`, `Card`, `ReferenceSelect`; `CreatableComboboxInput` только где предусмотрено B2.
- [ ] B6: нет полей `goals`/`objectives`/`expected_duration_*` и нет групп этапа (A1+A3).

## 6. Patient-facing (если затронуто, обычно B7)

- [ ] Комментарии: `local_comment ?? template_comment` по ТЗ; без home-only импортов из `patient/home/*`, если трогали patient UI.

## 7. Data Migration / Backfill Check

| Migration | Reversible? | Backfill? | Notes |
|---|---|---|---|
| ... | yes/no | yes/no | ... |

## 8. Test Evidence

```bash
<commands run>
```

Ожидается:

- `eslint`: PASS
- `vitest`: PASS
- `typecheck`: PASS/SKIPPED with reason
- `ci`: PASS/SKIPPED with reason

## 9. Manual Smoke

- [ ] Doctor: клин. тесты / наборы / рекомендации / ЛФК / шаблоны — по scope этапа.
- [ ] Legacy URLs со старым `status=` (после B1).
- [ ] Archive/usage сценарии (см. ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN).

## 10. Regressions / Findings

### High

- None / finding.

### Medium

- None / finding.

### Low

- None / finding.

## 11. Deferred Work

- ...

## 12. Final DoD

- [ ] Stage / initiative DoD met (ТЗ §6).
- [ ] `LOG.md` обновлён.
- [ ] Сделан **git commit** за закрытый EXEC/FIX этапа (см. `MASTER_PLAN.md` §9).
- [ ] Продуктовое ТЗ §8 обновлено при новых решениях.
- [ ] Residual risks задокументированы.
