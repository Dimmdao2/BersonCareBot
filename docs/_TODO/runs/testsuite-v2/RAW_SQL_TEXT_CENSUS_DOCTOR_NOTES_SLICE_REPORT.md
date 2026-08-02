# Doctor-notes SQL-text slice (#1082)

`apps/webapp/src/infra/repos/pgDoctorNotes.ts` converts the sole
`listForUser` legacy `runWebappPgText` invocation to
`getWebappSqlDb().select().from(doctorNotes)`. The query always filters by
`doctorNotes.userId`; it adds the organization predicate only when the current
principal has an organization ID, and orders by `doctorNotes.createdAt` DESC.
`DoctorNotesPort`, `mapRow`, callers, result types, schema, and write path are
unchanged. No DB/DEV/TEST/PROD operation or test/harness was added or run.

Executed from the repository root:

```sh
git diff --check
pnpm --dir apps/webapp exec eslint src/infra/repos/pgDoctorNotes.ts
pnpm --dir apps/webapp run typecheck
node scripts/check-no-new-raw-sql.mjs
```

All commands exited 0. The final independent inspection audit must verify the
AST/diff contract: `runWebappPgText` is 0 in this file, with no
`webappSqlFromPgText` or `sql.raw`; `listForUser` retains the stated predicates
and descending order.
