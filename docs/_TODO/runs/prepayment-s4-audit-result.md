# Independent audit — S4 patient payment visibility

**Candidate:** `6dba8d108` + lead correction `0b8d6d681` on
`wt/prepayment-s4-patient`. The later branch merge does not change any audited surface:

```bash
git diff --exit-code 0b8d6d681..HEAD -- \
  apps/webapp/src/app/book/pay/PublicBookingPayClient.tsx \
  apps/webapp/src/app/app/patient/booking/pay/PatientBookingPayClient.tsx \
  apps/webapp/src/app/app/patient/booking/BookingUpcomingSection.tsx \
  apps/webapp/src/app/api/booking/payment-status/route.ts \
  apps/webapp/src/modules/patient-booking/service.ts \
  apps/webapp/src/shared/lib/paymentStatusView.ts \
  apps/webapp/src/shared/ui/patient/PaymentLinkQrCode.tsx
# exit 0
```

## VERDICT: PASS

`S4.1 → PASS`, `S4.2 → PASS`, `S4.3 → PASS` on the committed candidate. Live UI is a
post-landing gate under `AGENTS.md` §24.3/§24.7 and is listed under **NOT CHECKED** rather than
silently represented by source inspection.

## Classification: test or reading

1. **Status matrix — RUN.** Both registries are finite public inputs, so prediction from reading
   would be weaker than executing every pair. Source reading is used only to map the classifier
   output to both screen predicates.
2. **Expired/stale payment — RUN + READ.** The provider-expiry path has executable domain/adapter
   checks; timer suspension, browser history, and the independent provider-side barrier require reading
   the navigation and invoice wiring. A live provider charge is outside this pre-landing audit.
3. **Deadline source and zones — READ + RUN.** Data lineage is established from the service/page
   wiring; the shared formatter is executed against the same instant in every explicit zone named
   by the command below.
4. **Phone QR — READ + RUN a cost proxy.** Visibility/mounting follow from the exact React/CSS
   structure. The QR implementation itself is executed with a representative provider URL to
   measure its cold cost. Actual phone viewport remains a post-landing live check.
5. **Ownership door — RUN + READ.** The service is executed with owner/foreign identities; the
   live DEV capability definition and route/principal chain are inspected because the existing
   route mock alone is not an ownership oracle.
6. **N+1 — RUN + READ.** DEV rows are counted with a read-only query, then the creation/card paths
   are read to determine the product bound and requests per card.

## 1. Status matrix

**Run:**

```bash
pnpm --dir apps/webapp exec tsx -e "import { APPOINTMENT_STATUSES } from './src/modules/booking-engine/types.ts'; import { PAYMENT_INTENT_STATUSES } from './db/schema/bookingPayments.ts'; import { classifyPaymentIntentStatus, classifyPrepaymentBookingStatus } from './src/shared/lib/paymentStatusView.ts'; for (const appointmentStatus of APPOINTMENT_STATUSES) for (const intentStatus of PAYMENT_INTENT_STATUSES) console.log(JSON.stringify({appointmentStatus,intentStatus,bookingView:classifyPrepaymentBookingStatus(appointmentStatus),intentView:classifyPaymentIntentStatus(intentStatus)}));"
```

**Observed:** the command emitted all **65 pairs** (13 appointment statuses × 5 intent statuses).

- `pending|processing` plus any of `cancelled_by_patient`, `cancelled_by_specialist`,
  `late_cancellation`, `no_show` produces the cancelled screen and no pay action.
- `pending|processing` plus `paid`, `confirmed`, `completed`, `visit_confirmed`, or
  `charged_to_package` produces the non-payable settled screen, not a cancellation.
- `rescheduled` and `manual_review_required` also suppress payment without saying the booking was
  cancelled. A normal reschedule never exposes its intermediate `rescheduled` status because both
  status writes happen inside the same DB transaction.
- `succeeded`, `failed`, and `cancelled` intents expose no pay action for any appointment status.

**Concrete failing input:** none for the two in-scope false outcomes (cancelled over a live booking,
or payable over a dead booking).

**Lead question, not S4 FAIL:** `manual_review_required + pending|processing` is classified as
`settled`, so both pay screens say the booking is confirmed even though the canonical labels are
“На проверке” / “Требует решения”. `rescheduled + pending|processing` has the same copy but is not
observable in the normal transactional path. S4 has no checkbox defining review/reschedule copy,
so the audit does not invent a fix.

## 2. Dead link and suspended time

