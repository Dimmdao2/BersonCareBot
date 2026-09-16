# Д3 — неразличимость дверей пароля до проверки кода

## Итог

Ветка создана уже после приземления Д3: продуктовая правка находится в `ad74c1af3`, acceptance-тест и
адверсарный отчёт — в `33f484867`. Более поздний owner-этап Д4 (`036be6453`) удалил дублирующую дверь
`email-password/setup-access`; возвращать её ради старого брифа нельзя. В текущем дереве остаются единый старт
`email-password/forgot` и два completion-пути после кода (`reset` и `setup-code/complete`).

Источник исходного состояния:

```bash
git show ad74c1af3^:apps/webapp/src/app/api/auth/email-password/forgot/route.ts
git show ad74c1af3^:apps/webapp/src/app/api/auth/email-password/setup-access/route.ts
git show ad74c1af3^:apps/webapp/src/app/api/auth/email-password/setup-code/complete/route.ts
```

Источник состояния сразу после Д3:

```bash
git show ad74c1af3:apps/webapp/src/app-layer/auth/passwordRecovery.ts
git show ad74c1af3:apps/webapp/src/app/api/auth/email-password/forgot/route.ts
git show ad74c1af3:apps/webapp/src/app/api/auth/email-password/setup-access/route.ts
git show ad74c1af3:apps/webapp/src/app/api/auth/email-password/setup-code/complete/route.ts
```

Во всех таблицах ниже предполагаются валидный JSON, включённый transactional-email канал и незадетый внешний
rate limit. Для `setup-code/complete` до проверки кода подан обычный неверный OTP. `contact-only` и «учётка без
пароля» в текущей модели имеют одно состояние `needs_email_setup`; отдельной ветки `blocked` у
`EmailPasswordAuthState` нет, поэтому блокировка наследует строку фактического password-state и сама наружу не
выдаётся.

## До Д3 — фактические ответы

### `POST /api/auth/email-password/forgot`

| Состояние | Код и тело | Заголовки | Задержка до ответа |
|---|---|---|---|
| Нет такой почты (`free`) | `200 {"ok":true,"retryAfterSeconds":60}` | JSON; без `Location` и `Retry-After` | Два последовательных lookup; доставки нет |
| Contact-only (`needs_email_setup`) | `200 {"ok":true,"challengeId":"<uuid>","retryAfterSeconds":60,"setupRequired":true}` | JSON; без `Location` и `Retry-After` | Lookup и создание/доставка setup-challenge ожидались до ответа |
| Учётка с паролем | `200 {"ok":true,"retryAfterSeconds":60}` | JSON; без `Location` и `Retry-After` | Password lookup и чтение получателя ожидались; доставка reset-challenge была detached |
| Учётка без пароля | То же, что contact-only | То же | То же |
| Заблокирована | Собственной ветки нет: ответ зависел от наличия пароля по одной из строк выше | То же | То же, что у соответствующего password-state |

Канал утечки: contact-only выдавался полями `challengeId`/`setupRequired`; кроме того, только эта ветка ожидала
создание и доставку challenge до ответа.

### `POST /api/auth/email-password/setup-access`

| Состояние | Код и тело | Заголовки | Задержка до ответа |
|---|---|---|---|
| Нет такой почты (`free`) | `400 {"ok":false,"error":"not_eligible"}` | JSON; без `Location` и `Retry-After` | Один lookup; доставки нет |
| Contact-only (`needs_email_setup`) | `200 {"ok":true,"challengeId":"<uuid>","retryAfterSeconds":60}` | JSON; без `Location` и `Retry-After` | Lookup и создание/доставка setup-challenge ожидались до ответа |
| Учётка с паролем | `400 {"ok":false,"error":"not_eligible"}` | JSON; без `Location` и `Retry-After` | Один lookup; доставки нет |
| Учётка без пароля | То же, что contact-only | То же | То же |
| Заблокирована | Собственной ветки нет: ответ зависел от наличия пароля по одной из строк выше | То же | То же, что у соответствующего password-state |

Канал утечки: contact-only отличался одновременно status, body и временем; ошибка challenge дополнительно могла
дать `429` либо `503` и `retryAfterSeconds`.

### `POST /api/auth/email-password/setup-code/complete`

| Состояние | Код и тело до проверки OTP | Заголовки | Задержка до ответа |
|---|---|---|---|
| Нет такой почты (`free`) | `400 {"ok":false,"error":"not_eligible"}` | JSON; без `Location` и `Retry-After` | Lookup; OTP не проверялся |
| Contact-only (`needs_email_setup`) | `400 {"ok":false,"error":"invalid_code"}` для обычного неверного кода | JSON; без `Location` и `Retry-After` | Lookup и реальная проверка OTP |
| Учётка с паролем | `409 {"ok":false,"error":"already_has_login"}` | JSON; без `Location` и `Retry-After` | Lookup; OTP не проверялся |
| Учётка без пароля | То же, что contact-only | То же | То же |
| Заблокирована | Собственной ветки нет: ответ зависел от наличия пароля по одной из строк выше | То же | То же, что у соответствующего password-state |

Канал утечки: неизвестный адрес, password-account и passwordless-account расходились по status/body и по факту
запуска OTP-проверки.

## После Д3 — один внешний отпечаток

Состояние сразу после `ad74c1af3`:

