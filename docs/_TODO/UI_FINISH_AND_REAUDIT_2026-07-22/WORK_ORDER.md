# WORK ORDER — Finish Doctor/SaaS UI to real PASS + re-audit "done" stages

**Owner:** Dmitry Berson · **Created:** 2026-07-22 · **Runs on:** THIS box = DEV + TEST only.
**Authority for "done":** the linked *detailed* plan file of each stage — NEVER the roadmap one-line summary.

> **RE-VERIFIED 2026-07-23:** all production `[x]` across the roadmap and detailed plans (~676) were audited against
> code. Verified state + remaining-volume: [`PRODUCTION_READINESS_LEDGER_2026-07-23.md`](PRODUCTION_READINESS_LEDGER_2026-07-23.md)
> and [`CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md`](CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md).
> 659/676 confirmed; **3 functional fake-done reopened** → `[ ]`: Rubitime *patient/public "create works without
> Rubitime"* (Track C — falsified by incident #839 + D0 census; Rubitime create-path coupling still live) and
> `TASK_A` *"Full prod-copy PII rehearsal DONE"* (no artifact, contradicts its own "NOT YET PROVEN"). 11 live-only
> items reclassified `[~]`. Reality of the tracks below is unchanged: **Track C NOT done** (`branchServiceId` live,
> R3C-11 past deadline, R7 not started, no drop migration); **Track D only D0 done**, D1-D10 open.

---

## 0. Hard boundaries (read first, do not violate)

- **Production is a DIFFERENT server (IP 135.x). It is NOT on this box and is OUT OF SCOPE.**
  This box has only the DEV server and the TEST server. TEST is not production.
- On TEST you MUST cut, break, observe what falls, and fix. That is the point of TEST.
- Do NOT deploy to prod, do NOT run prod migrations, do NOT push to `main`/`test` branches. Prod cutover is a
  separate, later, owner-driven step — explicitly NOT part of this work. Here we only make TEST fully working so
  the prod move becomes possible later.
- Before any work read: `AGENTS.md`, `.cursor/rules/*.mdc` (relevant scopes), `docs/ORCHESTRATION_BINDINGS.md`
  (esp. «Универсальный режим исполнения многоэтапного плана» and «Урок 2026-07-22»).

## 1. Root cause this work order fixes

The previous orchestrator closed ~30 "done" stages off **short roadmap descriptions** — it did not open the linked
detailed plans, did not hand workers the full detailed checklist, did not verify each checkbox against reality.
Net result: of ~30 accepted stages, ~2 are actually done. Symptoms already seen: DNA background replaced with
near-white; Clients screen "client card in right pane" (a rejected idea) silently reintroduced; workers inventing
their own UI instead of following detailed plans.

## 2. Scope of THIS push (priority order)

### Track A — UI finish to real PASS with PNG acceptance  (PRIMARY)
- **A1. DNA background regression.** Doctor page background is `#faf9f4` (near-white) via
  `--doctor-page-gap-background` in `apps/webapp/src/app/styles/bersoncare-tweakcn-theme.css:91,95`; DNA canvas is
  `#f6f4ef` (greige, `--bc-canvas:15`). Verify the correct page background against the DNA spec
  (`docs/_TODO/DOCTOR_DNA_MIGRATION/PLAN.md` + Design DNA v1) and restore it. Do not guess a color.
- **A2. Clients screen.** Remove the reintroduced "client card in the right pane" pattern. Follow the detailed
  Clients-screen plan, not the orchestrator's invention.
- **A3. Re-verify every UI stage marked done/accepted** against its linked detailed plan:
  `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md`, `docs/_TODO/DOCTOR_DNA_MIGRATION/PLAN.md`,
  `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` (19 contracts). Produce the true state matrix
  (§3), then finish everything that is not really done.
- **Acceptance:** PNG of the LIVE page (port-shot on :5200 / TEST), batched per page — after a page's edits are
  complete, screenshot the whole page and check ALL its checkboxes against what the owner specified. NOT a
  screenshot per micro-tweak.

### Track B — Global-admin login for the owner on TEST  (small, do early — unblocks owner review)
- Enable email-OTP sign-in for `dimmdao@gmail.com` on TEST and make that email resolve to **global admin**
  (email-OTP already exists via `AuthFlowV2`; admin role currently resolves by phone/telegram/max allowlists only —
  email is not wired). Owner logs in with an emailed code.
- Set up **PWA + web-push** for the global-admin account on TEST.
- Deliverable: exact login steps sent to the owner.

### Track C — Rubitime retirement on TEST  (finish the existing plan)
- Master plan: `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md` + rounds R1–R5 + DB_CLEANUP_SEQUENCE.
- Current state: NOT done — Rubitime code/tables still present on TEST (patient cabinet, booking, DoctorToday KPI,
  `(global-admin)/doctor/admin/booking/integrations`). Finish R1–R5 **on TEST**: stop the exchange, remove
  `branchServiceId` legacy links, archive, drop rubitime tables on TEST, observe breakage, fix it.
- Note: this changes booking-related screens — coordinate with Track A.

### Track D — direct integrator → `public` writes and legacy projection retirement

**Owner ruling 2026-07-23:** the unified PostgreSQL target must not keep HTTP as an internal projection transport.
Integrator writes canonical business data directly to qualified `public` tables through bounded transactional
repositories. The `/api/integrator/events` fanout/outbox/worker path and duplicate projection tables are removed only
after domain parity and data reconciliation are proven. Provider-neutral canonical booking/support/reminder/business
data remains. Historical migrations are immutable; PROD is out of scope.

