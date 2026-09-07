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

See «Final acceptance» below — the first pass left this section open and it is now closed there.

## Final acceptance — candidate `016477803`

Continuation and closure of the first blind pass. The kill set above is reused verbatim; no second kill set
was written and no fault injection already evidenced by `b51bc98d2` was repeated. The one red oracle of that
run (patient-card message snapshot outside the central `direct_chat` classifier) was fixed by the lead in
`016477803` and is re-verified below.

**Verdict: PASS.** No reachable C3M-09 violation remains. Four observations are recorded at the end; none is a
C3M-09 defect and none was turned into work.

### What was run

- targeted webapp suites (7 files, **64 passed**):
  `pnpm --dir apps/webapp exec vitest run src/app-layer/guards/workspaceModuleAccess.rehabilitation.audit.unit.test.ts src/modules/doctor-clients/supportPolicy.c3m09.audit.unit.test.ts src/modules/doctor-clients/organizationScopedSupport.route.test.ts 'src/app/api/doctor/patients/[userId]/messages-snapshot/messagesSnapshot.route.test.ts' src/app/api/integrator/workspace-module-status/workspaceModuleStatus.route.test.ts src/app/app/doctor/broadcasts/actions.entitlement.unit.test.ts src/app/app/doctor/communications/page.workspaceProjection.unit.test.tsx`
- integrator delivery gate (**7 passed**):
  `pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.broadcastAudit.d17.test.ts`
- privilege relation walls (**44 passed**): `node --test deploy/postgres/privileges/relation-access.test.mjs`
- generated/declaration parity (**byte-exact, both databases**): `pnpm run check:db-privileges-generated`
- `pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json` → exit 0
- `pnpm --dir apps/integrator exec tsc --noEmit -p tsconfig.json` → exit 0
- scoped `eslint` over the changed guard/policy/service/communications/integrator-route/dashboard/patient-shell paths → exit 0
- `git diff --check 70eef1ff4 HEAD -- apps/webapp apps/integrator deploy/postgres docs/audit` → exit 0
- named DEV, canonical scripts only:
  `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` → **PASS**, `pending=2 total=137 unapplied=0`, ROLLBACK;
  `bash deploy/host/migrate-dev.sh --execute` → **PASS**, committed, declaration reconciled and catalog-audited.
- live isolated port `127.0.0.1:5301` from this worktree, owner doctor and patient sessions, desktop `1440x900`
  and mobile `390x844 @2x` (real mobile shell; a first capture pass used a mis-nested Playwright viewport option
  and was discarded and redone).

No full CI. No PROD contact. No external message was sent.

### Kill-set verdicts

1. **Policy precedence / `on_support` — PASS.** `supportPolicy.c3m09.audit.unit.test.ts` oracles explicit
   precedence, live `on_support` following, and that a channel disabled by workspace/parent is never recreated.
   Live DEV with the module ON: default `off` → starred client snapshot `200 {"messages":[]}` and global unread
   `0`; default `on_support` → starred client returns conversation `cd4ae753…` and unread `1`, non-starred
   Аминов returns `{"messages":[]}`; default `all` → Аминов returns conversation `f2c81072…`. Parent OFF cannot
   mutate a child choice by construction: `resolveWorkspaceModuleEffective` derives effective values from the
   stored composition and writes nothing, and the stored JSON came back byte-equal after every round.
2. **Chat route/action bypasses — PASS (this was the one red oracle).** Fault injection on the candidate:
   removing the snapshot arm of `workspaceModuleForApiPath` turns the classifier oracle red
   (`expected null to be 'direct_chat'`); file restored byte-identical via `git checkout --`. Live with
   `direct_chat=OFF`: `/api/doctor/messages/unread-count` 403, `/api/doctor/messages/conversations` 403,
   `/api/doctor/patients/<id>/messages-snapshot` **403**, `POST …/conversations/unread-by-patient` 403,
   `POST …/conversations/ensure` 403, `/api/patient/messages` 403, `/app/patient/messages` 404 — all with the
   frozen `{"ok":false,"error":"workspace_module_disabled","module":"direct_chat"}` envelope.
3. **Comments bypasses and parent dependency — PASS.** Live with `program_comments=OFF`:
   `/api/doctor/comments` , `/api/doctor/comments/patients`, `/api/doctor/exercise-comments` and
   `/api/doctor/patients/<id>/program-activity` all 403 `module: program_comments`, while chat stayed `200`.
   Parent dependency is the frozen registry `program_comments: ['rehabilitation','client_portal']`, resolved
   recursively.
4. **Program-media bypasses and parent dependency — PASS.** Isolated live probe with `program_media=OFF` and
   comments/chat ON: `POST …/media-presign` → 403 `module: program_media`, comments `200`, chat `200`.
   Registry declares `program_media: ['program_comments']`, and `isClientChannelAllowed` additionally requires
   `commentsAllowed` before media on the client-policy layer.
5. **Hidden work — PASS.** With `direct_chat=OFF` the Communications page request set loses
   `/api/doctor/messages/unread-count` entirely (present in the baseline set); the «Чаты» tab is absent on
   desktop and mobile; the first available tab («Комментарии») is selected and only its data is fetched.
   With only `mailings` left, «Рассылки» opens as the single tab with no chat/comment request. With all four
   children OFF the page is `404` and the «Коммуникации» entry is gone from the desktop sidebar and from the
   mobile bottom nav (5 items → 4). Patient shell gates the poller itself:
   `usePatientSupportUnreadCount(directChatEnabled)`, with the nav item and header icon filtered.
