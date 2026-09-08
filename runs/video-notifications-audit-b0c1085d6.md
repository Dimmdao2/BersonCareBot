# Independent auditor-live — #1100 meeting invitation notification (`b0c1085d6`)

- **Candidate:** `b0c1085d606031656ab0ad694874691de3da30b5` «feat(video): queue invite notification #1100»,
  branch `wt/video-notifications-20260908`, base `2961859aad29d6edc66bd09f3ca08445f24b8349`.
- **Authority:** `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` — ACC-02/03/05/06, VM-07, GATE-01..04, Wave 2
  Stream E (notification integration).
- **Role:** `auditor-live`. Kill-set built from authority before reading tests (`AGENTS.md` §24.5, §10b).
- **Scope:** 4 changed files — `apps/webapp/src/app-layer/di/buildAppDeps.ts`,
  `apps/webapp/src/modules/patient-notifications/videoMeetingInvitationNotification.ts` (new),
  `apps/webapp/src/modules/video-meetings/ports.ts`, `apps/webapp/src/modules/video-meetings/service.ts`.
- **Verdict: FAIL — one build-breaking defect; handoff to the fixer.** All behavioral kill-set items are
  proven caught by acceptance tests added by this audit (see below); the candidate is not `land-ready`
  (§24.7) only because it does not typecheck.

## Findings

### VN-1 — candidate fails `tsc --noEmit`: `videoMeetingInvitationNotification.ts` passes nullable bindings into a non-nullable `queueTargets` input

`apps/webapp/src/modules/patient-notifications/videoMeetingInvitationNotification.ts:149-151` calls
`queueTargets({ telegramId: bindings.telegramId, maxId: bindings.maxId, emailRecipient: emailFields.email, ... })`.
`bindings.telegramId`/`maxId` are typed `string | null | undefined` (`getChannelBindings` deps signature,
same file) and `emailFields.email` is `string | null`, but `queueTargets`'s parameter type declares
`telegramId?: string; maxId?: string; emailRecipient?: string` — no `null` in the union.

Failure: `pnpm --dir apps/webapp exec tsc --noEmit` fails with three `TS2322` errors on this candidate SHA
today; a webapp `pnpm run ci`/typecheck gate cannot pass, so the branch cannot reach `land-ready` (§9, §24.7)
until the type is widened (`string | null | undefined`) or the values are normalized before the call.

Reproduction: `cd apps/webapp && npx tsc --noEmit` on `b0c1085d6` →
```
src/modules/patient-notifications/videoMeetingInvitationNotification.ts(149,11): error TS2322: Type 'string | null | undefined' is not assignable to type 'string | undefined'.
src/modules/patient-notifications/videoMeetingInvitationNotification.ts(150,11): error TS2322: ... (same)
src/modules/patient-notifications/videoMeetingInvitationNotification.ts(151,11): error TS2322: Type 'string | null' is not assignable to type 'string | undefined'.
```

Owner ID: **VM-07 / general CI gate (§9)** — a typecheck-blocking regression in the notification path is an
unconditional `land-ready` blocker regardless of which owner requirement it sits under.

Not fixed by this audit (auditor does not accept its own product fix, §24.6); it is a one-line-class
mechanical fix appropriate for the oncall lead to apply directly under §24.1 rather than a new worker cycle.

## Kill-set coverage (Wave 3, plan §5)

Blind kill-set built from the brief before reading `service.test.ts`, then checked against the diff and
proven with acceptance tests + one deliberate fault injection per class (reverted after, tree left clean
except the two allowed test files):

