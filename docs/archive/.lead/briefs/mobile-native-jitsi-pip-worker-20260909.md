# Worker brief — #915 Android Jitsi PiP and conference ownership

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «уход со страницы и сворачивание приложения не завершают звонок».

## Role and rules

You are the product worker for the Android-only half of taskdb #915. Work in the supplied clean worktree and finish the whole stage in one turn. Before every action obey the repository heading-map gate in `AGENTS.md`; read `README.md`, `apps/mobile-shell/README.md`, `AGENTS.md` §10/§24, and the exact plan requirements M4-02/M4-03. Use code-search before blind grep. Do not use PROD or store credentials.

Workers do not write tests in this repository. Do not add, edit, rename, delete, weaken, or regenerate any test or audit artifact. Existing tests are immutable oracles and may be run. Do not run root full CI; the owner explicitly deferred it because package updates are happening in parallel.

## Exact file scope

- `apps/mobile-shell/**` product files only.
- No `apps/webapp/**`, `docs/**`, `.lead/**`, root manifests/lockfile, or test-file edits.
- Stage and commit only explicit modified paths; never `git add -A`; do not push.

## Required behavior

1. Keep the existing single `NativeJitsi` plugin and `JitsiMeetActivity` SDK integration; extend/parameterize it rather than creating a parallel plugin or video flow.
2. Enable Jitsi Android system Picture-in-Picture and route the Activity lifecycle through the SDK-supported PiP delegate behavior. Leaving the Jitsi Activity, navigating the WebView, or backgrounding the app must not terminate the conference. Preserve the platform's standard movable/resizable/stashable PiP behavior; do not build a custom fake Android floating window.
3. Only Jitsi's explicit End Call terminal event ends the conference. Destruction or temporary backgrounding of the Activity must not synthesize `terminated`. The plugin `hangup` command remains a narrow, conference-id-addressed explicit replacement/cancellation mechanism, not an unmount lifecycle action.
4. Fix conference ownership so a delayed terminal broadcast from conference A can never be emitted with conference B's id or terminate B. Preserve exactly-once joined/error/terminated semantics and existing retry/permission behavior. The retained independent red Java oracle for late A → replacement B must become green through production-code changes only.
5. Both flavors and both environments keep the existing exact self-hosted Jitsi endpoints, trusted-origin checks, secret/logging restrictions, and typed bridge outcomes. Do not add external telemetry, JaaS, `meet.jit.si`, or new dependencies unless already required by the pinned SDK.

## Validation and completion

- Run the narrow existing Android/Jitsi test target(s), including the retained late A → B oracle, plus the cheapest relevant Gradle compile/build check that proves the changed Activity/plugin compiles. Use the repository Android environment documented in `apps/mobile-shell/README.md`.
- Inspect the final diff for scope and secret leakage.
- Commit all product changes before ending. Commit message must include `#915`, why, exact checks/evidence, plan IDs M4-02/M4-03, and what remains unverified (real device/KVM/RuStore and independent acceptance).
- Report commit SHA, files changed, exact commands/results, and any real blocker. Do not update plan checkboxes or taskdb.
