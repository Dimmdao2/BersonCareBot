# MISSION: stages 1 and 2 of the tariff-mechanics plan (code, workspace-write)

## Authority — read IN FULL before touching code

- **Plan (your checklist, the only source of «done»):** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a`
  — you implement **stage 1 (1.1–1.4) and stage 2 (2.1–2.10) ONLY**. Nothing from stages 3–7. Do not add checkboxes.
- **Model canon (classes, layout, behaviour, wording):** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md`
  — §1 owner rulings, §2 verified code facts, §3 classes, §4 layout, §5 behaviour at the limit.
- **Rules you must obey:** `AGENTS.md`, `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`,
  `.cursor/rules/webapp-tests-lean-no-bloat.mdc`, `.cursor/rules/plan-authoring-execution-standard.mdc`,
  plus any `.cursor/rules/*.mdc` matching files you touch.

## Exact checkbox set you own (quote it back in your report, line by line)

Stage 1: **1.1** class field on every mechanic, names exactly `возможность | места | запас | объём | никогда` —
invent no other class. **1.2** the type system forbids the impossible: no units and no limit for `возможность` and
`никогда` (compile error, not a runtime ignore), no period for `места` and `запас`, bytes only for `объём`.
**1.3** resolver and usage projections read the class, not the presence of `quotaUnits`. **1.4** webapp typecheck
green + arbiter check: write a number onto a `возможность` mechanic by hand and prove the build fails.

Stage 2: **2.1** move to `возможность` and strip fake units: booking, exercise_catalog, exercise_packages,
subscriptions, payments, patient_app_paid_subscription, branding, custom_domain, courses, mailings, cms_pages.
**2.2** migration drops trigger `app.enforce_courses_snapshot_quota`; courses stays a toggle; prove by behaviour.
**2.3** migration drops the `0270` CMS page-count trigger; CMS stays a toggle. **2.4** with CMS off, the clinic
profile page, the booking page and the external-site widgets keep working — prove on dev. **2.5** patient_card and
patient_app become class `никогда`: they disappear from the constructor and cannot take a number. **2.6** files keep
class `объём`, unit bytes only, unit «items» removed. **2.7** own notification templates get NO separate mechanic —
verify they are gated by `branding` (`api/admin/notification-templates`) and add the guard call if they are not.
**2.8** bulk mailings only over the clinic's own channels; platform SMTP and bots serve login codes, reminders and
notifications only — check #1071 first so the work is not done twice. **2.9** material ratings switched off
platform-wide as a setting, not a tariff mechanic. **2.10** stage check: constructor opens, the eleven mechanics show
only a checkbox, demo clinics A/B on dev keep their previous access, affected tests green.

## Hard constraints

- **Numbers stay in exactly two places after your stages:** specialist seats and file volume. Patients and branches
  are added later by stage 4 — do not create them.
- **Never gate reading.** A disabled mechanic must block creating and changing; everything already created stays
  visible and exportable. Gating a read path would hide content already assigned to a patient — that is a defect.
- **Do not touch:** patient card / patient app as controllable mechanics, treatment-program templates, exercise-complex
  templates, patient messaging, cancellation policies (they get no toggle at all), the support ticket system,
  billing (#1057), the test-runner config, production.
- **Migration numbers:** use a temporary local number and say so in your report — the final number is assigned by the
  lead at merge. Do not renumber other people's migrations.
- **Never `git add -A`** — explicit paths only. Commit in the clone you are running in; do not push, do not merge.

## Verification you must produce (a report without this is not accepted)

For every checkbox: `status → code evidence (file:line) → test evidence → runtime evidence → deferred reason`.
Specifically:

- Behaviour probes, not registry claims: `scripts/check-s4-entitlement-coverage.ts:64-68` deliberately does not check
  the guard call, so a green coverage run proves nothing. For courses and CMS call the real create path with the
  mechanic off and show the refusal.
- Tests: each new or changed test must name in one line the breakage it catches («fed X → got wrong Y»). Prove it by
  introducing that breakage by hand and showing the test goes red. Assertions about source text, line order or import
  presence are forbidden; extend the existing test file of the same area instead of adding a file with one `it`.
- Targeted runs only: `pnpm --filter webapp typecheck`, `lint` and the affected test files. **Do not run the full CI** —
  the lead runs it once at stage 7 through the shared lock.
- Any new DB function or trigger: check the privileges under the role that actually executes it, and say so.

## If you find something outside this brief

Report it as a question at the end. Do not fix it, do not extend scope, do not add plan items. A finding without a
matching checkbox in the plan is a question for the owner, never a task.
