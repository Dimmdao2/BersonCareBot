# Track A — SaaS Product UX roadmap DAG reality audit

Audit branch: `audit/roadmap-dag-reality-20260723`

Audit base: `7ec8ecedd2d9c7d1a1b367ea4fc42dcbb5b46ed9`

Owner-plan denominator: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` §9.1,
`Normative direct-dependency registry`.

This is the one independent docs/contract audit pass for the 19 normative DAG rows. It changed no product code,
schema, DB, runtime, deploy or taskdb state. Taskdb was read only through
`node /home/dev/brain/tools/taskdb.mjs`.

## Verdict and evidence boundary

**PASS — the normative registry is current and internally consistent.** All 19 exact rows are present, all direct
stage references resolve, the graph is acyclic, every stage is covered, and no absent optional node enters the
initial-release dependency closure.

This audit deliberately separates two different questions:

- a **DAG contract is closed** when its direct dependencies and launch inclusion are valid and consistent with the
  stage text and owner decisions;
- a **product stage is complete** only when its own detailed implementation/audit/live gates are complete.

A downstream stage being unfinished does not make its dependency row fake or partial. It means that the valid row is
currently `blocked-by-dependency`. Likewise, an owner-deferred optional row is a valid launch contract precisely
because the node remains absent and does not block U10.

Verdict vocabulary in this report:

- `contract-real` — dependency/inclusion contract is valid and currently dependency-ready or already consumed;
- `blocked-by-dependency` — contract is valid, but a named upstream launch stage is not complete;
- `owner-deferred` — the owner explicitly excluded this optional node from initial release;
- `contract-partial` — the contract itself lacks required classification/evidence;
- `stale/contradictory` — the normative row conflicts with current authority or creates a reverse edge.

## Current dependency frontier

- Repository/audit outputs exist for U0, U1, U2 and U3S. Their remaining owner-acceptance layers do not rewrite the
  DAG.
- U5A has satisfied stage dependencies but taskdb `#796` is owner-gated on a sanctioned live lifecycle fixture/tool
  and TEST walkthrough. U3B and U5B therefore cannot close their full stages yet.
- U6A is dependency-ready because U1 and U3S have technical stage outputs; taskdb `#807` remains product work.
- U4 waits for full U3B and U5A; U6B waits for U4; U7 waits for U6B; U9 waits for U7; U10 waits for every included
  audited stage.
- U3A, U5C, U5D, U8A, U8B and U8C remain absent future nodes. They are not work for initial launch and do not block
  U10.

## Exact 19-row reality matrix

