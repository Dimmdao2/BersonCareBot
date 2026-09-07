# C3M-02 independent audit — candidate `251b9f1fc`

## Scope and authority

- Workstream: `#1098`
- Stage: `C3M-02 — organization-scoped client controls`
- Integration base: `81d3e417c`
- Product commit: `edf156aa2`
- Candidate: `251b9f1fc`
- Oracle: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M.6 and C3M-02.
- Excluded by brief: rollback-only owner-aware migration preflight, full CI, shared dev server, PROD/TEST and all later C3M slices.

## Blind kill-set (written before opening candidate diff or existing tests)

The behavioral failures below are expensive and silent tenant/data-boundary failures, so each must be represented by a public-layer acceptance test and independently proved by one targeted production-code fault injection. Migration shape, privileges and architectural topology are one-time/static facts and are inspected directly rather than pinned with source-text tests.

| ID  | Named fault and user/data impact                                                                                                                                                                                                                                  | Required oracle                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| K1  | With the same `patient_user_id` in organizations A and B, a support or demographics read for A returns B's row. Staff sees another tenant's support state or demographics.                                                                                        | Every support-profile read uses the exact `(organization_id, patient_user_id)` identity.                          |
| K2  | With the same patient in A and B, changing `onSupport` or demographics in A mutates B. Another tenant's data is silently changed.                                                                                                                                 | Every support-profile mutation/upsert targets the exact composite identity.                                       |
| K3  | A has no support row while B has one for the same patient; a read in A falls back to B, or a create/update intended for A reuses/overwrites B. Missing tenant data becomes cross-tenant data.                                                                     | Absence is scoped; create/update never falls back from the requested organization.                                |
| K4  | A support-profile port/service/route call omits authoritative organization context or uses a process-global/client-provided fallback. A valid patient id can select another organization's row.                                                                   | Organization context is mandatory through every support-profile path and derives from authorization.              |
| K5  | A patient program-submission media route trusts an arbitrary client organization id, omits organization context, or derives it without an already-authorized patient/program relationship. A patient can read/change another organization's support media policy. | All three media routes derive organization from an authorized relationship and call the canonical scoped service. |
| K6  | PostgreSQL and in-memory repositories disagree about composite identity or update/create semantics. Tests pass against the fake while production crosses tenants or vice versa.                                                                                   | Drizzle schema, both repositories, ports and services have behavioral parity.                                     |
| K7  | Program-interaction behavior within the selected organization changes while adding scoping (for example allowed comments/media become denied, or existing support/demographics fields are lost). Existing users lose working behavior or data.                    | Existing selected-organization program behavior and unrelated support profile fields remain intact.               |
| K8  | A new `favorite`, second group/switch/entity, or compatibility path becomes an alternative to `onSupport`. Group membership diverges and later client policy reads the wrong source.                                                                              | `onSupport` is the sole group property; no second favorite mechanism exists.                                      |
| K9  | Migration assigns a multi-organization legacy row by guess, silently duplicates it, or proceeds despite ambiguity. Another tenant can inherit the support/demographics record.                                                                                    | Backfill only unambiguous rows; ambiguous rows are explicitly reported and refused.                               |
| K10 | Migration leaves `organization_id` nullable, preserves patient-only uniqueness, fails to establish composite uniqueness, or loses unrelated profile columns. Future writes remain ambiguous or existing data is lost.                                             | `organization_id NOT NULL`; uniqueness is `(organization_id, patient_user_id)`; unrelated data is preserved.      |
| K11 | Migration executes under the wrong object owner, embeds `GRANT`/`REVOKE`/policy changes, or introduces a required runtime right absent from the sole privilege declaration. Deploy/reconcile fails or runtime receives an undeclared right gap.                   | Statement-owner contract and §1 privilege rules; `declaration.ts` remains the single privilege source.            |
| K12 | A direct repository/helper/route bypasses the canonical organization-scoped service, so a future caller can omit the tenant boundary while normal tests remain green.                                                                                             | One canonical passage plus existing architecture guards; all call sites carry scoped context.                     |

### Planned evidence mapping

