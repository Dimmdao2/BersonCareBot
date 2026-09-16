# Тест или взгляд — independent audit of branded clinic bots (#787)

Audit the exact committed candidate `10c768662b4e29d0d122c96811ce6a51bb71baa5` in this clone. This is an
independent acceptance gate, not permission to redesign or fix production code. Finish the audit in this one turn,
commit the audit artifact and any admissible acceptance tests, and do not push.

## Mandatory reading and authority

1. Run `grep -n '^## \|^### ' AGENTS.md`. Read `AGENTS.md` §2–§5, §9, §10, §10a and §10b in full,
   including **“ТЕСТ НЕ ДУБЛИРУЕТ КОД, КОНТРАКТ ИЛИ ТЕКСТ”** and the ban on automated UI tests, plus §12,
   §16 and §24.4–§24.7.
2. Read the worker brief
   `/home/dev/dev-projects/BersonCareBot/.lead/briefs/clinic-branded-bots-worker-20260909.md` and the exact full
   checkbox text of `TPB-12a`, `TPB-12b`, `TPB-13a`, `C3`, `D1` in
   `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`.
3. Compare candidate `10c768662...` to base `ca215b32a`. Read the actual implementation and existing tests only
   after writing the blind kill-set below.

Independent oracle: the quoted owner requirements in the worker brief and the named owner checklist entries.

## First mandatory step: “test or look” and blind kill-set

Before reading existing tests, classify each requirement:

- one shared provider-neutral dispatch path and only thin Telegram/MAX provider adapters;
- global TherapyGo patient credentials and global Therapysto staff credentials cannot be changed by a clinic;
- clinic Telegram/MAX controls appear only in the existing Branding surface and are unavailable without active
  `branding`; the server write/probe/runtime resolution boundaries enforce the same rule;
- any additional channel mechanic can only further restrict access and never replace the branding requirement;
- verified+enabled+entitled clinic credentials may handle patient delivery; missing, disabled, unverified or
  non-entitled clinic configuration resolves to TherapyGo;
- once a valid clinic bot was selected, provider failure must not silently retry through the platform patient bot;
- staff delivery always resolves to Therapysto and never clinic credentials;
- existing `system_settings` organization rows and existing single write/dispatch paths remain the only paths.

For every item say **TEST** or **LOOK** before inspecting tests. Then state the blind fault, user/data impact,
independent oracle and final observable outcome. A code-shape, UI text/count/DOM/CSS assertion, internal mock-call
shape, copied type/DTO/list/registry, compilation failure or source-string check is forbidden. UI is LOOK now and
live acceptance only after landing on the one shared `:5200` server.

## Audit boundary and evidence

- Inspect the complete diff `ca215b32a..10c768662`, including privilege/tenant/secret-redaction implications,
  entitlement precedence and whether a second path/duplicate resolver was introduced.
- Run only targeted checks through the repository host lock where §9–§10 require it. Do not run full CI, deploy,
  contact real providers, change DEV/TEST/PROD data, start another Next server or push.
- The worker reports two pre-existing tests now fail because they freeze superseded behavior. Apply §10a to each:
  delete or replace only if it is in this candidate's directly affected surface. Do not clean unrelated historical
  tests. Never preserve a test merely to make a suite green.
- You may add or modify a test only when you first record all three: independent oracle, expensive silent failure,
  final observable consequence. Prefer end-to-end public module/route behavior. If realistic verification needs
  provider credentials or live UI, classify it as post-land/TEST evidence rather than inventing mocks.
- Fault-inject each retained/new behavioral test against its named fault; restore all production code afterward.
- A finding is only a reachable violation of the named owner requirement/repo rule with impact and evidence.
  Do not fix production code. Recommendations and alternate architecture are not findings.

## Deliverable

Create one concise audit artifact under
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/` containing candidate/base SHA, the pre-test kill-set,
TEST/LOOK classification, exact commands/results, test-policy disposition for every changed/added/deleted test,
fault-injection evidence, findings, post-land/live evidence still required, and a binary `PASS FOR LAND` or
`BLOCKED` verdict. Commit only the artifact and admissible acceptance-test changes with explicit paths. Report the
commit SHA and do not push.