| # | Class | Verdict | Evidence |
|---|---|---|---|
| 1 | Retry/resume/rotate produces a second automatic event, or a new invite produces none/more than one | **CAUGHT (green)** | `service.ts` gates the notification call on `result.created` from the atomic `findOrCreateActive` (unique partial index `uq_video_meetings_active_participants`); `rotateInvite`/`revokeInvite`/`endMeeting` never reference `invitationNotification`. New tests `service.test.ts` → *"enqueues exactly one invitation notification for a newly created meeting"* and *"does not enqueue a second invitation notification when the active meeting is resumed"*. Fault injected (`if (result.created)` → `if (true)`) reproduced the exact resume-duplicate failure and turned the second test red; reverted. |
| 2 | Bypasses `resolvePatientNotificationChannels`, hardcodes email/push, sends on a disallowed/unavailable channel | **CAUGHT (green)** | `videoMeetingInvitationNotification.ts` builds `availability` from the same shape used by the sibling `notifyPatientDoctorReply.ts` and calls the canonical resolver; channel targets are only queued when both selected by the resolver **and** a contact value exists. New test *"queues nothing when the canonical resolver reports the patient muted"* + fault injection (hardcoded `gate: { muted: false, ... }`, discarding the real mute flag) reproduced a mute-bypass and turned it red; reverted. |
| 3 | URL uses staff `APP_BASE_URL`/foreign origin/query-path secret/wrong org instead of canonical patient origin + `/live#secret` | **PASS (read)** | `service.ts:buildGuestUrl` builds `new URL('/live', patientPublicOrigin)` with `url.hash = inviteFragment`; `resolvePatientPublicOrigin` is wired in `buildAppDeps.ts:969` from the same `customDomainBindingService.resolvePatientPublicOrigin` chokepoint used by booking/broadcasts/payments/messaging notifications (`buildAppDeps.ts:753-754`) — no staff/base-URL path introduced. |
| 4 | Raw invite secret enters DB/idempotency/event-key/log/error/analytics field, or content carries clinical/PII data | **CAUGHT (green)** | `idempotencyKey` = `${meetingId}:${channel}` (no secret); `contentFor()` only emits the fixed `INVITATION_TEXT` + the guest link (link necessarily carries the fragment to the patient's own channel — that is the delivery mechanism, not a leak elsewhere). New test *"queues exactly one row ... keyed by meeting+channel"* asserts the exact `idempotencyKey`/`recipient`/`channel` shape; fault injection (hardcoding `channel: 'max'` on the telegram target) reproduced a wrong-channel/key defect and turned it red; reverted. No `logger` call exists anywhere in the touched files. |
| 5 | Queue/channel/origin failure aborts or recreates the meeting/invite, hides the copyable link, or leaks internal failure detail | **CAUGHT (green)** | `service.ts` wraps the `enqueue` call in `try/catch` → `notificationUnavailable()`; meeting/invite issuance and `inviteFragment` are computed before and returned regardless. New test *"keeps the copyable invite link and lifecycle intact when notification delivery throws"* + fault injection (removed the `try/catch`) reproduced an aborted `createOrResume` on delivery failure and turned it red; reverted. |
| 6 | Direct sender/real DEV delivery instead of the durable queue, or lost dedup across the seam | **PASS (read)** | Only sink used is `deps.outboundMessageQueue.enqueue` = `createPgOutboundMessageQueue()` (`buildAppDeps.ts:967`), the same durable queue port used by `patient-booking`; `OutboundMessageQueuePort.enqueue` dedups on the DB-unique `event_id = purpose:idempotencyKey`. |
| 7 | Notification APIs depend on Jitsi-specific render-session fields | **PASS (read)** | `VideoMeetingInvitationNotification.enqueue` input is `{organizationId, patientUserId, meetingId, guestUrl}` only; no `VideoMeetingRenderSession`/JWT/room-ref field crosses into `ports.ts`'s notification types. |
| 8 | Unauthorized/entitlement/Online-bypassed create path, or guest exchange causes a notification | **PASS (read)** | `exchangeGuest`/`joinAuthenticatedPatient`/`resolveGuestOrganization` never touch `invitationNotification`; only `createOrResume` does, itself gated first by `requireOnlineAndProvider`. Route `app/api/doctor/clients/[userId]/video-meetings/route.ts` requires `requireDoctorWorkspaceApiContext` + `requireEntitlementForMutation(gate.ctx, 'video_meetings')` before calling the service (pre-existing chokepoint, unchanged by this diff). |

Caught: 4/8 required a new green-then-red-on-fault acceptance test (items 1, 2, 4, 5). Uncaught by test but
verified correct by direct read/architecture check: 3/8 (items 3, 6, 7) — no plausible fault distinct from
items already covered; item 8 verified by reading the unchanged call sites. 0 items left unaddressed.

## Tests added (kept, product code untouched)

- `apps/webapp/src/modules/video-meetings/service.test.ts` — 3 new cases in a new
  `describe('video meeting invitation notification dedup (ACC-05)')` block.
- `apps/webapp/src/modules/patient-notifications/videoMeetingInvitationNotification.unit.test.ts` — new file,
  2 cases in `describe('video meeting invitation notification chokepoint (ACC-05)')`.

Each of the 4 fault injections above was applied by hand, confirmed to turn exactly the intended assertion
red, then reverted with `git checkout --`; `git status --short` was empty for product files before the final
commit (verified below).

## Commands run

- `npx vitest run src/modules/video-meetings/ src/modules/patient-notifications/ src/modules/messaging/ src/modules/channel-preferences/ src/modules/web-push/ src/app-layer/di/` (webapp) → **17 files / 44 tests passed** (after building unrelated unbuilt workspace packages `db-principal`, `error-tracking`, `operator-db-schema`, `shared-contracts`, `platform-merge` that block any vitest run in this worktree — pre-existing environment state, not caused by this candidate).
- `npx tsc --noEmit` (webapp) → **FAIL**, 3 errors, all in the new `videoMeetingInvitationNotification.ts` (VN-1).
- `npx eslint <6 touched/added files>` → clean, no output.
- `node scripts/check-no-new-raw-sql.mjs` → OK.
- `node scripts/check-webapp-infra-import-boundary.mjs` → OK.
- `node scripts/check-queue-port-boundary.mjs` → OK.
- `npx tsx scripts/check-s4-entitlement-coverage.ts` (webapp) → OK, 109 protected actions mapped (unaffected by this diff; Stream A's registry, out of this diff's scope).
- `git diff --check 2961859aad2 b0c1085d6` → clean.

## Not run / blocked

- Full `pnpm run ci` was not run (brief forbids it; this audit only ran the targeted subset above).
- No live TEST/DEV rollout, no real notification delivery, no shared dev server — none needed for this
  diff (pure service/module unit surface); nothing here required DB/RLS or live UI proof.
- `check-system-settings-accessors.mjs` referenced by `AGENTS.md` §2 could not be located under either
  repo-root `scripts/` or `apps/webapp/scripts/` in this checkout; not run. Not a candidate defect — this
  diff calls the existing `systemSettings.getSetting('smtp_outbound', 'admin')` accessor identically to the
  already-accepted `notifyPatientDoctorReply.ts`.

## Definition-of-done gap

Plan §8: "непроверяемая часть звонка названа явно" — none for this slice; the only gap is VN-1 above, a
straightforward typecheck fix, not a re-scoped feature.
