# #915 NativeJitsi lifecycle continuation — retained blind kill-set

Candidate: `770b5e750` (`fix(mobile): close native Jitsi launch ownership #915`), continuing the original blind kill-set in `.lead/runs/mobile-web-native-jitsi-audit-20260909/00-blind-killset.md`. This file does not create a second list.

| Retained class | Continuation check |
| --- | --- |
| Browser/PWA fallback and trusted capability gate | Missing, malformed, rejecting, or id-mismatched native results remove ownership/listener and retain the ordinary iframe renderer. |
| One authorized three-caller seam | Exact endpoint, room reference, and token pass unchanged through the provider-neutral stage; no second product path or fetch. |
| Terminal mapping | `joined`, error, and termination preserve existing diagnostics/hangup with one terminal callback. |
| Session ownership (original item 4) | Same-room retry and ordinary replacement serialize launches. A late `CONFERENCE_TERMINATED`/`READY_TO_CLOSE` or destruction from A cannot be emitted as or terminate B; unmount while start/permission is pending cancels only that id. |
| Specialist / isolation | Native runtime neither forges role, organization, room, nor endpoint; specialist hangup remains the existing callback and browser/PWA stays iframe. |

Fault-injection record is completed in `90-final-audit-report.md`; no product mutation is retained by this audit.
