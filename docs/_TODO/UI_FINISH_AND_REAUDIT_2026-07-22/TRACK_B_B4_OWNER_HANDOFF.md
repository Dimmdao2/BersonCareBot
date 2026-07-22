# Track B B4 — personal Staff PWA / Web Push handoff

**Status: UNVERIFIED.** This document records the bounded code handoff only. It does not prove TEST runtime,
email-OTP setup, VAPID configuration, browser permission, delivery, or owner acceptance. Track B remains open until
the live TEST proof below is captured.

## Code and contract-test evidence delivered by B4

- Contract tests exercise the real session-resolution service path from a verified-email global-admin test identity
  through the narrow install/status guards. The status path installs the exact `app_patient` identity-self principal
  and calls only the public-key VAPID accessor; the private VAPID-key path is not part of that contract.
- The tested code limits staff web-push status, subscribe, and unsubscribe to the authenticated session user's own
  platform-user id. A patient session is denied; an ordinary doctor is redirected from `/app/doctor/install` to
  `/app/account?tab=install`.
- The exception is limited in code to the install page and the three self-service push endpoints. The contract test
  also confirms that the same global-admin session is denied by the general doctor API guard; it does not establish
  clinical workspace, organization-management, or broad doctor-API privilege.

These are code and automated contract-test facts only. They are not evidence that a TEST browser can load the page,
install a PWA, obtain permission, register a subscription, or receive a notification.

## Owner TEST steps — UNVERIFIED / NOT DONE

1. Complete the separate Track B email-OTP/global-admin login setup, then sign in on TEST as the owner global-admin
   account.
2. Open `https://<TEST-host>/app/doctor/install`.
3. Install from the browser menu (or use the iOS/macOS instructions shown there), open the new app shortcut, and
   accept the notification permission when the install page offers Push.
4. Confirm the page shows Push enabled. Disable and re-enable it once to prove unsubscribe and subscribe work for
   the same account.
5. Trigger one non-clinical staff notification assigned to this owner account and verify the received notification
   opens the intended staff destination. Do not use patient data for this proof.

## Required live TEST/browser evidence before this can change from UNVERIFIED

- Timestamped owner/global-admin identity and the install-page screenshot.
- `status → subscribe → status → unsubscribe → status` evidence for the same platform user, with no user id supplied
  by the browser request.
- Browser/PWA permission outcome and a received test notification.
- Confirmation that a direct clinical doctor URL and an unrelated `/api/doctor/*` endpoint remain forbidden for the
  same global-admin session.

**NOT DONE:** All live TEST, PWA-install, browser-permission, subscription, notification-delivery, and owner-acceptance
evidence remains intentionally unverified and outside this B4 code slice.
