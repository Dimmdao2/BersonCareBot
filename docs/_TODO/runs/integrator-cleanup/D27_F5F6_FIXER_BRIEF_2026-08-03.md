# D27 F5/F6 — fixer by the saved oracle

Rules: `AGENTS.md` — Маршрут, CORE rules, §5, §10/§10a/§10b, §24.5 (the auditor wrote the test; you make the
product satisfy it). Language: internal work is English.

Authority: `docs/_TODO/runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` §2a;
audit report `D27_F5F6_INDEPENDENT_AUDIT_2026-08-03.md` on `wt/trackd-d27de-login-code-screen`.

Источник оракула: `IDENTITY_AND_MERGE_SCHEME.md` §2a пункт 1 — «Залогинить человека в аккаунт с той же почтой.
Тогда почта считается подтверждённой, так же как и по коду (OAuth для этого и нужен)».

## The single defect — the auditor's red test already proves it

`applyVerifiedOAuthEmail` (`pgOAuthUserResolve.ts`) now gates the **whole** `UPDATE` on `email IS NULL`. Correct
intent (F5: never silently reassign the primary), wrong reach: when the account already has that same address but
it was never verified — e.g. registered by email+password without finishing confirmation — `email_verified_at`
stays `NULL` forever even though the person just proved ownership through Google/Apple/Yandex.

Consequence for a real person: password login and password reset by that address silently stop working, with no
explanation. Both OAuth paths are affected identically because both call the same port.

## What to do

Separate the two things the single `UPDATE` currently conflates:

1. **Assigning the primary address** — only when the account has none. Keep exactly as the audit accepted it.
2. **Confirming an address the account already holds** — when the incoming verified provider address equals the
   account's existing address, set `email_verified_at` (idempotently; do not move it if already set). This is §2a
   case 1 and it must work whether or not the primary was assigned in this call.

Make the auditor's red acceptance test green without weakening it. Do not touch anything else the audit passed:
the six cases, the conflict refusal and its message, the equal-rights lookup, the grants file.

## Boundaries

- No new contact store, no migration, no change to which addresses may log in.
- No push, no merge into `feat`.

## Done means

- The auditor's saved test is green; the tests that pinned F5's non-reassignment stay green.
- `pnpm --dir apps/webapp exec vitest run` over the auth test files touched by F5/F6, `typecheck`, scoped ESLint,
  `git diff --check` — clean.
- One commit on `wt/trackd-d27de-login-code-screen`. Report the exact commands with counts and state plainly that
  an unverified-but-existing address now becomes verified by an OAuth sign-in.
