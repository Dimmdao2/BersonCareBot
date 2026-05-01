# Phase 5 — Tests, Visual QA and Cleanup

## Цель

Закрыть visual redesign как reviewable package:

- обновить и добрать тесты;
- убрать мертвые/дублирующие стили;
- проверить accessibility и responsive behavior;
- зафиксировать остаточные visual gaps;
- подготовить финальный audit.

## Recommended model

**Default: Composer 2** для всех шагов этой фазы, включая финальный audit.

Эскалация только при явно сформулированной причине:

- GPT 5.5 — только если два подряд Composer 2 audit дали противоречивые findings, или пользователь явно попросил независимую проверку.
- Codex 5.3 — только если cleanup потребовал сложного React/TS refactor вне UI-scope.
- Opus 4.7 — только по явной просьбе пользователя при unresolved high-risk contradictions.

Не запускать GPT 5.5 "для надёжности". Дорогая модель без обоснования = впустую потраченные токены.

## Branch

Работать только в ветке `patient-app-visual-redesign-initiative`.

## Read first

- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md` sections 11, 12, 14, 15
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`
- audit/fix notes from phases 1–4 if present

## Scope

Allowed files:

- tests for all files changed in phases 1–4;
- shared patient visual helpers if cleanup is needed;
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`;
- optional final audit doc: `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_VISUAL_FINAL.md`;
- optional docs updates if behavior/spec changed.

Hard scope limits:

- **Не начинать редизайн других patient pages** (booking, reminders, diary, profile, content, courses, lfk, practice). Эта фаза завершает только home/foundation/nav.
- Не делать `buttonVariants` doctor/admin refactor.
- Не мигрировать legacy `--patient-radius*` usages — отдельная follow-up инициатива.
- Не менять более ~5 файлов вне явного scope этой инициативы.
- Не делать broad TypeScript/React refactor "по дороге".

Если cleanup-шаг хочет коснуться файла вне scope — фиксировать в `LOG.md` как backlog item для будущей инициативы и не трогать.

## Checklist

### Test cleanup

- [ ] Verify existing tests from `VISUAL_SYSTEM_SPEC.md §14.2` are updated.
- [ ] Add `PatientBottomNav.test.tsx` if not already added.
- [ ] Add `PatientTopNav.test.tsx` if `PatientTopNav.tsx` exists.
- [ ] Ensure tests assert behavior/semantics, not brittle Tailwind details.
- [ ] Confirm home card tests cover:
  - [ ] hero CTA and fallback;
  - [ ] booking guest/auth links;
  - [ ] situations no slug color mapping;
  - [ ] progressbar values;
  - [ ] mood aria and save behavior;
  - [ ] SOS fallback;
  - [ ] subscription badge visual-only behavior.

### Visual QA checklist

Manual/visual review targets:

- [ ] Mobile `320px`: no horizontal scroll.
- [ ] Mobile `360px`: content readable, hero image does not cover text.
- [ ] Mobile `390px`: closest reference target.
- [ ] Tablet `768px`: bottom nav remains usable.
- [ ] Tablet/desktop boundary around `1024px`: bottom/top nav switch is clean.
- [ ] Desktop `1280px`: top nav + dashboard grid align.
- [ ] Telegram/MAX WebView if available.

Check states:

- [ ] anonymous guest;
- [ ] onboarding/not full patient tier;
- [ ] full patient with progress;
- [ ] no daily warmup image;
- [ ] no situations;
- [ ] no active plan;
- [ ] mood icons with images;
- [ ] mood fallback emoji.

### Accessibility

- [ ] All interactive targets `>= 44px`.
- [ ] Icon-only buttons have `aria-label`.
- [ ] Active nav item has `aria-current="page"`.
- [ ] Progress has valid progressbar attributes.
- [ ] Mood has `aria-pressed`.
- [ ] Keyboard focus visible remains visible.
- [ ] Color contrast for warning/danger cards is acceptable.

### Cleanup

- [ ] Remove unused imports.
- [ ] Remove dead helper exports created during phases.
- [ ] Keep legacy CSS variables until all usages are migrated or document remaining usages.
- [ ] Do not delete old patient variables if still referenced.
- [ ] Avoid large refactors outside patient visual scope.

### Documentation

- [ ] Update `LOG.md` with final state.
- [ ] Document any unresolved visual gaps.
- [ ] If implementation intentionally diverged from `VISUAL_SYSTEM_SPEC.md`, update spec or log as temporary.
- [ ] Create `AUDIT_VISUAL_FINAL.md` if running final audit.
- [ ] (Рекомендуется) приложить ссылки на скриншоты до/после в `LOG.md` для mobile (`390px`) и desktop (`1280px`) на ключевых блоках (hero, booking, situations, progress, reminder, mood, SOS, plan). Это сильно облегчит финальный визуальный review владельцу продукта.

## Checks

Recommended final local checks for this initiative (not full root CI):

- targeted home tests:
  - `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeToday.test.tsx src/app/app/patient/home/PatientHomeTodayLayout.test.tsx`
  - `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx src/app/app/patient/home/PatientHomeSituationsRow.test.tsx`
  - `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeProgressBlock.test.tsx src/app/app/patient/home/PatientHomeNextReminderCard.test.tsx src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx src/app/app/patient/home/PatientHomeSosCard.test.tsx src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx`
- shell/nav tests:
  - `pnpm --dir apps/webapp test -- src/shared/ui/AppShell.test.tsx src/shared/ui/PatientHeader.test.tsx`
  - plus `PatientBottomNav.test.tsx` / `PatientTopNav.test.tsx` if added.
- webapp typecheck:
  - `pnpm --dir apps/webapp typecheck`
- webapp lint:
  - `pnpm --dir apps/webapp lint`

Do not run root `pnpm run ci` unless:

- user explicitly asks;
- this is immediately before push;
- root/repo-level files were changed.

## Acceptance criteria

- Targeted tests pass.
- Webapp typecheck/lint pass if run.
- Visual QA checklist completed or residual gaps documented.
- No known slug hardcode added.
- No doctor/admin intentional regressions.
- No full CI was run unnecessarily.
- `LOG.md` updated.
- Final audit doc exists if requested by prompt.

