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
- **Coverage (historical implementation note, superseded by correction round 1 below):** the initial claim that all
  mapped actions were covered and that the checker established complete semantics was overbroad; the independent
  audit found two omitted CMS exports and insufficient checker/test proof. Its batch-PATCH allegation was later
  rejected because that request shape is modes-only. The precise current guarantee is recorded below.
- **Compatibility/source/merchant/payment contracts:** resolver tests retain assigned/override/unassigned default-on;
  `tariffAccessContract.ts`, `merchantIdentityContracts.ts`, and `saasActivationContract.ts` are dormant typed
  contracts only. No DDL, migration, fixture/backfill apply, provider activation, secret, env key, billing UI, or
  subscription/grant write was added.
- **Data-gate residual:** the required future `unassigned org = 0` fixture/report is not produced here: it requires
  a separately approved data inventory/backfill scope. Existing unassigned organizations deliberately remain default-on.
- **Local verification blocker:** the worktree has no `apps/webapp/node_modules`; focused Vitest stops before test
  discovery because the required workspace package cannot resolve `drizzle-orm`, and the checker command cannot find
  `tsx`. `git add` cannot create this worktree's git index lock (`Read-only file system`), so no commit was made.

## 2026-07-19 — independent audit FAIL and correction round 1 (`#888`)

- **Audit:** `/home/dev/brain/runs/agent-port/bcb-s4-entitlement-foundation-audit-20260719.json` returned **FAIL**
  before any correction round. Only findings with direct sources in S4 §§5–6 or the mandatory S4 registry/rules were
  accepted: two CMS mutations omitted from `cms_pages`, incomplete checker proof, and missing per-family denial
  contracts. The alleged payment-settings `items[]` bypass was rejected after lead inspection: the batch schema is
  restricted to `MODES_FORM_KEYS`, so payment keys cannot enter that branch. Expanding it would be audit-driven API
  scope growth. The audit recommendation about schedule-block `DELETE` remains explicitly out of scope because the
  S4/Tariffs Phase-2 booking inventory is create-only.
- **CMS correction:** `sections/actions.ts:130-237` now calls `requireEntitlementForAction(workspace, "cms_pages")`
  immediately after workspace auth for both attach and rename; the registry maps them at
  `protectedActionRegistry.ts:30-31`. The CMS matrix is now four section mutations plus page save/lifecycle.
- **Payments verification:** the existing single-key payment-settings gate is retained and now has denial/success
  contract coverage. The modes-only batch schema and `persistAdminModesBatch` type remain unchanged; payment keys are
  intentionally not admitted into that request shape.
- **Checker correction:** `check-s4-entitlement-coverage.ts:32-176` exports pure helpers and checks every exported
  action in declared mechanic-bearing files against exactly one mapping or `PROTECTED_ACTION_EXEMPTIONS`
  (`protectedActionRegistry.ts:45-67`). It reports duplicate IDs, duplicate file/export mapping, unknown/omitted
  export, unregistered mechanic, mapping/exemption collision, and direct resolver/tariff/override bypass across
  `app/api`, `app/app`, `app-layer`, and `modules`, with only the guard/resolver boundary excluded. It guarantees
  declared inventory coverage plus bypass detection; it cannot infer arbitrary future protected business semantics.
- **Contract evidence:** existing compact harnesses now have configurable entitlement mocks and prove denial/order/
  service-not-called for mailings; page/lifecycle/each of four CMS section mutations; subscriptions; representative
  patient-card visits; files; branch/service/schedule-block creates; and payment single-key. Courses retains its
  existing dedicated evidence; resolver A/B and forged-org evidence remain in their existing focused tests.
- **Checks:** `pnpm --dir apps/webapp run check:s4-entitlement-coverage` and
  `pnpm --dir apps/webapp exec tsx scripts/check-s4-entitlement-coverage.ts --self-test` passed (18 mappings).
  The focused stage set passed 23 files / 238 tests: the first run exposed one incomplete success-fixture in the new
  settings contract, then only that failed file was rerun after the fixture correction (CI resume/reuse policy).
  `pnpm --dir apps/webapp typecheck` passed after the isolated worktree was linked to the already-installed workspace
  dependencies; scoped ESLint for every changed TS/TSX file since the stage base and `git diff --check` passed. No
  root full CI or full app suite was run; those remain milestone gates.

## 2026-07-19 — full re-audit owner gate (`#888`)

- **Re-audit:** `bcb-s4-entitlement-foundation-reaudit-20260719` confirmed the accepted correction findings closed:
  all four named CMS mutations are gated, the checker/export inventory and bypass self-tests are substantive, the
  payment batch finding remains correctly rejected, and the planned action-family denial/order contracts exist.
- **Unresolved classification:** the re-audit found additional `patientClinical` and `patientFiles` mutations outside
  the current registry. The general S4 wording says to gate all protected actions, while the concrete Phase-2 matrix
  in `TARIFFS_PAYMENTS_ADMIN_PLAN.md` deliberately scopes `patient_card` to one representative write per listed
  subresource and `files` to `POST`. Extending the capability to every mutation would therefore change the approved
  action matrix rather than merely fix the accepted correction.
- **Execution decision:** no correction round 2 was opened. The branch stops at the owner gate: decide whether
  `patient_card` / `files` disables only the representative rollout matrix or every mutation in those domains. The
  recommendation is full mutation coverage for a capability that is advertised as disabled, but the safe current
  default preserves the explicit matrix and does not silently broaden tariff behavior.
- **Deferred recommendations:** keep a regression test that payment keys remain invalid in the modes-only batch;
  decide separately whether schedule-block deletion and other patient-card-adjacent ports belong to these mechanics.
  None was converted into code or a new task by the auditor.

## 2026-07-19 — owner ruling correction: all Patient Card / Patient Files mutations (`#888`)

- **Owner ruling:** when `patient_card` or `files` is disabled, every mutation in that section must be denied after
  workspace authorization and trusted patient/org (and, for a file item, file ownership) resolution. This resolves
  the re-audit's representative-write versus all-mutations gate without expanding to a different product domain.
- **Mapped/gated patient-card mutations:** visit PATCH (`patientClinical.updateVisitFields`); diagnosis-status PATCH
  (`setDiagnosisClinicalStatus`); physical PATCH (`doctorClients.setPatientPhysical`); comorbidity POST (`add`);
  comorbidity item PATCH (`editText` and `restore`); and comorbidity DELETE (`markRemoved`). The latter remains a
  soft removal: the row is retained for existing recovery/read paths, never deleted because entitlement is off.
- **Mapped/gated file mutation:** patient file-item PATCH protects both `linkFileToVisit` and `renameFile` after the
  canonical patient and file ownership checks. File GET/preview/download remains readable under the normal workspace
  access model.
- **Preserved read/recovery behavior:** GET routes, diagnosis status history, existing-data export/download and
  removed-comorbidity listing remain available. Restore is correctly treated as a blocked mutation while disabled;
  the soft-removed record remains intact for recovery after re-enablement. Disabling a mechanic never deletes
  existing patient card or file data.
- **Explicit exclusions preserved:** diagnosis-catalog creation, symptom trackings, booking (including
  schedule-block DELETE), programs, messages, identity/FIO, and admin media PATCH/DELETE are not broadened by this
  correction. Admin media is the general library/offboarding boundary, not the Patient Files section.
- **Evidence:** compact route contracts cover denial, trusted-resolution ordering and service-not-called for every
  newly mapped handler, including both branching PATCH variants and the soft DELETE. Checker/method mapping and
  focused validation results are recorded with this correction commit; independent re-audit remains pending.
