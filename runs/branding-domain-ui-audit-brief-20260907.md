# Test or view classification — independent clinic domain self-service UI audit (#787)

Read the `AGENTS.md` header map first, then §§9, 10, 10a, 10b, 11, 12, 16, 17, 21, 22, 24 in full; `README.md`; `docs/ORCHESTRATION_BINDINGS.md`; `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`; `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`; and exact TPB-14/B8/C5a owner requirements in `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`.

Audit candidate `cfe89ba03a719734873ca8be5e1388951361dc34` independently. Before reading candidate tests, derive the kill-set and classify every item as `test` or `view`. You may commit only missing stable acceptance tests and one audit artifact; never fix product code. UI text, order, counts, DOM structure, source imports and layout are not test oracles. Reuse API/service behavior evidence from the accepted core audit instead of duplicating it at RTL level. Use an isolated allowed DEV instance for live desktop/mobile inspection if the repo runbook permits; never touch TEST/PROD/DNS/TLS.

Required coverage:

1. Live owner journey accepts one base domain and two human-labelled placements. Apex yields the server-returned apex hostname and one A instruction; existing-site yields server-returned `app.` hostname and one CNAME instruction. Browser does not invent or submit final hostname/targets/state.
2. Honest visible status changes follow returned lifecycle: pending DNS, certificate preparation, active, actionable failure/suspension. Saving is not presented as active; one recheck action invokes the canonical route and refreshes state.
3. Read-only/non-entitled state cannot mutate. Do not treat hidden/disabled UI as server authorization evidence—the core audit owns that—but verify the observable management journey does not offer a false enabled action.
4. Active hostname link uses server state. Pending/failed state keeps the technical address visible/usable and never promises or implements client-side redirect.
5. Technical patient root/card address is `<slug>.therapygo.ru` from accepted surface config, not
   `APP_BASE_URL/<slug>`; the separate public booking link keeps `/book/<slug>` but also uses the
   configured patient origin, never the split staff `APP_BASE_URL=therapysto.ru`.
6. Existing slug rename, branding, booking and other settings remain usable; TEST fallback stays configured rather than hardcoded by component branching.
7. Desktop and mobile: no overflow/cut-off, readable DNS record/value, placement control uses human display labels, status/error/recheck remain reachable, shared doctor section/field/control geometry is reused.
8. No new page/store/API or Berson-specific branch; settings composition uses the accepted domain binding projection and one source of public DNS values.
9. Confirm `OrgCustomDomainSection.ui.test.tsx`, deleted in integration commit `d82f9b71e`, remains absent: it pinned wording, labels and control state already covered at the cheaper owner/entitlement HTTP boundary. Do not recreate that UI-shape oracle.

For every repeatable stable behavior that legitimately belongs at UI level, use the cheapest public user-action test and perform one fault injection per independent class. Visual/copy/layout items are one live view pass, not screenshot-pixel or source tests. Revert all injections.

Deliver and commit: artifact with candidate SHA, kill-set, test/view classification, exact commands/results, live viewport facts, fault injections/reversion, binary PASS/FAIL and concrete reachable findings only; any intentional acceptance tests; audit queue verdict. Explicit paths only, no `git add -A`, no push/land/deploy.
