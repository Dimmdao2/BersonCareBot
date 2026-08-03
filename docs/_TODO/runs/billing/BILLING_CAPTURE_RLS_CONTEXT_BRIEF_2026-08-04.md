# B0.3 — the capture transaction runs without an RLS org context

⛔ **SUPERSEDED (fixer run, same day).** This brief's "Cause" section restates the `c3d576c54` measurement
without incorporating the refutation the SAME plan file already recorded one section earlier (`8cd4dcda9`, lead
check 04.08: "причина названа неверно"). Re-verified independently again this run against a real clone of
`bcb_webapp_dev` (real migrations, real `locked`-mode signed context, real FORCE RLS): both branches of
`captureSaasBillingPaymentSucceeded` complete cleanly under a real org principal — no pool.connect()-bypass
defect exists. The real cause of the 04.08 failure was a PL/pgSQL `FOUND`-clobbering bug inside
`app.apply_paid_saas_billing_tariff`, found and fixed by the parallel `wt/billing-capture-fix` worktree
(migration `0354`, commit `faa715252`, already merged into this branch). See
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, entry "fixer verdict on `1f1c73e0e`", for the full
reconciliation. Do not re-open a "pool.connect() bypass" fix from this brief.

Rules: `AGENTS.md` — Маршрут, CORE rules, §5 (DB only through the app's own port), §6, §10/§10a/§10b, §24.
Language: internal work is English.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` **B0.3**; task `#1057`. The measurement is already
committed there (`c3d576c54`) — do not re-diagnose it.

Источник оракула: `#1057` — «клиника выбирает и оплачивает тариф через настоящий PSP, получает и продлевает
доступ».

## The measured defect

Live run 2026-08-04: the clinic paid at YooKassa (`1992.14`, tariff KLINIKA), the webhook arrived **twice**, and
the capture failed with `saas_billing_tariff_apply_failed`.

Cause, reproduced by hand with an equivalent ROLLBACK transaction:
`captureSaasBillingPaymentSucceeded` writes `status='paid'` inside a bare drizzle transaction that takes its
connection through `pool.connect()`, **bypassing the `pool.query` wrapper that is the only place setting the RLS
organization context**. Inside that transaction `app.current_org_id()` is therefore always `NULL`, RLS silently
filters the `UPDATE` to zero rows, and the narrow accessor correctly refuses.

This is the "silent zero under RLS" class: every earlier fix on this path was right, and the payment still did not
land, because the failure looks like a refusal rather than a missing context.

## Work

1. Make the capture transaction acquire its connection the same way the rest of the code does, so the
   organization context is set inside it. Fix it at the **seam**, not by sprinkling a `SET` at the call site: if
   `pool.connect()` can hand out a context-less connection at all, that is the hole — say in your report whether
   you closed it for this caller only or for the class.
2. **Look for other callers of the same shape.** A bare `pool.connect()` transaction that writes RLS-protected
   tables is the same bug wherever it exists. List what you found, fix what is in this path, and report the rest
   rather than silently widening the slice.
3. Prove it with a behavioral test at the level the repo already tests this: a capture under a real organization
   principal updates the invoice and applies the tariff; without a context it must fail **loudly**, not silently
   write zero rows.

## Boundaries

- Do not weaken RLS, do not widen a role, do not touch the accessor or the trigger — they behaved correctly.
- No migration unless the fix genuinely needs one.
- **PROD (`135.106.162.170`) is untouchable.** No deploy; the lead deploys after land.
- No push.

## Done means

- The capture path writes under a real organization context, proven by test.
- Other bare-`pool.connect()` writers are enumerated in the report.
- Typecheck, scoped ESLint, `git diff --check` clean; one commit on your branch.
