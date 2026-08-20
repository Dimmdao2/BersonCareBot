# B0 named-DEV DB behavior — independent audit, 2026-08-17

Candidate: `9e04a2e4557f9f346e6c5919f86a8a4eee6d06c0`  
Verdict: **FAIL**. DEV, TEST and PROD were not contacted or mutated. Product code and the candidate runner were not
changed. The two committed audit test files are intentionally red on the candidate and are the fixed handoff oracle.

## Blind gate result

| Gate | Result | Independent evidence |
| --- | --- | --- |
| Canonical named target only | **FAIL** | A remote `135.106.162.170/.../bcb_webapp_dev` URL and an integrator `legacy-guc` / webapp `port-context` split both pass `assertNamedDevEnv`; 2/2 audit mutations survive. |
| Product HTTP/application-port only | **PASS by inspection** | The runner uses `fetch` against fixed `http://127.0.0.1:5200`; it contains no DB client, SQL, grants, schema/database DDL or fixture seam. |
| Exact identities/tenant negatives/durable readback | **FAIL** | The implemented journeys contain useful negatives, but only at most 10 of the claimed 33 deleted calls have the same consequence; the other 23 use a different resource or assert only a shape. No live cell is PASS. |
| Restore / bounded failure debt | **FAIL** | Fetches have no timeout/abort. Reminder creation happens before the `try/finally` and has no run tag; a committed create followed by a lost/malformed response leaves an enabled rule that the runner cannot rediscover or delete. |
| Exact deleted-call census | **FAIL** | The published regex counts nine `RegExp.prototype.test(...)` assertions as test calls. Actual product test declarations are 121, not 130. |
| Independent blocker classification | **FAIL** | The stated `95` is based on the false census. Corrected blocked-source declarations are 86 before moving the unsupported READY claims back to unproved. Classification is below. |
| No-disposable executor gate | **FAIL** | Saved 12+6 mutations are killed, but three independently named equivalent executors survive: JS `pg.Client.query('CREATE DATABASE ...')`, `psql -c '\\i ...'`, and a callable Python `createdb`. |
| Retired active references | **FAIL** | 106 exact references from 60 non-archive documents point to 54 paths deleted by `fb44002ce`; the gate checks only four hard-coded path families. |

## Findings with reachable impact

### F1 — Target refusal can mutate a remote database with the DEV database name

`databaseNameFromUrl` returns only the path component; `assertNamedDevEnv` checks that component but not host/port.
It also chooses the webapp context mode first and does not verify the integrator mode independently. Therefore a
remote DB named `bcb_webapp_dev`, including a wrongly named database on the production host, passes before the HTTP
mutations start. This violates the hard DEV-only boundary.

Fixed failing oracle:

```bash
node --test apps/webapp/scripts/named-dev-db-behavior-runner.audit.test.mjs
# 0 pass / 2 fail: remote host survived; mixed context modes survived
```

Required fix: all four URLs must be exact loopback `127.0.0.1` named-DEV endpoints (including the canonical port),
and both env files must independently declare `port-context`. Keep actual secrets out of diagnostics.

### F2 — `130 = 2 + 33 + 95` is internally balanced but is not a test-call census

The matrix command uses an unanchored `\b(?:it|test)\s*\(` expression. It counts `.test(` inside assertions. The
nine false calls are: `authEmailOtpDeliveryOwnership` +2, `loginBootstrapDefinerAccessors` +2,
`pgSaasBillingCapture` +1, `reminderCallbackCapabilities` +2,
`saasBillingPaidTariffApplyAccessor` +1, and `saasBillingWebhookBootstrapInvoiceResolver` +1.

Exact source-declaration recount:

```bash
node --input-type=module - <<'NODE'
import { execFileSync } from 'node:child_process';
const files = execFileSync('git', ['diff', '--diff-filter=D', '--name-only', '0210820cd', 'fb44002ce'],
  { encoding: 'utf8' }).trim().split('\n')
  .filter((p) => p.endsWith('.postgres.integration.test.ts') && !p.includes('/app-layer/testing/'));
let calls = 0;
for (const path of files) {
  const source = execFileSync('git', ['show', `0210820cd:${path}`], { encoding: 'utf8' });
  calls += [...source.matchAll(/^\s*(?:it|test)(?:\.each\s*\([^)]*\))?\s*\(/gm)].length;
}
console.log({ productFiles: files.length, productCalls: calls });
NODE
# { productFiles: 35, productCalls: 121 }
```

