# Lead disposition — shell main-frame failure gate

Audited product candidate `533bb29b1` and independent audit/tests `49f584040` remain the source of the blind
kill-set. The single `MUST FIX` is closed by replacing the request-less `WebViewListener` error callbacks with a
`BridgeWebViewClient` subclass that preserves Capacitor's normal handling and calls the shell unavailable overlay
only when `WebResourceRequest.isForMainFrame()` is true. Subresource HTTP/network errors therefore cannot cover a
working page; main-document failures retain Retry to the compile-time start URL.

Validation on the corrected tree, under the shared host test lock:

```text
source /home/dev/.local/share/bcb-android/env.sh
bash apps/mobile-shell/scripts/gradle.sh \
  testTherapygoEnvironmentTestDebugUnitTest testTherapygoProductionDebugUnitTest \
  testTherapystoEnvironmentTestDebugUnitTest testTherapystoProductionDebugUnitTest \
  assembleTherapygoEnvironmentTestDebug assembleTherapygoProductionDebug \
  assembleTherapystoEnvironmentTestDebug assembleTherapystoProductionDebug \
  assembleTherapygoEnvironmentTestRelease assembleTherapygoProductionRelease \
  assembleTherapystoEnvironmentTestRelease assembleTherapystoProductionRelease \
  bundleTherapygoEnvironmentTestRelease bundleTherapygoProductionRelease \
  bundleTherapystoEnvironmentTestRelease bundleTherapystoProductionRelease
BUILD SUCCESSFUL in 1m 16s; 481 actionable tasks: 80 executed, 401 up-to-date.
```

This is the same retained auditor oracle plus every debug/release APK and release AAB variant. No new surface was
created, no auditor test was weakened, and a second blind audit is not required by `AGENTS.md` §24.5.
