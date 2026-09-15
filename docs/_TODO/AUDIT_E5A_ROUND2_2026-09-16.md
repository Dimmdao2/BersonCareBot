# Повторный независимый аудит Э5a — round 2

Дата: 2026-09-16. Ветка: `wt/e5-email-gate`. Аудируемый кандидат: `58cd3729b78ef4f2ec20da1a3714e2df7308a83b` поверх `2f37381dd`.

## Вердикт

**FAIL.**

### MUST FIX-1 — `api/patient/organization-context` остался обходом email gate

Authority: `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md:177-183` — через 14 дней отказ без почты; `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:194-197` — до завершения разрешены только экран привязки, повторная отправка кода, поддержка и выход, клинические данные не показываются.

Коррекция добавила email gate в общие двери `requirePatientAccessWithPhone` и `requirePatientApiBusinessAccess`: `apps/webapp/src/app-layer/guards/requireRole.ts:67-79`, `apps/webapp/src/app-layer/guards/requireRole.ts:1002-1008`. Но `apps/webapp/src/app/api/patient/organization-context/route.ts:18-30` держит локальный `requirePatientContextAccount()`: `getCurrentSession()` + `canAccessPatient()` + `patientClientBusinessGate()`, без `patientEmailGateForProtectedData()`. Эти `GET/POST/DELETE` читают и меняют активный контекст организации пациента (`route.ts:38-52`, `route.ts:55-82`, `route.ts:85-92`), то есть остаются достижимыми с живой patient-cookie и просроченными часами.

Это не один общий проход, а третья копия patient business policy рядом с `requirePatientApiBusinessAccess`. Нарушает `AGENTS.md §5` "Один общий проход, и мимо него нельзя".

Поиски дверей:

- `node /home/dev/brain/tools/code-search.mjs "E5 email verification gate patient unread-count" --repo bcb -k 10`
- `rg --files-without-match "requirePatientApiBusinessAccess|requirePatientBookingTrustedPhoneAccess" apps/webapp/src/app/api/patient -g 'route.ts'` → `support`, `organization-context`, `messenger/request-contact`, `email-change/confirm`.
- `rg --files-without-match "requirePatientApiBusinessAccess|requirePatientBookingTrustedPhoneAccess" apps/webapp/src/app/api/booking -g 'route.ts'` → только `api/booking/public/**`.

`support`, `email-change/confirm` и `messenger/request-contact` относятся к разрешённым escape/onboarding дверям. `organization-context` — нет.

### MUST FIX-2 — экран install разрешён, но его push API закрываются email gate

Authority: `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:194-197` — установка входит в безопасный default до завершения email gate.

`/app/patient/install` находится в email-exempt list (`apps/webapp/src/modules/platform-access/patientRouteApiPolicy.ts:51-58`) и сама страница использует только `requirePatientAccess(routePaths.patientInstall)` (`apps/webapp/src/app/app/patient/install/page.tsx:7-16`). Но кнопка установки/уведомлений вызывает `subscribePatientWebPush()` или `enableNativePushSubscription()` (`apps/webapp/src/app/app/patient/install/WebPushOptInControls.tsx:18-57`), а они ходят в `/api/patient/web-push/status`, `/api/patient/web-push/subscribe`, `/api/patient/native-push`.

Эти API закрыты общей `requirePatientApiBusinessAccess`, но передают `routePaths.patient` или default patient path, не `routePaths.patientInstall`: `apps/webapp/src/app/api/patient/web-push/status/route.ts:17-24`, `apps/webapp/src/app/api/patient/web-push/subscribe/route.ts:25-28`, `apps/webapp/src/app/api/patient/native-push/route.ts:26-53`. После 14 дней сервер вернёт `patient_email_required`, а разрешённый экран будет частично нерабочим. Это ровно сценарий "экран рисуется, а его API закрыт".

### MUST FIX-3 — не все клиентские fetch-пути уводят по `patient_email_required`

Authority: `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md:185-188` — нужна точка, которая ведёт человека на email; `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:194-197` — защищённые данные до завершения не показываются.

Серверный отказ машинно различим: `requirePatientApiBusinessAccess` отдаёт `403`, `error: "patient_email_required"`, `redirectTo: "/app/patient/bind-email?next=..."` (`apps/webapp/src/app-layer/guards/requireRole.ts:959-967`), и тест это проверяет. Но клиентские API helpers не используют этот новый код как redirect-signal. Примеры достижимых путей:

- `apps/webapp/src/app/app/patient/cabinet/bookingPatientActivation.ts:8-25` редиректит только `patient_activation_required` и `booking_phone_trust_required`;
- `apps/webapp/src/shared/lib/webPush/patientWebPushApi.ts:23-33` превращает любой не-OK status в `vapidConfigured: false`, без чтения `redirectTo`;
- `apps/webapp/src/shared/lib/nativePush/nativePushApi.ts:22-32` превращает не-OK status в `null`;
- `apps/webapp/src/app/app/patient/messages/PatientMessagesClient.tsx:52-60` показывает `data.error`, если активная вкладка дожила до дедлайна и следующий poll получил 403.

