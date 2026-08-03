# TEST — restore the owner's password login and diagnose password change

Rules: `AGENTS.md` — Маршрут, CORE rules, §1/§1b, §6, §24. Language: internal work is English.
Authority: this brief (bounded operational incident, `ORCH_OPS`). Related: `#1057`, evidence in
`docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` §B0.3.

## What happened — do not re-investigate, it is established

During the B0.3 live payment run on 2026-08-03 an agent ran, under `sudo -u postgres`:
`apps/webapp/scripts/converge-saas-smoke-login-passwords.mjs --apply-test-from-stdin` → `exit 0`, `changed=3`.
It overwrote the passwords of **three existing TEST accounts** (clinic owner, global admin, patient). The owner
now cannot log in with his password on TEST. This is our doing, not a Track D regression — no commit today touched
`pgEmailPasswordLookup.ts`, `pgEmailAuth.ts` or the `email-password` routes.

## Work, in order

1. **Establish exactly which accounts were changed.** Read the convergence script and the TEST DB
   (`user_password_credentials`, `platform_users`) to name the three accounts by email and role, and when their
   credential rows were last updated. Do not print passwords or hashes anywhere.
2. **Restore access for the owner.** The goal is that the owner can log in again on TEST with a password he
   controls. Prefer the product's own path: trigger the normal password-reset/recovery flow for his account and
   verify it end to end. If that flow is broken (see 3), set a fresh strong password directly for his account
   through the same script/credential port — never by hand-crafted SQL against the hash — and deliver it to the
   owner **only** via `bash /home/dev/orch/notify-owner.sh` (never into the repo, the log, this brief, or the task
   DB).
3. **Diagnose password CHANGE separately.** The owner reports problems both with logging in by password and with
   changing the password. Test the change/reset flow on TEST as a normal user: request reset → receive the code or
   link → set a new password → log in with it. Record the exact step that fails, its status code and the server
   log line. Do not fix product code in this run — report precisely; a defect gets its own slice.
4. **Say plainly whether the two problems are one cause or two.**

## Boundaries

- TEST only. **PROD (`135.106.162.170`) is untouchable.** No deploy, no migration, no product code change.
- Never write a password, hash or token into a file, a commit, a log or the task DB.
- Do not re-run the convergence script against accounts that were not already converged — it is what caused this.

## Done means

- The owner can log in on TEST again, and you say how (recovered by product flow, or new password delivered via
  the notify channel).
- The password-change diagnosis is written up with the exact failing step, committed as
  `docs/_TODO/runs/billing/TEST_PASSWORD_INCIDENT_2026-08-03.md` on your branch (no secrets in it).
- Final line: is password login working now, yes or no; is password change working, yes or no.
