# DEV interactive audit harness

`node runs/dev-interactive-audit/run.mjs` runs a bounded Chromium audit of the already-running
canonical DEV webapp at `http://127.0.0.1:5200`. The executable role/page/control matrix is in
`scenarios.mjs`. It uses the actual owner identities by default, visits the declared role routes plus
rendered in-role links, opens rendered tabs, proves body content, records same-origin failures/browser
errors and reports cold/warm navigation latency. Output under `out/` is intentionally untracked.

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

Named reversible mutations (registration/trial/paid policies, one service-location availability pair,
one patient reminder switch) are opt-in:

```sh
DEV_AUDIT_MUTATE=1 DEV_AUDIT_PASSWORD='…' DEV_AUDIT_PATIENT_SESSION_COOKIE='…' \
  node runs/dev-interactive-audit/run.mjs
```

Every mutation adapter performs `read -> change -> readback -> restore -> final readback` and records
statuses, result and duration. Delivery, payment, registration, contact/phone, password and deletion
controls remain `not_mutated_safety`. Do not run this harness against TEST or PROD.
