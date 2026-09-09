# Blind kill-set — #915 Capacitor shell foundation (candidate `533bb29b1`)

Written before opening any test file (none exist in the candidate: commit message states "No tests added or
changed"). Source: launcher brief (authority: `AGENTS.md` §10a/§10b/§24.4-§24.5, MASTER_PLAN M2-01…M2-08/M7).

## Given kill-set (verbatim from brief, numbered)

1. Exact trusted HTTPS origin is internal; `http`, non-default port, sibling/cross-brand, TEST↔production,
   suffix/subdomain tricks and `https://trusted@evil` never become privileged internal.
2. `javascript`, `intent`, `file`, `content`, `data`, unknown/malformed/null/local-error URLs are
   consumed/rejected with neither WebView load nor ACTION_VIEW. Only `mailto`, `tel` and ordinary nontrusted
   HTTP(S) dispatch externally.
3. The actual Capacitor WebViewClient hook uses the one policy: internal lets WebView continue; external emits
   exactly one system intent and WebView does not load; rejected emits neither.
4. `TrustedOriginGate` permits runtime-info only for the current exact trusted WebView origin; missing,
   `about:blank`, local error or untrusted current URL yields typed denial and no data/capability.
5. Therapy Go/Therapysto × test/production expose the correct runtime kind, application identity, origin/path
   and TEST suffix isolation; not-yet-built Jitsi/media/push capabilities stay false.
6. WebView-history Back returns to the prior page, root Back exits/backgrounds; main-frame failure exposes a
   recoverable shell state and retry returns to the compile-time start URL without offline-data claims.
7. A canary URL containing query/fragment secrets never appears in shell logs; release artifacts contain no
   cookie/Jitsi/push/presign/signing material.

## Exact assertion per fault class (filled before fault injection)

| # | Fault | Class under test | Exact assertion expected to fail |
|---|---|---|---|
| 1a | accept suffix host (`therapygo.ru.evil.com`, `eviltherapygo.ru`) as trusted | `TrustedOriginGate.isTrusted` | host-suffix candidate must return `false` |
| 1b | ignore non-default port (`https://therapygo.ru:8443/...`) | `TrustedOriginGate.isTrusted` | must return `false` |
| 1c | classify `http://therapygo.ru` as trusted | `TrustedOriginGate.isTrusted` | must return `false` |
| 1d | cross-brand (`therapysto.ru` trusted inside a `therapygo` build) | `TrustedOriginGate.isTrusted` | must return `false` |
| 1e | TEST↔production cross (`test.therapygo.ru` trusted inside `production` build, or vice versa) | `TrustedOriginGate.isTrusted` | must return `false` |
| 1f | `https://therapygo.ru@evil.example/` (userinfo trick) | `TrustedOriginGate.isTrusted` | must return `false` |
| 2a | `javascript:alert(1)` reaches WebView load or `ACTION_VIEW` | `NavigationPolicyPlugin.shouldOverrideLoad` | must return `true` (block) and dispatch no intent |
| 2b | `intent://...#Intent;...end` reaches WebView load or dispatch | `NavigationPolicyPlugin.shouldOverrideLoad` | must return `true`, no intent |
| 2c | `file:///etc/hosts` reaches WebView load or dispatch | `NavigationPolicyPlugin.shouldOverrideLoad` | must return `true`, no intent |
| 2d | `content://…` reaches WebView load or dispatch | `NavigationPolicyPlugin.shouldOverrideLoad` | must return `true`, no intent |
| 2e | malformed/null URL crashes or is treated as trusted | `NavigationPolicyPlugin.shouldOverrideLoad` | `null` input must return `true`, no throw |
| 2f | ordinary untrusted `https://example.com/` fails to leave the app | `NavigationPolicyPlugin.shouldOverrideLoad` | must return `true` **and** dispatch exactly one `ACTION_VIEW` intent |
| 2g | `mailto:`/`tel:` blocked instead of dispatched | `NavigationPolicyPlugin.shouldOverrideLoad` | must dispatch `ACTION_VIEW` and return `true` |
| 3 | trusted origin blocked from loading in WebView | `NavigationPolicyPlugin.shouldOverrideLoad` | trusted URL must return `false`, no intent |
| 4a | `ShellRuntimePlugin.getRuntimeInfo` resolves when current WebView URL is untrusted/foreign | `ShellRuntimePlugin` via `TrustedOriginGate.isTrusted(WebView)` | call must reject, not resolve |
| 4b | `about:blank`/`null` current URL resolves runtime-info | same | call must reject |
| 6a | `canGoBack()==true` but Back exits the app instead of navigating history | `MainActivity` back handling | must call `goBack()`, not `finish()` |
| 6b | sub-resource (non-main-frame) network/HTTP error flips the shell into the unavailable overlay | `MainActivity.ShellWebViewListener` × `BridgeWebViewClient` | see finding below — **this class cannot be killed by a product-level fix at the `WebViewListener` layer**, evidence is by source inspection, not a new permanent test (§10a ladder: cost of the harness needed to fabricate a Robolectric `WebResourceRequest`/`WebResourceError` pair with `isForMainFrame()==false` and drive it through the real `BridgeWebViewClient` outweighs the value versus reading the already-committed framework source once) |

## Additional class found during authority + source reading (before any test opened)

- **8.** `onReceivedError`/`onReceivedHttpError` on `WebViewListener` are framework hooks Capacitor invokes
  unconditionally for *every* resource load (main frame or not) — see
  `@capacitor/android` `BridgeWebViewClient.java` lines 44-59 and 74-89: `listener.onReceivedError(view)` /
  `listener.onReceivedHttpError(view)` run before the `request.isForMainFrame()` guard that gates the
  framework's own internal error-page redirect. The candidate's `ShellWebViewListener` (`MainActivity.java`)
  has no way to inspect `request`/`isForMainFrame()` at all — the override signature Capacitor exposes to a
  `WebViewListener` only carries `WebView`. This is a source/API-shape fact, not a coverage gap a new test
  fixes; recorded as a MUST FIX candidate against M2-04, verified by reading the already-built framework
  sources under `node_modules/@capacitor/android`, not by fault injection into product code.

## Classification (§24.4 test-or-look)

- `TrustedOriginGate` decisions, `NavigationPolicyPlugin` scheme/origin decisions, `ShellRuntimePlugin` gate —
  **repeatable behavior** → acceptance tests + fault injection (below).
- Manifest/Gradle/resource wiring, artifact contents, signing state, main-frame-only error-state contract —
  **one-time action / structural fact** → read final state with Android tooling (manifest dump, `aapt`,
  unzip/list of APK/AAB, `rg`/AST on framework + product source), no permanent test.
