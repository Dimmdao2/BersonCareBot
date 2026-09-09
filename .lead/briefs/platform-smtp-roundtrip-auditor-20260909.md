# Тест или взгляд — independent audit of two-audience SMTP round-trip probe (#950 P5)

Audit exact candidate `90ce4fad74e1704335f24d552741ab8f58e33951` against base `c5ff7b741`. This is
an independent acceptance gate. Do not fix production code, contact real providers, deploy or push. Complete the
audit in one turn and commit the audit artifact plus only admissible behavioral acceptance tests.

## Mandatory reading and authority

1. Run `grep -n '^## \|^### ' AGENTS.md`; read §1 and its migration/privilege subsections, §1b, §2–§5,
   §9, §10, §10a and §10b in full (including the independent-oracle rule and UI-test prohibition), §12 and
   §24.4–§24.7. Read `docs/ORCHESTRATION_BINDINGS.md` and directly affected module contracts.
2. Read `/home/dev/dev-projects/BersonCareBot/.lead/briefs/platform-smtp-roundtrip-worker-20260909.md`, the exact
   full P5 checkbox in `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md`, and `TPB-13a` in the branding plan.
3. Compare the exact candidate to the named base. Before reading existing tests, perform the blind classification
   below.

Independent oracle: the owner-authored P5 requirement quoted in the worker brief and the external behavior of an
SMTP receiver plus IMAP mailbox. Our own types, DTOs, config declarations and implementation are not an oracle.

## First mandatory step: classify TEST or LOOK and write the blind kill-set

Classify every item separately before looking at existing tests:

- one scheduled due run sends distinct patient/TherapyGo and staff/Therapysto probes through the existing SMTP
  delivery path, with unpredictable run identity and audience markers that cannot satisfy another audience/run;
- send acceptance alone cannot mark health green; both actual mailbox arrivals must be observed by the deadline;
- bounded network operations always release IMAP resources; scheduler retry/idempotency does not duplicate or
  cross-satisfy runs;
- cleanup removes only old messages owned by this exact probe mechanism and obeys retention/cleanup cadence;
- invalid/missing config remains honest not-configured/skipped, while a configured missing delivery becomes the
  existing red delivery incident with safe audience detail; later success resolves only the matching probe incident;
- quiet-window and Telegram/MAX/Google behavior remain intact and use the existing result/status persistence;
- SMTP/IMAP secrets stay in restricted DB-backed settings; DEV cannot initiate real SMTP/IMAP; scheduler capability
  grants no broader read/write access than the named fixed settings/status operation;
- deployment SQL and readiness assertion agree with the runtime's actual least-privilege needs.

For each item name the fault, expensive silent impact, independent oracle, final observable outcome and **TEST** or
**LOOK**. Do not write source-string/SQL-text/config-shape/list/count/internal mock-call tests. Compilation/build
failures are not test-worthy. If realistic proof requires TEST mailbox credentials, mark it as a post-land live gate
rather than replacing the external provider with an expected value copied from our implementation.

## Audit boundary and checks

- Inspect the complete `c5ff7b741..90ce4fad7` diff: scheduler state transitions, timeouts, connection cleanup,
  run/audience correlation, deletion criteria, incident lifecycle, audience SMTP selection, DB boundaries, logs,
  and the new dependency.
- Inspect `deploy/postgres/c4-operational-runtime.sql` privileges under the migration/privilege rules. Do not apply it
  to DEV/TEST/PROD and do not write text-of-SQL tests; use rollback-only/static/introspection evidence allowed by the
  repository rules.
- Run targeted checks only through the host test lock where required. No full CI, no new Next server, no provider
  connection, no credential reads, no TEST/PROD mutation.
- Acceptance tests are optional, not a quota. Add/modify one only after recording independent oracle, costly silent
  failure, and end observable consequence. Use a public runner boundary and a realistic local protocol endpoint only
  if the machinery is proportionate. Fault-inject each retained/new test against its blind fault and restore all
  production code. Do not clean unrelated historical tests.
- A finding must be a reachable violation of P5 or a mandatory repo rule with concrete impact/evidence. Alternative
  architecture, stylistic preference and speculative hardening are not findings. Do not fix production code.

## Deliverable

Create one concise audit artifact beside `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md` (or its existing evidence
directory) recording candidate/base SHA, blind TEST/LOOK table, inspection evidence, exact commands/results,
test-policy disposition and fault injection, privilege review, remaining post-land TEST gate, findings, and binary
`PASS FOR LAND` or `BLOCKED`. Commit only that artifact and admissible acceptance tests with explicit paths. Report
the exact commit SHA; do not push.
