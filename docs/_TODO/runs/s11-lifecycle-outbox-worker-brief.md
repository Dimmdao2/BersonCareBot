# Worker brief — S11 reliable lifecycle/outbox and patient Notifications

Read `AGENTS.md` first: map plus §1 migrations, §5 one common passage/clean architecture, §10a–§10b tests,
§21 UI text if touched, and §24 worker discipline. Read the adjacent module `*.md` files before changing a
module. Authority is `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, S11
`PAY-REL-01..03` and `PAT-NOTIF-01..03`, plus `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §21 and §24.1.

## Objective

Implement the whole S11 stage as one coherent candidate:

1. Replace the post-commit synchronous `booking.payment_captured` gap with the repository's existing durable
   delivery/outbox machinery. The successful provider webhook must atomically commit canonical money/status and
   durable lifecycle work. Return `200` only after that transaction; transient internal failure before commit must
   stay non-2xx. Repeated webhook/worker execution must not duplicate effects.
2. The resident worker must pick lifecycle work promptly and retry it durably with existing backoff/terminal
   failure/operator-incident semantics. Patient projection repair, calendar, reminders and external messages must
   be independently idempotent so one failed step can be replayed without repeating successful steps.
3. Extend the existing `patientNotifications` persistent feed and existing lifecycle/push route — do NOT create a
   second inbox. Inventory every current producer of patient-visible booking/appointment/visit/payment events and
   make the existing product facts appear in Notifications independent of source (browser, widget, app) and
   independent of whether Telegram/MAX/email/web-push is selected. At minimum cover actual existing producers for
   created/awaiting payment, rescheduled, cancelled/no-show, appointment reminder, captured payment and
   refund/retention where those facts already exist. Do not invent new business events that the product does not
   currently produce.
4. Remove the coupling where disabled patient/staff messages suppress reminders or calendar. Channel preferences
   affect external delivery/push only; the persistent in-app event remains.
5. Reuse and parameterize the existing queue roots, outgoing delivery worker, lifecycle step idempotency, and
   `patientNotifications` store. Explicitly answer §5 before adding any function/table/abstraction: why cannot the
   existing common passage be extended? Prefer extending it. No `any`, no raw DB access outside declared ports.

## Evidence and tests

Write only blind behavioral tests with an independent expensive silent-failure oracle. No DOM/layout/copy/source-
string tests. Required observable kill-set includes: process failure after provider event commit cannot lose the
lifecycle job; duplicate webhook/claim cannot duplicate inbox/payment/message; external-channel suppression still
leaves the inbox event and calendar/reminders; transient consumer failure is retryable; one failed lifecycle step
does not replay already successful steps; events created from each existing source converge on the same inbox.
Where a DB root changes, use the named DEV database only through the documented migration preflight/rollback path;
do not create a disposable database and do not run a live server.

Источник оракула: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, S11 —
«все события должны идти в экран „Уведомления“ через lifecycle/push-путь».

Run focused typecheck/lint/tests and migration generation/preflight gates applicable to the touched paths. Do not
run full CI, do not deploy, do not push. Update S11 checkboxes only for requirements actually implemented, with
specific evidence. Commit explicit task paths (never `git add -A`) to branch `wt/payment-lifecycle-outbox` before
ending. Report commit SHA, changed architecture, tests run, and anything still open. Do not end while a command is
running.

## Allowed scope

- `apps/webapp/src/modules/payments/**`
- `apps/webapp/src/app-layer/booking/**`
- `apps/webapp/src/modules/patient-booking/**`
- `apps/webapp/src/modules/patient-notifications/**`
- `apps/webapp/src/modules/messaging/**`
- relevant payment/booking/integrator API routes and DI wiring
- `apps/webapp/src/infra/repos/**` only for the reused ports/roots
- `apps/webapp/db/schema/**`, `apps/webapp/db/drizzle-migrations/**`, generated migration metadata if required
- `apps/integrator/src/integrations/bersoncare/**`
- `apps/integrator/src/infra/runtime/worker/**` and its existing queue ports only as needed
- adjacent module docs and blind behavioral tests
- S11 evidence lines in the authority plan

Forbidden: unrelated UI redesign, clinic-confirmation booking mode, main/test branches, deployment, production,
new notification inbox, direct provider delivery from a business transaction, or broad refactors outside S11.
