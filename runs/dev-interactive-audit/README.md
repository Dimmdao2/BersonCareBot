# DEV interactive audit harness

`node runs/dev-interactive-audit/run.mjs` runs a bounded Chromium audit of the already-running
canonical DEV webapp at `http://127.0.0.1:5200`. The executable role/page/control matrix is in
`scenarios.mjs`. Each role runs in a separate Chromium process/context. The gate asserts the exact
canonical `/api/me` identity/contact/role, the doctor's and patient's exact organization context,
visits one representative per unique rendered route template, requires the exact final URL (query
included) and a route-specific unique functional/landmark anchor rather than editorial copy, and fails on browser console/page errors, request
failures or HTTP 4xx/5xx. Output includes cold/warm navigation and action latency; `out/` is untracked.

Actual doctor/global-admin/patient login needs `DEV_AUDIT_PASSWORD`; the emails default to the canonical
owner accounts and may be overridden with `DEV_AUDIT_DOCTOR_EMAIL` / `DEV_AUDIT_ADMIN_EMAIL` /
`DEV_AUDIT_PATIENT_EMAIL`. A pre-minted DEV-only patient session may still be passed as
`DEV_AUDIT_PATIENT_SESSION_COOKIE`. Synthetic `dev:*` fixtures are rejected unless
`DEV_AUDIT_ALLOW_SYNTHETIC=1`, and a synthetic run must never be reported as coverage of real data.

Read-only run:

```sh
DEV_AUDIT_PASSWORD='…' node runs/dev-interactive-audit/run.mjs
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

## Role split and aggregation

Run all three roles together when possible. If DEV must be restarted between roles, use one fresh shared
run ID and preserve the JSON artifact printed by each role:

```sh
DEV_AUDIT_RUN_ID='2026-08-16-a' DEV_AUDIT_ROLES=global_admin node runs/dev-interactive-audit/run.mjs
DEV_AUDIT_RUN_ID='2026-08-16-a' DEV_AUDIT_ROLES=doctor node runs/dev-interactive-audit/run.mjs
DEV_AUDIT_RUN_ID='2026-08-16-a' DEV_AUDIT_ROLES=patient \
  DEV_AUDIT_AGGREGATE_ARTIFACTS='runs/dev-interactive-audit/out/result-admin.json,runs/dev-interactive-audit/out/result-doctor.json' \
  node runs/dev-interactive-audit/run.mjs
```

Aggregation is fail-closed: it rejects duplicate roles, a missing role, a different run ID/base URL/organization/
mutation mode, or missing provenance. It never applies a “latest artifact wins” rule.

## What exhaustive means

The runner opens each role's navigation root, reads canonical destinations only from rendered `<nav>` containers,
then performs bounded same-origin role-allowed BFS. The manifest is an oracle, never a queue seed: removing a
canonical destination from rendered navigation makes the gate red. Explicit query/wizard prerequisites are the only
non-navigation seeds. It preserves query-state route templates, obtains dynamic samples only from rendered links,
and fails at the explicit discovery cap rather than truncating. Every seed and discovered template must have exactly
one disposition and a route-specific functional/landmark contract. Before the live pass, the runner verifies every
contract (including the eight patient-card tab contracts) against non-test product source; the live unique/visible
check remains the acceptance truth. A shell, generic form, or arbitrary `data-testid` cannot prove a route.

It inventories rendered form-submit controls and exact link hrefs. A same-origin role-allowed link is
`inspected_navigation` only after its explicitly disposed target was observed/enqueued; links are never mutation
adapters. A control is accepted only when a named adapter classifies it as a reversible cycle, retained DEV evidence,
non-mutating, destructive, or external-provider-dependent; destructive and external controls are recorded but never submitted. Thus this proves the currently rendered DEV surface is accounted
for and that approved reversible controls restore their exact readback. It does not prove unrendered data-dependent
paths, external provider completion, or production behavior.

Focused safety test (does not open DEV):

```sh
node --test runs/dev-interactive-audit/gate-utils.test.mjs runs/dev-interactive-audit/reversible-cycle.test.mjs
```
