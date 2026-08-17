# B0 named-DEV DB behavior replacement matrix — 2026-08-17

Status: **BLOCKED — 2/130 replaced, 128/130 still require a compliant oracle.** This file is a census and handoff,
not a readiness claim. It exists to prevent the deleted disposable tests from being silently treated as redundant.

Exact source census:

```bash
node --input-type=module - <<'NODE'
import { execFileSync } from 'node:child_process';
const files = execFileSync('git', ['diff', '--diff-filter=D', '--name-only', '0210820cd', 'fb44002ce'],
  { encoding: 'utf8' }).trim().split('\n').filter((path) => path.endsWith('.postgres.integration.test.ts'));
let calls = 0;
for (const path of files) {
  const source = execFileSync('git', ['show', `0210820cd:${path}`], { encoding: 'utf8' });
  calls += [...source.matchAll(/\b(?:it|test)\s*(?:\.each\s*\([^)]*\)\s*)?\(/g)].length;
}
console.log({ productFiles: files.length - 2, productCalls: calls - 3 });
NODE
```

Measured result: `35` product files / `130` calls. The only exact surviving replacement found is the two
artifact-key collection behaviors in
`apps/webapp/src/infra/platformUserFullPurge.collectPurgeArtifactKeys.test.ts`; command:

```bash
pnpm --dir apps/webapp exec vitest run src/infra/platformUserFullPurge.collectPurgeArtifactKeys.test.ts
```

That unit file proves the pure application-port collection/mapping consequence and does not claim cascade,
transaction, RLS, ACL, concurrency, or live-query behavior. Nearby tests that only mock an executor, pin a named
root, or prove route wiring were inspected but are not counted as replacements for a real PostgreSQL oracle.

## File-by-file accounting

`Static` is an exact surviving oracle. `DEV` is the number that still needs the serialized named-DEV runner.

| Removed product oracle | Calls | Static | DEV | Required behavior class |
| --- | ---: | ---: | ---: | --- |
| `adminAuditLog` | 3 | 0 | 3 | real filtered reads and conflict count |
| `platformUserFullPurge.patientFiles` | 3 | 2 | 1 | collection mapping; cascade/order remains live |
| `platformUserFullPurge` | 2 | 0 | 2 | purge target read without mutation |
| `platformUserMergePreview` | 3 | 0 | 3 | read-only search/preview and zero-write branch |
| `appointmentReminderDelivery` | 3 | 0 | 3 | generation revalidation, retry race, blocked recipient |
| `authEmailOtpDeliveryOwnership` | 5 | 0 | 5 | token ownership, anti-reopen, enqueue golden path |
| `loginBootstrapDefinerAccessors` | 6 | 0 | 6 | table denial plus narrow accessor positive/negative |
| `orgBrandRevisionGuard` | 5 | 0 | 5 | immutable published/archive guard plus FK purge |
| `patientReminderMaterialization` | 8 | 0 | 8 | tenant wall, rollback, upsert race, grants/ownership |
| `pgAuthRateLimitEvents` | 1 | 0 | 1 | transactional max-per-window |
| `pgBookingScheduling.deactivateWorkingHours` | 2 | 0 | 2 | real update and swapped-argument regression |
| `pgBookingScheduling.readChokepoint` | 3 | 0 | 3 | two-tenant positive/negative reads |
| `pgCanonicalAppointments` | 2 | 0 | 2 | canonical/retained lookup and soft delete |
| `pgDoctorAnalyticsMetricAccounts` | 1 | 0 | 1 | real metric account count |
| `pgDoctorBroadcastDelivery` | 4 | 0 | 4 | atomic audit/jobs/recipients and rollback |
| `pgDoctorClients` | 3 | 0 | 3 | list/metrics and specialist isolation |
| `pgEmailChallengeAtomicAttempts` | 2 | 0 | 2 | row-lock increment race and deleted challenge |
| `pgEmailOtpPublicAtomicConsume` | 1 | 0 | 1 | exactly-one concurrent consume |
| `pgGlobalAdminWebPushRecipients` | 1 | 0 | 1 | active canonical admin recipient filter |
| `pgMediaWorkerControl` | 7 | 0 | 7 | claim race, quarantine, ownership, completion rollback |
| `pgOtpDecayingLockoutAtomicEscalation` | 2 | 0 | 2 | email/phone serialized escalation cycles |
| `pgPatientBookings` | 2 | 0 | 2 | unknown read and real history row |
| `pgPhase14DCommsTail` | 4 | 0 | 4 | broadcast and timezone real reads |
| `pgPhoneChallengeAtomicAttempts` | 2 | 0 | 2 | row-lock increment race and deleted challenge |
| `pgPlatformUserMerge` | 2 | 0 | 2 | identity/projection and analytics collision merge |
| `pgProgramItemDiscussion.doctorComments` | 2 | 0 | 2 | live SQL execution and cursor pagination |
| `pgSaasBillingCapture` | 2 | 0 | 2 | invoice/tariff transaction and missing-principal failure |
| `pgSupportCommunication` | 5 | 0 | 5 | real conversation/unread reads and assignment wall |
| `pgUserProjection` | 6 | 0 | 6 | phone/email reads plus exact email clear/no-op |
| `reminderCallbackCapabilities` | 8 | 0 | 8 | signature/tenant wall/idempotency and definer-only ACL |
| `reminderOccurrenceD21Migration` | 1 | 0 | 1 | B0 equivalent of legacy occurrence convergence not yet named |
| `reminderRulesD5Migration` | 1 | 0 | 1 | B0 equivalent of parent/history integrity not yet named |
| `saasBillingPaidTariffApplyAccessor` | 6 | 0 | 6 | paid/foreign/unpaid guards and tariff application |
| `saasBillingWebhookBootstrapInvoiceResolver` | 3 | 0 | 3 | plain-table denial and narrow resolver |
| `tenantIsolationMatrix` | 10 | 0 | 10 | staff/patient A/B walls plus wall-removal kill controls |
| **Total** | **130** | **2** | **128** | |

## Required runner contract

The missing runner must be one serialized command and must refuse anything except the canonical named DEV database.
It must use existing application/Drizzle ports for setup, action, observation and cleanup; use per-run unique fixture
identifiers; and leave no rows behind. It must not accept a generic URL, use `psql`, replay a file, create/drop a
database or schema, change roles/policies, or run on TEST/PROD. Concurrency cases must use two application-port calls
against the same unique fixture and assert the durable result through the corresponding read port.

The runner is not present yet. Therefore `fb44002ce` plus the gate/docs correction still **must not be landed as a
complete no-disposable closure** until the `128` DEV cells above have executable evidence or an exact surviving
oracle is named and independently verified.
