# Платформенный администратор: снятие OTP-эскалации

Дата: 2026-09-16. Oracle: `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md`, С9 — дверь
платформенного администратора содержит только email и пароль. Реализован вариант A из
`docs/_TODO/ADMIN_OTP_ESCALATION_MEASURE_2026-09-16.md`: роль `admin` берётся только из сохранённой роли
`platform_users`, а подтверждённый email из `PLATFORM_OWNER_IDENTITY` роль не повышает.

## Что снято

1. `apps/webapp/src/app/api/auth/email-otp/confirm/route.ts`: после успешного кода используется только
   `user.role`, загруженная из БД. Любая роль, кроме `client`, безусловно получает
   `403 portal_access_denied`; исключения для совпадения с `PLATFORM_OWNER_IDENTITY` нет.
2. `apps/webapp/src/modules/auth/service.ts`: при разрешении каждой сессии больше не читается подтверждённый
   email ради роли и не строится session-only `admin`. Возвращается актуальная DB-проекция пользователя.
3. Существующий route-тест, который закреплял отменённый вход администратора одним email-кодом, заменён на
   owner-oracle: совпадение со списком не меняет persisted `client` ни в HTTP-ответе двери, ни при записи
   сессии. Отдельная проверка session chokepoint доказывает, что последующее разрешение той же сессии также
   оставляет роль `client`.

Почему эти тесты допустимы по §10a/§10b:

- поломка: подтверждение кода для адреса из списка молча выдаёт `admin` вместо сохранённой роли;
- последствие: человек получает платформенный доступ без пароля;
- независимый oracle: решение владельца С9 и auth-канон, а не текущая реализация;
- проверяется конечный публичный результат цепочки — роль в ответе двери и роль разрешённой сессии; UI/DOM,
  внутренний порядок вызовов и текст исходника не проверяются.

## Что осталось живым

После правки точный поиск выполнен командой:

```bash
rg -n --glob '!**/*.test.*' --glob '!docs/**' \
  "isVerifiedEmailGlobalAdminAsync|PLATFORM_OWNER_IDENTITY" apps packages deploy
```

Живых runtime-вызовов `isVerifiedEmailGlobalAdminAsync` не осталось. Поиск находит её определение в
`apps/webapp/src/modules/auth/emailAuth.ts`, объявление/загрузку `PLATFORM_OWNER_IDENTITY` в
`apps/webapp/src/config/env.ts` и legacy ops/comments в `deploy/postgres/platform-owner-identity-pin.sql` и
`apps/webapp/src/app/api/platform/settings/route.ts`. Функция и список намеренно не удалены: решение об их
отдельной чистке оставлено ведущему.

## Поведенческие проверки

Итоговый затронутый набор:

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm -C apps/webapp exec vitest --run src/app/api/auth/email-otp/confirm/route.route.test.ts src/modules/auth/sessionColdComposition.unit.test.ts"
```

Результат: `2` файла, `19` тестов, все зелёные.

### Собственная инъекция: OTP-route

Временно возвращены вызов `isVerifiedEmailGlobalAdminAsync(email)` и подмена `client → admin` в
`email-otp/confirm`; затем выполнено:

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm -C apps/webapp exec vitest --run src/app/api/auth/email-otp/confirm/route.route.test.ts"
```

Результат: `rc=1`; утверждение `keeps a listed email at its persisted client role after OTP confirmation`
покраснело на наблюдаемом результате `role: admin` вместо `role: client`. Временная поломка откатана.

### Собственная инъекция: разрешение сессии

Временно возвращены чтение подтверждённого email и подмена DB-роли в
`getCurrentSessionWithPrincipalMode`; затем выполнено:

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm -C apps/webapp exec vitest --run src/modules/auth/sessionColdComposition.unit.test.ts"
```

Результат: `rc=1`; утверждение
`keeps a listed email at its persisted client role during later session resolution` покраснело на
наблюдаемом результате `role: admin` вместо `role: client`. Временная поломка откатана.

### Статика

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm -C apps/webapp exec tsc --noEmit -p tsconfig.json"
```

