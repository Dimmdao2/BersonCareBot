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

## TEST configuration preflight — 2026-07-23 MSK

The bullets below record the initial preflight snapshot. A later owner-authorized TEST action restored a complete
`smtp_outbound` object from existing platform settings into both canonical/mirror rows without printing any field
values. The subsequent OTP attempt still returned 503 because the locked integrator API base-login correctly lacked
ambient `SELECT` on restricted settings; the old SMTP reader incorrectly depended on that forbidden access.

- The TEST database is still the existing `bersoncarebot_test`; no reset, restore or PROD read was used.
- The one active owner principal was found, but it is not email-verified. A TEST-only owner-authorized mirrored
  transaction set the DB-backed global-admin allowlist to `dimmdao@gmail.com` in `public.system_settings` and
  `integrator.system_settings`; the server runtime projection resolves the same value.
- At the time of the initial snapshot, no complete `smtp_outbound` setting existed in TEST or DEV. No OTP was sent
  and `email_verified_at` was not changed manually.
- A follow-up source check used the canonical six-field contract (`host`, `port`, `secure`, `user`, `password`,
  `from`) and printed only field-presence booleans. Both TEST mirror rows have a non-object/null value. The DEV
  mirror rows are objects but all six required fields are absent. TEST `system_settings_audit` contains no prior
  `smtp_outbound` value that can be restored, and the TEST integrator legacy `SMTP_*` / `MAIL_FROM` fallback is
  empty. Therefore there is no existing TEST/DEV platform SMTP configuration available to copy; no PROD env or
  PROD database was read.
- TEST already had a complete DB-backed `web_push_vapid` public setting, but its integrator mirror differed. A
  TEST-only owner-authorized transaction copied the existing public row into the integrator mirror without printing
  key values; the exact mirror check passed.
- `manifest-staff.webmanifest` and `sw.js` both return HTTP 200 with the expected content types on TEST.
- The owner currently has zero push subscriptions. No notification was sent.

## SMTP/OTP restricted-reader code handoff — 2026-07-23 MSK

- Migration `0235_integrator_smtp_restricted_accessor` adds an argumentless, global-only
  `app.read_integrator_smtp_outbound_setting()` SECURITY DEFINER capability. It can return only the exact
  `smtp_outbound`/`admin`/global row.
- The TEST deploy overlay grants `EXECUTE` only to the discovered exact integrator API base-login. Direct
  `SELECT` on both settings tables and `current_org_id()` remain revoked; app_staff/app_patient/app_worker cannot
  execute the SMTP capability.
- The delivery resolver uses only this DB capability. Legacy `SMTP_*`/`MAIL_*` env fallback and its exported config
  module were removed. Missing, incomplete, or unreadable DB configuration fails closed as `configured=false`.
- DB exceptions and credential material are not logged. Focused tests cover complete/incomplete/missing/error/cache
  behavior and the real send-email/delivery path; the static checker covers migration, ACL overlay, deploy readiness,
  journal wiring and rejection of direct-table/env fallback regressions.

This remains a code-only handoff until the orchestrator deploys the reviewed commit to TEST. The remaining live
sequence is: successful email OTP to `dimmdao@gmail.com`, fresh DB-backed global-admin resolution, owner browser/PWA
install, permission and subscribe/unsubscribe proof, one non-clinical test notification, and the negative
clinical-access checks above.
