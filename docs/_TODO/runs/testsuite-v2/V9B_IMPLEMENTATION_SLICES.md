# В9б — исполнимые slices tenant-wall

Статус: **план декомпозиции, не PASS**. Этот файл не меняет БД, серверы, DEV/TEST/PROD,
deploy или production code; номера миграций намеренно не назначены.

## Граница и правило порядка

Человек не должен получить чужую запись, а маршрут без принципала — любую tenant/user
строку. Для десяти живых строк этого класса граница будет в PostgreSQL: одинаковый
`USING`/`WITH CHECK`, затем `ENABLE` + `FORCE RLS`. Ранний route/session/HMAC guard
остаётся UX-отказом, но не доказательством security boundary.

Физический порядок безопаснее нумерации разделов: capability/role или caller должен
существовать **до** отзыва его broad grant; детерминированный backfill и quarantine — до
`NOT NULL`/FORCE; все caller-ы — до включения политики. Поэтому ACL-revoke, который
сделает живой caller неработоспособным, land-ится одной транзакционной поставкой с его
узким replacement из S04, хотя её проектирование и SQL-контракт принадлежат S02. Это не
обход порядка, а fail-closed prerequisite: нельзя безопасно «сначала revoke, потом
починим вход».

Роли, на которых строится proof: `app_runtime_staff_login → SET ROLE app_staff` и
`app_runtime_nonstaff_login → SET ROLE app_patient`; оба login — `LOGIN NOINHERIT
NOBYPASSRLS`. `app_owner`/migrator — только установщики, не evidence actor. Для
операционных задач применяется уже существующая узкая роль `app_worker` либо
назначенная integrator/login role; **не** `app_staff`/`app_patient` и не новый общий
tenant grant. Точное имя active TEST integrator/worker login перепроверяет TEST verifier.

## Исследовательская опора и ограничения

Три источника для каждого решения «нет caller/FK/grant/capability»:

1. Exact search (из рабочего дерева):

   ```bash
   rg -n --glob '!**/*.test.*' --glob '!**/migrations/**' --glob '!**/drizzle-migrations/**' --glob '!**/db/schema/**' 'from .*(bookingBranches|bookingServices|bookingSpecialists|bookingBranchServices)|\b(bookingBranches|bookingServices|bookingSpecialists|bookingBranchServices)\b' apps/webapp/src packages
   rg -n --glob '!**/*.test.*' --glob '!**/migrations/**' --glob '!**/drizzle-migrations/**' 'getByIntegratorBranchId|upsertFromProjection|deps\.branches|branches:' apps/webapp/src packages
   rg -n 'patient_bookings|appointment_records|be_organization_members|platform_users|product_analytics_hourly|user_channel_bindings|user_channel_preferences|user_notification_topic_channels|user_notification_topics|user_web_push_subscriptions' deploy/postgres/p0-5b-grants.sql docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs
   ```

   Первая команда не вернула application caller для четырёх `booking_*`; вторая оставила
   `pgBranches.ts` и `buildAppDeps.ts` для `branches`. Это не доказательство отсутствия
   внешнего consumer вне repo.

2. Lexical code search (до exact search):

   ```bash
   node /home/dev/brain/tools/code-search.mjs "booking branches booking services booking specialists booking branch services schema foreign key" --repo bcb -k 20
   node /home/dev/brain/tools/code-search.mjs "patient bookings appointment records schema foreign keys canonical appointment organization id" --repo bcb -k 20
   node /home/dev/brain/tools/code-search.mjs "A1 real PostgreSQL tenant isolation test harness app_staff app_patient login" --repo bcb -k 20
   node /home/dev/brain/tools/code-search.mjs "p0 5b broad grant generator capability security definer app_staff" --repo bcb -k 20
   ```

3. Backrefs/registries: `apps/webapp/db/schema/schema.ts`,
   `apps/webapp/db/schema/relations.ts`,
   `docs/_TODO/SAAS_FOUNDATION/R1_TABLE_TAXONOMY.md`,
   `docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs`, Rubitime retirement
   inventory, Track D1 decision and tariff plan named below.

Это docs-only разбор: runtime counts не запускались и старые числа не повторяются.
`НЕ ПРОВЕРЕНО` в конце перечисляет, что обязан измерить TEST verifier.

## Closure matrix рекомендации

