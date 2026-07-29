# T0.4-pre schema cleanup ADRs

Status: accepted for T0.4-pre execution unless superseded by owner decision.

## ADR-001: System settings source of truth

Decision (superseded 2026-07-29 by owner ruling/taskdb `#1076`): `public.system_settings` is the only
runtime/business configuration store. The former duplicate table and push/cache-invalidation path are removed;
integrator reads public directly with cache TTL at most 60 seconds.

Rationale:

- Integrator runtime readers already use `public.system_settings`.
- The owner explicitly accepted bounded TTL propagation instead of immediate invalidation/retry.

Consequences:

- No new settings copy, push route or replacement machinery may be introduced.
- Existing invalidator helpers remain, but normal propagation relies on TTL.

## ADR-002: Reminder scheduling owner

Decision: reminder ownership remains split for T0.4-pre:

- `public.reminder_rules` owns business rule configuration;
- `integrator.user_reminder_rules` is a bot dispatch mirror/cache;
- `integrator.user_reminder_occurrences` and `integrator.user_reminder_delivery_logs` own bot technical dispatch state;
- `public.webapp_reminder_occurrences` owns Web Push-only dispatch state.

Rationale:

- Scheduler/worker runtime still reads and mutates integrator reminder tables.
- Web Push-only reminders already use public state.
- Dropping integrator dispatch state without a dispatch-from-public design would risk missed reminders and broken callback/idempotency semantics.

Consequences:

- No T0.4-pre drop for `integrator.user_reminder_*`.
- Future cleanup must design public-based bot dispatch with org context, quiet hours, topics, deep links, mute semantics, idempotency, and callback compatibility.

## ADR-003: Rubitime sunset

Decision: Rubitime remains an active legacy adapter/runtime path until canonical booking parity and read-source cutover are proven. No destructive Rubitime table drop in T0.4-pre.

Rationale:

- Integrator still ingests Rubitime webhooks and writes raw/projection tables.
- Webapp still accepts appointment projection events.
- Doctor and patient booking read/create paths still allow legacy Rubitime settings and IDs.
- Existing operations docs show canonical parity has historically been non-trivial.

Consequences:

- `integrator.rubitime_events/records` are retained as technical raw provider state.
- `public.appointment_records` remains deprecated but live until `booking_doctor_appointments_read_source=canonical`.
- Legacy `public.booking_*` and integrator v1 profile catalog cannot be dropped before v1 fallback/admin route freeze.

## ADR-004: Channel contacts fallback

Decision: `integrator.contacts` is a transitional fallback, not canonical identity. It remains live until a non-PII exception audit is clean and `integrator_linked_phone_source` is switched to `public_only` for a release window.

Rationale:

- Current default is `public_then_contacts`.
- Multiple runtime paths still use contacts fallback or lookup.
- A blind removal could break bot menu gating, reply keyboards, and linked-phone decisions for users with incomplete public phone state.

Consequences:

- T0.4-pre adds audit tooling for aggregate fallback/mismatch counts.
- `contacts_only` remains rollback until the release window closes.
- Removal of fallback reads is a separate code batch after `public_only` stabilizes.

## ADR-005: Conversations, questions, and drafts

Decision: public support tables are product-facing canonical read models. Integrator conversations/questions/drafts remain active technical transport state until writer/fallback paths are moved to public support tables.

Rationale:

- Integrator write/read paths still use `conversations`, `conversation_messages`, `message_drafts`, `user_questions`, and `question_messages`.
- Public support tables are populated by projection and used by doctor/patient support surfaces.

Consequences:

- Do not drop integrator transport tables in T0.4-pre.
- Decide separately whether `support_questions` remains a product surface.
- Move auto-close and fallback reads before any transport-table drop.

## ADR-006: Retention and technical state

Decision: queues, idempotency, throttle, webhook status, and provider audit tables are technical runtime/ops state and must be retained with explicit TTL/terminal-row cleanup rather than collapsed into business data.

Rationale:

- Runtime workers still consume and mutate queue tables.
- Terminal rows are operational cleanup/retention concerns, not schema duplication.
- Business/audit canon lives in broadcast, reminder, support, and admin audit tables and should not be deleted as part of queue cleanup.

Consequences:

- T0.4-pre scripts audit terminal-row counts and generate/drop-safety evidence.
- Future retention job should purge successful terminal queue rows and expired idempotency rows after retention windows are confirmed.
- Dead rows remain manual archive/health workflows unless an explicit auto-archive policy is approved.
