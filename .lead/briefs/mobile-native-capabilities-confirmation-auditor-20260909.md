# Confirmation auditor brief — #915 Android native capabilities correction

Authority: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` stages M4, M5, M6 and M7; original candidate
`fafa7dcf0`; audit binding `9ede81483`; independent audit/tests `657a8b7d7`; correction authority `04a478d90`;
product correction `bfe25db0b`; saved report
`.lead/runs/mobile-native-capabilities-audit-20260909/90-final-audit-report.md`. This is one bounded confirmation
gate over the corrected final native surface, not a second presentation pass.

## Mandatory reading and role

Before every action run the `AGENTS.md` heading map. Read the global decision method; §1/§1b; §9; §10/§10a/§10b;
§12 and §24, especially §24.4–§24.7. Read the active plan, original worker/auditor/correction briefs, saved report,
the blind kill-set, exact candidate/audit/correction diffs, all production and existing test files in scope, Android
manifest/flavor configuration and mobile-shell README. Use code-search before blind grep.

You are an independent `auditor-live`, not a fixer. First write a fresh blind failure list under your run artifact
directory before inspecting implementation details. Audit only reachable correctness/security/runtime failures
against owner requirements. Style, alternate architecture and speculative hardening are not findings.

## Mandatory confirmation surface

1. Prove the four original MUST FIX failures are closed without weakening their retained oracles: compiled-brand
   push isolation; exact root-or-child route acceptance with dot-segment rejection; actual selected-document MIME
   enforcement; camera result carries both URI and MIME.
2. Prove cold-process RuStore Push behavior: the manifest Application starts one shared runtime; a persisted
   non-secret project id bootstraps the SDK before any trusted WebView call; token/message callbacks are registered
   for cold and warm processes; data-only messages validate brand/route before notifying; notification title comes
   from the compiled app label; secrets/tokens/payload/project identifiers are not logged. Do not require or invent
   credentials, live delivery or PROD access.
3. Prove Jitsi emits at most one terminal event for duplicate SDK broadcasts, `hangup()` is idempotent, and retry
   rechecks both camera and microphone permission before relaunch. Keep exact endpoint/room/JWT/origin gates intact.
4. Prove media upload reports `uploaded` only for HTTP 2xx plus a non-empty multipart ETag; redirects, non-2xx and
   missing ETag fail with a typed outcome; cancellation/cleanup/concurrent calls cannot corrupt the active handle.
5. Re-run the four brand×environment unit-test matrix and the proportionate build/type/lint checks through the
   shared host lock. Inspect merged manifests and production artifacts for correct identities, non-debuggable /
   no-cleartext behavior and absence of committed secrets.

## Tests, boundaries and report

You own behavioral tests and run artifacts. Add or strengthen the smallest public-boundary/behavioral tests needed
for the newly added cold-process, single-terminal and 2xx+ETag contracts; do not test source text, method spelling,
formatting, copy or number of UI elements. Each test must name the behavior and have a credible fault that makes it
red. Do not modify product code. Expected writable scope:
`apps/mobile-shell/android/app/src/test/**`, `.lead/runs/mobile-native-capabilities-confirmation-audit-20260909/**`
and the final report only. Existing audit artifacts are read-only.

Run explicit fault injections against currently green tests, fully revert each product mutation, and report
`убито N / непойманных M` with exact commands. A failure without a reachable scenario and violated plan line is not
a finding. Save the final report as
`.lead/runs/mobile-native-capabilities-confirmation-audit-20260909/90-final-audit-report.md`, commit only audit-owned
tests/artifacts with an `#915` message, never `git add -A`, do not push, and finish with a clean tree. State exact
SHA, verdict, test/build commands, killed/missed count and external gates (KVM/device, real RuStore delivery,
signing) separately from repository defects.
