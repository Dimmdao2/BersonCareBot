# C3M workspace foundation audit — candidate `d4446a453`

Authority: `IMPLEMENTATION_ROADMAP.md` C3M.1, C3M.3, C3M.4 and C3M.7 items C3M-01/C3M-03 only.

## Blind kill-set (recorded before production code and existing tests were inspected)

### View / inspection

- V01 — The foundation has exactly one typed, closed workspace-module registry containing only `medical_record`, `encounters`, `rehabilitation`, `direct_chat`, `program_comments`, `program_media`, `mailings`, `analytics`, and `client_portal`.
- V02 — One dependency graph encodes: `rehabilitation` is parent of comments/media; `program_comments` requires `rehabilitation` and `client_portal`; `program_media` requires `program_comments` and therefore transitively `rehabilitation`/`client_portal`; `direct_chat` requires `client_portal`; `medical_record` and `encounters` are independent.
- V03 — Structured workspace settings are owned by the existing system-settings registry and `createSystemSettingsService`; there is no sibling settings resolver/read path or parallel access system.
- V04 — The candidate adds no tariff/billing/preset/terminology/booking/Today/tasks/UI/schema/new-table work and does not claim or implement C3M-03 shell/route wiring beyond the foundation guard contract.

### Behavior

- B01 — Missing workspace preference preserves every module that upstream availability already makes available; fault: absence incorrectly disables an available module.
- B02 — Workspace preference can only narrow upstream availability; fault: a stored `true` makes an upstream-unavailable module effective-ON.
- B03 — An effective-OFF dependency makes descendants effective-OFF, including transitive descendants, while stored child preferences remain unchanged; faults: ignore direct/transitive dependency or rewrite a child preference.
- B04 — Malformed payloads, unknown versions, unknown keys, and non-boolean module values fail closed; faults: accept each invalid class as a usable enabled preference.
- B05 — A valid partial older value retains its explicit keys while newly added/missing registry keys remain visible by compatibility default; fault: a missing new key disappears or becomes OFF.
- B06 — Disabled page and mutation decisions expose stable, typed outcomes; fault: page/mutation denials collapse to ad-hoc or interchangeable values.

## Results

- V01 → PASS → `doctorWorkspaceComposition.ts:9-21` derives the key union from the sole closed registry: `medical_record`, `encounters`, `rehabilitation`, `direct_chat`, `program_comments`, `program_media`, `mailings`, `analytics`, `client_portal`.
- V02 → PASS → `doctorWorkspaceComposition.ts:35-47` is one typed `Record<WorkspaceModuleKey, ...>` graph with the exact direct edges; recursive resolution at lines 133-147 supplies the required transitive edges and leaves medical record/encounters independent.
- V03 → PASS → `rg -n "export const SYSTEM_SETTING_REGISTRY" apps/webapp/src` returned only `registry.ts:148`; the new key is there at `registry.ts:198-204`, and `service.ts:254-289` reads it through `getSettingFromCanonicalRoot`. Code-search queries for workspace composition/settings resolution followed by exact `rg` over `apps/webapp/src`, `apps/webapp/db`, and active docs found no sibling production reader/resolver/access path.
- V04 → PASS → `git show --name-status --format=fuller d4446a453` returned only the five brief-owned files. No UI/schema/table/tariff/billing/preset/terminology/booking/Today/tasks work exists in the candidate; `IMPLEMENTATION_ROADMAP.md:755-762` keeps C3M-01/C3M-03 open, and no real route/shell consumes the guard. `git diff --exit-code d4446a453 HEAD -- <the five product paths>` exited 0, proving the later roadmap-only merge did not alter audited product state.
- B01 → PASS → unmodified assertion passed; changing the missing-row default from `true` to `false` made `keeps every already-available module visible...` fail at test line 57.
- B02 → PASS → unmodified assertion passed; removing `availability[key]` from the resolver made `never broadens upstream module availability` fail at line 66.
- B03 → PASS → unmodified assertions passed for rehabilitation, comments, portal, transitive media and independent record/encounter states; replacing dependency resolution with `true` made `turns direct and transitive descendants...` fail at line 76. The frozen child-preference input remained unchanged on the unmodified implementation.
- B04 → FAIL → unknown version/key/non-boolean inputs reject correctly (removing the version check made line 109 red), but a present row whose `valueJson` is JSON `null` resolves to the all-enabled absence default. The retained acceptance assertion fails at line 124 on the unmodified candidate.
- B05 → PASS → unmodified partial value preserved explicit `medical_record=false` and filled missing keys `true`; changing the missing-key default to `false` made line 132 red.
- B06 → PASS → unmodified mutation returned typed `workspace_module_disabled` + module at HTTP 403 and disabled page threw the 404 Next outcome; changing the response status to 200 made line 141 red.
- C3M-01 → PASS → the closed typed registry, dependency/default contract, and disabled page/mutation outcomes match the frozen C3M-01 authority.
- C3M-03 → FAIL → canonical setting reader/parser/resolver/guard foundation exists and real shell/route wiring is correctly absent, but the malformed stored-row path fails open.

