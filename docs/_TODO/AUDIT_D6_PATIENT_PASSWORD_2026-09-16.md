PASS — 0 MUST FIX

# Независимый адверсарный аудит Д6 — пациенту больше не обещают пароль

Дата: 2026-09-16

Клон: `/home/dev/dev-projects/bcb-wt-merge-canon`
Ветка: `wt/d6-patient-password-deadend`
Кандидат: `c1a6b7238`

Authority:

- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:170-176`: два живых caller создают именно пациента; `setup-code/complete` отклоняет установку пароля роли `client`; письмо для этих caller больше не должно предлагать установку пароля пациенту.
- Бриф Д6: обещание пароля снято во всех источниках, пациент приходит в рабочий путь, Д3-неразличимость `forgot` и нижний отказ роли остаются целыми.

## Классификация до проверки

| Пункт | Природа | Доказательство |
| --- | --- | --- |
| Обещание пароля во всех источниках | факт о дереве | свой `code-search` + точный `rg`, чтение producers/templates |
| Пациент доходит до конца | поведение продукта | чтение цепочки: producer → письмо → confirm door → session |
| Неразличимость `forgot` | повторяемое поведение | route-тест + fault/timing review |
| Нижний отказ роли | повторяемое поведение | route-тест + fault injection |
| Качество двух тестов | качество теста | взгляд по §10a/§10b + целевые мутации |

## Поиск третьего источника

Свой поиск, не повтор команд отчёта:

```bash
node /home/dev/brain/tools/code-search.mjs "startEmailChallenge password_setup password_reset client patient" --repo bcb -k 30
node /home/dev/brain/tools/code-search.mjs "пациент пароль письмо код подтверждения password setup recovery" --repo bcb -k 30
rg -n --hidden --glob '!**/.next/**' --glob '!**/node_modules/**' --glob '!**/*.test.ts' "startEmailChallenge\(" apps/webapp/src apps/integrator/src packages
rg -n --hidden --glob '!**/.next/**' --glob '!**/node_modules/**' "password_setup|password_reset" apps/webapp/src apps/integrator/src packages
rg -n --hidden --glob '!**/.next/**' --glob '!**/node_modules/**' "requestEmailSetupAccessForUser|requestContactEmailSetup|EmailSetupAccessPort" apps/webapp/src apps/integrator/src packages
rg -n --hidden --glob '!**/.next/**' --glob '!**/node_modules/**' "парол" apps/webapp/src/shared apps/webapp/src/app apps/webapp/src/modules apps/integrator/src packages
```

Итог: третьего живого producer-а пациентского парольного письма не нашёл.

- `passwordRecovery.ts:20-47` всё ещё выбирает `password_setup`/`password_reset` по состоянию, но `startEmailChallenge` вызывается только после `recipient` lookup и `isPasswordEligibleRole(recipient.role)`. Для `client` side effect не создаётся.
- `pgEmailSetupAccessPort.ts:12-22` для doctor-created patient вызывает `startEmailChallenge(..., 'login', platformMailProfileForRecipientRole('client'))`.
- Остальные живые `startEmailChallenge(` call-sites из точного `rg`: patient email OTP/registration/lead `login` или `public_registration`, clinic invite, staff login factor, specialist signup. Они не выпускают пациенту password setup/reset.
- `integrator/src/integrations/email/mailProfile.ts:95-100` для platform-письма рендерит только subject `Код подтверждения <sender>` и text `Ваш код <sender>: <code>`, без ссылки и без слова `пароль`.
- Оставшиеся `парол` в UI/notifications относятся staff/security/admin/password-change либо gated patient component branch; patient surface не получает password method.

## Сквозная цепочка пациента

Путь doctor-created patient:

1. `createDoctorClient.ts` / `createScheduledManualPatientVisit.ts` вызывают `emailSetupAccess.requestContactEmailSetup`.
2. `pgEmailSetupAccessPort.ts:17-21` выпускает `login` challenge для роли `client`.
3. `mailProfile.ts:15-19` выбирает patient sender name; integrator mail renderer даёт только код.
4. Patient UI имеет policy `DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient` без `password` (`surfaceAuthPolicy.ts:33-36`), а staff/platform policy с `password` сохранена (`surfaceAuthPolicy.ts:25-31`).
5. `AuthFlowV2.tsx:341-348` очищает сохранённый `password_reset` draft, если surface не поддерживает пароль; `AuthFlowV2.tsx:1424-1489` показывает password login/recovery только при `passwordLoginEnabled`.
6. `email-otp/confirm/route.ts:84-153` подтверждает public email OTP, допускает `client`, вызывает `setSessionFromUser(..., 'email_code')` и возвращает `redirectTo`/`role`.

Нового тупика на этом пути не нашёл. Staff recovery при этом не снят: staff/platform policies включают `password`, а форма `Забыли пароль?` остаётся под `passwordLoginEnabled`.

## Forgot и timing

Наблюдаемый HTTP fingerprint удерживается тестом на публичной route-границе: `passwordEligibility.route.test.ts:163-256` сравнивает status/body/content-type/location/retry-after/redirected для unknown, contact-only patient, staff password account и legacy patient-with-password, включая повторы. Для всех `forgot` ожидается `200 {"ok":true,"retryAfterSeconds":60}` без `Retry-After`.

Timing review:

- В `forgot/route.ts:34-36` route ждёт `requestPasswordRecoveryChallenge`, как после Д3.
- Внутри `requestPasswordRecoveryChallenge` один `resolveAuthState` остаётся до ответа (`passwordRecovery.ts:20-29`); это не добавлено Д6.
- Роль recipient и доставка перенесены в detached block (`passwordRecovery.ts:31-59`), поэтому новая role-проверка не добавляет role-dependent await до ответа.
- Реальный lookup `pgEmailPasswordLookup.ts:107-133` для нормальной four-state matrix делает один pre-session SQL call; extra merge/logging branches относятся duplicate-email conflict, не к матрице Д6.
- Тест `passwordEligibility.route.test.ts:259-274` держит отсутствие ожидания candidate-only работы: при never-resolving `findUser` route всё равно settles с `200`.

## §21a и тексты

`notificationText.ts` не завёл смысловой дубль для нового patient copy: используется существующий словарь `authEmailCodeDeliveryHint` / `authEmailCodeSent` (`notificationText.ts:287-288`). В изменённом UI visible text на затронутом patient email-code пути идёт через словарь (`AuthFlowV2.tsx:1261-1263`); password recovery copy остаётся в staff-only branch, gated `passwordLoginEnabled`.

## Тесты и зубы

`passwordEligibility.route.test.ts`:

- Поведение, не исходник: вызывает публичные handlers `forgot`, `setup-code/complete`, `reset`.
- Oracle: canon/brief Д6 + Д3 neutral fingerprint; проверяется наблюдаемый HTTP output и конечный side effect (`startEmailChallenge` только для eligible staff reset; no password write/session for client).
- Дорогая молчаливая поломка: пациент получает парольный challenge или после кода получает пароль/сессию не тем способом.
- Не идеален как DB-доказательство, но выбран самый дешёвый публичный route-layer; DB/RLS тут не предмет.

Fault injection:

```text
completePasswordSetup.ts: if (!isPasswordEligibleRole(...)) -> if (false && !isPasswordEligibleRole(...))
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/modules/auth/passwordEligibility.route.test.ts"
```

Результат: `rc=1`; `blocks setting a password for a patient account created without one` получил `200` вместо `403` (`passwordEligibility.route.test.ts:121`).

`pgEmailSetupAccessPort.unit.test.ts`:

- Это не точное утверждение `purpose === 'login'`; тест утверждает несовместимость живых путей: пациент (`isPasswordEligibleRole('client') === false`) не должен получить purpose, который потом обязан быть отвергнут password completion.
- Проверяемый side effect `startEmailChallenge` является внешней границей порта: неверный аргумент создаёт письмо в тупик.
- По §10a тест честный: expected не копирует реализацию, а берёт oracle из нижнего role predicate + продукта. При честной замене на другой непарольный purpose тест не должен падать; при любом `password_*` падает.

Fault injection:

```text
pgEmailSetupAccessPort.ts: 'login' -> 'password_reset'
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=unit src/infra/repos/pgEmailSetupAccessPort.unit.test.ts"
```

Результат: `rc=1`; assertion `expect(purpose).not.toMatch(/password/u)` получил `"password_reset"` (`pgEmailSetupAccessPort.unit.test.ts:39`).

## Валидация

Все временные мутации сняты до финальных проверок.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/modules/auth/passwordEligibility.route.test.ts src/modules/auth/passwordAuth.route.test.ts && pnpm --dir apps/webapp exec vitest --run --project=unit src/infra/repos/pgEmailSetupAccessPort.unit.test.ts"
```

Результат: `rc=0`; route: `2 passed` files / `29 passed` tests; unit: `1 passed` file / `1 passed` test. Сообщение `permission denied for table platform_users` в stderr — ожидаемый injected operator-error сценарий из `passwordAuth.route.test.ts`.

```bash
pnpm --dir apps/webapp exec tsc --noEmit
```

Результат: `tsc rc=0`.

```bash
pnpm --dir apps/webapp exec eslint src/app-layer/auth/passwordRecovery.ts src/app-layer/auth/completePasswordSetup.ts src/infra/repos/pgEmailSetupAccessPort.ts src/infra/repos/pgEmailSetupAccessPort.unit.test.ts src/modules/auth/passwordEligibility.route.test.ts src/modules/auth/passwordAuth.route.test.ts src/shared/notifications/notificationText.ts src/shared/ui/patient/auth/AuthFlowV2.tsx
```

Результат: `eslint rc=0`.

Не запускал: полный CI, автоматические UI-тесты, второй Next-сервер, DEV/TEST/PROD миграции или prod/test operations.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.
