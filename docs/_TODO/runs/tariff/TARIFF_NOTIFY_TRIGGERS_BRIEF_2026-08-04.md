# Т2/Т7 — finish the notification triggers

Rules: `AGENTS.md` — Маршрут, CORE rules, §5, §10/§10a/§10b, §21 (UI copy), §24. Language: internal work is English.

Authority: `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` — items **Т2** and **Т7**, dictated by the
owner on 2026-08-03/04.

Источник оракула: тот же план, Т2 — «нужны ещё три, и названы они ради маркетинга: **старт триала**, **завершение
триала**, **регистрация — то есть первый вход в кабинет**»; Т7 — «льготный период начат/завершён… срабатывают
**только если оплаты нет**».

## What already exists on this branch

`79280dc3f` added the canonical condition list in `modules/org-entitlements` (`accessNotifications.ts`, `types.ts`,
`service.ts`, plus a test file) covering all five new conditions. **Its tests were never run** — the clone had no
`node_modules`. Start by installing and running them; if they fail, fix them before adding anything.

## Work

1. Install (`pnpm install --frozen-lockfile`) and make the existing tests green.
2. **Wire the five conditions end to end**, so each one actually fires from the real event:
   - registration — the person's first entry into the cabinet;
   - trial started / trial ended — from the trial lifecycle landed in `0346`;
   - grace started / grace ended — from the discount window, and **only while the organization has not paid**
     (Т7's own condition: these exist so the owner can mail an offer and a "the discount is ending" reminder to
     exactly the people who have not bought yet).
3. Make the admin surface show them: the validation, the API schema and the constructor's labels must all derive
   from the one canonical list — never a second copy of the values.
4. Behavioral tests per condition, including the negative for the grace pair: **an organization that has paid gets
   nothing**.

## Boundaries

- Т3 (a separate tab for mailings with a real editor) and Т1 (mechanics inheriting from system access) are
  **separate slices** — do not start them here.
- No change to the trial/discount model landed in `0346`, no change to payment capture.
- Migration if needed: temporary number in the clone; the final one is assigned at land by the lead.
- **PROD (`135.106.162.170`) is untouchable.** No deploy, no push.

## Done means

- All five conditions fire from their real events, proven by behavioral tests, with the paid-organization negative
  for the grace pair.
- One canonical list feeds validation, schema and labels.
- Typecheck, scoped ESLint, `git diff --check` clean; one commit on your branch.
