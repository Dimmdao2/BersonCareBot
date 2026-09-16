# DEV doctor API under port-context — blind audit (2026-08-16)

Authority: owner report of 2026-08-16; `AGENTS.md` §§1, 5, 9, 10, 24. This is an audit artifact, not a product fix.

## Blind kill-set (written before test inspection)

| Fault / owner-visible outcome | Method | Result |
| --- | --- | --- |
| Doctor session is lost and doctor API answers `401` | live canonical `dev:doctor` session and authenticated requests | **PASS on current DEV**; historical `401`s are present in `main-dev-5200.log` before a new session, the same requests are `200` after it. |
| Schedule cannot read or save through a staff principal | `GET` plus a create/deactivate probe | **PASS**; create returned `200`, then the same row was deactivated with `200`. |
| Dialogs cannot load | `GET /api/doctor/messages/conversations` | **PASS** (`200`). |
| Comments cannot load their patient list | `GET /api/doctor/comments/patients` | **PASS** (`200`). |
| Patients, calendar, summary, unread count fail under `port-context` | authenticated read requests | **PASS** (all `200`). |
| Payment-link creation is blocked by an absent provider/runtime configuration | admin settings projection plus route/fixture inspection | **BLOCKED — DEV configuration/catalog**, not a DB-principal failure. |

No existing tests were read before this table was derived. No new acceptance test was added: every repeatable doctor request in scope is green on the current implementation; the remaining payment limitation is a one-time DEV catalog/configuration fact. No product source was changed.

## Reproduction evidence

All HTTP checks used `http://127.0.0.1:5200`, the shared DEV server, and this canonical session setup:

```bash
curl -sS -L -c <jar> -b <jar> \
  'http://127.0.0.1:5200/api/auth/dev-bypass?token=dev%3Adoctor' >/dev/null
curl -sS -b <jar> http://127.0.0.1:5200/api/me
```

`/api/me` returned `200` with role `doctor`. With that same cookie jar, the following all returned `200`:

```text
GET /api/doctor/pending-program-tests/summary
GET /api/doctor/messages/unread-count
GET /api/doctor/messages/conversations
GET /api/doctor/patients
GET /api/doctor/comments/patients
GET /api/doctor/booking-engine/calendar?from=2026-08-01&to=2026-08-31
GET /api/doctor/booking-engine/working-hours
GET /api/doctor/booking-engine/working-schedule-templates
GET /api/doctor/schedule/nearest-free-window
```

The schedule write probe was browser-equivalent (CSRF requires an origin):

```bash
curl -sS -b <jar> -H 'Origin: http://127.0.0.1:5200' \
  -H 'content-type: application/json' -X POST \
  --data '{"weekday":6,"startMinute":1,"endMinute":2,"replace":false}' \
  http://127.0.0.1:5200/api/doctor/booking-engine/working-hours
```

It returned `200`; `DELETE /api/doctor/booking-engine/working-hours?id=<returned-id>` with the same origin returned `200`. The endpoint is a deactivation API, so the probe row remains inactive (`isActive:false`) rather than physically deleted.

Current log correlation used:

```bash
tail -n 220 /home/dev/brain/host-orch/main-dev-5200.log
```

The log contains repeated historical `401` responses for `pending-program-tests/summary`, `messages/unread-count`, and `patients/<id>/messages-snapshot`, followed by `dev-bypass → /api/me 200` and the same endpoints returning `200`. This rules out a common `port-context` grant/principal failure for the current service process; the observed common failure is absence of a usable session on those requests.

The owner attachments also contain client fetches to `http://127.0.0.1:15200/...`. At audit time:

```bash
ss -ltnp '( sport = :15200 )'
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:15200/api/me
```

showed no listener and curl exit `7`. Client doctor fetches are relative (for example `useDoctorPendingProgramTestsCount.ts` uses `/api/doctor/pending-program-tests/summary`), so a browser document opened from `:15200` cannot share the `:5200` session/origin. `apps/webapp/next.config.ts` merely permits `:15200` as a development origin; it does not run a server there.

## Payment-link classification and handoff

The payment test was intentionally stopped before any external provider call:

```bash
curl -sS -L -c <admin-jar> -b <admin-jar> \
  'http://127.0.0.1:5200/api/auth/dev-bypass?token=dev%3Aadmin' >/dev/null
curl -sS -b <admin-jar> http://127.0.0.1:5200/api/admin/settings
```

The redacted projection reports `booking_payment_enabled: {"value":false}` and no `booking_payment_providers` row. The registry gateway resolves that setting before invoking an adapter (`apps/webapp/src/infra/payments/registryAcquiringGateway.ts`); absent/disabled configuration returns a failure and the charge route returns `503` without recording a payment. This is a DEV configuration limitation, not a permission/principal failure.

The sole patient exposed to `dev:doctor` is `00000000-0000-0000-0000-000000000001`, declared in `deploy/postgres/dev-c2-dev-bypass-fixture.sql:58`. It is a PostgreSQL UUID but not an RFC UUID accepted by the route's `z.string().uuid()` check in `apps/webapp/src/app/api/doctor/patients/[userId]/acquiring-charge/route.ts:43`; the endpoint therefore returns `400 {"error":"invalid_user_id"}` before provider resolution. This blocks an end-to-end doctor payment-link probe through the canonical dev-bypass fixture.

### Exact worker/lead handoff

1. Do not change grants, add a login, restore `DATABASE_URL`, or change production code for the `401`s. Re-open the doctor workspace at `http://127.0.0.1:5200`, establish a fresh same-origin session, and verify `GET /api/me` before retrying the UI. There is no current server on `:15200`.
2. To make the DEV payment path testable, use the normal admin settings path to configure an explicitly safe DEV payment provider and enable payments, or keep it disabled and present the limitation explicitly. Do not add credentials to env.
3. If canonical dev-bypass must exercise payment creation, change the DEV fixture source `deploy/postgres/dev-c2-dev-bypass-fixture.sql` so its patient ID passes the route's UUID validator, then reapply the sanctioned DEV fixture process. This is fixture/catalog work; it is not a port-context or grant repair.

No TEST, PROD, `main`, live grants, migrations, or product code were changed.
