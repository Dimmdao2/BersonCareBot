# Plan Audit — Patient Files Library Isolation
Auditor: plan-auditor-pfi (Opus, independent)
Date: 2026-06-19

## Code-finding verification (planner citations spot-checked — all REAL)

| Planner claim | Verdict | Evidence |
|---|---|---|
| `media_folders.kind ∈ {standard, client_files_root, client_patient}` + uniqueness indexes | TRUE | `db/schema/schema.ts:1845-1848,1866`; per-patient + singleton-root unique indexes confirmed |
| `pgEnsureClientPatientFolder` exists, dedup via 23505 | TRUE | `infra/repos/pgClientMediaFolders.ts:113-158` |
| `clientFilesSubtreeFolderIdsSql` recursive CTE | TRUE | `pgClientMediaFolders.ts:161-170` |
| `excludeClientFiles` (default true) hides patient subtree in all-folders list | TRUE | `modules/media/types.ts:92`; `s3MediaStorage.ts:259`; mock at `mockMediaStorage.ts:66` |
| Root name = «Файлы клиентов» (not «Пациенты») | TRUE | `modules/media/clientFilesFolders.ts:3` |
| Fallback suffix is uuid8, NOT last4 phone | TRUE | `clientFilesFolders.ts:24-29` (`patientUserId.slice(0,8)`) |
| `resolvePatientDisplayName` = firstName+lastName, NO patronymic, NO last4 | TRUE | `pgClientMediaFolders.ts:80-94` — only selects firstName/lastName/displayName; order is firstName→lastName (NOT Фамилия Имя Отчество) |
| `platformUsers` has firstName/lastName/patronymic/phoneNormalized | TRUE | `schema.ts:52,59,60,83` (patronymic nullable) |
| Patient-side video already routes to patient folder | TRUE | `app/api/patient/media/program-submission/presign/route.ts:75,84` → `folderId: patientFolder.id` |
| `patient_files` table separate, no folderId / no media_folders link | TRUE | module `modules/patient-files/{ports,service}.ts` exists; route POST writes only `patient-files/{id}/...` S3 key, no folder ensure |
| Doctor patient-page POST does NOT create folder / write to library | TRUE | `app/api/doctor/patients/[userId]/files/route.ts:114-141` |
| Patient-subfolder rename currently BLOCKED (409 system_folder_readonly) | TRUE | `app/api/admin/media/folders/[id]/route.ts:46-47` blanket block for any system-managed kind |
| `patient_files` rename already exists (rule 6 patient-page side) | TRUE | `files/[fileId]/route.ts:99-100` `renameFile` |

**Additional finding the planner UNDER-stated (material for ST-07):** the real "move a *file* into another folder" path is `PATCH /api/admin/media/[id]` with `folderId`, gated ONLY by `pgValidateUserAssignableMediaFolder` (`media/[id]/route.ts:126-138`). That gate rejects `client_files_root` but **does NOT block moving a file OUT of a `client_patient` folder into a `standard` folder.** So the move-out hole is in `media/[id]/route.ts`, not the folders route. ST-07 names "the media file-move route" only parenthetically and points primarily at the folders route — the precise chokepoint must be `pgValidateUserAssignableMediaFolder` (the single common gate). See gap G1.

## Per-requirement coverage

