# C3M-11 support group, terminology and per-client UI audit — #1098

- Product candidate: `6b8fd27328ba10997d20eeac2e5dee67ad33f19d` (with `c0f3a618a48402fc1502f01a4a25c371f3c19606`)
- Candidate base: `dffb66f82` (merge of `feat/doctor-ui-rebuild`)
- Branch HEAD before auditor changes: `6b8fd2732`
- Authority: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` C3M-11, C3M.6, C3M.8;
  `docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_MODE_2026-09-02.md` owner clarification 07.09.2026
- Role: `auditor-live`

## Test or look

- Automated behavior: organization-scoped override persistence, policy source/effective result,
  reset-to-default, `on_support` inheritance, portal separation from the group defaults.
- Live inventory: visible terminology, star/filter affordance, panel data contract, desktop/mobile
  consistency — checked on an isolated dev port against the named DEV database.
- Diff/architecture inspection: absence of a second group/dictionary, absence of booking coupling,
  parent-OFF handling, rename write path.

## Blind kill-set (written from authority before reading candidate tests)

1. A `favorite` column, entity or second dictionary appears beside `onSupport`.
2. Renaming the group mutates membership or client data.
3. Support profile read/write is not fully organization-scoped (cross-org fallback).
4. A per-client override cannot express or return to true `inherit` (reset-to-default is dropped).
5. An explicit client allow/deny stops winning over the channel default.
6. An inherited `on_support` channel stops following current group membership.
7. A parent module OFF overwrites the stored per-client choice instead of only hiding it.
8. The client portal is resolved through the support-group default mode.
9. Booking, prepayment or schedule starts consulting group membership.
10. Hardcoded visible terminology remains on an inventoried active surface.

## Result

**FAIL — two product findings.** The stage's model is right: one `onSupport` group behind a chosen display
name, one resolver, tri-state overrides with an explicit reset, no second mechanic and no booking coupling.
Two defects block acceptance: the terminology provider does not compile, and the terminology rollout is
partial in exactly the way C3M.8 declares insufficient.

### MUST FIX C3M11-A1 — the terminology provider does not bind its own prop; webapp does not compile

`apps/webapp/src/shared/ui/doctor/shell/DoctorPatientTermsContext.tsx:18-30` declares
`supportGroupLabel?: string` in the props type but destructures only `{ patientLabel, children }`. The
`useMemo` body and dependency array then reference a free identifier.

- `pnpm --dir apps/webapp typecheck` (all workspace packages built) reports exactly two errors, both here:
  `(27,50)` and `(28,20) error TS2304: Cannot find name 'supportGroupLabel'`. There are no other typecheck
  errors anywhere in the webapp, so this is the sole build blocker.
- ESLint confirms it independently: `react-hooks/exhaustive-deps` reports `supportGroupLabel` as an
  *outer scope value*, i.e. not a prop.
- Runtime consequence: after type stripping the identifier is unresolved, so evaluating the `useMemo`
  dependency array throws `ReferenceError` inside `DoctorWorkspaceShell` — every `/app/doctor` page fails.
- Adding `supportGroupLabel,` to the destructuring makes the whole webapp typecheck clean (verified, then
  reverted). The wiring around it — `loadDoctorWorkspaceShell` → `layout.tsx` → `DoctorWorkspaceShell` →
  provider — is already correct, so the fix is that one binding.
- Same defect class as the one `6b8fd2732` already fixed for `PatientsPageClient`; this instance was missed.

### MUST FIX C3M11-A2 — group and client terminology stay hardcoded on active surfaces

C3M.8 states that switching one page while «Клиент/Пациент/На сопровождении» remain hardcoded «не считается
выполнением», and the owner clarification of 07.09.2026 requires both choices to come through the one
terminology layer «без hardcode и page-level подстановок». Live on an isolated port with
`support_group_label=favorites` and `patient_label=клиент` (candidate plus the C3M11-A1 binding, so the shell
could render), the same screens show both names at once:

- `apps/webapp/src/app/app/doctor/patients/[userId]/PatientCardClient.tsx:595` — the client card hero renders
  `★ На сопровождении с 30.05.2026` while the ★ marker and the support panel heading on that same card render
  «Избранные». Live HTML: `Избранные=1`, `На сопровождении=1` on one page.
- `apps/webapp/src/shared/ui/doctorScreenTitles.ts:31` — `'/app/doctor/patients': 'Пациенты'` renders as the
  page header title while the sidebar item on the same screen renders «Клиенты» (live: 6× «Клиенты», the one
  «Пациенты» being this header). This file is named in the terminology inventory §2.2 as a literal source.
- `apps/webapp/src/app/app/doctor/patients/PatientsPageClient.tsx:669` — the mobile star **filter** keeps
  `aria-label="Только на сопровождении"` while the ★ inside that same button carries
  `title="Избранные" aria-label="Избранные"`. This is the star/filter affordance the stage is named after.
- `apps/webapp/src/app/app/doctor/patients/PatientsPageClient.tsx:133` — the segment tile tooltip stays
  «Сейчас на активном сопровождении.» although the candidate switched that tile's own title.
- `apps/webapp/src/app/app/doctor/DoctorTodayDashboard.tsx:157` — `'Все на сопровождении'` / `'Открыть
  клиентов'`, in the same section whose heading and empty state the candidate did switch.
