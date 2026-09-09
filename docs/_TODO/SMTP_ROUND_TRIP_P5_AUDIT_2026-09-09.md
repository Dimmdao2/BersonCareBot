# Independent audit — P5 two-audience SMTP round-trip probe

## Subject and authority

- Base: `c5ff7b741b30e48caa05b87ebf98ca1c09c4df2a`
- Candidate: `90ce4fad74e1704335f24d552741ab8f58e33951`
- Independent oracle: owner-authored P5 in
  `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md` and observable SMTP receiver +
  `operator_health_imap` mailbox arrival.

## Blind TEST / LOOK kill-set (written before reading existing tests)

| P5 item | Fault and expensive silent impact | Independent oracle and terminal observable | Method |
| --- | --- | --- | --- |
| Due run emits two isolated probes | One audience/run can satisfy another; staff or patient platform mail is silently unmonitored | P5 and recipient mailbox: one unpredictable run identity plus distinct audience markers; both distinct messages arrive | TEST — owner-authorized TEST live gate; no local expected value can replace actual mailbox delivery |
| Arrival, not send acceptance, determines green | SMTP accepts mail but receiver never gets it; health falsely stays green while delivery is broken | P5 and IMAP mailbox before `roundTripDeadlineMs`: both arrivals observed before success | TEST — owner-authorized TEST live gate |
| Bounded network work and retry/idempotency | IMAP socket leaks or retry duplicates/cross-satisfies runs; scheduler degrades or reports false health | P5: bounded operation releases its public protocol connection; each retry/run preserves audience/run identity | TEST — only if an existing proportionate public runner boundary and realistic local protocol endpoint can observe it; otherwise LOOK with post-land live evidence |
| Owned retention cleanup | Probe cleanup deletes an owner’s unrelated mail or deletes fresh probe mail | P5 and a mailbox containing owned/foreign/fresh messages: only expired, exact-probe-owned messages disappear at cadence | TEST — only with the same proportionate realistic mailbox boundary; otherwise LOOK with TEST mailbox gate |
| Honest config and scoped incident lifecycle | Missing configuration becomes false green, missing configured delivery is hidden, or one audience resolves the other incident | P5: skipped/not-configured remains honest; configured missed delivery opens existing red incident with safe audience detail; matching later success alone resolves it | TEST — public runner/result persistence boundary, if existing boundary permits an independent P5 oracle |
| Existing quiet window and other probes/status persistence | New probe bypasses quiet-window/Telegram/MAX/Google or writes a second health status | P5: existing result/status and unaffected probe outcomes remain observable | LOOK — preservation/integration inspection; no new independent behavior is required unless a changed public outcome is found |
| Secrets, DEV safety and least privilege | Secret escapes DB restriction, DEV reaches provider, or scheduler gains unrelated DB authority | P5 plus repository DB/config and DEV-isolation rules: DB-backed restricted settings, DEV no-op, named capabilities only | LOOK — configuration/privilege boundary and non-live static evidence; source/config-shape tests are prohibited |
| Deployment privileges/readiness agree with runtime | Runtime deploys green but fails with `42501`, or readiness grants excess access | Migration/privilege rules and runtime calls: declaration/C4 readiness cover exactly the named settings/status operations | LOOK — written privilege review plus allowed static/readiness evidence; no SQL-text test or database application |

At blind classification, no test was admitted. The two local-protocol candidates remain conditional on an
already-proportionate public boundary and fault injection against the stated fault.

## Inspection, validation, findings and verdict

### Inspection evidence

- Complete reviewed diff: `git diff --find-renames --find-copies --no-ext-diff
  c5ff7b741..90ce4fad7`; `git diff --check c5ff7b741..90ce4fad7` passed.
- The candidate reuses the resident scheduler, audience SMTP resolver/mailer, status row and
  incident reporter; no parallel scheduler/status store was introduced. DEV exits the email
  branch before SMTP/IMAP work (`operatorHealthProbeRunner.ts:455-475`).
- C4 review: the scheduler gets only the two fixed SMTP profiles and the fixed IMAP setting,
  never `SELECT` on `public.system_settings`; the capability declaration and readiness assertion
  list those same calls. No migration was added or applied, no SQL-text test was written, and no
  DB/TEST/PROD/provider/credential operation was performed.
- The new `imapflow@1.7.8` dependency is lockfile-resolved. Its local type definition documents
  `logout()` as graceful and `close()` as the separate immediate TCP close; its implementation
  runs `LOGOUT` and awaits the server response.

### Retained acceptance test