The matrix's own arithmetic/parser comparison did prove that each of its 35 rows appears once and that its printed
numbers sum to 130. It did not prove that 130 source test calls existed.

### F3 — At least 23 of 33 READY claims do not preserve the deleted behavior

No live command was run, so even the semantically matching subset remains READY rather than PASS. Static comparison
of the deleted oracles with the runner gives this upper bound:

| Claimed runner class | Claimed | Same consequence, at most | Missing consequence |
| --- | ---: | ---: | --- |
| `adminAuditLog` | 3 | 0 | No deterministic fixture row/action or exact unresolved-conflict count; numeric/array shape is insufficient. |
| `pgBookingScheduling.deactivateWorkingHours` | 2 | 2 | Toggle + durable restore kills the original swapped-argument failure. |
| `pgBookingScheduling.readChokepoint` | 3 | 1 | One own row is required; the second own row and cross-org read are not asserted (only a foreign mutation is). |
| `pgCanonicalAppointments` | 2 | 0 | Runner uses canonical UUID booking routes, not retained Rubitime identifier lookup/delete. |
| `pgDoctorAnalyticsMetricAccounts` | 1 | 0 | Only `Array.isArray(items)` is asserted; no known account/count is read back. |
| `pgDoctorClients` | 3 | 2 | Real list and list isolation are exercised; dashboard patient metrics are not. |
| `pgPatientBookings` | 2 | 1 | Tagged history row is read back; unknown `getById` is not exercised. |
| `pgPhase14DCommsTail` | 1 | 1 | Known timezone write/read/restore is equivalent to the known-value read. |
| `pgSupportCommunication` | 5 | 3 | Real list/conversation and assignment wall are exercised; unknown existence and unread count are absent. |
| `reminderRulesD5Migration` | 1 | 0 | CRUD does not prove occurrence-parent FK, preserved delivery history, or fail-closed parent deletion. |
| `tenantIsolationMatrix` | 10 | 0 | The deleted oracles were exact `org_enrollments` and `clinical_visit` staff/patient walls; the runner checks different resources. |
| **Total** | **33** | **10** | **23 are unsupported by the implemented observations.** |

The runner may keep these journeys as broader product smoke, but the matrix must count exact human/architecture
consequences rather than nearby successful routes.

### F4 — Failure can hang forever or retain an unbounded reminder-rule debt

All session and health fetches have no `AbortSignal` or deadline. If Next stalls, `Promise.allSettled` and cleanup
never execute. More specifically, reminder creation occurs before its cleanup `try`: if the server commits and the
response is lost, malformed, or lacks `reminder.id`, the assertion throws before cleanup. The created rule has no
run tag and cannot be discovered by this runner. This is a reachable persistent scheduling side effect.

Required fix: bounded per-request and whole-run deadlines; tag every created entity before mutation; establish
cleanup ownership before the first mutating call; retry/reconcile tagged state in a final recovery phase. Intentionally
retained chat/history rows must remain uniquely tagged and their per-run maximum reported.

### F5 — The B0 retirement gate still has executable bypasses

The saved audit set is green:

```bash
node --test scripts/check-b0-migration-baseline.audit.test.mjs
# 4 test groups pass: 10 saved file/workspace + 2 manifest + 6 equivalent faults = 18/18 killed
```

But the broader owner invariant is red:

```bash
node --test scripts/check-b0-migration-baseline.named-dev.audit.test.mjs
# 0 pass / 3 fail: pg-client CREATE DATABASE, psql -c '\\i', Python createdb all survived
```

Each survivor is directly runnable by an agent and recreates the exact prohibited disposable/replay path. The
checker currently recognizes only selected shell/JS child-process shapes and does not scan Python or DB-client DDL.

### F6 — Deleted executors remain discoverable from active documentation

Independent exact-reference census (archives excluded) produced:

```text
deletedPaths=123
activeDocs=1182
exactActiveRefs=106
documents=60
deletedPathsReferenced=54
```

