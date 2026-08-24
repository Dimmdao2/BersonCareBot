# Therapysto Stage F — coherent implementation and closure

Read `AGENTS.md` first and obey its per-action routing, owner-authority, testing, migration and orchestration rules.

## Candidate and authority

- Worktree: `/home/dev/dev-projects/bcb-wt-therapysto-night-20260823`
- Branch: `wt/therapysto-night-20260823`
- Authority: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, especially later owner rulings in §1 and Stage F.
- Tracked workstream: #1035.

The exact starting SHA will be the branch HEAD when the orchestrator launches you after the current independent audit. Measure the actual implementation first; much of F1/F4 and the phone-messenger flow already exists. Do not reimplement completed paths or create parallel entities.

## One coherent stage

Finish all genuinely missing code/value/evidence for `F2`, `F2b`, `F2c`, `F3`, `F5` and their owner requirements `TPB-10`, `TPB-17a`, `TPB-17`, `TPB-18`, `TPB-19` in one pass. This is not five micro-fixes. Trace the complete human login paths, reuse the existing per-surface policy/settings/resolver and canonical contact/pre-session seams, close only real gaps, and leave a single coherent result.

Источник оракула: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` — «все механики включаются в админке — отдельно для докторов и отдельно для пациентов».

The later owner decisions that govern the stage:

- staff and platform-admin OAuth are present but disabled by default; turning the per-surface setting on restores the route without code changes;
- doctor passkey is present but disabled by default; enabling the setting restores the same route, including for an already enrolled passkey; PIN is not reintroduced;
- the default doctor second factor is one choice between email code and TOTP, not two unrelated login engines;
- standard and branded patient surfaces both offer email and phone login; patient Yandex OAuth remains enabled as it works now, with one global registration; Google remains disabled;
- phone login uses the existing messenger confirmation: the bot proves possession of the phone through messenger contact and gives a code to enter in the web app; a bot command must not create a new account by itself;
- the ordinary Therapysto bot also supports phone binding and notifications (including clinic-message and exercise reminders); mailings are available only to branded clinics. Do not reduce the ordinary bot to “code delivery only”;
- disabled mechanics must fail at the server resolver/route boundary, not merely disappear from UI;
- settings are three independent policies: `staff`, `platform_admin`, `patient`.

If an older agent-authored handoff or prose conflicts with these decisions, the later owner decision wins and the active plan must be corrected rather than obeying the stale restriction.

## Boundaries

- Do not change domains, DNS, TLS, nginx, TEST origins, deploy env, or the current `test.bersoncare.ru` address.
- Do not create a second auth engine, user/contact store, login tree, or integrator identity source.
- Do not make the integrator create users in response to a bot command.
- Do not touch unrelated branding, UI redesign, delivery retention or Track D simplification work.
- Small mechanical corrections discovered inside this stage are fixed directly in the same pass; do not launch another agent.

## Acceptance and evidence

Add or strengthen behavior tests only where they prove the owner behavior. At minimum cover:

- direct staff/admin OAuth start/callback denied while disabled and works after the same setting is enabled;
- passkey disabled/enabled transition on the same code, including an existing credential path;
- independent settings for staff/platform-admin/patient cannot leak into each other;
- standard and branded patient origins expose and accept the same email and phone login mechanisms;
- messenger phone proof returns a web-app code without creating an account at the bot-command step;
- patient Yandex remains available while staff/admin OAuth defaults off;
- doctor second-factor choice behaves as one selected policy.

Per `AGENTS.md` §10a, tests must exercise behavior, not grep source text or assert incidental implementation strings. Run targeted tests, relevant lint and webapp typecheck through the host test lock. Do not run full CI; the orchestrator will run it once after the integrated audited candidate lands.

Update the active plan checkboxes and evidence in the same commit only for requirements actually proven. If a requirement is already fully satisfied, close it with fresh exact evidence instead of changing working code. If an owner decision is truly missing, stop with one precise OWNER QUESTION; do not soften it.

Commit all task-related changes with a meaningful message. Do not push, merge, deploy or change domains.
