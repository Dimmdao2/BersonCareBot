# Independent audit — platform delivery audience split (#787)

Audit exact product candidate `87e7cb0ac40658d9a13af467d0b47f64f209d33e`. This is an acceptance gate,
not a source of new scope. Do not fix production code.

## Mandatory reading and authority

1. Run `grep -n '^## \|^### ' AGENTS.md`, then read completely `AGENTS.md` §1b, §2, §3, §4,
   §4a, §5, §9, §10, §10a, §10b, §12 and §24 before inspecting tests or writing any.
2. Read `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.5 and the full
   current text of `TPB-12a`, `TPB-12b`, `TPB-13a` and `C3` as the owner checklist.
3. Read the complete candidate diff from its base `4426f8621` before verdict. Inspect migration rights under
   `AGENTS.md` §1 “Миграции schema B”, “Миграция не выдаёт и не отзывает права” and “Перед приземлением
   миграции — разбор её прав”.

Источник оракула: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`:
«Patient intent не уходит через Therapysto credential, а staff intent не уходит через TherapyGo credential».

## Blind behavioral kill-set

Before reading existing tests, write the kill-set in the audit report for these expensive silent failures:

1. A staff operational notification is sent with a TherapyGo SMTP/Telegram/MAX credential.
2. A patient notification or authentication intent is sent with a Therapysto platform credential.
3. A verified clinic credential is selected for staff, or another organization's clinic credential is selected.
4. A patient without a ready clinic override fails to use TherapyGo; a selected ready clinic override silently
   falls back to the platform sender after provider failure.
5. A caller bypasses the common typed dispatch selector and manually chooses a platform secret/provider path.
6. The global admin can only save one shared credential, a restricted secret is returned to the browser/log/audit,
   or an organization admin can mutate a global credential.
7. A queued/relayed message loses its audience before provider dispatch and is therefore routed ambiguously.
8. The migration creates a second settings store, writes an active secret/default, changes grants directly, or
   leaves app roles unable to read the new restricted settings through the sanctioned path.
9. Existing patient clinic SMTP/bot behavior or existing disabled-integration behavior regresses.

## Test canon — hard gate

- A permanent test is allowed only if it has an independent oracle, names an expensive silent behavioral failure,
  and checks a public boundary through to an observable provider/queue outcome. The owner plan above is the oracle.
- Do not test exact product spelling, labels, descriptions, list/registry counts/order, source text, internal helper
  arguments or an expected object copied from the candidate's own type/schema.
- Prefer one end-to-end parameterized behavior test at the existing public dispatch/settings boundary over unit
  snapshots of each internal function. Use fake providers only at the true external edge.
- Candidate currently reports four failures in a legacy runtime-config test. Inspect the real product and owner
  requirement first: if those assertions require a forbidden legacy single-credential fallback, remove or replace
  only that obsolete expectation with owner-grounded end behavior. Do not rewrite expected values merely to make
  the candidate green.
- Do not clean historical tests outside the touched surface. Any accepted new/changed test must include a short
  audit note naming its independent oracle, expensive failure and observable consequence, plus one fault injection
  per independent failure class.

## Required inspection and validation

- Prove one provider-independent dispatch path is parameterized by audience, while only final Telegram/MAX/email
  adapters know provider payload/API details.
- Prove staff-producing call sites actually set staff audience and patient producers retain patient audience; use
  exact code paths for booking lifecycle, patient message to staff and specialist task reminders.
- Prove global restricted settings are DB-backed in `public.system_settings`, correctly scoped/redacted, editable
  through the existing global-admin settings flow, and unavailable to clinic admins.
- Inspect the migration against schema/declaration/role ownership; do not apply to TEST/PROD and do not use raw SQL
  against a database. A sanctioned DEV preflight is allowed only if required and safe.
- Run the minimal relevant existing/new acceptance tests, typechecks and lint through the repository host lock.
  Do not run full CI and do not use real provider credentials or send real messages.

## Output and commit

Allowed writes are only:

- justified behavioral acceptance tests in directly touched test files;
- `.lead/runs/platform-delivery-audience-split-audit-20260909/90-final-audit-report.md`.

Temporary production fault injections must be reverted. Commit only accepted tests/report with explicit staging;
do not push. The report must contain candidate/base SHAs, kill-set, inspection evidence, test-or-view classification,
each command/result, fault injections, migration/rights verdict, exact new/changed/deleted tests with §10a rationale,
and binary `PASS` or `FAIL` with only reachable findings. `PASS` does not claim live provider delivery, credentials
or TEST rollout; those remain separate runtime gates.