Результат: `rc=0`.

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm -C apps/webapp exec eslint src/app/api/auth/email-otp/confirm/route.ts src/modules/auth/service.ts src/app/api/auth/email-otp/confirm/route.route.test.ts src/modules/auth/sessionColdComposition.unit.test.ts"
```

Результат: `rc=0`.

## Живая проверка DEV

Проверка выполнена на единственном общем DEV Next `http://127.0.0.1:5200`. Учётка и опубликованный пароль
взяты из `AGENTS.md` §1a; `.env` не читался. Запрос повторяет обычную форму `/app/admin/login`: тот же
password-route, `roleLoginPortal: "admin"`, браузерные `Origin` и `Referer`; cookie держалась только в shell
variable и не печаталась.

```bash
dev_admin_password="$(sed -n 's/.*опубликованный пароль `\([^`]*\)`.*/\1/p' AGENTS.md | head -n 1)"
login_response="$(
  curl -sS -i \
    -H 'content-type: application/json' \
    -H 'origin: http://127.0.0.1:5200' \
    -H 'referer: http://127.0.0.1:5200/app/admin/login' \
    --data "{\"email\":\"dimmdao@gmail.com\",\"password\":\"$dev_admin_password\",\"roleLoginPortal\":\"admin\"}" \
    http://127.0.0.1:5200/api/auth/email-password/login
)"
login_status="$(printf '%s' "$login_response" | sed -n '1s/[^ ]* \([0-9][0-9][0-9]\).*/\1/p')"
session_cookie="$(
  printf '%s' "$login_response" |
    sed -n 's/^set-cookie: \(bersoncare_webapp_session=[^;]*\).*/\1/ip' |
    head -n 1
)"
login_body="${login_response#*$'\r\n\r\n'}"
printf 'LOGIN_HTTP=%s SESSION_COOKIE_SET=%s\n' \
  "$login_status" "$([ -n "$session_cookie" ] && printf yes || printf no)"
printf '%s' "$login_body" | jq '{ok, role, redirectTo, factorRequired, factorMethod, error}'
```

Наблюдаемый результат без вывода cookie: `HTTP 200`, `ok=true`, `role=admin`,
`redirectTo=/app/admin/system-health`. С выданной cookie:

```bash
curl -sS -H "Cookie: $session_cookie" http://127.0.0.1:5200/api/me
curl -sS -o /dev/null -w '%{http_code}' \
  -H "Cookie: $session_cookie" http://127.0.0.1:5200/app/admin/system-health
```

`/api/me` вернул `ok=true`, `role=admin`; административный кабинет вернул `HTTP 200`. Сырой первый POST без
`Origin` был ожидаемо отклонён `403 csrf_origin_forbidden`; браузерный запрос выше прошёл.

Общий DEV по §1a обслуживает интеграционное дерево, а не этот незалендившийся worker-клон. Поэтому live-проход
доказывает обязательный lockout-precondition — действующая password-дверь и persisted роль владельца работают;
кандидат отдельно вторым Next не поднимался. Снятие обеих OTP-подмен доказано затронутыми тестами и двумя
независимыми fault injection выше.

## НЕ СДЕЛАНО

- `PLATFORM_OWNER_IDENTITY` и `isVerifiedEmailGlobalAdminAsync` не удалены и не переименованы.
- Вход по паролю, политика второго фактора и `staffSecurity` не менялись.
- Миграции не создавались и не применялись; роли и другие данные DEV не менялись.
- TEST и оба PROD не читались и не трогались.
- Галочки существующих планов не менялись.
- Полный `pnpm run ci` не запускался: изменение локализовано в двух auth-точках, а затронутые route/unit-тесты,
  typecheck и ESLint закрывают конкретный риск этого этапа.
- Worker-кандидат не приземлялся в интеграционное дерево и не поднимал отдельный DEV server; повторная live-
  приёмка именно приземлённого кода остаётся за ведущим после landing по `AGENTS.md` §1a/§24.3.