RSC layout закрывает обычную навигацию, но API-отказ во время уже открытой клиентской сессии или на allowed install screen не ведёт человека на экран почты.

## Обязательные вопросы

1. **MUST FIX-1 закрыт не полностью.** `unread-count` теперь проходит через общий `requirePatientApiBusinessAccess` (`apps/webapp/src/app/api/patient/messages/unread-count/route.ts:9-16`) и unit доказывает `patient_email_required`. Но `organization-context` остался локальной копией gate и обходом.
2. **Человек не должен быть заперт.** По коду открыты `bind-email`, `profile`, `support`, `help`, `install`, `logout` (`patientRouteApiPolicy.ts:51-58`); email start/confirm используют session-only auth routes (`apps/webapp/src/app/api/auth/email/start/route.ts:18-75`, `apps/webapp/src/app/api/auth/email/confirm/route.ts:26-105`). FAIL по install API: см. MUST FIX-2.
3. **Просьба ничего не закрывает.** Targeted test `does not close either data door during the soft request period` PASS; policy test `keeps protected data open during the fourteen-day request period without moving the clock` PASS.
4. **MUST FIX-2 прошлого круга.** Закрыт: инъекция "не ставить отметку часов" теперь краснит `records the first cabinet request and asks the patient once`. Снятие роли `client` краснит `never applies the patient email requirement to staff roles`.
5. **Машинная различимость отказа.** Серверный код и test PASS: `patient_email_required` + `redirectTo`. Клиентский redirect неполный: см. MUST FIX-3.
6. **Тесты по Линейке владельца 15.09 / §10a.** Два новых targeted tests проверяют наблюдаемый выход policy/guard: first-request clock/prompt, day-14 block, role boundary, API JSON refusal, server-action redirect, soft-period allow. Это не тесты текста исходника. Есть слабое место: `requireRole.patientEmailGate.unit.test.ts` мокает `patientEmailGateForProtectedData`, поэтому доказывает wiring guard-level refusal, но не все route files; именно поэтому взгляд нашёл `organization-context`.

## Fault injection

- `>=` → `>` на 14-дневной границе: **поймано**. Команда `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/platform-access/patientEmailGatePolicy.unit.test.ts"` → FAIL: `day 14 -> requirement`, `blocks protected data when the fourteen-day requirement has started`.
- Убрать `/app/patient/bind-email` из исключений: **поймано**. Та же команда → FAIL: `never blocks the escape path /app/patient/bind-email`.
- Не ставить отметку часов (`evaluatePatientEmailGateForCabinetEntry` вызывает общий evaluator с `false`): **поймано**. Та же команда → FAIL: `records the first cabinet request and asks the patient once`.
- Снять проверку роли `client` (`if (input.sessionRole !== 'client')` отключено): **поймано**. Та же команда → FAIL: `never applies the patient email requirement to staff roles`.
- Вернуть `requirement` при подтверждённой почте: **поймано**. Та же команда → FAIL: `confirmed email -> none`.
- Снять новую проверку в server-action gate (`requirePatientAccessWithPhone` не редиректит при `blocksProtectedData`): **поймано**. Команда `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app-layer/guards/requireRole.patientEmailGate.unit.test.ts"` → FAIL: `redirects a protected server action to the same email escape route`.

Все временные production-code инъекции откатаны; перед отчётом `git status --short` был пустым.

## Live DEV

DEV webapp отвечает: `curl -sS -I http://127.0.0.1:5200/app | sed -n '1,12p'` → `HTTP/1.1 200 OK`.

Полный live-сценарий "cookie + просроченные часы" не выполнен, потому что текущая `bcb_webapp_dev` ещё без pending migration, а бриф запрещает `--execute`: `sudo -u postgres psql -d bcb_webapp_dev -P pager=off -c "SELECT pu.id, pu.display_name, pu.session_epoch, pu.email_first_requested_at ..."` → `ERROR: column pu.email_first_requested_at does not exist`. Разрешённый preflight выполнен и откатан: `/home/dev/brain/host-orch/run-tests.sh "bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"` → PASS, `pending=1`, rollback-only.

## Запущенные проверки

- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/platform-access/patientEmailGatePolicy.unit.test.ts src/app-layer/guards/requireRole.patientEmailGate.unit.test.ts"` → PASS, `2 files`, `20 passed`.
- Fault injections выше → все 6 пойманы targeted tests.
- `/home/dev/brain/host-orch/run-tests.sh "bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"` → PASS, rollback-only.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp typecheck"` → PASS.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/app-layer/guards/requireRole.ts src/app-layer/platform-access/index.ts src/modules/platform-access/patientRouteApiPolicy.ts src/modules/platform-access/patientEmailGatePolicy.unit.test.ts src/app-layer/guards/requireRole.patientEmailGate.unit.test.ts src/app/app/patient/layout.tsx src/app/app/patient/bind-email/page.tsx src/shared/notifications/errorCodeText.ts src/shared/notifications/notificationText.ts"` → PASS.

Полный CI не запускался. DEV migration execute не запускался. TEST/PROD не трогались.
