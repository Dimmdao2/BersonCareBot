# Independent audit — W5 (typed-SQL conversion), branch `wt/systemic-typed-sql-20260902`

Authority: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, item **W5** only.
Candidate: HEAD `a44726263`. Worker ancestry from `a32f53d1a`; W5's own non-merge commits are
`8508e0b2a 4dc5372e4 f8177ecab 010584798 24177ee70 2ecde3ed1 b5cc7a35f 480e28a12 d325cefb7`
(83 production files, one file added, none deleted).
Role: `auditor-live`. No product code changed; the one temporary probe file was deleted, `git status` clean.
No full CI, no live destructive DB work, no TEST/PROD action — per brief.

## Verdict

**W5 — FAIL.** The census the item asks for is honestly zero, and the ~15.5k-line conversion is
faithful statement-for-statement almost everywhere. But one converted write is broken in production
(every catalog exercise edit that carries a tag now errors), and the conversion left three test
files red in projects CI runs — two of them the oracles guarding the irreversible account purge that
this item was told to scrutinise.

| Claim from the brief | Result |
|---|---|
| Zero production calls to `runWebappPgText` / `runPgPoolPgText` | **PASS** |
| No temporary codemod file, no parallel adapter added | **PASS** (one file added: a shared predicate helper) |
| Parameterisation, transactions, optional predicates, pagination, return shapes preserved | **FAIL** — one site (F1) |
| Irreversible purge scrutinised | **FAIL** — statements faithful, but both purge oracles are dead/red (F4) |
| Auth/session scrutinised | **PASS** on behaviour; one auth-adjacent test red on a stale assertion (F4) |

## Blind kill-set (written from the authority before reading any worker test)

K1 a value that is not a scalar (array, jsonb, tuple) bound bare into a `sql` template → row constructor
instead of one parameter · K2 a `$n` reused twice in one statement, now split into two params with
different values · K3 an optional predicate that used to be appended conditionally now always present /
always absent · K4 `sql.raw` fed anything reachable from input · K5 `LIMIT/OFFSET` moved from bound to
inlined · K6 transaction boundary lost — statements that shared a client now on separate connections ·
K7 return shape changed (`rows`/`rowCount`, column aliases, `::text` casts dropped) · K8 a `::type` cast
dropped where Postgres cannot infer the parameter type (`AT TIME ZONE $1`, `$1 ~ regex`, `= ANY($1)`) ·
K9 the text bridge survives one hop away (a per-file wrapper) so the census is zero only by indirection ·
K10 a purge/delete predicate silently widened or narrowed · K11 a converted test keeps its old
text-transport assertions and becomes vacuous or red.

## Findings

### F1 — `lfk_exercises.tags` is written as a row constructor; every exercise edit with a tag fails (K1). SEVERE

`apps/webapp/src/infra/repos/pgLfkExercises.ts:788-817`. The dynamic SET builder binds every assigned
value bare:

```ts
const add = (col: string, v: unknown) => { sets.push(sql`${sql.raw(col)} = ${v}`); };
...
if (input.tags !== undefined) add('tags', input.tags);   // input.tags: string[] | null
```

Pre-W5 (`a32f53d1a`) the same builder pushed `` `${col} = $${n++}` `` and one value into `vals`, i.e. exactly
one bound parameter per column — correct for a `text[]`. Drizzle expands a bare JS array in a template into
a row constructor, so the compiled statement no longer assigns an array. Compiled with the repo's own
`PgDialect` (`drizzle-orm/pg-core`), same builder, `title='T'`, `tags=['a','b']`:

```
UPDATE lfk_exercises SET updated_at = now(), title = $1, tags = ($2, $3) WHERE id = $4
params ["T","a","b","ID"]
```

and for the other arities: `tags = ${[]}` → `SET tags = ()`; `tags = ${['a']}` → `SET tags = ($1)` with
params `["a"]`; the correct form `tags = ${sql.param(['a','b'])}` → `SET tags = $1` with params `[["a","b"]]`.

