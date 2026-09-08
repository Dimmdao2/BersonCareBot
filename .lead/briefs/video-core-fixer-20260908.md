# Same-branch correction brief — #1100 video core

Work in the supplied clean clone and existing `wt/video-core-20260908` branch. This is the one coherent correction
pass after the independent audit of product candidate `e0bac698bcdfab28e551c27c1b30f6a75e8bce11`; retained audit/tests
commit is `1a0f66cc2a871152e83367eddd2b7fb06e52f8c4`. Read the `AGENTS.md` map and the full relevant sections: §1
migration/rights, §§2–5 configuration and Clean Architecture, §§7/9/10, and §24. Authority is
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, Wave 1 stream A and VM-07, ACC-01..04, ACC-06, GATE-01..04. Read
`docs/_TODO/VIDEO_MEETINGS_JITSI_AUDIT_2026-09-08.md` in full. Fix the findings; do not reinterpret the audit as an
optional recommendation.

Workers do not write, edit, rename or delete tests. Preserve the auditor's two acceptance tests exactly and run them
after correction. Do not create a second blind audit or new kill-set. Do not push, land, deploy, execute a migration,
mutate DEV/TEST/PROD, start a shared server, or run full CI. Do not change owner checkboxes.

## Required correction, one pass

1. Fix the candidate-local `buildAppDeps` temporal-dead-zone/typecheck failure. Composition root must initialize the
   system-settings dependency before the Jitsi adapter/service that consumes it.
2. Make provider health fail closed on an actual bounded same-origin Jitsi reachability probe, not merely presence of
   four settings. Timeouts, network/TLS failures and non-success responses return sanitized `provider_unhealthy`;
   no internal URL/error is exposed to a guest. Reuse one provider health path for create and both joins.
3. Expose complete authorized staff lifecycle routes for rotate, revoke and end. Reuse the existing workspace/client/
   specialist guard and `requireEntitlementForMutation`; never authorize solely by organization + meeting ID. The
   store mutation must prove the current specialist owns that meeting. Resume must return a currently usable raw
   fragment (rotate on resume is acceptable); raw secret remains hash-only in DB and never reaches logs/path/query.
4. Expired rows must not remain `status='active'` and block a new meeting. Make `findOrCreateActive` transactional and
   race-safe: an expired active row is terminalized before replacement, concurrent retries still yield one active
   meeting and one active invite, and authenticated/guest join requires a non-expired, non-revoked meeting.
5. Remove Jitsi-specific names/literals (`provider: 'jitsi'`, `conferenceUrl`, `capability`) from the module and route
   API. Define one provider-neutral render/session descriptor whose stable fields can carry this adapter and a future
   PeerJS/native WebRTC adapter without changing pages/access/invite/tariff services. Only the infra adapter may know
   Jitsi JWT claim construction. Keep the later UI renderer selection extensible rather than a Jitsi-only union.
6. Align the Jitsi JWT with the pinned TEST secure-domain contract in `deploy/jitsi/env/jitsi-test.env.example`:
   issuer and audience must be accepted by that exact config, `sub` must represent the configured XMPP deployment
   domain rather than the application ID, token remains room/role/subject/expiry scoped, and the room reference is
   supplied to the renderer without leaking into persistence/logs beyond the existing opaque provider ref. If the
   app registry lacks the XMPP-domain setting needed for `sub`, add it through canonical `system_settings`; do not
   introduce an env secret or expose the signing secret.
7. Close GATE-03 through the existing configurable mechanic/admin/reconcile seam. Do not hardcode a bypass and do not
   grant entitlement in a migration. The repository must have a canonical way for the lead to enable
   `video_meetings` on the owner's existing developer tariff after landing, and the final handoff must name the exact
   command/API/write path. If an existing seed definition represents the developer tariff, extend that definition;
   do not invent a parallel tariff store.
8. Preserve exact privilege declarations/generated parity. If product changes alter a relation/function surface,
   update `declaration.ts` first and regenerate. Migration SQL must contain no access-changing statements. Remove no
   unrelated behavior.

Before adding any helper, inspect whether the existing authorization guard, entitlement chokepoint, lifecycle store,
system-settings service or tariff admin/reconcile path can be parameterized. One common path is mandatory.

## Validation and handoff

Run the retained two audit acceptance tests, protected-action registry coverage, `pnpm webapp:typecheck`, scoped
ESLint, privilege generation `--check`, migration/order/architecture/raw-SQL gates and `git diff --check`. Do not run
the named-DEV migration preflight; the lead already has the green preflight for the unchanged migration and will
rerun it if migration content changes. Commit all product correction with explicit path staging, never `git add -A`.
Commit message must contain `#1100`, why, evidence, plan stage and remaining TEST/external work. End with exact SHA,
changed files, every command/result, retained-test result, four-point DB rights delta, and the exact developer-tariff
enablement path. Do not finish while a foreground command is running.
