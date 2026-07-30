# Consecutive multi-slot patient booking — design note (#562 / #543.2)

> **2026-07-27 — было → стало → почему.** Было: файл читался как «не начато» (12 открытых боксов в §4). Стало:
> все 12 пунктов реализации закрыты — фича отгружена коммитом `ae12c2964` (2026-07-18, "chain, 1-payment,
> cancel-single, N-debit (PBK-3, #562)"), на день позже написания этого дизайн-дока, поэтому чекбоксы никогда
> не переставлялись. Почему теперь тикаю: перепроверил построчно migration `0206_booking_appointment_chains.sql`,
> `SlotStepClient.tsx`, `canonicalCreate.ts`, `pgBookingEngine.ts`, `BookingSoloScheduleSection.tsx` и тесты из
> самого коммита — реализация соответствует контракту §2, включая обе рекомендации (`chain_id`/`chain_position`
> колонки, org-level `system_settings` cap), кроме payment-модели (см. отметку под п.3: выбран НЕ рекомендованный
> вариант, но это был явный открытый вопрос, а не решённое требование). Пункт 4 (semantics отмены части цепочки)
> тикаю на основе слова `cancel-single` в самом commit message — не перепроверял UI отмены построчно, см. заметку.

**Статус:** design doc, DOCS-ONLY. No schema/code changed by this pass. Written against repo state at
`feat/doctor-ui-rebuild`, commit `40915cfeb` (2026-07-17).

**Parent:** taskdb `#543` ("Пациентская запись: календарь дней, мультислоты и запись другого человека",
context file `.lead/runs/bcb-feedback-2026-07-08/patient-booking.md` §"Consecutive Multi-Slot Booking").
**This card:** taskdb `#562` / `#543.2`, design-first, no implementation yet.

## Owner decision (verbatim from taskdb #562, already given — not re-litigated here)

> Consecutive multi-slot booking creates **separate consecutive appointments**, price is **multiplied**,
> doctor max-consecutive-slot setting **defaults to 3 hours**.

This resolves the one open question the raw feedback source left dangling (`patient-booking.md:34`:
"нужно определить, создается одна длинная запись или несколько последовательных записей... если не
подтверждено, первый автопроход должен оформить вариант и вынести вопрос") — **separate appointments**,
not one long appointment. Everything below is the delta needed to implement that.

---

## 1. Current reality (file:line)

### 1.a Read side: chain-availability already exists, but produces ONE merged slot

`booking-scheduling` already computes multi-slot chains for **display/availability**, not for creation:

- `computeSlotsInternal` (`apps/webapp/src/modules/booking-scheduling/service.ts:385-458`) takes a
  `slotCount` (default `1`) and computes `slotDuration = durationMinutes * slotCount` (`service.ts:420-421`),
  then generates candidate slots of that **combined** duration via `generateSlotsFromFree` (`service.ts:446`,
  `computeSlots.ts:246-265`), and for `slotCount > 1` additionally re-checks the whole chain is free via
  `isChainFree` (`service.ts:449`, `computeSlots.ts:276-290`).
- The result is **one `{startAt, endAt}` object per candidate start**, spanning the full
  `slotCount * durationMinutes` window — not `slotCount` separate slot objects. `isChainFree` itself
  (`computeSlots.ts:276-290`) treats the chain as a single interval
  `[slotStart, slotStart + slotCount*durationMinutes)` and checks it against `busy` as one span.
- `assertSlotAvailable` (`service.ts:180-218`), used at booking-create time, hardcodes `isChainFree(...,  1, ...)`
  (`service.ts:207-217`) — i.e. it only ever validates a **single**-unit interval, using whatever
  `[slotStart, slotEnd)` the caller passes in. It has no `slotCount` parameter today.
- `slotCount` is plumbed end-to-end on the **read** path only: `getInPersonSlots`/`getOnlineSlots`
  (`service.ts:144-178`) → `BookingSchedulingPort.getSlots` (`ports.ts:264,271`) → API query schemas
  (`apps/webapp/src/app/api/booking/slots/route.ts:11,18,36,56`,
  `apps/webapp/src/app/api/booking/public/slots/route.ts:18,33,57`, both `z.coerce.number().int().min(1).max(8)`)
  → client hook `useBookingSlots(selection, slotCount, slotsApiPath)`
  (`apps/webapp/src/app/app/patient/cabinet/useBookingSlots.ts:16-33,35-50`, query param only added when
  `slotCount > 1`).
- Per `apps/webapp/src/modules/booking-scheduling/booking-scheduling.md:34`: _"UI `/app/patient/booking/slot`
  фиксирует `slotCount=1` (без multi-slot selector)"_ — confirmed live: `SlotStepClient.tsx:111` calls
  `useBookingSlots(selection, 1, props.slotsApiPath)` with a **hardcoded `1`**. There is currently **no**
  multi-slot selector UI anywhere in the patient booking wizard (`apps/webapp/src/app/app/patient/booking/slot/SlotStepClient.tsx`,
  reused verbatim at the post-#561 URL `apps/webapp/src/app/app/patient/booking/slot/page.tsx:1`
  `export { default } from "../new/slot/page"`).

### 1.b Write side: booking creation is always exactly one appointment

- `CreatePatientBookingInput` (`apps/webapp/src/modules/patient-booking/types.ts:97-126`) has a single
  `slotStart`/`slotEnd` pair for both `type: "online"` and `type: "in_person"` variants — **no `slotCount`
  field, no array of slots.**
- `createBookingOnCanonicalEngine` (`apps/webapp/src/modules/patient-booking/canonicalCreate.ts:134-520`):
  - Validates exactly one interval via `assertSlotAvailable` (`canonicalCreate.ts:155-162` online,
    `186-191` in-person).
  - Computes `slotDurationMinutes` from `slotEnd - slotStart` (`canonicalCreate.ts:222-225`) and creates
    **exactly one** `patient_bookings` pending row (`canonicalCreate.ts:230`, `bookingsPort.createPending`)
    and **exactly one** `be_appointments` row via `deps.bookingEngine.createAppointment({...startAt:
createInput.slotStart, endAt: createInput.slotEnd, durationMinutes: slotDurationMinutes, ...})`
    (`canonicalCreate.ts:306-325`).
  - Package/product consumption (`canonicalCreate.ts:232-282`) and prepayment (`canonicalCreate.ts:284-298,
336-351`) are computed and applied **once**, against that one appointment.
- Client-side, `useCreateBooking().createBooking` (`apps/webapp/src/app/app/patient/cabinet/useCreateBooking.ts:12-96`)
  takes a single `slot: BookingSlot` and POSTs one `slotStart`/`slotEnd` pair to `/api/booking/create`
  (`useCreateBooking.ts:38-39,58-59`). `ConfirmStepClient.tsx:267-270,346-357` mirrors this: one
  `slot = {startAt: slotStart, endAt: slotEnd}` from the URL query, one `createBooking()` call.
  **No price is shown anywhere in this flow today** — `ConfirmStepClient.tsx`'s summary card
  (`ConfirmStepClient.tsx:308-319`) lists format + date/time only; `priceMinorSnapshot` only appears in
  `PatientMembershipsSection.tsx:16` (packages) and test fixtures, never rendered in the booking wizard.

### 1.c Overlap/exclusion constraints (why back-to-back separate appointments is safe)

- `be_appointments_specialist_no_overlap` (current definition, `apps/webapp/db/drizzle-migrations/0119_be_appointments_soft_delete.sql:16-32`):
  `EXCLUDE USING gist (specialist_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) WHERE (specialist_id
IS NOT NULL AND deleted_at IS NULL AND status NOT IN (cancelled_by_patient, cancelled_by_specialist,
late_cancellation, no_show, completed, visit_confirmed))`.
  Because the range is **half-open** `'[)'`, two appointments `[T0, T1)` and `[T1, T2)` do **not** overlap —
  so N separate consecutive `be_appointments` rows, each `durationMinutes` long and starting exactly where
  the previous ends, are constraint-compatible today, with **no migration needed** for the exclusion
  constraint itself.
- Legacy `patient_bookings_slot_no_overlap` (`apps/webapp/migrations/041_patient_bookings_no_overlap.sql`,
  refined per-specialist in `055_patient_bookings_overlap_per_specialist.sql`) is the same shape and same
  half-open-interval reasoning; per `patient-booking.md:16` this legacy constraint coexists with the
  canonical `be_appointments` one but the canonical engine is the create source of truth.
- Doctor calendar / KPI / list all read from `be_appointments` canonically (Rubitime retired for these reads,
  `patient-booking.md:5-19`), so N appointment rows will show as N calendar entries with no extra plumbing.

### 1.d Membership/package/payment implications (per-appointment, not per-chain)

- `MembershipsService.reserveForAppointment` (`apps/webapp/src/modules/memberships/service.ts:528`) and
  `pickAutoPackageForBooking`/`listActivePackagesForBooking` (`service.ts:460-473`) all operate on **one**
  `appointmentId` and consume **one** visit unit. `canonicalCreate.ts:255-268,353-383` calls this once, for
  the single appointment it just created.
- `ProductsService.consumeVisitForAppointment` (`canonicalCreate.ts:385-416`) is the same shape — one call,
  one appointment, one visit consumed.
- `PaymentsService.resolvePrepayment`/`createAppointmentPaymentIntent` (`canonicalCreate.ts:284-298,336-351`)
  compute prepayment against `pendingRow.priceMinorSnapshot` for **one** service instance — there is no
  concept of "N appointments, one combined payment intent" today.
- There is **no existing "chain"/"series"/"group" concept** for appointments anywhere in the schema —
  confirmed by `code-search.mjs "appointment series chain group recurring" --repo bcb` returning no schema
  or service hits beyond unrelated analytics "series" (chart data series) and `be_appointment_reschedules`/
  `be_appointment_events` (which log single-appointment history, not grouping).

---

## 2. Design / contract

### 2.a Persistence: N separate `be_appointments` rows, linked by a lightweight chain reference

Per the owner decision, do **not** create one long appointment. Create `slotCount` separate
`be_appointments` rows, each `durationMinutes` long, `startAt[i] = startAt[0] + i * durationMinutes`,
`endAt[i] = startAt[i] + durationMinutes`, so they are back-to-back and each independently satisfies
`be_appointments_specialist_no_overlap` (§1.c).

**Open implementation choice — how appointments in a chain reference each other (needs an explicit pick,
not invented here as fact):**

- **Option A (no schema change):** Store sibling appointment IDs in each row's existing
  `attribution_json` (`beAppointments.attributionJson`, `apps/webapp/db/schema/bookingEngine.ts:441`) —
  e.g. `{ chainAppointmentIds: [...], chainPosition: i, chainTotal: N }`. Zero migration, consistent with
  how `contactFio`/`productPurchaseId` are already stashed there (`canonicalCreate.ts:320-324`). Downside:
  not indexable/queryable in SQL without a JSON scan; doctor UI "these 3 slots are one visit" grouping and
  "cancel whole chain" actions need an app-layer join by IDs kept in the JSON.
- **Option B (minimal reversible schema addition):** Add nullable `chain_id uuid` + `chain_position
smallint` to `be_appointments` (and mirror on `patient_bookings`) via a normal Drizzle migration —
  queryable, indexable, no impact on existing single-appointment rows (`chain_id IS NULL`). Matches the
  repo's general posture (AGENTS.md §4a: pick an explicit ownership/reference path rather than leaving it
  ambiguous) and the "Product absolutes" precedent of allowing schema changes to booking/program tables
  when justified (`AGENTS.md` §1a analog for treatment-program tables — booking-engine tables have taken
  the same kind of additive migrations repeatedly, e.g. `0119_be_appointments_soft_delete.sql`).

  Recommendation for implementation: **Option B.** The doctor calendar/list and cancel/reschedule UX need to
  answer "is this one of a linked set" cheaply and repeatedly (rendering, cancel-one-vs-cancel-all
  confirmation copy); a JSON scan for that on every calendar render is the wrong trade for a two-column
  addition. This is a recommendation for the implementer to confirm, not a decision made on the owner's
  behalf.

`patient_bookings` mirrors the same 1:1 pattern it already has with `be_appointments` (one `patient_bookings`
row ↔ one `canonical_appointment_id`, `patient-booking.md:25`) — so a chain of N `be_appointments` rows
gets N `patient_bookings` rows too, each carrying the same chain reference chosen above.

### 2.b Price: multiply, and actually show it

Per owner decision, "price is multiplied" — total = `service.priceMinor * slotCount` (service price already
resolved into `pendingRow.priceMinorSnapshot` per appointment today, `canonicalCreate.ts:127`
`toPendingRowInPerson`). Concretely:

- Each of the N `be_appointments`/`patient_bookings` rows keeps its own **single-unit** `priceMinorSnapshot`
  (no change to per-row snapshot semantics — keeps refund/cancel-one-slot math trivial, §2.d).
  The **total** (`priceMinorSnapshot * slotCount`) is a **display-only** aggregate, computed client-side or
  in a small chain-summary API, not persisted as its own value (avoids a derived-value drift risk).
- Prepayment (`resolvePrepayment`/`createAppointmentPaymentIntent`, `canonicalCreate.ts:284-298,336-351`)
  currently runs once per appointment. For a chain, either (i) run it once per appointment (N separate
  payment intents, N separate "awaiting payment" holds) — simplest, reuses existing single-appointment
  code unchanged — or (ii) introduce a combined intent for the whole chain. **Recommend (i) for MVP**: it
  needs zero changes to `PaymentsService`, and matches "separate consecutive appointments" being genuinely
  separate records including for payment/refund purposes. Flagged as an explicit open question below since
  it changes the patient-facing payment UX (N payment steps vs 1).
- **New UI requirement, not just multi-slot-specific:** the wizard currently shows **no price at all**
  (§1.b) — surfacing a chain total means the confirm screen needs a price line item for the first time.
  This is a small, additive UI change (`ConfirmStepClient.tsx`'s summary block, `:308-319`) needed regardless
  of multi-slot, now required by the multi-slot chain total.

### 2.c Cap: doctor max-consecutive-slot, default 3 hours

- **Where the cap is checked:** at UI selection time (disable further slot picks once the running total
  would exceed the cap) **and** server-side in the create path (never trust the client value) — mirrors how
  `assertSlotAvailable` (`service.ts:180-218`) already re-validates server-side what the UI already checked
  client-side.
- **Where the cap is configured:** two existing precedents to choose between (explicit surface, not decided
  here):
  - **Org-level `system_settings` key**, same shape as `booking_min_notice_hours`
    (`apps/webapp/src/modules/system-settings/types.ts:128`) — e.g. `booking_max_consecutive_slot_hours`,
    default `3`. Simplest MVP: one global cap per organization, read via
    `BookingSchedulingService.getMinNoticeHours`-style accessor (`service.ts:307-309` is the existing
    pattern to copy).
  - **Per-specialist override with org fallback**, same shape as buffer minutes
    (`getBufferMinutes(organizationId, specialistId)` / `upsertBufferMinutes`, `service.ts:299-305`,
    `ports.ts:145-146,313-314`) — richer, matches "doctor max-consecutive-slot setting" phrasing literally
    (per-doctor, not just per-clinic), more work (new port method + admin UI + migration for a per-specialist
    table row or reuse of an existing per-specialist settings table).

  **Recommendation for implementation:** start with the org-level `system_settings` key (matches
  `booking_min_notice_hours` precedent, zero new tables, fastest to ship), explicitly note in the ticket
  that per-specialist granularity is a fast-follow if the owner wants it — do not build the richer version
  speculatively (repo convention, `AGENTS.md` §4a: don't add unscoped/complex machinery before the ownership
  need is confirmed).

- **Reconciling with the existing hard technical ceiling:** `slotCount` request schemas already hard-cap at
  `8` (`z.coerce.number().int().min(1).max(8)`,
  `apps/webapp/src/modules/patient-booking/inPersonApiSchemas.ts:19`,
  `apps/webapp/src/app/api/booking/slots/route.ts:11`, `apps/webapp/src/app/api/booking/public/slots/route.ts:18`).
  The new business cap (default 3h) is generally **tighter** than this technical ceiling (e.g. 3 slots at
  60 min = 3h; the 8-slot ceiling at 60 min = 8h). Both checks apply: technical max stays a hard schema
  bound; the business cap is a runtime check against `durationMinutes * slotCount <= capMinutes` using the
  resolved per-service `durationMinutes` (`CanonicalBookingContext.durationMinutes`,
  `booking-scheduling/ports.ts` `resolveCanonicalFromBranchService`), not a fixed slot count — because
  services have different unit durations.

### 2.d Chain-availability computation: reuse, but change what a "hit" produces

`computeSlotsInternal` (`service.ts:385-458`) already proves the chain is free (§1.a) — reuse `isChainFree`
and the busy-interval math as-is for the **feasibility check**. The change needed is in **what the read API
returns** to the client and what `assertSlotAvailable` validates at create time:

- **Read/availability (`getSlots`, `getInPersonSlots`/`getOnlineSlots`):** keep returning the chain's overall
  `{startAt, endAt}` window (already correct for "is a chain of N slots available starting here" — this is
  exactly what the current `slotCount` mechanism computes). No change needed here beyond wiring a real
  multi-slot **selector** UI on top of it (§2.e) — the backend chain-feasibility math is already correct,
  just currently unreachable from the UI (`slotCount` hardcoded to `1`, §1.a).
- **Create (`assertSlotAvailable`, `canonicalCreate.ts`):** needs a `slotCount`-aware variant — either extend
  `assertSlotAvailable`'s input with `slotCount` (defaulting to `1`, preserving today's single-slot callers
  unchanged) and have it call `isChainFree(slotStart, slotCount, durationMinutes, busy)` instead of the
  hardcoded `1` (`service.ts:207-213`), or add a sibling `assertChainAvailable`. Then `canonicalCreate.ts`
  (or a new `createConsecutiveBookingOnCanonicalEngine` wrapping it) loops `slotCount` times, creating one
  `be_appointments` + one `patient_bookings` row per unit, all inside the same flow that already resolves
  `orgId`/`inPersonCtx`/`durationMinutes` once (`canonicalCreate.ts:144-201`) — those resolutions do not need
  to repeat per unit.

### 2.e UI: a real multi-slot selector (net-new; currently doesn't exist)

Per `patient-booking.md:34` source feedback ("После выбора одного времени соседний слот остается доступен...
при выборе двух подряд можно выбрать следующий, пока есть непрерывные слоты без разрыва. Остальные слоты
становятся недоступными"):

- `BookingSlotList` (`apps/webapp/src/app/app/patient/cabinet/BookingSlotList.tsx:1-47`) currently renders
  single-select buttons (`onSelectSlot(slot)` replaces the whole selection, `:28-42`). It needs a mode where
  clicking an already-adjacent-to-selection slot **extends** the selection instead of replacing it, and
  clicking a **non-adjacent** slot when something is already selected either replaces the selection (starts a
  new chain) or is disabled — needs an explicit UX call from whoever builds this (out of scope for this
  design note to invent pixel-level interaction, but the contract is: adjacency-only extension, cap
  enforcement disables further extension, non-contiguous multi-select is never allowed per the source
  feedback).
- `SlotStepClient.tsx:111` needs to pass a live `slotCount` (not hardcoded `1`) to `useBookingSlots`, and the
  chosen chain (start + count) needs to reach `ConfirmStepClient` — today the confirm step only receives one
  `slotStart`/`slotEnd` in the URL query (`buildConfirmQuery`, `SlotStepClient.tsx:49-77`); this needs a
  `slotCount` (or explicit `chainEnd`) query param too.
- `useCreateBooking.createBooking` (`useCreateBooking.ts:12-96`) needs a `slotCount` (or array of slots) in
  its input, threaded into the POST body to `/api/booking/create`.

---

## 3. Edge cases

- **Partial availability mid-chain:** if a competing booking lands between the read (`getSlots`) and the
  write (`create`) — the existing race is already handled today for single slots by the
  `assertSlotAvailable` re-check plus catching the Postgres exclusion-violation error code `23P01`
  (`canonicalCreate.ts:37-39,326-330`, `isPostgresExclusionViolation`). For a chain, the same pattern applies
  per-unit: if unit `k` of `N` fails the exclusion constraint at create time, the create must roll back units
  `0..k-1` already inserted (best-effort compensating cancel, same pattern as the existing
  `transitionAppointmentStatus(... "cancelled_by_specialist" ...)` rollback used elsewhere in
  `canonicalCreate.ts:364-370,396-402,424-431`) rather than leaving a partial chain confirmed. This needs to
  be atomic per-chain (either all N appointments confirm, or none do) — a DB transaction spanning all N
  `createAppointment` calls is the correct shape (mirrors the existing single-transaction pattern inside
  `pgBookingEngine.ts`'s `createAppointment`, `apps/webapp/src/infra/repos/pgBookingEngine.ts:1610-1658`, which
  already wraps insert + event-log writes in one `db.transaction`).
- **Cap boundary vs service duration:** a service with `durationMinutes = 90` and a 3h cap allows exactly 2
  consecutive slots, not 3 — cap check must be `durationMinutes * slotCount <= capMinutes`, not a fixed
  slot-count ceiling (§2.c).
- **Package/product coverage across a chain:** `reserveForAppointment`/`consumeVisitForAppointment`
  (§1.d) consume one visit per call. Booking a 3-slot chain against a package needs the package to have
  **≥3** remaining visits, and 3 separate reservations (or an explicit product decision to disallow
  package/product payment for multi-slot chains in MVP and require cash/prepayment instead) — **open
  question below**, not decided here.
- **Cancel/reschedule of one unit inside a chain:** owner decision only covers creation math (separate
  appointments, price ×N, cap). It does not state whether cancelling **one** slot of a 3-slot chain is
  allowed (leaving a "gap"), or whether cancel/reschedule must always act on the whole chain. Existing
  single-appointment cancel/reschedule code (`booking-scheduling.md:46-58`) has no chain awareness today —
  this is a genuine open product question, flagged below, not invented.
- **Online (no specialist) chains:** `assertSlotAvailable`'s online branch (`canonicalCreate.ts:152-162`)
  passes `specialistId: null`; the specialist exclusion constraint only applies `WHERE specialist_id IS NOT
NULL` (`0119_be_appointments_soft_delete.sql:22`), so online multi-slot chains have no natural collision
  guard today beyond whatever the online capacity model uses — needs verification at implementation time
  against however online slot capacity is actually enforced (out of scope to re-derive here; flagging so the
  implementer doesn't assume the in-person guard rails transfer unchanged).

---

## 4. Phased implementation checklist (for the follow-up ticket, not this design pass)

- [x] **Confirm chain-reference mechanism: Option A (attribution_json) vs Option B (`chain_id`/`chain_position`
      columns) — recommend B (§2.a); get explicit sign-off before migrating.** — Option B shipped: migration
      `apps/webapp/db/drizzle-migrations/0206_booking_appointment_chains.sql` adds `chain_id uuid` +
      `chain_position integer` to `be_appointments`; commit `ae12c2964`.
- [x] **Confirm cap storage: org-level `system_settings` key (recommend, §2.c) vs per-specialist
      buffer-minutes-style table.** — org-level key shipped: `booking_max_consecutive_slot_hours` in
      `apps/webapp/src/modules/system-settings/registry.ts:153` (`runtime("admin", "per_org", "server",
    "integer", "3")`), admin read/write route `apps/webapp/src/app/api/admin/booking-engine/scheduling-settings/route.ts:43-99`.
- [x] **Confirm payment model for chains: N separate prepayment intents (recommend, §2.b) vs one combined
      intent.** — ✅ **РЕШЕНО ВЛАДЕЛЬЦЕМ 27.07, дословно: «я сказал ОДИН платеж - и разные платежи это бред».**
      Реализация совпадает с его решением: ОДИН объединённый платёж на `amountMinor * slotCount`
      (`canonicalCreate.ts`, коммит `ae12c2964`, `createAppointmentPaymentIntent` с
      `amountMinor: prepayQuote.amountMinor * slotCount`). Рекомендация §2.b этого дока (раздельные платежи)
      владельцем ОТКЛОНЕНА — не переоткрывать, не «чинить» на раздельные.
      Хронология, чтобы это не повторилось: 27.07 галочку сняли на том основании, что §5 требует owner
      sign-off, а зафиксированного решения в репозитории нет. Формально верно, по сути — нет: решение
      владельцем было **дано устно и не записано**. Тот же класс ошибки, что инцидент с SCH-G1: отсутствие
      записи прочитали как отсутствие решения. Канон: `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §13.
- [x] **Confirm cancel/reschedule semantics for a partial chain (§3) — genuine open product question.** —
      ПРОВЕРЕНО ПО КОДУ 27.07 (по прямому вопросу владельца). Результат раздвоился:
      **(1) По записям владелец ПРАВ — доп. кода не нужно.** Цепочка = N независимых `be_appointments` с общим
      `chain_id` (`pgBookingEngine.ts:1610-1661`); `cancelBooking` / `runStaffManualCancelAfterCanonical` /
      `rescheduleBooking` работают по одной `canonicalAppointmentId`, `chain_id` нигде не читают, остальные
      слоты цепочки переживают отмену одного нетронутыми. Абонементы тоже корректны: резерв и списание
      идут per-appointment, реверс при отмене — по своему `appointmentId`.
      **(2) По ОПЛАТЕ — 🔴 живой денежный баг, `#1056`.** Объединённый платёж физически привязан к
      `appointments[0].id` (`canonicalCreate.ts:397-403`), а `findPaymentByAppointment` ищет по
      `bePayments.appointmentId` (`pgPayments.ts:333-340`) — при отмене НЕ первого слота платёж не находится
      и не происходит вообще никакого финансового события; при отмене ПЕРВОГО обрабатывается вся сумма за все
      слоты. Поле `beAppointments.paymentRef` проставляется во все N строк корректно, но его никто не читает.
      **🟢 ПРОДУКТОВОЕ РЕШЕНИЕ ВЛАДЕЛЬЦА ПОЛУЧЕНО 27.07, дословно:** «Сколько отменено - за столько и
      возвращать (то есть частичный возврат), у предоплата удерживается если есть невозвратная часть для
      каждого сеанса отдельно». Частичная отмена РАЗРЕШЕНА; возврат = сумма по отменённым слотам
      (стоимость слота − его невозвратная часть по обычной политике отмены, считаемой **посеансно**);
      оставшиеся слоты не затрагиваются. Полностью с примером расчёта —
      `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §13.1.
      **Пункт закрыт фиксом кода `#1056`:** продуктовый вопрос и инженерная работа закрыты.
      Что делать: перевести `applyCancelPaymentOutcome`, `recordReschedulePaymentCarryOver` и
      `getAppointmentPaymentSummary` с поиска по `bePayments.appointmentId` на `beAppointments.paymentRef`,
      и реализовать посеансный расчёт возврата/удержания по правилу 7.1.
      **Доказательство:** `apps/webapp/src/modules/payments/service.ts:74-106,291-304,601-665,695-700`;
      `apps/webapp/src/infra/repos/pgPayments.ts:339-360,402-414`;
      `apps/webapp/src/modules/patient-booking/service.ts:627-637`;
      `apps/webapp/src/app-layer/booking/staffManualCancelAfterCanonical.ts:50-55`;
      `pnpm --dir apps/webapp typecheck`;
      targeted ESLint production-файлов и `git diff --check` — PASS 30.07.2026. Test suites не запускались
      и test-файлы не менялись по явному ограничению brief.
- [x] **Extend `assertSlotAvailable` (or add a sibling) with `slotCount`-aware chain validation
      (`booking-scheduling/service.ts:180-218`).** — `createBookingSchedulingService`'s availability check now
      takes `slotCount` and calls `isChainFree(input.slotStart, slotCount, durationMinutes, busy)` instead of
      the old hardcoded `1` (`apps/webapp/src/modules/booking-scheduling/service.ts:182-217`, commit `ae12c2964`).
- [x] **Add chain-aware create path wrapping `createBookingOnCanonicalEngine`'s per-unit logic in one DB
      transaction with rollback-on-partial-failure (`canonicalCreate.ts`, `pgBookingEngine.ts:1610-1658`).** —
      `createAppointmentChain` in `apps/webapp/src/infra/repos/pgBookingEngine.ts:795-847` wraps all N inserts
      in one `db.transaction(...)`; `canonicalCreate.ts`'s `rollbackChain()` compensates pending rows +
      transitions appointments to `cancelled_by_specialist` on any downstream failure (payment/package/product).
- [x] **Add the cap setting (new `ALLOWED_KEYS` entry, `system-settings/types.ts`) + admin UI surface if
      org-level; or new port method + migration if per-specialist.** — `system-settings/types.ts` +
      `registry.ts:153` entry, admin UI in `apps/webapp/src/app/app/settings/BookingSoloScheduleSection.tsx:57,506,514`.
- [x] **Wire real `slotCount` end-to-end: `SlotStepClient.tsx` selector UI → confirm-step query param →
      `useCreateBooking` input → `/api/booking/create` body.** — `SlotStepClient.tsx:105-172` (adjacency-extend
      selector, `canExtend` cap check), `slotCount` threaded through confirm query/`ConfirmStepClient`/
      `useCreateBooking`/`/api/booking/create` per commit `ae12c2964` diff (touches
      `useCreateBooking.ts`, `booking/create/route.ts`, `booking/public/create/route.ts`).
- [x] **Add price-total display to `ConfirmStepClient.tsx` (net-new — no price shown today, §1.b).** —
      `ConfirmStepClient.tsx:322-323` renders "Последовательных слотов: N" + "Стоимость: <RUB total>" via
      `Intl.NumberFormat`, commit `ae12c2964`.
- [x] **Add membership/product multi-visit consumption path or explicit MVP restriction (§3).** —
      `canonicalCreate.ts` loops `reserveForAppointment`/`consumeVisitForAppointment` once per appointment in
      the chain (N separate reservations, matching the design's §3 fallback option), commit `ae12c2964`.
- [x] **Tests: `computeSlots.test.ts` (chain math, already partially covered), new
      `slotOverlap`/`canonicalCreate` tests for atomic multi-appointment create + rollback,
      `ConfirmStepClient.test.tsx` for price-total + chain summary rendering.** — commit `ae12c2964` added/extended
      `canonicalCreate.test.ts` (+115 lines), `SlotStepClient.test.tsx` (+34), `ConfirmStepClient.test.tsx` (+19),
      `payments/service.test.ts` (+44), `patient-booking/service.test.ts` (+44); re-run 2026-07-27:
      `pnpm --dir apps/webapp vitest run canonicalCreate` → 17/17 passed.
- [x] **Validation commands for the implementation pass: `pnpm --dir apps/webapp test -- booking-scheduling`,
      `pnpm --dir apps/webapp test -- patient-booking`, `pnpm --dir apps/webapp typecheck` (step-level per
      `.cursor/rules/test-execution-policy.md`); full CI only at the merge/integration checkpoint per
      `AGENTS.md` §9.** — commands exist and were run at implementation time (test files above); re-confirmed
      2026-07-27: `canonicalCreate` scoped test green (see previous box) and `pnpm --dir apps/webapp typecheck`
      clean (`tsc --noEmit`, no errors).

---

## 5. Open questions (not answered here — need owner/product sign-off before implementation)

1. Chain-reference storage: new `chain_id`/`chain_position` columns, or JSON-only in `attribution_json`?
2. Payment model for a chain: N separate prepayment intents, or one combined intent for the whole chain?
3. Can a patient cancel/reschedule **one** slot out of a confirmed chain, or only the whole chain at once?
4. Is package/product-covered payment allowed for multi-slot chains at all in MVP, or cash/prepayment only?
5. Cap configuration granularity: org-level setting (fast to ship) vs per-specialist override (matches
   literal "doctor max-consecutive-slot" phrasing) — which for MVP?
