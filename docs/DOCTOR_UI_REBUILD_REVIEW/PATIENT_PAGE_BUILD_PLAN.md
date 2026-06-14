# Patient Page Build — Orchestration Plan (2026-06-14, overnight)

**Goal:** Build the doctor-facing **Patient card** (карточка пациента, 6 tabs) and finish the **Patients list** page (Пациенты: filters + search + preview + link to card). Deliver a navigable, visually-faithful, testable UI by morning. Real data where cheap; faithful UI + stub data where backend is deep.

**Branch:** working on `claude/admiring-hodgkin-c8fa92` (== `feat/doctor-ui-rebuild` at start). Parallel chat owns `feat/doctor-ui-rebuild` in the MAIN worktree (schedule/«Сегодня» work) — do NOT touch schedule/today files. Commit regularly here; push after big blocks. Do NOT run FULL CI (parallel dev). Use `pnpm test:webapp` / typecheck locally.

## Reference
- Design: `docs/design/doctor-cabinet-wireframe.html` — `#p-patients` (list, ~lines 170-215), `#p-patient-card` (card, ~217-882), tabs `#pp-karta`, `#pp-program` (~695-810), visit panel `#visit-panel` (~401-471).
- Backlog/intent: `docs/design/bersoncare-карточка-пациента-бэклог.md` (read it — defines the 6 tabs & data model).
- ПРОГРАММА tab: **port existing implementation as-is**, redesign is a separate story.

## Canonical patterns (MUST reuse — don't hand-roll)
- Etalon list/catalog page: `apps/webapp/src/app/app/doctor/exercises/page.tsx` + `ExercisesPageClient.tsx`.
- Layout: `DoctorCatalogPageLayout`, `CatalogSplitLayout`, `CatalogLeftPane`, `CatalogRightPane`, `DoctorCatalogFiltersToolbar` under `@/shared/ui/doctor/...`.
- Visual constants/classes: `@/shared/ui/doctor/doctorVisual.ts` (section card/title/metric classes; radii xl/lg/md only; text-base/sm/xs only).
- Shell/auth: `apps/webapp/src/app/app/doctor/layout.tsx`, `DoctorWorkspaceShell`, `DoctorAdminSidebar`.
- Routes registry: `apps/webapp/src/app-layer/routes/paths.ts` (add `doctorPatients` + `doctorPatientCard`).
- Tabs: load page once, switch tabs client-side (hide inactive) — do not server-refetch per tab.

## Clean architecture (MUST follow)
- DB only via ports (`modules/*/ports.ts` interfaces) implemented in `infra/repos/*`. No `@/infra/db` or `@/infra/repos` imports inside modules or routes.
- Routes: parse → validate (Zod) → authorize (`requireDoctorAccess`) → call service via `buildAppDeps()` → return. No business logic in routes.
- Migrations via Drizzle (`apps/webapp/db/schema/*.ts` + drizzle-kit generate), not raw SQL.

## Existing backend reuse
- Module `modules/doctor-clients/` — `DoctorClientsPort`: `listClients(filters)`, `getClientIdentity(userId)`, `getClientSupport`, archive/block/support mutations, `getDashboardPatientMetrics`.
- Types: `ClientListItem` (rich: contacts, nextAppointmentLabel, activeTreatmentProgram, cancellation/reschedule counts, visitedThisCalendarMonth, unread counts, isOnSupport, hasMemberships), `ClientIdentity` (name/phone/email/bindings/created/blocked/archived/firstName/lastName).
- Repo: `infra/repos/pgDoctorClients.ts`. DI: `app-layer/di/buildAppDeps.ts`.
- Tables: `platform_users`, `user_channel_bindings`, `doctor_patient_support`, `appointment_records`, `treatment_program_instances`, `entity_comments`.

## Run & verify
- Dev: `pnpm run webapp:dev` → http://127.0.0.1:5200 . Doctor login bypass per memory `dev-doctor-login`.
- Verify by running app + headless screenshots before declaring done.

---

## Scope decisions (defaults chosen autonomously; owner confirms in AM)
1. **Карта (clinical core)** — biggest piece. Tonight: faithful read-only UI from wireframe + minimal data model (visit/complaint/diagnosis read) + list of visits; «+ Новый визит» create form is a **stretch** goal, stub if needed. Full clinical forms = multi-day (backlog confirms).
2. **Платежи (Учётка)** — source undecided → render as a disabled/placeholder block.
3. **Терминология** — use «Пациент» in new UI. Show displayName; expose real name where available. Hidden-name concept deferred.
4. **Файлы tab** — no clear files table → faithful two-panel UI with stub/empty + wire to entity_comments media only if trivial.
5. **Записи** — real appointment history; drop reputation/merge (moved to Учётка); «Оформить визит» = link/stub to Карта.

---

## Waves
- **Wave 1 (foundation+backend, sequential):** routes skeleton (`/app/doctor/patients`, `/app/doctor/patients/[userId]`), routePaths, sidebar nav link; backend: list endpoint w/ all filters+segments + multi-field search (extend repo for tg/max/email/name); identity aggregate endpoint for card header (last visit, next appt, totals, support). Commit.
- **Wave 2 (parallel):** A=Patients list UI (filters/segments/search/preview/CTA). B=Patient card shell (header + 6-tab client nav + layout).
- **Wave 3 (parallel, after shell):** Обзор+Записи (real); Учётка+Файлы; Карта (faithful UI); Программа (port existing).
- **Wave 4:** audit each, fix, run app + screenshots.

## Status log (agents append here)
- (init) plan created.
