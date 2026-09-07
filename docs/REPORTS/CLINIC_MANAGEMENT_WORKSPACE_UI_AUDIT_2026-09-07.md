# Clinic management workspace UI audit — 2026-09-07

**Result: FAIL.** The UI/composition candidate is not land-ready. A solo owner can directly enter the new management mode, and a clinic specialist without `appointments.manage_own` still has reachable appointment-creation controls outside the schedule tab.

## Audited revisions

- Required base: `c0e6d294f`
- Product UI candidate: `1738f2243`
- Audited checkout: `e8e60d170` (candidate plus the current `feat/doctor-ui-rebuild` merge)
- Prior backend/own-scope audit: `39271e811` was treated as retained evidence only; its scope was not re-audited.

## Test or view classification

| Surface / authority                                                                                                                                             | Method                                                     | Evidence                                                                                                                                                                                                                              | Result |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M2/DoD: clinic direct doctor URLs remain own-scoped; management-only membership does not obtain doctor schedule scope                                           | retained unit/route oracle                                 | `composition.unit.test.ts`, `_resolveDoctorScheduleScope.unit.test.ts`, `_doctorScheduleScope.route.test.ts`: 3 files, 9 assertions                                                                                                   | PASS   |
| M2/DoD: solo has no management mode; bound owner/admin can switch modes; management-only lands in management                                                    | candidate view of route guards, shell props, and consumers | `loadManagementWorkspace.ts` calls only `requireOrganizationManagementContext()` and never resolves composition; `DoctorWorkspaceShell.tsx` renders the switch from capability + specialist binding alone                             | FAIL   |
| M2/M3/DoD: management nav and Settings/profile placement reuse the canonical shell and existing writers                                                         | candidate diff + consumer view                             | `DoctorWorkspaceShell`/viewport/sidebar are reused; `ManagementBookingSections` renders the existing `ScheduleSetupTab`; solo profile and management specialist links both render `BookingSoloSpecialistsSection`                     | PASS   |
| M4/DoD: clinic specialist schedule has no Setup/package writer; own availability UI is read-only when disabled and applies, rather than edits, shared templates | candidate view plus retained server scope oracle           | `DoctorScheduleShell` omits `setup` when clinic composition; `ScheduleWorkTab` gates its own-date actions and template application; server routes retain `canMutateOwnAvailability` and management-only template CRUD                 | PASS   |
| M1/M4/DoD: `appointments.manage_own=false` removes every specialist-mode scheduling action while preserving read/comments/finance/package surfaces              | candidate consumer view                                    | `ScheduleCalendarTab` is gated, but `DoctorGlobalQuickActions`, `DoctorTodayQuickActions`, `PatientTabRecords`, and `PatientEncounterStartModal` call `DoctorNewAppointmentModal` / `DoctorAppointmentCreatePanel` with no capability | FAIL   |
| M6: timezone picker remains the one shared picker/data set and candidate changes only doctor-control geometry                                                   | historical/current diff and consumer view                  | relative to `23e4ed4e7`, `DoctorTimezoneSelect.tsx` changes control height/radius/focus geometry and adds the class prefix; `mergePatientTimezoneSelectLabels` and the existing picker remain                                         | PASS   |
| M6/repo UI rules: no new equivalent shell/container or patient/doctor import leak                                                                               | candidate diff + scoped ESLint                             | only management nav/shell composition is added; scoped ESLint passes                                                                                                                                                                  | PASS   |

## Reachable findings

1. **MUST FIX — solo owner can enter management mode.** `app/manage/loadManagementWorkspace.ts` authorizes only `organization.management`; it does not resolve `clinic_team` entitlement/seats through `resolveDoctorWorkspaceComposition`. Thus a solo owner with that ordinary management capability can open `/app/manage` directly and receives the new management shell and Team/catalog navigation. `DoctorWorkspaceShell.tsx` also renders the mode switch without a composition input, so the same solo bound owner sees it in doctor chrome. Impact: the required solo/specialist separation is bypassed and the user receives a nonexistent admin mode. Authority: plan §§3.1–3.2, M2, DoD “Solo не видит Team/admin mode”.

2. **MUST FIX — appointment creation remains visible with `appointments.manage_own=false`.** The candidate passes the capability to `DoctorScheduleShell` and its calendar panel, but not to the established creation entry points: `DoctorGlobalQuickActions.tsx`, `DoctorTodayQuickActions.tsx`, `patients/[userId]/tabs/PatientTabRecords.tsx`, and `PatientEncounterStartModal.tsx` all open `DoctorNewAppointmentModal` / `DoctorAppointmentCreatePanel` without it. Those forms consequently default `DoctorCalendarEventPanel` to `appointmentsManageOwn=true` and expose a create flow to a read-only clinic specialist. The mutation route may later deny the request, but the required UI read-only behavior is still violated. Impact: the specialist can initiate and fill a prohibited scheduling action from desktop/mobile/patient surfaces. Authority: plan §5 matrix, M4, DoD “two mutation-permissions enforce read-only сервером и UI”.

