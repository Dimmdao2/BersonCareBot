# Phase 0 — Inventory and Exact Implementation Plan

## Цель

Провести readonly-инвентаризацию перед визуальным редизайном и составить точный implementation plan для Phase 1–5 на текущем состоянии кода.

Phase 0 ничего не редактирует в коде приложения. Разрешены только новые/обновленные документы в этой инициативе, если пользователь или prompt явно просит сохранить результат.

## Recommended model

Composer 2 достаточно. Эскалация на GPT 5.5 только если обнаружены противоречия между `VISUAL_SYSTEM_SPEC.md`, текущим кодом и `README.md` инициативы.

## Branch

Inventory phase ничего не пишет в app-код, поэтому формально может выполняться в любой ветке. Но если inventory сохраняет `PLAN_INVENTORY.md` и `LOG.md` — переключиться на ветку `patient-app-visual-redesign-initiative` (создать от актуальной ветки разработки, если её нет).

## Read first

- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md`
- `.cursor/rules/clean-architecture-module-isolation.mdc`
- `.cursor/rules/000-critical-integration-config-in-db.mdc`
- `.cursor/rules/runtime-config-env-vs-db.mdc`

## Files to inspect

Shell/layout/navigation:

- `apps/webapp/src/app/globals.css`
- `apps/webapp/src/shared/ui/AppShell.tsx`
- `apps/webapp/src/shared/ui/AppShell.test.tsx`
- `apps/webapp/src/shared/ui/PatientHeader.tsx`
- `apps/webapp/src/shared/ui/PatientHeader.test.tsx`
- `apps/webapp/src/shared/ui/PatientGatedHeader.tsx`
- `apps/webapp/src/shared/ui/PatientBottomNav.tsx`
- `apps/webapp/src/app-layer/routes/navigation.ts`
- `apps/webapp/src/app-layer/routes/navigation.test.ts`
- `apps/webapp/src/components/ui/button-variants.ts`

Patient home:

- `apps/webapp/src/app/app/patient/page.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeTodayLayout.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeGreeting.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSituationsRow.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeNextReminderCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSosCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomePlanCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeCoursesRow.tsx`
- `apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts`
- all `apps/webapp/src/app/app/patient/home/*.test.tsx`

Potential dependencies:

- `apps/webapp/src/shared/hooks/usePlatform.ts`
- `apps/webapp/src/shared/lib/platform.ts`
- `apps/webapp/src/app/app/patient/diary/DiaryTabsClient.tsx`
- `apps/webapp/src/modules/system-settings/appDisplayTimezone.ts` — обязательно подтвердить, что `getAppDisplayTimeZone()` доступен на server side для greeting time-of-day prefix
- `apps/webapp/src/modules/patient-home/patientHomeMoodIcons.ts`

References:

- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/references/` — проверить, есть ли скриншоты-макеты. Если папки/файлов нет — inventory должен зафиксировать это, и Phase 3/4 будут идти строго по `VISUAL_SYSTEM_SPEC.md`.

## Checklist

### Current state inventory

- [ ] Confirm `#app-shell-patient` exists and is the right CSS token scope.
- [ ] List all `--patient-*` variables and where they are used.
- [ ] Confirm current patient shell max widths and padding (`AppShell.tsx`: ожидается `max-w-[480px]` mobile patient, который Phase 2 поменяет на `430px`).
- [ ] Confirm current bottom nav items and active-state logic.
- [ ] Confirm whether `PatientBottomNav.test.tsx` exists.
- [ ] Confirm whether a desktop top nav already exists. If not, propose `PatientTopNav.tsx`.
- [ ] Confirm header right icons and whether settings gear exists in patient header.
- [ ] Confirm `PatientGatedHeader` role and what differs from `PatientHeader`.
- [ ] Confirm current `Back`/`Home` behavior on patient pages.
- [ ] Confirm current `buttonVariants` variants and sizes; пометить, безопасно ли расширение для doctor/admin.
- [ ] Confirm current `patientHomeCardClass` shape and all imports.
- [ ] Confirm `getAppDisplayTimeZone()` доступен в server context `PatientHomeToday`.
- [ ] Confirm which home block tests assert old DOM/classes.
- [ ] Confirm no runtime slug hardcode is needed for visual changes.
- [ ] Проверить наличие скриншотов в `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/references/`.

### Risk classification

- [ ] Identify files with high blast radius.
- [ ] Identify files safe for Composer 2.
- [ ] Identify any phase likely requiring Codex 5.3.
- [ ] Identify tests likely to fail from visual DOM changes.
- [ ] Identify docs that must be updated during EXEC/FIX.

### Output

Create or update:

- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/PLAN_INVENTORY.md` (if saving the inventory result)

The inventory result must include:

1. Confirmed current-state summary.
2. Exact file list for phases 1–5.
3. Test list by phase.
4. Risks and model recommendations by phase.
5. GO/NO-GO for Phase 1.

## Acceptance criteria

- Inventory is grounded in real files.
- No app code changed.
- No full CI run.
- `LOG.md` updated.
- Composer 2 can proceed to Phase 1 without re-discovering the whole codebase.

