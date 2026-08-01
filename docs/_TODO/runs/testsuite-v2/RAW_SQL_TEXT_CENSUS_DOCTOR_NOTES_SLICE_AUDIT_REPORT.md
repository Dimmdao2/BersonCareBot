# Independent audit — doctor-notes SQL-text slice (#1082)

**Authority:** `RAW_SQL_DOCTOR_NOTES_SLICE_BRIEF.md`; candidate `ebdbde9eb`;
accepted census `300772f3d`.

## Result: PASS

1. **PASS — bounded diff.** `git diff --name-status ebdbde9eb^ ebdbde9eb`
   reports only `apps/webapp/src/infra/repos/pgDoctorNotes.ts` and the worker
   evidence report. No port, schema, caller, or other repository method changed.
2. **PASS — list contract.** The Drizzle query always has
   `eq(doctorNotes.userId, userId)`, adds
   `eq(doctorNotes.organizationId, organizationId)` only for a present
   organization ID, and uses `orderBy(desc(doctorNotes.createdAt))`.
3. **PASS — mapping and port.** `mapRow` existed before the candidate and the
   changed method returns `rows.map(mapRow)`; `DoctorNotesPort` is outside the
   candidate diff.
4. **PASS — typed Drizzle path.** AST inspection found no
   `runWebappPgText`/`webappSqlFromPgText` calls or `$1..$n` literals, and no
   `sql.raw`; `getWebappSqlDb().select().from(doctorNotes)` is used.
5. **PASS — local gates.** Executed from the repository root; all exited 0:

   ```sh
   git diff --check ebdbde9eb^ ebdbde9eb
   pnpm --dir apps/webapp exec eslint src/infra/repos/pgDoctorNotes.ts
   pnpm --dir apps/webapp typecheck
   node scripts/check-no-new-raw-sql.mjs
   ```

No test, DB/DEV/TEST/PROD proof, or harness was created or run.
