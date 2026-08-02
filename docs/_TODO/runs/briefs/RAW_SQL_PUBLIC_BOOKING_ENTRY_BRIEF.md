# Public booking entry raw-SQL text slice

## Authority and human outcome

Read `AGENTS.md` §5/§10/§24, `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` and
`docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md` before editing.

Источник оракула: `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md` §Authority — «the target is typed
Drizzle builders/schema (`select`/`insert`/`update`/`delete`, with `sql` only for PostgreSQL primitives)».

Human path: `/book/[slug]` resolves the requested clinic, public booking creates a phone challenge, and confirmation
consumes that OTP. If hand-numbered `$1..$n` text drifts from its arguments or SECURITY DEFINER signature, the
patient cannot open the intended clinic or confirm the booking. Convert this one path to the existing typed SQL
builder without changing behavior.

Branch/worktree: `wt/raw-sql-public-booking-entry` / `bcb-wt-raw-sql-public-booking-entry`.

## Exact scope

Production files only:

- `apps/webapp/src/infra/repos/pgClinicDirectory.ts` — current 3 `runWebappPgText` calls;
- `apps/webapp/src/infra/repos/pgPublicBookingOtp.ts` — current 2 calls.

Reuse `getWebappSqlDb()` and `runWebappSql<T>(db, sql\`...\`)`; follow
`apps/webapp/src/infra/repos/pgPlaybackResolutionEvents.ts`. Preserve every PostgreSQL cast, function, returned
field, error mapping, transaction boundary and parameter value/order. Structural Drizzle interpolation only;
`sql.raw`, a new port/helper/route/schema/function/grant/migration or raw driver access are forbidden.

Allowed evidence docs in the same final commit:

- `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md`;
- the raw-SQL-text progress line in `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`.

Do not touch billing/quota files, `pgPatientBookings.ts`, `pgAppointmentProjection.ts`,
`pgOrganizationInvites.ts`, `pgBookingScheduling.ts`, `pgPayments.ts`, routes or `buildAppDeps`.

## Acceptance

Baseline measured on `feat` by the canonical AST command in the census:

```text
webapp: candidateFiles=75, invocationFiles=74, semanticCalls=528
slice: 2 files, 5 calls
```

Required restored evidence:

1. Compile all five new tagged fragments with `PgDialect().sqlToQuery()` and compare normalized SQL plus exact
   parameter order/values to the old queries; this is one-time inspection evidence, not a permanent source-text test.
2. Exact AST count in the two files: `runWebappPgText=0`, `sql.raw=0`.
3. Run existing public-booking behavior tests:
   - `src/app/book/[slug]/page.cmsBoundary.unit.test.ts`;
   - `src/app/book/service/page.cmsBoundary.unit.test.ts`;
   - `src/app/api/booking/public/create/route.route.test.ts`;
   - `src/app/api/booking/public/create/confirm/route.route.test.ts`.
4. Scoped ESLint, `pnpm --dir apps/webapp typecheck`, `node scripts/check-no-new-raw-sql.mjs`, `git diff --check`.
5. Repeat the canonical AST census. Expected only if no concurrent raw-SQL land changed the base:
   `candidateFiles=73`, `invocationFiles=72`, `semanticCalls=523`; report the actual command/result rather than
   forcing the expected number.

No new DB harness. Runtime follow-up, only if static compilation/behavior evidence is insufficient, uses ordinary
DEV; role-enforcement belongs to TEST. Do not mutate DEV/TEST/PROD, push, or close the whole raw-SQL-text item.
Commit explicit paths with #1082 and report exact evidence.