| Дверь | Все пять строк состояния до проверки кода | Заголовки | Задержка до ответа |
|---|---|---|---|
| `forgot` | `200 {"ok":true,"retryAfterSeconds":60}` | `Content-Type: application/json`; без `Location` и `Retry-After` | Один `resolveAuthState`; чтение получателя, создание challenge и доставка запускаются detached только для подходящего кандидата |
| `setup-access` | `200 {"ok":true,"retryAfterSeconds":60}` | `Content-Type: application/json`; без `Location` и `Retry-After` | Один `resolveAuthState`; candidate-only работа detached |
| `setup-code/complete` с неверным OTP | `400 {"ok":false,"error":"invalid_code"}` | `Content-Type: application/json`; без `Location` и `Retry-After` | Один `resolveAuthState` и одна OTP-проверка: реальный `userId` только для `needs_email_setup`, dummy UUID для остальных |

Валидный OTP по-прежнему разрешает законную развилку после проверки: `needs_email_setup` доходит до единственного
write-path `completePasswordSetupAfterVerification`; reset-код обрабатывает `email-password/reset`. Это уже не
предкодовый oracle.

Текущее состояние после более нового Д4:

| Дверь | Текущий результат |
|---|---|
| `forgot` | Нейтральный `200` из таблицы выше |
| `setup-access` | Route удалён для всех адресов коммитом `036be6453`; безусловный Next 404 не зависит от состояния учётки |
| `setup-code/complete` | Нейтральный `400 invalid_code` до успешной OTP-проверки |

Тест на текст или на отсутствие route не добавлялся: это нарушило бы §10a. Публичный route-тест фиксирует
status, JSON-body, `content-type`, `location`, `retry-after`, redirect flag, повторы и отсутствие ожидания
candidate-only работы. Независимый oracle — Д3 плана и канон неразличимости, а не текущая реализация.

## Текст уведомления

Экран не пишет локальную строку: нейтральный успех использует один ключ
`notificationText.authEmailCodeSentIfExists` из `notificationText.ts`. Второго ключа с тем же смыслом нет.
Маршруты возвращают машинные поля контракта, а не пользовательский копирайт.

## Законные сценарии

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/modules/auth/passwordEligibility.route.test.ts src/modules/auth/passwordAuth.route.test.ts"
```

Результат: `rc=0`; `2` файла, `29` тестов прошли. Набор доказывает на публичной route-границе:

- staff-учётка без пароля после верного setup-кода получает пароль и сессию;
- пароль пациенту не назначается;
- reset и first-time setup не обходят одноразовость кода;
- повтор кода не выполняет write второй раз;
- текущий password-login/recovery contract остаётся зелёным.

Сообщение `permission denied for table platform_users` в stderr этого прогона — намеренно инъецированный
operator-error сценарий из `passwordAuth.route.test.ts`; сам набор завершился `rc=0`.

## Fault injection

Все локальные мутации были временными и сняты до финального прогона.

1. `forgot`: в `PASSWORD_RECOVERY_REQUEST_ACCEPTED` добавлено `setupRequired: true`.
   Команда focused route-test через host-lock завершилась `rc=1`; assertion публичного fingerprint показал
   лишнее поле в body.
2. `setup-access`: в первичном независимом аудите `33f484867` route временно возвращал
   `403 {"ok":false,"error":"not_eligible"}`. Та же команда focused route-test завершилась `rc=1`; evidence
   сохранён в `docs/_TODO/AUDIT_D3_PASSWORD_ENUM_2026-09-16.md`. Сейчас route удалён более новым Д4, поэтому
   повторно возвращать его в production tree ради инъекции нельзя.
3. `setup-code/complete`: перед OTP-проверкой для `verified_with_password` временно возвращён
   `409 already_has_login`. Focused route-test завершился `rc=1`: покраснели предкодовый fingerprint и
   post-code matrix (`2` упавших теста из `6`).
4. Тайминг `forgot`: перед detached candidate-work добавлено ожидаемое `200 ms`. Focused route-test завершился
   `rc=1`: ожидалось `200`, получено `"not settled"`.

Итог двери/status/body: **убито 3 из 3**. Отдельный timing-класс: **убито 1 из 1**.

## Валидация

- Targeted route-набор: `rc=0`, команда и результат указаны выше.
- `pnpm --dir apps/webapp exec tsc --noEmit` → `rc=0`.
- `pnpm --dir apps/webapp exec eslint src/app-layer/auth/completePasswordSetup.ts src/app-layer/auth/passwordRecovery.ts src/app/api/auth/email-password/forgot/route.ts src/app/api/auth/email-password/reset/route.ts src/app/api/auth/email-password/setup-code/complete/route.ts src/modules/auth/passwordAuth.route.test.ts src/modules/auth/passwordEligibility.route.test.ts src/shared/ui/patient/auth/AuthFlowV2.tsx` → `rc=0`.
- Полный CI не запускался по прямому запрету брифа.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.

## НЕ СДЕЛАНО

- Галочка Д3 в `AUTH_DOORS_FIX_2026-09-16.md` не поставлена: это действие ведущего после независимой приёмки.
- Удалённый этапом Д4 `setup-access` не восстановлен.
- PROD и TEST не затрагивались; миграции не применялись; второй Next-сервер не запускался.
- Живой ввод OTP на общем DEV и известный отдельный дефект `500` смены пароля не проверялись и не исправлялись.
- Полный CI не запускался.
