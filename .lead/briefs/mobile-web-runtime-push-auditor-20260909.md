# Тест или взгляд

Repeatable runtime selection, fallback, service-worker/install suppression and native-push registration/tap/logout
behavior are tested through public adapters/providers. One-time file placement, absence of page copies and the
single-detector architecture are inspected against the exact diff; do not test source text.

# Auditor-live brief — #915 web NativeRuntime and Universal Push client

Independently audit the exact committed M1-07/M3/M6-client candidate. Product code is read-only. You may add and
commit only stable behavioral acceptance tests and audit artifacts. Do not fix product code, touch Android,
schema/migrations, integrator/provider delivery, video/media paths, data/services or PROD.

## Mandatory reading and blind order

Run the AGENTS.md heading map; read the global decision method, §1/§1b, §2–§5, §9–§12, §15–§17, §21–§22 and
§24 completely, with §10a/§10b before opening tests. Read the complete active plan
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M1/M3/M6/M7,
`apps/mobile-shell/README.md`, accepted native/push audit evidence, existing platform/PWA/web-push docs and the
exact base→candidate diff. Persist the kill-set below before reading tests in
`.lead/runs/mobile-web-runtime-push-audit-20260909/00-blind-killset.md`.

Источник оракула — M3/M6: browser/PWA gets the unchanged web fallback; trusted Android calls the same public
contract through the native bridge. No parallel push business path, platform detector or authorization source is
introduced.

## Blind behavioral kill-set

1. Browser, PWA, messenger and missing/malformed/rejecting plugin resolve safely to browser behavior; no native
   fact authorizes role/org/surface, crashes hydration or leaves a white/loading screen.
2. Therapy Go and Therapysto map only from validated shell brand; runtime reports exact closed kind/version/caps.
   Product pages cannot forge kind or reach a plugin through a second detector.
3. Native runtime performs zero `/sw.js` registration, PushManager/VAPID subscription, `beforeinstallprompt`
   subscription, browser-install marking or install UI; browser/PWA retains each behavior and platform-admin keeps
   the accepted exclusion.
4. Runtime kind alone fixes the native-push API surface. Missing/invalid project id, denied permission, missing
   plugin, unauthenticated response and malformed token event fail typed/no-op without POST loops.
5. Permission is requested only after an explicit existing Push-enable action. Token/rotation/resume register one
   opaque installation with `provider:'rustore'`; duplicate unchanged events do not storm POST.
6. Logout uses the existing door, attempts authenticated DELETE before session destruction and then native revoke;
   failure stays best-effort and never blocks logout or logs token. Browser logout is unchanged.
7. Valid same-surface tap routes in-app once. External/protocol-relative/admin/cross-brand/account/malformed route
   is ignored; no raw token or project id reaches logs/errors/analytics/persisted state.

## Tests, fault injection and inspection

Use the cheapest existing adapter/provider suites and shared fakes; table-driven tests are preferred over a suite
per component. Assert rendered/public outputs, navigation and HTTP/plugin effects, not private call counts, source
strings, UI copy or button counts. Temporarily inject and restore: spoofed/malformed shell info; rejected plugin;
service-worker registration in native; invalid/cross-surface tap; repeated token/resume; permission on mount; logout
ordering reversed. Every repeatable fault must be caught by retained green behavior or left as a failing acceptance
test on the untouched candidate.

Inspect the exact diff for one platform/runtime boundary, no second product page, no `#1100`/video mutation and no
Android/backend/media/secrets mutation. Run retained/new targeted tests, webapp typecheck, scoped ESLint, PWA/push
architecture gates and `git diff --check`; do not use a shared dev server or full CI. Commit only justified tests and
`.lead/runs/mobile-web-runtime-push-audit-20260909/{00-blind-killset.md,90-final-audit-report.md}` with explicit paths,
never `git add -A`; do not push. Return binary PASS/MUST FIX with reachable scenario, impact, exact M-ID, kill
tally, failed assertions, commands/SHA and factual live blockers. Restore all production mutations and do not finish
while a foreground command is running.
