# Аудит C2-C5: сотрудничьи двери задаются кодом

SHA: `e1881187f` (`wt/staff-doors-hardcode`).

Роль: независимый адверсарный аудит. Продуктовый код не чинился, миграция на DEV/TEST/PROD не накатывалась. Временные fault-injection правки откатаны.

Authority: `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md`: «Состав сотрудничьей двери — константа кода», `staff`/`platform_admin` не управляются `auth_surface_*`-переключателями; пациентская дверь остаётся на настройках; 2FA остаётся настройкой.

## Итог по ID

- `C2 → PASS →` `rg -n "auth_surface_" apps/webapp/src apps/webapp/db deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql` показывает в `apps/webapp/src` только patient-key generation и комментарии/тесты. Product read/write path: `surfaceAuthSettings.ts:26,46` типизирует `auth_surface_patient_*`; `registry.ts:131-142` регистрирует только patient keys; `runtimeConfig.ts:101-119` публично читает только `...SURFACE_AUTH_SETTING_KEYS`; `api/platform/settings/route.ts:25-54,152-158,193-199` whitelist/GET/PATCH работают через patient keys; `PlatformAuthChannelPolicySection.tsx:158-162,189-202` читает и пишет только `patientSurfaceAuthSettingKey(control)`.
- `C3 → FAIL →` product-код сейчас задаёт staff/admin дверь кодом (`authChannelPolicy.ts:39-46`, `surfaceAuthPolicy.ts` через `DEFAULT_SURFACE_AUTH_POLICY_CONFIG`), и fault injection «вернуть чтение legacy staff/platform тумблера до structural guard» пойман: `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/authChannelPolicy.staffPhoneDoor.unit.test.ts src/app/api/auth/email-otp/start/route.route.test.ts"` упал на `authChannelPolicy.staffPhoneDoor.unit.test.ts:40` (`expected true to be false`). Но route-level fault injection «разрешить staff/platform email-code в `api/auth/email-otp/start`» не пойман: та же команда прошла `2 passed / 8 tests`. Удалённый сценарий `allows the explicit patient portal but rejects admin email-code login on a shared staff host` не заменён тестом того же слоя цепочки.
- `C4 → PASS →` `staffSecurity` не переделан. `verifiedStaffPrimaryLogin.ts:35-58` сохраняет выбор сотрудника: enrolled TOTP идёт через `staffSecurity.beginLogin()`, clinic-required fallback идёт через email-factor continuation. `passwordAuth.route.test.ts:377-470` проверяет оба пути.
- `C5 → PASS →` требование 2FA остаётся настройкой: `email-password/login/route.ts:78-83` читает `doctor_staff_second_factor_required`; `api/doctor/settings/route.ts:14-23,31,119-139` отдаёт и сохраняет этот ключ; `ClinicStaffSecuritySection.tsx:20-27` PATCH-ит его из UI. Fault injection «заменить чтение настройки константой `true`» пойман: `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/passwordAuth.route.test.ts"` упал `5 failed / 23 tests`, включая `passwordAuth.route.test.ts:305`.

## Миграция и права

- `diff -u <(sed -n '51,127p' apps/webapp/db/drizzle-migrations/20260916T090000_the_login_widget_settings_reach_the_public_door.sql) <(sed -n '36,112p' apps/webapp/db/drizzle-migrations/20260916T152803_remove_staff_auth_surface_settings.sql)` показывает единственную смысловую замену тела `app.read_authenticated_runtime_setting`: allowlist regexp `^auth_surface_(staff|platform_admin|patient)_...` стал `^auth_surface_patient_...`. Проверка контекста, scope, org boundary, audience CASE, fallback и сортировка сохранены.
- `rg -n "\b(GRANT|REVOKE|CREATE ROLE|ALTER ROLE|ALTER DEFAULT PRIVILEGES|CREATE POLICY|ALTER POLICY|DROP POLICY|OWNER TO|ALTER FUNCTION)\b" apps/webapp/db/drizzle-migrations/20260916T152803_remove_staff_auth_surface_settings.sql || true` дал пустой вывод. Миграция не создаёт/не меняет роли, политики или привилегии. Сигнатура функции прежняя: `app.read_authenticated_runtime_setting(text,text,uuid,boolean)`, owner-marker прежнего seam: `app_seam_settings_runtime_owner`, с `BCB-MIGRATION-REHOME-FUNCTION`.

## Прогоны

- Clean baseline/final: `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/authChannelPolicy.staffPhoneDoor.unit.test.ts src/app/api/auth/email-otp/start/route.route.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts src/modules/auth/passwordAuth.route.test.ts"` → `4 passed / 39 tests`.
- Fault (a): legacy staff/platform surface setting controls door → caught by `authChannelPolicy.staffPhoneDoor.unit.test.ts:40`.
- Fault (b): route allows staff/platform email-code → not caught, `2 passed / 8 tests`.
- Fault (c): 2FA requirement hardcoded instead of setting → caught by `passwordAuth.route.test.ts`, `5 failed / 23 tests`.

