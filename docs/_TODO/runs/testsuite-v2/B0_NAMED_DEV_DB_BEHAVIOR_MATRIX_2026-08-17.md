# B0 named-DEV DB behavior replacement matrix — 2026-08-17

Status: **BLOCKED — 2/130 already replaced; a real product-path runner now implements 33 more calls but has not
been executed on named DEV; 95/130 remain exact named blockers.** This file is a census and handoff, not a readiness
claim. It exists to prevent deleted disposable tests from being silently treated as redundant or a static/mock gate
from being presented as PostgreSQL evidence.

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

## Executable named-DEV runner

The single command is:

```bash
pnpm --dir apps/webapp run test:db-behavior:named-dev
```

It is fixed to `http://127.0.0.1:5200`, accepts no URL/target/database argument, reads only the canonical non-symlink
`/home/dev/dev-projects/BersonCareBot/.env` and
`/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev`, and refuses unless `INTEGRATOR_DB_URL` plus all three
webapp port URLs name exact `bcb_webapp_dev` in `port-context` mode. It uses six ordinary dev-bypass identities,
product HTTP/application ports, two concurrent product requests for the booking race and durable product readbacks.
Reversible state is restored; created reminder/booking entities are completed through ordinary delete/cancel.
Contractually retained audit/history/chat rows carry one unique run tag and the report states their bounded count.

Refusal/mutation self-test reads and validates the actual canonical env files, but does not contact the webapp or DB
and does not mutate DEV:

```bash
pnpm --dir apps/webapp run test:db-behavior:named-dev:self-test
```

The live command is intentionally **not run yet**: the shared DEV server is occupied by live audit A, and the worker
brief explicitly forbids a concurrent mutating pass. Therefore its 33 cells are `READY`, not `PASS`.

## File-by-file accounting

`Static` is an exact surviving oracle. `Runner` is implemented by the command above but remains unproved until its
first serialized live run. `Blocked` has no compliant product setup/observation path under the current four-login/
exact-capability B0 contract; the reason categories follow the table.

| Removed product oracle                       |   Calls | Static | Runner | Blocked | Required behavior class                                        |
| -------------------------------------------- | ------: | -----: | -----: | ------: | -------------------------------------------------------------- |
| `adminAuditLog`                              |       3 |      0 |      3 |       0 | real filtered reads and conflict count                         |
| `platformUserFullPurge.patientFiles`         |       3 |      2 |      0 |       1 | collection mapping; cascade/order remains live                 |
| `platformUserFullPurge`                      |       2 |      0 |      0 |       2 | purge target read without mutation                             |
| `platformUserMergePreview`                   |       3 |      0 |      0 |       3 | read-only search/preview and zero-write branch                 |
| `appointmentReminderDelivery`                |       3 |      0 |      0 |       3 | generation revalidation, retry race, blocked recipient         |
| `authEmailOtpDeliveryOwnership`              |       7 |      0 |      0 |       7 | token ownership, anti-reopen, enqueue golden path              |
| `loginBootstrapDefinerAccessors`             |       8 |      0 |      0 |       8 | table denial plus narrow accessor positive/negative            |
| `orgBrandRevisionGuard`                      |       5 |      0 |      0 |       5 | immutable published/archive guard plus FK purge                |
| `patientReminderMaterialization`             |       8 |      0 |      0 |       8 | tenant wall, rollback, upsert race, grants/ownership           |
| `pgAuthRateLimitEvents`                      |       1 |      0 |      0 |       1 | transactional max-per-window                                   |
| `pgBookingScheduling.deactivateWorkingHours` |       2 |      0 |      2 |       0 | real update and swapped-argument regression                    |
| `pgBookingScheduling.readChokepoint`         |       3 |      0 |      3 |       0 | two-tenant positive/negative reads                             |
| `pgCanonicalAppointments`                    |       2 |      0 |      2 |       0 | canonical/retained lookup and soft delete                      |
| `pgDoctorAnalyticsMetricAccounts`            |       1 |      0 |      1 |       0 | real metric account count                                      |
| `pgDoctorBroadcastDelivery`                  |       4 |      0 |      0 |       4 | atomic audit/jobs/recipients and rollback                      |
| `pgDoctorClients`                            |       3 |      0 |      3 |       0 | list/metrics and specialist isolation                          |
| `pgEmailChallengeAtomicAttempts`             |       2 |      0 |      0 |       2 | row-lock increment race and deleted challenge                  |
| `pgEmailOtpPublicAtomicConsume`              |       1 |      0 |      0 |       1 | exactly-one concurrent consume                                 |
| `pgGlobalAdminWebPushRecipients`             |       1 |      0 |      0 |       1 | active canonical admin recipient filter                        |
| `pgMediaWorkerControl`                       |       7 |      0 |      0 |       7 | claim race, quarantine, ownership, completion rollback         |
| `pgOtpDecayingLockoutAtomicEscalation`       |       2 |      0 |      0 |       2 | email/phone serialized escalation cycles                       |
| `pgPatientBookings`                          |       2 |      0 |      2 |       0 | unknown read and real history row                              |
| `pgPhase14DCommsTail`                        |       4 |      0 |      1 |       3 | broadcast and timezone real reads                              |
| `pgPhoneChallengeAtomicAttempts`             |       2 |      0 |      0 |       2 | row-lock increment race and deleted challenge                  |
| `pgPlatformUserMerge`                        |       2 |      0 |      0 |       2 | identity/projection and analytics collision merge              |
| `pgProgramItemDiscussion.doctorComments`     |       2 |      0 |      0 |       2 | live SQL execution and cursor pagination                       |
| `pgSaasBillingCapture`                       |       3 |      0 |      0 |       3 | invoice/tariff transaction and missing-principal failure       |
| `pgSupportCommunication`                     |       5 |      0 |      5 |       0 | real conversation/unread reads and assignment wall             |
| `pgUserProjection`                           |       6 |      0 |      0 |       6 | phone/email reads plus exact email clear/no-op                 |
| `reminderCallbackCapabilities`               |      10 |      0 |      0 |      10 | signature/tenant wall/idempotency and definer-only ACL         |
| `reminderOccurrenceD21Migration`             |       1 |      0 |      0 |       1 | B0 equivalent of legacy occurrence convergence not yet named   |
| `reminderRulesD5Migration`                   |       1 |      0 |      1 |       0 | B0 rule create/update/delete through the canonical parent path |
| `saasBillingPaidTariffApplyAccessor`         |       7 |      0 |      0 |       7 | paid/foreign/unpaid guards and tariff application              |
| `saasBillingWebhookBootstrapInvoiceResolver` |       4 |      0 |      0 |       4 | plain-table denial and narrow resolver                         |
| `tenantIsolationMatrix`                      |      10 |      0 |     10 |       0 | staff/patient A/B walls through paired product identities      |
| **Total**                                    | **130** |  **2** | **33** |  **95** |                                                                |