- `apps/webapp/src/app/app/settings/DoctorTodayPreferencesSection.tsx:30,79` — «На сопровождении» as the
  visible option label for the Today people-list mode.
- `apps/webapp/src/app/app/doctor/analytics/soprovozhdenie/SoprovozhdeniePage.tsx:41` — «Активные на
  сопровождении» card title.

The chooser's own option labels in `SettingsForm.tsx:395-396` are correct and out of scope: they name the two
choices rather than apply one.

## Kill-set results

| # | Class | Method | Result |
| --- | --- | --- | --- |
| 1 | Second group/dictionary | inspection | PASS — no `favorite` column or entity; `'favorites'` is only a label value in `patientTerms.ts` |
| 2 | Rename mutates data | inspection + live | PASS — the write path normalizes a label into `system_settings` only; membership unchanged after the live flip |
| 3 | Organization isolation | test | PASS — `requireOrganizationPrincipal` on every profile read/write; route test proves no cross-org fallback |
| 4 | Reset-to-default lost | test | PASS — new acceptance test; `z.boolean().nullable().optional()` plus the `!== undefined` upsert keep `null` distinct from absent |
| 5 | Explicit allow/deny loses | test | PASS — existing `resolveClientChannelPolicy` test |
| 6 | Inherited `on_support` stops following membership | test | PASS — existing test |
| 7 | Parent OFF overwrites stored choice | inspection | PASS — the panel filters controls by module and never writes on filter; stored overrides survive |
| 8 | Portal joins the group defaults | test | PASS — new test; `portalAllowed` reads only the client's own exception |
| 9 | Booking/prepayment/schedule consult membership | inspection | PASS — no `onSupport` reference in booking, appointments or memberships |
| 10 | Hardcoded visible terminology | live inventory | **FAIL — C3M11-A2** |

Beyond the kill-set: `PatientTabOverview.tsx:2237` changing `!isComposed` to `isOverviewComposition` is
correct, not a regression — the card's only caller passes `compositionMode="overview"`, so the support panel
had been unreachable and is now rendered.

## Fault injection — one per independent class