- K1–K3, K6–K7: repository/service behavioral acceptance tests, selecting the cheapest public boundary that can distinguish two organizations; targeted mutation of lookup/update scoping proves the tests turn red.
- K4–K5: route-level acceptance through real handlers/wiring where route authorization/context derivation is the behavior; targeted omission/substitution of the derived organization proves rejection/cross-tenant assertions turn red.
- K8, K12: complete diff/call-site and architecture-guard inspection; no source-text test.
- K9–K11: migration and final schema/declaration inspection plus migration-order/privilege generator checks; rollback-only live preflight is explicitly deferred to the lead.

## Candidate inspection

I read the complete `git diff 81d3e417c...251b9f1fc`, then followed the support identity through the schema, port, service, PostgreSQL and in-memory repositories, dependency wiring, doctor settings/FIO/physical routes, dashboard and patient card loaders, support policy, integrator calendar projection, and all three patient program-submission media handlers.

The product-side identity flow is coherent:

- Drizzle and the migration use `(organization_id, patient_user_id)`; PostgreSQL reads and updates predicate on both columns, and the in-memory repository keys by both.
- Doctor support-settings, FIO and physical routes pass the organization selected by the authenticated staff gate. Dashboard and patient-card loaders pass their authenticated organization into the same service.
- Presign, confirm and status first call `getInstanceForPatient(sessionPatientId, instanceId)`, reject an absent instance/organization, then use `detail.organizationId` inside `runWithDbPatientPrincipal` for the canonical support-policy call. There is no organization id in the request body to trust.
- The later discussion-media attach handler independently resolves the actual target instance/item and reapplies media feature/support policy with that instance's organization before linking a patient-owned media row. Thus a patient with two valid organization relationships cannot use a permissive instance merely to attach media to a restrictive one.
- The integrator calendar projection reads through the DB port while its caller is inside `runWithOrganizationPrincipal(input.organizationId)`; the declared tenant-service policy also predicates `doctor_patient_support.organization_id = app.current_org_id()`.
- The migration reports and aborts on zero/multiple enrollment candidates before its update, assigns only a single distinct candidate, verifies no nulls remain, sets `organization_id NOT NULL`, replaces the patient-only unique index with the composite one, and replaces the `on_support` index with the organization-prefixed index. It does not recreate or rewrite unrelated support columns.

No second favorite mechanism was found. Evidence was checked three ways: exact product-source search `! rg -n "\bfavorite\b|isFavorite|favoritePatient|patientFavorite" apps/webapp/src apps/integrator/src apps/webapp/db/schema apps/webapp/db/drizzle-migrations/20260907T021938_doctor_patient_support_is_organization_scoped.sql`; repository search `bash /home/dev/brain/tools/codeq.sh "отдельная сущность избранного пациента вторая группа вместо onSupport" --repo bcb --semantic --k 8` (the local vector coverage was 0%, so the tool explicitly degraded to its lexical result and returned no product favorite entity); and roadmap back-references from `rg -n "C3M-02|onSupport|favorite|Избранные|На сопровождении" docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, including the sole-group prohibition at lines 700 and 758–761.

The existing architecture guards and complete call-site read found no unscoped support-profile helper or direct infrastructure import that bypasses the scoped service.

## Fault-injection evidence

Every production mutation below was made alone, the mapped acceptance command was observed red, and the production file was immediately restored before the next mutation. A final green rerun followed restoration.

| Kill(s)    | Independent fault injected                                                                                              | Observed red signal                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1, K3, K6 | Changed `inMemoryDoctorClients.supportProfileKey` to key on patient only.                                               | Two acceptance cases failed: organization A read organization B's profile, and the selected-organization policy rejected the mismatched row.                      |
| K1         | Made support-settings GET query organization B while the authenticated request selected A.                              | Route acceptance returned B's support profile where A was expected.                                                                                               |
| K2, K3     | Made support-settings PATCH update organization B while the authenticated request selected A.                           | Route acceptance detected B's `mediaEnabled` changed and A did not receive the requested exact-tenant update.                                                     |
| K1, K2     | Made FIO PATCH and physical GET/PATCH use organization B.                                                               | Demographics acceptance failed for A: birth date/gender came from B and A's height was not updated.                                                               |
| K4, K5     | In presign, replaced the organization derived from the owned treatment instance with an unrelated default organization. | Three-route media acceptance changed from `[403, 403, 403]` to `[200, 403, 403]`, proving it catches the policy-context substitution before storage operations.   |
| K5         | Changed presign to return success when `getInstanceForPatient` reported no patient-owned instance.                      | The unowned-instance acceptance failed with `[200, 404, 404]` instead of `[404, 404, 404]`, proving all three routes must reject before policy or storage access. |
| K7         | Forced the `on_support` branch of `resolvePatientProgramInteractionPolicy` to deny media.                               | The selected-organization program-interaction acceptance failed instead of preserving the existing enabled behavior.                                              |

The initial run of the existing upload-door suite had fixture failures because its requests/dependencies did not supply the newly mandatory instance identity. The committed fixture correction adds `instanceId`, the patient-owned instance resolver and principal wrapper expectations while preserving the pre-existing upload assertions. Two new tests cover the shared tenant-negative contracts of presign, confirm and status: organization derivation from the owned instance and rejection of an unowned instance.

No source/SQL-text assertion was added. K8–K12 remain review/generator/architecture-gate evidence as required by the brief.

## Commands and results

Behavioral acceptance after restoration and formatting:

```text
pnpm --dir apps/webapp exec vitest run 'src/app/app/doctor/DoctorTodayDashboard.ui.test.tsx' 'src/app/app/doctor/patients/[userId]/PatientCardClient.ui.test.tsx' src/modules/doctor-clients/organizationScopedSupport.route.test.ts src/modules/media/uploadDoorAcceptance.route.test.ts
PASS — 4 files, 39 tests

