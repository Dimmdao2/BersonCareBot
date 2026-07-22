# Track A — per-checkbox UI evidence matrix

**Authority chain:** `WORK_ORDER.md` §2–3 (2026-07-22) → Design DNA v1.0/v1.1 →
`DOCTOR_DNA_MIGRATION/PLAN.md` → `DOCTOR_UI_REWORK_2026-07-20/PLAN.md` →
`SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`.

`WORK_ORDER.md` §2 supersedes every active white/inherited doctor-canvas instruction: the doctor canvas is
exactly `#F6F4EF`; headers and primary work surfaces remain white. This pass does not activate product gates
`#848`, `#963`, `#964` or dependency-gated UI-5b.

## Live-evidence status

**NOT AVAILABLE.** On 2026-07-22 this isolated worktree has neither `.env` nor `apps/webapp/.env.dev`.
`pnpm run webapp:dev` correctly starts only DEV `127.0.0.1:5200`, then exits before a page can render because
`SESSION_COOKIE_SECRET` is absent (and webpack reports the missing Node builtin from the resulting instrumentation
build). No screenshot is claimed and no DEV environment was fabricated. Consequently no visual checkbox is
accepted as real-done in this matrix.

| Checkbox (quoted) | Code evidence | Test evidence | Live PNG | Verdict |
|---|---|---|---|---|
| `Навесить theme-bersoncare-doctor-dna на #app-shell-doctor (токен-флип: холст/синий/радиус).` | `DoctorAppShell.tsx:28-39` attaches the class in both layouts. | `doctorDnaTheme.contract.test.ts:8-15` verifies the scoped adapter. | Not available; see status above. | partial |
| `Подключить и применить Nunito в doctor-scope (--font-sans).` | `bersoncare-tweakcn-theme.css:47,93-96` declares and applies `--bc-font-sans`. | No focused font-load test found. | Not available. | partial |
| `Ввести DNA-строку списка … применить на: Сегодня, Клиенты, Настройки.` | `DoctorDnaFlatListRow.tsx:1-33` exists; `PatientsPageClient.tsx:764-783` uses it. Settings consumer was not proven. | `DoctorPresentationChrome.test.tsx:68-82`; Clients test covers list consumer. | Not available. | partial |
| `Убрать захардкоженный холодный #f7f9fc в doctor.css, где он бьётся с холстом.` | `doctor.css:3-20` uses the DNA canvas token; no matching hardcoded value in that file. | `doctorDnaTheme.contract.test.ts:8-15`. | Not available. | partial |
| `Скриншоты 3 экранов (desktop+mobile) владельцу → его решение по строкам/холсту/шрифту.` | No repository runtime artifact can replace the requested owner review. | N/A — owner/live acceptance. | Not available. | owner-deferred |
| `P2B-01 Desktop «Сегодня» использует точное разделение 50/50; mobile composition не регрессирует.` | `DoctorTodayDashboard.tsx` is recorded by the detailed-plan evidence as `md:grid-cols-2`; current live/mobile proof not available. | Existing focused Today test is historical only in this pass. | Not available. | partial |
| `P2B-02 … Doctor workspace canvas uses exact Design DNA #F6F4EF; page headers and primary surfaces remain white.` | `doctor.css:3-16`; `bersoncare-tweakcn-theme.css:89-96`. This pass removes both `#faf9f4` fallbacks. | `doctorDnaTheme.contract.test.ts:8-15` PASS. | Not available. | partial |
| `P2B-03 Shared section tabs имеют более тёмный neutral hover …` | `DoctorSectionTabs.ts` is the shared contract cited by the plan. | `DoctorPresentationChrome.test.tsx:84-95` PASS. | Not available. | partial |
| `P2B-04 Видимая сетка Today calendar начинается ровно за один час …` | Existing implementation is outside this pass; the plan records `deriveCalendarVisibleTimeWindow` reuse. | Historical focused test only; not rerun here. | Not available. | partial |
| `P2B-05 … «Открыть расписание» … standard doctor button …` | Existing implementation is outside this pass. | Historical focused test only; not rerun here. | Not available. | partial |
| `P2B-06 Clients и Messages используют общий flat-list row contract …` | `PatientsPageClient.tsx:761-783` consumes `DoctorDnaFlatListRow`; Messages consumer not re-censused in this narrow pass. | `DoctorPresentationChrome.test.tsx:68-82`; Clients test PASS. | Not available. | partial |
| `P2B-07 Semantic doctor primary остаётся ровно #406ca7 …` | `bersoncare-tweakcn-theme.css:103` maps doctor `--primary` to `#406ca7`. | `DoctorPresentationChrome.test.tsx:39-66` checks semantic consumers. | Not available. | partial |
| `P2B-08 Page headers и фактические input surfaces белые.` | `doctor.css:6`; shared doctor Input uses `bg-white`. | `DoctorPresentationChrome.test.tsx:29-66` PASS. | Not available. | partial |
| `P2B-09 Shared radius scale соблюдена …` | Detailed-plan census records local `rounded-lg` exceptions in Clients/Messages shells. | No complete current consumer test. | Not available. | fake-done |
| `P2B-10 Основные page-blocks используют внутренний padding 18px через shared doctor primitives …` | `PatientsPageClient.tsx:701-704,812` uses shared tokens, but the authoritative census still identifies local shell padding exceptions. | `DoctorPresentationChrome.test.tsx:20-27` proves primitive only. | Not available. | fake-done |
| `P2B-11 KPI используют единый порядок label сверху → value снизу …` | `DoctorStatCard.tsx` is the shared consumer referenced in the plan. | Existing presentation test is historical; not rerun here. | Not available. | partial |
| `P2B-12 Поиск «Клиентов» находится в правом слоте белой page header …` | `PatientsPageClient.tsx:655-688`. | `PatientsPageClient.test.tsx:428-525` PASS. | Not available. | partial |
| `P2B-13 Primary text строк Clients/Messages/Today support крупнее и легче …` | `PatientsPageClient.tsx:787`; `DoctorDnaFlatListRow.tsx` supplies the shared primary class. | `DoctorPresentationChrome.test.tsx:68-82` PASS. | Not available. | partial |
| `P2B-14 Изменения переиспользуют shared doctor primitives … и сохраняют … isolation …` | Client path uses doctor primitives; full no-local-forks proof is blocked by P2B-09/10 census. | Focused component tests only. | Not available. | fake-done |
| `Обычный desktop mode использует split 50/50.` | `PatientsPageClient.tsx:689-700` passes `lg:grid-cols-2` to `CatalogSplitLayout.tsx:21-56`. | `PatientsPageClient.test.tsx:428-525` exercises the normal list/preview flow. | Not available. | partial |
| `Правая половина содержит functional patient preview, а не только фильтры или пустое место.` | `PatientsPageClient.tsx:808-812`; `PatientPreviewPane.tsx:1-446`. | `PatientsPageClient.test.tsx:428-525` PASS. | Not available. | partial |
| `Открытие полной карточки заменяет весь doctor content workspace; sidebar остаётся.` | The preview has only the canonical link (`PatientPreviewPane.tsx:401-406`); full card is the protected route rendered under `DoctorAppShell` (`patients/[userId]/page.tsx:203-220`). No card tree is supplied to the right pane. | `PatientsPageClient.test.tsx:428-525` proves the canonical route + `returnTo` state. | Not available. | partial |
| `Карточка не втискивается в right pane и не создаёт второй component tree/iframe.` | `PatientsPageClient.tsx:808-812` renders only `PatientPreviewPane`; no full-card import. `PatientPreviewPane.tsx:401-406` uses a route link. | `PatientsPageClient.test.tsx:428-525` PASS. | Not available. | partial |
| `«К клиентам» восстанавливает search/sort/filters/selected preview/scroll.` | `patientListWorkspaceState.ts:45-115`; protected route sanitizes and uses it (`patients/[userId]/page.tsx:201-216`). | `PatientsPageClient.test.tsx:527-570` PASS. | Not available. | partial |
| `Direct URL, reload и browser back/forward сохраняют card/list mode.` | `patients/[userId]/page.tsx:28-45,201-220`; `patientListWorkspaceState.ts:45-115`. | `PatientsPageClient.test.tsx:550-589` covers validated URL state; browser history remains untested live. | Not available. | partial |
| `Переиспользованы exact standalone loader/guards/data/API; доказана guard-equivalence …` | `patients/[userId]/page.tsx:36-44` performs the existing workspace guard and identity lookup; `PatientsPageClient.tsx` links to that route. | Route boundary test exists, but no current guard-equivalence live seal. | Not available. | partial |
| `Полный UI-5b …` (all composition/history policy checkboxes). | `IMPLEMENTATION_ROADMAP.md:1281-1289` explicitly limits UI-5a and prohibits this scope before U5A. | N/A — dependency gate. | Not available. | owner-deferred |
| `SCH-G5 остаётся отдельным owner gate #848 …` | `DOCTOR_UI_REWORK_2026-07-20/PLAN.md:29-31`. | N/A — owner gate. | N/A. | owner-deferred |
| `«Самые активные», новые counters и hiding semantics … после exact contract (#963).` | Detailed plan identifies the missing contract. | N/A — contract dependency. | N/A. | owner-deferred |
| `Scheduling …` / durable scheduled-message UI-7 checkboxes (`#964`). | Detailed plan classifies the stage as high-risk and unimplemented. | N/A — unstarted high-risk stage. | N/A. | owner-deferred |