The census used `git diff --diff-filter=D --name-only fb44002ce^ fb44002ce`, enumerated `rg --files docs .cursor`,
excluded `docs/archive/**` and `.cursor/plans/archive/**`, and tested each active Markdown file for each exact deleted
path. Examples include current `_TODO` plans/logs/briefs pointing at removed SaaS smoke scripts, privilege fixtures,
quota-race scripts and deleted PostgreSQL tests. They are historical evidence in an active location; archive/move them
rather than rewriting history. The current checker only covers four retired path patterns, so its green output does
not establish the owner requirement that agents cannot follow the old path.

## Corrected classification of the matrix's 95 blockers

The matrix's 95 includes nine false `RegExp.test` matches. The actual source declarations in those rows are **86**.
They classify by consequence as follows:

| Class | Actual declarations | Exact disposition / safe oracle |
| --- | ---: | --- |
| Required reachable product or worker behavior | **71** | Preserve through named-DEV product journeys: strict purge/media cleanup; auth OTP/challenge/rate-limit/login; reminder materialize/delivery/callback; doctor broadcast/comments; media-worker claim/complete; identity projection/merge; billing webhook/capture/tariff. Use existing HTTP/application ports, scheduler/worker no-send delivery, unique ordinary product data and durable product/admin-health readbacks. Concurrency requires two ordinary product calls and a third durable readback. |
| Owner/security/deployment invariant | **9** | Two brand direct-update guards; two login direct-table denials; two reminder materializer owner/EXECUTE checks; one reminder callback ACL boundary; one tariff direct-write guard; one billing-bootstrap direct-table denial. Prove through the canonical declaration/reconcile/catalog verifier against named DEV plus positive product path—never a new fixture root or raw ad-hoc SQL. |
| Obsolete/removed implementation contract | **6** | Two `getPurgePlatformUserRowForTests` helper calls have no human contract; three global merge-preview calls belong to the intentionally unavailable U1 route (`/api/doctor/clients/merge-preview` returns `404 not_available`); one D21 historical migration-convergence call must not replay pre-B0 history. Record explicit owner/authority retirement; retain the current product purge and reminder occurrence consequences elsewhere. |
| **Total** | **86** | `71 + 9 + 6 = 86`. |

Per-row mapping for the 86 declarations:

- Product/worker: `platformUserFullPurge.patientFiles` 1; `appointmentReminderDelivery` 3;
  `authEmailOtpDeliveryOwnership` 5; login positive/negative accessors 4; brand media purge 3;
  reminder materialization behavior 6; auth rate 1; doctor broadcast 4; email attempts 2; email consume 1;
  global-admin push 1; media worker 7; lockout 2; comms tail 3; phone attempts 2; platform merge 2;
  doctor comments 2; billing capture 2; user projection 6; reminder callbacks 7; paid tariff behavior 5;
  webhook resolver behavior 2.
- Security/deployment: login denials 2; brand guards 2; reminder materializer catalog 2; callback ACL 1;
  tariff direct guard 1; webhook table denial 1.
- Retire with explicit authority: purge test helper 2; unavailable merge preview 3; pre-B0 D21 migration call 1.

## Minimal next systemic workstream

First repair this acceptance surface before any live run: enforce loopback/all-context refusal, add deadlines and
recoverable tagged cleanup, replace the false regex census with exact consequence IDs, and reduce READY to the exact
matching subset. Then execute one serialized named-DEV product pass and mark only observed consequences PASS.

After that, group the remaining required consequences by human journey rather than by deleted file: (1) identity/auth,
(2) reminders/messages/worker delivery, (3) billing/money, (4) media/branding/purge, with the nine catalog invariants
checked once by the canonical declaration verifier. Do not recreate one test per historical test call and do not add a
DEV-only setup root.

## Commands run

```bash
node scripts/check-b0-migration-baseline.mjs
# PASS: B0 roots + 18 webapp and 0 integrator forward migrations

node --test scripts/check-b0-migration-baseline.audit.test.mjs
# PASS: 4 groups, 18/18 named mutations killed

pnpm --dir apps/webapp run test:db-behavior:named-dev:self-test
# PASS: candidate's 5 self-tests + fixed registry; this does not contact DEV and does not prove live behavior

node --test apps/webapp/scripts/named-dev-db-behavior-runner.audit.test.mjs
# FAIL: 0/2 refusal mutations killed

node --test scripts/check-b0-migration-baseline.named-dev.audit.test.mjs
# FAIL: 0/3 additional disposable/replay mutations killed
```