pnpm --dir apps/webapp exec vitest run 'src/app/api/doctor/patients/[userId]/fio/fio.route.test.ts' 'src/app/api/doctor/patients/[userId]/patientCardNeverGated.route.test.ts' src/infra/repos/pgDoctorClients.orgPredicateParam.unit.test.ts src/infra/repos/pgDoctorClients.listPatientAppointments.unit.test.ts
PASS — 4 files, 19 tests

pnpm --dir apps/integrator exec vitest run src/integrations/google-calendar/calendarDescription.namedRoots.unit.test.ts src/integrations/google-calendar/sync.principal.unit.test.ts
PASS — 2 files, 4 tests
```

Static and integration-risk checks:

```text
pnpm --dir apps/webapp typecheck
PASS

pnpm --dir apps/webapp exec eslint <explicit candidate TypeScript paths and the two audit test paths>
PASS

bash apps/webapp/scripts/check-drizzle-migration-order.sh
PASS — transaction-safe layout and migration order

node scripts/check-migration-privileges.mjs && node scripts/check-migration-privileges.mjs --self-test
PASS — 134 migrations; all 7 red fixtures rejected and the green fixture accepted

node deploy/postgres/privileges/generate-cli.mjs --check && node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only
PASS — generated artifacts byte-identical for all configured environments

node deploy/postgres/privileges/generate-cli.mjs --census
PASS — declaration census completed

node scripts/check-webapp-infra-import-boundary.mjs && node scripts/check-webapp-infra-import-boundary.mjs --self-test
PASS

node apps/webapp/scripts/check-media-upload-door.mjs && node apps/webapp/scripts/check-media-upload-door.mjs --self-test
PASS

node scripts/check-no-new-raw-sql.mjs && node scripts/check-db-chokepoint.mjs
PASS

node scripts/check-saas-db-regression.mjs
PASS