| Fault | Injected change | Reddened assertion |
| --- | --- | --- |
| F1 explicit override stops winning | dropped `override ??` in `resolveClientChannelPolicy` | «gives explicit client choices precedence over workspace defaults» |
| F2 `on_support` stops following membership | `mode === 'on_support'` without the `onSupport` check | «makes on_support inheritance follow the current support state» |
| F3 portal joins the group default | `portalAllowed` routed through `allows(..., defaults.direct_chat)` | «keeps the client portal out of the support-group channel defaults» (3 assertions) |
| F4 reset-to-default dropped | route schema `.nullable()` removed from `commentsEnabled` | «lets an explicit client exception be reset back to the changeable default» |
| F5 cross-org fallback | organization replaced by a literal in the support read | «reads and changes only the selected organization support row» |

All five caught; all temporary product changes reverted (`git diff` on both product files is empty).

## Auditor changes (tests and this artifact only, no product fix)

- `supportPolicy.c3m09.audit.unit.test.ts` — repaired three exact-shape assertions that C3M-10 broke by adding
  `portalAllowed` to the resolver result, and added the missing portal-vs-group-default class.
- `organizationScopedSupport.route.test.ts` — taught the stale fake deps the ports the candidate's GET handler
  now calls (`getClientChannelPolicy`, `getDoctorWorkspaceClientDefaults`) and the two overrides added since
  C3M-02, then added the reset-to-default acceptance test.

## Pre-existing red gates inherited from the merge base — not this candidate

- `supportPolicy.c3m09.audit.unit.test.ts` was already failing at `dffb66f82`: C3M-10 (`e82c4a43a`) added
  `portalAllowed` to the resolver without updating the exact-shape assertions. Every input to that test is
  byte-identical between base and candidate. Repaired here.
- `organizationScopedSupport.route.test.ts` was broken **by** this candidate (new GET deps against a stale
  fake). Repaired here; behavior oracle unchanged.
- `accessLifecycleSurfaces.ui.test.tsx` fails 5/16 with `Cannot read properties of undefined (reading
  'getSeatStatus')` at `loadDoctorWorkspaceShell.ts:109`. That call arrived with `48a1a13c1 fix(clinic): close
  management UI audit #1099` through the merge; neither the line nor the test file is in this candidate's
  diff. Left for the #1099 owner — fixing it here would be scope creep.
- `inMemoryDoctorClients.updateClientSupport` silently drops `portalEnabled`, so the in-memory port no longer
  matches the pg port that C3M-02 required to stay in parity. Test-only path, no production impact.

## Environment note

The named DEV database was missing `be_organization_members.appointments_manage_own` /
`availability_manage_own`, so every `/app/doctor` page returned 500 in the layout before any candidate code
ran. Applied through the sanctioned entrypoint (`deploy/host/migrate-dev.sh --preflight` then `--execute`,
both PASS); `20260907T141500_clinic_membership_clinical_permissions` is now in the ledger and DEV is current.
This was a stale shared-DEV state, not a candidate defect. The live check's `support_group_label` was restored
to `on_support` afterwards.

## Gates

| Gate | Result |
| --- | --- |
| `pnpm --dir apps/webapp typecheck` | **FAIL** — 2 errors, both C3M11-A1; clean once the binding is added |
| Targeted tests (`supportPolicy.c3m09`, `organizationScopedSupport.route`) | PASS — 4/4 and 5/5 |
| Targeted tests (`DoctorTodayDashboard.ui`, `workspaceRouteProjection`, `communications page projection`, `PatientTabOverview.ui`, `PatientCardClient.ui`, `doctorWorkspaceComposition`) | PASS |
| `accessLifecycleSurfaces.ui` | FAIL — pre-existing, see above |
| Scoped ESLint over the 13 candidate files plus both tests | 0 errors, 1 warning (the C3M11-A1 symptom) |
| `check-db-chokepoint`, `check-no-new-raw-sql`, `check-webapp-infra-import-boundary` | PASS |
| `git diff --check` | clean |
| Live isolated DEV (`127.0.0.1:5310`), doctor desktop and mobile DOM | star, segment tile, Today heading, panel API contract follow the setting; C3M11-A2 surfaces do not |

No full CI: the change is single-application UI plus one route, with no repo-level contract touched (§9).
