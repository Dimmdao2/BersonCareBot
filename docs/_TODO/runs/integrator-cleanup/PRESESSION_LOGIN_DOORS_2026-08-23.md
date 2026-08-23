# D15b/6 — двери pre-session входа по телефону и почте (2026-08-23)

## Итог

Закрыты две именованные двери класса `pre_session`, не выдавая этому классу relation capability:

1. `pgEmailPasswordLookup` больше не читает `platform_users`, `user_contacts` и
   `user_password_credentials` напрямую. Он вызывает новый exact `SECURITY DEFINER`-корень
   `app.pre_session_load_email_auth_state(text)`, возвращающий только `id`, `email_verified` и
   `has_password` с прежней семантикой подтверждённой почты и `merged_into_id IS NULL`.
2. Существующий `app.get_preferred_auth_channel_code(uuid)` переведён на exact accepted context
   `auth.phone-login.preferred-channel`; `app_pre_session` получил только EXECUTE/capability этой
   функции. Репозиторий вызывает её через `runWebappNamedRoot`.

Оба тела первым оператором после `BEGIN` вызывают `app.require_accepted_context`. В миграции нет
`GRANT`, `REVOKE`, создания или изменения ролей. Все права, relation surfaces, delegation и две
capability заданы в `deploy/postgres/privileges/declaration.ts` и сгенерированных артефактах.

## Повторный замер живого TEST

Запросы выполнялись с `--resolve test.bersoncare.ru:443:127.0.0.1` и
`Origin: https://test.bersoncare.ru`; TEST не изменялся и не деплоился. Команда замера:

```bash
for spec in \
  'email-password/lookup|{"email":"presession-door-probe@example.test"}' \
  'phone/start|{"phone":"+79990000000"}' \
  'email-password/forgot|{"email":"presession-door-probe@example.test"}' \
  'email-otp/start|{"email":"presession-door-probe@example.test"}'
do
  endpoint=${spec%%|*}; payload=${spec#*|}
  curl --silent --show-error --output /dev/null --write-out "$endpoint %{http_code}\n" \
    --resolve test.bersoncare.ru:443:127.0.0.1 \
    -H 'Origin: https://test.bersoncare.ru' -H 'Content-Type: application/json' \
    --data "$payload" "https://test.bersoncare.ru/api/auth/$endpoint"
done
```

Фактический результат этого хода:

```text
email-password/lookup 200
phone/start 200
email-password/forgot 200
email-otp/start 200
```

То есть зафиксированные в брифе два `500` в момент повторного замера уже не воспроизвелись. Проверка
состояния TEST показала другой runtime-факт:

```bash
git -C /opt/projects/bersoncarebot-test rev-parse HEAD
systemctl show bersoncarebot-webapp-test.service \
  -p ActiveState -p SubState -p ExecMainStartTimestamp
```

```text
9a69439f7...
ActiveState=failed
SubState=failed
ExecMainStartTimestamp=Sat 2026-08-22 17:09:...
```

Журнал unit текущему пользователю недоступен. Эти факты объясняют расхождение времени/состояния
замера, но не меняют доказанный дефект candidate-кода: оба обращения шли через undeclared
bootstrap relation/root capability. TEST не трогался.

## Права и миграция

Миграция:
`apps/webapp/db/drizzle-migrations/20260823T002500_pre_session_login_uses_two_named_doors.sql`.

- owner нового почтового корня: `app_seam_password_auth_owner`;
- owner существующего preferred-channel корня: `app_seam_identity_lookup_owner`;
- runtime target: только `app_pre_session` через exact named-root EXECUTE;
- почтовому owner нужны ровно SELECT surfaces `platform_users(id, merged_into_id)`,
  `user_contacts(platform_user_id, contact_kind, is_primary, confirmed_at)`,
  `user_password_credentials(user_id)` и EXECUTE существующего
  `find_platform_user_ids_by_any_confirmed_email(text)`;
- preferred-channel relation surface не расширен, добавлена только pre-session capability
  существующего корня.

Проверка отсутствия прав/ролей в миграции:

```bash
rg -n "\b(GRANT|REVOKE|CREATE ROLE|ALTER ROLE|DROP ROLE)\b" \
  apps/webapp/db/drizzle-migrations/20260823T002500_pre_session_login_uses_two_named_doors.sql
```

Результат: пустой вывод.

Генерация и byte-check:

```bash
node deploy/postgres/privileges/generate-cli.mjs --all
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only
node deploy/postgres/privileges/generate-cli.mjs --all --check
```

Результат: оба privilege/allowlist target совпадают побайтно; финальная строка:

```text
--check: артефакты соответствуют декларации побайтно.
```

## Поведенческое доказательство

Тест применяет candidate-тела, сгенерированные права и capability к именованной
`bcb_webapp_dev` только внутри транзакций с `ROLLBACK`. Для каждой двери отдельно доказаны отказ
без accepted context и успех с exact purpose/typed args.

Healthy:

```bash
RUN_PRESESSION_LOGIN_DOORS_DB=1 node --test --test-concurrency=1 \
  deploy/postgres/privileges/pre-session-login-doors.devDbProof.test.mjs
```

```text
tests 4
pass 4
fail 0
```

Fault injection заменяет вычисление `has_password` в теле candidate-корня на ложное и не меняет
файлы или постоянную схему:

```bash
RUN_PRESESSION_LOGIN_DOORS_DB=1 PRESESSION_LOGIN_DOORS_FAULT=email \
  node --test --test-concurrency=1 \
  deploy/postgres/privileges/pre-session-login-doors.devDbProof.test.mjs
```

```text
Expected: 00000000-0000-4000-8000-0000000000d6|true|true
Actual:   00000000-0000-4000-8000-0000000000d6|true|false
tests 4
pass 3
fail 1
FAULT_INJECTION_EXIT=1
```

После отключения fault та же healthy-команда повторно дала `pass 4`, `fail 0`.

Репозиторные unit-тесты:

```bash
pnpm --dir apps/webapp exec vitest --run \
  src/infra/repos/pgEmailPasswordLookup.test.ts \
  src/infra/repos/pgChannelPreferences.getDefaultAuthOtpChannel.test.ts
```

```text
Test Files  2 passed (2)
Tests       8 passed (8)
```

## Обязательные гейты

```bash
pnpm --dir apps/webapp typecheck
```

Результат: exit 0.

```bash
pnpm --dir apps/webapp lint
```

Результат: exit 0; все встроенные chokepoint/migration/door checks прошли. ESLint сообщил 2
существующих warning без ошибок в `AppointmentPaymentSection.tsx`; файл вне diff.

DEV rollback-only preflight:

```bash
bash deploy/host/migrate-dev.sh --preflight
```

Worktree не содержит секретные env-файлы, поэтому для запуска в него на время команды были
скопированы документированные DEV `.env` и `apps/webapp/.env.dev` из основного DEV workspace; обе
копии удалены `trap` после команды.

```text
CREATE FUNCTION
CREATE FUNCTION
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=53 ...
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

`--execute` не запускался. TEST/PROD не изменялись, push не выполнялся, галочка D15b/6 не ставилась.
