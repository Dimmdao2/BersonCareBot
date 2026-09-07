# C3M-09 communications slice — independent behavior/static audit

- Taskdb: `#1098`
- Candidate: `5283a3ff3`
- Scope: `apps/webapp/**`, `apps/integrator/**`, `deploy/postgres/**`
- Authority: `IMPLEMENTATION_ROADMAP.md` C3M, especially C3M-09 and C3M.8
- Explicitly deferred: responsive live UI; named-DEV rollback-only migration preflight

## Blind kill-set (written before reading existing tests)

Each item names a costly, silent failure that must be caught by a public behavior test unless marked inspection.

1. **Policy precedence / `on_support`:** an explicit client `allow` or `deny` is ignored in favor of the organization default; an inherited `on_support` channel fails to follow the client's current `onSupport`; parent OFF mutates or erases stored child/client choices instead of only making them effective-OFF.
2. **Chat route/action bypasses:** with `direct_chat=OFF` or client policy denied, any real ensure/read/write path still creates or returns a chat, sends a message, returns snapshot/history, exposes unread count, creates a payment link in chat, or schedules/sends a chat notification.
3. **Comments bypasses and parent dependency:** with `program_comments=OFF`, client deny, `client_portal=OFF`, or `rehabilitation=OFF`, any doctor/patient read or write path still lists, creates, or changes a program comment, or emits a comment badge/feed/notification.
4. **Program-media bypasses and parent dependency:** with `program_media=OFF`, comments/client portal/rehabilitation parent OFF, or client deny, any upload/read/write/control path still accepts or exposes patient program media or emits its notification.
5. **Hidden work:** a disabled child still leaves a Communications tab, default-tab target, shell/page preload, overview/card widget, unread badge, feed, poller, or notification running; when no child is effective the Communications entry/page remains, and when at least one child remains the first available tab is not selected without loading hidden tabs.
6. **Mailing independence:** `mailings` incorrectly depends on chat/support/client policy, or chat/comments/media OFF hides/denies mailing create/history surfaces that remain available; conversely `mailings=OFF` leaves its tab or read/write routes/actions usable.
7. **Queued-delivery denial:** broadcast work accepted while `mailings=ON` is still delivered after the organization turns `mailings=OFF`; the delivery-time gate fails open when policy/settings resolution errors; some real runtime caller bypasses the central delivery-time decision.
8. **Signed integrator status boundary:** the webapp-to-integrator status endpoint accepts an unsigned/invalidly signed request, returns another organization's policy, or lets organization A's status authorize delivery for organization B.
9. **Tenant isolation:** organization A can read/write/ensure chat, comments, media, mailing state/work, unread/snapshot/payment-link/notification data for organization B through a reused patient/thread/job identifier.
10. **Preservation / re-enable:** OFF performs data mutation; OFF→ON does not restore the same existing chat/messages, comments/media, queued/history mailing records, or saved per-client/child choices.
11. **Two-organization independence:** changing workspace/default/client policy in organization A changes effective communications behavior or stored choices in organization B for the same globally identified patient/specialist.
12. **Static-only migration and architecture checks:** inspect statement ownership, ambiguity-safe backfill, no privilege mutation in migrations, declaration/generated parity, and exactly one resolver/guard architecture with every runtime caller routed through it. Do not create tests over source/SQL wording for these facts.

## Evidence and verdict

Pending inspection, fault injection, and targeted validation.