| # | Exact §9.1 contract | Current roadmap / owner / task evidence | Advancement reality | Verdict |
|---:|---|---|---|---|
| 1 | `U0 \| none (foundation handoff is external) \| included` | Roadmap §8 U0 records the docs-only readiness stage and its completed audit; taskdb `#889` is `done`, tested, audited and owner-accepted. Foundation remains an external gate, not a reverse U-stage edge. | Completed/consumed as the first internal DAG node. | **contract-real** |
| 2 | `U1 \| U0 \| included` | Roadmap §8 U1 names only U0 as its stage predecessor and records the guard-spine implementation; taskdb `#916` is `done`, tested and audited. | U0 is complete; the stage output legitimately fed U2/U5A/U3B/U5B/U6A/U9. Owner acceptance remains a separate layer. | **contract-real** |
| 3 | `U2 \| U1 \| included` | Roadmap §8 U2 and owner-review §15 define the one management/account shell after the capability spine; taskdb `#918` is `done`, tested and audited. | U1 is complete; U2 can and did advance without U3A/U8. | **contract-real** |
| 4 | `U5A \| U0, U1 \| included` | Roadmap §8 U5A explicitly makes resolver zero/one/many, chooser, switch and object authorization independent of invite/booking/install; its merge dependency repeats U0/U1 and forbids a later reverse prerequisite. Taskdb `#796` is blocked only on an owner-authorized live lifecycle proof. | Both stage dependencies are satisfied. The row is dependency-ready; the remaining owner/live gate blocks product completion, not the DAG contract. | **contract-real** |
| 5 | `U3S \| U0, U1, U2 \| included` | Roadmap §5 assigns J1/ACQ to U3S and §8 records completion. Taskdb `#919` is `done`, tested and audited; `#917` is only the later owner TEST handoff. | U0/U1/U2 outputs exist; U3S legitimately advanced. | **contract-real** |
| 6 | `U3A \| U0, U1, U2 \| absent optional node; dependencies apply only if future-activated` | Owner decisions exclude assistant/reception and initial clinic staffing; roadmap §§5, 6.3 and U3A say no solo-launch edge and explicitly exclude U3A from U3B, U4 and U10. Taskdb `#802` records the accepted decision closure. | No launch implementation or acceptance is required. The listed predecessors apply only if a future clinic-staff scope is activated. | **owner-deferred** |
| 7 | `U3B \| U1, U5A \| included` | Roadmap §8 U3B requires the completed U5A resolver and explicitly says deferred U3A is not a dependency. Taskdb `#801` and `#806` close bounded manual-card/visit/invite slices, while the roadmap leaves PIN/SMS/PBK/PWA/install/push and the full audit open; U5A task `#796` is blocked. | Safe independent slices exist, but the full U3B stage cannot close until U5A closes. No reverse U3B→U5A completion edge is permitted. | **blocked-by-dependency** |
| 8 | `U4 \| U2, U3S, U3B, U5A \| included` | Roadmap §8 U4 is an integration checkpoint consuming completed U2/U3S/U3B/U5A outputs and explicitly states there is no edge back from the checkpoint. | U2/U3S exist; U3B is incomplete and U5A remains owner-gated. U4 cannot legitimately start as a completion checkpoint yet. | **blocked-by-dependency** |
| 9 | `U5B \| U1, U5A \| included` | Roadmap §8 U5B repeats U1/U5A. Contract task `#928` is `done`; full UI/data-policy task `#971` is `todo`, and the roadmap forbids that work before U5A live closure except the already bounded guard-equivalent UI-5a layout predecessor. | U1 is complete, U5A is not. Full U5B remains correctly blocked rather than made dependent on U4/U3B/U5C. | **blocked-by-dependency** |
| 10 | `U5C \| U1, U3B, U5B \| absent optional node; dependencies apply only if future-activated` | Owner-review/roadmap reject the transfer/handoff lifecycle for launch. Roadmap U5C is only a future ordinary clinic-appointment placeholder and explicitly excludes itself from U10. | No launch edge or implementation exists; future dependencies are coherent if the owner later activates a clinic contract. | **owner-deferred** |
| 11 | `U5D \| U1, U5A, U5B \| absent optional node; dependencies apply only if future-activated` | Owner decisions keep existing solo chat unchanged and exclude clinic communication topology. Roadmap U5D states no initial route, migration or acceptance dependency and excludes itself from U10. | Correctly absent; it does not block the launch communication path. | **owner-deferred** |
| 12 | `U6A \| U1, U3S \| included` | Roadmap §8 U6A requires the truthful completed signup/security target and role guards. Taskdb `#807` is `todo`; roadmap records only the U6A-A specialist-first landing slice as integrated and leaves ACQ trace/full audit open. | Both dependencies have technical outputs, so U6A is a legitimate dependency-ready product stage. Its unfinished scope does not invalidate the row. | **contract-real** |
| 13 | `U6B \| U2, U4 \| included` | Owner-review §20 and roadmap U6B map slug/profile/booking/widget to taskdb `#926`; `#926` is `todo`, and `#805` retains a separate TEST gate. Roadmap explicitly says full U6B is dependency-blocked because U4 is open. | U2 is complete; U4 is not. U6B must not advance as a full stage yet. | **blocked-by-dependency** |
| 14 | `U7 \| U2, U6B \| included conservative presentation only` | Owner decision UX08-07 keeps common organization identity/shared presentation in launch while custom origin/generated PWA stays U8 future scope. Roadmap U7 repeats U2/U6B and forbids domain/sender/app infrastructure. | U2 exists; U6B is blocked. Conservative U7 cannot close before the published projection, and full U8 branding is not pulled into launch. | **blocked-by-dependency** |
| 15 | `U9 \| U1, U7 \| included` | Owner-review P3/P5 requires bounded platform billing/analytics without patient browsing. Roadmap U9 repeats U1/U7 and explicitly establishes the core platform ops/config path before U8. Taskdb `#929` and `#932` are completed bounded foundations, not full U9 completion. | U1 exists; U7 is blocked. Bounded U9 foundations may exist, but the full U9 stage cannot close and no optional U8 node points back into it. | **blocked-by-dependency** |
| 16 | `U8A \| U6B, U7, U9 \| absent optional node; dependencies apply only if future-activated` | Owner decision UX08-08 and accepted task `#802` place custom domain/subdomain after launch. Roadmap U8A consumes U9's sanctioned platform path and separate infrastructure/deploy authorization. | Correctly absent from launch; it neither blocks U9 nor U10. | **owner-deferred** |
| 17 | `U8B \| U3B, U5A, U7, U8A, U9 \| absent optional node; dependencies apply only if future-activated` | Owner decision permits a future generated organization PWA but excludes a separate native organization app. Roadmap U8B keeps platform PWA stable and requires the verified U8A origin plus existing patient/context/platform outputs only after activation. | Correctly absent; all listed edges are future-only and none enters launch closure. | **owner-deferred** |
| 18 | `U8C \| U3B, U7, U9 \| absent optional node; dependencies apply only if future-activated` | Owner-review addendum resolves custom-sender direction/no platform fallback while leaving real provider activation future-gated. Roadmap U8C consumes U3B delivery, U7 identity and U9 ops rather than creating a second settings/incident path. | Correctly absent from initial release; future policy is classified without becoming launch work. | **owner-deferred** |
| 19 | `U10 \| every launch-included audited stage \| included; absent optional nodes are not dependencies` | Roadmap U10 and §9 state that all launch-included audited stages plus the external foundation checkpoint precede convergence, while U5C/U5D/U8 remain absent. Mechanical expansion produces the other 12 included U stages and zero optional dependencies. | Several included stages remain open, so U10 is correctly blocked. The absent six optional nodes do not block it and no self-edge is created. | **blocked-by-dependency** |

