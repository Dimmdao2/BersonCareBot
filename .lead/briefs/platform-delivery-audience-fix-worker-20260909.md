# Worker brief — complete platform delivery split after failed audit (#787)

## Authority and mandatory reading

Work only in `/home/dev/dev-projects/bcb-wt-platform-delivery-audience-fix-20260909` on
`wt/platform-delivery-audience-fix-20260909`. The exact starting candidate is `51b4adb87`, containing product
candidate `87e7cb0ac` plus the independent audit/tests/report. Read `AGENTS.md` heading map first, then read in full
§1 migration/rights subsections, §2–§5, §7, §9, §10a, §10b, §12 and §24. Read
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.5 and C3/C4, and the complete audit
report `.lead/runs/platform-delivery-audience-split-audit-20260909/90-final-audit-report.md`.

You are the fixing WORKER. Do not write, rewrite, delete or broaden tests. The auditor already supplied the fixed
oracle; run it and preserve it. Do not clean historical tests. Do not read, print or write real credentials. Do not
touch TEST/PROD, provider APIs, env or live delivery. No full CI. Use explicit `git -C`; never `git add -A`; do not
push. Commit all allowed product/doc changes before ending the single turn.

Источник оракула: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` `TPB-12b` —
«Patient intent не уходит через Therapysto credential, а staff intent не уходит через TherapyGo credential»;
`TPB-13a` — «специалисту — Therapysto, стандартному пациенту — TherapyGo».

## Owner outcome

There are two separately configurable platform delivery identities across the same provider-independent mechanism:

- patient-facing platform delivery uses TherapyGo SMTP, Telegram and MAX;
- staff-facing platform delivery uses Therapysto SMTP, Telegram and MAX;
- a paid-branding clinic may override only patient-facing SMTP/bots through the existing organization-scoped path;
  staff never uses a clinic bot;
- provider-neutral message/command/event contracts and one dispatch path remain shared; only the final thin
  Telegram/MAX/SMTP adapter knows the provider API/payload;
- platform-admin UI configures both platform identities; branded clinic bots remain a later dependent stage and
  are not implemented here.

Do not create a second engine, queue, settings table, route family or provider-specific domain contract. Before any
new function/wrapper/gate, prove the existing dispatch/runtime/webhook/long-polling point cannot simply accept an
audience parameter. Prefer parameterising the existing chokepoint.

## Required fixes and completion

Fix every reachable audit finding:

1. The patient-message-to-doctor MAX path must carry staff audience and use Therapysto.
2. Immediate staff email paths must explicitly select staff/Therapysto, including the active clinic invite,
   specialist operational reminders and operator/staff service mail. Patient auth/transactional mail stays
   TherapyGo; branded patient auth mail keeps the existing clinic override/template behavior. Never infer audience
   from mutable display text. Carry one typed audience across the public signed boundary and pre-dispatch config
   gate so readiness and actual send resolve the same profile.
3. Make migration `20260909T190000_platform_delivery_audience_credentials.sql` pass the sanctioned owner-aware DEV
   rollback-only preflight by correcting the canonical privilege declaration/reconcile ownership path. Do not add
   GRANT/REVOKE to a migration, do not edit historical tier TSV lists, do not broaden runtime app-role rights.

Complete the part missing from the first candidate:

4. Both platform Telegram and MAX identities must be independently usable for inbound commands/menu/bootstrap as
   well as outbound delivery. Parameterise the existing provider-neutral webhook/long-polling/event-gateway path by
   `staff|patient`; do not duplicate command mapping or event processing. Each incoming provider instance must be
   authenticated against its own restricted DB-backed secret/token and retain its audience through the shared
   event path. Patient entry links/routes remain patient-facing; staff bot commands/links must not mint or route a
   patient surface. If the current product has no approved staff command/link behavior beyond operational delivery,
   fail closed/ignore that unsupported command rather than invent product UX, while still allowing independent bot
   registration and inbound authentication.
5. Global admin settings must expose the complete separate runtime inputs actually required by those two bot
   identities (token/API key and distinct webhook secret/mode where provider protocol requires it), write-only and
   restricted through the existing registry/service. Preserve current secrets compat only where it cannot cross
   identities; no common secret may silently authenticate both platform bots.
6. Update active plan/documentation to describe factual state, but do not close TPB-12a/12b/13a or C3/C4 because
   real provider/TEST gates are still outstanding. Do not rewrite historical audit evidence.

## Validation and commit

- First run the auditor's failing targeted tests and record the expected red baseline.
- After the fix, run the same targeted suites to green, plus affected existing Telegram/MAX webhook/long-polling,
  SMTP immediate-route, settings route/service suites. Do not add tests.
- Run integrator and webapp typecheck and scoped lint for touched files.
- Run `node deploy/postgres/privileges/generate-cli.mjs --check`, privilege typecheck, and the sanctioned
  `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` only as a
  rollback-only verification. Do not execute migrations.
- Inspect migration rights per `AGENTS.md`: objects, owner, callers, privileges, no direct grants.
- `git diff --check`; explicit staging; one meaningful commit containing `#787`, why, evidence and remaining live
  gates. End with commit SHA, exact commands/results, files changed and any genuine blocker.
