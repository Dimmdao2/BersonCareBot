# Test or view classification — independent patient absolute-link integration audit (#787)

Audit exact integrated base `eb402b6d0` in a dedicated
`wt/branding-domain-absolute-links-20260907` worktree. This is the focused implementation gate for
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` B3's requirement that the
single resolved surface is reused for absolute links after staff/patient Host separation.

Before every action follow the `AGENTS.md` heading-map gate. Read the full applicable §§5, 9, 10,
10a, 10b, 11, 12 and 24, plus `README.md`, `docs/ORCHESTRATION_BINDINGS.md`, the full active branding
plan (especially §§1.1–1.3, B1–B8, C2–C5a), surface/domain map, accepted core/config audit artifacts,
and relevant module docs. Use code-search before exact/broad grep.

Before reading existing tests, record a blind kill-set and classify each item independently as
`test` or `view`. You may commit only missing stable behavior tests, one audit artifact and its queue
verdict. Never fix product code. Revert every temporary fault injection. Do not access or mutate
TEST/PROD hosts, DNS, TLS, services, firewall, runtime env or live clinic data.

## Scope and oracle

Trace every live non-test `env.APP_BASE_URL`/staff-origin use and every patient URL builder. Do not
mechanically replace all occurrences:

- staff/admin/operator links remain on the staff surface;
- request-bound patient redirects/links use the already trusted `ResolvedSurface.publicOrigin` when
  the request Host is the relevant authority;
- organization-bound patient notifications, reminders, payments and background deliveries use one
  existing or extended canonical surface seam from a trusted organization id: current eligible
  active custom hostname when present, otherwise the permanent
  `https://<slug>.<patient-base-host>` technical origin;
- truly unscoped patient entry may use the configured `PATIENT_APP_ORIGIN`, whose absent DEV/TEST
  fallback remains `APP_BASE_URL`;
- a pending/failed/suspended custom binding never becomes a link target and never damages the slug;
- no browser body/query/cookie may choose organization, final hostname, edge target or readiness.

Exclude the organization-settings URL rendering currently owned by the parallel
`branding-domain-ui-20260907` workstream; report overlap, do not edit its files. Include reachable
patient-facing links elsewhere: notification/message/broadcast delivery, reminder materialization,
patient package and appointment payment returns, booking confirmations/ICS, patient booking-done
flows, and patient OAuth/error redirects where the accepted C2 request-surface contract requires it.
Explicitly distinguish staff payment/invite/OAuth/operator URLs that correctly remain on Therapysto.

## Test discipline

The inventory/call-site classification is `view`; never create tests that count/search source strings,
pin imports, file names, SQL, formatting, UI text, DOM or element counts. A behavior test is justified
only for an expensive silent user-visible misdirection such as a patient notification/payment return
opening Therapysto or another clinic's host. Prefer the cheapest public helper/service/route boundary;
do not duplicate the same oracle across every producer. For each retained test, name the failure,
owner/plan oracle and one fault injection that makes it red. Delete harmful tests encountered in the
files you legitimately touch.

Run the smallest relevant current suites, webapp typecheck, scoped lint and `git diff --check`.
Deliver a binary PASS/FAIL artifact containing the full classified reachable call-site list, exact
commands/results, fault injections and confirmation of reversion, and only concrete MUST FIX findings
with patient impact. Stage explicit paths only, never `git add -A`; commit before ending; do not push
or land.
