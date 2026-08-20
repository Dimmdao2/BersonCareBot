# DEV interactive audit harness

`node runs/dev-interactive-audit/run.mjs` runs a bounded Chromium audit of the already-running
canonical DEV webapp at `http://127.0.0.1:5200`. The executable role/page/control matrix is in
`scenarios.mjs`. Each role runs in a separate Chromium process/context. The gate asserts the exact
canonical `/api/me` identity/contact/role, the doctor's and patient's exact organization context,
visits one representative per unique rendered route template, requires the exact final URL (query
included) and a route-specific unique functional/landmark anchor rather than editorial copy, and fails on browser console/page errors, request
failures or HTTP 4xx/5xx. Output includes cold/warm navigation and action latency; `out/` is untracked.

Actual doctor/global-admin/patient login needs `DEV_AUDIT_PASSWORD`; the emails default to the canonical
owner addresses and may be overridden with `DEV_AUDIT_DOCTOR_EMAIL`, `DEV_AUDIT_ADMIN_EMAIL`, or
`DEV_AUDIT_PATIENT_EMAIL`. A pre-minted DEV-only patient session can instead be passed as
`DEV_AUDIT_PATIENT_SESSION_COOKIE`. Synthetic `dev:*` fixtures are rejected unless
`DEV_AUDIT_ALLOW_SYNTHETIC=1`, and a synthetic run must never be reported as coverage of real data.

Read-only run:

```sh
DEV_AUDIT_PASSWORD='…' \
  node runs/dev-interactive-audit/run.mjs
```

Named control checks are opt-in when they write. All saves are driven through rendered controls, then
reloaded and checked against the public read surface. They cover registration/trial/paid policy,
doctor `POST replace=true` weekly schedule, lossless service/location availability, both program and
warmup reminder toggles/time dialogs, a real chat send, and the payment-link control. The latter two
are append-only DEV evidence and are explicitly marked retained. Read-only runs still cover the exact
three identities, every route template, all eight real Dmitry patient-card tabs, the doctor comments
patient list, the payment control surface, the patient home warmup CTA, and phone-bind surface.

```sh
DEV_AUDIT_MUTATE=1 DEV_AUDIT_PASSWORD='…' \
  node runs/dev-interactive-audit/run.mjs
```

Every reversible adapter performs `read -> UI change -> exact readback -> UI restore -> final exact
readback`, restores in `finally` after a successful change, and records result and duration. Phone-change
stops after the bind-phone surface opens: it never submits a number. Password, deletion, contact-change
and external-delivery controls remain outside the mutation boundary. The runner rejects every base URL except the canonical
`http://127.0.0.1:5200`; do not adapt it to TEST or PROD.

To restart DEV between roles, use `DEV_AUDIT_ROLES=global_admin`, `doctor`, or `patient`. A partial
artifact deliberately remains non-green with `missing_role_artifact`; set
`DEV_AUDIT_AGGREGATE_ARTIFACTS=artifact-a.json,artifact-b.json` on the final role run to aggregate all
three role artifacts. Missing roles can never become PASS.

Focused safety test (does not open DEV):

```sh
node --test runs/dev-interactive-audit/gate-utils.test.mjs runs/dev-interactive-audit/reversible-cycle.test.mjs
```
