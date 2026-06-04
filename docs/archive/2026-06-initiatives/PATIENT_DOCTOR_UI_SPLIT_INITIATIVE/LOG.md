# LOG — Patient / Doctor UI Split

## Phase 0 — Baseline (2026-06-04)

### Vitest baseline

```bash
pnpm --dir apps/webapp exec vitest run \
  src/shared/ui/patient/PatientAppShell.test.tsx \
  src/shared/ui/patient/shell/PatientTopNav.test.tsx \
  src/shared/ui/patient/shell/PatientBottomNav.test.tsx \
  src/app/app/patient/about/about-page.test.ts
```

**Result:** 4 files, 19 tests — all passed (post-split paths).

---

## Phase 1 — CSS split (2026-06-04)

- `globals.css` → `styles/tailwind-engine.css`, `patient.css`, `doctor.css`, `landing.css`
- New `app/app/layout.tsx` imports `patient.css`; `book`, `doctor`, `settings`, landing wired per plan
- `globals.css` deleted; `components.json` → `tailwind-engine.css`
- Gate: typecheck green; 0 runtime `globals.css` imports

---

## Phase 2 — Patient UI (2026-06-04)

- Patient shared under `shared/ui/patient/**` (shell, auth, media, markdown, primitives, …)
- `PatientAppShell` replaces patient `AppShell`; `AppShell.tsx` removed
- `DoctorAppShell` created (doctor routes migrated early for gate)
- ESLint patient zone isolation
- ESLint **`src/shared/ui/patient/**`** tree (no doctor, no `@/components/ui`)
- `DoctorCatalogMediaStaticThumb` copy in `doctor/media/`
- Gate: 0× `@/components/ui` in patient zone; 0× `@/shared/ui/AppShell`; typecheck green

### Phase 2 gate — formal close (2026-06-04, audit-fix)

Блокер перед фазой 3 — зафиксирован **до** phase 3 в тот же день; повторная верификация после code review:

```bash
# patient zone — 0 matches (each)
rg '@/components/ui/' apps/webapp/src/app/app/patient apps/webapp/src/app/book \
  src/modules/reminders src/modules/patient-diary \
  src/modules/messaging/components/ChatView.tsx
rg '@/shared/ui/patient' apps/webapp/src/app/app/doctor
rg '@/shared/ui/AppShell' apps/webapp/src

pnpm --dir apps/webapp run typecheck
pnpm test:webapp:fast   # корень монорепо → apps/webapp test:fast
```

**Result (2026-06-04 audit-fix):** все `rg` — 0; typecheck OK; `pnpm test:webapp:fast` — 953 files / 4764 tests passed.

---

## Phase 3 — Doctor UI (2026-06-04)

- Doctor shared under `shared/ui/doctor/**` (shell, catalog, primitives, markdown, media)
- `doctor.css` on settings layout
- Legacy `shared/ui/markdown/` and `shared/ui/media/` removed
- ESLint doctor zone isolation
- ESLint **`src/shared/ui/doctor/**`** tree (no patient, no `@/components/ui`)
- Gate: 0× cross-imports patient↔doctor in route trees; typecheck green

---

## Phase 4 — Close (2026-06-04)

- Updated `shared/ui/ui.md`, `docs/README.md`, `.cursor/rules/patient-doctor-ui-isolation.mdc`
- План перенесён в `.cursor/plans/archive/patient_doctor_ui_split_9a04ff8e.plan.md` (frontmatter + DoD синхронизированы)
- Full `pnpm run ci` — при закрытии инициативы (см. commit / CI на `main`); повтор audit-fix: `typecheck` + `pnpm test:webapp:fast` — OK (см. Phase 2 gate выше)

---

## Audit follow-up (2026-06-04)

Закрыты хвосты после code review:

- **Patient root leak:** `AuthBootstrap`, `EmailAccountPanel`, `InlineEditField`, `GuestPlaceholder`, `SupportContactLink` → `shared/ui/patient/` + `patient/primitives`.
- **Doctor root leak:** `ReferenceSelect`, `ReferenceMultiSelect`, `DataLoadFailureNotice`, `PickerSearchField`, `CreatableComboboxInput`, `doctorNavLinks` → `shared/ui/doctor/` + `doctor/primitives`; `SupportContactLink` скопирован в doctor.
- **Patient markdown ужат:** остались `MarkdownContent`, `markdownRenderTree`, `MarkdownEmbeddedLink` (+ test).
- **Patient media ужат:** удалён CMS picker stack; `mediaListItemTypes.ts` для `ContentHeroImage` / `fetchAdminMediaListItem`.
- **Doctor playback переименован:** `DoctorMediaPlaybackVideo`, `doctorHlsQuality`, `doctorPlaybackSourceKind`.
- **Документация:** `content-catalog.md` пути обновлены.
- **Проверки:** typecheck, lint, vitest baseline расширенный (45 tests) — OK.

### Cleanup remarks (2026-06-04)

- Root leak: `navChrome`, `selectOpaqueValueLabels`, `MaxBridgeScript` → копии в patient/doctor зонах; корневые файлы удалены.
- Dead code: `StatusBadge`, `RubitimeWidget`, `EmptyState`, `PlaceholderPage`, `InfoBlock`, legacy `shared/ui/marketing/*` (лендинг — `components/landing/`).
- `LegalBackButton` → `patient/primitives/button-variants`.
- Doctor playback: `DOCTOR_HLS_QUALITY_AUTO_VALUE`, `doctorPlaybackDiag`.
- Patient diary stats (`DiaryStatsPeriodBar`, `SymptomChart`, `LfkStatsTable`) → patient primitives; ESLint zone расширен.

### Manual patient smoke (post-split)

Операторский visual checklist (критерий приёмки №1 — визуально). **Не блокирует** закрытие mechanical split при зелёных автоматических gate (Phase 2 gate выше). Прогнать в браузере при следующем UX-релизе или при сомнении в CSS/regression:

- [ ] `/app/patient`, `/app/patient/booking/new`, `/app/patient/treatment` + item
- [ ] `/app/patient/diary`, `/app/patient/reminders`, `/app/patient/profile`
- [ ] `/book/new`
- [ ] 390px + 1180px viewports

---

## Status

**Initiative closed** — mechanical split + audit tails complete; plan archived in repo; doctor visual redesign remains out of scope.
