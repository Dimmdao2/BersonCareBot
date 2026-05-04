# LOG TEMPLATE — PROGRAM_PATIENT_SHAPE

Копировать этот шаблон в `LOG.md` после каждого EXEC/FIX прохода.

---

## YYYY-MM-DD — Stage AX — <краткий заголовок>

**Контекст:**

- Этапный план: `STAGE_AX_PLAN.md`.
- Продуктовое ТЗ: `../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`.
- Связанные sister-планы/зависимости:
  - `../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md` (если затронуты каталоги/конструктор).

**Scope this run:**

- In scope:
  - [ ] ...
- Explicitly out of scope:
  - [ ] ...

**Changed files:**

- `path/to/file.ts` — что изменилось и зачем.
- `path/to/file.test.tsx` — что покрывает.

**Execution checklist:**

1. Schema/migration:
   - [ ] ...
2. Domain/service:
   - [ ] ...
3. Route/action:
   - [ ] ...
4. Doctor UI:
   - [ ] ...
5. Patient UI:
   - [ ] ...
6. Tests/docs:
   - [ ] ...

**Composer-safe UI contract evidence:**

- [ ] Doctor UI использует только разрешённые primitives: `Button`, `Input`, `Label`, `Textarea`, `Select`, `Dialog`, `Badge`, `Card`, `ReferenceSelect` (где нужно).
- [ ] Patient UI использует `patientVisual.ts` (`patientSectionSurfaceClass`, `patientCardClass`, `patientListItemClass`, `patientSectionTitleClass`, `patientBodyTextClass`, `patientMutedTextClass`, `patientPillClass`, `patientPrimaryActionClass`, `patientSecondaryActionClass`).
- [ ] Не добавлены raw `<button>`, raw custom select/accordion/dialog, если есть готовый primitive.
- [ ] Не импортировались home-only стили из `apps/webapp/src/app/app/patient/home/*`.
- [ ] Не добавлены новые direct infra imports в `modules/*` или route business logic.

**Checks run:**

```bash
rg "<stage symbols>" apps/webapp/src
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run <target-tests>
pnpm --dir apps/webapp exec tsc --noEmit
```

**Check results:**

- `rg`: PASS/FAIL — notes.
- `eslint`: PASS/FAIL — notes.
- `vitest`: PASS/FAIL — notes.
- `typecheck`: PASS/FAIL/SKIPPED — why.

**Product decisions closed:**

- O# / Q#: decision.

**Known residual risk:**

- ...

**Next step:**

- ...