pnpm run test:db-privileges
PASS — 341 tests: 184 passed, 157 skipped, 0 failed
```

One path correction occurred: `node scripts/check-media-upload-door.mjs` returned `MODULE_NOT_FOUND`; the repository path is `node apps/webapp/scripts/check-media-upload-door.mjs`, whose normal and self-test modes both passed. This is not a candidate failure.

Full CI, shared-server tests and the owner-aware rollback-only migration preflight were not run, exactly as excluded by the brief.

## Privilege analysis

The migration itself follows the owner protocol but the resulting runtime grant is incomplete.

- Existing relation owner: the generated privilege state declares `ALTER TABLE public.doctor_patient_support OWNER TO app_object_owner`.
- Backfill execution identity: `BCB-MIGRATION-BACKFILL` parses with `owner: null`; `migrate-local.mjs` emits `RESET ROLE; RESET SESSION AUTHORIZATION;` before running it. Therefore the local administrative connection performs the backfill and needs `SELECT` on `doctor_patient_support`/`org_enrollments` plus `UPDATE` on `doctor_patient_support`; it is not falsely delegated to the object-owner role.
- DDL execution identity: each later migration statement carries `BCB-MIGRATION-OWNER: app_object_owner`, and the runner emits `SET LOCAL ROLE app_object_owner`. The migration creates only indexes on the existing table, so it creates no new relation/function requiring a declaration or default-privilege entry.
- Forbidden SQL: `! rg -n "\b(GRANT|REVOKE|CREATE[[:space:]]+ROLE|ALTER[[:space:]]+ROLE|ALTER[[:space:]]+DEFAULT[[:space:]]+PRIVILEGES|CREATE[[:space:]]+POLICY)\b" apps/webapp/db/drizzle-migrations/20260907T021938_doctor_patient_support_is_organization_scoped.sql` passed with no match.
- Runtime reads and inserts: `app_patient` and `app_staff` have table `SELECT`; `app_tenant_service` has the two columns its calendar projection reads; `app_staff` INSERT includes every inserted support-profile column, including `on_support` and `support_started_at`.
- Runtime update gap: the sole declaration and generated SQL grant `app_staff` UPDATE only on `birth_date`, `comments_enabled`, `gender`, `height_cm`, `media_enabled`, `organization_id`, `updated_at`, `updated_by`, and `weight_kg`. The repository update path writes `on_support` and `support_started_at`. PostgreSQL column privileges therefore reject the existing-row toggle before RLS can make it succeed.

The rollback-only live preflight remains for the lead after the runtime privilege finding is fixed; it was not run here.

## Findings

### MUST FIX — existing support membership cannot be toggled under the declared runtime role

- Reachable scenario: an authenticated clinic staff member changes `onSupport` for a client who already has a `doctor_patient_support` row. `pgDoctorPatientSupport.upsertSettings` enters its update branch and sets `on_support`; enabling or disabling also sets `support_started_at` (`apps/webapp/src/infra/repos/pgDoctorPatientSupport.ts:167–195`).
- Impact: PostgreSQL rejects the UPDATE for `app_staff` with insufficient column privilege (`42501`). The existing client's sole “Избранные / На сопровождении” membership control is broken in runtime. A first insert can succeed, which makes this gap easy to miss in in-memory and route tests.
- Violated requirement: C3M-02 requires `onSupport` to be the working sole source of group membership with ports/infra parity; AGENTS §1 requires all needed runtime rights to be declared in the sole privilege declaration before landing a migration.
- Evidence: `deploy/postgres/privileges/declaration.ts` omits `on_support` and `support_started_at` from the `app_staff` UPDATE columns. Regeneration faithfully preserves the omission at `deploy/postgres/generated/privileges.bcb_webapp_dev.sql:13639`; `pnpm run test:db-privileges` passes because it verifies declaration/generated consistency, not that the declared column set covers this newly reachable repository write.
- Precise handoff: add those two columns to the existing `app_staff` UPDATE entry for `public.doctor_patient_support` in the sole declaration, regenerate the committed privilege artifacts, rerun the privilege generator/tests and this audit's targeted acceptance suite, then let the lead perform the separately assigned rollback-only preflight. Do not add grants to the migration.

No other MUST FIX was found in the assigned scope.

## Verdict

**FAIL — C3M-02 is blocked by the missing runtime UPDATE privileges for `on_support` and `support_started_at`.**

K1–K10 and K12 pass the assigned static/behavioral evidence. K11 fails on the declared runtime-right requirement. The committed acceptance tests are green because the blocker is correctly classified as a one-time privilege/declaration review finding, for which the brief forbids a permanent SQL/source-text test.
