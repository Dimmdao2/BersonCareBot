# Independent audit — password-login raw SQL slice (#1082)

**Verdict: PASS.** Audited candidate `093099993` against parent `350f00dec`.
Scope was only the four calls in `apps/webapp/src/infra/repos/pgPasswordLoginProtection.ts`.

## Blind kill-set (written before candidate tests)

1. Compiled SQL changes selected columns or aliases.
2. A multi-argument call changes parameter order or value binding.
3. A UUID cast or nullable ALTCHA argument changes transport semantics.
4. ALTCHA issue timestamp loses its ISO value or `::timestamptz` cast.

## Evidence

- A source-capturing one-time oracle invoked all four production port methods with a mocked execution boundary, then compiled each actual `SQL` fragment using `new PgDialect().sqlToQuery()`. Whitespace-normalized SQL and exact params matched the parent for acquire, complete, read-secret, and issue-challenge. Nullable ALTCHA values, UUID casts, selected aliases, and ISO timestamp were included.
- Temporary fault 1 changed the first `password_login_issue_altcha_challenge` value from `params.emailNormalized` to `params.challengeDigest`. Oracle exit: `1`; only issue-challenge `paramsMatch` became `false`.
- Temporary fault 2 removed `::timestamptz` from the issue timestamp. Oracle exit: `1`; only issue-challenge `sqlMatches` became `false`.
- Both temporary changes were reverted. Candidate-file SHA-256 before and after was identical: `5ce514680ba6dddcab342db197978d9fa99e808791aacda123f8120268f74d33`; `git diff --exit-code 093099993 -- apps/webapp/src/infra/repos/pgPasswordLoginProtection.ts` exited `0`.

Killed/total/uncovered classes: **2 mandatory injected faults / 4 blind classes / 0 uncovered**. The two remaining classes (selected SQL/aliases and nullable UUID transport) were directly covered by the exact compiled-fragment equivalence oracle; no permanent test or harness was added.

## Commands and results

```sh
pnpm --dir apps/webapp test -- src/modules/auth/passwordAuth.route.test.ts
pnpm --dir apps/webapp exec eslint src/infra/repos/pgPasswordLoginProtection.ts
pnpm --dir apps/webapp typecheck
node scripts/check-no-new-raw-sql.mjs
git diff --check 350f00dec 093099993
git diff --exit-code 093099993 -- apps/webapp/src/infra/repos/pgPasswordLoginProtection.ts
```

All commands completed successfully. The route test ran with Vitest 4.1.6; scoped ESLint and webapp typecheck exited `0`; raw-SQL gate reported `OK (integrator manifest files: 7; webapp manifest files: 21)`; both Git checks exited `0`.

The exact AST census command in `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md` lines 25–54 returned:

```text
{ candidateFiles: 71, invocationFiles: 70, semanticCalls: 509 }
```

No database, DEV/TEST/PROD, migration, schema, billing, V9b, Ch3, or Track D was touched. Every temporary production mutation was restored byte-identically to candidate before the gates above.
