# Code Audit 2 — PFI-ST-01 (Chief/Opus)
Auditor: code-auditor-2-pfi-st-01 (Opus, independent)
Date: 2026-06-19

Branch `auto/pfi-st-01`, commit `e3bc418c`, rebased on `feat/doctor-ui-rebuild` @ `42067e7d`.

## Finding summary
| Check | Result | Notes |
|---|---|---|
| 1. Root name correctness | PASS | `CLIENT_FILES_ROOT_FOLDER_NAME = "Пациенты"`; `CLIENT_FILES_ROOT_FOLDER_NAME_LEGACY = "Файлы клиентов"` defined and consumed in repo. |
| 2. ФИО helper correctness | PASS | Фамилия Имя Отчество order; null/empty filtered, per-part trim, "Клиент" fallback, 180-char cap. |
| 3. resolvePatientDisplayName | PASS | Now SELECTs `patronymic`; calls helper with `(lastName, firstName, patronymic)` — correct order. |
| 4. Backward-compat / singleton root | PASS (with caveat) | Promote searches both names via `nameNormalized IN (...)`. Theoretical multi-match edge case noted — pre-existing, not regressed. |
| 5. No new raw SQL injection | PASS | `sql` template uses hardcoded `.toLowerCase()` constants only; no user input. |
| 6. Test adequacy | PASS | 8 new FIO/root tests cover order, null patronymic, all-null, empty-string, trim, 180-cap, root-name sanity. Minor gaps (non-blocking). |
| 7. Scope | PASS | Exactly 3 files changed; no unrelated edits. |

## Detail

### Check 1 — Root name correctness — PASS
`clientFilesFolders.ts:3` — `export const CLIENT_FILES_ROOT_FOLDER_NAME = "Пациенты";`
`clientFilesFolders.ts:6` — `export const CLIENT_FILES_ROOT_FOLDER_NAME_LEGACY = "Файлы клиентов";`
Legacy constant is imported and used in `pgClientMediaFolders.ts:6,49`. New root inserts use the new name (`pgClientMediaFolders.ts:75`).

### Check 2 — ФИО helper correctness — PASS
`clientFilesFolders.ts:30-39`.
- Order: array literal `[lastName, firstName, patronymic]` → joined with `" "` → Фамилия Имя Отчество. Correct.
- Null/empty filtering: `.filter((p): p is string => Boolean(p?.trim()))` drops null, undefined, `""`, and whitespace-only parts (verified by test at test.ts:65-67).
- Per-part trim: `.map((p) => p.trim())` — internal whitespace preserved, leading/trailing stripped (test.ts:69-71).
- Non-empty fallback: `const base = full || "Клиент";` returns "Клиент" when all parts filtered out.
- 180-char cap: `base.length <= 180 ? base : base.slice(0, 180)` — matches DB check `char_length(name) <= 180` (schema.ts:1865). Note: `slice(180)` cuts at JS UTF-16 code-unit boundary, which for BMP Cyrillic equals `char_length`; consistent with the existing `clientPatientFolderBaseName` (line 23). No regression.

### Check 3 — resolvePatientDisplayName — PASS
`pgClientMediaFolders.ts:84-100`.
- SELECT now includes `patronymic: platformUsers.patronymic` (line 90). Column exists at `schema.ts:83` (`patronymic: text("patronymic")`, nullable).
- Calls `clientPatientFolderFioName(row.lastName, row.firstName, row.patronymic)` (line 97) — argument order matches the helper signature `(lastName, firstName, patronymic)`. Correct.
- Behavioral improvement over the old code: the prior version emitted `[firstName, lastName]` (Имя Фамилия — *wrong* order); now Фамилия Имя Отчество. The `fio !== "Клиент"` guard then falls back to `displayName` and finally "Клиент" — preserves the previous fallback chain.

