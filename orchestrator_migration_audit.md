# Orchestrator Migration Audit (STEP 1–5)

Date: 2026-03-06  
Branch: `ARCHITECTURE-V3-REAL-CLEAN`

## Scope
Audit verifies completion of staged migration from route-driven orchestration to business-script matching:
1. Optional `route.scriptId` contract support
2. Route-script fallback removal
3. Routes optional in resolver path
4. Formalized script matcher contract
5. Full routes-path removal + route artifacts cleanup

## Result
Status: **PASS**

The runtime selection path now depends on source scripts + business matcher only. Route-based selection is removed from kernel runtime and content loading.

---

## Evidence

### 1) Resolver is script-matcher only
- `buildPlan` selects script via `resolveBusinessScript(...)` and does not read routes.
- `resolveBusinessScript(...)` uses `contentPort.getScriptsBySource(source)`.
- Matching is performed by `scriptMatches(...)` + `matchesScriptPattern(...)`.

File: `src/kernel/orchestrator/resolver.ts`

### 2) ContentPort no longer exposes routes accessor
- `ContentPort` contains:
  - `getScript(...)`
  - `getScriptsBySource?(...)`
  - `getTemplate(...)`
- `getRoutes(...)` is absent.

File: `src/kernel/contracts/ports.ts`

### 3) Content registry no longer loads/validates routes
- Bundle shape is `{ scripts, templates }` only.
- No route schema, no routes file parsing, no route linkage validator.

File: `src/kernel/contentRegistry/index.ts`

### 4) Route artifacts removed from content
- No `src/content/**/routes.json` files remain.

Repository search result: none.

### 5) Tests updated and green
- Orchestrator and content-registry tests now validate script-only path.
- Full suite passes after migration.

---

## Recent migration commits (trace)
- `f135b69` refactor(orchestrator): remove routes path and artifacts
- `defd8f3` refactor(orchestrator): formalize script matcher contract
- `554428d` refactor(orchestrator): make routes optional in resolver path
- `2a450b8` refactor(orchestrator): remove route script fallback in resolver
- `f57c1ba` refactor(orchestrator): make route scriptId optional in runtime contracts

---

## Residual technical note
- `getScript(...)` remains in `ContentPort` and adapter as a legacy accessor, but is not used by resolver runtime selection.
- This is acceptable for backward compatibility; can be removed in a future cleanup step if no external dependency requires it.

## Conclusion
Migration objective is achieved: orchestration runtime is now business-script driven, with route mechanism removed from runtime path and content artifacts.