# B0 named-DEV DB behavior replacement matrix — 2026-08-17

Status: **BLOCKED — 5/121 have an exact surviving static oracle; 22/121 have the same-consequence named-DEV
product runner implemented but have not been executed; 88 required consequences remain unproved; 6 implementation
contracts are explicitly retired.** No live DEV, TEST, or PROD command was run while preparing this correction.

The source census is executable and counts only top-level `it` / `test` / `it.each` / `test.each` declarations;
method calls such as `regex.test(value)` are excluded:

```bash
node scripts/census-retired-postgres-tests.mjs
# productFiles=35, productCalls=121
```

The named-DEV runner is fixed to the canonical files and exact four local PostgreSQL endpoints
`127.0.0.1:5432/bcb_webapp_dev`. Integrator and webapp must each independently declare `port-context`; remote hosts,
mixed modes, other ports and other database names fail before HTTP. Every request and the whole run have deadlines.
Booking cleanup discovers a unique run tag; the reminder create uses a standard idempotency key whose owned rule id
is known before mutation, creates disabled, and deletes in `finally` even after a lost response. The same canonical
command then invokes the audited current materialization port step for the organization returned by the authenticated
clinic overview; the child has its own two-minute deadline and cannot accept a database target override.

```bash
pnpm --dir apps/webapp run test:db-behavior:named-dev:self-test  # refusal/fault checks only
pnpm --dir apps/webapp run test:db-behavior:named-dev            # serialized live DEV; NOT RUN here
```

`READY` below means implemented but not live-proved. Only the same human/architecture consequence is counted. The
runner also performs useful broader smoke, but nearby shapes/resources do not replace a deleted PostgreSQL oracle.

| Removed product oracle | Calls | Static | READY | Required product/worker | Security/generator | Retired |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `adminAuditLog` | 3 | 0 | 0 | 3 | 0 | 0 |
| `platformUserFullPurge.patientFiles` | 3 | 2 | 0 | 1 | 0 | 0 |
| `platformUserFullPurge` | 2 | 0 | 0 | 0 | 0 | 2 |
| `platformUserMergePreview` | 3 | 0 | 0 | 0 | 0 | 3 |
| `appointmentReminderDelivery` | 3 | 0 | 0 | 3 | 0 | 0 |
| `authEmailOtpDeliveryOwnership` | 5 | 0 | 0 | 5 | 0 | 0 |
| `loginBootstrapDefinerAccessors` | 6 | 0 | 0 | 4 | 2 | 0 |
| `orgBrandRevisionGuard` | 5 | 0 | 0 | 3 | 2 | 0 |
| `patientReminderMaterialization` | 8 | 3 | 3 | 0 | 2 | 0 |
| `pgAuthRateLimitEvents` | 1 | 0 | 0 | 1 | 0 | 0 |
| `pgBookingScheduling.deactivateWorkingHours` | 2 | 0 | 2 | 0 | 0 | 0 |
| `pgBookingScheduling.readChokepoint` | 3 | 0 | 3 | 0 | 0 | 0 |
| `pgCanonicalAppointments` | 2 | 0 | 0 | 2 | 0 | 0 |
| `pgDoctorAnalyticsMetricAccounts` | 1 | 0 | 1 | 0 | 0 | 0 |
| `pgDoctorBroadcastDelivery` | 4 | 0 | 0 | 4 | 0 | 0 |
| `pgDoctorClients` | 3 | 0 | 1 | 2 | 0 | 0 |
| `pgEmailChallengeAtomicAttempts` | 2 | 0 | 0 | 2 | 0 | 0 |
| `pgEmailOtpPublicAtomicConsume` | 1 | 0 | 0 | 1 | 0 | 0 |
| `pgGlobalAdminWebPushRecipients` | 1 | 0 | 0 | 1 | 0 | 0 |
| `pgMediaWorkerControl` | 7 | 0 | 0 | 7 | 0 | 0 |
| `pgOtpDecayingLockoutAtomicEscalation` | 2 | 0 | 0 | 2 | 0 | 0 |
| `pgPatientBookings` | 2 | 0 | 1 | 1 | 0 | 0 |
| `pgPhase14DCommsTail` | 4 | 0 | 1 | 3 | 0 | 0 |
| `pgPhoneChallengeAtomicAttempts` | 2 | 0 | 0 | 2 | 0 | 0 |
| `pgPlatformUserMerge` | 2 | 0 | 0 | 2 | 0 | 0 |
| `pgProgramItemDiscussion.doctorComments` | 2 | 0 | 2 | 0 | 0 | 0 |
| `pgSaasBillingCapture` | 2 | 0 | 0 | 2 | 0 | 0 |
| `pgSupportCommunication` | 5 | 0 | 4 | 1 | 0 | 0 |
| `pgUserProjection` | 6 | 0 | 0 | 6 | 0 | 0 |
| `reminderCallbackCapabilities` | 8 | 0 | 0 | 7 | 1 | 0 |
| `reminderOccurrenceD21Migration` | 1 | 0 | 0 | 0 | 0 | 1 |
| `reminderRulesD5Migration` | 1 | 0 | 0 | 1 | 0 | 0 |
| `saasBillingPaidTariffApplyAccessor` | 6 | 0 | 0 | 5 | 1 | 0 |
| `saasBillingWebhookBootstrapInvoiceResolver` | 3 | 0 | 0 | 2 | 1 | 0 |
| `tenantIsolationMatrix` | 10 | 0 | 4 | 6 | 0 | 0 |
| **Total** | **121** | **5** | **22** | **79** | **9** | **6** |