All three arities are rejected by Postgres. Proven on DEV (`bcb_webapp_dev`, read-only, session-local
PREPARE, no table touched):

```
PREPARE q0 AS WITH t AS (SELECT ARRAY['a']::text[] AS tags) SELECT tags = ()     FROM t;
  → ERROR: syntax error at or near ")"
PREPARE q1 AS WITH t AS (SELECT ARRAY['a']::text[] AS tags) SELECT tags = ($1)   FROM t;  -- parameter_types {text[]}
EXECUTE q1('a');
  → ERROR: malformed array literal: "a"   DETAIL: Array value must start with "{" or dimension information.
PREPARE q2 AS WITH t AS (SELECT ARRAY['a']::text[] AS tags) SELECT tags = ($1,$2) FROM t;
  → ERROR: operator does not exist: text[] = record
```

**Reachable impact.** `apps/webapp/src/app/app/doctor/exercises/actionsShared.ts:321,351-366` — the
edit-exercise server action always passes `tags: parseTags(formData.get('tags'))` into
`lfkExercises.updateExercise`, and `service.ts:64-88` forwards it unchanged, so `input.tags !== undefined`
always holds. `parseTags` returns `null` for an empty field and `string[]` otherwise. Therefore: saving a
catalog exercise with the tags field empty still works; **saving one with any tag at all fails outright**,
for every doctor in every organisation. The same file's INSERT is correct
(`pgLfkExercises.ts:750` — `${sql.param(input.tags ?? null)}`), which is what makes the omission a slip
rather than a misunderstanding.

**Containment.** `tags` is the only non-scalar in `UpdateExerciseInput` (`contraindications` is
`string | null`, `modules/lfk-exercises/types.ts:92`, row type at `pgLfkExercises.ts:78`). Sweeping every
dynamic builder in the converted set — `rg -n 'sql\.raw\((col|column|field)[^)]*\)\} = \$\{' apps/webapp/src
--glob '!**/*.test.*'` — returns six sites; five bind a scalar id (`platformUserFullPurge.ts:173,231,320,424`
bind `userId`; `pgDoctorClients.ts:108` binds `organizationId`). `pgLfkExercises.ts:792` is the only one
whose value parameter is `unknown`. One site, one column.

**Fix shape (not applied — auditor does not change product code):** `sets.push(sql`${sql.raw(col)} =
${sql.param(v)}`)`, which is what the INSERT already does, plus a test that compiles the builder and asserts
one placeholder per assignment.

### F2 — merge-preview "meaningful data" predicates silently narrowed against the guard they claim to mirror (K10). MODERATE

`apps/webapp/src/infra/platformUserMergePreview.ts:546-562`. Three of the six counters changed shape:

```
old (a32f53d1a): ... FROM symptom_trackings WHERE platform_user_id = $1::uuid OR user_id = $1::text
new:             ... FROM symptom_trackings WHERE ${platformUserMatchSql(null, userId)}
   (same for lfk_complexes and message_log)
```

`platformUserMatchSql` (`apps/webapp/src/infra/repos/platformUserMatchSql.ts`, the single file W5 added)
compiles to `(platform_user_id = $1::uuid OR (platform_user_id IS NULL AND user_id = $2::text))` — the
legacy-text arm is now gated on `platform_user_id IS NULL`. That helper is the correct consolidation of the
four identical local copies in `pgDiaryPurge` / `pgSymptomDiary` / `pgLfkDiary` / `pgMessageLog`, which all
carried the `IS NULL` guard. It is **not** the predicate the preview used.

The authority for this counter is `packages/platform-merge/src/pgPlatformUserMerge.ts:963-1011`
(`assertSharedPhoneGuard` → `meaningfulCount`), which still reads:

