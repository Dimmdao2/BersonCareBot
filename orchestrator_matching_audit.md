# Current Selection Flow

1. The orchestrator entrypoint in `src/kernel/orchestrator/index.ts` delegates everything to `buildPlan()` in `src/kernel/orchestrator/resolver.ts`.
2. `buildPlan()` calls `resolveScriptId()`.
3. `resolveScriptId()` asks the content port for routes by source scope via `getRoutes(scope)`.
4. Route matching is done only by `source`, `eventType`, and optional `meta` fields.
5. The highest-priority matching route wins.
6. That route returns exactly one `scriptId`.
7. The resolver loads exactly that one script via `contentPort.getScript(scriptId)`.
8. Script-level `conditions` are used only for `context.query` execution.
9. Step-level `_when` is evaluated per step after the script is already chosen.
10. The final plan is built from the chosen script's surviving steps.

# Current Limits

- Final script choice is route-driven and single-target.
- Routes can only match `source`, `eventType`, and optional `meta`.
- Resolver does not evaluate `script.match` at all.
- `script.conditions` are not business-match conditions; they are only query declarations.
- `_when` exists only at step-param level, not at script-selection level.
- `ContentPort` can fetch one script by id, but cannot list candidate scripts for a scope.
- `contentRegistry` validates that each route target exists, which reinforces exact route-to-script coupling.
- Current `OrchestratorInput` contains only `event` and base `context`; enriched business facts are not modeled there yet.

# Can Current Script Schema Support Business Matching?

PARTIAL

Explanation:

- `ContentScript` already has a `match?: Record<string, unknown>` field in `src/kernel/contracts/orchestrator.ts`.
- `contentRegistry` already accepts and preserves that `match` field from JSON.
- `contentPort` already returns `match` unchanged.
- So the JSON/container shape is flexible enough to store business-level matching data.

But:

- there is no typed matcher schema for script-level business conditions,
- resolver ignores `script.match`,
- current reusable predicate logic (`evaluateWhen()`) is wired only to step `_when`,
- and current orchestrator input/context shape is too thin for full normalized + enriched business matching.

So the storage format is close enough, but the selection pipeline is not implemented.

# Best Place To Implement Business Scenario Matching

Primary implementation point:

- `src/kernel/orchestrator/resolver.ts`

Why:

- this is where route filtering already happens,
- this is where the final script is currently chosen,
- this is where context queries are already executed,
- and this is where step `_when` evaluation already exists and can be generalized into script-level candidate matching.

Supporting boundary points:

- `src/kernel/contracts/orchestrator.ts` — to formalize business-match shape on scripts and possibly enrich orchestrator input/context contract
- `src/kernel/contracts/ports.ts` — to allow listing candidate scripts for a source/namespace if needed
- `src/infra/adapters/contentPort.ts` — to implement candidate-script access through the existing content port abstraction
- `src/kernel/contentRegistry/index.ts` — to validate any stronger script-level matcher shape, if the matcher is formalized

# Minimal Clean Change Set

1. `src/kernel/orchestrator/resolver.ts`
   - keep routes as source/event prefilter only
   - after route prefilter, load candidate scripts for the source/namespace
   - evaluate business script match against normalized event data + enriched context
   - choose the best matching business script
   - reuse or extract the existing predicate engine from step `_when`

2. `src/kernel/contracts/ports.ts`
   - add a content-port method for candidate script listing, such as `getScripts(scope)` or equivalent

3. `src/infra/adapters/contentPort.ts`
   - implement the new content-port method by returning all scripts from the selected bundle

4. `src/kernel/contracts/orchestrator.ts`
   - formalize script-level business matcher typing instead of plain loose records
   - expand `OrchestratorInput` / context contract only if enriched business facts are meant to arrive here explicitly

5. `src/kernel/contentRegistry/index.ts`
   - validate the formalized script matcher shape if the matcher contract is tightened

Optional but likely related if schema validation is tightened:

6. `src/kernel/contracts/schemas.ts`
   - only if you want runtime validation for the richer script-match structure in shared schemas

# Files That Must Not Be Touched

- `src/content/telegram/routes.json`
- `src/content/rubitime/routes.json`
- `src/content/telegram/templates.json`
- `src/content/rubitime/templates.json`
- integration normalization files in `src/integrations/**`
- event gateway files in `src/kernel/eventGateway/**`
- executor files in `src/kernel/domain/executor/**`
- domain event handling files outside orchestrator matching responsibility
- DB and infra persistence files in `src/infra/db/**`
- delivery/transport adapters unrelated to content-port access

# Recommended Next Step

Implement business-script candidate selection inside `src/kernel/orchestrator/resolver.ts`: keep route matching as a source/event prefilter, expose all scripts for the selected source through the content port, and add script-level matcher evaluation against normalized event fields plus enriched orchestrator context. That is the smallest clean place to move scenario selection out of routes without leaking transport details into domain concepts.
