# C3M auditor-live — integrated compatibility and acceptance

Read the `AGENTS.md` heading map before every action, then §1/§1a, §4/§4a, §5, §9, §10/§10a/§10b, §12,
§15–§22 and §24 in full. Read `README.md`, the whole current C3M section and its minimum acceptance matrix in
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, every accepted C3M audit artifact, and the final
integration diff before testing.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-12 and C3M.8 in full.
Audit the already integrated candidate only. Do not invent product scope, presets, tariffs or profession logic.

## Тест или взгляд

- Repeatable resolver, authorization, client-policy, persistence, tenant isolation, OFF→ON restoration and hidden
  work behavior: behavior tests/runtime requests. Before reading existing tests, write the blind kill-set from C3M.8.
- One-time migration/backfill/index/privilege state: migration checker, owner-aware rollback-only named-DEV
  preflight evidence and schema/privilege introspection; never tests that scan SQL/source text.
- Navigation, labels, responsive layout, tabs, stars/filters, settings dependency states and absence of visual junk:
  live desktop/mobile inspection on an isolated candidate server. Do not encode wording, DOM shape, control count or
  screenshots as permanent tests.

## Required integrated acceptance

1. Existing organizations with absent preferences keep all previously available surfaces. Preferences never expand
   entitlement/capability availability; malformed persisted composition fails by the accepted contract.
2. For every module, OFF removes its navigation/tab/widget/CTA/deep-link path, server mutations reject bypasses,
   and its preload/poller/badge/notification work stops. ON restores stored data without mutation or loss.
3. `medical_record` and `encounters` pass all four ON/OFF combinations while booking/schedule, basic Overview notes,
   clients and tasks remain present. Today presentation remains unchanged.
4. Rehabilitation OFF covers card/program/catalog plus dependent comments/media; Communications selects only an
   effective child and disappears when none remain. Mailings stays independent of chat/support.
5. Client explicit allow/deny wins over default; inherit follows `off | all | on_support`; changing the one
   `onSupport` property affects only inherited on-support channels. Organization isolation holds for a patient shared
   by two organizations.
6. Portal OFF/deny blocks only private content for that organization, preserves identity/enrollment/history and
   leaves public booking plus another organization intact.
7. A symptom with patient tracking OFF remains fully usable by the specialist but is absent/read-only-denied for the
   patient; re-enable restores it and history. Create default is a one-time snapshot, including `on_support`.
8. The one support group appears under the selected name and the central Clients/Patients terminology is consistent
   across the inventory. No second favorite/group or booking policy exists.
9. Settings save/reload atomically preserves module choices, child preferences, channel defaults, symptom default
   and terminology; unavailable functions are not offered as effective switches and parent OFF does not erase child
   choices.
10. Existing linked clients, explicit comments/media choices, chats, symptoms, visits, programs, files and mailings
    survive the rollout and OFF→ON cycle. Desktop and mobile primary journeys remain usable.

Reuse accepted targeted tests and fault injections; do not duplicate them. Add a permanent test only for a missing
stable behavior contract with demonstrated regression value. Record each named fault as caught or as a concrete
failing acceptance test. Findings require a reachable scenario, impact and violated owner requirement/repo rule;
style or alternative architecture is not a finding. Commit only auditor-created acceptance tests and one audit
artifact, never product fixes.

Run the integration-level checks required by §9 only once on the final candidate SHA, under the host lock. If long
candidate migration/full-CI work must survive the agent turn, launch it detached with `setsid`, name the log and let
the lead perform the separate short result check; do not claim PASS while it is still running. For live UI, use an
isolated port and ordinary DEV login documented in §1a; do not occupy the shared dev server. Commit explicit paths
only with `#1098`, candidate SHA, exact commands/evidence and C3M-12 result. Never `git add -A`, never push.

The auditor does not deploy. After its PASS, the lead follows the owner instruction recorded beside C3M-12: one
full CI on the integrated SHA, then the ordinary code-only TEST deploy. No full reset and no PROD action.

If an existing in-scope test encountered during acceptance checks source/SQL wording, formatting, element/string
counts, DOM shape or another implementation form instead of durable behavior, remove it; do not adapt or preserve it.
