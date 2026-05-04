# LOG TEMPLATE — ASSIGNMENT_CATALOGS_REWORK

Копировать этот шаблон в `LOG.md` после каждого EXEC/FIX прохода.

---

## YYYY-MM-DD — Stage BX — <краткий заголовок>

**Контекст:**

- Этапный план: `STAGE_BX_PLAN.md`.
- Продуктовое ТЗ: `../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`.
- Pre-implementation: [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md).
- Git / CI: [`MASTER_PLAN.md`](MASTER_PLAN.md) §9.
- Связанные планы:
  - `../PROGRAM_PATIENT_SHAPE_INITIATIVE/**` (если затронуты шаблоны программ / stage items / комментарии — только согласованный scope).
  - `../APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md` (регресс archive/usage).

**Scope this run:**

- In scope:
  - [ ] ...
- Explicitly out of scope:
  - [ ] ...

**Changed files:**

- `path/to/file.ts` — что изменилось и зачем.
- `path/to/file.test.ts` — что покрывает.

**Execution checklist:**

1. Schema/migration (если есть):
   - [ ] ...
2. Domain/service/ports:
   - [ ] ...
3. Route / server action:
   - [ ] ...
4. Doctor UI:
   - [ ] ...
5. Patient UI (если B7 или read-path):
   - [ ] ...
6. Tests/docs:
   - [ ] ...

**Stage-specific completeness (pick relevant):**

- [ ] B1: проверены обе оси (`arch` + `pub`) + legacy query + три каталога.
- [ ] B2: проверены все `schema_type` + backfill + measure-kinds API + фильтры region/assessmentKind.
- [ ] B3: UUID textarea удалён полностью; compose + server-action сценарии состава набора.
- [ ] B4: `domain` не переименован; UI «Тип» + region + quantity/frequency/duration + фильтры.
- [ ] B5: зафиксирован вывод «UX-ожидание vs state-bug» по «глазу»; list/editor статусы синхронны.
- [ ] B6: pre-check post-A зафиксирован; UX pass без изменений assign/snapshot.
- [ ] B7: заполнена audit-матрица контейнеров; copy/override/fallback покрыты тестами.

**Git:**

- [ ] Сделан **коммит** после этого прохода (EXEC или FIX): краткое сообщение + только файлы этапа/LOG/audit.

**Composer-safe UI (doctor):**

- [ ] Использованы `Button`, `Input`, `Label`, `Textarea`, `Select`, `Dialog`, `Badge`, `Card`, `ReferenceSelect` где уместно; новый combobox — только `CreatableComboboxInput` по ТЗ B2.5.
- [ ] Нет raw `<button>` / raw one-off select, если есть shadcn primitive.
- [ ] **B6:** сначала зафиксирован pre-check фактического состояния конструктора после фазы A; не удалять и не ломать существующие блоки A1/A3 — только layout/превью/CTA (см. `PRE_IMPLEMENTATION_DECISIONS`, `STAGE_B6_PLAN`).

**Architecture:**

- [ ] `modules/*` без прямых `@/infra/db/*` и `@/infra/repos/*`.
- [ ] Route handlers без business logic / SQL.
- [ ] Новые сущности БД через Drizzle.
- [ ] Нет новых env для integration config.

**Checks run:**

```bash
rg "<symbols>" apps/webapp/src
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run <target-tests>
pnpm --dir apps/webapp exec tsc --noEmit
```

**Check results:**

- `rg`: PASS/FAIL — notes.
- `eslint`: PASS/FAIL — notes.
- `vitest`: PASS/FAIL — notes.
- `typecheck`: PASS/FAIL/SKIPPED — why.
- `smoke`: PASS/FAIL — key scenarios.

**Product decisions closed:**

- Q# / note: decision.

**Known residual risk:**

- ...

**Next step:**

- ...