| Исходная строка | Решение | Slice закрытия |
| --- | --- | --- |
| `booking_branch_services`, `booking_branches`, `booking_services`, `booking_specialists`, `branches` | Не строить RLS поверх мёртвой проекции; удалить schema/FK/backrefs/DI и revoke grants. | S01 |
| `auth_rate_limit_events`, `booking_calendar_map`, `channel_link_secrets`, `email_challenges`, `email_otp_locks`, `email_send_cooldowns`, `idempotency_keys`, `integration_webhook_error_events`, `integration_webhook_last_status`, `integrator_push_outbox`, `login_tokens`, `operator_health_alert_sent`, `operator_incidents`, `outgoing_delivery_queue`, `password_altcha_challenges`, `password_login_identifier_protection`, `phone_challenges`, `phone_messenger_bind_secrets`, `phone_otp_locks`, `reference_catalog_snapshot_receipts`, `specialist_signup_intents`, `staff_security_profiles`, `user_email_setup_tokens`, `user_oauth_bindings`, `user_passkey_accounts`, `user_passkey_challenges`, `user_passkey_credentials`, `user_password_credentials`, `user_pins` | Direct app-role table access is removed; exact-key `SECURITY DEFINER` or narrow operational role only. No tenant-wide secret grant. | S02, adoption/S04 proof |
| `patient_bookings`, `appointment_records` | Add immutable direct `organization_id`, deterministic canonical backfill, quarantine non-provable rows. | S03 |
| `patient_bookings`, `appointment_records` id-only/public/integrator/merge paths | Give each caller a signed principal, exact capability or dedicated operational role before FORCE. | S04 |
| `be_organization_members`, `platform_users`, `product_analytics_hourly`, `user_channel_bindings`, `user_channel_preferences`, `user_notification_topic_channels`, `user_notification_topics`, `user_web_push_subscriptions`, plus both booking projections | Same read/write predicate, then ENABLE+FORCE. | S05a–S05c |
| `booking_cities`, `clinical_test_measure_kinds`, `media_playback_stats_hourly`, `reference_catalog_baselines`, `saas_isolation_coverage_runs`, `saas_isolation_event_hourly`, `saas_isolation_events`, `schema_migrations`, `webapp_schema_migrations` | No tenant RLS. Retain minimal catalog/telemetry/migrator ACL; do not give platform rows tenant-role grants. | S02 ACL audit; no FORCE slice |
| Disposable A1 and real TEST proof | Extend the existing A1 fixture, verifier and conformance program; then run allowed TEST gate under real non-owner logins. | S06, S07 |

## Execution slices

| Order | Slice / status | Human consequence and hard prerequisite | Migration files needed | Land / evidence order |
| --- | --- | --- | ---: | --- |
| 01 | S01 legacy booking-projection retirement — `WAIT_OVERLAP` | Keeping a dead catalog broad-grantable makes future accidental reads globally reachable. It must disappear rather than receive fake `organization_id`/RLS. `patient_bookings` still has three legacy FKs, so drop only after its snapshot/canonical replacement is prepared. | 1 | Resolve DI/Track-D overlap → source removal + schema migration → grant generator regen → audit static absence. |
| 02 | S02 exact ACL/capability contract — `WAIT_OVERLAP` | A login, signup, token or worker operation must still work without giving every tenant role the whole secret/queue table. Capability exists before revoke; revoke waits until S04 moves each live caller. | 1 | Capability/role SQL + code ports → narrow ACL/revoke regeneration → unit/accessor proof. |
| 03 | S03 booking projection ownership — ready after S01 shape lock | Staff require a real org key even for pending records. Without backfill/quarantine, FORCE either leaks mis-stamped rows or silently makes unknown legacy rows visible. | 1 | Add nullable columns/FK/index → deterministic stamp/quarantine → measured verifier → `NOT NULL` only if no unresolved live rows. |
| 04 | S04 principal/caller remediation — `WAIT_OVERLAP` | FORCE turns today’s unprincipled/id-only reads into zero rows. Each legitimate actor must carry a signed principal or exact capability before the wall is switched on. | 1 | Replace callers and grant consumers → focused behavior tests → co-land S02 final revokes. |
| 05a | S05a identity/preferences FORCE — `WAIT_OVERLAP` | A patient must only access own identity/preferences; D1 still writes four of these tables directly as integrator. Switching FORCE first would break its direct projection write or make it depend on `app_staff`. | 1 | Only after D1 direct-write/transport disposition is accepted; policy + ENABLE/FORCE + matrix. |
| 05b | S05b booking projections FORCE | Patient/staff access to bookings must be data-bound even when a new route misses a `WHERE`. Requires S03 + S04 and no FK to retired booking catalog. | 1 | Policy + ENABLE/FORCE → A1 booking cases. |
| 05c | S05c membership and org analytics FORCE | Membership and per-clinic analytics must not disclose another clinic. Bootstrap membership lookup/global analytics writes need narrow paths first. | 1 | Bootstrap capability/operational writer → policy + ENABLE/FORCE → A1 cases. |
| 06 | S06 named A1 SELECT/DML matrix | Synthetic real PostgreSQL must catch policy/ACL regressions before shared TEST. Existing A1 already proves non-owner login routing; a second harness would duplicate and weaken it. | 0 | Extend fixture/program/verifier → `pnpm run check:saas-a1-rls-conformance`. |
| 07 | S07 TEST enforcement gate | The human protection is not proven until the actual TEST deployment uses non-owner `app_*_login`; owner results are exempt and invalid. | 0 | Only after S06 green and explicit TEST authorization → deploy contour → record matrix/metadata evidence. |

