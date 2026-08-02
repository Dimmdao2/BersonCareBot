# Independent audit — public email OTP raw-SQL slice (#1082)

**Verdict: PASS.** Candidate `2ea63d565f3591b6a6afc6b69681eab768c3b587` changes only
`apps/webapp/src/infra/repos/pgEmailOtpPublic.ts` from parent
`29b0538d43d09c16d7a28814ed217d978ece53ff`.

## Scope and blind kill-set

Authority: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, item 1 raw-SQL-text
slice; `AGENTS.md` §§5, 7, 9–11, 24. Before reading tests, the kill-set was:

1. Each of the five public `app.email_otp_public_*` accessors compiles to its
   parent whitespace-normalized SQL with the exact parent parameter vector.
2. Multi-argument registration must retain `emailNormalized, lastName, firstName,
   patronymic` in that order.

One-shot AST extraction of the actual five tagged fragments plus
`new PgDialect().sqlToQuery()` compared them with an independent parent oracle:
all five passed. The checked accessors were `find_or_create_user`,
`find_user_by_email`, `register_patient`, `consume_latest_challenge`, and
`find_email_send_cooldown_by_email`.

Temporary fault proof: swapped `input.lastName` and `input.firstName` in the
production `register_patient` fragment. The same compiler comparison failed with
`AssertionError: email_otp_public_register_patient parameter order`, actual
`["patient@example.test","First-name","Last-name","Patronymic"]`, exit `1`.
The production file was restored byte-for-byte: candidate blob and current
`git hash-object` are both `dcba7f468728a52da3c7743924c0eaade657e3f6`; `git diff
--quiet 2ea63d565 -- apps/webapp/src/infra/repos/pgEmailOtpPublic.ts` exited `0`.

**Killed/uncovered:** 2/2 blind fault classes killed; 0 uncovered. The injected
argument-order fault is a direct proof for class 2; the compiled comparison has
an exact SQL and parameter assertion for every fragment in class 1.

## Evidence

| Command | Result |
| --- | --- |
| `pnpm --dir apps/webapp exec vitest run --project=route src/app/api/auth/email-otp/confirm/route.route.test.ts` | PASS: 1 file, 1 test |
| `pnpm --dir apps/webapp test:postgres -- src/infra/repos/pgEmailOtpPublicAtomicConsume.postgres.integration.test.ts` | PASS: disposable PostgreSQL project, 4 files / 8 tests; atomic-consume file included |
| `pnpm --dir apps/webapp exec eslint --no-ignore src/infra/repos/pgEmailOtpPublic.ts` | PASS |
| `node scripts/check-no-new-raw-sql.mjs` | PASS: integrator manifest files 7; webapp manifest files 21 |
| Canonical AST census command in `runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md` | PASS: `{ candidateFiles: 72, invocationFiles: 71, semanticCalls: 513 }`; no `pgEmailOtpPublic.ts` legacy invocation |
| `git diff --no-ext-diff --check 2ea63d565^ 2ea63d565` and `git diff --check` | PASS, both exit 0 |

`pnpm --dir apps/webapp typecheck` is red in this worktree, but its errors are
outside the candidate file (unresolved workspace packages
`@bersoncare/platform-merge` / `@bersoncare/error-tracking` and dependent errors
in other modules). It is not a reachable build failure introduced by this
one-file candidate and therefore not an audit finding.

No temporary production mutation remains. No product code, migration, schema,
billing, V9b, or Track D file was changed.
