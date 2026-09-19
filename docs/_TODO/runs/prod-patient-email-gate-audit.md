# Новый PROD — audit patient email gate до выбора клиники

Candidate: `ff12cde227a6b94dd0b2827730c88d10b1a67623` (`wt/prod-patient-gate-fix`).

Authority: digest нового PROD `936881974` зафиксировал падение до выбора организации: account-level patient без enrollment должен получить существующий recovery/no-organization screen, а не упасть. PROD не запрашивался и не изменялся.

## Kill-set и результат

- `EMAIL-GATE-01` → **PASS**. До resolver-а организации layout вызывает `patientEmailGateForCabinetEntry`; репозиторий запускает ровно `app.patient_email_gate_state(boolean)` через named-root boundary. Runtime строит patient context без `organizationId` только для этого identity-only root. SQL-function получает пользователя только через `app.current_actor_user_id()` и читает/обновляет только его `platform_users` record и contacts; декларация privilege catalog объявляет ту же patient-self capability/purpose.
- `TENANT-WALL-01` → **PASS**. В runtime отсутствие organizationId по-прежнему бросает исключение для каждого named patient root, кроме relation context и roots из identity-only allowlist. Candidate добавляет одну точную сигнатуру `app.patient_email_gate_state(boolean)`; generic function/purpose/tenant root не получает обхода.
- `EXISTING-ROOTS-01` → **PASS**. Existing organization resolver `app.read_current_patient_active_organizations()` и VAPID root `app.get_web_push_vapid_public_key()` сохранены без изменения; candidate diff ограничен runtime allowlist и его test.
- `TEST-01` → **PASS**. `portContextRuntime.test.ts` проверяет observable итог: для exact email-gate root с patient identity строится patient-pool context без `organizationId`; это не проверка текста `Set`. Oracle независим от реализации — зафиксированный PROD incident. Отказ дорогой и наблюдавшийся: account-level patient теряет доступ к recovery screen. Fault injection: временно удалён exact root из runtime allowlist → этот test упал с `Patient port context requires an organization-scoped patient principal`; строка восстановлена, тот же suite зелёный.

## Validation

- `pnpm --dir apps/webapp exec vitest run src/infra/db/portContextRuntime.test.ts` → PASS, 21/21.
- `pnpm --dir apps/webapp run typecheck` → PASS.
- `pnpm --dir apps/webapp exec eslint src/infra/db/portContextRuntime.ts src/infra/db/portContextRuntime.test.ts` → PASS.
- `git diff --check` → PASS.

Audit verdict: **PASS**. Full CI, push, deploy and migrations were not run.
