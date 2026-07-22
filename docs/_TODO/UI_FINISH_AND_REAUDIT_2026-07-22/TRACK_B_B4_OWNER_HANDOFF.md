# Track B B4 — personal Staff PWA / Web Push handoff

**Status: UNVERIFIED.** This document records the bounded code handoff only. It does not prove TEST runtime,
email-OTP setup, VAPID configuration, browser permission, delivery, or owner acceptance. Track B remains open until
the live TEST proof below is captured.

## Scope delivered by B4

- An authenticated global admin can open the personal install page at `/app/doctor/install` without a clinic
  membership.
- The global admin can read, create, and remove **only that session user's** staff web-push subscription through
  `/api/doctor/web-push/status`, `/subscribe`, and `/unsubscribe`.
- The access exception is limited to this install page and these three self-service push endpoints. It does not grant
  `/app/account`, other `/api/doctor/*` routes, clinical workspace access, organization management, or membership
  resolution.

## Owner TEST steps — UNVERIFIED

1. Complete the separate Track B email-OTP/global-admin login setup, then sign in on TEST as the owner global-admin
   account.
2. Open `https://<TEST-host>/app/doctor/install`.
3. Install from the browser menu (or use the iOS/macOS instructions shown there), open the new app shortcut, and
   accept the notification permission when the install page offers Push.
4. Confirm the page shows Push enabled. Disable and re-enable it once to prove unsubscribe and subscribe work for
   the same account.
5. Trigger one non-clinical staff notification assigned to this owner account and verify the received notification
   opens the intended staff destination. Do not use patient data for this proof.

## Required TEST evidence before this can change from UNVERIFIED

- Timestamped owner/global-admin identity and the install-page screenshot.
- `status → subscribe → status → unsubscribe → status` evidence for the same platform user, with no user id supplied
  by the browser request.
- Browser/PWA permission outcome and a received test notification.
- Confirmation that a direct clinical doctor URL and an unrelated `/api/doctor/*` endpoint remain forbidden for the
  same global-admin session.

**NOT DONE:** TEST live proof and owner acceptance are intentionally outside this B4 code slice.