The migration count is **7 files total** (S01–S05c each one; S06/S07 zero). They are placeholders,
not reservations; orchestrator obtains every number from the board immediately before creation.

### S01 — retire five dead booking projections

**Tables and exact backrefs.** Retire `booking_branch_services`, `booking_branches`,
`booking_services`, `booking_specialists`, and `branches`. The first four have the FK graph
`booking_branches.city_id → booking_cities`, `booking_specialists.branch_id → booking_branches`,
`booking_branch_services.(branch_id,service_id,specialist_id) → booking_*`; `patient_bookings` holds
`branch_id`, `service_id`, and `branch_service_id` FKs/backrefs. `appointment_records.branch_id →
branches`; `branchesRelations` is the reciprocal backref. The production replacement is canonical
`be_appointments`/`be_branches`/`be_clinic_services`, already used by
`app.read_current_patient_booking_rows` (0251).

**Manifest.** Modify
`apps/webapp/db/schema/schema.ts`, `apps/webapp/db/schema/relations.ts`,
`apps/webapp/src/infra/repos/pgBranches.ts`, `apps/webapp/src/app-layer/di/buildAppDeps.ts`, and its
contract documentation `apps/webapp/src/app-layer/di/di.md`; create exactly one numbered Drizzle
migration chosen later under `apps/webapp/db/drizzle-migrations/`; edit
`docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs`, regenerate (never hand-edit)
`deploy/postgres/p0-5b-grants.sql`, and update its existing
`docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-5b-grants.mjs`. Add focused repo/removal tests beside
`pgBranches.ts` only if a live consumer is discovered; otherwise static migration/schema inspection is
the appropriate one-pass evidence.

**Acceptance kill-set.** A temporary re-add of any `booking_*` application import/port must fail the
existing chokepoint/type surface; migration must first remove the three `patient_bookings` legacy
FKs/backrefs, then the catalog graph; generated SQL must contain no grant for all five; no direct
`pgBranches` consumer remains. No artificial RLS policy is accepted as a substitute for retirement.

**Overlap.** `buildAppDeps.ts` also owns `pgOrganizationInvites` (tariff/seat path) and Track-D wiring,
while `stockQuotaCheck.ts` intentionally shares the atomic quota pattern with
`pgOrganizationInvites.createReplacingPending`. This slice may remove only the `branches` import,
factory and returned dependency; it must not refactor the composition root or quota code. Marked
`WAIT_OVERLAP` until the Track D transport owner confirms the dead projection transport is not being
rewired in the same hunk.

### S02 — revoke broad grants; install exact barriers

**Reuse first.** Reuse `0254_auth_rate_limit_action_accessors.sql` for rate limits,
`0258_bootstrap_auth_table_accessors.sql` for exact user-pin/channel-link/email/OAuth/login-token
operations, `0215_staff_security_profiles.sql`/`0256_staff_security_self_password_hash.sql` for the
staff vault, and `0182/0183/0184_reference_catalog_*` for receipt seeding. `0199/0251` prove the
same bounded-definer pattern for booking read/enrichment. A new function may be added only after the
worker names a caller and demonstrates that no existing exact accessor serves its inputs/result.

