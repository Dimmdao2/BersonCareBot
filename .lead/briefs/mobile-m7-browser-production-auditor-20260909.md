# Auditor-live brief — M7-03 production-runtime browser closure (#915)

## Test or view classification first

Work only in `/home/dev/dev-projects/bcb-wt-mobile-m7-browser-final-20260909` on
`wt/mobile-m7-browser-final-20260909`. This is the final runtime continuation for accepted product correction
`6cbcc8cbb`. Read the two committed audit reports on this branch first for prior evidence and blockers, but build
your own live checklist from authority before inspecting test code. You are an independent auditor-live, not a
fixer; product code and existing tests are read-only.

Before every action follow the heading-map gate in `AGENTS.md`. Read §1/§1a/§1b, §9, §10a/§10b, the patient/doctor
UI sections applicable to touched pages, §12 and §24, plus
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` and
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M7-03 with its related owner
decisions. Do not invent accounts, fixtures, token/cookie injection or password entry for the patient.

The previous run proved ordinary doctor login once but the isolated `next dev`/webpack listener then stalled during
on-demand compilation. Eliminate that circumstance: build this exact candidate once and run a bounded isolated
**production Next server** on an unused loopback port (prefer `5210`) with the required DEV-safe runtime
configuration. Do not touch shared `5200/4200/6200/3200`, shared caches, databases, TEST or PROD. If an isolated
production build cannot use the documented patient OTP debug flow because `NODE_ENV=production` correctly forbids
it, complete the doctor/browser portions on production runtime and perform the patient OTP chooser portion in a
separate bounded Turbopack listener only after the production server has proved stable; do not weaken the guard.

## Live acceptance

Use headed Chromium/Xvfb with ordinary visible clicks and the documented owner accounts. Synthetic camera/mic flags
are allowed only to make browser permission prompts deterministic. Do not select/upload health data and do not send
real provider messages.

1. Patient and doctor/CMS browser fallback: visible camera/media action exposes the browser/OS chooser contract,
   separate document selection is reachable, and cancel returns without attaching/uploading or leaving a busy
   state. OS chooser destination itself may be evidenced from the browser filechooser event and `accept` contract;
   do not fabricate a selection.
2. Jitsi browser path: force the first `external_api.js` load to fail through browser network interception, verify
   visible retry, then allow the self-hosted TEST script and observe exactly one iframe/session after explicit start.
3. With that same live iframe mounted, use visible global navigation to another internal application page. Mobile
   stage remains below header/bottom navigation, the same iframe/render session stays alive, a compact active-call
   indicator appears, and clicking it returns to the exact call page. A second normal start is refused while active.
4. Use the visible explicit Jitsi end control/callback path and verify the call/indicator/session clean up exactly
   once. Do not synthesize a terminal callback directly.
5. Repeat the active-call layout observation at desktop width: current page layout is preserved and no new floating
   mobile indicator/UI appears.

These are visual/runtime observations; do not add tests for layout, labels, button counts or source shape. If a
repeatable expensive silent behavioral defect is actually discovered, retain a test only if it passes §10a/§10b
and its fault injection is recorded. Otherwise commit only one report and minimal non-sensitive screenshots needed
as evidence. No product fix.

Stop all auditor-owned listeners/browser process groups and remove temporary profiles before exit. Commit explicit
audit paths only, do not push. Report exact candidate/runtime commands, each acceptance result, blocker versus real
finding, and `убито/непойманных`. Do not end while a foreground build/server operation is unresolved.