## Finding

`service.ts:289` passes `row?.valueJson ?? null`, so both “no row” and “row exists with JSON null” become the same input. `parseDoctorWorkspaceComposition` at lines 106-109 treats that input as absence and returns every preference enabled. Reachable scenario: the sanctioned `SystemSettingsPort` stores a malformed `doctor_workspace_composition` value for an organization; the next canonical read silently widens every upstream-available module instead of returning `RuntimeSettingUnavailableError`. Impact: later C3M consumers can expose and permit functions the stored preference cannot safely authorize. This violates the brief's explicit malformed-value fail-closed behavior and C3M-03 parser foundation.

## Fault injection and checks

Each temporary production mutation was applied alone, tested, and reverted. Each command below produced `1 failed, 6 skipped` with the named assertion red:

- B01: `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts --project unit -t "keeps every already-available module visible"` → line 57.
- B02: `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts --project unit -t "never broadens upstream module availability"` → line 66.
- B03: `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts --project unit -t "turns direct and transitive descendants"` → line 76.
- B04: `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts --project unit -t "rejects unknown versions"` → line 109.
- B05: `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts --project unit -t "keeps explicit old values"` → line 132.
- B06: `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts --project unit -t "stable typed denial outcomes"` → line 141.

Named behavior fault classes caught: **6**. Uncaught by the retained test contract: **0**. Existing candidate failures exposed: **1** (B04 malformed stored row).

Unmodified candidate command:

`pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts --project unit` → **FAIL**, `6 passed, 1 failed`; `fails closed when a stored preference row has a malformed value` resolved to the all-enabled default instead of rejecting.

Reverted-production green subset command:

`pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts --project unit -t "keeps every already-available|never broadens|turns direct and transitive|rejects unknown versions|keeps explicit old values|stable typed denial outcomes"` → **PASS**, `6 passed, 1 skipped`.

Additional fresh checks after all temporary mutations were reverted:

- `pnpm --dir apps/webapp typecheck` → PASS.
- `pnpm --dir apps/webapp exec eslint src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts` → PASS.
- `git diff --check` → PASS.
- `git diff --exit-code HEAD -- apps/webapp/src/modules/system-settings/doctorWorkspaceComposition.ts apps/webapp/src/modules/system-settings/registry.ts apps/webapp/src/modules/system-settings/service.ts apps/webapp/src/app-layer/guards/workspaceModuleAccess.ts apps/webapp/src/app-layer/guards/guards.md` → PASS; no temporary product mutation remains.
- Full CI was not run: the audited change is local to webapp foundation behavior and the brief forbids unjustified full CI.

## Verdict

**FAIL** for candidate `d4446a45368d90e1817954c0c2e6d41ee1251b46`. Handoff: fix B04 in product code, then run the retained targeted test to green; no new blind audit is required unless the fix creates a materially new surface.
