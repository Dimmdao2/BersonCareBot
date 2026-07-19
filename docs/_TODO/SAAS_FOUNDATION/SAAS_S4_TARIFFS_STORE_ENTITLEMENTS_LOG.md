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

