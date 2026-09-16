# Worker correction — close the audited P5 SMTP round-trip failures (#950)

Correct the whole audited P5 stage in one coherent pass on exact HEAD `57bfcf0b8`. Do not stop after analysis,
do not write tests, do not perform live delivery, and commit all production corrections before ending.

## Mandatory authority and reading

1. Run `grep -n '^## \|^### ' AGENTS.md`, then read in full §1 and its migration/privilege subsections, §1b,
   §2–§5, §9, §10, §10a, §10b, §12 and §24.1/§24.2/§24.5–§24.7. The worker is forbidden to create,
   modify or replace tests. The committed auditor test is an input gate and stays unchanged.
2. Read the original worker brief
   `/home/dev/dev-projects/BersonCareBot/.lead/briefs/platform-smtp-roundtrip-worker-20260909.md`, exact P5 in
   `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md`, and the complete independent audit
   `docs/_TODO/SMTP_ROUND_TRIP_P5_AUDIT_2026-09-09.md`.
3. Inspect candidate `90ce4fad7`, audit commit `57bfcf0b8`, the exact implementation and directly affected C4
   capability/readiness declarations before editing. Reuse the existing scheduler, incident, restricted-setting,
   mailer and persistence seams; do not create a parallel path.

Источник оракула: `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md` P5 — «существующий
`operator_health_imap` подтверждает фактическое получение каждого письма до `roundTripDeadlineMs`, различает два
sender profile, очищает только свои старые probe-сообщения по retention и поднимает существующий красный delivery
incident при отсутствии любого из двух».

## Required correction

Close all three audit findings, preserving the rest of P5 behavior:

1. `P5-01`: failed patient/staff SMTP round trips must open/touch the existing red
   `outbound_delivery_provider` incident namespace and matching success must resolve only that exact audience
   incident. The scheduler-only capability must pin the allowed integration/error classes/direction internally;
   the caller must not receive a generic arbitrary incident door. Preserve existing MAX/Telegram/Google probe
   incident semantics and least privilege.
2. `P5-02`: every IMAP path must close the TCP connection even when graceful `LOGOUT` itself hangs past the
   configured timeout. Cleanup must be deterministic and idempotent; a timeout cannot leave a live socket or an
   unhandled promise behind.
3. `P5-03`: retention cleanup must not trust forgeable fixed subject/From/header strings as proof of ownership.
   Give each probe an unpredictable, cryptographically verifiable ownership marker tied to the current run/message
   and verifiable during cleanup without any new env secret, public secret, plaintext credential copy, parallel
   table/store or logged token. Wrong/absent/replayed-for-another-message proof must never authorize deletion.
   Credential rotation may leave an old probe undeleted; safety is mandatory and eventual cleanup is secondary.

For every helper or state object, first ask whether it can be a parameter/branch of the existing single choke point
under AGENTS.md §5. Do not broaden cleanup access, DB rights, runtime configuration or public APIs.

## Scope, safety and validation

Allowed production scope: directly affected files already changed by P5 under
`apps/integrator/src/app/operatorHealthProbeRunner.ts`, its existing SMTP/IMAP/config/db repository boundaries,
`deploy/postgres/c4-operational-runtime.sql`, the matching readiness assertion/declaration if required, and factual
P5 evidence. Package manifests only if the existing dependency requires no change. Do not touch bot/clinic UI,
mobile code, unrelated incidents, providers, databases, credentials, DEV/TEST/PROD runtime or another workstream.

Do not create/edit/delete tests. Run the exact committed targeted audit test set and relevant typecheck, scoped lint,
shell syntax, diff-check, and permitted rollback/static privilege checks. Do not run full CI, start Next, apply SQL,
deploy, push or contact SMTP/IMAP.

Commit explicit task paths only (never `git add -A`) with `#950 P5`, why, checks, and remaining owner-authorized TEST
gate. Report exact SHA, how each P5 finding is closed, checks actually run, and any remaining post-land live work.
The lead will inspect and accept the correction against the existing audit; do not launch another auditor.
