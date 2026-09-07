# C3M workspace foundation — independent audit brief

## Role and authority

You are the first independent `auditor-live` for candidate commit `d4446a453` on branch
`wt/c3m-workspace-foundation-20260907` in taskdb `#1098`.

Read before any inspection or command:

- `AGENTS.md`, especially §5, §10, §10a, §10b and §24 in full;
- `docs/ORCHESTRATION_BINDINGS.md`;
- `docs/ORCHESTRATOR_CHECKLIST.md`;
- `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M.1, C3M.3, C3M.4 and C3M.7 items C3M-01/C3M-03.

Owner/plan authority for this pass is exactly C3M-01/C3M-03. Do not add product scope.

## First action: «тест или взгляд»

Before reading any existing tests, write a blind kill-set from the authority into an audit artifact in the
candidate worktree. Classify each item separately:

- **view/inspection:** there is one typed closed registry, one dependency graph, one sanctioned settings root,
  no tariff/billing/preset/UI/schema/new-table work, and no sibling resolver/read path;
- **behavior:** missing preference preserves all already-available modules; a workspace preference never broadens
  upstream availability; a disabled/unavailable parent makes descendants effective-OFF without rewriting stored
  child preferences; malformed/unknown-version/unknown-key/non-boolean stored values fail closed; partial valid old
  values keep newly added module keys visible; disabled page and mutation outcomes are stable and typed.

Only after the blind kill-set is recorded may you inspect production code and existing tests.

## Scope to audit

Inspect the complete candidate diff and final state, not only the commit message:

- `apps/webapp/src/modules/system-settings/doctorWorkspaceComposition.ts`
- `apps/webapp/src/modules/system-settings/registry.ts`
- `apps/webapp/src/modules/system-settings/service.ts`
- `apps/webapp/src/app-layer/guards/workspaceModuleAccess.ts`
- `apps/webapp/src/app-layer/guards/guards.md`

Check specifically that the dependency semantics match C3M.4:

- `rehabilitation` is parent of comments/media;
- `program_comments` requires rehabilitation and client portal;
- `program_media` requires program comments and therefore transitively rehabilitation/client portal;
- `direct_chat` requires client portal;
- medical record and encounters remain independent;
- booking, Today, tasks, tariffs, presets and terminology are not introduced into this foundation.

Check §5's one-common-path rule: the existing `createSystemSettingsService`/registry must be parameterized, not
shadowed by a parallel settings reader or access system. Check that C3M-03 is not falsely treated as complete:
no real shell/route wiring belongs to this candidate.

## Tests and fault injection

Apply AGENTS.md §10a/§10b strictly. Do not write tests for source text, filenames, imports, formatting, UI labels,
checkboxes, DOM shape or SQL text. This stage contains no UI behavior to test.

Prefer construction and the cheapest public unit layer. Add a permanent behavior test only for a named expensive
and silent failure that is not already protected. For each retained/new behavior test, perform one targeted
production fault injection per independent kill-set class and record exactly which assertion went red. Revert every
temporary production mutation.

If a missing acceptance test is red on the unmodified candidate, keep the test and report a handoff; do not repair
product code. If a finding is inspection-only, report the reachable scenario, impact, evidence and exact violated
authority/repo rule. Style, alternate architecture and speculative hardening are not findings.

Run only fresh targeted checks justified by this local/app scope. Reuse worker evidence when it is on the audited
SHA; do not run full CI.

## Output and commit

Create one concise audit artifact under `runs/` containing:

- the blind kill-set written before test inspection;
- one `ID → PASS|FAIL|BLOCKED → evidence` line per in-scope item;
- fault injection mapping and exact command/result for any tests;
- count of named faults caught and uncaught;
- final binary verdict for candidate `d4446a453`.

You may commit only the audit artifact and any justified acceptance tests. Never commit temporary product
mutations or product fixes. Stage explicit paths only; do not use `git add -A`. Commit before ending the turn and
report the commit SHA plus the candidate SHA. Do not push. Run long commands in the foreground and wait for them.
