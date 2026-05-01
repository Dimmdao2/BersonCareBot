# Phase 4 — Patient Home Secondary Blocks

## Цель

Перерисовать оставшиеся блоки главной "Сегодня" на shared patient visual system:

- progress + streak;
- next reminder;
- mood check-in;
- SOS;
- plan;
- subscription carousel;
- courses row.

Не менять бизнес-логику, источники данных и access behavior.

## Recommended model

Composer 2 по умолчанию. Codex 5.3 не нужен, если Phase 1–3 завершены и helpers стабильны. GPT 5.5 может быть полезен только для audit, если есть сомнения по сохранению behavior.

## Branch

Работать только в ветке `patient-app-visual-redesign-initiative`.

## Read first

- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/03_HOME_PRIMARY_PLAN.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md` sections 9, 10.5–10.10, 11, 12, 14
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`

## Scope

Allowed files:

- `apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeNextReminderCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeNextReminderCard.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSosCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSosCard.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomePlanCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeCoursesRow.tsx`
- shared patient visual helpers from Phase 1
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`

Do not edit:

- `modules/patient-practice/*`;
- `modules/patient-mood/*`;
- reminders service/repositories;
- content/courses repos;
- API routes;
- migrations.

## Implementation checklist

### Progress + streak

- [ ] Keep existing `practiceTarget`, `progress`, guest/auth behavior.
- [ ] Preserve `role="progressbar"` and values.
- [ ] Render progress and streak as two visual regions.
- [ ] Stack gracefully on narrow screens.
- [ ] Use primary color for progress fill and main value.
- [ ] Use fire icon or equivalent from lucide for streak.
- [ ] Avoid layout jump for loading/empty state.

### Next reminder

- [ ] Keep existing `rule` and `scheduleLabel` behavior.
- [ ] Convert to warning-toned card.
- [ ] Use leading bell icon/container.
- [ ] Keep route to reminders.
- [ ] Style action as button-like warning link.
- [ ] Do not invent reminder edit route if not already available.

### Mood check-in

- [ ] Keep POST `/api/patient/mood` behavior.
- [ ] Keep optimistic selection rollback.
- [ ] Keep `aria-pressed` and labels.
- [ ] Convert card to warm gradient background.
- [ ] Render five equal mood slots.
- [ ] Use configured `imageUrl` when present.
- [ ] Keep emoji fallback.
- [ ] Ensure disabled/submitting state remains understandable.

### SOS

- [ ] Keep `sos.href` behavior.
- [ ] Convert to danger-toned card.
- [ ] **Layout всегда: red circle icon container слева, текст справа, кнопка снизу/справа.** Это совпадает с референсом и не зависит от наличия `imageUrl`.
- [ ] Если `imageUrl` присутствует — использовать его как маленький декоративный акцент (например, в углу карточки) или игнорировать визуально. Не делать большой image-led layout. Решение зафиксировать в `LOG.md`.
- [ ] Если `imageUrl` отсутствует — рендерить только icon circle без fallback image.
- [ ] Иконка: lucide `AlertTriangle`/`ShieldAlert`/эквивалент, белая на красном круге.
- [ ] Use danger/SOS button style (white bg, danger border, danger text).
- [ ] Do not change SOS bot scenarios или href.

### Plan

- [ ] Keep `routePaths.patientTreatmentProgram(instance.id)`.
- [ ] Add leading plan icon container.
- [ ] Use base card style.
- [ ] Show progress bar only if progress data is available without new queries; otherwise do not invent data.
- [ ] Preserve current behavior of omitting block when no active plan.

### Subscription carousel

- [ ] Preserve horizontal scroll and snap behavior.
- [ ] Use patient card primitives.
- [ ] Use patient badge primitive.
- [ ] Preserve `href`, `imageUrl`, `badgeLabel`, `title`, `subtitle`.
- [ ] Do not introduce subscription gating.

### Courses row

- [ ] Preserve cards and links.
- [ ] Use patient base/compact card style.
- [ ] Do not change course engine or treatment program model.

### Docs/log

- [ ] Update `LOG.md`.
- [ ] Record any visual mismatch due to missing data/assets.
- [ ] Record any helper extension added in this phase.

## Tests/checks

Targeted tests:

- `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeProgressBlock.test.tsx`
- `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeNextReminderCard.test.tsx`
- `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx`
- `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeSosCard.test.tsx`
- `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx`

If changes touch shared helpers broadly:

- rerun Phase 3 targeted tests affected by helper changes.

If TypeScript/React changes are broad:

- `pnpm --dir apps/webapp typecheck`

Do not run root `pnpm run ci`.

## Acceptance criteria

- Secondary blocks use patient visual primitives.
- No business behavior changes.
- No new data queries solely for visual values.
- Guest/auth states remain safe.
- Subscription badge remains visual only.
- Tests updated and targeted checks pass or failures are fixed.
- `LOG.md` updated.