**Run:**

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/payments/service.test.ts src/infra/payments/yookassaPaymentProvider.unit.test.ts src/app/api/booking/payment-status/route.route.test.ts src/modules/patient-booking/canonicalCreate.d14.test.ts"
```

**Observed:** **4 test files / 33 tests PASS**. The domain passes the appointment deadline as invoice
expiry and refuses an adapter that cannot expire an invoice. Reading the final adapter confirms
that the invoice request sends `expires_at: invoice.expiresAt` to `POST /v3/invoices`.

On both pay screens the deadline timeout and recurring interval update from `Date.now()`; once
expired, the render branch contains no visible URL, button, or QR. The cabinet card only links to
our pay screen, so a stale `awaiting_payment` projection awaiting the backend expiry tick cannot jump directly to
the provider.

A frozen/BFCache page can briefly retain stale React state because `goToProvider()` does not repeat
the time check synchronously. A copied URL, QR screenshot, browser back, or click before the overdue
timer callback can therefore still *reach* the provider page. It cannot make the expired invoice
payable through the current creation path: provider `expires_at` is the independent barrier, so the
countdown is not the only barrier.

**Concrete failing input:** none in S4. DEV had no live intent with which to perform a real provider
round trip. Exact read-only measurement:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -At -F $'\\t' \
  -c "BEGIN READ ONLY; SELECT count(*) FILTER (WHERE a.status = 'awaiting_payment') AS awaiting_total, count(*) FILTER (WHERE a.status = 'awaiting_payment' AND a.payment_deadline_at IS NULL) AS awaiting_without_deadline, count(*) FILTER (WHERE a.status = 'awaiting_payment' AND a.payment_deadline_at <= pg_catalog.clock_timestamp()) AS awaiting_past_deadline, count(*) FILTER (WHERE i.status IN ('pending','processing') AND a.id IS NOT NULL) AS pending_intents_with_appointment FROM public.be_appointments a LEFT JOIN public.be_payment_intents i ON i.appointment_id = a.id; ROLLBACK;"
# 0  0  0  0
```

**Test-quality note:** the passing YooKassa test file exercises invoice error classification but
does not independently assert `expires_at` in the outgoing HTTP body. The current mapping is present
by direct inspection; missing regression coverage is not broken product behavior and belongs to
the already completed S2 gate, not an invented S4 task.

## 3. Exact deadline and time zones

**Read:** `loadBookingPaymentStatus` returns `appointment.paymentDeadlineAt` obtained from the
canonical appointment. Neither client imports or reads `booking_prepayment_wait_minutes`; both only
parse the returned ISO instant. The card asks the same endpoint for the same field.

**Run:**

```bash
pnpm --dir apps/webapp exec tsx -e "import { formatBookingDateTimeMediumRu } from './src/shared/lib/formatBusinessDateTime.ts'; const instant='2026-09-11T21:40:00.000Z'; for (const zone of ['Europe/Moscow','Asia/Yekaterinburg','UTC']) console.log(zone+'\\t'+formatBookingDateTimeMediumRu(instant,zone));"
```

**Observed:** the same instant rendered as `12 сент. 2026 г., 00:40` in `Europe/Moscow`,
`12 сент. 2026 г., 02:40` in `Asia/Yekaterinburg`, and `11 сент. 2026 г., 21:40` in `UTC`.

- `/book/pay` and `/app/patient/booking/pay`: global `app_display_timezone`, resolved server-side by
  `getAppDisplayTimeZone()`.
- Cabinet appointment card: branch timezone from `canonicalInPersonContext.timezone`; global app
  timezone only as fallback.

**Consequence:** the stored instant is identical, but the wall-clock label can differ between the
card and either pay screen when branch and global zones differ. The lead explicitly accepts this;
it is not changed.

**Concrete failing input:** none.

## 4. QR at phone width

**Read:** `<PaymentLinkQrCode>` is mounted under `<div className="hidden md:block">`. Therefore the
QR is not painted below Tailwind's `md` breakpoint, but this is CSS-only hiding: the component is
still mounted, `qrcode` is a static client import, and its effect still calls `QRCode.toString()`.

**Run (representative URL; cost proxy, not a browser benchmark):**

```bash
node --input-type=module -e "const t0=performance.now(); const {default:QRCode}=await import('./apps/webapp/node_modules/qrcode/lib/index.js'); const t1=performance.now(); const url='https://yookassa.ru/checkout/payments/v2/contract?orderId=00000000-0000-4000-8000-000000000000'; const svg=await QRCode.toString(url,{type:'svg',errorCorrectionLevel:'M',margin:1}); const t2=performance.now(); console.log(JSON.stringify({importMs:+(t1-t0).toFixed(3),generationMs:+(t2-t1).toFixed(3),svgBytes:Buffer.byteLength(svg),urlBytes:Buffer.byteLength(url)}));"
du -sb node_modules/.pnpm/qrcode@*/node_modules/qrcode
```

**Observed on this host:** cold Node import **40.49 ms**, one SVG generation **8.712 ms**,
generated SVG **2360 bytes**, installed package tree **135364 bytes**. These are not browser timing
claims; they prove that the hidden work is real rather than conditional on viewport.

**Verdict:** the owner requirement is about what the patient sees, and the QR is not painted on a
phone. The unnecessary phone bundle/compute cost has no S4 checkbox and is not a FAIL.

**Concrete failing input:** none for visibility.

## 5. Ownership door and read/principal delta

