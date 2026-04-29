# Phase 2 — Navigation: Mobile Bottom Nav, Desktop Top Nav, Mobile Max-Width

## Цель

Реализовать согласованную модель навигации и финализировать mobile patient `max-width`:

- `< lg`: bottom nav visible, desktop top nav hidden;
- `lg+`: desktop top nav visible, bottom nav hidden;
- mobile patient `max-width: 430px` (вместо текущего `480px`);
- desktop patient `patient-wide` контейнер согласован с top nav;
- no desktop patient `Back`;
- no top `Home`;
- `Профиль` справа в header/topbar;
- settings inside profile, no separate patient settings gear.

## Recommended model

Composer 2 по умолчанию. Codex 5.3 — только если refactor одновременно затрагивает `PatientGatedHeader`, `usePlatform`, route config и shell, и Composer 2 на двух подряд попытках смешивает scopes. GPT 5.5 не нужен для EXEC; допустим как audit при спорной навигационной архитектуре, по явной просьбе пользователя.

## Branch

Работать только в ветке `patient-app-visual-redesign-initiative`.

## Read first

- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md` (особенно §5 Target navigation, §7 Mobile max-width)
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/01_FOUNDATION_PLAN.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md` sections 1, 2, 4, 5, 6, 9.4, 10.1, 12, 14
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`

## Роль PatientGatedHeader

`PatientGatedHeader` — это адаптер `PatientHeader` для onboarding/guest состояний, который контролирует, какие действия доступны до full patient tier. В этой фазе можно править ровно следующее:

- удалить settings gear из правой части (если он там есть);
- разместить `Профиль` icon справа;
- запретить рендер desktop `Back` даже если `backHref` существует;
- сохранить guest-friendly fallbacks (без личного имени, аватара).

`PatientGatedHeader` не должен дублировать логику `PatientHeader`. Если внутри есть копипаста — это backlog, не задача этой фазы. Зафиксируйте в `LOG.md` как deferred refactor.

## Scope

Allowed files:

- `apps/webapp/src/app-layer/routes/navigation.ts`
- `apps/webapp/src/app-layer/routes/navigation.test.ts`
- `apps/webapp/src/shared/ui/AppShell.tsx`
- `apps/webapp/src/shared/ui/AppShell.test.tsx`
- `apps/webapp/src/shared/ui/PatientHeader.tsx`
- `apps/webapp/src/shared/ui/PatientHeader.test.tsx`
- `apps/webapp/src/shared/ui/PatientGatedHeader.tsx`
- `apps/webapp/src/shared/ui/PatientBottomNav.tsx`
- new `apps/webapp/src/shared/ui/PatientBottomNav.test.tsx`
- new `apps/webapp/src/shared/ui/PatientTopNav.tsx`
- new `apps/webapp/src/shared/ui/PatientTopNav.test.tsx`
- shared visual helper files from Phase 1 if needed
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`

Do not edit:

- individual home block components except if AppShell prop signature change forces minimal callsite updates;
- doctor/admin navigation;
- data modules/repos/routes.

## Implementation checklist

### Mobile max-width

- [ ] В `AppShell.tsx` для `variant="patient"` mobile контейнер использует `max-width: 430px` (Tailwind `max-w-[430px]` или новый patient token, но согласованно с bottom nav).
- [ ] `PatientBottomNav` контейнер имеет тот же `max-width: 430px` чтобы visually совпадать с контентным контейнером.
- [ ] Embed mode (`patientEmbedMain`) max-width не меняется.
- [ ] Desktop `patient-wide` остаётся в диапазоне `1120-1200px` (per `VISUAL_SYSTEM_SPEC.md §1`).
- [ ] Добавить тест в `AppShell.test.tsx` или `PatientBottomNav.test.tsx`, что `430px` константа применена к patient mobile (без brittle Tailwind class assertion — лучше через inline `style` или semantic data-attribute).

### Route/nav config

- [ ] Bottom nav items строго:
  - [ ] `Сегодня`
  - [ ] `Запись`
  - [ ] `Разминки`
  - [ ] `План`
  - [ ] `Дневник`
- [ ] Не добавлять `Профиль` в bottom nav.
- [ ] Добавить desktop nav config (или переиспользовать bottom config безопасно).
- [ ] Active matching logic общая для bottom/top nav.
- [ ] Маршруты централизованы в `routePaths`, никаких хардкоднутых строк.

### Bottom nav