**Contract.** Revoke direct table ACL from `app_staff` and `app_patient` for every S02 table in the
closure matrix. For `user_pins`, replace direct patient read/set with the existing exact set/verify
accessor rather than granting pin hash. For pre-principal rows, capability input is an opaque token,
exact UUID or exact normalised key and result is the minimal DTO/boolean; `SECURITY DEFINER` has a
fixed `pg_catalog` search path, owner `app_owner`, `PUBLIC` revoked and exact `EXECUTE` only. For
`outgoing_delivery_queue`, `integrator_push_outbox`, webhook/operator incidents/status and telemetry,
use the existing `app_worker` or specifically proven integrator/ops login role; never a clinic role.
`booking_calendar_map` is a provider mapping, not a tenant row. `reference_catalog_snapshot_receipts`
retains its existing seed seam. No direct grant to pre-principal secrets or global/platform rows is
permitted.

**Manifest.** S02 creates exactly one numbered Drizzle migration containing only capability/role
definitions and ACLs; it does not change TS callers (that is S04). Modify
`docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs`, regenerate
`deploy/postgres/p0-5b-grants.sql`, and extend the existing
`docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-5b-grants.mjs`. Existing accessors are amended by
`CREATE OR REPLACE` in that migration, never copied into a second harness. Caller ports and their
focused tests are deliberately and exclusively listed in S04 once the per-table census proves a
real gap; inventing an untraceable TS file or capability name here would violate this slice boundary.

**Acceptance kill-set.** Bare staff/patient direct `SELECT`, `INSERT`, `UPDATE`, `DELETE` on every
S02 table deny; a valid exact key succeeds only through its capability; altered/foreign key fails;
worker/integrator can see only assigned queue/diagnostic surface; `app_owner` is not the evidence
actor. The grant generator, materialized SQL and smoke script must agree.

**Overlap.** Track D1 is moving direct writes to `platform_users`, `user_channel_bindings`,
`user_notification_topics`, optionally `user_channel_preferences`; its documented bootstrap login
grant defect makes this slice `WAIT_OVERLAP`. Tariff code is not a capability consumer in this table
set; `stockQuotaCheck.ts` and `pgOrganizationInvites.ts` are explicitly out of scope.

### S03 — direct ownership and fail-closed backfill

**Schema.** Add `organization_id uuid` to `patient_bookings` and `appointment_records`, FK each to
`be_organizations(id)`, then `(organization_id, created_at)` / access-shape indexes (at minimum an
org index required by every future policy). `patient_bookings.canonical_appointment_id` is a logical
backref to `be_appointments.id` but no FK exists in the current Drizzle declaration; do not invent it
without lifecycle proof. `appointment_records` uses `integrator_record_id` and may be linked only when
canonical `be:<uuid>` resolves to `be_appointments`.

**Deterministic backfill/quarantine.** For a booking with one canonical appointment, stamp its
`organization_id` only when the matched `be_appointments` row is live and its `platform_user_id`
matches the projection when both IDs are non-null. For appointment records, accept only one
canonical `be:<uuid>` whose organisation/provider relation is provable. Zero matches, deleted parent,
multiple candidates or mismatched users go into a migration-created quarantine/audit relation with
row id, reason and immutable source keys, then are deleted/denied from the live RLS table; they never
receive a guessed org or a global policy. Pending public bookings receive the resolved organisation at
creation before insert; a global cancellation cleanup becomes an explicit scheduler/operational
capability partitioned by organisation.

**Manifest.** Modify `apps/webapp/db/schema/schema.ts` and
`apps/webapp/src/infra/repos/pgPatientBookings.ts`,
`apps/webapp/src/infra/repos/pgAppointmentProjection.ts`,
`apps/webapp/src/modules/patient-booking/canonicalCreate.ts`; create one numbered Drizzle migration;
extend focused tests beside both repositories and `apps/webapp/src/modules/patient-booking/`. No deploy
file changes are allowed in this slice: deploy-level grant generation remains S02.

**Acceptance kill-set.** A booking/record without proof never receives an org; wrong canonical UUID,
cross-org parent and conflicting user are quarantined; pending insertion without org fails; a correct
canonical parent stamps the same org and user; rerun is idempotent. Runtime row totals belong to the
TEST verifier, not this document.

### S04 — remediate callers before FORCE

**Exact callers.** Replace or principal-wrap:

- `pgPatientBookings.ts`: `getById`, `getByCanonicalAppointmentId`, `getByIdForUser`,
  `createPending`, `markConfirmed`, `markCancelled`, `updateSlots` and its global cleanup;
- `pgAppointmentProjection.ts`: projection reads by integrator record/phone and staff soft-delete;
- `pgChannelLinkClaim.ts`: exact `platform_users`/binding/booking count and merge claim;
- `apps/webapp/src/app-layer/merge/platformUserMergePreview.ts` and
  `packages/platform-merge/src/pgPlatformUserMerge.ts`: platform-ops exact-user transaction;
