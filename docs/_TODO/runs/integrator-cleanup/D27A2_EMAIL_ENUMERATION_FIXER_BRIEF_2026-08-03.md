# D27-A2 — fixer brief (saved-oracle only)

Rules: `AGENTS.md` — read Маршрут, CORE rules, §5 (clean architecture), §10/§10a/§10b (tests), §24 (orchestration).
Language: internal work and this brief are English; repo file conventions unchanged.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — item **D27** and decision **Р-D27** (§2.3).
Audit report with the saved red tests: `docs/_TODO/runs/integrator-cleanup/D27A2_EMAIL_ENUMERATION_AUDIT_2026-08-03.md`.

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2.3 Р-D27 — «Список «другим способом»
показывает ВСЕ включённые в админке каналы без разделения, есть ли они у человека, и сообщение всегда одинаковое
(«код отправлен, проверьте входящие»; для почты — про спам): экран не должен подсказывать постороннему, какие каналы
есть у владельца номера.»

## Scope — exactly two findings, nothing else

The independent auditor already wrote the acceptance tests. They live in
`apps/webapp/src/app/api/auth/email-otp/start/route.route.test.ts` and are RED on the current product.
Your job is to make the product satisfy them. Do not rewrite the tests to fit the product; you may only extend
them if a fix genuinely needs an additional assertion, and you must say so in your report.

1. **Resend/cooldown is a direct account oracle.** A delivered known challenge creates email cooldown state, so the
   second request for a known address returns `429` while an unknown address keeps returning `200`. Public behavior
   must be identical for known and unknown at the same request count, while abuse control stays effective for both.
   The per-IP limiter already exists and must keep working.
2. **A rejected provider/service promise escapes the public route.** A rejection on the known-only provider path
   rejects the handler (non-neutral response) while unknown returns `200`. Contain it: same neutral public response,
   and a safe operator-side event with no email/OTP PII in logs.

## Explicitly out of scope — do not touch in this pass

- **Finding 1 of the audit report (slow-provider timing).** An arbitrary provider delay cannot be masked by a fixed
  `setTimeout`; it is honestly closed only by taking the provider out of the public request latency (durable auth
  delivery queue, D27-C / D30). Leave the auditor's timing test in place but do NOT add a fake timing mask. If the
  saved timing test is red at the end, that is expected — report it as such, do not "fix" it by sleeping.
- No DB migration, no queue, no identity change, no integrator change, no tariff/CMS/D30 change.
- No new files unless the fix cannot live in an existing module (`AGENTS.md` "Не плодить сущности").

## File scope

`apps/webapp/src/app/api/auth/email-otp/start/**`, `apps/webapp/src/modules/auth/**` (email OTP path only), the
audit test file above, and the D27 note in the WORK_ORDER. Nothing else.

## Done means

- The two in-scope saved acceptance tests are green; the timing test's status is reported honestly.
- `pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts src/modules/auth/emailOtpPublic.unit.test.ts` passes except the knowingly-deferred timing case.
- `pnpm --dir apps/webapp typecheck` and scoped ESLint on changed files pass; `git diff --check` clean.
- One commit on `wt/trackd-d27a2-email-enumeration` with a real message. Do not push, do not merge into `feat`.
- Final report names: what changed, which test proves each finding closed, and the exact commands with their counts.
