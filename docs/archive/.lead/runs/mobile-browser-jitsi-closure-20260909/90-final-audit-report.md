# #915 browser/PWA + Jitsi closure

Date: 2026-09-09. Exact committed candidate: `2dc5d4196d1f2c5dc2db117fa256080219501f96`.

One isolated live browser view only. Production code, tests, plan and taskdb were unchanged. Candidate runtime was `http://staff.localhost:5211` / `http://patient.localhost:5211`; Chromium ran headed under Xvfb at `390x844`, with synthetic media only. No upload was selected or completed, no fixture/data was created, no OTP/cookie/secret was read or printed, and no provider delivery, TEST or PROD resource was used.

## Binary result

| M7-03 point | Verdict | Observable evidence |
| --- | --- | --- |
| Existing TherapyGo/Therapysto install metadata and platform-admin exclusion | **PASS (reused)** | `git diff --name-status f87fac14fe5d1d371e78c52d2e0ca9307fe8eb64..HEAD -- apps/webapp/src/shared/lib/pwa apps/webapp/src/shared/lib/surface apps/webapp/src/config/productSurfaceNames.ts apps/webapp/src/app/app/patient/install apps/webapp/src/app/app/doctor/install apps/webapp/public` had no output. r5’s live metadata evidence therefore remains exact for these unchanged production paths. |
| Branded patient M1-04 | **BLOCKED** | No branded DEV host/data was created. The current `MASTER_PLAN.md` M1-04 records the accepted named-DEV absence evidence for both `org_custom_domain_bindings` and `clinic_public_directory_entries`; no browser claim is fabricated. |
| Patient camera/gallery/document browser chooser and cancellation | **BLOCKED** | The required ordinary patient flow is passwordless OTP, while this brief forbids reading or printing OTP/cookies and provider delivery. No OTP was requested or extracted, so no authenticated patient chooser claim is made. |
| Doctor CMS camera/files chooser and cancellation | **PASS** | Ordinary doctor email/password login, then visible CMS clicks. Playwright `filechooser` observed `Снять фото/видео` → `accept=image/*,video/*`, `capture=environment`, non-multiple; and `Выбрать из файлов` → the image/video/audio/document MIME list, no `capture`, multiple. Both chooser selections were cleared with `setFiles([])`; observed requests were only CMS GET reads, with no upload POST. |
| Browser Jitsi first external script failure and retry | **PASS** | One-time Playwright route abort for `external_api.js` after visible `Начать звонок` produced visible `Повторить`; the user click on that retry mounted exactly one iframe at `meet.test.therapysto.ru`. No coordinator/SDK/direct callback was invoked. |
| Mobile internal Next transition, same render-session/iframe, return indicator and second-start refusal | **FAIL — reachable product finding** | After the real mobile iframe mounted, the visible `Карта` internal Next button was visible/enabled but every real Playwright click was intercepted by the fullscreen Jitsi iframe (`fixed inset-0 z-50`). Thus the required internal navigation is unreachable while the call is active; same-session preservation, return URL/indicator and second-start refusal cannot pass. This is a product defect, not an instrumentation limitation. No product fix was attempted. |
| Explicit terminal end, indicator clear, exactly one terminal callback | **BLOCKED after finding** | The failure above stopped the acceptance path. A separate bounded 150-second ordinary start/end pass did not re-mount its iframe, so no terminal callback or cleared-indicator result is claimed. |
| Desktop no new floating UI/current layout | **BLOCKED after finding** | Not claimed: the reachable mobile lifecycle failure stopped the live acceptance before a meaningful desktop active-call comparison. |

## Commands and runtime facts

```bash
pnpm install --frozen-lockfile
pnpm --dir packages/operator-db-schema run build
pnpm --dir packages/db-principal run build
pnpm --dir packages/shared-contracts run build
pnpm --dir packages/error-tracking run build
pnpm --dir packages/platform-merge run build

cd apps/webapp
# DEV environment loaded into process without displaying values
APP_BASE_URL=http://staff.localhost:5211 \
PATIENT_APP_ORIGIN=http://patient.localhost:5211 \
TELEGRAM_BOT_TOKEN=dev-no-delivery-placeholder \
npx --no-install next dev -H 127.0.0.1 -p 5211

xvfb-run -a node  # headed Chromium / Playwright, 390x844
```

The dedicated candidate listener was stopped. Its temporary Next logs, browser profiles, cookies and generated response artifacts were moved to trash; `ss -ltnp '( sport = :5211 )'` returned no listener. Shared ports `5200`, `4200`, `6200`, and `3200` were untouched.

M7-03 remains open. The mobile fullscreen iframe intercepting the ordinary internal `Карта` click is a separate-worker finding.

убито 0 / непойманных 0