```
SELECT COUNT(*)::int AS c FROM symptom_trackings WHERE platform_user_id = $1::uuid OR user_id = $2::text
SELECT COUNT(*)::int AS c FROM lfk_complexes     WHERE platform_user_id = $1::uuid OR user_id = $2::text
```

**Reachable impact.** For a row that carries both a canonical `platform_user_id` and a matching legacy
`user_id`, the two now disagree. `platformUserMergePreview.ts:351-364` raises the hard blocker
`shared_phone_both_have_meaningful_data` only when both counts are `> 0`, and
`apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts:271-274` tells the operator in so many
words that this is "как в `assertSharedPhoneGuard`". The preview can now under-count and show no blocker,
after which the apply path throws `MergeDependentConflictError` from the real guard — the operator is told
the merge is safe and it is refused mid-flight. Same-file inconsistency confirms this was not a decision:
`countDependents` (`platformUserMergePreview.ts:564+`) kept the plain `OR` form for the same two tables.

Not proven against live rows: the preview and the guard read tables that are not visible to the DEV staff
principal from this worktree, and the brief forbids live destructive/merge work. The divergence is proven
at the SQL-text level, which is where it lives.

### F3 — the text bridge is dead but still exported, and no gate covers the layer it would come back in (K9). LOW, STRUCTURAL

The census is genuinely zero: `rg -o "runWebappPgText\(|runPgPoolPgText\(" apps/webapp/src --glob
"!**/*.test.*" | wc -l` → **0** (was 103 in 29 files). No wrapper survives one hop away either — the four
per-file pass-throughs named in the plan (`identityPhoneSql`, `platformUserPurgeSql` and their callers)
now take fragments. K9 does not fire.

But `apps/webapp/src/infra/db/runWebappSql.ts:123,152` still exports `runWebappPgText` and
`runPgPoolPgText` with zero callers repo-wide, and `scripts/check-db-chokepoint.mjs:187` only applies its
raw-SQL regex to `apps/webapp/src/modules/`, `app-layer/` and `app/**/{route.ts,page.tsx,actions.ts}` — see
`isGuardedLayerFile`. `infra/repos/**`, where 29 of the 29 converted files live, is not covered. A new
hand-numbered `runWebappPgText` call site in `infra/repos/` passes `check-db-chokepoint`,
`check-no-new-raw-sql` and typecheck today. Per §5 this is the chokepoint half-closed: the door was walked
through, not shut. Deleting the two exports costs nothing and makes the regression impossible.

### F4 — three test files left red by the conversion; two of them are the purge oracles (K11). SEVERE FOR LANDING

`d325cefb7` ("salvage typed-SQL fixture conversion") renamed mocks across the suite but did not adapt the
assertion bodies that depended on the text transport. Running exactly the tests W5 touched
(`git diff --name-only a32f53d1a..HEAD -- 'apps/webapp/**/*.test.*'`, 41 files, route project excluded):

```
Test Files  3 failed | 37 passed (40)
      Tests  5 failed
```

- `apps/webapp/src/infra/platformUserFullPurge.reminderHistoryKey.unit.test.ts` (project `unit`) —
  `AssertionError: expected undefined to be defined`. Commit `f8177ecab` renamed the mock
  `runPurgeClientPgText` → `runPurgeClientSql` but left `issuedStatements()` reading `String(call[1])` and
  `call[2]`; the second argument is now a Drizzle `SQL` object, so `text` is `[object Object]` and `values`
  is `[]`. The oracle in the file header — "the canonical platform user uuid is the ONLY account-purge key,
  no statement may bind it as a bigint" — no longer holds anything. The product statement is still correct
  (`platformUserFullPurge.ts:32` still lists `{ table: 'reminder_occurrence_history', column:
  'platform_user_id' }`, and `rg -n bigint` on the file returns nothing), so this is a lost guard on an
  irreversible operation, not data loss today.