**Run (public service boundary with owner/foreign identities):**

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
pnpm --dir apps/webapp exec tsx -e "import { createPatientBookingService } from './src/modules/patient-booking/service.ts'; void (async()=>{let appointmentReads=0,paymentReads=0,ownerReads=0; const row={id:'booking-owner',canonicalAppointmentId:'appointment-owner',userId:'owner-user'}; const svc=createPatientBookingService({bookingsPort:{getByIdForUser:async (_id:string,userId:string)=>{ownerReads++;return userId==='owner-user'?row:null;}} as never,syncPort:{} as never,bookingEngine:{getAppointment:async ()=>{appointmentReads++;return {id:'appointment-owner',organizationId:'org-1',status:'awaiting_payment',paymentDeadlineAt:'2026-09-11T21:40:00.000Z'};}} as never,payments:{getAppointmentPaymentSummary:async ()=>{paymentReads++;return {intent:null};}} as never,outboundMessageQueue:{} as never}); console.log(JSON.stringify({foreign:await svc.getBookingPaymentStatus('booking-owner','foreign-user'),countsAfterForeign:{ownerReads,appointmentReads,paymentReads}})); console.log(JSON.stringify({owner:(await svc.getBookingPaymentStatus('booking-owner','owner-user')).ok,countsAfterOwner:{ownerReads,appointmentReads,paymentReads}}));})();"
```

**Observed:** foreign caller → `not_found`, **0 appointment reads / 0 payment reads**; owner → `ok`,
**1 appointment read / 1 payment read**.

**Live DEV introspection:** the exact command

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -At \
  -c "BEGIN READ ONLY; SELECT pg_get_functiondef('app.read_current_patient_booking_row(uuid,text)'::regprocedure); ROLLBACK;"
```

showed that the patient capability filters the row by current `organization_id`, current
`platform_user_id`, and active enrollment before returning it. The route first obtains the patient
principal from `requirePatientApiBusinessAccess`; a foreign booking therefore cannot even resolve
an organization through the patient capability. The service repeats ownership with
`getByIdForUser(bookingId, session.userId)` before reading appointment/payment details.

The candidate replacement did not add a read or principal. Before it,
`resolveCanonicalAppointmentOrganizationId()` called `loadCanonicalAppointment()` and discarded
everything but `organizationId`; after it, `loadBookingPaymentStatus()` makes the same loader call
and retains `paymentDeadlineAt` and `status`. The route-level organization resolution existed both
before and after.

**Concrete failing input:** `booking-owner + foreign-user` returns `not_found`, not data.

**Test-quality note:** the existing route “foreign booking” test makes its own service mock return
an error and asserts an internal call argument. By §10a that test alone is not ownership evidence;
the service run and live function definition above are the evidence used here.

## 6. Card N+1

**Run (named DEV database, read-only):**

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -At -F $'\\t' \
  -c "BEGIN READ ONLY; SELECT (SELECT count(*) FROM public.patient_bookings WHERE status = 'awaiting_payment') AS awaiting_rows, (SELECT count(DISTINCT platform_user_id) FROM public.patient_bookings WHERE status = 'awaiting_payment') AS patients, (SELECT coalesce(max(n),0) FROM (SELECT count(*) AS n FROM public.patient_bookings WHERE status = 'awaiting_payment' GROUP BY platform_user_id) x) AS max_per_patient, (SELECT coalesce(max(n),0) FROM (SELECT count(*) AS n FROM public.patient_bookings WHERE status = 'awaiting_payment' AND slot_end > pg_catalog.clock_timestamp() GROUP BY platform_user_id) x) AS max_upcoming_per_patient; ROLLBACK;"
```

**Observed:** `awaiting_rows=0`, `patients=0`, `max_per_patient=0`,
`max_upcoming_per_patient=0` on current DEV.

Reading shows a GET per rendered `awaiting_payment` card. There is no per-patient count cap; slot
overlap prevents conflicting times, not several distinct future bookings. The practical count is
limited by how many bookings a person can submit during the configured payment window, so ordinary
use is a small request set while deliberate rapid booking can create more. With no live rows and no
owner performance checkbox this is a visible N+1 but not a measured current cost and not an S4 FAIL.

**Concrete failing input:** none measured.

## Validation

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp typecheck"
# PASS, rc=0, 74s
```

## NOT CHECKED

- Live phone and desktop viewports on the candidate: `ss -ltnp '( sport = :5200 )'` followed by
  `readlink -f /proc/3339683/cwd` showed that the shared `:5200` server runs the main
  `feat/doctor-ui-rebuild` worktree, not this unlanded candidate; §1a/§24.3 prohibit a second Next
  server. This remains the required post-landing live gate.
- Real YooKassa invoice after `expires_at`, including browser back to an already-open hosted page:
  DEV has no awaiting appointment or pending appointment intent, and no real charge was created.
- A real cross-user HTTP request with separate owner and foreign browser sessions. The service boundary and
  live patient capability were checked instead.
- Notification delivery (S5), intermediate public check screen (S3), doctor modal (S6), and patient
  cancellation-reason copy (S7): outside S4.