## Fault injection

No new acceptance test was retained. The two failures are composition/action-visibility findings, for which the brief requires diff/consumer view rather than UI/DOM/text assertions; a source-shape or element-count test would be prohibited by `AGENTS.md` §§10a, 10b, and the audit brief. No temporary production fault was introduced, and no production code was changed by this audit.

The retained server oracle has the prior independent fault-injection record in `docs/REPORTS/CLINIC_MANAGEMENT_WORKSPACE_AUDIT_2026-09-07.md`; it was rerun only to confirm its current behavior on this checkout, not used to accept the new UI findings.

## Commands and results

```bash
pnpm --dir apps/webapp exec vitest run --project unit --project route \
  src/modules/doctor-workspace/composition.unit.test.ts \
  src/app/api/doctor/booking-engine/_resolveDoctorScheduleScope.unit.test.ts \
  src/app/api/doctor/booking-engine/_doctorScheduleScope.route.test.ts
```

PASS — 3 files, 9 tests.

```bash
pnpm --dir packages/shared-contracts build && pnpm --dir packages/platform-merge build
pnpm --dir apps/webapp typecheck
```

PASS. The first typecheck attempt exposed missing built workspace package declarations and ten existing typed test fixtures that lacked the new mandatory context fields. The package build command above restored the local linked declarations; only the ten permitted test fixtures were updated with `appointmentsManageOwn` and `availabilityManageOwn` values. No dependency or production-type change was made.

```bash
pnpm --dir apps/webapp exec eslint \
  src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx \
  src/app/app/doctor/layout.tsx src/app/app/doctor/schedule/DoctorScheduleShell.tsx \
  src/app/app/doctor/schedule/page.tsx src/app/app/doctor/schedule/scheduleTabRegistry.ts \
  src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx \
  src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx \
  src/app/app/manage/ManagementBookingSections.tsx src/app/app/manage/layout.tsx \
  src/app/app/manage/managementNav.ts src/app/app/manage/online-booking/page.tsx \
  src/app/app/manage/page.tsx src/app/app/settings/layout.tsx \
  src/app/app/settings/page.tsx src/app/app/settings/settingsTabs.ts \
  src/shared/ui/doctor/doctorNavIcons.ts src/shared/ui/doctor/doctorNavLinks.ts \
  src/shared/ui/doctor/managementNavLinks.ts \
  src/shared/ui/doctor/shell/DoctorAdminSidebar.tsx \
  src/shared/ui/doctor/shell/DoctorHeader.tsx \
  src/shared/ui/doctor/shell/DoctorMenuAccordion.tsx \
  src/shared/ui/doctor/shell/DoctorWorkspaceModeSwitch.tsx \
  src/shared/ui/doctor/shell/DoctorWorkspaceShell.tsx \
  src/shared/ui/doctor/shell/DoctorWorkspaceViewport.tsx \
  src/app/api/doctor/booking-engine/_doctorAppointmentMutationScope.route.test.ts \
  src/app/api/doctor/booking-engine/_doctorAppointmentReadScope.route.test.ts \
  src/app/api/doctor/booking-engine/_resolveDoctorAppointmentAccess.unit.test.ts \
  'src/app/api/doctor/patients/[userId]/fio/fio.route.test.ts' \
  'src/app/api/doctor/patients/[userId]/messages-snapshot/messagesSnapshot.route.test.ts' \
  'src/app/api/doctor/patients/[userId]/patientCardNeverGated.route.test.ts' \
  src/app/api/doctor/requestAccess.route.test.ts \
  src/app/api/payments/patientAcquiring.route.test.ts \
  src/app/app/settings/TeamSection.ui.test.tsx \
  src/modules/organization-membership/service.test.ts
pnpm --dir apps/webapp exec prettier --check <the same explicit path list>
git diff --check
```

PASS. The Prettier command used exactly the same explicit path list above; no full CI or live UI walkthrough was run.

## Scope boundaries observed

- No DEV migration, dev server, live visual walkthrough, deploy, push, or land was run.
- M5 remains owner-blocked and no alternate clinic appointment calendar was introduced.
- The audit commit contains only this report and the ten necessary typed test fixtures.
