# P0 Unprincipled-Read Inventory (taskdb #821, Phase 0)

Status: Phase 0 inventory artifact for the RLS unprincipled-read fix (see
`docs/_TODO/SAAS_FOUNDATION/RLS_UNPRINCIPLED_READ_FIX_PLAN.md`). Read-only static scan. No source
file was modified to produce this. Produced inline alongside the Phase 1 chokepoint fix
(commit `a2a5281cd`); the Phase 1 fix makes **every** call site listed here issue-time-principled at
a single chokepoint (`apps/webapp/src/app-layer/db/drizzle.ts`), so this count is **diagnostic /
coverage-scoping — not a hand-patch worklist**.

## Repro commands

```bash
# 1. Exact FORCE-RLS table list (public + integrator schema) from the cutover artifact.
grep -oP "\('\"public\"\.\"\K[a-zA-Z_0-9]+(?=\"'\))"      deploy/postgres/phase4-force-rls-cutover.sql | sort -u   # 149 public tables
grep -oP "\('\"integrator\"\.\"\K[a-zA-Z_0-9]+(?=\"'\))"  deploy/postgres/phase4-force-rls-cutover.sql | sort -u   # 14 integrator tables

# 2. table -> Drizzle export mapping: `export const <EXPORT> = pgTable("<table>", ...)` across schema.
rg -n 'export\s+const\s+\w+\s*=\s*pgTable\(\s*"[a-z_0-9]+"' apps/webapp/db/schema/*.ts

# 3. Plain (non-transaction) reads on FORCE-RLS tables in the repo layer:
#    `.from(<forceExport>)` and `db.query.<forceExport>.find{Many,First}(` in apps/webapp/src/infra/repos/*.ts,
#    excluding hits lexically inside a `.transaction(` / `withTransaction(` callback or on a `tx.` receiver.
#    (Full classifier is the python one-shot committed in the taskdb #821 work log; counts below.)
```

## Reality summary

| Metric                                                                                |                                     Exact value |
| ------------------------------------------------------------------------------------- | ----------------------------------------------: |
| FORCE-RLS tables, `public` schema (`phase4-force-rls-cutover.sql`)                    |                                         **149** |
| FORCE-RLS tables, `integrator` schema                                                 |                                              14 |
| FORCE `public` tables with a Drizzle `pgTable` export                                 |                                       147 / 149 |
| FORCE `public` tables with **no** Drizzle export (raw-SQL-only)                       | 2 — `broadcast_drafts`, `system_settings_audit` |
| **Plain (non-tx) reads on FORCE-RLS tables in `infra/repos/*.ts`**                    |                                         **371** |
| Distinct `infra/repos` files carrying ≥1 such plain read                              |                                          **54** |
| Tx-scoped reads/writes on the same tables (already principled via `db.transaction()`) |                                              79 |

**371 plain reads across 54 files** is the exact unwrapped-read _surface_ — every `.select()...from(X)`
or `db.query.X.find*()` on a FORCE-RLS table that is issued through the `getDrizzle()` singleton
outside an explicit `db.transaction()` (writes and tx-scoped reads were already deterministically
principled by `withPrincipalAwareTransactions()` before this task).

### Cross-check against the plan's estimate

The plan (`RLS_UNPRINCIPLED_READ_FIX_PLAN.md` §2) estimated **"~40-70 distinct broken read call
sites … consistent with the owner's ~44."** That estimate counts the tighter subset: plain reads that
are _actually reachable with no session-derived principal at all_. This inventory's **371** is the
broader denominator (every plain read on a walled table, regardless of whether its current callers
happen to establish a principal). The two numbers are consistent and measure different things:

- The plan's ~44 ≈ how many were _silently returning `[]`_ in practice before the fix.
- This inventory's 371 = how many plain reads the single chokepoint now _governs_ (the reason Option
  (a) was chosen over per-call-site patching: it covers all 371, plus every future one, in one file).

The precise "which of the 371 were reachable with zero principal" partition requires per-call-site
call-graph tracing (route/RSC-page → repo fn) and is **NOT fully completed here** (see Residual). It
is not needed for Phase 1 correctness — the chokepoint makes all 371 issue-time-safe and fail-closed
regardless — only for a per-route Phase 2 coverage claim.

## Per-file distribution (all 54 files, plain-read count)

| Count | File (`apps/webapp/src/infra/repos/`)  | Domain                          |
| ----: | -------------------------------------- | ------------------------------- |
|    38 | pgClientHistory.ts                     | Patients / client history       |
|    25 | pgDoctorCanonicalAppointments.ts       | Appointments                    |
|    22 | pgPatientClinical.ts                   | Patients / clinical             |
|    21 | pgProgramItemDiscussion.ts             | Programs / discussion           |
|    19 | pgBookingEngine.ts                     | Booking                         |
|    15 | pgMemberships.ts                       | Finances / memberships          |
|    15 | pgRubitimeMapping.ts                   | Booking / Rubitime bridge       |
|    11 | mediaFoldersRepo.ts                    | Media library                   |
|    11 | pgBookingCalendar.ts                   | Booking / calendar              |
|    11 | pgContentPages.ts                      | Content (CMS)                   |
|    11 | pgPayments.ts                          | Finances / payments             |
|    10 | pgAdminTranscodeHealthMetrics.ts       | Media / ops                     |
|    10 | pgBookingScheduling.ts                 | Schedule (working-hours, slots) |
|     9 | pgBookingAppointmentLifecycle.ts       | Appointments                    |
|     9 | pgProductAnalytics.ts                  | Finances / products             |
|     9 | pgProducts.ts                          | Finances / products             |
|     8 | pgBookingRubitimeBridge.ts             | Booking / Rubitime              |
|     8 | pgContentSections.ts                   | Content (CMS)                   |
|     7 | pgPatientPracticeCompletions.ts        | Programs / LFK                  |
|     6 | pgClientMediaFolders.ts                | Media / patient files           |
|     6 | pgTreatmentProgram.ts                  | Programs                        |
|     5 | pgNotificationDeliveryAttempts.ts      | Notifications                   |
|     5 | pgPatientFiles.ts                      | Patients / files                |
|     5 | pgTreatmentProgramInstance.ts          | Programs                        |
|     5 | pgTreatmentProgramItemRefValidation.ts | Programs                        |
|     5 | pgTreatmentProgramItemSnapshot.ts      | Programs                        |
|     4 | materialRatingTargetVideoMediaIds.ts   | Media / ratings                 |
|     4 | pgCourses.ts                           | Programs / courses              |
|     4 | pgMaterialRating.ts                    | Ratings                         |
|     4 | pgMaterialRatingFeedback.ts            | Ratings                         |
|     4 | pgPatientComorbidities.ts              | Patients / clinical             |
|     3 | pgBookingForm.ts                       | Booking                         |
|     3 | pgClinicalTests.ts                     | Programs / tests                |
|     3 | pgPatientHomeBlocks.ts                 | Patient home                    |
|     3 | pgPatientHomeLegacyContent.ts          | Patient home                    |
|     3 | pgPlatformUserContacts.ts              | Identity / contacts (PII)       |
|     3 | pgRecommendations.ts                   | Content / recommendations       |
|     3 | pgSpecialistTasks.ts                   | Doctor tasks                    |
|     2 | pgBookingPolicies.ts                   | Booking / policies              |
|     2 | pgDoctorPatientSupport.ts              | Support                         |
|     2 | pgHealthFailureArchive.ts              | Ops / health                    |
|     2 | pgOperatorHealthDigestRead.ts          | Ops / health                    |
|     2 | pgOrganizationMembership.ts            | Org / membership                |
|     2 | pgPatientDiarySnapshots.ts             | Patients / diary                |
|     2 | pgPatientMergeCandidate.ts             | Identity / merge                |
|     2 | pgTreatmentProgramTestAttempts.ts      | Programs / tests                |
|     1 | pgDoctorMotivationQuotesEditor.ts      | Content                         |
|     1 | pgEntitlements.ts                      | Entitlements                    |
|     1 | pgOrgEntitlements.ts                   | Entitlements                    |
|     1 | pgPatientDailyWarmupPresentation.ts    | Patient home / LFK              |
|     1 | pgPatientOrganization.ts               | Org                             |
|     1 | pgPatientPayments.ts                   | Finances / payments             |
|     1 | pgProgramNoteReplyContext.ts           | Programs                        |
|     1 | pgTestSets.ts                          | Programs / tests                |

**Breadth verdict:** the risk is **broad, not concentrated** — 54 repo files across every product
domain (schedule, appointments, patients/clinical, programs/LFK, content/CMS, finances/payments,
media, notifications, identity/PII, ops). This is exactly why the owner approved Option (a) (a single
chokepoint in `drizzle.ts`) over per-call-site patching.

The plan's directly-named examples are all present and confirmed in this scan:
`listWorkingHoursAdmin` / `listBusyIntervals` (pgBookingScheduling.ts), `listClients` history
(pgClientHistory.ts), `listTemplates` (pgTreatmentProgram\*), `contentPages.listAll` (pgContentPages.ts),
`listPrepaymentPolicies` (pgBookingPolicies/pgBookingEngine), and the `pgPatientPayments.ts` /
`pgPayments.ts` pair from the payment-timeline finding.

## Finding #8 — routes that establish no session/org context at all

Scan: `route.ts` files under `app/api/{doctor,admin,patient}` that call `buildAppDeps()` but reference
**no** principal/session/guard helper
(`require*ApiContext|require{Admin,DoctorBookingEngine,...}|withDoctorWorkspacePrincipal|withOrganizationPrincipal|stampDbPrincipalFromSession|runWithDb*Principal|enterWithDb*Principal|getCurrentSession`):

- **271** such route files scanned; **4** matched the "no helper" heuristic:
  `doctor/web-push/{status,subscribe,unsubscribe}/route.ts`, `admin/settings/route.ts`.
- On inspection all 4 are **false positives**: each gates via a `gate.session` / `ctx.session` guard
  object (`gate.session.user.userId`, `ctx.session.user.role`) whose helper name isn't in the regex.
- The plan's named zero-context example, `doctor/treatment-program-templates/route.ts`, **now gates
  via `requireDoctorWorkspaceApiContext` on this branch** (finding #8 already closed there).

**Conclusion:** no genuine zero-session-context org-scoped route remains among the 271. Finding #8 is
effectively closed on the current `feat/doctor-ui-rebuild` base; the Phase 1 chokepoint additionally
makes any such route fail-closed (empty) rather than leak, so this is not a residual security gap.

## Residual / NOT DONE

- The precise partition of the 371 into "was reachable with zero principal (silently broke)" vs "was
  always reached with a principal (worked, now also issue-time-hardened)" is **not fully traced** —
  it needs per-call-site route/RSC-page → repo-fn call-graph analysis. The plan's ~44 estimate stands
  as the working figure for the former; not needed for Phase 1 correctness (chokepoint covers all).
- Two FORCE `public` tables (`broadcast_drafts`, `system_settings_audit`) are raw-SQL-only (no Drizzle
  `.from()` surface) and are outside the drizzle-chokepoint's reach; if read via `pool.query`/raw SQL
  they rely on the pool-level `installPrincipalAwarePoolQuery` chokepoint instead (already in place).
- 14 `integrator`-schema FORCE tables are not in scope of the webapp drizzle chokepoint (integrator
  app has its own DB port); not analyzed here.