The HTTP-envelope/performance part of Stability E3 (`#980`) is **SUPERSEDED — 2026-07-23 by Track D / taskdb
`#987`**. Reusable domain schemas may be retained, but no worker may optimize or expand the transport scheduled for
deletion.

Execute these packages in order; each package is one worker stage with the same exact rows supplied to its independent
auditor:

- [x] **D0 — truthful retirement gate, no deletion.** `--expect-post-r6` must detect the Rubitime
  `booking.upsert` branch/package, `buildAppointmentRecordUpsertedFanout`, the producer and handler for
  `appointment.record.upserted`, `/api/integrator/events`, `tryEmitWebappProjectionThenEnqueue`,
  `projection_outbox`, and the projection worker. A fixture/self-test must prove each category changes the verdict.
- [x] **D1 — identity and notification preferences.** One integrator transaction writes channel anchors plus
  canonical `public.platform_users` / `user_channel_bindings` / `user_notification_topics`; retain integrator-only
  channel identity and messenger state that are not duplicate business projections.
  <br>**DONE 2026-07-24** — approach A (TS infra-repo `directPublic/writeIdentityAndPreferencesDirect.ts`, decision
  `SAAS_FOUNDATION/TRACK_D1_APPROACH_DECISION_2026-07-24.md`). Merged (`b4fa18544`), adversarial Opus audit
  no-blocker, byte-parity with `pgUserProjection.ts`. **A7 live on TEST:** synthetic new telegram user →
  `platform_users`+`user_channel_bindings`+`user_channel_preferences` written directly; `projection_outbox`
  `user.upserted` stayed 18 (producer removed, no fanout); idempotent replay clean no-op. Required closing a
  pre-existing TEST privilege gap (integrator login role bootstrap path) — overlay
  `deploy/postgres/integrator-login-public-identity-grants.sql` + webhook.ts fail-open fix (`207d4ce78`).
  Proof: `scratchpad/d1-a7-live-proof.md`. Follow-up: promote overlay to a real integrator migration (prod-correct).
- [ ] **D2 — diary and LFK.** Resolve canonical platform user and exact organization/enrollment, validate ownership,
  write symptom tracking/entries and LFK complexes/sessions directly, and retire the four corresponding HTTP event
  types without a default-org fallback.
- [ ] **D3 — support conversations and messages.** Direct transactional open/message/status writes and qualified
  public reads; reconcile the two current organization-null conversation rows before tightening/removing legacy
  storage.
- [ ] **D4 — support questions and delivery audit.** Direct question create/message/answered and delivery-attempt
  writes with tenant mismatch denied; keep `message_drafts` integrator-local as ephemeral state.
- [ ] **D5 — reminder rules.** `public.reminder_rules` becomes the only business source for CRUD and scheduler reads;
  retire `reminder.rule.upserted`, then classify the integrator rule table for migration-backed removal.
- [ ] **D6 — reminder lifecycle, delivery and content grants.** Reconcile/backfill the currently missing failed
  occurrence history before retiring duplicate delivery/content projections; keep only proven technical scheduler
  state.
- [ ] **D7 — remaining reminder writes.** Replace snooze/skip/done/mute/messenger-topic/notification-settings signed
  POST adapters with the same validated direct-DB service contract.
- [ ] **D8 — mailing/subscriptions.** Run an exact producer/consumer callgraph first. If the currently empty source
  and projection tables have no live producer, remove the dead event types/adapters/tables; do not build a new writer
  for a dead domain.
- [ ] **D9 — Rubitime/appointment retirement, coordinated with Track C.** Remove Rubitime booking branches,
  appointment projection events/handlers, bridge paths, provider tables/settings and `appointment_records` only
  after canonical preservation proof. First migrate the still-active retry storage and calendar mapping to
  provider-neutral structures.
- [ ] **D10 — projection transport teardown, last.** Only after an exact zero-producer census, remove fanout/outbox,
  worker/wiring, generic emit client surface, `/api/integrator/events`, event contract/CSRF exception, projection
  health/proxy/digest tooling and the outbox table through a migration. Do not delete generic idempotency, delivery
  queues or unrelated service HTTP calls.

Execution order: D0 first. After D0, D1, D2 and the code-only portion of D9 may run in parallel where their file scopes
do not intersect. D3 precedes D4. D5 precedes D6, which precedes D7. D8 may run alongside reminder packages. D10 is
always last. Each package runs focused tests plus affected integrator/webapp typecheck and lint; accumulated full CI,
disposable restore+migrate proof and live TEST verification are milestone gates, not repeated per micro-package.

## 3. Required output of the re-audit (per stage)

A row-by-row matrix, one row per atomic checkbox of the **linked detailed plan** (quoted verbatim):

| checkbox (quoted) | code evidence (path:line) | test evidence | live PNG | verdict: real-done / partial / fake-done / owner-deferred |

A checkbox may NOT be marked done without cited reality evidence or an explicit owner defer with a link.
Report ends with: `closed X/N against <owner plan path>` + a mandatory `NOT DONE:` section (even if empty).

## 4. Owner rulings captured in this session (2026-07-22)

- **Support/tech chat:** for both specialists and their clients → routes to the **global admin**; delivery =
  **push + email to the sender**; technical requests, ticket model, show "do not share patient data" notice.
- **Message & broadcast history:** NOT deleted (permanent product history). Only technical copies in logs/queues are purged.
- **Settings-log secrets:** delete old plaintext values; encrypt new ones.
- **Rubitime:** cut now on TEST (Track C).
- **Legacy integrator↔webapp HTTP event ports:** retire (direct SQL via the single DB port); table-cleanup
  (Phase 3) deferred until UI works. This is queued AFTER this UI push, not inside it.