Arithmetic: `5 + 22 + 79 + 9 + 6 = 121`. The added READY rows are exact public/current-port consequences: disjoint
working-hours reads, doctor list and metric-account isolation, unknown/real/unread support conversations, and
organization-scoped treatment-enrollment/clinical-visit and doctor exercise-comment queries. They remain READY,
not PASS, until serialized DEV.

## Exact disposition

### Six retired implementation contracts

- `platformUserFullPurge` 2: the deleted `getPurgePlatformUserRowForTests` helper was a harness seam, not a human
  contract. The actual purge consequence remains required in `platformUserFullPurge.patientFiles`.
- `platformUserMergePreview` 3: the owner-accepted U1 route remains unavailable (`404 not_available`); the deleted
  preview implementation is not restored.
- `reminderOccurrenceD21Migration` 1: pre-B0 migration convergence is historical replay and is forbidden. Current
  occurrence/materialization behavior remains required through B0-forward product/worker paths.

### Nine security/deployment invariants

These are declaration/generator facts, not fake live user journeys. Their non-DB executable oracle is:

```bash
node --experimental-strip-types --test deploy/postgres/privileges/retired-db-security-oracles.test.mjs
node --experimental-strip-types --test deploy/postgres/privileges/reminder-materialization-declaration.test.mjs
```

Together they check the two login direct-table denials and exact roots, two brand direct-update guard invariants, the
current three-root reminder materializer owner/EXECUTE boundary, the callback ACL boundary, tariff direct-write
boundary, and billing bootstrap table denial/root. Installed catalog equality still belongs to the canonical
named-environment declaration reconcile; this static oracle does not claim live catalog PASS.

### 79 required product/worker consequences

| Journey | Declarations | Current product/application path | Safe named-DEV disposition |
| --- | ---: | --- | --- |
| Identity/auth/lockout/projection/merge | 25 | `/api/auth/**`, session/profile APIs, integrator projection/merge worker | Ordinary logins cover positive auth/profile reads; OTP ownership, concurrent consume/attempt locks and merge collisions need provider/worker-created ordinary state. No fixture root is added. |
| Reminders/messages/broadcast/delivery | 21 | patient reminder/message APIs, doctor messages/broadcast APIs, scheduler + worker materialization/callback roots | Exact communication consequences in READY/static are counted separately; these 21 require the corrected common scheduler/worker and durable admin-health/readbacks with DEV delivery disabled. |
| Billing/money | 9 | clinic/global billing APIs and webhook worker | Invoice creation can use product APIs; paid/unpaid/foreign provider state cannot be fabricated. It remains blocked until the ordinary provider/test channel supplies it. |
| Media/branding/purge | 11 | branding/media APIs, media control worker, purge application port | Ordinary upload/branding paths can cover end-user effects; claim races, quarantine, purge order and cascade need the existing worker/control port and tagged ordinary media. |
| Booking/tenant/analytics/audit | 13 | booking lifecycle, doctor patient/list/analytics, admin audit APIs | Exact booking/tenant consequences in READY are counted separately; these 13 need retained lookup, same-organization specialist assignment walls, direct dashboard-metric execution, patient-side relation walls and deterministic audit conflicts with real tagged rows/readbacks, not shape assertions. |

The journey rows are non-overlapping and sum to `25 + 21 + 9 + 11 + 13 = 79`. No READY cell becomes PASS until the
serialized live command records its exact durable readback.

## Complete 123-path inventory

Deletion is not a disposition. The executable inventory check now accounts for the whole removed set:

```bash
node scripts/check-retired-db-consequence-inventory.mjs
# 123 paths = 35 product oracles / 121 declarations + 55 independent oracles + 29 support + 4 history
```

The exact source-path and consequence text is preserved in
`docs/archive/2026-08-no-disposable-db-retirement/retired-executor-consequences.json`. The 29 support rows are
harness/config/fixture inputs and do not independently prove product behavior. The 4 history rows are obsolete
pre-B0 replay. The 55 independent-oracle rows are not collapsed into either bucket: their product/security
consequences remain an explicit replacement queue until a current static or named-DEV application-port oracle is
attached. This is a classification record, not a claim that those consequences passed.

## Historical references and B0 retirement gate

The 123 removed paths are registered in the non-routable archive. Historical records preserve the command they
actually ran instead of attributing old output to a Markdown file. Each affected record starts with an exact notice
that those paths are historical and non-runnable. An unmarked active instruction naming a retired path fails the B0
gate. The gate also rejects database/server creation, PostgreSQL containers, SQL include/file/stdin replay,
database-client `CREATE/DROP DATABASE` including a local-variable payload, shell/JS/Python process variants,
`cat history.sql | psql`, and a `psql` child fed a SQL file through `input`.

```bash
node scripts/check-b0-migration-baseline.mjs
node --test scripts/check-b0-migration-baseline.audit.test.mjs
node --test scripts/check-b0-migration-baseline.named-dev.audit.test.mjs
```

No disposable database, raw SQL product probe, historical migration replay, grant change, TEST or PROD operation is
authorized by this matrix.