## MUST FIX

1. Restore route-level coverage for staff/admin email-code refusal on `/api/auth/email-otp/start`, including the explicit patient portal allowed + admin/staff portal rejected case on a shared staff host. A unit policy test is not an equivalent end-of-chain route test under AGENTS.md §10a; the current remaining suite lets the route bypass `isAuthChannelEnabled` for staff/platform and still pass.

VERDICT: FAIL

## Круг 2

SHA коррекции: `259589821` (`wt/staff-doors-hardcode`).

Классификация: `app`. Тест — только прежняя причина FAIL: поведение `/api/auth/email-otp/start` по коду. Взгляд — C2, C4, C5 и миграция, потому что коррекция их не трогала: `git show --stat --oneline --name-only HEAD -- docs/_TODO/AUDIT_STAFF_DOORS_C2_C5_2026-09-16.md apps/webapp/src/app/api/auth/email-otp/start/route.route.test.ts apps/webapp/src/modules/auth/surfaceAuthSettings.ts apps/webapp/src/modules/auth/authChannelPolicy.ts` → изменены только `apps/webapp/src/app/api/auth/email-otp/start/route.route.test.ts` и этот отчёт.

### Итог по ID

- `C2 → PASS →` Взгляд: коррекция `259589821` не трогала storage/settings/migration scope C2. Прежнее доказательство остаётся применимым: staff/platform `auth_surface_*`-ключи сняты из write/read path, пациентские ключи оставлены.
- `C3 → PASS →` Старый MUST FIX закрыт: в `apps/webapp/src/app/api/auth/email-otp/start/route.route.test.ts` возвращён route-level сценарий `allows the explicit patient portal but rejects admin email-code login on a shared staff host`; он проверяет конец цепочки: `roleLoginPortal: patient` → `200`, `roleLoginPortal: admin` на общем staff-host → `503`, `startPublicEmailOtpChallenge` вызван один раз. Baseline: `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts"` → `1 passed / 7 tests`.
- `C4 → PASS →` Взгляд: коррекция `259589821` не трогала `staffSecurity`, password route или выбор личного второго фактора. Прежний PASS не переоткрыт.
- `C5 → PASS →` Взгляд: коррекция `259589821` не трогала `doctor_staff_second_factor_required`, `/api/doctor/settings` или UI настройки 2FA. Прежний PASS не переоткрыт.
- `Миграция → PASS →` Взгляд: коррекция `259589821` не трогала `apps/webapp/db/drizzle-migrations/20260916T152803_remove_staff_auth_surface_settings.sql` и generated privileges/deploy artifacts. Прежний PASS не переоткрыт.

### Fault Injection

- `authPolicyNameForRoleLoginPortal`: временно заменил `admin: 'platform_admin'` на `admin: 'patient'` в `apps/webapp/src/modules/auth/roleLogin.ts`. Команда `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts"` покраснела: `1 failed / 7 tests`, assertion `expected [ 200, 200 ] to deeply equal [ 200, 503 ]` в `route.route.test.ts:155`. Это ровно прежняя поломка: route-level разрешение admin/platform email-code теперь ловится.
- `surfaceAuthControlAvailable`: временно добавил `if (control === 'email') return true;` в `apps/webapp/src/modules/auth/surfaceAuthSettings.ts`. Команда `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts"` осталась зелёной: `1 passed / 7 tests`. Подтверждаю вводную ведущего: эта инъекция сама по себе не открывает дверь, потому что для staff/platform `defaultSurfaceAuthControlEnabled(..., 'email')` всё равно смотрит на кодовую матрицу `DEFAULT_SURFACE_AUTH_POLICY_CONFIG`, где `email_code` отсутствует в `enabledMethods`; записанного staff/platform ключа маршрут не читает.
- После отката временных правок `git diff -- apps/webapp/src/modules/auth/roleLogin.ts apps/webapp/src/modules/auth/surfaceAuthSettings.ts` → пусто. Финальный набор: `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/authChannelPolicy.staffPhoneDoor.unit.test.ts src/app/api/auth/email-otp/start/route.route.test.ts"` → `2 passed / 9 tests`.

### Второй удалённый тест

Согласен, что второй удалённый route-level тест возвращать не нужно: он проверял состояние «в базе записан staff/platform переключатель `true`, но маршрут всё равно не пускает». После C2 такого public setting key в базе/read allowlist быть не должно; возвращённый route-test с такой записью проверял бы несуществующее runtime-состояние. Оставшийся unit-test `authChannelPolicy.staffPhoneDoor.unit.test.ts` допустим как проверка правила на уровне политики: даже если legacy/mock значение `true` существует, staff/platform дверь не читает его (`getPublicRuntimeBool` не вызывается) и пациентская дверь остаётся переключаемой.

### ВОПРОС ВЛАДЕЛЬЦУ

Нет.

VERDICT: PASS
