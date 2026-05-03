# STAGE A5 PLAN — бейджи «План обновлён» и «Новое»

## 1. Цель этапа

Добавить пациенту прозрачные маркеры изменений:

- «План обновлён» в Today на основе `treatment_program_events`;
- «Новое» на item через `last_viewed_at`.

Источник требований: [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) (§1.6, §1.7, §6 A5).

## 2. Hard gates before coding

- Backfill plan must exist before UI badge is enabled.
- A2 should be done because item visibility/status affects new badge rendering.
- A4 is recommended because mark-viewed/action tracking may share service patterns.
- Cross-stage dedupe is explicitly out of scope.

## 3. In scope / out of scope

### In scope

- Add `last_viewed_at`.
- Backfill old items to avoid false «Новое».
- Mark-viewed endpoint/action.
- Today badge «План обновлён».
- Item badge «Новое».
- Cache revalidation.

### Out of scope

- Push/PWA notifications.
- Cross-stage dedupe by `item_ref_id`.
- Detailed diff UI for plan changes.

## 4. Allowed files / likely files

Likely:

- `apps/webapp/db/schema/**`
- `apps/webapp/src/modules/treatment-program/**`
- `apps/webapp/src/infra/repos/*TreatmentProgram*`
- `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/touch/route.ts`
- `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/route.ts`
- `apps/webapp/src/app/api/patient/treatment-program-instances/route.ts`
- patient Today/home data loaders for treatment program card only.
- patient plan item components under `apps/webapp/src/app/app/patient/treatment-programs/**`.
- route/action for mark-viewed.

Do not edit:

- integrator/bot push.
- courses.
- unrelated patient home geometry.

## 5. Composer-Safe UI contract

### Today badge «План обновлён»

Use:

- Existing patient Today card layout.
- `patientPillClass` or shadcn `Badge` only if current Today card already uses Badge.
- Text exactly: `План обновлён` plus date if available.

Do not:

- add new hero block;
- change patient home layout grid;
- add notification settings.

### Item badge «Новое»

Use:

- `patientPillClass`.
- Label exactly: `Новое`.
- Place near item title, not as a separate row.

Required wrapper pattern:

```tsx
<span className={patientPillClass}>Новое</span>
```

### Mark viewed

- Trigger when item detail/run-screen opens, not merely because list rendered.
- Do not mark all items viewed on plan open.
- Avoid client-only state that is not persisted.

## 6. Atomic implementation plan

### A5.1 Schema/backfill

- [ ] Add `last_viewed_at TIMESTAMPTZ NULL` to instance stage items.
- [ ] Backfill existing rows: `last_viewed_at = created_at`.
- [ ] Verify no existing item has `NULL` after backfill unless intentionally new.

### A5.2 New badge read model

- [ ] Add `isNew = last_viewed_at == null` to read model.
- [ ] Do not compute cross-stage dedupe.
- [ ] Hide badge for disabled items.

### A5.3 Mark viewed mutation

- [ ] Add service method `markInstanceStageItemViewed`.
- [ ] It only updates if `last_viewed_at IS NULL`.
- [ ] It is idempotent.
- [ ] It validates patient ownership/access.

### A5.4 Plan updated badge

- [ ] Determine last relevant `treatment_program_events` after patient's last plan open marker.
- [ ] If no plan-open marker exists, use safe fallback documented in LOG.
- [ ] Render `План обновлён` in Today.
- [ ] Define reset behavior: opening plan writes/updates plan-open marker or equivalent.

### A5.5 Cache revalidation

- [ ] Revalidate Today after program mutation.
- [ ] Revalidate plan after mark-viewed.
- [ ] Add `revalidatePath`/`revalidateTag` at mutation points.

### A5.6 Tests

- [ ] Backfill/migration test or SQL review note.
- [ ] Service: new item detection.
- [ ] Service: mark-viewed idempotent.
- [ ] UI: badge appears/disappears.
- [ ] UI: plan-updated appears after event.

## 7. Required checks

```bash
rg "last_viewed_at|План обновлён|Новое|mark.*viewed|revalidatePath|revalidateTag" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec eslint <changed-files>
pnpm --dir apps/webapp exec vitest run <target-tests>
pnpm --dir apps/webapp exec tsc --noEmit
```

## 8. Rollback notes

- If badge causes noise, hide UI first; keep column.
- Do not undo backfill with destructive SQL.
- Mark-viewed endpoint can be disabled without affecting core plan rendering.

## 9. Definition of Done

- Old items do not show as new.
- New items show `Новое` until opened.
- `mark viewed` persists and is idempotent.
- Today shows `План обновлён` after relevant program events.
- Cache refresh works after mutations.
- LOG updated using `LOG_TEMPLATE.md`.
