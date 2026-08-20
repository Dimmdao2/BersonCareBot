# UI gate exhaustive merge — 2026-08-20

## Result

Merged `wt/ui-gate-exhaustive-20260816` into the current `feat/doctor-ui-rebuild` head on
`wt/uigate-merge-20260820`.  The merge commit preserves the exhaustive rendered-surface gate:
route classifications and semantic contracts, bounded same-origin traversal, canonical-navigation
proof, route-owner static contracts, rendered-control dispositions, per-page evidence provenance,
and role/tenant artifact provenance.

The two `feat` false-positive fixes are retained:

- `/app/doctor/analytics` is anchored on the platform `DoctorPageHeader` (`[data-doctor-page-header]`),
  not the removed clinical analytics shell.
- the doctor comments check matches the exact rendered patient name with only trailing status glyphs
  allowed; failure output includes the rendered comments list text.

`audit-engine.mjs` was extended only so the stricter static contract gate can verify the current
product: `data-*` anchors are checked in the owner source, and owner-owned catch-all routes include
their explicit/dynamic imports.  This keeps the owner boundary rather than falling back to a global
source scan.

## Conflicts and resolution

| File | Resolution |
| --- | --- |
| `README.md` | Kept the exhaustive-gate operating contract from the branch. |
| `gate-utils.mjs` | Combined branch fail-closed route/control/provenance logic with `feat` pagination template normalization, warning/incomplete-result failures, dynamic-pattern matching, and rendered-name matching. |
| `gate-utils.test.mjs` | Retained branch executable oracle and added coverage for pagination/pattern and rendered-name behavior. |
| `run.mjs` | Kept rendered traversal, inventory, evidence ledger, and aggregate provenance; restored the comments-row rendered identity check and diagnostic text. |
| `scenarios.mjs` | Kept explicit route classifications and changed the analytics contract to the real platform-stub header. Current patient-card contracts cover the four rendered tabs (`karta`, `program`, `files`, `account`) plus the rendered program-detail link. |

## Resolved contradictions

1. `feat` allowed an `ERR_ABORTED` `_rsc` fetch outside an active harness navigation. The branch allowed
   aborts only while the harness navigation was active. This is a real fail-open conflict; the stricter
   branch behavior remains, so an out-of-navigation abort is gate evidence.
2. The branch still named eight historic patient-card tab surfaces. The current `feat` product renders
   four tabs; `overview`, `records`, `comms`, and `finances` no longer have rendered controls or
   owner-reachable dynamic imports. Keeping eight would create a permanent false failure, not a stricter
   check. The gate now fails closed for every current rendered tab and for absence of the rendered
   program-detail href.

## Fault injection

Nine independent temporary implementation faults were injected and fully reverted.

| Fault | Catching executable test |
| --- | --- |
| generic standalone semantic text accepted | `rejects generic standalone text as a substantive route contract` |
| foreign-origin link accepted into traversal | `bounded traversal never discovers a foreign-origin doctor patient link` |
| late request charged to current page rather than owner | `late request remains with A and console without a proven origin fails globally during B` |
| global-admin tenant provenance ignored | `aggregate derives the shared tenant from doctor and patient while preserving global-admin null` |
| unclassified/duplicate rendered control accepted | `binary gate rejects an unclassified rendered mutating control` |
| route-owner source boundary replaced by global source | both route-owner static-contract tests |
| missing canonical navigation accepted | `canonical navigation is distinct from query-state seeds and a missing manifest destination is red` |
| unclassified external/cross-role rendered links accepted | `rendered links require explicit safe disposition before the binary gate accepts them` |
| missing patient-card tab/program href accepted | `current patient-card tab contracts and program href are fail-closed at runner engine boundary` |

Result: **killed 9, not caught 0**. The eight-fault batch made nine test cases red because the
owner-source-boundary fault is independently checked for a sibling route and a child-only route.

## Commands and exit codes

No command below used a pipe.

| Command | Exit |
| --- | ---: |
| `git merge wt/ui-gate-exhaustive-20260816` | 1 (expected conflict stop) |
| `node --test runs/dev-interactive-audit/gate-utils.test.mjs` (eight-fault batch) | 1 (expected; 9 test cases red) |
| `node --test --test-name-pattern="rejects generic standalone text" runs/dev-interactive-audit/gate-utils.test.mjs` | 1 (expected) |
| `node --check runs/dev-interactive-audit/gate-utils.mjs` | 0 |
| `node --check runs/dev-interactive-audit/gate-utils.test.mjs` | 0 |
| `node --check runs/dev-interactive-audit/audit-engine.mjs` | 0 |
| `node --check runs/dev-interactive-audit/run.mjs` | 0 |
| `node --check runs/dev-interactive-audit/scenarios.mjs` | 0 |
| `node --test runs/dev-interactive-audit/gate-utils.test.mjs` | 0 (33/33) |
| `node --input-type=module -e "import './runs/dev-interactive-audit/scenarios.mjs'"` | 0 |
| `node --input-type=module -e "import './runs/dev-interactive-audit/audit-engine.mjs'"` | 0 |
