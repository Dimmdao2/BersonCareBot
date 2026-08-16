# DEV interactive audit harness

`node runs/dev-interactive-audit/run.mjs` runs a bounded Chromium audit of the already-running
canonical DEV webapp at `http://127.0.0.1:5200`. The executable role/page/control matrix is in
`scenarios.mjs`. It uses the actual owner identities by default, visits the declared role routes plus
rendered in-role links, opens rendered tabs, proves body content, records browser console/page errors,
failed requests and all HTTP 4xx/5xx, and reports cold/warm navigation plus action latency. Output under
`out/` is intentionally untracked.

Actual doctor/global-admin login needs `DEV_AUDIT_PASSWORD`; the emails default to the canonical owner
addresses and may be overridden with `DEV_AUDIT_DOCTOR_EMAIL` / `DEV_AUDIT_ADMIN_EMAIL`. The actual
patient has no email-login contract, so pass the already-minted DEV-only session cookie value as
`DEV_AUDIT_PATIENT_SESSION_COOKIE`. Synthetic `dev:*` fixtures are rejected unless
`DEV_AUDIT_ALLOW_SYNTHETIC=1`, and a synthetic run must never be reported as coverage of real data.

Read-only run:

```sh
DEV_AUDIT_PASSWORD='…' DEV_AUDIT_PATIENT_SESSION_COOKIE='…' \
  node runs/dev-interactive-audit/run.mjs
```

Named control checks are opt-in when they write: registration/trial/paid policies, one doctor weekly
working-hours row, one service-location availability tuple, and one patient reminder enable/time value.
The patient chat check appends one clearly labelled DEV audit message and verifies it is visible; chat is
append-only, so this one row is intentionally retained. The daily-warmup deep-link and phone-change
surface checks are read-only and run even without `DEV_AUDIT_MUTATE=1`.

```sh
DEV_AUDIT_MUTATE=1 DEV_AUDIT_PASSWORD='…' DEV_AUDIT_PATIENT_SESSION_COOKIE='…' \
  node runs/dev-interactive-audit/run.mjs
```

Every reversible adapter performs `read -> change -> readback -> restore -> final readback`, restores in
`finally` after a successful change, and records statuses, result and duration. Phone-change stops after
the bind-phone surface opens: it never submits a number. Delivery, payment, registration, password and
deletion controls remain `not_mutated_safety`. The runner rejects every base URL except the canonical
`http://127.0.0.1:5200`; do not adapt it to TEST or PROD.

Focused safety test (does not open DEV):

```sh
node --test runs/dev-interactive-audit/reversible-cycle.test.mjs
```