## Mechanical validation

The repository contains no standalone roadmap-DAG checker, so this audit used a read-only inline Node check against
the machine-check source in §9.1. It compared all 19 rows byte-for-byte with the locked contract list, expanded U10
to all other included stages, checked references, cycle/topological coverage and the launch transitive closure.

Result:

```text
rows: 19
uniqueStages: 19
included: 13
optional: 6
unknownDependencies: 0
cycles: 0
topologicalCoverage: 19
optionalNodesInLaunchClosure: 0
```

No app tests, typecheck, lint, build, DB or runtime checks are applicable to a pure docs/DAG audit. The remaining
required repository checks are Markdown/diff hygiene for this report.

## Exact summary drift found outside the normative registry

The 19 §9.1 rows themselves have no stale or contradictory contract. The existing aggregate
`TRACK_A_EVIDENCE_MATRIX.md` does, however, apply product-stage evidence semantics to these pure DAG rows:

- A-DAG rows require code paths, tests and live PNG even though §9.1 is a documentation/dependency contract;
- its final report says `closed 0/19` because product stages are unfinished;
- this conflates contract validity with implementation completion and can make optional/dependency-blocked nodes look
  like launch-plan defects.

This is a bounded documentation drift, not product scope and not an owner question.

### Bounded correction batch

If the aggregate matrix is revised, change only its A-DAG-001…019 interpretation and DAG subtotal:

1. point those rows to this contract audit or reproduce its dependency/inclusion evidence;
2. report `closed 19/19` **as DAG contracts** while retaining each stage's separate product status;
3. preserve the six optional nodes as absent/non-blocking and the seven included downstream rows as
   dependency-blocked;
4. do not alter DNA/UI rows, product code, task statuses, owner acceptance or create implementation work from this
   correction.

## Closure

**closed 19/19 against
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md#91-normative-direct-dependency-registry` as
dependency/inclusion contracts.**

Verdict distribution: `contract-real 6`, `blocked-by-dependency 7`, `owner-deferred 6`, `contract-partial 0`,
`stale/contradictory 0` in the normative registry.

**NOT DONE:** this audit does not claim product-stage completion. U5A remains owner/live-gated; full U3B and U5B wait
for it; U4, U6B, U7, U9 and U10 remain dependency-blocked; U6A remains dependency-ready but unfinished. U3A, U5C,
U5D and U8A/B/C remain intentionally absent and must not be started as launch work.

## Owner questions

None. No finding outside the 19 owner-authorized contracts was converted into implementation scope.