- [ ] Скрыт на `lg+` (`hidden lg:hidden` или эквивалент через CSS media query).
- [ ] Использует patient tokens из Phase 1 (background, border, shadow, active/inactive colors).
- [ ] Высота `72-80px` + safe-area-inset-bottom.
- [ ] Tap targets `>= 44px`.
- [ ] `aria-current="page"` для активного item.
- [ ] Не вводить floating FAB.
- [ ] Optional: усиленный active style для центра `Разминки`, только когда active.

### Desktop top nav

- [ ] Создать `PatientTopNav.tsx` если подходящего компонента нет.
- [ ] Слева: brand icon/logo + текст `BersonCare`.
- [ ] Max-width согласован с patient content (`1120-1200px`).
- [ ] Nav items + active state (использует ту же active matching logic, что bottom nav).
- [ ] Profile icon справа.
- [ ] Notifications иконка только если уже есть config/data поддержка; не выдумывать notification model.
- [ ] Нет settings gear.
- [ ] Нет desktop `Back`.
- [ ] Нет отдельного `Home`.
- [ ] Скрыт на `< lg`.

### Header behavior

- [ ] Home mobile header: без top `Back`, без top `Home`, profile справа.
- [ ] Inner mobile pages: `Back` показывать когда `backHref` существует — **только на mobile**.
- [ ] Desktop: patient `Back` не показывать никогда (даже если `backHref` существует).
- [ ] Profile иконка остаётся доступной справа.
- [ ] Settings gear убран из patient header полностью.
- [ ] `patientHideBottomNav`, `patientEmbedMain`, auth/guest состояния продолжают работать.
- [ ] `PatientGatedHeader` синхронизирован с `PatientHeader` по этим правилам.

### Shell integration

- [ ] `AppShell` рендерит bottom nav и top nav взаимно исключающе по breakpoint `lg`.
- [ ] `AppShell` не рендерит patient top nav в `patientEmbedMain`.
- [ ] `patientHideBottomNav` скрывает bottom nav. Зафиксировать в `LOG.md`, скрывает ли он также desktop top nav (рекомендация: да).
- [ ] Avoid layout jump: padding-bottom для основного контента под bottom nav на mobile, padding-top под top nav на desktop.

### Tests

Targeted tests + один обязательный structural тест:

- [ ] `PatientBottomNav.test.tsx` — рендерит все 5 пунктов без `Профиль`.
- [ ] `PatientTopNav.test.tsx` — рендерит brand `BersonCare`, 5 пунктов, profile справа, без settings gear, без `Back`.
- [ ] `AppShell.test.tsx` — **mutual exclusivity test**: при viewport `< lg` bottom nav в DOM/visible, top nav скрыт; при `lg+` наоборот. Реализовать через mock `matchMedia` или через assertion на классы responsive visibility.
- [ ] `PatientHeader.test.tsx` — нет settings gear, profile справа, на desktop нет `Back`.
- [ ] `navigation.test.ts` — items строго `Сегодня/Запись/Разминки/План/Дневник` для bottom nav config.

### Docs/log

- [ ] Обновить `LOG.md`: финальный breakpoint (`lg` 1024px по умолчанию; если QA покажет, что планшет landscape лучше с bottom nav — поднять до `xl`).
- [ ] Зафиксировать решение по `patientHideBottomNav` + desktop top nav.
- [ ] Зафиксировать любые непокрытые сценарии notifications/profile menu.

## Tests/checks

Targeted tests:

- `pnpm --dir apps/webapp test -- src/shared/ui/PatientBottomNav.test.tsx`
- `pnpm --dir apps/webapp test -- src/shared/ui/PatientTopNav.test.tsx`
- `pnpm --dir apps/webapp test -- src/shared/ui/AppShell.test.tsx`
- `pnpm --dir apps/webapp test -- src/shared/ui/PatientHeader.test.tsx`
- `pnpm --dir apps/webapp test -- src/app-layer/routes/navigation.test.ts`

Then if TypeScript changed broadly:

- `pnpm --dir apps/webapp typecheck`

Run lint if class/style/import changes are broad:

- `pnpm --dir apps/webapp lint`

Do not run root `pnpm run ci`.

## Acceptance criteria

- Bottom nav visible `< lg` only.
- Desktop top nav visible `lg+` only.
- Mutual exclusivity verified by automated test.
- Mobile patient `max-width: 430px` applied to both content and bottom nav.
- Desktop has brand `BersonCare`.
- Desktop has no patient `Back`.
- Top header has no separate `Home`.
- Patient settings gear is absent.
- Bottom nav contains `Дневник`, not `Профиль`.
- `PatientGatedHeader` ведёт себя по тем же правилам.
- Tests for nav/header/shell pass or documented failures are fixed.
- `LOG.md` updated.