- public create/confirm/payment context in `canonicalCreate.ts` and
  `modules/payments/prepaymentContextFromBooking.ts`;
- `apps/webapp/src/app-layer/integrator/assertIntegratorGetRequest.ts` plus
  `app/api/integrator/appointments/{record,active-by-user}/route.ts`.

Patient list/history already reuses `app.read_current_patient_booking_rows`; do not replace it with a
new direct table read. HMAC is insufficient as a generic table principal: integrator reads obtain an
exact signed-integrator accessor returning only the requested row/list. Cross-user merges use a
separate audited platform-operations principal/capability, not `app_staff`.

**Manifest.** Modify exactly the paths above, their ports in
`apps/webapp/src/modules/patient-booking/ports.ts`, and composition wiring only where a new injected
port is unavoidable in `buildAppDeps.ts`; focused tests beside the repositories/routes, plus
`packages/platform-merge` tests. One numbered Drizzle migration contains only capability/ACL changes
not already landed in S02. Do not modify `stockQuotaCheck.ts` or `pgOrganizationInvites.ts`.

**Acceptance kill-set.** No principal returns zero/permission denial; patient A cannot use B’s opaque
booking id; staff A cannot mutate B; public bootstrap can use only the exact verified token/phone
proof; signed integrator cannot enumerate by phone beyond its authorised relationship; platform merge
does not become a staff bypass; scheduler cleans only its assigned partition. Every changed write tests
INSERT, UPDATE and DELETE, not merely SELECT.

**Overlap.** `pgChannelLinkClaim` and platform-user projections are Track D1 territory. The direct
identity transport remains drain-only until D10. This slice is `WAIT_OVERLAP` for those paths; booking
paths that do not touch the D1 transport may proceed independently after S03.

### S05 — policy/ENABLE/FORCE waves

All live-table policies use the same read/write predicate; helpers returning `NULL` must not be
coalesced to allow. `FORCE ROW LEVEL SECURITY` is mandatory and no runtime login has
`rolbypassrls`. The policy surface is:

| Wave | Tables | Predicate / special prerequisite |
| --- | --- | --- |
| S05a | `platform_users`, `user_channel_bindings`, `user_channel_preferences`, `user_notification_topics`, `user_notification_topic_channels`, `user_web_push_subscriptions` | Patient self (`id`/`user_id`/`platform_user_id = app.current_patient_user_id()`); staff only through current-org active membership/enrollment where business need is proved. Bootstrap/identity/delivery uses S02/S04 seam. WAIT_OVERLAP Track D1. |
| S05b | `patient_bookings`, `appointment_records` | `(app.is_staff() AND organization_id = app.current_organization_id()) OR platform_user_id = app.current_patient_user_id()`. S03 non-null ownership and S04 callers required. |
| S05c | `be_organization_members`, `product_analytics_hourly` | Member: staff current-org plus a self-bootstrap capability; analytics: only non-null org rows to staff current-org. Null analytics remains platform retention/analytics capability, never tenant-visible. |

**Manifest per wave.** One numbered Drizzle migration; update matching tables in
`apps/webapp/db/schema/{schema.ts,bookingEngine.ts,productAnalytics.ts}` and
`relations.ts` only if the migration changes declared constraints; edit the already named caller files
only for failures exposed by the focused policy tests. Update grant generator/materialised SQL/smoke
only when privilege changes. Test manifest: extend `apps/webapp/scripts/run-a1-rls-conformance.ts`,
`docs/ARCHITECTURE/DB_DUMPS/a1-rls/seed.sql`,
`docs/ARCHITECTURE/DB_DUMPS/a1-rls/missing-context-denial.sql`, and
`scripts/verify-a1-rls-conformance.mjs`; no new harness.

**Acceptance kill-set for every table.** (1) bare login with no principal: SELECT zero or direct
permission denied, DML denied; (2) patient A sees/mutates only A and cannot read B; (3) staff org A
sees all permitted A and zero B; (4) wrong-org INSERT/UPDATE `WITH CHECK` fails; (5) delete follows
the same predicate; (6) bootstrap/operational capability works but direct table access stays denied;
(7) metadata says `relrowsecurity=true`, `relforcerowsecurity=true`; (8) runtime login says
`rolbypassrls=false`, with no owner/migrator membership. Owner-role result is explicitly rejected.

## A1 and TEST evidence

Existing A1 is the only harness: root command is