`apps/integrator/src/infra/runtime/scheduler/operatorHealthProbeTick.unit.test.ts` is updated for
the new cadence field and adds one public scheduler-boundary assertion: when only email is due,
the runner receives `['email']`. Oracle: P5's required scheduled two-audience probe. Silent costly
failure: the SMTP/IMAP health check never runs, so a broken platform sender remains undetected.
The observable consequence is the runner not receiving the email probe.

Fault injection (restored): changed the email eligibility condition in
`operatorHealthProbeTick.ts` to exclude email. The targeted test failed exactly at the assertion
that the tick returns `true`/receives `['email']` (`1 failed, 5 passed`). The source was restored;
the final targeted run passed (`6/6`). This test does not claim SMTP or IMAP arrival.

### Validation

| Command | Result |
| --- | --- |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/infra/runtime/scheduler/operatorHealthProbeTick.unit.test.ts src/app/operatorHealthProbeSettings.unit.test.ts src/infra/db/repos/operatorHealthDrizzle.openOrTouchOperatorIncident.test.ts src/integrations/email/mailer.smtp.contract.test.ts && pnpm --dir apps/integrator typecheck && pnpm --dir apps/integrator exec eslint src/app/operatorHealthProbeRunner.ts src/app/operatorHealthProbeSettings.ts src/config/smtpOutbound.ts src/infra/db/publicRestrictedSettings.ts src/infra/db/repos/operatorHealthDrizzle.ts src/infra/runtime/scheduler/operatorHealthProbeTick.ts src/infra/runtime/scheduler/operatorHealthProbeTick.unit.test.ts src/integrations/email/mailer.ts && bash -n deploy/host/assert-c4-operational-runtime-ready.sh && git diff --check c5ff7b741..90ce4fad7"` | PASS — 4 files, 22 tests; integrator typecheck, scoped ESLint, shell syntax and candidate diff-check passed. |
| Same host-locked Vitest command for `operatorHealthProbeTick.unit.test.ts` after restored fault injection | PASS — 6 tests. Host lock ledger: `free since 2026-09-09T23:42:53+03:00 (last rc=0, ran 2s)`. |

The initial targeted run correctly exposed four stale scheduler expectations because the candidate
introduced a new due probe without supplying `email` last-run values. The retained acceptance
update above makes those scenarios explicit; it is not a source/config-shape test.

### Findings

1. **P5-01 — existing red delivery incident is never opened or resolved (BLOCKER).** A missed
   audience probe calls `reportOperatorFailure` with
   `direction=outbound_delivery_provider` (`operatorHealthProbeRunner.ts:560-567`), but under the
   scheduler role `openOrTouchOperatorIncident` invokes
   `app.open_or_touch_operator_probe_incident` (`operatorHealthDrizzle.ts:41-47`). That C4 function
   hard-codes the persisted dedup key/direction to `outbound:email:...` (`c4-operational-runtime.sql:945-952`).
   The later matching-success path instead resolves only
   `outbound_delivery_provider:email:...` (`operatorHealthDrizzle.ts:270-276`). Consequently an
   actual failed TherapyGo/Therapysto probe is neither the existing red provider incident consumed
   by the critical/digest flow nor resolvable by its matching later success. Impact: delivery can be
   missing while the required red escalation lifecycle is absent or leaves a stale probe incident.

2. **P5-02 — timeout can leak an IMAP connection (BLOCKER).** `withImapMailbox` wraps
   `client.logout()` in `withProbeTimeout`, but calls `client.close()` only if the *logout promise
   rejects* (`operatorHealthProbeRunner.ts:116-122`). A server that accepts the connection and then
   never answers `LOGOUT` leaves that promise pending; the wrapper rejects after the timeout but
   does not close the socket. Impact: repeated deadline polls can exhaust IMAP connections while
   reporting an ordinary probe failure, violating P5's bounded-resource requirement.

3. **P5-03 — cleanup can delete unrelated mailbox mail (BLOCKER).** Cleanup accepts a message as
   owned solely from a subject prefix, a custom MIME header and the RFC `From` header
   (`operatorHealthProbeRunner.ts:174-197`). A sender to the owner mailbox can forge all three
   message headers, including a platform-looking `From`; SMTP message headers are not a proof of
   probe ownership. Impact: after retention, the probe may delete an unrelated owner message,
   contrary to P5's explicit deletion boundary.

### Remaining live gate

After a correcting worker stage and a green targeted re-run, the still-required post-land
owner-authorized TEST gate is: configure only the dedicated owner mailbox, send both platform
profiles, observe two distinct SMTP→IMAP arrivals before the deadline, force one configured profile
to miss, observe the matching red incident and later matching-only resolution, and verify owned-only
retention cleanup. DEV must remain a no-op; no provider credential is recorded here.

## Verdict

**BLOCKED** — P5-01, P5-02 and P5-03 are reachable owner-requirement violations. No production
code was changed by this audit.