## Exact remaining blockers

No blocker below authorizes a new capability, fixture seam, grant, raw query or direct DB test:

1. **No accepted product setup/cleanup port (`42` calls):** OTP/challenge ownership and row-lock races, media-worker
   claim/quarantine/completion, user merge collision, full purge ordering and brand-revision FK/immutability need rows
   that ordinary product routes cannot currently seed and observe together. Adding a DEV-only root would be a
   production backdoor and is explicitly forbidden.
2. **Worker/scheduler/provider pipeline (`23` calls):** appointment reminder delivery, patient reminder
   materialization and signed callback generation require the common scheduler/worker plus the corrected exact roots.
   They belong to the serialized worker/scheduler live pass, not a second concurrent runner; external delivery remains
   disabled on DEV.
3. **Deployment catalog/ACL rather than user flow (`8` calls):** direct-table denial, function ownership and exact
   EXECUTE grants require the declaration reconcile/catalog audit on the real named DB. A product route proves a
   positive/negative human consequence, but cannot honestly prove catalog ownership or absence of a direct grant.
4. **Billing/payment atomicity (`14` calls):** paid/unpaid/foreign invoice application and webhook bootstrap require
   a provider-owned paid invoice state. The ordinary clinic/global-admin UI may create an invoice but cannot fabricate
   provider payment state; doing so through a fixture root is forbidden.
5. **Removed/unavailable product surface (`8` calls):** platform merge preview/search endpoints intentionally return
   `404 not_available`; the two program-comment pagination calls have no safe deterministic product fixture in the
   current DEV accounts. A `404` is not substituted for the removed read/preview oracle.

Counts: `42 + 23 + 8 + 14 + 8 = 95`.

## Runner contract and acceptance

The runner must remain one serialized command and refuse anything except canonical named DEV. It must use existing
application/Drizzle ports for setup, action, observation and cleanup; use per-run unique identifiers; and apply only
product cleanup semantics. It must not accept a generic URL, use `psql`, replay a file, create/drop a database/schema,
change roles/policies, or run on TEST/PROD. Concurrency uses two product-port calls against one tagged fixture and a
durable product readback.

`ca1d848ee` plus this runner still **must not be landed as a complete 130/130 replacement**. Acceptance requires:

- serialized live PASS of the 33 `Runner` cells after audit A releases shared DEV;
- independent verification that the command really fails on target overrides and foreign tenant mutations;
- exact evidence for each of the 95 blocked calls, or an owner decision removing that behavior requirement.
