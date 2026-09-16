# Независимый аудит Э5a — round 3

Дата: 2026-09-16. Ветка: `wt/e5-email-gate`. Аудируемый кандидат: `d1a36aae3575a93a808c258d8dd0d8d1019086ed`.

## Вердикт

**FAIL.**

### MUST FIX-1 — `GET /api/patient/material-ratings` остаётся обходом email gate

Authority: `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md:177-183` — через 14 дней требование и отказ без почты; `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:194-197` — до завершения разрешены только привязка почты, повтор кода, поддержка и выход, клинические данные не показываются; `AGENTS.md:804-817` — один общий проход.

`PUT /api/patient/material-ratings` закрыт общим `requirePatientApiBusinessAccess`, но `GET` в том же route-файле идёт отдельной веткой: `getOptionalPatientSession()` → `patientClientBusinessGate()` → `resolvePatientCanViewAuthOnlyContent()` → `materialRating.getForPatient(...)` (`apps/webapp/src/app/api/patient/material-ratings/route.ts:34-90`). При пациентской сессии с просроченным email-clock этот путь не вызывает `patientEmailGateForProtectedData` и не вернёт `patient_email_required`; он продолжит читать агрегат оценок и `myStars` для контента/упражнений/комплексов. Это защищённые patient data после дедлайна, не escape/support/logout.

Почему это не было видно простым route-file grep: файл содержит `requirePatientApiBusinessAccess` для `PUT` (`route.ts:100-102`), поэтому проверка “файл содержит общий guard” даёт ложный PASS. Нужна метод-level проверка или перевод `GET` на общий guard.

Команды:

- `node /home/dev/brain/tools/code-search.mjs "requirePatientApiBusinessAccess patient api route patient email gate" --repo bcb -k 30`
- `for f in $(rg --files apps/webapp/src/app/api/patient apps/webapp/src/app/api/booking -g 'route.ts' | sort); do if rg -q "requirePatientApiBusinessAccess|requirePatientBookingTrustedPhoneAccess" "$f"; then :; else printf '%s\n' "$f"; fi; done` → 9 файлов без общего guard на уровне файла: public booking routes, `email-change/confirm`, `messenger/request-contact`, `support`.
- `rg -n "getOptionalPatientSession\(|patientClientBusinessGate\(" apps/webapp/src/app/api/patient apps/webapp/src/app/api/booking -g 'route.ts'` → дополнительно `apps/webapp/src/app/api/patient/material-ratings/route.ts:46,49`.

## Классификация «тест или взгляд»

1. **Пациентские API без общего прохода** — смешанное. Сначала ВЗГЛЯД: census маршрутов и method-level чтение итогового состояния. Затем ПРОГОН: route/unit tests и fault injection для найденных общих дверей.
2. **Человек не заперт после дедлайна** — смешанное. ВЗГЛЯД по route policy и allowed pages/API, ПРОГОН по policy tests на exempt paths.
3. **Единая клиентская точка redirect** — ПРОГОН: наблюдаемое клиентское поведение `fetch 403 -> navigate(redirectTo)`; плюс ВЗГЛЯД по клиентским helper imports.
4. **Мягкий период ничего не закрывает** — ПРОГОН: policy/guard tests видят выход цепочки.
5. **Роль staff не попадает под patient email requirement** — ПРОГОН: policy test; ВЗГЛЯД по `sessionRole !== 'client'`.
6. **Миграция и права** — ВЗГЛЯД + rollback-only preflight. Это качество разового DB-action; текстовая проверка на отсутствие GRANT/POLICY не заменяет preflight.
7. **Тесты по §10a** — ВЗГЛЯД + fault injection. Проверял, что тесты ловят наблюдаемое поведение, а не строки исходника.

## Проверенные вопросы

### 1. Пациентский контур и общий проход

`organization-context` закрыт: `GET`, `POST`, `DELETE` зовут `requirePatientApiBusinessAccess()` (`apps/webapp/src/app/api/patient/organization-context/route.ts:22,39,69`), тест `organization-context/route.route.test.ts` краснеет при снятии этого прохода.

Законные исключения:

- `apps/webapp/src/app/api/patient/email-change/confirm/route.ts` — подтверждение кода привязки/смены почты, session-only.
- `apps/webapp/src/app/api/patient/messenger/request-contact/route.ts` — повтор/запрос контакта для onboarding телефона, не clinical data.
- `apps/webapp/src/app/api/patient/support/route.ts` — поддержка, разрешена при `allow` и `need_activation`.
- `apps/webapp/src/app/api/booking/public/**` — публичная запись до кабинета; authority ground прямо запрещает делать email условием записи/оплаты (`E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:201-203`).

Дыра: `GET /api/patient/material-ratings`, см. MUST FIX-1.

### 2. Человек не заперт

Экран привязки почты открыт: `/app/patient/bind-email` exempt в `PATIENT_EMAIL_GATE_EXEMPT_PREFIXES` (`patientRouteApiPolicy.ts:51-58`), сама страница использует `requirePatientAccess(routePaths.bindEmail)` и после дедлайна оставляет support/EmailAccountPanel доступными (`bind-email/page.tsx:29-66`). Поддержка открыта (`/app/patient/support` exempt; `api/patient/support` не применяет email gate). Logout открыт через `/api/auth/logout` exempt. `profile/help/legal` тоже открыты.

Авторская коррекция закрыла `/app/patient/install` вместе с push API: `install` отсутствует в email exempt list, policy test `closes the install screen after the same deadline as its protected push APIs` это фиксирует.