## Verification performed

- `pnpm --dir apps/webapp exec vitest run src/app/styles/doctorDnaTheme.contract.test.ts src/app/app/doctor/patients/PatientsPageClient.test.tsx src/shared/ui/doctor/DoctorPresentationChrome.test.tsx` — **PASS, 3 files / 22 tests**.
- `pnpm --dir packages/error-tracking build && pnpm --dir apps/webapp typecheck` — **PASS**. The prerequisite package build was necessary because the isolated worktree had no materialized `@bersoncare/error-tracking` output.
- `pnpm --dir apps/webapp lint` — **PASS**.

## Stage reports

`closed 0/5 against docs/_TODO/DOCTOR_DNA_MIGRATION/PLAN.md`

**NOT DONE:** every S0 row still needs its required live desktop/mobile batch and owner review; the Settings list-row consumer is not proven.

`closed 0/14 against docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md#ui-p2b--977--latest-owner-visual-contract-lock-2026-07-22`

**NOT DONE:** live evidence is unavailable; P2B-09/10/14 remain false-done according to the detailed-plan census and need an owner decision on shell classification before a presentation correction.

`closed 0/6 against docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md#u5b--organization-patient-card-and-history-policy`

**NOT DONE:** UI-5a has code/test evidence but not live proof; UI-5b remains dependency-gated. `#848`, `#963`, and `#964` remain owner/dependency-gated and untouched.
