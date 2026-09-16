# Auditor-live brief — #915 Capacitor shell foundation

You are the first independent auditor of the new Android shell surface. Product code is read-only. You may add and
commit only justified stable behavioral acceptance tests plus one audit artifact. Do not fix product code, change
the plan, touch webapp/integrator business code, TEST/PROD, store accounts, signing credentials or host config.

## Mandatory reading and candidate

1. Run `grep -n "^## \|^### " AGENTS.md`, then read §10a and §10b completely before inspecting tests, plus the
   global decision method, §1/§1b, §5, §9–§12 and §24 in full.
2. Read `README.md`, `docs/ORCHESTRATION_BINDINGS.md`, the complete active
   `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, especially M2-01…M2-08/M7, and the exact committed
   candidate diff named by the launcher. Current owner outcome is a thin remote Next wrapper, not a local SPA.
3. Before opening any existing/new test, persist the blind kill-set below in
   `.lead/runs/mobile-shell-foundation-audit-20260909/00-blind-killset.md`. Existing tests never define coverage.

## Blind behavioral kill-set

1. Exact trusted HTTPS origin is internal; `http`, non-default port, sibling/cross-brand, TEST↔production,
   suffix/subdomain tricks and `https://trusted@evil` never become privileged internal.
2. `javascript`, `intent`, `file`, `content`, `data`, unknown/malformed/null/local-error URLs are consumed/rejected
   with neither WebView load nor ACTION_VIEW. Only `mailto`, `tel` and ordinary nontrusted HTTP(S) dispatch
   externally.
3. The actual Capacitor WebViewClient hook uses the one policy: internal lets WebView continue; external emits
   exactly one system intent and WebView does not load; rejected emits neither.
4. `TrustedOriginGate` permits runtime-info only for the current exact trusted WebView origin; missing,
   `about:blank`, local error or untrusted current URL yields typed denial and no data/capability.
5. Therapy Go/Therapysto × test/production expose the correct runtime kind, application identity, origin/path and
   TEST suffix isolation; not-yet-built Jitsi/media/push capabilities stay false.
6. WebView-history Back returns to the prior page, root Back exits/backgrounds; main-frame failure exposes a
   recoverable shell state and retry returns to the compile-time start URL without offline-data claims.
7. A canary URL containing query/fragment secrets never appears in shell logs; release artifacts contain no
   cookie/Jitsi/push/presign/signing material.

## Test or view classification

Write permanent tests only for repeatable public behavior:

- parameterized `NavigationPolicy` decisions through its public API;
- `TrustedOriginGate` plus runtime-info public contract for trusted/untrusted current URL and variant values;
- when practical with Robolectric/AndroidX, one client-boundary test observing override result and captured system
  intent/no-intent. Do not duplicate the full URI matrix at this layer.

Do not add tests for source/Gradle/README strings, filenames, counts, UI copy/layout, or internal method calls.
Inspect those once with Android tooling and source/diff review.

## Required fault injection

Temporarily mutate production behavior, run the retained oracle to red, and restore each mutation before commit:

- accept suffix host or ignore non-default port;
- classify untrusted HTTPS as internal;
- classify unsupported scheme as external/internal;
- allow null/untrusted current URL through `TrustedOriginGate`;
- swap a runtime brand/environment value or enable a future capability.

Record `fault → exact assertion that failed`; every named class must be killed or represented by a failing
acceptance test on the untouched candidate. Percentage is not a verdict.

## One-time build/artifact inspection

Source `/home/dev/.local/share/bcb-android/env.sh`. Run applicable package install/typecheck/lint/cap sync plus
Gradle compile/lint/assemble of all four brand×environment debug combinations and unsigned release APK/AAB tasks.
Inspect merged manifests and packaged artifacts with Android tooling for applicationId, label, debuggable/cleartext,
network config, exact start origin/path and no cross-brand/TEST bleed. Confirm debug APK signing vs unsigned release
honestly. Inspect launcher/adaptive/splash resources visually. Run scoped root gates justified by §9–§10,
`git diff --check`, clean-status and secret/keystore/local-path scan.

M2-00a is currently open because `dev` lacks group `kvm`; do not claim emulator/live M7-04. If KVM becomes
available during this audit, perform the exact live scenarios from M7; otherwise record this single external host
blocker without downgrading the source/build/test verdict.

## Delivery

Write `.lead/runs/mobile-shell-foundation-audit-20260909/90-final-audit-report.md` with binary PASS/MUST FIX,
reachable scenario/impact/violated M-ID for every finding, kill tally, exact commands and artifact evidence. Commit
only new acceptance tests and audit artifacts with explicit paths, never `git add -A`; do not push. Product
mutations must be fully restored. Do not finish while a foreground build is running.
