# Doctor calendar timezone SQL-text slice (#1082)

`pgDoctorCalendarTimezone.ts` now reads the supplied platform user's personal
`calendar_timezone` through the existing Drizzle database path. It retains the
`DoctorCalendarTimezonePort`, has no organization predicate, and returns `null`
for a missing row or nullable value. No caller, route, module, DI, schema,
migration, DB, harness, or test changed; this is a one-time transport conversion,
not a new permanent source-text test.

## Target evidence

The target contains zero `runWebappPgText` calls and no `$n`,
`webappSqlFromPgText`, or `sql.raw`:

```sh
rg -n 'runWebappPgText|\$[0-9]+|webappSqlFromPgText|sql\.raw' \
  apps/webapp/src/infra/repos/pgDoctorCalendarTimezone.ts
# exit 1 (no matches)
```

Executed from the repository root, all exited 0:

```sh
pnpm --dir apps/webapp exec eslint src/infra/repos/pgDoctorCalendarTimezone.ts
pnpm --dir apps/webapp typecheck
node scripts/check-no-new-raw-sql.mjs
git diff --check
```

## Census caveat — current worktree does not match the supplied base

The slice authority states the accepted direct AST baseline as **84 files / 552
calls**, partitioned **TL 386 + WO 166**, and the requested post-slice result as
**83 / 551**, **TL 385 + WO 166**. Those figures do not reproduce on the actual
worktree supplied for this slice.

The exact AST walk (production `.ts/.tsx`, excluding `test`, `spec`, and
`stories`; `CallExpression` whose callee identifier is `runWebappPgText`) gives
**83 files / 551 calls** after this conversion. On the corrected
`wt/single-entry-integration` parent of merge `986516695`,
`986516695^2` (`4e336d856a7541d81732c032b977f4c84f8464a6`), the same command gives
**84 / 552**. Thus the conversion is exactly **1 file / 1 call** and matches the
stated authority baseline.

The broad production `$n` caller census is a separate denominator. The authority
states **99 files**, including **21 outside** the direct bridge denominator; the
same production-file walk on this worktree returns **103 files** (with **25**
outside the direct bridge candidate set). Neither the direct AST count nor the
broad `$n` count closes the larger raw-SQL-text item.

No plan checkbox was closed.