```bash
pnpm run check:saas-a1-rls-conformance
```

It restores A0 to a private disposable cluster, invokes
`apps/webapp/scripts/run-a1-rls-conformance.ts` via
`scripts/verify-a1-rls-conformance.mjs`, and authenticates real non-owner
`app_runtime_staff_login`/`app_runtime_nonstaff_login`. Extend, do not clone, those four files and
the two fixture SQL files named in S05.

S06 names every test case as `<table>.<actor>.<verb>` for all ten tables and all
`SELECT/INSERT/UPDATE/DELETE` combinations that the actor is meant to possess. Include negative
`no_principal`, `patient_A_to_B`, `staff_A_to_B`, `bootstrap_direct_table`,
`bootstrap_exact_capability`, `operational_direct_table`, `operational_assigned_surface`,
`force_metadata`, `login_nobypassrls`, and `no_owner_membership`. Fixtures contain two orgs, two
patients, an org-null analytics row and each exact-key/queue case; they never contain real credentials.

S07 is a separate, authorised shared-TEST action. Reuse the existing deploy contour
`deploy/host/deploy-test-saas.sh` and its post-service A1 invocation; do not run it in this worktree
or under a dev owner. The verifier records the exact TEST login role, `session_user`, `current_user`,
role memberships, policy metadata and each matrix result. A green local A1 is a prerequisite, not
substitute, for that record.

## Conflict map

| Neighbour | Shared files/surface | Required handling |
| --- | --- | --- |
| Track D1 / D10 | Direct identity projection of `platform_users`, `user_channel_bindings`, `user_notification_topics`, optional preferences; projection transport remains drain-only until D10. | S02/S04/S05a are `WAIT_OVERLAP`; agree a single transaction/role contract, then land one side at a time. |
| Track D transport retirement | `pgBranches.ts`, `buildAppDeps.ts`, legacy projection transport. | S01 is `WAIT_OVERLAP`; remove only a confirmed dead `branches` dependency after D owner confirms no transport rewrite. |
| Tariff/entitlements neighbour | `buildAppDeps.ts`, `stockQuotaCheck.ts`, `pgOrganizationInvites.ts`; seat quota uses the same atomic transaction pattern. | No semantic or mechanical refactor of these files. If S01 needs the DI hunk while tariff work is active, wait and make a three-line branches-only change after its land. |
| P0.5b grant generator | `docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs` → generated `deploy/postgres/p0-5b-grants.sql`. | One owner changes the generator; regenerate output and grant smoke in the same commit. Never hand-edit the output. |

## First-worker brief

> Work only S01 on an isolated `wt/` branch after the overlap owner releases
> `buildAppDeps.ts`/dead projection transport. Read AGENTS §1/§5/§7/§9/§24, this file, the V9b
> recommendation and Rubitime retirement disposition. Do not create an RLS policy, org column,
> capability, runtime grant, TEST/DEV/DB/deploy action or migration number before the orchestration
> board reservation. Prove the four legacy catalog tables have no app caller with code-search, exact
> search and schema/registry backrefs; prove the `branches` port has no consumer beyond DI. Remove
> only the five projection declarations/FKs/backrefs/DI and their generator entries; preserve canonical
> `be_*` booking data and tariff quota wiring. Use one migration, regenerate the P0.5b SQL, run focused
> static/type/grant-generation checks, commit only named paths, and hand off the exact diff plus
> evidence. If any runtime consumer appears, stop with `WAIT_OVERLAP` rather than inventing an RLS wall.

## НЕ ПРОВЕРЕНО

- No runtime counts, grant catalogue or backfill cardinalities were read in this docs-only pass.
- The exact active TEST integrator/worker login roles and their queue/diagnostic grants are not proven;
  S02/S07 must query `pg_roles`, `pg_auth_members`, `information_schema.role_table_grants` and function
  ACLs under the authorised TEST contour.
- No TEST policy metadata, FORCE behaviour or cross-org DML has been run. DEV owner-role output is
  explicitly unusable as tenant proof.
- No external/ad-hoc consumer of retired booking projections is known; only repository absence is
  evidenced.
- `patient_bookings.canonical_appointment_id` has no declared Drizzle FK in the inspected schema;
  whether a physical FK is lifecycle-safe remains a migration design question, not an assumption.
- The final caller/test-file census for every pre-principal/operational table is intentionally pending
  S02’s per-table code audit; inventing capability names or direct grants before that proof would widen
  scope and risk secrets.

В9б остаётся открытым до S07 evidence; этот document is not a completion marker.
