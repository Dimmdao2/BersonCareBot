# Independent audit: Therapysto Stage F auth policy

Read `AGENTS.md` first. Before every action follow its header-map rule. Read §§2–4, 10, 10a, 10b and 24 completely before auditing.

## Тест или взгляд

Начни аудит с отдельной классификации каждого in-scope требования: `TEST` для повторяемого поведения либо `INSPECTION` для разового итогового состояния, с краткой причиной выбора.

## Candidate and authority

- Worktree: `/home/dev/dev-projects/bcb-wt-therapysto-night-20260823`
- Branch: `wt/therapysto-night-20260823`
- Exact product commit under audit: `1b8b95684507fe8a5f2c6ea7a4cda7db5dc1ca52`
- Owner plan: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`
- In-scope IDs: `F2`, `F2b`, `F2c`, `F3`, `F5`, `TPB-10`, `TPB-17a`, `TPB-17`, `TPB-18`, `TPB-19`.

Audit that exact product commit. A brief-only descendant is allowed only if `git diff 1b8b95684507fe8a5f2c6ea7a4cda7db5dc1ca52..HEAD -- apps packages deploy` is empty. Report `STALE` if any later product change exists or product code changes during the audit.

## Owner behavior, verbatim in meaning

- The ordinary Therapysto bot confirms the user's phone by the messenger-owned contact mechanism and returns the code that the user enters in the web app. It also delivers ordinary opt-in notifications such as clinic-message and exercise/appointment reminders.
- A branded clinic bot has the same phone binding and notifications, plus incoming patient messages and clinic mailings. Mailings are available only to branded clinics.
- A bot command must not create a new account. Account registration starts in the web application; the bot proves control of the phone and returns a web code.
- Staff and platform-admin OAuth mechanics remain implemented but are disabled by default and independently enableable per surface.
- Staff passkey remains implemented, is disabled by default, and an existing credential works again after enabling it. PIN stays absent.
- Patient entry is email or phone confirmed through the bot on both standard and branded patient surfaces. Yandex OAuth remains as it is; Google remains off. Mechanics are switched, not deleted.
- Staff, platform-admin and patient policies are independent; disabling a mechanism must deny its direct route, not merely hide UI.
- Doctor second factor has one default choice: email code **or** TOTP, not two independent parallel login paths. Search all later dated owner decisions before classifying whether the choice is already settled. If no owner-selected value exists, report a precise `OWNER QUESTION`; do not choose one.
- Do not activate or switch domains, DNS, TLS, nginx, TEST origins or runtime env. Existing `test.bersoncare.ru` addresses must remain unchanged.

## Audit protocol

For every requirement first classify `TEST` or `INSPECTION` and say why. For repeatable behavior, write the blind kill-set from authority before reading existing tests. Then inspect the production diff and existing evidence, and use the cheapest decisive checks. A green test proves its claim only if the corresponding independent fault injection makes it red or it failed on the actual defect before the fix.

At minimum prove or disprove:

1. Disabled and re-enabled OAuth start/callback behavior on staff and platform-admin, independently from patient policy.
2. Disabled and re-enabled staff passkey with an existing credential; no PIN resurrection.
3. Standard and branded patient email plus messenger-phone proof; bot contact proof returns the web code and does not create user/integrator identity rows.
4. Ordinary-vs-branded bot delivery boundary above, including branded-only mailings, without inventing a second dispatcher.
5. Patient defaults match the owner policy. Explicitly determine whether patient passkey is still effectively enabled by `DEFAULT_SURFACE_AUTH_POLICY_CONFIG` or persisted settings, and give the reachable user consequence.
6. All three policies have independent persisted cells and disabled direct routes fail closed.
7. F2c: determine whether the runtime currently exposes email code and TOTP as two independent staff login paths; search later owner rulings before deciding `FAIL` versus `OWNER QUESTION`.
8. Yandex patient behavior remains available through the one global registration; Google and staff/admin OAuth defaults are off.
9. One configuration source of truth. `AGENTS.md` §4 requires integration/application settings to live only in `public.system_settings`, with no second store/copy/mirror. Inspect the migration's writes to both `public.system_settings` and `public.app_runtime_settings`, identify which table runtime actually reads, and classify the concrete drift/failure scenario. Also verify the migration's `BCB-MIGRATION-VERIFY` checks the canonical resulting state.
10. Migration rights analysis required by AGENTS §1: list objects/statements, roles/access needed, absence of GRANT/REVOKE, index impact, and whether the backfill respects §§2–4. Reuse the already green candidate preflight only if it is on the identical product SHA; otherwise run only the canonical rollback-only named-DEV preflight. Never execute it permanently and never create a disposable database.

Do not accept plan checkmarks or the worker report as proof. Check actual runtime selection and full diff. Do not turn style or an alternative architecture into a finding: every `MUST FIX` needs a reachable scenario, impact, exact violated owner/repo requirement and evidence.

## Allowed changes and output

- Do not modify product code or migrations.
- You may add audit-only behavioral acceptance tests, the audit report, and the audit-queue verdict row.
- Revert every temporary fault injection before finishing.
- Write the report under `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/` with exact candidate SHA, kill-set, commands, injection outcomes and one `PASS|FAIL|BLOCKED` line per in-scope ID.
- Commit only audit artifacts/tests with explicit paths. Do not push, land, deploy, merge, delete branches, or touch domains/TEST/PROD.
- Finish the one port turn only after foreground checks finish and the tree is clean. Final verdict is exactly `PASS`, `FAIL`, or `STALE`.