- `apps/webapp/src/infra/platformUserFullPurge.collectPurgeArtifactKeys.test.ts` (project `fast`, 2 tests) —
  `TypeError: queryText.includes is not a function`, same cause, same commit. This one guards which S3
  artefacts a purge collects; it cannot run at all.
- `apps/webapp/src/infra/repos/d15b6PhoneMessengerBindMirror.unit.test.ts` (project `unit`, 2 tests) —
  the test stubs `webappSqlFromPgText: vi.fn(() => ({ tag: 'root-sql' }))` and asserts
  `runWebappNamedRoot` receives that stub as its 4th argument. The product now builds the fragment with a
  real `sql` template, so the assertion compares against a stale sentinel. The received call shows the
  identity and typed args unchanged (`app.phone_messenger_bind_secret(text,text,uuid,text,text,text,uuid,...)`
  with the same 11 values), so behaviour is preserved and only the assertion is stale — but it is red, in an
  auth path, in a project CI runs.

Per the merge gate (full lint + typecheck + affected route tests) W5 cannot land in this state regardless of
F1 and F2.

## What was checked and came back clean

- **Census (K9).** 103 → 0 production call sites. Only three `webappSqlFromPgText` uses survive in
  production — `pgEmailAuth.ts:110`, `pgEmailPasswordLookup.ts:41`, `pgMessengerPhoneHttpBind.ts:31` — and
  all three are the adapter between the webapp port and `@bersoncare/platform-merge`, a package shared with
  the integrator that cannot depend on the webapp's Drizzle port. Everything they run still goes through
  `runWebappSql`. Justified.
- **No parallel adapter (§5).** W5 added exactly one file, `infra/repos/platformUserMatchSql.ts`, which
  *removes* four copies of the same predicate rather than adding a fifth path. `node
  scripts/check-db-chokepoint.mjs` → OK; `node scripts/check-no-new-raw-sql.mjs` → OK, production debt 0.
  No codemod or scratch file is tracked (`git ls-files | grep -iE "codemod|tmpAudit|migrate-sql"` → none).
- **Structural SQL equality (K3, K5, K7).** Normalised every SQL literal in all 83 production files at
  `a32f53d1a` and at HEAD and set-diffed them; every difference reduces to the `$n` → `${}` rewrite. Three
  apparent dropped predicates found this way were false alarms from a condensed diff and are present in the
  real files: `pgLfkTemplates.getById` (`AND te.owner_kind = ${tr.rows[0].owner_kind}`), `pgBookingEngine`
  (`lower(city_code) <> … AND lower(title) <> …`), `idempotency/pgStore.ts` (`runWebappNamedRoot` still
  4-arg with `[key]`). The large multi-parameter statements were checked position-by-position:
  `pgPatientBookings` (19 params), `pgSupportCommunication` message INSERT (the `$10/$11` mid-list case),
  `pgEmailAuth` 11-arg named root, `pgLfkDiary` inserts, `pgDoctorClients` dynamic SET and WHERE.
- **Irreversible purge, statement level (K10).** The declared table/column lists at
  `platformUserFullPurge.ts:32-50` are byte-identical to `a32f53d1a:34-52`. Predicates that had no cast
  before still have none (old `DELETE FROM ${table} WHERE ${column} = $1`), which is correct: an untyped
  parameter takes its type from the column, so the same loop keeps working over both `uuid` and `text`
  keys. `anonymisePurgedUserReferences` (`:240-272`) is strictly safer than before — the JSON scrub token
  used to be interpolated into the SQL text (`replace(${col}::text, $1, '${PURGED_USER_JSON_TOKEN}')`) and
  is now bound. `$1`-reused-twice cases (`doctor_notes WHERE user_id = $1 OR author_id = $1`) became two
  parameters carrying the same value — identical semantics (K2 does not fire).
- **Auth/session.** `pgEmailAuth.startChallenge.unit.test.ts`, `pgEmailPasswordLookup.test.ts`,
  `pgUserPasswordCredentials.unit.test.ts`, `pgPhoneChallengeStore.unit.test.ts`,
  `pgSystemSettings.preauth.unit.test.ts` — green. Named-root identities and typed-arg arrays unchanged.
