# `F4` fix round 4 — put the channel check back, in ONE place, at the delivery seam

Rules: `AGENTS.md` is the single canon — `grep -n "^## \|^### " AGENTS.md`, find your topic, read that section
before acting (§24 covers delegated repo-work).

Источник оракула: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.2j — «разделить настройки входа для клиник и пациентов В НАСТРОЙКАХ ГЛОБАЛ АДМИНА — и всё».

Clone `/home/dev/dev-projects/bcb-wt-night-f4-20260823`, branch `wt/night-f4-20260823`.
Read first: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT2_NIGHT_F4_2026-08-23.md` (audit 2,
`FAIL, NOT FOR LAND`) — blockers `B2-1`, `B2-2`, and note `N2-3`. Its measurements are proven; do not redo them.

## What went wrong with the previous round

Round 3 removed the integrator's channel gate on the argument that the webapp already decides. The audit
disproved that with live requests: the gate was a duplicate ONLY for callers that check the channel themselves.
Two webapp paths never checked, so the integrator's gate was their only one, and deleting it made SMS go out
while SMS is switched off on all three surfaces:

- `POST /api/patient/diary/purge-otp/start` → `startPhoneAuth(..., { delivery: { channel: 'sms' } })`
- anonymous `POST /api/booking/public/create` → `issuePublicBookingVerification` → `deliverSmsCodeViaIntegrator`

Worse structurally: the decision moved from one function into ~35 call sites, and the audit proved you can now
delete the check from any of them — including `/api/auth/phone/start` — and the whole suite stays green.

## The shape to build (this is the owner's standing rule, not a preference)

Один chokepoint. The check must live at the **delivery seam** — the single place every code actually passes
through on its way to the integrator (`deliverSmsCodeViaIntegrator` and its email/messenger siblings; find the
real seam yourself, it may be one function or a small set). A route must not be able to reach delivery without
passing it, and adding a new route must not require remembering to add a check.

Concretely:

1. Find the seam. Prove by sweep that every one of the four integrator delivery calls goes through it — including
   the two paths from `B2-1` and every path the audit listed as already-gated.
2. Put the surface-aware check there, fail-closed: unknown/missing surface, missing setting row, or a method that
   is off ⇒ refuse, and refuse with a REASON the caller can render, not a `500`.
3. Then remove the now-redundant per-route checks ONLY where you can show the seam covers them. If leaving a
   route-level check is cheaper than proving redundancy, leave it — a duplicated check is a wart, a missing one
   is an incident. Do not thin out gates for tidiness.
4. Do NOT restore the integrator-side gate. The seam is in the webapp, where the resolved surface exists.
5. The behaviour to preserve is the one BEFORE round 3: with SMS off, those two paths refused delivery. After
   your change they must refuse again — same outcome, one decision point.

## `N2-3` — the lead's decision, and it is: restore it

Round 3 also deleted the channel gate from `user.phone.link` in `apps/integrator/src/infra/db/writePort.ts`,
together with the `'auth_channel_disabled'` failure reason. That path runs inside the integrator's event
pipeline; the webapp is not in it, so the seam above does NOT cover it, and no replacement exists. The auditor
could not prove or disprove that anything produces that action (the scenarios live in the DB, not the repo).
Restore that gate as it was — including the failure reason — and say in your report what it now reads. An
unreachable gate costs nothing; a missing one on a reachable path is exactly the defect we just found.
If restoring it as-is is impossible because the old key set is gone, say so and stop rather than inventing.

## Tests (`B2-2`) — the check must be defended by construction

The audit's own oracle is already in the tree: `apps/webapp/src/modules/auth/deliveryChannelCallerGate.route.test.ts`
— currently RED on the product (`2 failed`). Make it green by fixing the product, not by editing the test.
Beyond it, add the test that would have caught the whole class: removing the check from the seam must turn the
suite red. Prove it — delete the check in a working copy, show the failures, restore. If your design makes the
check impossible to bypass structurally (e.g. delivery cannot be called except through the seam), say so and show
the construction; that is stronger than a test and worth reporting as such.

## Out of scope — do not touch

- `B-2` from audit 1 (no separate patient host in the deployment) — the owner's fork.
- `N2-4` / `N-4` (`500` on a missing settings row; `BCB-MIGRATION-VERIFY` has no executor) — known pre-existing class.
- `N-6`, `N-7`. The neighbour's `pre-session exact gate` defect: do not fix, do not work around.
- Do not touch `feat/doctor-ui-rebuild`. Do not run full CI — the lead does that.

## Proof required

- Live, on the shipped route modules with a real signature, at DEV settings with SMS/telegram/max off: both
  `B2-1` paths refuse delivery, and the integrator receives `0` requests. Show the requests and responses.
- The mirror: with the method enabled for a surface, delivery goes through on that surface only.
- `deliveryChannelCallerGate.route.test.ts` green without being edited; your own new test; targeted suites, `tsc`,
  scoped ESLint.
- Report: where the seam is, what you removed, what you deliberately left duplicated, and what you did NOT do.