6. **Mailing independence — PASS.** chat+comments+media OFF with mailings ON leaves Communications present with
   the full «Рассылки» create surface on both viewports and no chat/comment fetch; `mailings=OFF` with the
   others off removes the whole entry. `mailingsMutationAvailable` resolves from the `mailings`/`branding`
   entitlements and never reads chat state.
7. **Queued-delivery denial — PASS.** `outgoingDeliveryWorker.broadcastAudit.d17.test.ts`: mailings disabled at
   delivery time → `dispatchOutgoing` not called and the row dies `workspace_mailings_disabled` under
   `reminder_not_dispatched`; a resolution failure rejects and `dispatchOutgoing` is still not called, so the
   gate fails closed. `processOutgoingDeliveryRow`/`runOutgoingDeliveryWorkerTick` have exactly one real runtime
   caller, `infra/runtime/scheduler/main.ts`, and it wires `resolveWorkspaceModuleEnabled`.
8. **Signed integrator status boundary — PASS.** The route verifies the HMAC signature before parsing anything,
   requires an idempotency key bound to the SHA-256 of the exact raw body, enters a verified integrator
   organization principal for the requested organization, and accepts only the `mailings` literal.
9. **Tenant isolation — PASS by test, not exercised live.** `organizationScopedSupport.route.test.ts` carries the
   negatives; every doctor chat/comment route resolves the subject through
   `getClientIdentityForOrganization(userId, organizationId, ctx)` before any read or write. Named DEV holds a
   single organization, so no live two-organization probe was possible.
10. **Preservation / re-enable — PASS.** The migration adds a nullable boolean with no default and performs no
    backfill; live catalog confirms `attnotnull=false`, `default_expr=null`, so OFF stores nothing and mutates
    nothing. OFF→ON returned the identical conversation set with identical authors, texts and timestamps
    (`Берсон Дмитрий 05.09 · 15:46`) and the same unread badge `1`.
11. **Two-organization independence — PASS by test, not exercised live.** Same limitation as class 9.
12. **Static migration and architecture — PASS.** Declared owners match live execution: the `ALTER TABLE` ran as
    `app_object_owner`, the function replace as `app_seam_settings_runtime_owner` with `can_create_public=f`;
    the live function is `SECURITY DEFINER`, owned by that seam role, and its body carries the new
    `doctor_workspace_client_defaults` key. Neither migration grants or revokes anything. Declaration and both
    generated artifacts are byte-exact. Live column privileges: `app_staff` SELECT/INSERT/UPDATE, `app_patient`
    SELECT only, `app_tenant_service` / `app_worker` / `app_service` none. One resolver: `workspaceModuleForApiPath`
    is the single classifier and has exactly two enforcement callers, both in `requireRole.ts`; `proxy.ts`
    overwrites `x-bc-pathname` from the real URL at the dynamic-request chokepoint, so a caller cannot select a
    weaker module.

### DEV restore

Every mutable specialist setting touched by the checks was captured before the first change and restored after
the last one. Final read-back is byte-equal to the captured original: `doctor_workspace_composition` all nine
modules `true`; `doctor_workspace_client_defaults` `direct_chat: all`, `program_comments: on_support`,
`program_media: on_support`, `patientSymptomTrackingDefault: all`; `patient_label` `"клиент"`;
`support_group_label` `"on_support"`. No per-client `doctor_patient_support` override was written at any point —
the checks drove the organization default mode only. The applied migration is intentionally left in place: it is
the pending candidate migration and `--execute` is its canonical DEV route.

### Observations — not C3M-09 defects, not turned into work

- **O1 — pre-existing duplicate grant pair.** `public.doctor_patient_support` carries two `app_staff` INSERT and
  two `app_staff` UPDATE column grants in `declaration.ts`; the slice added `direct_chat_enabled` to the first of
  each pair only. Entry counts are identical at the slice base `70eef1ff4`, so the duplication is pre-existing.
  PostgreSQL column grants are additive, so the effective right is the union and the live catalog confirms
  `app_staff` holds all three privileges on the new column. Declaration hygiene, outside C3M-09 authority.
- **O2 — optional delivery-gate dependency.** `resolveWorkspaceModuleEnabled` is optional on
  `OutgoingDeliveryWorkerDeps`; a caller that omitted it would deliver ungated. Today there is exactly one real
  runtime caller and it wires the resolver, so this is latent rather than reachable.
- **O3 — delivery gate reads preference, not entitlement.** `resolveOrganizationWorkspaceModules` applies the
  stored preference against all-available availability, so a lapsed `mailings` tariff entitlement does not stop
  already-queued delivery. Before this slice there was no delivery-time gate at all, so this is not a regression,
  and an entitlement delivery-time gate is not in the C3M-09 text.
- **O4 — branch contains out-of-scope work.** `HEAD` (`8fa9f4673`) is a merge that pulls unrelated `#787`
  branding/settings changes onto the candidate branch. Every C3M scope file is identical between `016477803` and
  `HEAD`, so the verdict above is unaffected, but the branch is not a clean C3M-09 landing unit.

### Not done

- No live two-organization isolation probe (classes 9 and 11 rest on their tests): named DEV holds one organization.
- No live broadcast delivery run: proving it end to end would send real external messages, which the brief forbids.
- Per-client tri-state chat override has no write path yet — `support-settings` PATCH accepts only `onSupport`,
  `commentsEnabled`, `mediaEnabled`. That is correct decomposition, not a gap: the tri-state support panel is
  **C3M-11**. C3M-09 built and gated the read/enforcement side, verified above through the organization default mode.
