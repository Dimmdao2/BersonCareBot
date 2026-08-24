# E3 independent audit: Therapysto implementation before landing

Read `AGENTS.md` first and obey its header-map rule before every action. Read §§1–5, 9–10b, 12 and 24 completely.

## Тест или взгляд

До чтения тестов классифицируй каждый in-scope пункт отдельно: `TEST` для повторяемого поведения либо
`INSPECTION` для разового итогового состояния, с краткой причиной выбора. Для `TEST` сначала запиши blind kill-set.

## Candidate and authority

- Worktree: `/home/dev/dev-projects/bcb-wt-therapysto-night-20260823`
- Branch: `wt/therapysto-night-20260823`
- Exact product SHA: `7d43d229a`
- Owner plan: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`
- Owner decisions: the dated owner sections in that plan and `docs/OWNER_DECISIONS.md`; later dated owner text wins.
- Existing evidence/audits under `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/` may be reused only after checking
  its exact SHA, scope and current code.

Audit the product tree at `7d43d229a`. A docs/audit-only descendant is allowed only when
`git diff 7d43d229a..HEAD -- apps packages deploy` is empty. Return `STALE` if product code changes.

## Owner boundaries that override earlier agent prose

- This is the final independent implementation/landing gate, not permission to activate domains.
- Do not change DNS, TLS, nginx, TEST origins, runtime env or domain values. Existing `test.bersoncare.ru` addresses
  must keep working. Open runtime/domain activation items `TPB-02/03/05/06/12/14` and Stage D are not claimed done.
- Do not delete any branch or worktree and do not merge/land/push/deploy.
- Earlier handoff prohibitions against landing, touching the delivery seam/roles/migrations, or implementing the auth
  matrix were unauthorized and are not authority.
- The delivery seam must preserve branded credential data and mail templates while admitting only
  `app_integrator_tenant_service`; broad `app_tenant_service` must be denied.
- Ordinary Therapysto bot: messenger contact proof/phone binding plus ordinary opt-in notifications. Branded clinic
  bot: the same plus incoming patient messages and mailings. Mailings are branded-clinic only.
- A bot command never creates a new account. Registration starts and finishes in webapp; the bot confirms the phone
  through messenger-owned contact and returns the code/challenge used by webapp.
- Staff second-factor redesign is explicitly deferred until the domain move (`§1.2g Q2`) and is not a finding now.

## Scope and method

First classify each checked `TPB-01…19`, Stage A/B/C/F item and the Track-D delivery seam as `TEST` or `INSPECTION`.
For repeatable behavior, write a blind kill-set before reading tests. Then inspect the exact product diff and current
implementation. Reuse already documented fault injections; do not repeat a killed class without a current-SHA reason.
Use the cheapest decisive checks. Do not run full CI: it belongs after landing at the integration boundary.

At minimum prove:

1. Every checked implementation item has current evidence and no checked item is contradicted by reachable code.
2. Open domain/runtime items remain honestly open and no committed migration/config/code activates or switches the
   domains forbidden above.
3. The later reconciliation of `app.read_integrator_clinic_delivery_credential` wins over both earlier definitions,
   keeps the branding credential set, admits only the narrow integrator role, and has an adequate migration verify.
4. The Stage F corrections at `7d43d229a` are real: canonical settings envelope/write path, patient passkey off,
   bot proof without pre-web account creation, and branded-only mailing send/draft/UI.
5. Auth policy cells are independently configurable for staff/platform-admin/patient; disabled direct routes fail
   closed; Yandex patient remains available and SMS remains implemented but off.
6. No second resolver/store/dispatcher or BersonCare-specific product fork was introduced.
7. The branch can be landed onto current `feat/doctor-ui-rebuild` without silently restoring broad delivery access or
   changing old TEST-domain behavior. A read-only merge-tree/diff inspection is allowed; do not merge.

## Output

- Do not modify product code or migrations. Revert every temporary injection.
- You may write only the final audit report and audit-queue verdict, then commit them with explicit paths.
- Report one `PASS|FAIL|BLOCKED` line per audited owner item/seam, exact candidate SHA, commands, reused/new injection
  evidence, open runtime items, and any reachable MUST FIX with impact and authority.
- Overall verdict is exactly `PASS`, `FAIL`, or `STALE`. `PASS` means safe to land the implementation while the named
  domain/runtime items remain open; it does not claim domain activation.
- Do not push, land, deploy, merge, delete branches or change domains. Finish foreground checks before the one turn ends.
