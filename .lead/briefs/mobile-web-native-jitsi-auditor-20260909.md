# Тест или взгляд

Native/browser renderer selection and conference lifecycle are repeatable public behavior, so test them at the
existing video-stage boundary. Exact placement, absence of page copies and external endpoints are inspected; do not
test source text or UI wording.

# Auditor-live brief — #915 native Jitsi web seam

Independently audit the exact committed M4-01/M4-04/M4-05 candidate after `#1100` and NativeRuntime are landed.
Product code is read-only. You may add and commit only stable behavioral acceptance tests and audit artifacts. Do
not fix product code or touch Android, PWA/push/media, schema/backend/provider code, data/services or PROD.

## Mandatory reading and blind order

Run the AGENTS.md heading map; read the global decision method, §1/§1b, §5, §9–§12, §15–§17, §21 and §24
completely, with §10a/§10b before tests. Read the active mobile plan
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M3/M4/M7, landed `#1100` authority/evidence,
accepted native/runtime audit evidence, video module docs and exact base→candidate diff. Persist the kill-set below
before reading tests in `.lead/runs/mobile-web-native-jitsi-audit-20260909/00-blind-killset.md`.

## Blind behavioral kill-set

1. Browser/PWA and unavailable/malformed/rejecting native plugin retain the landed iframe behavior without crash,
   white screen or authorization change; trusted capable Android selects native exactly at the stage boundary.
2. All three production entries retain one session contract. Native open receives the exact authorized endpoint,
   room reference and access token once after explicit user join; no product page performs a second fetch or call.
3. Joined/error/terminated map to the existing diagnostics/hangup behavior exactly once; duplicate terminal events
   cannot double-hangup or strand the stage.
4. Retry, unmount and session replacement remove listeners and hang up only the owned conference. A late event from
   an old room cannot affect a new room or reuse/leak its token.
5. Specialist native hangup returns through the existing encounter/notes path. Runtime capability cannot forge
   role/org/room/endpoint, and browser behavior stays unchanged.

## Tests, fault injection and inspection

Use the cheapest existing video-stage/provider suite and shared fakes. Assert public render/session/diagnostic/
hangup effects, not private call counts, source strings, UI copy or component layout. Temporarily inject and restore:
native capability false/malformed/rejection; browser renderer selected native; duplicate terminal events; late event
from replaced session; failed first open then retry; unmount without listener cleanup. Every repeatable fault must
be caught by retained green behavior or left as a failing acceptance test on the untouched candidate.

Inspect the exact diff for no server renderer-union change, no second video/product page, no external Jitsi/JaaS
endpoint or secret and no unrelated surface mutation. Run retained/new targeted tests, webapp typecheck, scoped
ESLint, video architecture checks and `git diff --check`; no shared dev server/full CI/live call. Commit only
justified tests and `.lead/runs/mobile-web-native-jitsi-audit-20260909/{00-blind-killset.md,90-final-audit-report.md}`
with explicit paths, never `git add -A`; do not push. Return binary PASS/MUST FIX with reachable scenario, impact,
exact M-ID, kill tally, failed assertions, commands/SHA and live blockers. Restore all production mutations and do
not finish while a foreground command is running.
