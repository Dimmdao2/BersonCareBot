Committed implementation: `a678edc7e` (`#1069`). No push/merge. Temporary migration number: `0275` (lead must replace at merge).

Checks passed: entitlement tests (2/2), webapp typecheck, webapp lint + Drizzle journal check. Numeric-class arbiter and test mutation proofs both went red as required.

No plan checkbox was marked `[x]`: DEV runtime proof is blocked by `migrate-dev.sh --preflight` path guard in this linked worktree.

1.1 — “class field on every mechanic…” → implemented: [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:11); test/typecheck pass; runtime deferred by DEV guard.

1.2 — “type system forbids the impossible…” → implemented: [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:80), [commercial route](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:12); adding `limit: 3` to `courses` caused TS2353; runtime deferred.

1.3 — “resolver and usage projections read the class…” → implemented: [service.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:138); mutation-proven service test; runtime deferred.

1.4 — “webapp typecheck green + arbiter…” → complete static evidence; runtime N/A.

2.1 — “move to возможность and strip fake units…” → implemented in [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:45) and [constructor](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx); tested/typechecked; DEV UI proof deferred.

2.2 — “migration drops … courses trigger…” → implemented: [0275 migration](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0275_tariff_mechanics_stage12_local.sql:4); live create/refusal probes deferred by DEV guard.

2.3 — “migration drops the 0270 CMS page-count trigger…” → implemented: [0275 migration](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0275_tariff_mechanics_stage12_local.sql:8); runtime proof deferred.

2.4 — “with CMS off … pages/widgets keep working…” → read gates no longer hide existing content: [requireEntitlement.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-layer/guards/requireEntitlement.ts:20); DEV proof deferred.

2.5 — “patient_card and patient_app become class никогда…” → implemented: [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:52), constructor excludes them; service test covers historical numeric projection; DEV UI proof deferred.

2.6 — “files … объём, bytes only…” → implemented: [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:80), [constructor](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx); tests/typecheck pass; runtime deferred.

2.7 — “notification templates … gated by branding…” → existing mutation guard retained and read gate removed: [route.ts](/home/dev/dev-projects/bcb-wt-[redacted-token]-templates/route.ts:55); typecheck/lint pass; runtime deferred.

2.8 — “bulk mailings only over clinic’s own channels…” → blocked. #1071 currently only establishes platform integration availability and unfinished clinic calendar credentials; there is no clinic-owned SMTP/bot/SMS channel model to use. I did not invent it or alter the broadcasting system.

2.9 — “material ratings switched off platform-wide as a setting…” → implemented global setting default-off plus write refusal: [registry.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/system-settings/registry.ts:68), [patient route](/home/dev/dev-projects/bcb-wt-[redacted-token]-ratings/route.ts:81); typecheck/lint pass; runtime deferred.

2.10 — “constructor opens … demo clinics A/B…” → blocked pending DEV preflight/runtime access.

Question: may I run the DEV migration/runtime probes from the canonical worktree (or receive an approved path-guard exception), and should #1071 supply the clinic-owned mailing-channel model before 2.8 proceeds?