- **`sql.raw` inputs (K4).** Every `sql.raw` argument in the converted set traces to a module-level
  constant, an allowlisted table/column list, or a validated identifier —
  `pgProgramActionLog.localDoneDateSql` rejects anything outside `/^[-+/_0-9a-zA-Z]+$/` and then *binds*
  the zone (`(${logTable.createdAt} AT TIME ZONE ${displayIana})::date`), where the pre-W5 code
  string-escaped it into the text. Its `.groupBy(sql`1`)` ordinals were verified to match the select-list
  positions.
- **Type-inference casts (K8).** Checked the sites where Postgres cannot infer an untyped parameter
  (`AT TIME ZONE`, regex operands, `= ANY(...)`); casts are preserved or the parameter is inferable from
  the column.

## Out of scope for W5 — flagged, not fixed, not turned into work

Per §24.7 these have no matching line in the owner's plan, so they are questions, not tasks:

1. **HEAD does not typecheck.** `pnpm --dir apps/webapp typecheck` → 2 errors, both in
   `src/app/app/doctor/comments/loadDoctorCommentPatients.ts:118` (`string | null | undefined` not
   assignable to `string | null`), introduced by the merged `3e009731e feat(doctor-ui): checkpoint current
   dashboard and messaging work`. Not W5's, but it blocks the same gate.
2. **Stale package build masquerades as a failure.** Before `pnpm --dir packages/error-tracking build`,
   typecheck also reported four missing `@bersoncare/error-tracking` exports and
   `saasIsolationDbFailureReporting.unit.test.ts` + `backgroundJobManifest.unit.test.ts` failed; both go
   green after the rebuild. The source has the exports; only `dist/` was behind. Worth a note for whoever
   reads the next red CI.
3. **The comment justifying the three surviving bridges overstates.**
   `pgEmailAuth.ts:106-109` says "Nothing here is hand-numbered — `webappSqlFromPgText` only puts that
   machine-generated text back on the Drizzle channel". True for `packages/platform-merge/src/mergeSql.ts`
   (it compiles fragments through its own `PgDialect`), false for
   `packages/platform-merge/src/pgPlatformUserMerge.ts`, which carries 43 lines of hand-written `$n`.
   `packages/` is outside W5's stated command scope (`apps/webapp/src`), so this is a boundary question:
   does the item's intent stop at the app, or does the shared package inherit it?

## Evidence index

```
git rev-parse --short HEAD                                    # a44726263
rg -o "runWebappPgText\(|runPgPoolPgText\(" apps/webapp/src --glob '!**/*.test.*' | wc -l   # 0
rg -n "runWebappPgText|runPgPoolPgText" apps packages scripts                                # 2 defs + 1 gate regex
node scripts/check-db-chokepoint.mjs                          # OK
node scripts/check-no-new-raw-sql.mjs                          # OK, production debt 0
sed -n '788,817p' apps/webapp/src/infra/repos/pgLfkExercises.ts
git show a32f53d1a:apps/webapp/src/infra/repos/pgLfkExercises.ts   # pre-W5 builder, one param per column
sed -n '546,600p' apps/webapp/src/infra/platformUserMergePreview.ts
sed -n '963,1011p' packages/platform-merge/src/pgPlatformUserMerge.ts
pnpm exec vitest run $(git diff --name-only a32f53d1a..HEAD -- 'apps/webapp/**/*.test.*' \
  | sed 's#^apps/webapp/##' | grep -v '\.route\.test\.')       # 3 failed | 37 passed
```

The array-compilation figures in F1 came from a throwaway script run against the repo's own
`drizzle-orm`/`PgDialect` from `apps/webapp`; the script and the temporary vitest probe were deleted, and
`git status` is clean.
