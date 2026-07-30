Implemented and committed step 4.0: `4d299dc4f feat(entitlements): register tariff mechanics #1069`. No push, migrations, route guards, or UI changes.

- Registry: [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:71)
  - `запас`: `patient_count` — «Пациенты»; `branches` — «Филиалы».
  - `возможность`: `external_calendar`, `patient_diaries`, `clinical_tests`, `online_intake`, `doctor_statistics`, `proactive_insights`, `specialist_tasks`, `booking_prepayment`.
  - Default-off owner capabilities: `patient_home_today` («Сегодня»), `warmups`, `promo`; default rule at [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:119).

- Protected-action inventory: branch creation plus clinical tests, online intake, specialist tasks, prepayment policy, and promo write paths at [protectedActionRegistry.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-[redacted-token].ts:489) and [protectedActionRegistry.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-[redacted-token].ts:539).

- Tests: [service.test.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.test.ts:215) proves missing patient/branch limits resolve disabled, never unlimited. This follows the existing resolver at [service.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:162). [service.test.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.test.ts:228) proves the three owner mechanics are off normally and enabled by organization overrides.

Checks passed:

- `pnpm --filter webapp typecheck`
- `pnpm --filter webapp lint`
- `pnpm --filter webapp test -- src/modules/org-entitlements/service.test.ts` — 117 passed

Not determinable protected-action rows, recorded explicitly in `DECLARED_NO_SURFACE`:

- Patient creation/reactivation: current write handler was not identified.
- External calendar: no provider write path exists.
- Patient diaries: writes cross webapp/integrator.
- Today: configuration is mixed with CMS actions, so no safe single handler.
- Warmups: no clinic-facing write path.
- Statistics and proactive insights are read-only surfaces.

The standalone entitlement coverage checker still reports an existing unrelated bypass in `src/modules/org-branding/service.ts`; this commit does not touch it.