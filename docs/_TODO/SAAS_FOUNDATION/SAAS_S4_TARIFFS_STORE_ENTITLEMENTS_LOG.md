# Execution log — SaaS S4 tariffs, entitlements, billing and analytics

This is the execution log required by
[`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`](./SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md) §15. Product sequencing and
owner gates remain in the canonical SaaS Product UX roadmap/review; this log records technical stage evidence only.

## 2026-07-19 — S4-0/S4-1 shared entitlement foundation launch (`#888`)

- **Base:** `feat/doctor-ui-rebuild` at pushed HEAD `d802ea52d`; current code-only TEST SHA remains `4a889093d`.
- **Why first:** C4B `#853`, C4C `#26` and C4D `#724` all require the shared registry/chokepoint. Read-only
  readiness audits found no active duplicate worker/worktree, but confirmed the current guard still performs its
  own auth and only the courses create path is partially gated.
- **Task mapping:** `#888` owns complete S4-0/S4-1. `#751` remains C5A constructor/quotas/trial; `#844/#845` own
  C5B billing. No commercial task is considered completed by this foundation stage.
- **Scope:** every checkbox in S4 §§5-6: method-level action inventory/checker, labels for the existing canonical
  mechanic keys, explicit no-surface evidence, compatibility/default-on contract, ownership/payment-provider/config/
  effective-tariff source contracts, context-taking route/action entitlement adapters, all mapped protected write
  families, auth→trusted org→entitlement→service ordering, A/B isolation, and static bypass detection/self-test.
- **Protected adjacent scope:** no tariff constructor, new quota/trial/seat policy, PSP activation, SaaS billing UI,
  schema/migration/backfill, CMS master-detail, course model/redesign, library ownership/store, navigation hiding,
  TEST/DB/deploy, main/test/PROD or real external delivery. The current 14-key compatibility registry is not expanded
  into the pending owner-review P1 candidate set in this stage.
- **Acceptance:** existing organizations keep default-on behavior until their explicit data gate; disabled override
  gives typed `403 entitlement_required` after auth and before service; one auth resolution per request; forged org
  cannot choose resolver target; A override/tariff cannot affect B; every actual protected action is mapped once or
  explicitly no-surface; checker fails on an unregistered action/direct resolver bypass; actual real and mock payment
  adapters are inventoried without activation; focused tests, checker self-tests, scoped lint/typecheck and diff
  check pass. No full CI until an accumulated milestone.
- **Execution mode:** one whole-stage `worker-hard/high`, independent high-risk audit, at most two coherent
  correction rounds with full re-audit. Audit findings without an S4 §5-6/mandatory repo-rule source are owner
  questions or recommendations, not automatic scope.

## 2026-07-19 — S4-0/S4-1 implementation evidence (`#888`)

- **Run:** `s4-0-s4-1-888-20260719`.
- **Registry and inventory:** the fourteen-key typed registry with Russian labels is
  `apps/webapp/src/modules/org-entitlements/types.ts:11-31`; the method-level mapping and explicit no-surface
  declarations are `apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts:18-44`; the human-readable
  contract/payment/ownership inventory is [`S4_0_S4_1_CONTRACT_INVENTORY.md`](./S4_0_S4_1_CONTRACT_INVENTORY.md).
- **Boundary:** `assertMechanicEnabled` and both route/action adapters are
  `apps/webapp/src/app-layer/guards/requireEntitlement.ts:13-44`. They accept only an already-authorized
  `organizationId`, resolve only `orgEntitlements`, and return route `403 entitlement_required` or action typed deny.
- **Coverage:** all mapped protected method-level write actions call the common adapters after their existing auth or
  composed context. The machine checker is `apps/webapp/scripts/check-s4-entitlement-coverage.ts`; its self-test
  rejects duplicate and unknown exported actions and the production scan rejects resolver/tariff bypass.
- **Compatibility/source/merchant/payment contracts:** resolver tests retain assigned/override/unassigned default-on;
  `tariffAccessContract.ts`, `merchantIdentityContracts.ts`, and `saasActivationContract.ts` are dormant typed
  contracts only. No DDL, migration, fixture/backfill apply, provider activation, secret, env key, billing UI, or
  subscription/grant write was added.
- **Data-gate residual:** the required future `unassigned org = 0` fixture/report is not produced here: it requires
  a separately approved data inventory/backfill scope. Existing unassigned organizations deliberately remain default-on.
- **Local verification blocker:** the worktree has no `apps/webapp/node_modules`; focused Vitest stops before test
  discovery because the required workspace package cannot resolve `drizzle-orm`, and the checker command cannot find
  `tsx`. `git add` cannot create this worktree's git index lock (`Read-only file system`), so no commit was made.
