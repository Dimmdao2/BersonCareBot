# Code Audit 1 — PFI-ST-01
Auditor: code-auditor-1-pfi-st-01 (Sonnet, independent)
Date: 2026-06-19

## Finding summary
| Check | Result | Notes |
|---|---|---|
| 1. Root name constant | PASS | `CLIENT_FILES_ROOT_FOLDER_NAME = "Пациенты"`, legacy `"Файлы клиентов"` in `CLIENT_FILES_ROOT_FOLDER_NAME_LEGACY` |
| 2. ФИО helper correctness | PASS | Correct ФИО order, null/empty filter, trim, 180-char cap, "Клиент" fallback |
| 3. resolvePatientDisplayName update | PASS | Queries `patronymic`, calls helper with `(lastName, firstName, patronymic)` |
| 4. Backward-compat / no-duplicate | PASS with WARNING | Promote logic matches both names; `IN` clause uses raw sql-template interpolation (style concern only — values are hardcoded constants, no injection risk) |
| 5. No raw SQL | PASS | New `sql` template usage extends existing pattern; no new unguarded raw strings on user input |
| 6. Test adequacy | PASS | 8 new test cases cover all required scenarios + root name sanity; count matches spec |
| 7. Scope creep | PASS | Exactly 3 files changed, no unrelated edits |

---

## Detail

### Check 1 — Root name constant
**File:** `apps/webapp/src/modules/media/clientFilesFolders.ts` lines 3–6

`CLIENT_FILES_ROOT_FOLDER_NAME` is changed to `"Пациенты"`.
`CLIENT_FILES_ROOT_FOLDER_NAME_LEGACY = "Файлы клиентов"` is exported with a clarifying JSDoc comment.
Both are imported in `pgClientMediaFolders.ts` (lines 5–6) and used in the promote logic.

### Check 2 — ФИО helper correctness
**File:** `apps/webapp/src/modules/media/clientFilesFolders.ts` lines 30–43

```ts
export function clientPatientFolderFioName(
  lastName: string | null,
  firstName: string | null,
  patronymic: string | null,
): string {
  const parts = [lastName, firstName, patronymic]
    .filter((p): p is string => Boolean(p?.trim()))
    .map((p) => p.trim());
  const full = parts.join(" ");
  const base = full || "Клиент";
  return base.length <= 180 ? base : base.slice(0, 180);
}
```

- Parameter order: lastName → firstName → patronymic = ФИО order. PASS.
- Null/empty filter: `Boolean(p?.trim())` excludes null, undefined, empty string, whitespace-only. PASS.
- Each part trimmed via `.map((p) => p.trim())`. PASS.
- 180-char cap enforced. PASS.
- Fallback: when `full` is empty string, `base = "Клиент"`. PASS.

### Check 3 — resolvePatientDisplayName update
**File:** `apps/webapp/src/infra/repos/pgClientMediaFolders.ts` lines 87–103

The Drizzle `.select()` now includes `patronymic: platformUsers.patronymic` (line 90). `platformUsers.patronymic` maps to the `patronymic text` column at `schema.ts:83`.

Display name resolution:
```ts
const fio = clientPatientFolderFioName(row.lastName, row.firstName, row.patronymic);
if (fio !== "Клиент") return fio;
return row.displayName?.trim() || "Клиент";
```

Argument order `(lastName, firstName, patronymic)` matches the helper signature. PASS.
Fallback chain: FIO → displayName → "Клиент". PASS.

### Check 4 — Backward-compat / no-duplicate
**File:** `apps/webapp/src/infra/repos/pgClientMediaFolders.ts` lines 30–48

`promoteLegacyClientFilesRootFolder` first checks for any `client_files_root` kind record; if found, returns early (no duplicate). If not found, it runs:

```ts
sql`${mediaFolders.nameNormalized} IN (${CLIENT_FILES_ROOT_FOLDER_NAME.toLowerCase()}, ${CLIENT_FILES_ROOT_FOLDER_NAME_LEGACY.toLowerCase()})`
```

