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

## Scope decisions (OWNER-CONFIRMED 2026-06-14)
**Global ordering rule (owner):** UI FIRST everywhere. Build each tab/page UI to match the wireframe etalon, verify it matches, THEN do backend functionality to the max. Don't block UI on backend.

1. **Карта (clinical core)** — UI first (faithful to wireframe incl. visit history + «+ Новый визит» panel). After UI verified, build backend to the max: minimal data model (visit/complaint/complaint_update/diagnosis/diagnosis_catalog/file) + read + create-visit. Push backend as far as time allows.
2. **Платежи (Учётка)** — REAL feature. Money via integrations (bank acquiring / payment systems like ЮMoney/ЮKassa) + manual cash entry. UI first (block with integration-sourced payments + manual cash add). Backend: model payments + manual cash; integration wiring is later (leave a clean port/stub for the acquiring side).
3. **Скрытое ФИО** — under the displayName show, in SMALLER text, the hidden real fields (firstName + lastName). Scope: ONLY inside the Пациенты area (the list rows/preview + the whole patient card). Not system-wide yet.
4. **Файлы tab** — BUILD THE BACKEND for real (files table/model + upload/list/preview + link-to-visit; single source shared with visit files). UI first (two-panel: list+filters / preview with Скачать·Открыть·Привязать к визиту), then real backend.
5. **Сегменты/фильтры** на Пациенты — keep wireframe terminology exactly (Все · На сопровождении · С программой · Приём в этом мес. · С абонементами · Подписчики · Новые · Бывшие · С отменами; каналы: Telegram/MAX/Email/Телефон/Архив).
6. **Записи** — real appointment history; drop reputation/merge (moved to Учётка); «Оформить визит» = bridge to Карта visit form.

---

## Waves
- **Wave 1 (foundation+backend, sequential):** routes skeleton (`/app/doctor/patients`, `/app/doctor/patients/[userId]`), routePaths, sidebar nav link; backend: list endpoint w/ all filters+segments + multi-field search (extend repo for tg/max/email/name); identity aggregate endpoint for card header (last visit, next appt, totals, support). Commit.
- **Wave 2 (parallel):** A=Patients list UI (filters/segments/search/preview/CTA). B=Patient card shell (header + 6-tab client nav + layout).
- **Wave 3 (parallel, after shell):** Обзор+Записи (real); Учётка+Файлы; Карта (faithful UI); Программа (port existing).
- **Wave 4:** audit each, fix, run app + screenshots.

## CONTRACTS (Wave 1 delivered — Wave 2+ consume these)
**Deps:** worktree needs its own `node_modules` — already `pnpm install`ed. Typecheck: `cd apps/webapp && npx tsc --noEmit`.

**Routes (paths.ts):** `routePaths.doctorPatients` = `/app/doctor/patients`; `routePaths.doctorPatientCard(userId)` = `/app/doctor/patients/:userId`. Nav link "Пациенты" added in `doctorNavLinks.ts`.

**List endpoint:** `GET /api/doctor/patients?q=&segment=&channel=&archived=` → `{ clients: ClientListItem[] }`.
- `segment` ∈ on_support | with_program | visited_month | memberships | new | former | subscriber | cancellations
- `channel` ∈ telegram | max | email | phone ; `archived=true` for archive.
- `ClientListItem` (modules/doctor-clients/ports.ts) fields: userId, displayName, phone, bindings(ChannelBindings), hasEmail, hasApp, nextAppointmentLabel, hasAppointmentHistory, activeAppointmentsCount, activeTreatmentProgram, activeTreatmentProgramInstanceId, cancellationCount30d, rescheduleCount30d, visitedThisCalendarMonth, hasConversation, unreadMessagesCount, unreadExerciseCommentsCount, isOnSupport, hasMemberships. (firstName/lastName NOT yet on list item — see TODO.)

**Card-header endpoint:** `GET /api/doctor/patients/:userId` → `{ ok, header: PatientCardHeader }`.
- `PatientCardHeader`: identity{userId,displayName,firstName,lastName,phone,email,bindings,isArchived,isBlocked,birthDate:null,age:null}, support{isOnSupport,supportMonthsApprox}, lastVisit{date,visitType:null,city:null}|null, nextAppointment{date,time,city:null,appointmentType:null}|null, totalVisits, cancellationsCount, reschedulesCount, firstVisitDate.
- TODO (no data source yet): birthDate/age, visitType, city, appointmentType. supportMonthsApprox is approximate.

