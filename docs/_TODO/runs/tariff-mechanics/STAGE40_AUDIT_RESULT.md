VERDICT: PASS

1. Exactly 13 required additions: `patient_count`, `branches`; eight capability keys; `patient_home_today`, `warmups`, `promo` ([types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:71)). No extra newly registered key. No keys for support, video volume, course participants, treatment/LFK templates, patient messaging, or cancellation rules; canon explicitly excludes these ([design](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md:120)). Statistics plus booking attribution is one `doctor_statistics` key, not two ([types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:77)).

2. Classes and labels are correct: two `запас`, eight `возможность`, three owner capabilities as `возможность`; all have Russian `label` fields ([types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:71)). No UI file changed, so no machine key was introduced into a screen.

3. `запас` is fail-closed for an assigned tariff: `requiresExplicitNumericQuota` branches to disabled when no numeric quota exists ([service.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:162)). The test asserts both new keys are `false` for `quotas: {}` ([service.test.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.test.ts:215)).

4. Owner mechanics are default-off in `MECHANIC_DEFAULT_ENABLED` ([types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:119)); existing override precedence enables all three ([service.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:169)). The test would catch a flipped default via its explicit `false` assertions ([service.test.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.test.ts:234)). No table, screen, or migration changed.

5. Registration only: the commit modifies only the protected-action inventory, registry, target test, and plan; no domain-route file, UI file, or migration is in the diff. The registry’s `guard` values are metadata only; no guard call was added. Step 4.0 specifically authorizes these shared declarations ([plan](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a:171)).

6. Honest unknowns confirmed: `patient_count` says creation/reactivation handler is unidentified; `external_calendar` says no provider write path exists ([protectedActionRegistry.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-[redacted-token].ts:960)). Neither is silently mapped to an unrelated handler.

MUST FIX

None.

Unchecked: targeted Vitest and typecheck could not run because this sandbox mounts generated-output locations read-only (`EROFS` on Vite temp config and `tsconfig.tsbuildinfo`); `git diff --check` passed.