# EXECUTION AUDIT TEMPLATE — PROGRAM_PATIENT_SHAPE

Итоговый аудит полной инициативы A1…A5 — файл [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md) (имя `PROGRAM_PATIENT_SHAPE_EXECUTION_AUDIT.md` не используется). Для отдельного этапа при необходимости — `STAGE_AX_EXECUTION_AUDIT.md` или по образцу [`AUDIT_STAGE_A1.md`](AUDIT_STAGE_A1.md).

---

# PROGRAM_PATIENT_SHAPE_EXECUTION_AUDIT — <Stage / Full Initiative>

**Дата:** YYYY-MM-DD  
**Scope:** Stage AX / A1–A5 full initiative  
**Source plan:** [`STAGE_AX_PLAN.md`](STAGE_AX_PLAN.md) / [`MASTER_PLAN.md`](MASTER_PLAN.md)

## 1. Verdict

- **Status:** PASS / PASS WITH RISKS / FAIL
- **Summary:** 2–4 предложения о том, что реально закрыто.

## 2. Scope Verification

| Requirement | Source | Status | Evidence |
|---|---|---|---|
| ... | `STAGE_AX_PLAN.md` §... | PASS/FAIL | file/test/check |

## 3. Changed Files

| File | Purpose | Risk |
|---|---|---|
| `apps/webapp/...` | ... | low/medium/high |

## 4. Architecture Rules Check

- [ ] `modules/*` не импортируют `@/infra/db/*` или `@/infra/repos/*`.
- [ ] Route handlers тонкие: parse/auth/validate -> service -> response.
- [ ] Новые таблицы/queries сделаны через Drizzle.
- [ ] Ports живут в `modules/*/ports.ts`, implementations — в `infra/repos/*`.
- [ ] `buildAppDeps()` вызывается только из route/page/action/app-layer.
- [ ] Не добавлены integration env vars.

## 5. UI Contract Check

### Doctor UI

- [ ] Использованы разрешённые components: `Button`, `Input`, `Label`, `Textarea`, `Select`, `Dialog`, `Badge`, `Card`, `ReferenceSelect`.
- [ ] Нет raw custom controls при наличии shared/shadcn primitive.
- [ ] Нет одноразового route-level layout, если уже был существующий constructor/list pattern.

### Patient UI

- [ ] Использованы `patientVisual.ts` primitives.
- [ ] Не импортированы стили из `app/app/patient/home/*`.
- [ ] Не создан home-like hero на inner page.
- [ ] Кнопки/ссылки используют patient action classes или `Button`/`buttonVariants` по существующему паттерну.

## 6. Data Migration / Backfill Check

| Migration | Reversible? | Backfill? | Notes |
|---|---|---|---|
| ... | yes/no | yes/no | ... |

## 7. Test Evidence

```bash
<commands run>
```

Expected:

- `eslint`: PASS
- `vitest`: PASS
- `typecheck`: PASS/SKIPPED with reason
- `ci`: PASS/SKIPPED with reason

## 8. Manual Smoke

- [ ] Doctor: ...
- [ ] Patient: ...
- [ ] Existing legacy scenario: ...

## 9. Regressions / Findings

### High

- None / finding.

### Medium

- None / finding.

### Low

- None / finding.

## 10. Deferred Work

- ...

## 11. Final DoD

- [ ] Stage DoD met.
- [ ] LOG updated.
- [ ] Product docs updated if decisions changed.
- [ ] Residual risks documented.
