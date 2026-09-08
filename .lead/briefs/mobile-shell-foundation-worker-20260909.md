# Worker brief — #915 shared Capacitor 8 Android shell foundation

Deliver the whole shell foundation in one coherent pass. This is product code through the repo port. Do not write,
modify, rename, or delete tests; independent `auditor-live` owns tests. Do not touch webapp/integrator product code,
database/schema/migrations, TEST/PROD runtime, signing credentials or store accounts.

## Mandatory reading before action

1. Run `grep -n "^## \|^### " AGENTS.md`, then read the global decision method, §1/§1b, §5, §7, §9–§12 and
   §24 in full. Read `README.md`, `docs/README.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`,
   `docs/ORCHESTRATION_BINDINGS.md`, and `/home/dev/brain/docs/MODEL_TIERS.md`.
2. Read the complete active authority `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, especially M2-01
   through M2-08 and §6a decisions. Owner direction is a thin remote Next.js wrapper; do not introduce a local
   mobile SPA, copied page, copied auth/session or business-domain code.
3. Inspect the current root workspace/package/lint/CI conventions and the two source icons. Use code-search before
   exact `rg`. Verify current official Capacitor 8/Android requirements from primary documentation before pinning.

## Exact accepted decisions

- One `apps/mobile-shell`, not two repositories/packages.
- Brand dimension: `therapygo`, `therapysto`; environment dimension: `test`, `production`; normal Android
  debug/release build types remain. “Four variants” means the four brand×environment product combinations, not
  deletion of debug/release.
- Candidate IDs: `ru.therapygo.app` and `ru.therapysto.app`; TEST suffix `.test`.
- Therapy Go uses `server.url` as the exact origin `https://therapygo.ru` and `server.appStartPath=/app/patient`;
  Therapysto uses the exact staff origin `https://therapysto.ru` and `server.appStartPath=/app/doctor`. TEST replaces
  only the origin with the documented TEST host. Never put a path in `server.url`: it participates in Capacitor's
  bridge origin rules. The first Android release is platform surfaces only. A redirect to a custom clinic domain
  opens externally, fail closed; do not build tenant branding or a dynamic server origin-list endpoint into this
  shell.
- Use Capacitor 8's remote `server.url` because the owner explicitly chose the thin remote-origin wrapper. Record
  its official production-warning and the resulting privileged-web-deploy risk in README; do not silently replace
  it with a local bundle or a custom raw `loadUrl` that loses the bridge.
- No Capacitor HTTP/Cookies override and no offline business-data/video cache. Existing same-origin Next cookies,
  CSRF, SSR/RSC and browser HTTP cache remain authoritative.

## Required implementation — M2-01…M2-08

Create a strict TypeScript workspace package pinned to mutually compatible current Capacitor 8 packages and commit
the generated Android source/Gradle wrapper. Add it to `pnpm-workspace.yaml` and integrate real package scripts so
root recursive typecheck/lint/CI can include it without fake no-ops.

Implement two brand flavors and test/production environment flavors with separate names, IDs, exact start URLs,
theme colors, launcher/adaptive icons, splash resources and release-safe network configuration. Generate all icon
assets deterministically from:

- `apps/webapp/public/brand/therapygo-app-icon-source.png` — with sphere;
- `apps/webapp/public/brand/therapysto-app-icon-source.png` — without sphere.

Center each non-square transparent source on a square canvas with an adaptive-icon safe zone. Do not delete or
reuse old admin/clinic assets. Commit the derivation script and document the command.

Implement one navigation policy chokepoint by extending the normal Capacitor bridge/WebView client hook rather
than replacing the bridge:

- exact current trusted HTTPS platform origin remains inside;
- any other `https`, any `http`, and only the explicitly allowed external schemes `mailto` and `tel` open with the
  system browser/app; cleartext is never loaded inside the privileged WebView;
- `intent`, `file`, `content`, `javascript`, userinfo, every other custom scheme, cross-brand and TEST↔production
  navigation are rejected unless an exact app-local retry mechanism is required;
- logs never include full URLs/query/fragments.

Create a reusable `TrustedOriginGate` that every later plugin can call against the current WebView URL. It must
compare normalized exact scheme/host/default port and reject local error pages or missing/untrusted URLs. Do not
create a second independent origin policy inside future plugin stubs.

Provide loading, offline/server-unavailable and retry behavior without promising offline clinical data. Preserve
the normal Capacitor WebView client and hide loading on page commit. Android Back goes back in real WebView history
or exits at the root. Release disables cleartext/mixed content, WebView debugging and sensitive logging.

Add a narrow shell runtime-info Capacitor plugin/contract needed by the later web `NativeRuntime`: brand runtime
kind, version and capability flags only. It must be callable only from `TrustedOriginGate`; it is never an
authorization/role/org claim. Capability values for not-yet-built Jitsi/media/push are false.

README must contain exact toolchain env sourcing, install/sync/build commands, all APK/AAB output paths, flavor
matrix, remote-origin risk, debug-vs-release signing behavior and a release signing procedure that never writes a
private key/token into git. Scoped ignores cover `local.properties`, `.gradle`, build outputs, SDK paths, keystores
and service config without hiding source artifacts.

## Existing chokepoints / no duplication

Before introducing every wrapper/function/gate, explicitly ask whether an existing Capacitor/Android or repo
chokepoint can be parameterized. In particular use one flavor config source, one navigation policy and one
`TrustedOriginGate`; do not duplicate them by brand. Do not create native Jitsi, media or push behavior in this
stage beyond the typed false capability placeholders/runtime-info contract.

## Validation and delivery

No tests. Run all applicable non-test gates and wait in the foreground:

- frozen `pnpm install`, package typecheck/lint/build and `npx cap sync android` through package scripts;
- Gradle lint/compile and assemble for all four brand×environment debug combinations using the persisted toolchain
  `/home/dev/.local/share/bcb-android/env.sh`; report them honestly as debug-key signed artifacts, not unsigned;
- assemble/bundle all four release combinations as unsigned artifacts without a release keystore; document the
  exact external release-signing gate without inventing credentials;
- root workspace typecheck/lint only as justified by §9–§10 (do not run full CI here);
- `git diff --check` and explicit scan for secrets/keystores/local SDK paths.

Commit all and only this work with an honest `#915` message, using explicit path staging (never `git add -A`). Do
not push. Do not finish the one-shot agent turn while a foreground install/build is still running. Report commit
SHA, exact commands/results, produced artifact paths/sizes and any factual blocker.