| Rule | Coverage | Stage(s) | Notes |
|------|----------|----------|-------|
| Rule 1 — System «Пациенты» folder | COVERED | ST-01 | Renames root constant to «Пациенты» with legacy-promote compat. Reuses existing root infra. Gated on O1 (owner confirm rename vs UI-alias; affects prod folders named «Файлы клиентов»). |
| Rule 2 — Auto-subfolder ФИО + dedup | PARTIAL | ST-01, ST-02 | ФИО ordering (Фамилия Имя Отчество, incl. patronymic) in ST-01 and last4 dedup in ST-02 are correctly scoped. **Gap G2:** rule 2 also says "врач может переименовать подпапку" — that rename enablement is in ST-06, but ST-06 only `Depends: ST-01`, not ST-02, so this is fine ordering-wise; flag is that rule-2 coverage is split across ST-01/02/06 and the table should make the rename half explicit (it's covered, just scattered). last4 source = `phoneNormalized`; O4 owner-gate for "no phone" fallback (defaults uuid8) is open but non-blocking. |
| Rule 3 — Hidden from general library | COVERED | ST-03 | Already implemented via `excludeClientFiles`; ST-03 locks it with a regression test (mock+pg). No behaviour change needed. Solid. |
| Rule 4 — Patient uploads → patient folder only (+ no move-out) | PARTIAL | ST-04, ST-05, ST-06, ST-07 | Upload→folder (ST-04/05) and rename-allow/move-out structure (ST-06) are covered. **Move-out enforcement (ST-07) is mis-targeted (G1)** — must gate the file-move path `PATCH /api/admin/media/[id]` via `pgValidateUserAssignableMediaFolder`, the single existing chokepoint, not (only) the folders route. Also **G3: `patient_files` dual-record (O2) means a file exists in BOTH systems** — "save to own disk = allowed, move into general folders = forbidden" must be proven for the `media_files` representation specifically. |
| Rule 5 — Indiv-exercise video → patient folder | PARTIAL | ST-08 | Patient-side already works (verified). Doctor-side entry point for "video recorded with patient at appointment" is NOT FOUND in codebase (O3). ST-08 explicitly lands only the helper + a wiring point and defers the actual doctor UI/route as out-of-scope. **This is a real partial against rule 5** — owner spec treats this as an in-scope behaviour ("его видео ложится в папку"), and the DoD lists it. Acceptable ONLY if owner confirms the doctor entry point is future work (O3). Until then: PARTIAL, owner-gated. |
| Rule 6 — Rename video possible | COVERED | ST-09 (+ existing) | `patient_files.renameFile` already exists; media `displayName` rename via `media/[id]` PATCH exists and is not blocked by the folder readonly guard (guard is on folders, not files). ST-09 verifies + tests. Capability-only, matches "не обязательно, но возможность". |
| DoD-1 — upload → patient subfolder auto-created (ФИО, +last4) | PARTIAL | ST-01, ST-02, ST-04, ST-05 | Folder auto-create + naming covered; depends on ST-04 dual-record wiring landing correctly. Gated by O1/O2. |
| DoD-2 — general library excludes patient files | COVERED | ST-03 | Existing `excludeClientFiles`; regression test added. |
| DoD-3 — subfolder rename/structure inside; no move-out | PARTIAL | ST-06, ST-07 | Rename + intra-subtree structure: covered (ST-06). No-move-out: mis-targeted (G1) — needs the precise file-move gate. |
| DoD-4 — indiv-exercise video → patient folder | PARTIAL | ST-08 | Same as Rule 5 — doctor-side entry point unknown (O3); only helper+wiring landed. |
| DoD-5 — tests: visibility / upload route / dedup / no-move | PARTIAL | ST-03, ST-04, ST-06, ST-07, ST-08, ST-10 | Four of five test areas mapped. **No-move test (DoD-5 #4) inherits G1** — must assert move via `PATCH media/[id]` folderId from patient folder → standard folder is REJECTED (the actual attack path), not only a folders-reparent test. ST-10 consolidates. |

## Open questions

### Planner's (carried forward — all legitimate, owner-gated)
- **O1 — System folder name.** Rename root «Файлы клиентов» → «Паци…cyrillic… Пациенты» vs keep internal name + UI alias. Default = rename with promote compat. Owner must confirm impact on already-created prod folders. **Blocking for ST-01 final behaviour.**
- **O2 — Storage unification.** Dual-record (`patient_files.media_file_id` link) vs full migration of `patient_files` into `media_files`. Default = dual-record. Owner confirm. **Blocking for ST-04 design.**
- **O3 — Doctor individual-exercise entry point.** No existing doctor route writes indiv-exercise video to the patient folder. Default = land helper + wiring, defer UI. **Blocking whether rule 5 / DoD-4 are truly closable in this initiative.**
- **O4 — Dedup "no phone" fallback.** last4 unavailable → uuid8. Owner confirm. Non-blocking.
- **Micro-question (already defaulted):** last4 only on ФИО collision, never full number. Accepted.

### New (auditor-raised)
- **G1 (must-fix, scope correction not new scope) — move-out chokepoint.** ST-07's file list points primarily at the folders route; the real file-move-out path is `PATCH /api/admin/media/[id]` (`folderId`) gated by `pgValidateUserAssignableMediaFolder`. That single gate is the §"single chokepoint" place — extend it to reject moving a file currently inside the client subtree to a non-client target. ST-07 must name this file + gate explicitly, and DoD-5 #4 test must exercise it. Currently the plan could "pass" by only adding a folders-reparent test while the file-move hole stays open.
- **G2 — Rule-2 rename coverage is split** across ST-01/ST-02 (naming) and ST-06 (rename enablement). Coverage is complete but the roadmap table doesn't make the rename half of rule 2 visible under ST-01/02. Cosmetic; verify executor wires ST-06 to cover "врач может переименовать подпапку".
- **G3 — Dual-record consistency (O2 consequence).** With dual-record, the same file is a `patient_files` row AND a `media_files` row. The owner's "нельзя перекидывать в общие папки" applies to the `media_files` representation; ensure (a) deletion/rename stays consistent across both, and (b) there is exactly one folder-bearing representation so move-out enforcement (G1) actually governs the visible file. Add an explicit consistency note/test, else the isolation can be bypassed via whichever system isn't gated.
- **G4 — Rule 5 closure risk.** If O3 resolves to "doctor entry point is future work," then rule 5 / DoD-4 are NOT fully closed by this initiative — only the routing helper is. The roadmap's "Out of scope" already states this, but it means the initiative cannot claim full owner-DoD completion without owner sign-off that DoD-4 is deferred. This is a scope reduction vs the verbatim spec and must be surfaced to the owner (escalation), not silently accepted.

## Verdict: REVISION-NEEDED

Reasons:
1. **G1 (move-out chokepoint mis-targeted).** The plan's no-move-out enforcement (ST-07) and its DoD-5 #4 test point at the wrong route. The actual file-move-out path (`PATCH /api/admin/media/[id]` via `pgValidateUserAssignableMediaFolder`) must be named and gated, or rule 4 / DoD-3 / DoD-5 remain provably open. Fix = correct ST-07 file list + gate + test target.
2. **G4 (rule 5 / DoD-4 scope reduction).** Doctor-side indiv-exercise video routing is deferred to a helper+stub because no entry point exists (O3). Owner spec treats this as in-scope behaviour. This must be escalated for explicit owner deferral — the initiative cannot self-declare DoD-4 done.
3. **O1 + O2 are blocking design decisions** (folder rename in prod; dual-record vs migrate) that change ST-01/ST-04 behaviour; the plan defaults are reasonable but require owner confirmation before execution.
4. **G3 (dual-record consistency)** needs an explicit stage/test, else isolation is bypassable via the un-gated representation.

Everything else (rules 1, 3, 6; DoD-2; the reuse-not-rebuild posture) is solidly covered and the code findings are all real. Convert to OK once ST-07 is re-targeted to the file-move gate, G3 gets a consistency test, and O1/O2/O3/G4 are owner-confirmed (with G4 escalated).