**Server pages (placeholders to replace):** `app/app/doctor/patients/page.tsx` + `PatientsPageClient.tsx`; `app/app/doctor/patients/[userId]/page.tsx` + `PatientCardClient.tsx`. Follow exercises/page.tsx (promises + `use()`).

**Wave-1 TODO for later backend depth:** add firstName/lastName to ClientListItem (needed for hidden-name display in list rows/preview — owner answer #3); real birthDate field; visit type/city.

## ORCHESTRATION RULES for subagents
- Subagents DO NOT git commit/push (avoid index races when parallel). The orchestrator commits after each wave.
- Stay on branch claude/admiring-hodgkin-c8fa92. Never touch schedule/«Сегодня»/FullCalendar files.
- UI-first: match wireframe; use mock/stub data where backend absent; mark `// TODO(backend)`.

## Revised waves (UI-FIRST per owner)
- **W1 ✅** foundation (routes, list filters/search, header aggregate). Committed 08181ce0.
- **W2 (parallel):** A=Patients LIST full UI (search/segments/channels/preview w/ hidden name/CTA, real list endpoint). B=Patient CARD shell (real header + 6-tab client nav + per-tab content slots as placeholders).
- **W3 (parallel, after W2-B):** per-tab UI faithful to wireframe (mock data ok): Обзор, Карта, Записи, Файлы, Учётка(+Платежи block), Программа(port existing as-is).
- **W4:** backend depth — Карта clinical model+create-visit, Файлы backend (real), Платежи model (manual cash + acquiring port stub), add firstName/lastName to list item, wire real data.
- **W5:** audit + run app + headless screenshots + fixes.

## Status log (agents append here)
- (init) plan created.
- W1 done & committed (08181ce0). Deps installed in worktree. Typecheck clean for patient files.
- W2 done (a357b6b4): list page UI + card shell (header + 6-tab nav + tab scaffolds). Typecheck clean.
- W3 done (1f110283): all 6 tab UIs. Программа embeds existing PatientTreatmentProgramsPanel. VERIFIED by running app on :5300 + headless screenshots — all tabs render, no console errors.
- W4 done (b8887410): real per-patient appointments (Записи), all 9 segment counts real on list, Файлы backend (patient_files migration 0120 + module + S3 presign endpoints + wired UI). VERIFIED via app + screenshots.
- Polish: Записи clean loading state (no mock flash). VERIFIED.
- PUSHED to dimmdao/claude/admiring-hodgkin-c8fa92.

## VERIFIED STATE (2026-06-14 ~05:00) — ready for owner test
Run: from worktree `pnpm install` (done) → `cd apps/webapp && NODE_ENV=development npx next dev --webpack -H 127.0.0.1 -p 5300` → auth `/api/auth/dev-bypass?token=dev:doctor` → `/app/doctor/patients`. (Don't use webapp:dev — it kills :5200.)
- Пациенты list: search, 9 real segment counts, channel filters, preview with hidden real name + CTA. REAL data.
- Card header: REAL (displayName + hidden name, phone copy, channels, last/next/total). birthDate/age = «—» (no field yet).
- Обзор: faithful UI, MOCK data (widgets) — TODO(backend) wiring.
- Карта: faithful UI incl. «+ Новый визит» panel, MOCK data — clinical model is the big NEXT piece.
- Программа: REAL (embeds existing treatment-program panel) + «Полный вид →».
- Записи: REAL appointments (history + upcoming + abonement).
- Файлы: REAL backend (list/preview/link/upload-url via S3 presign); empty until uploads. Binary upload path = TODO.
- Учётка: faithful UI, MOST data MOCK; Платежи block (cash+acquiring note) per owner #2.

## REMAINING (next session, needs owner input where noted)
- Карта clinical model: visit/complaint/complaint_update/diagnosis/diagnosis_catalog/file tables + create-visit form wiring (biggest piece, owner-decision-heavy).
- Обзор widget wiring to real data (signals/symptoms/dynamics/exercise-calendar/notes/tasks/messages).
- Учётка: wire support/block/archive to existing endpoints; Платежи real model (manual cash + acquiring integration ЮKassa/ЮMoney); merge link; audit set.
- Файлы: in-browser binary upload via presigned PUT; visit-selector for «Привязать к визиту».
- Header: birthDate field (+ age), visit type/city.
- MINOR: Записи «Предстоящие» upcoming now shows; verify abonement is real not mock (currently mock panel).
- MERGE: when parallel «Сегодня»/schedule work settles, merge this branch into feat/doctor-ui-rebuild (watch for migration-number collision on patient_files 0120).