### 3. Клиентская единая точка

`redirectIfPatientAccessRequired` одна для машинных отказов `patient_activation_required`, `booking_phone_trust_required`, `patient_email_required` и читает server `redirectTo` (`apps/webapp/src/shared/http/apiErrorCode.ts:48-70`). Подключения проверены:

- booking helper: `bookingPatientActivation.ts:14-18`;
- messages client: `PatientMessagesClient.tsx:64,108,144`;
- web push: `patientWebPushApi.ts:4-57`;
- native push: `nativePushApi.ts:14-84`.

Оставшиеся сырые/локальные ошибки в `PatientContentPracticeComplete.tsx` и booking error message helpers касаются `patient_activation_required`; это старые локальные paths, не новый `patient_email_required`. По брифу MUST FIX-3 закрыт для новых 403 `patient_email_required`.

### 4. Мягкий период

`evaluatePatientEmailGateForCabinetEntry` ставит часы и просит один раз; `evaluatePatientEmailGateForProtectedData` до 14-го дня не закрывает данные и не двигает часы (`patientRouteApiPolicy.ts:183-215`). Тесты это видят на выходе policy/guard.

### 5. Роль

Policy не применяет email requirement к ролям, отличным от `client` (`patientRouteApiPolicy.ts:163-180`). Guard для patient API дополнительно принимает только patient role (`requireRole.ts:982-988`), staff уходит в unauthorized/own hub, а не в email requirement. Инъекция снятия role boundary поймана.

### 6. Миграция

`apps/webapp/db/drizzle-migrations/20260915T202200_patient_email_requirement_clock.sql`:

- owner markers есть (`app_object_owner`, `app_seam_patient_self_actions_owner`);
- `rg -n "GRANT|REVOKE|CREATE POLICY" apps/webapp/db/drizzle-migrations/20260915T202200_patient_email_requirement_clock.sql` → пусто;
- функция вызывает `app.require_accepted_context(...)` с purpose `patient.email-gate.state` (`migration:25-34`);
- декларация содержит capability `patient_email_gate_state` (`deploy/postgres/privileges/declaration.ts:25667-25670`) и тело функции с правами на `platform_users.email_first_requested_at`/`user_contacts` (`declaration.ts:30205-30218`).

Preflight:

- `/home/dev/brain/host-orch/run-tests.sh "bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/bcb-wt-conflict-screens"` → FAIL `DEV API env path guard failed` (candidate clone не canonical runtime env root).
- `/home/dev/brain/host-orch/run-tests.sh "bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"` → PASS, `pending=1 total=228`, `ROLLBACK`.

`--execute` не запускался. TEST/PROD не трогались.

### 7. Тесты по §10a

Новые/сохранённые tests проверяют наблюдаемый выход:

- policy: решение `request/requirement`, first-request clock, escape paths, role boundary;
- guard: API 403 `patient_email_required` + `redirectTo`, server-action redirect, soft period allow;
- route: `organization-context` не отдаёт organization data при email deadline;
- client: web-push идёт на server-provided `redirectTo`.

Слабое место не в качестве этих тестов, а в неполном route surface: existing material-ratings tests проверяют global switch только (`material-ratings/route.route.test.ts:60-110`) и не содержат email-deadline oracle для `GET`.

## Fault injection

Все временные изменения production-кода откатаны; после инъекций `git status --short` был пустой.

1. Сдвиг границы `>=` → `>` на 14 дней в `resolvePatientEmailGateDecision`: поймано. Команда `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/platform-access/patientEmailGatePolicy.unit.test.ts"` → FAIL: `day 14 -> requirement`, `closes the install screen...`, `blocks protected data...`.
2. Снятие исключения `/app/patient/bind-email`: поймано той же командой → FAIL: `never blocks the escape path /app/patient/bind-email`.
3. Не ставить отметку часов (`evaluatePatientEmailGateForCabinetEntry` вызывает evaluator с `false`): поймано той же командой → FAIL: `records the first cabinet request and asks the patient once`.
4. Снятие проверки роли (`sessionRole !== 'client'` перевёрнуто): поймано той же командой → FAIL: `never applies the patient email requirement to staff roles` плюс пациентские сценарии.
5. Снятие общего прохода у одного patient API (`GET /api/patient/organization-context` заменён на local allow): поймано. Команда `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/patient/organization-context/route.route.test.ts"` → FAIL: expected `403`, got `200`.
6. Снятие чтения `redirectTo` в `redirectIfPatientAccessRequired`: поймано. Команда `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/shared/lib/webPush/patientWebPushApi.unit.test.ts"` → FAIL: navigated to `/app/patient/bind-email` instead of `/app/patient/bind-email?next=%2Fapp%2Fpatient%2Finstall`.

Непойманный класс: method-level обход `GET /api/patient/material-ratings` уже присутствует в исходном кандидате; существующий targeted set зелёный, потому что не содержит email-deadline assertion для этого `GET`.

## Запущенные проверки

- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/platform-access/patientEmailGatePolicy.unit.test.ts src/app-layer/guards/requireRole.patientEmailGate.unit.test.ts src/app/api/patient/organization-context/route.route.test.ts src/shared/lib/webPush/patientWebPushApi.unit.test.ts src/app/api/patient/material-ratings/route.route.test.ts"` → PASS, `5 files`, `26 passed`.
- `/home/dev/brain/host-orch/run-tests.sh "bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"` → PASS, rollback-only.

Полный CI не запускался. DEV migration `--execute` не запускался. `.env` не сканировались.