### Check 4 — Backward-compat / singleton root — PASS (with caveat)
`pgClientMediaFolders.ts:32-52` (`promoteLegacyClientFilesRootFolder`) and `:54-82` (`pgEnsureClientFilesRootFolder`).
- Guard `if (hasRoot) return;` (line 38) short-circuits when a `client_files_root` already exists.
- Promote WHERE matches `parent_id IS NULL AND kind='standard' AND nameNormalized IN ("пациенты", "файлы клиентов")` (lines 47-49). An existing prod root named «Файлы клиентов» IS found and promoted, avoiding a duplicate-insert that would violate `uq_media_folders_client_files_root` (schema.ts:1848). This is the core correctness goal of the stage and it holds.
- `nameNormalized` is the generated column `lower(TRIM(BOTH FROM name))` (schema.ts:1837); comparing against `.toLowerCase()` constants is correct (the constants have no surrounding whitespace).
- Flow safety: ensure() re-reads after promote (lines 65-70) before falling through to insert, so a promoted legacy root is returned rather than duplicated.

Caveat (non-blocking, NOT a regression): the promote UPDATE has no `LIMIT 1`. If a deployment somehow had BOTH a standard «Пациенты» AND a standard «Файлы клиентов» at root simultaneously, the `IN` set-update would attempt to promote both rows in one statement → `uq_media_folders_client_files_root` violation, surfacing as an unhandled error from `pgEnsureClientFilesRootFolder`. In practice this state is not reachable through normal app flow (the app only ever creates «Пациенты» as `client_files_root`, never as `standard`; the legacy «Файлы клиентов» is the only standard candidate). The single-name predecessor had the same unbounded-UPDATE shape, so this is pre-existing surface, not introduced here. Optional hardening: add `LIMIT 1` semantics (e.g. promote by id from a sub-select) — defer to Stage 2 / migration.

### Check 5 — No new raw SQL injection — PASS
`pgClientMediaFolders.ts:49` — the only new `sql` template interpolates `CLIENT_FILES_ROOT_FOLDER_NAME.toLowerCase()` and `CLIENT_FILES_ROOT_FOLDER_NAME_LEGACY.toLowerCase()`, both module-level string constants (no user input). Drizzle parameterises interpolated values, so even these constants bind as parameters, not concatenation. The previous `eq()` form was marginally more idiomatic, but a two-value match legitimately needs `IN`; the `sql` template is the reasonable choice here. Acceptable.

### Check 6 — Test adequacy — PASS
`clientFilesFolders.test.ts` adds a `clientPatientFolderFioName` describe block (lines 48-78) plus the root-name assertion (lines 34-36):
1. ФИО order (49-51), 2. missing patronymic (53-55), 3. missing first+patronymic (57-59), 4. all-null → Клиент (61-63), 5. all empty-string/whitespace → Клиент (65-67), 6. per-part trim (69-71), 7. 180-char cap (73-77), 8. root name «Пациенты» (34-36). Meets the 8-test bar; all the checklist-required cases are present.

Minor gaps (non-blocking, suggest for follow-up):
- No assertion that the 180-cap result is `"А".repeat(180)` exactly — only `length <= 180`. A trivially-passing implementation returning `""` would also pass; tightening to `toBe("А".repeat(180))` would be stronger.
- No test for "Фамилия only with null first but present patronymic" (`("Иванов", null, "Иванович")` → should be "Иванов Иванович") to lock the gap-collapsing behavior.
- `resolvePatientDisplayName` order fix is not unit-tested (it's DB-bound); the helper test covers the ordering logic transitively, acceptable for this layer.

### Check 7 — Scope — PASS
`git diff --stat 42067e7d e3bc418c` reports exactly the 3 expected files:
- `apps/webapp/src/infra/repos/pgClientMediaFolders.ts` (+12/-… )
- `apps/webapp/src/modules/media/clientFilesFolders.ts`
- `apps/webapp/src/modules/media/clientFilesFolders.test.ts`
No unrelated edits, no stray files.

## Verdict: PASS

All seven checks pass. The rename, legacy constant, ФИО helper (correct Фамилия Имя Отчество order, null-safe, trimmed, 180-capped), the `resolvePatientDisplayName` patronymic SELECT + correct-order call, and the dual-name (new + legacy) promote that protects the singleton-root unique constraint are all correct. Raw SQL is parameter-safe with hardcoded constants. Tests cover the required cases. Scope is exactly 3 files.

Non-blocking suggestions for a later stage: (a) bound the promote UPDATE to a single row to be fully robust against a hypothetical dual-standard-root state; (b) tighten the 180-cap test to an exact value and add a first-name-gap ФИО case.
