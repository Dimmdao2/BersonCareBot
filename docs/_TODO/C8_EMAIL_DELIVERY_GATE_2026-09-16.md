# С8. Назначение гейта доставки почтового кода

## Что изменено

- `withAuthDeliveryChannelGate` получил обязательное назначение без значения по умолчанию:
  `login_door` или `surface_requested`.
- `login_door` сохраняет прежнюю проверку по ambient-поверхности. Для email назначение
  `surface_requested` использует существующую проверку настроенности transactional-канала
  `isAuthChannelEnabled('email', undefined, 'transactional')`.
- `EmailChallengePurpose` проходит от `startEmailChallenge` через `EmailSendPort` до
  `integratorEmailAdapter`. Только назначение `login` считается дверью входа; остальные purpose,
  включая `public_registration`, `staff_login_factor` и `specialist_signup`, — кодом, который уже
  потребовал законный сценарий поверхности.
- Новых настроек, ключей `system_settings`, модулей политики и миграций нет.

## Красный тест до исправления

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/infra/integrations/email/integratorEmailAdapter.deliveryPurpose.unit.test.ts --project unit"
```

На исходном дереве упали оба сценария: `staff_login_factor` и `specialist_signup` на ambient
`staff` вернули `{ ok: false, error: 'auth_channel_disabled' }` вместо отправки во внешний
интегратор. В этом же тесте самостоятельный purpose `login` ожидает и сохраняет
`auth_channel_disabled`, не вызывая интегратор.

После исправления целевой прогон двух файлов дал `2 passed`, `5 passed`:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/infra/integrations/email/integratorEmailAdapter.deliveryPurpose.unit.test.ts src/modules/auth/authDeliveryGate.unit.test.ts --project unit"
```

## Проверенная мутация

В `withAuthDeliveryChannelGate` временно возвращено единое поверхностно-зависимое поведение для
обоих назначений: `isAuthChannelEnabled(channel)` без transactional-ветки. Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/infra/integrations/email/integratorEmailAdapter.deliveryPurpose.unit.test.ts src/app/api/auth/specialist-signup/start/route.route.test.ts"
```

дала `3 failed`: красными стали отправка `staff_login_factor`, отправка `specialist_signup` через
адаптер и route-сценарий регистрации специалиста (`400` вместо `200`). После проверки мутация
снята.

## Финальная проверка

Затронутый набор:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/infra/integrations/email/integratorEmailAdapter.deliveryPurpose.unit.test.ts src/infra/integrations/sms/integratorSmsAdapter.deferred.unit.test.ts src/modules/auth/authDeliveryGate.unit.test.ts src/modules/auth/deliveryChannelCallerGate.route.test.ts src/modules/auth/emailAuth.durableQueue.d27c.test.ts src/modules/auth/emailAuth.patientEmailChange.unit.test.ts src/modules/auth/emailOtpPublic.unit.test.ts src/modules/auth/passwordAuth.route.test.ts src/app/api/auth/email-otp/start/route.route.test.ts src/app/api/auth/specialist-signup/start/route.route.test.ts src/modules/patient-invites/continuationCookie.test.ts src/modules/patient-invites/inviteLinkLifecycle.test.ts"
```

Результат финального повтора этой команды: `12 passed`, `61 passed`.

Typecheck:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp run typecheck"
```

Результат: exit code `0`. Точечный ESLint по всем изменённым TypeScript-файлам также завершился
успешно через тот же `run-tests.sh`.

## Все вызывающие места гейта

| Вызывающее место | Назначение | Почему |
|---|---|---|
| `patient/diary/purge-otp/start` | `surface_requested` | Код подтверждает уже авторизованное удаление данных, а не открывает сессию. |
| `booking/public/create` | `surface_requested` | Код подтверждает публичную запись, но не является дверью входа. |
| `requestMessengerContactViaIntegrator` | `login_door` | Запрос контакта — часть messenger-входа и обязан учитывать набор способов поверхности. |
| `deliverSmsCodeViaIntegrator` | обязательный аргумент вызывающего | Общий SMS-шов обслуживает и login (`integratorSmsAdapter`), и подтверждение записи (`buildAppDeps`). |
| `integratorSmsAdapter` | `login_door` | SMS/Telegram/MAX/email здесь доставляют код phone-login; email передаёт purpose `login`. |
| `integratorEmailAdapter` | из `EmailChallengePurpose` | `login` — surface-aware дверь; registration, второй фактор, signup, invite, reset/setup/verify/change — уже запрошенная доставка. |

## Что не сделано

- UI и автоматические UI-тесты не тронуты.
- Миграций, прав БД, новых настроек и ключей `system_settings` нет; DEV/TEST/PROD не тронуты.
- Полный CI не запускался по брифу; выполнялись только затронутые unit/route-тесты и webapp
  typecheck через `run-tests.sh`.
- Галочка С8 в плане не поставлена: её ставит ведущий после независимого аудита.
- Ветка не пушилась: worker по §24.3 оставляет ведущему локальный коммит-кандидат.
