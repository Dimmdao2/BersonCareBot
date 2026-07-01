# Code Audit 1 — PFI-ST-01

**Branch:** `auto/pfi-st-01`
**Commit:** `e3bc418c` — feat(PFI-ST-01): rename system folder to «Пациенты» + ФИО subfolder naming
**Auditor:** Claude Sonnet 4.6
**Date:** 2026-06-19

---

## Findings

**P1 — PASS** — `CLIENT_FILES_ROOT_FOLDER_NAME` = «Пациенты»; `CLIENT_FILES_ROOT_FOLDER_NAME_LEGACY` = «Файлы клиентов» is exported for matching only; new folder creation at line 75 uses only `CLIENT_FILES_ROOT_FOLDER_NAME`.

**P2 — PASS** — `promoteLegacyClientFilesRootFolder` matches both `пациенты` and `файлы клиентов` via `nameNormalized IN (...)`. Drizzle ORM `sql` template interpolation (`${}`) binds values as SQL parameters (not raw string concatenation), so no injection risk.

**P3 — PASS** — `clientPatientFolderFioName` filters parts with `Boolean(p?.trim())`, maps each through `.trim()`, joins in lastName/firstName/patronymic order, falls back to «Клиент» when all parts are null/empty, and caps at 180 chars via `slice(0, 180)`.

**P4 — PASS** — `resolvePatientDisplayName` selects `patronymic: platformUsers.patronymic` (column confirmed in `db/schema/schema.ts:83`). Calls `clientPatientFolderFioName(row.lastName, row.firstName, row.patronymic)` in correct ФИО order; falls back to `row.displayName` if FIO resolves to «Клиент».

**P5 — PASS** — No duplicate root possible. `pgEnsureClientFilesRootFolder` first checks for an existing `client_files_root` kind row; only if absent does it call `promoteLegacyClientFilesRootFolder`, which matches the legacy «Файлы клиентов» root by `nameNormalized` and promotes it. Only if promotion also finds nothing does it insert a new folder named «Пациенты». A prod DB with an existing «Файлы клиентов» root folder will be promoted cleanly on first call.

**P6 — PASS** — All callers of `CLIENT_FILES_ROOT_FOLDER_NAME` use the exported constant (3 usages: `clientFilesFolders.ts` definition, `pgClientMediaFolders.ts` insert, `MediaLibraryFolderScopeSelect.tsx` display). One UI comment in `DoctorProgramDiscussionMessagesPanel.tsx` contains the legacy string in user-facing copy — this is cosmetic user text, not a folder-creation path, and is not broken by the rename. No caller hardcodes «Файлы клиентов» for folder creation.

**P7 — PASS** — 12 tests total (4 pre-existing + 8 new). New tests cover: ФИО order, missing patronymic, missing firstName+patronymic, all-null, all-empty-strings, trim whitespace, 180-char cap, and root folder name assertion. All 32 tests in the file pass (`vitest run` confirmed exit 0).

**P8 — PASS** — `tsc --noEmit --project apps/webapp/tsconfig.json` exits 0 with no errors.

---

## Overall: PASS — All 8 clauses pass; rename is safe, legacy promote prevents duplicates, FIO helper is correct and well-tested.
