# Phase 1 — Foundation: Tokens, Shell Background and Patient Primitives

## Цель

Создать patient visual foundation: scoped CSS tokens, page background, базовые card/button/badge/icon helpers. Не перерисовывать home-блоки в этой фазе. Не менять max-width контейнера и навигацию — это Phase 2.

## Recommended model

Composer 2 по умолчанию. Codex 5.3 не нужен, если scope не расширяется на navigation/home blocks. Эскалация только если TypeScript/Tailwind v4/shadcn constraints вызывают конфликт.

## Branch

Работать только в ветке `patient-app-visual-redesign-initiative`. Если ветка отсутствует — создать от актуальной ветки разработки. Не работать в `patient-home-redesign-initiative`.

## Read first

- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md` (особенно §6 CSS variable naming policy и §7 max-width)
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/00_INVENTORY_PLAN.md`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/PLAN_INVENTORY.md` если существует
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md` sections 1, 4, 6, 7, 8, 9, 12
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`

## Scope

Allowed files:

- `apps/webapp/src/app/globals.css`
- `apps/webapp/src/shared/ui/AppShell.tsx` — **только page background и shadow**, не max-width
- `apps/webapp/src/shared/ui/AppShell.test.tsx`
- `apps/webapp/src/components/ui/button-variants.ts`
- `apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts`
- optional new helper: `apps/webapp/src/shared/ui/patientVisual.ts`
- optional new helper: `apps/webapp/src/app/app/patient/home/patientHomeVisual.ts`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`

Do not edit:

- `PatientHeader.tsx`, `PatientGatedHeader.tsx`
- `PatientBottomNav.tsx`
- `navigation.ts`
- individual `PatientHome*Card.tsx` files except if a test/import breaks from helper rename
- database/schema/migrations
- AppShell `max-width` (это Phase 2)
- doctor/admin styles или components

## Implementation checklist

### CSS tokens

- [ ] Все новые токены добавляются под `#app-shell-patient` или его эквивалент. Patient-scope обязателен.
- [ ] Существующие переменные не удалять и значения не менять:
  - [ ] `--patient-bg`
  - [ ] `--patient-surface`
  - [ ] `--patient-touch`
  - [ ] `--patient-gap`
  - [ ] `--patient-radius`
  - [ ] `--patient-radius-lg`
- [ ] Запрещены суффиксы `*-new`, `*-v2`, `*-tmp` в новых токенах.
- [ ] Добавить radii (семантические имена):
  - [ ] `--patient-card-radius-mobile` (`20px`)
  - [ ] `--patient-card-radius-desktop` (`24px`)
  - [ ] `--patient-hero-radius-mobile` (`24px`)
  - [ ] `--patient-hero-radius-desktop` (`28px`)
  - [ ] `--patient-pill-radius` (`9999px`)
- [ ] Добавить shadow tokens:
  - [ ] `--patient-shadow-card-mobile` (`0 4px 14px rgba(15,23,42,0.04)`)
  - [ ] `--patient-shadow-card-desktop` (`0 8px 24px rgba(15,23,42,0.05)`)
  - [ ] `--patient-shadow-nav` (`0 -4px 16px rgba(15,23,42,0.04)`)
- [ ] Добавить semantic patient color tokens (значения из `VISUAL_SYSTEM_SPEC.md §2`):
  - [ ] `--patient-color-primary` (`#4F46E5`), `--patient-color-primary-soft` (`#EEF2FF`)
  - [ ] `--patient-color-success` (`#16A34A`), `--patient-color-success-soft` (`#ECFDF3`)
  - [ ] `--patient-color-warning` (`#F59E0B`), `--patient-color-warning-soft` (`#FFFAEB`)
  - [ ] `--patient-color-danger` (`#EF4444`), `--patient-color-danger-soft` (`#FEF2F2`)
  - [ ] `--patient-text-primary` (`#111827`), `--patient-text-secondary` (`#667085`), `--patient-text-muted` (`#98A2B3`)
  - [ ] `--patient-border` (`#E5E7EB`), `--patient-page-bg` (`#F7F8FB`), `--patient-card-bg` (`#FFFFFF`)
- [ ] Doctor/admin scopes не трогать. Никакие глобальные `:root`-переменные не менять.

### Shell background

- [ ] В patient-режиме `AppShell` устанавливает `background-color: var(--patient-page-bg)` (или эквивалент через Tailwind/CSS).
- [ ] Не менять `max-width` в этой фазе. Бывший `max-w-[480px]` остаётся как есть. Изменение на `430px` — Phase 2.
- [ ] Не менять `patient-wide` поведение. Не менять `patientEmbedMain`/`patientHideBottomNav`.
- [ ] Сохранить safe-area utilities.
- [ ] В `AppShell.test.tsx` проверить, что **default** и **doctor** варианты не получили patient styles (smoke-тест: класс/inline-style фона patient-варианта **не** применяется к variant=`default` и variant=`doctor`).

### Button primitives

- [ ] Расширять `button-variants.ts` только если расширение безопасно для doctor/admin (новые varianty не должны менять default behavior существующих).
- [ ] Если generic variant рискован — создавать patient-specific helper в `patientVisual.ts` или `patientHomeVisual.ts` (чтобы не задеть doctor/admin).
- [ ] Не заменять кнопки во всех home blocks в этой фазе.

### Card/badge/icon primitives

- [ ] Расширить `patientHomeCardStyles.ts` или ввести `patientHomeVisual.ts`.
- [ ] Сохранить `patientHomeCardClass` экспорт пока он используется текущими компонентами/тестами.
- [ ] Добавить именованные классы/`cva` для:
  - [ ] base card (mobile/desktop)
  - [ ] compact card
  - [ ] hero gradient card
  - [ ] success-tone card
  - [ ] warning-tone card
  - [ ] danger-tone card
  - [ ] gradientWarm card (mood)
- [ ] Добавить badge primitives (primary/success/warning/danger/duration).
- [ ] Добавить icon tile/container primitives (44/48/56 px).
- [ ] Использовать `cn` и существующие проектные паттерны.

### Docs/log

- [ ] Обновить `LOG.md`: список добавленных токенов, новых helpers, что сознательно отложено в Phase 2 (max-width).
- [ ] Документировать, не получилось ли расширить `button-variants.ts` без риска для doctor/admin.

## Tests/checks

Run only scope-appropriate checks:

- targeted tests:
  - `pnpm --dir apps/webapp test -- src/shared/ui/AppShell.test.tsx`
  - new helper test only if helper has logic worth testing
- if TypeScript/React changed:
  - `pnpm --dir apps/webapp typecheck`
- if CSS/class conventions changed broadly:
  - `pnpm --dir apps/webapp lint`

Do not run root `pnpm run ci`.

## Acceptance criteria

- Patient tokens существуют и patient-scoped.
- Имена новых tokens соответствуют политике §6 MASTER_PLAN — никаких `*-new`/`*-v2`/`*-tmp`.
- Existing variables remain compatible.
- Shared patient style helpers exist and are imported without breaking current home components.
- `AppShell` patient-вариант имеет новый page background; `default` и `doctor` варианты визуально идентичны до и после.
- `AppShell` mobile `max-width` не изменён в этой фазе (изменение запланировано в Phase 2).
- No doctor/admin intentional visual changes.
- `LOG.md` updated.
- Checks appropriate to changed files pass or failures are documented.

