# #915 final Browser/PWA M7-03 browser audit

Date: 2026-09-09. Exact committed candidate: `ebe361b7f1433818249be033d2856324c285184a`.

Production code, tests, plan and taskdb were read-only. The sole change is this report. No fixture/data was created, no file was selected or uploaded, no provider request was deliberately sent, and no OTP, cookie value, or secret is reproduced here.

## Runtime and method

- Isolated candidate listener: `127.0.0.1:5210` (first Turbopack, then webpack; neither touched `5200`, `4200`, `6200`, or `3200`).
- Browser: headed system Chromium under Xvfb, mobile `390 × 844`, touch/mobile context, synthetic camera/microphone flags only. A desktop context was not started because the mandatory mobile active-call path did not become reachable.
- Ordinary doctor password flow was used. Its visible UI submission returned `200`, installed the three normal session cookies (names only inspected), and reached visible `/app/doctor`; its visible navigation included `Клиенты`, `Файлы`, and `Контент`.
- After later isolated-server restarts, the first authenticated page compile did not return inside repeated bounded browser/HTTP waits (60 seconds in the persistent browser session; repeated 5-second HTTP attempts in webpack mode). This blocked the remaining visible interactions. This is runtime evidence only, not a product finding: the same candidate listener was stopped before exit.

## Binary result

| M7-03 point | Verdict | Observable evidence |
| --- | --- | --- |
| Existing install metadata on both surfaces | **PASS (reused)** | `git diff --name-status 6cbcc8cbb6c471d52aee669c9024cd62ca089301..HEAD -- apps/webapp/src/shared/lib/pwa apps/webapp/src/shared/lib/surface apps/webapp/src/config/productSurfaceNames.ts apps/webapp/src/app/app/patient/install apps/webapp/src/app/app/doctor/install apps/webapp/public` produced no output. The accepted install proof is unchanged and was not repeated. |
| Patient camera/gallery/document chooser, OS destination, empty-choice cancellation | **BLOCKED** | The ordinary patient OTP screen was not reached before the candidate listener became unresponsive. No OTP was requested, read, printed, or used; no chooser assertion is fabricated. |
| Doctor/CMS file chooser, OS destination, empty-choice cancellation | **BLOCKED** | Doctor ordinary login and visible doctor home succeeded, but the subsequent required visible navigation could not complete after the isolated runtime stalled. No `filechooser`, `DeviceMedia`, selection, or upload was invoked. |
| One-time `external_api.js` failure, visible retry, exactly one self-hosted iframe | **BLOCKED** | The ordinary start-call surface could not be reached from the authenticated UI during the bounded live session; no route callback, API call, or synthetic terminal event substituted for it. |
| Mobile global navigation preserves same iframe/session, compact indicator, exact return URL, second normal start refused | **BLOCKED** | Depends on the unreachable mounted iframe. No claim is made from source inspection or a direct navigation. |
| Visible explicit Jitsi end clears indicator/call exactly once | **BLOCKED** | Depends on the unreachable mounted iframe. No direct callback or terminal-event synthesis was used. |
| Desktop keeps current layout with no new floating UI | **BLOCKED** | This is an active-call comparison and was not asserted without a successful mobile live session. |

No reachable violation of an owner requirement was demonstrated, therefore this audit records **no product finding**. M7-03 remains open: the required chooser and post-iframe live path has not been accepted.

## Commands and cleanup

```bash
pnpm install --frozen-lockfile
pnpm --dir packages/operator-db-schema run build
pnpm --dir packages/db-principal run build
pnpm --dir packages/shared-contracts run build
pnpm --dir packages/error-tracking run build
pnpm --dir packages/platform-merge run build

# DEV values were loaded into the isolated process without displaying them.
cd apps/webapp
npx --no-install next dev -H 127.0.0.1 -p 5210
npx --no-install next dev --webpack -H 127.0.0.1 -p 5210

# Headed Chromium/Xvfb: normal visible clicks only.
```

Both `:5210` listeners were stopped; `ss -ltnp | rg ':5210\\b'` had no output after cleanup. Temporary browser process groups were terminated. The temporary browser profile/cookies and local Next log extracts were removed from the current audit scope; no screenshot or response artifact was retained.

`убито 0 / непойманных 0`