This matches `nameNormalized` against both `"пациенты"` and `"файлы клиентов"` — covering both the new name (if a dev environment was already migrated) and the old production name.

**WARNING (style, not defect):** The `IN` clause is constructed via Drizzle's `sql` template tag with plain JavaScript string interpolation. In Drizzle ORM, non-Drizzle-typed values interpolated directly into `sql\`...\`` are emitted as raw SQL text (not bound parameters). For these two hardcoded lowercase string constants there is zero injection risk, but the idiomatic Drizzle approach would be:

```ts
or(
  eq(mediaFolders.nameNormalized, CLIENT_FILES_ROOT_FOLDER_NAME.toLowerCase()),
  eq(mediaFolders.nameNormalized, CLIENT_FILES_ROOT_FOLDER_NAME_LEGACY.toLowerCase()),
)
```

This would generate properly parameterized SQL (`$1`, `$2`). The current approach is safe for these constants but diverges from the Drizzle `eq`/`inArray` pattern used elsewhere in the codebase (e.g., `pgDoctorCanonicalAppointments.ts` uses `inArray` for enum sets).

The singleton constraint `uq_media_folders_client_files_root` (`WHERE kind = 'client_files_root'`) at `schema.ts:1848` provides a secondary guard against duplicate root creation, though this is enforced at the DB level after insert, not at the promote stage.

**Correctness verdict for backward-compat logic: PASS.** The logic correctly prevents duplicate creation for both the old and new root names. The style warning is informational.

### Check 5 — No raw SQL
**Pre-existing** raw SQL: `clientFilesSubtreeFolderIdsSql()` at lines 161–170 (unchanged, pre-existing pattern).
**New code:** The `IN` clause uses `sql` template tag (Drizzle ORM helper), not `db.execute(sql.raw(...))` or `pg.query(string)`. The `sql` template tag is the standard Drizzle escape hatch for expressions not covered by the query builder. No new unguarded raw strings over user-controlled data are introduced. PASS.

### Check 6 — Test adequacy
**File:** `apps/webapp/src/modules/media/clientFilesFolders.test.ts`

New tests added to the `clientPatientFolderFioName` describe block (8 cases matching spec) plus 1 root-name sanity check:

| # | Test | Scenario covered |
|---|---|---|
| 1 | root folder name is «Пациенты» | Root name constant sanity |
| 2 | joins Фамилия Имя Отчество in correct order | Full ФИО, correct order |
| 3 | handles missing patronymic | Missing patronymic (null) |
| 4 | handles missing firstName and patronymic | Only lastName present |
| 5 | falls back to Клиент when all parts are null | All-null fallback |
| 6 | falls back to Клиент when all parts are empty strings | Whitespace-only fallback |
| 7 | trims whitespace from each part | Per-part trim |
| 8 | caps result at 180 chars | 180-char cap |

All 8 required scenarios from the spec are covered. Note: the 180-char test uses `long + " " + long` (two 100-char strings joined) = 201 chars, which correctly exceeds 180. The test asserts `result.length <= 180`. PASS.

Minor gap: no test for `missing lastName only` (firstName + patronymic present, no lastName). Not a spec requirement but would be a natural edge case. Not a blocker.

### Check 7 — Scope creep
Commit `51c1c410` stat: 3 files changed, 73 insertions, 5 deletions.
Files: `clientFilesFolders.ts`, `pgClientMediaFolders.ts`, `clientFilesFolders.test.ts`.
No unrelated files touched. PASS.

---

## Verdict: PASS

All 7 checks pass. One style WARNING is noted (non-parameterized `IN` clause in the promote logic using hardcoded constants) but does not constitute a correctness defect. No blockers identified.

**Recommended non-blocking follow-up:** Replace the `sql\`... IN (...)\`` fragment with `or(eq(...), eq(...))` to align with the codebase's Drizzle idiom and produce parameterized SQL.
