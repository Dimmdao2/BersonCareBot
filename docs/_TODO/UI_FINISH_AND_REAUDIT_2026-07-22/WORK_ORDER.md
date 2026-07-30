# WORK ORDER — Finish Doctor/SaaS UI to real PASS + re-audit "done" stages

**Owner:** Dmitry Berson · **Created:** 2026-07-22 · **Runs on:** THIS box = DEV + TEST only.
**Authority for "done":** the linked _detailed_ plan file of each stage — NEVER the roadmap one-line summary.

> **RE-VERIFIED 2026-07-23:** all production `[x]` across the roadmap and detailed plans (~676) were audited against
> code. Historical snapshot: [`PRODUCTION_READINESS_LEDGER_2026-07-23.md`](PRODUCTION_READINESS_LEDGER_2026-07-23.md)
> and [`CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md`](CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md).
> The following is the dated 2026-07-23 snapshot, not current runtime truth: 659/676 confirmed; **3 functional
> fake-done reopened** → `[ ]`: Rubitime _patient/public "create works without Rubitime"_ (then falsified by
> incident #839 + D0 census) and
> `TASK_A` _"Full prod-copy PII rehearsal DONE"_ (no artifact, contradicts its own "NOT YET PROVEN"). 11 live-only
> items reclassified `[~]`. **Superseded for Track C:** Rubitime was retired 2026-07-27 and archived by owner
> ruling 2026-07-29; no R1–R7 work remains executable.

---

## 0. Hard boundaries (read first, do not violate)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- **Production is a DIFFERENT server (IP 135.x). It is NOT on this box and is OUT OF SCOPE.**
  This box has only the DEV server and the TEST server. TEST is not production.
- On TEST you MUST cut, break, observe what falls, and fix. That is the point of TEST.
- Do NOT deploy to prod, do NOT run prod migrations, do NOT push to `main`/`test` branches. Prod cutover is a
  separate, later, owner-driven step — explicitly NOT part of this work. Here we only make TEST fully working so
  the prod move becomes possible later.
- Before any work read: `AGENTS.md`, `.cursor/rules/*.mdc` (relevant scopes), `docs/ORCHESTRATION_BINDINGS.md`
  (esp. «Универсальный режим исполнения многоэтапного плана» and «Урок 2026-07-22»).

## 1. Root cause this work order fixes

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

The previous orchestrator closed ~30 "done" stages off **short roadmap descriptions** — it did not open the linked
detailed plans, did not hand workers the full detailed checklist, did not verify each checkbox against reality.
Net result: of ~30 accepted stages, ~2 are actually done. Symptoms already seen: DNA background replaced with
near-white; Clients screen "client card in right pane" (a rejected idea) silently reintroduced; workers inventing
their own UI instead of following detailed plans.

## 2. Scope of THIS push (priority order)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### Track A — UI finish to real PASS with PNG acceptance (PRIMARY)

- **A1. DNA background regression.** Doctor page background is `#faf9f4` (near-white) via
  `--doctor-page-gap-background` in `apps/webapp/src/app/styles/bersoncare-tweakcn-theme.css:91,95`; DNA canvas is
  `#f6f4ef` (greige, `--bc-canvas:15`). Verify the correct page background against the DNA spec
  (`docs/archive/2026-07-plans/DOCTOR_DNA_MIGRATION/PLAN.md` + Design DNA v1) and restore it. Do not guess a color.
- **A2. Clients screen.** Remove the reintroduced "client card in the right pane" pattern. Follow the detailed
  Clients-screen plan, not the orchestrator's invention.
- **A3. Re-verify every UI stage marked done/accepted** against its linked detailed plan:
  `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md`, `docs/archive/2026-07-plans/DOCTOR_DNA_MIGRATION/PLAN.md`,
  `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` (19 contracts). Produce the true state matrix
  (§3), then finish everything that is not really done.
- **Acceptance:** PNG of the LIVE page (port-shot on :5200 / TEST), batched per page — after a page's edits are
  complete, screenshot the whole page and check ALL its checkboxes against what the owner specified. NOT a
  screenshot per micro-tweak.

### Track B — Global-admin login for the owner on TEST (small, do early — unblocks owner review)

- Enable email-OTP sign-in for `dimmdao@gmail.com` on TEST and make that email resolve to **global admin**
  (email-OTP already exists via `AuthFlowV2`; admin role currently resolves by phone/telegram/max allowlists only —
  email is not wired). Owner logs in with an emailed code.
- Set up **PWA + web-push** for the global-admin account on TEST.
- Deliverable: exact login steps sent to the owner.

### Track C — Rubitime retirement: завершён и архивирован

Rubitime выведено из эксплуатации 2026-07-27. Владелец 2026-07-29: «Rubitime у нас больше нет — убирать в архив явно». История прохода и доказательств: `docs/archive/2026-07-rubitime-retirement/README.md`. Старые R1–R7 runbook не возобновлять.

### Track D — direct integrator → `public` writes and legacy projection retirement

**Owner ruling 2026-07-23:** the unified PostgreSQL target must not keep HTTP as an internal projection transport.
Integrator writes canonical business data directly to qualified `public` tables through bounded transactional
repositories. The `/api/integrator/events` fanout/outbox/worker path and duplicate projection tables are removed only
after domain parity and data reconciliation are proven. Provider-neutral canonical booking/support/reminder/business
data remains. Historical migrations are immutable; PROD is out of scope.

**Точная taskdb-привязка после сверки 29.07:** весь Track D D0–D10 — самостоятельная workstream-карточка `#987`.
Её результат: исправить неверно закрытый `#635/#621`, перевести canonical domains на прямые transactional writes,
после parity удалить POST `/api/integrator/events`, projection fanout/outbox, legacy transport и остаточные
provider-specific tables/settings/queues/projections, сохранив provider-neutral booking/support/reminder/business data.
Сначала source/runtime inventory и умеренные независимые блоки; затем direct writers, HTTP/worker shutdown,
destructive TEST/disposable migration+restore proof и docs/guards/tests. TEST разрешён; PROD и push в
`main`/`test` запрещены без отдельной команды. Конкурировавший DB `SECURITY DEFINER` вариант D1 не
канонизировать: выбор approach A зафиксирован в
`SAAS_FOUNDATION/TRACK_D1_APPROACH_DECISION_2026-07-24.md`. Бывший Rubitime workstream `#981` закрыт
retirement 2026-07-27 и не является текущей очередью. `#959` — только parent reconciliation, `#984` — master coordination; эти ссылки
не поглощают самостоятельный scope `#987`. Связанные authority inputs:
`DATABASE_UNIFIED_POSTGRES.md` и T0.4-pre artifacts как inventory, не completion. Архивные Rubitime runbook
не являются authority для исполнения.

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
      <br>**DONE + LIVE-PROVEN 2026-07-24 (correct fix landed).** A7 re-verified live on TEST (feat `79571f8f0`,
      green closure): synthetic NEW telegram user → webhook `{"ok":true}` (no crash), `platform_users` +
      `user_channel_bindings` written DIRECTLY, `projection_outbox` `user.upserted` unchanged (18, producer removed).
      Telegram bootstrap now works via **fail-open reads in code** (`max/webhook.ts`, `handleIncomingEvent.ts`,
      merge `4997c9513`) — NOT via role grants (the earlier grant approach violated deploy assertions + took TEST
      down; reverted). Deploy stays green (assertions pass). Below = history of the reverted attempt.
      <br>**HISTORY (reverted grant attempt):** Approach A (TS infra-repo
      `directPublic/writeIdentityAndPreferencesDirect.ts`, decision `SAAS_FOUNDATION/TRACK_D1_APPROACH_DECISION_2026-07-24.md`).
      Merged (`b4fa18544`), adversarial Opus audit no-blocker, byte-parity with `pgUserProjection.ts`. The direct-write
      MECHANISM is live-proven under an org-principal via **D2**. The telegram **A7** proof (new user → direct
      `platform_users`/`user_channel_bindings`/`user_channel_preferences`; outbox `user.upserted` unchanged) was
      achieved via an integrator-login `current_org_id` + `system_settings` grant that **VIOLATED deploy runtime-role
      assertions and took TEST down** — reverted (memory `deploy-asserts-runtime-role-privileges-dont-violate`).
      **REMAINING for a true tick:** make the inbound-telegram BOOTSTRAP path (pre-existing broken) work via
      **fail-open reads in code** (started: webhook.ts `resolveMessengerStaffAdmin`, `207d4ce78`), NOT role grants,
      then re-verify A7. Merge `b4fa18544`.
      Proof: `scratchpad/d1-a7-live-proof.md`. Follow-up: promote overlay to a real integrator migration (prod-correct).
- [x] **D2 — diary and LFK.** Resolve canonical platform user and exact organization/enrollment, validate ownership,
      write symptom tracking/entries and LFK complexes/sessions directly, and retire the four corresponding HTTP event
      types without a default-org fallback.
      <br>**DONE 2026-07-24** (approach A, merge `79720d89d`). 4 event types (diary.symptom.tracking.created/entry.created,
      diary.lfk.complex.created/session.created) → direct `public.symptom_trackings/symptom_entries/lfk_complexes/
lfk_sessions` via `directPublic/writeDiaryLfkDirect.ts` (reuses D1 candidate resolver). Exact org/enrollment,
      **no default-org fallback** (0 or 2+ active → fail-closed); ownership validation on entry/session. Fixed a latent
      ID-space bug in the retired path (userId was integrator bigint, not platform_users.id → silent no-op). Overlay
      addendum grants (column-scoped). integrator vitest 1383/1385, typecheck/chokepoint/lint clean. **Live-verified on
      TEST** (real HMAC org-principal; all 4 tables + ownership reads pass RLS; bare-role blocked). Detail:
      `scratchpad/d2-diary-lfk-report.md`. Follow-up: same ID-space bug in GET reads `listSymptomTrackings`/
      `listLfkComplexes` (not among the 4 event types) left for a separate fix; multi-org patient diary attribution
      fails-closed (product edge — owner Q if multi-clinic diary needed).
- [ ] **D3 — support conversations and messages.** <br>⛔ **SUPERSEDED 30.07 в части «прямая запись из интегратора».** Новая целевая граница
      (`apps/webapp/ARCHITECTURE.md`, раздел «Целевая схема»): владелец канона — вебапп, у интегратора доступа к
      продуктовому канону не остаётся. Достижимый сценарий, который поймал аудит: пункт выполняется как написан →
      интегратор продолжает писать канон → D10 убирает страховку → D17 отзывает права → первое же сообщение пациента
      получает отказ и теряется; а если грант оставить, узкой роли не будет вовсе. Что остаётся в силе: исправление
      реальных дефектов домена (беседы без организации, полнота полей, идемпотентность) — но выполняется как ПЕРЕНОС
      владения доменом в вебапп, а не как ещё один прямой писатель в интеграторе. Direct transactional open/message/status writes and qualified
      public reads; reconcile the two current organization-null conversation rows before tightening/removing legacy
      storage.
- [ ] **D4 — support questions and delivery audit.** <br>⛔ **SUPERSEDED 30.07 в части «прямая запись из интегратора».** Новая целевая граница
      (`apps/webapp/ARCHITECTURE.md`, раздел «Целевая схема»): владелец канона — вебапп, у интегратора доступа к
      продуктовому канону не остаётся. Достижимый сценарий, который поймал аудит: пункт выполняется как написан →
      интегратор продолжает писать канон → D10 убирает страховку → D17 отзывает права → первое же сообщение пациента
      получает отказ и теряется; а если грант оставить, узкой роли не будет вовсе. Что остаётся в силе: исправление
      реальных дефектов домена (беседы без организации, полнота полей, идемпотентность) — но выполняется как ПЕРЕНОС
      владения доменом в вебапп, а не как ещё один прямой писатель в интеграторе. Direct question create/message/answered and delivery-attempt
      writes with tenant mismatch denied; keep `message_drafts` integrator-local as ephemeral state.
- [ ] **D5 — reminder rules.** <br>⛔ **SUPERSEDED 30.07 в части «прямая запись из интегратора».** Новая целевая граница
      (`apps/webapp/ARCHITECTURE.md`, раздел «Целевая схема»): владелец канона — вебапп, у интегратора доступа к
      продуктовому канону не остаётся. Достижимый сценарий, который поймал аудит: пункт выполняется как написан →
      интегратор продолжает писать канон → D10 убирает страховку → D17 отзывает права → первое же сообщение пациента
      получает отказ и теряется; а если грант оставить, узкой роли не будет вовсе. Что остаётся в силе: исправление
      реальных дефектов домена (беседы без организации, полнота полей, идемпотентность) — но выполняется как ПЕРЕНОС
      владения доменом в вебапп, а не как ещё один прямой писатель в интеграторе. `public.reminder_rules` becomes the only business source for CRUD and scheduler reads;
      retire `reminder.rule.upserted`, then classify the integrator rule table for migration-backed removal.
      <br>**PARTIAL 2026-07-25** (write-side slice, commit `384e7ca29`): `reminder.rule.upserted` HTTP fanout retired —
      `writePort.ts`'s `reminders.rule.upsert` now writes `public.reminder_rules` directly (`directPublic/
writeReminderRulesDirect.ts`, D1-D4 candidate/org-resolution pattern reused), full field parity (fixed a gap:
      the retired payload never carried `linked_object_type/id`, `custom_title/text`, `schedule_data`,
      `reminder_intent`, `quiet_hours_*`, `notification_topic_code`) and a correct `organization_id` (the retired
      consumer never set it at all — same class of bug D3 found for `support_conversations`). Column-scoped grants
      (UP+DOWN) applied+verified live on TEST; tenant isolation live-proven in rolled-back transactions (bare login
      denied, org-A principal writes org-A, org-A principal RLS-denied on org-B). Durability: no fail-closed-no-write
      case (this domain never had one) — every failure falls back to the same durable outbox + operator incident.
      **NOT done (deferred to D6):** "scheduler reads" — `getEnabledReminderRules` (the `reminders.planDue` read) still
      reads `integrator.user_reminder_rules`, and the integrator-local write there is UNCHANGED (kept), because
      `user_reminder_occurrences.rule_id` has a hard `ON DELETE CASCADE` FK to it — cutting that write/read over to
      `public.reminder_rules` requires migrating that FK, which is occurrence-lifecycle machinery (D6's explicit
      remit: "reminder lifecycle, delivery... before retiring duplicate... projections"), not an independently-safe
      D5 change. `integrator.user_reminder_rules` is therefore NOT YET classified for migration-backed removal —
      that classification is blocked on the same D6 FK migration. Full detail: commit `384e7ca29` message.
      <br>**Note found, not fixed here (pre-existing, unrelated to D5):** this WORK_ORDER's D3/D4 checkboxes above
      are still `[ ]` even though both are merged+audited (`fc5493c91`/`3022816da` D3, `e2590d050`/`c376b6b74` D4,
      confirmed via `git log`) — left as-is since fixing that is outside this D5 push's scope.
      <br>**AUDIT ROUND 2 FIX 2026-07-25 (commit `c7aac2aea`):** independent audit live-reproduced a real defect —
      `upsertReminderRuleDirect` was RLS-denied under the REAL "integrator" principal
      (`runWithIntegratorPrincipal`, the exact shape `reminders.rule.toggle`/`.cyclePreset` run under for an
      already-known telegram/max user: org set, patient NULL, `SET ROLE app_patient`), so every normal toggle
      silently degraded to the durable-outbox fallback + fired an operator incident on every call. Class-check
      found the SAME defect in D2 (`createSymptomTrackingDirect`, worse — no fallback branch, so an uncaught
      throw) and D3/D4 (`openSupportConversationDirect`/`createSupportQuestionDirect`); live-reproduced
      before/after for all three. Fixed uniformly via a new `runDirectPublicWriteWithOrgPrincipal` wrap in
      `writePort.ts` (12 call sites across D2-D5) that re-installs an explicit org principal using the
      ALREADY-ambient organization id. Added an opt-in real-Postgres RLS regression test. Full detail: commit
      `c7aac2aea` message.
      <br>**NEW finding, spawned as a SEPARATE task (`task_53b67199`), NOT fixed here — out of D5 scope:** the
      `app_patient` role `runWithIntegratorPrincipal` locks lacks INSERT/UPDATE (and mostly SELECT) on
      `integrator.*` schema tables entirely (confirmed live: `has_table_privilege('app_patient',
'integrator.users','SELECT')` = false, same for `user_reminder_rules` INSERT/UPDATE). This means the
      INTEGRATOR-LOCAL write inside `reminders.rule.upsert` (and likely many other handlers' local writes)
      still fails end-to-end under a real locked integrator principal — a broader, pre-existing, likely-live
      defect independent of and in addition to the RLS bug just fixed. Needs its own investigation.
- [ ] **D6 — reminder lifecycle, delivery and content grants.** Reconcile/backfill the currently missing failed
      occurrence history before retiring duplicate delivery/content projections; keep only proven technical scheduler
      state.
- [ ] **D7 — remaining reminder writes.** <br>⛔ **SUPERSEDED 30.07 в части «прямая запись из интегратора».** Новая целевая граница
      (`apps/webapp/ARCHITECTURE.md`, раздел «Целевая схема»): владелец канона — вебапп, у интегратора доступа к
      продуктовому канону не остаётся. Достижимый сценарий, который поймал аудит: пункт выполняется как написан →
      интегратор продолжает писать канон → D10 убирает страховку → D17 отзывает права → первое же сообщение пациента
      получает отказ и теряется; а если грант оставить, узкой роли не будет вовсе. Что остаётся в силе: исправление
      реальных дефектов домена (беседы без организации, полнота полей, идемпотентность) — но выполняется как ПЕРЕНОС
      владения доменом в вебапп, а не как ещё один прямой писатель в интеграторе. Replace snooze/skip/done/mute/messenger-topic/notification-settings signed
      POST adapters with the same validated direct-DB service contract.
- [ ] **D8 — mailing/subscriptions.** Run an exact producer/consumer callgraph first. If the currently empty source
      and projection tables have no live producer, remove the dead event types/adapters/tables; do not build a new writer
      for a dead domain.
- [x] **D9a — Rubitime runtime retirement.** Rubitime выведено 2026-07-27; исторические планы и proofs перенесены в
      `docs/archive/2026-07-rubitime-retirement/` по решению владельца 2026-07-29.
- [x] **D9b — provider-neutral appointment projection cleanup.** Отдельно проверить оставшиеся
      `appointment_records`, projection events/handlers, retry storage и calendar mapping; не считать архив Rubitime
      доказательством удаления provider-neutral данных. **DONE 2026-07-30:** удалены только неиспользуемые
      `publicAppointmentRecordSync` и `appointment.record.*` transport residues; canonical booking lifecycle,
      `message_retry_jobs`, `booking_calendar_map` и Google sync сохранены. Доказательство:
      `apps/integrator/src/kernel/contracts/legacyAppointmentProjectionTransport.contract.test.ts` +
      целевая fault injection, integrator typecheck и независимый audit PASS.
- [ ] **D10 — projection transport teardown, last.** Only after an exact zero-producer census, remove fanout/outbox,
      worker/wiring, generic emit client surface, `/api/integrator/events`, event contract/CSRF exception, projection
      health/proxy/digest tooling and the outbox table through a migration. Do not delete generic idempotency, delivery
      queues or unrelated service HTTP calls.
      <br>**РЕШЕНИЕ ВЛАДЕЛЬЦА 30.07.2026:** текущий `jsonStableStringify` сохранить только как детерминированную
      сериализацию для хеша/ключа идемпотентности; при удалении HTTP transport перенести его из
      `webappEventsClient`-обвязки в нейтральный модуль. HTTP-body builder и весь смысл
      `integrator → webapp POST /api/integrator/events` удалить. Кандидат `336e833e3` не интегрировать:
      сам алгоритм сериализации там идентичен текущему, а добавленная обвязка обслуживает удаляемый HTTP contract.

### Track D-полный — вычистка интегратора до адаптера каналов (решение владельца 30.07.2026)

Владелец 30.07: «надо расширить тот план до полной вычистки интегратора, чтобы можно было сделать ему правильную
ограниченную роль. И запустить его, а потом доделать прошлую работу но уже правильно». Цель всей ветки одной строкой:
**интегратор остаётся приёмом вебхуков и доставкой сообщений, после чего получает узкую роль в базе.** Всё остальное
уезжает в вебапп. Основание — три независимых исследования 30.07: `docs/_TODO/runs/integrator-role/SYNTHESIS.md`.

Порядок жёсткий: сначала убрать то, что решает продуктовые вопросы, потом транспорт, и только в конце сузить права —
роль, выданная раньше времени, просто уронит живые пути.

**ВЫБОР ИСПОЛНИТЕЛЯ.** Канон — `/home/dev/brain/docs/MODEL_TIERS.md` (таблица `Job → модель/effort`, источник истины в
коде `lib/agent-runner/model-policy.mjs`). Запуск: `ORCH_JOB=<job> tools/orch-launch.sh …` — тип работы называет лид,
модель и effort выбирает карта. Своей таблицы здесь НЕТ и не будет: 30.07 я такую написал, владелец её удалил —
дублировать канон в планах запрещено.

**ЕДИНЫЙ ПОРЯДОК ИСПОЛНЕНИЯ (собран 30.07 по находке аудита: три пункта одновременно объявляли себя последними).**
Читать только эту последовательность; прежние пометки «always last» и «последним» внутри отдельных пунктов силы не
имеют.

1. **D12b** — перепись достижимых сценариев исполнителя (кода не меняет, задаёт объём всему остальному).
2. **D11** ✅ дневник и ЛФК — удалено.
2а. **D18a** — запрет на НОВЫЙ сырой SQL (ставится перед первой правкой кода, не раньше).
3. **D12** мёртвые ветки исполнителя.
4. **D13a** потребитель настроек напоминаний в вебаппе → **D14** решения жизненного цикла записи в вебапп →
   **D13b** рез констант в интеграторе. Именно в этом порядке: рез раньше потребителя оставит пациентов без напоминаний.
5. **D3–D8** — по своим доменам, но как ПЕРЕНОС владения в вебапп, а не как прямые писатели (см. пометки SUPERSEDED).
6. **D15a** исследование идентичности → **D15b** пошаговый перенос.
7. **D10** — снос транспорта проекции, только когда производителей не осталось.
8. **D16** — сведение циклов к одному.
9. **D18c** — перепись остатка сырого SQL и снятие запрета за ненадобностью — список пуст.
10. **D17** — узкая роль в базе.
11. **D19** — сверка правила и целевой схемы с тем, что получилось. Физически последний пункт: он проверяет уже
    выданную роль, поэтому раньше закрыт быть не может.



- [x] **D11 — блок дневника и ЛФК удалён из бота.** Доэпохи-вебаппа реализация: бот заводил болванку записи и отправлял
      человека доделывать в приложение. Настоящий дневник живёт в вебаппе. Решение владельца 30.07: «вырезай весь блок
      lfk-diary в интеграторе». Прогон — `docs/_TODO/runs/integrator-diary-removal/`.
- [ ] **D12b — перепись ДОСТИЖИМЫХ сценариев исполнителя.** Аудит 30.07: удаление десяти мёртвых веток не закрывает
      главную цель — в исполнителе остаются живые продуктовые решения. Нужна перепись: каждый достижимый сценарий и
      действие классифицируются как «канал/доставка — остаётся» либо «продуктовое решение — уезжает в вебапп», с именем
      и файлом. Без неё заголовок «интегратор = приём и доставка» остаётся декларацией.
- [ ] **D12 — десять недостижимых веток исполнителя действий.** В `executeAction.ts` старый `switch` содержит ветки,
      которые новые наборы обработчиков перехватывают раньше: код есть, исполниться не может. Решение владельца 30.07:
      «просто вырезать; если что-то упадёт — посмотреть, что взять из старого кода и перенести в вебапп».
- [ ] **D13a — СНАЧАЛА построить потребителя настроек в вебаппе.** ⚠️ Аудит 30.07 опроверг посылку, на которой пункт
      стоял изначально (и которую лид озвучил владельцу — поправка): настройки `doctor_appointment_reminder_enabled` и
      `doctor_appointment_reminder_offsets_minutes` существуют только как запись в реестре и экран
      (`system-settings/registry.ts:127-128`, запись `api/admin/settings/route.ts:179-180,586-607`, чтение — лишь для
      отрисовки `app/settings/page.tsx:137-147`); **ни один планировщик, джоб или путь отправки их не читает**. Модуль
      шаблонов покрывает ровно три события — `created`, `cancelled`, `rescheduled` (`notifTemplatesService.ts:21-22`),
      события «напоминание» в нём нет. Единственный тик напоминаний в вебаппе ходит по `reminder_rules` и только
      web-push, записи на приём он не видит. То есть константы 24ч/2ч в интеграторе — не «конкурирующая» реализация, а
      ЕДИНСТВЕННАЯ работающая. Поэтому сначала: чтение двух настроек на клинику, добавление события `reminder` в набор
      шаблонов, постановка occurrences.
- [ ] **D13b — только после D13a и D14 вырезать константы интегратора** (смещения 24ч/2ч и тексты в
      `bookingLifecycleRoute.ts:365-376`). Решение владельца «вырезать нещадно» остаётся в силе — меняется лишь порядок:
      сначала потребитель, потом рез. Если резать раньше, следующая созданная запись не поставит ни одной задачи,
      пациент не получит ни напоминания за 24 часа, ни за 2, ошибок в логах не будет, деплой останется зелёным — и это
      обнаружится по неявкам.
- [ ] **D14 — решения о жизненном цикле записи уезжают в вебапп.** Что отменить при переносе, слать ли пуш, что писать в
      календарь, в каком порядке уведомлять. Целевая цепочка (формулировка владельца): создание события → итоговые
      настройки из базы для этого события и этого пациента → планировщик → воркер → интегратор как отправитель.
      Переносить вместе с порядком уведомлений, иначе получим дубли или тишину.
- [ ] **D15a — идентичность: сильное исследование командой ПЕРЕД работой** (решение владельца 30.07). Что именно
      интегратор решает сам: создание и слияние `platform_users`, доверие к телефону, зачисления, предпочтения по
      умолчанию. Результат — утверждённая схема переноса, а не отчёт «мы посмотрели».
- [ ] **D15b — перенос идентичности, отдельными шагами.** Аудит 30.07: пункт нельзя закрывать одним исследованием,
      иначе план разрешит выдать узкую роль, пока интегратор продолжает создавать и сливать людей — тогда после отзыва
      прав падает первый же вебхук с новым пользователем, а если права оставить, узкой роли не будет вовсе. Шаги
      обязательны по отдельности: утверждённая схема → миграция и идемпотентность → переключение вызывающих →
      живое доказательство на TEST → удаление широких записей из интегратора.
- [ ] **D16 — один цикл вместо трёх.** После переноса планировщика (D5–D7, D14) и сноса транспорта (D10) у воркера должен остаться один вечный цикл — доставка. Аудит 30.07: арифметика «ровно один» сегодня не сходится, потому что циклов и точек планирования больше, чем три; перед закрытием пункта пересчитать их поимённо и назвать каждый, который остаётся, с причиной. Целевое состояние — один цикл — очередь исходящей доставки с попытками, отступами и «мёртвой полкой». Очередь
      остаётся в интеграторе: повторы и лимиты у каждого канала свои, и это и есть его польза. Отдельного модуля
      «воркер-шедулер» не заводим — планировщик уезжает в вебапп, третьей сущности делать нечего.
- [ ] **D18 — вычистить ВЕСЬ остаток сырого SQL, оба приложения (решение владельца 30.07: «по ходу плана надо вычистить
      весь остаток сырого sql — то что не миграции и не корректно идёт в дриззл обёртку»).**

      **Порядок — по решению владельца 30.07:** перепись НЕ делается заранее («думаю это имеет смысл делать после
      вырезания всего того что мы планируем вырезать. А в процессе работы по этапам уже переводить на новый единый
      drizzle порт всего чего мы касаемся»). Причина принята: ранняя перепись считает код, который исчезнет вместе с
      D11–D16, и протухает в день составления.

      - [ ] **D18a — запрет на НОВЫЙ сырой SQL.** Механическая проверка запоминает нынешний список файлов с сырыми
            вызовами и **падает, если появится ещё один** вне разрешённого списка. Старое остаётся долгом, новое не
            добавляется; по мере чистки список только сокращается и обратно не растёт. Приём в репозитории уже применялся — так заморожен счётчик неклассифицированных ручек в матрице авторизации.
            Ставится перед первой правкой кода, а не раньше: перепись сценариев кода не меняет, защищать там нечего. Без этого пункта мы не заметим сырой SQL, который добавят по ходу этапов.
      - [ ] **D18b — перевод по ходу этапов, только тронутого.** Каждый этап переводит на drizzle те файлы, которые он и
            так правит по своей причине. Соседние файлы не открываем «раз уж мы тут» — иначе этап расползается и аудит
            перестаёт понимать, что он проверяет. Перевод механический, без изменения поведения, и назван в отчёте
            отдельной строкой, чтобы аудитор отличал конверсию от правки логики.
      - [ ] **D18c — перепись остатка и снятие храповика, ПОСЛЕДНИМ.** Когда вырезано всё, что вырезается, и переведено
            всё, чего касались: перепись поимённо с классификацией «миграция / законная обёртка / чистить», чистка
            остатка, снижение списка до нуля. Пункт закрывается тем, что проверка перестаёт находить исключения, а не
            отчётом.

      **Что законно и НЕ трогается:** файлы миграций и деплойные SQL-скрипты; вызовы через параметризованную обёртку
      drizzle (`sql` tagged template, `.execute()`) со связанными параметрами — образец правильного вызова, дверь
      жизненного цикла; загрузчик миграций и низкоуровневый клиент пула.

      **Замер на 30.07 (справочно, будет пересчитан в D18c):** 22 файла с сырыми вызовами в интеграторе (крупнейшие —
      загрузчик миграций 13, `writeIdentityAndPreferencesDirect` 9, `writeSupportQuestionsDirect` 6, клиент пула 6,
      телеметрия изоляции 5), 20 в вебаппе, при 79 файлах, работающих через законную обёртку. Числа включают законные
      случаи — именно поэтому нужна классификация, а не голый счёт. Семь файлов `directPublic` владелец забрал себе
      отдельным воркстримом: они входят в перепись, но не в наш объём работ.



- [ ] **D17 — узкая роль в базе, последним.** Отдельная роль для интегратора: право писать только то, что нужно приёму и
      доставке (свои таблицы, очередь, привязки каналов), без доступа к продуктовому канону. Сегодня у него та же роль,
      что у вебаппа, поэтому никакая изоляция в коде ничего не значит. Выдавать роль можно только после ФАКТИЧЕСКОГО прекращения записей канона: D11, D12, D13a+D13b, D14, D15b, D16, D18 и пункты D3–D8 по своим доменам. Аудит 30.07 поймал, что прежняя формулировка «после D11–D16» неполна: после них интегратор всё ещё пишет канон поддержки и напоминаний, и узкая роль уронит именно их. Проверка — деплой ассертит точный набор прав, несовпадение
      валит выкатку.

- [ ] **D19 — перепроверить правило и схему ПОСЛЕ реализации (решение владельца 30.07).** Когда D11–D18 закрыты,
      вернуться к `apps/webapp/ARCHITECTURE.md`: сверить записанную целевую схему с тем, что получилось на самом деле, и
      при расхождении актуализировать правило, а не подгонять реальность под текст. Проверять по списку: остался ли в
      интеграторе хоть один путь записи канона; действительно ли к базе ведёт один путь; сошлось ли число вечных циклов;
      выдана ли узкая роль и совпадает ли она с тем, что ассертит деплой; не появилось ли новых прямых импортов между
      деревьями приложений вместо пакета. Пункт закрывается только правкой документа (или явной записью «расхождений
      нет»), а не устным «всё сошлось».



Execution order: D0 first. After D0, D1, D2 and the code-only portion of D9 may run in parallel where their file scopes
do not intersect. D3 precedes D4. D5 precedes D6, which precedes D7. D8 may run alongside reminder packages. D10 is
always last. Each package runs focused tests plus affected integrator/webapp typecheck and lint; accumulated full CI,
disposable restore+migrate proof and live TEST verification are milestone gates, not repeated per micro-package.

## 3. Required output of the re-audit (per stage)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

A row-by-row matrix, one row per atomic checkbox of the **linked detailed plan** (quoted verbatim):

| checkbox (quoted) | code evidence (path:line) | test evidence | live PNG | verdict: real-done / partial / fake-done / owner-deferred |

A checkbox may NOT be marked done without cited reality evidence or an explicit owner defer with a link.
Report ends with: `closed X/N against <owner plan path>` + a mandatory `NOT DONE:` section (even if empty).

## 4. Owner rulings captured in this session (2026-07-22)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- **Support/tech chat:** for both specialists and their clients → routes to the **global admin**; delivery =
  **push + email to the sender**; technical requests, ticket model, show "do not share patient data" notice.
- **Message & broadcast history:** NOT deleted (permanent product history). Only technical copies in logs/queues are purged.
- **Settings-log secrets:** delete old plaintext values; encrypt new ones.
- **Rubitime:** retired 2026-07-27; Track C/R1–R7 не возобновлять. Provider-neutral booking cleanup ведётся отдельно.
- **Legacy integrator↔webapp HTTP event ports:** retire (direct SQL via the single DB port); table-cleanup
  (Phase 3) deferred until UI works. This is queued AFTER this UI push, not inside it.
