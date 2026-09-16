# Платформенный администратор: замер OTP-эскалации и проект снятия

Дата замера: 2026-09-16. Scope: код текущей ветки и read-only состояние `bcb_webapp_dev`; TEST и PROD не
читались, миграции не запускались, продуктовый код и тесты не менялись.

Oracle: дверь платформенного администратора содержит только email и пароль
(`docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md:15-17`,
`docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md:84-88`). Второй фактор остаётся отдельным продолжением после
первичного входа, а не самостоятельной дверью (`docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md:43-46`).

## 1. Кто находится в списке и какая роль записана в DEV

**Ответ:** механизм поддерживает ровно один env-pinned адрес; его live-значение без чтения `.env.dev` не
установлено, но committed owner-anchor совпадает в DEV ровно с одной активной учёткой, и её роль в базе уже
`admin`.

Доказательства:

- «Список» фактически не список: `isVerifiedEmailGlobalAdminAsync` нормализует один
  `PLATFORM_OWNER_IDENTITY` и делает exact comparison (`apps/webapp/src/modules/auth/emailAuth.ts:132-143`);
  конфигурация также объявляет одно строковое значение, не CSV (`apps/webapp/src/config/env.ts:137-152`).
- Исторический provisioning-anchor определяет одну выделенную платформенную учётку с persisted
  `role='admin'`, а не session-only ролью (`deploy/postgres/p0-data-fix-doctor-admin-split.sql:5-14`,
  `deploy/postgres/p0-data-fix-doctor-admin-split.sql:111-166`). Адрес из файла в этот отчёт не переносился.
- Read-only запрос по этому committed anchor вернул: `matched_accounts=1`, `active_accounts=1`,
  `db_role_admin=1`, `db_role_doctor=0`, `db_role_client=0`.
- Независимый срез всех ролей DEV вернул одну активную учётку `admin`, одну активную `doctor` и 270 активных
  `client`. Команда:

```bash
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d bcb_webapp_dev -P pager=off \
  -c "SELECT role, count(*) AS accounts, count(*) FILTER (WHERE NOT is_archived AND merged_into_id IS NULL) AS active_accounts FROM public.platform_users GROUP BY role ORDER BY role;"
```

- Сопоставление с committed anchor выполнено без печати адреса:

```bash
legacy_admin_identity="$(sed -n "s/^[[:space:]]*c_admin_email[[:space:]]*constant text := '\([^']*\)';/\1/p" deploy/postgres/p0-data-fix-doctor-admin-split.sql | head -n 1)"
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d bcb_webapp_dev \
  -v owner_identity="$legacy_admin_identity" -P pager=off <<'SQL'
WITH matched AS (
  SELECT DISTINCT u.id, u.role, u.is_archived, u.merged_into_id
  FROM public.platform_users AS u
  JOIN public.user_contacts AS c ON c.platform_user_id = u.id
  WHERE c.contact_kind = 'email'
    AND c.value_normalized = lower(btrim(:'owner_identity'))
    AND c.confirmed_at IS NOT NULL
)
SELECT
  count(*) AS matched_accounts,
  count(*) FILTER (WHERE NOT is_archived AND merged_into_id IS NULL) AS active_accounts,
  count(*) FILTER (WHERE role = 'admin') AS db_role_admin,
  count(*) FILTER (WHERE role = 'doctor') AS db_role_doctor,
  count(*) FILTER (WHERE role = 'client') AS db_role_client
FROM matched;
SQL
```

## 2. Пароль и второй фактор у этой учётки

**Ответ:** у совпавшей DEV-учётки пароль есть (`1/1`), а второй фактор не настроен: TOTP enrolment `0/1`, строки
в `staff_security_profiles` нет.

Доказательства:

- Наличие пароля определяется существованием строки `user_password_credentials`; схема требует непустой
  `password_hash` (`apps/webapp/db/schema/schema.ts:246-265`). Запрос вернул `password_yes=1`,
  `password_no=0`.
- Настроенный второй фактор в runtime означает одновременно `factor_type='totp'` и непустой
  `factor_verified_at` (`apps/webapp/src/modules/staff-security/service.ts:7-16`). Запрос вернул
  `security_profile_yes=0`, `security_profile_no=1`, `totp_enrolled_yes=0`.
- У совпавшей учётки нет строк `org_enrollments`: запрос вернул `organization_enrollments=0`. Поэтому
  клиничная политика email-кода после пароля к ней не применяется: маршрут запрашивает эту политику только
  через найденную membership (`apps/webapp/src/app/api/auth/email-password/login/route.ts:64-83`).
- Агрегирующая команда, не печатающая email, hash, TOTP secret, recovery codes или UUID:

```bash
legacy_admin_identity="$(sed -n "s/^[[:space:]]*c_admin_email[[:space:]]*constant text := '\([^']*\)';/\1/p" deploy/postgres/p0-data-fix-doctor-admin-split.sql | head -n 1)"
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d bcb_webapp_dev \
  -v owner_identity="$legacy_admin_identity" -P pager=off <<'SQL'
WITH matched AS (
  SELECT DISTINCT u.id, u.role
  FROM public.platform_users AS u
  JOIN public.user_contacts AS c ON c.platform_user_id = u.id
  WHERE c.contact_kind = 'email'
    AND c.value_normalized = lower(btrim(:'owner_identity'))
    AND c.confirmed_at IS NOT NULL
    AND NOT u.is_archived
    AND u.merged_into_id IS NULL
)
SELECT
  m.role,
  count(*) AS accounts,
  count(*) FILTER (WHERE p.user_id IS NOT NULL) AS password_yes,
  count(*) FILTER (WHERE p.user_id IS NULL) AS password_no,
  count(*) FILTER (WHERE s.user_id IS NOT NULL) AS security_profile_yes,
  count(*) FILTER (WHERE s.user_id IS NULL) AS security_profile_no,
  count(*) FILTER (WHERE s.factor_type = 'totp' AND s.factor_verified_at IS NOT NULL) AS totp_enrolled_yes
FROM matched AS m
LEFT JOIN public.user_password_credentials AS p ON p.user_id = m.id
LEFT JOIN public.staff_security_profiles AS s ON s.user_id = m.id
GROUP BY m.role;

WITH matched AS (
  SELECT DISTINCT u.id
  FROM public.platform_users AS u
  JOIN public.user_contacts AS c ON c.platform_user_id = u.id
  WHERE c.contact_kind = 'email'
    AND c.value_normalized = lower(btrim(:'owner_identity'))
    AND c.confirmed_at IS NOT NULL
    AND NOT u.is_archived
    AND u.merged_into_id IS NULL
)
SELECT count(*) AS organization_enrollments
FROM public.org_enrollments AS e
JOIN matched AS m ON m.id = e.platform_user_id;
SQL
```

## 3. Какие ещё двери дают роль `admin`

**Ответ:** list-based эскалация одна — `PLATFORM_OWNER_IDENTITY`, но она включена в двух живых точках; остальные
живые двери возвращают persisted роль из базы, а старые `ADMIN_*` allowlist-переменные роль больше не повышают.

Доказательства:

- `POST /api/auth/email-otp/confirm` после успешного кода меняет загруженную DB-роль на `admin`, если email
  совпал с pin (`apps/webapp/src/app/api/auth/email-otp/confirm/route.ts:104-142`). Это публичный endpoint;
  `roleLoginPortal` необязателен (`apps/webapp/src/app/api/auth/email-otp/confirm/route.ts:30-35`), поэтому
  запрет `email_code` именно на admin surface не убирает обход через поверхность, где email-код разрешён.
- `getCurrentSessionWithPrincipalMode` на каждом разрешении сессии заново читает подтверждённый email и снова
  подменяет DB-роль на `admin` (`apps/webapp/src/modules/auth/service.ts:920-955`). Поэтому удалить только
  эскалацию из confirm-route недостаточно.
- Полный exact search двух вызовов:

```bash
rg -n --glob '!**/*.test.*' --glob '!docs/**' "isVerifiedEmailGlobalAdmin[A-Za-z]*" apps packages deploy
```

Он нашёл только определение и два runtime call site выше; прочие совпадения — import/config comments.

- `ADMIN_TELEGRAM_ID`, `ADMIN_MAX_IDS` и `ADMIN_PHONES` ещё парсятся в config
  (`apps/webapp/src/config/env.ts:119-134`), но exact search вне тестов не нашёл ни одного runtime-чтения этих
  значений. Команда:

```bash
rg -n --glob '!**/*.test.*' --glob '!docs/**' \
  "ADMIN_TELEGRAM_ID|ADMIN_MAX_IDS|ADMIN_PHONES|ALLOWED_TELEGRAM_IDS|ALLOWED_MAX_IDS" apps packages
```

- Telegram init, MAX init, Telegram Login Widget и integrator token получают пользователя через canonical
  binding resolver и сохраняют `resolved.user.role`; без DB-port их fallback всегда `client`, не `admin`
  (`apps/webapp/src/modules/auth/service.ts:581-615`, `apps/webapp/src/modules/auth/service.ts:640-669`,
  `apps/webapp/src/modules/auth/service.ts:725-748`, `apps/webapp/src/modules/auth/service.ts:786-815`).
- Парольная дверь проверяет пароль, затем загружает пользователя и использует его DB-роль
  (`apps/webapp/src/app/api/auth/email-password/login/route.ts:167-235`,
  `apps/webapp/src/app/api/auth/email-password/login/route.ts:291-314`). Passkey-route тоже возвращает роль
  найденного DB-user, не allowlist-роль (`apps/webapp/src/app/api/auth/passkey/login/verify/route.ts:82-109`).

Итого по живым способам получить `admin`:

1. email OTP + `PLATFORM_OWNER_IDENTITY` — list-based подмена роли;
2. повторное разрешение любой уже валидной сессии + подтверждённый pinned email — та же list-based подмена;
3. email+password и passkey — не эскалация, а чтение persisted `platform_users.role='admin'`.

## 4. Что сломается при снятии эскалации

**Ответ:** для измеренной dedicated DEV-учётки снятие обеих подмен убирает только вход одним кодом; доступ через
admin email+password сохраняется, но любой другой live pin, не совпадающий с этой persisted `admin`-учёткой,
потеряет платформенный доступ на следующем session resolution.

Доказательства и наблюдаемое последствие:

- После снятия подмены email OTP загрузит настоящую DB-роль. Для `admin`/`doctor` этот маршрут затем отвечает
  `403 portal_access_denied`, потому что самостоятельный код разрешён только клиенту; исключением сейчас является
  именно pin (`apps/webapp/src/app/api/auth/email-otp/confirm/route.ts:116-140`). Человек больше не войдёт одним
  кодом с почты.
- Официальная `/app/admin/login` привязана к portal `admin`
  (`apps/webapp/src/app/app/(role-login)/admin/login/page.tsx:3-14`), а surface policy оставляет там password и
  TOTP, без самостоятельного email-кода и passkey
  (`apps/webapp/src/shared/lib/surface/surfaceAuthPolicy.ts:20-36`). Форма вызывает password-route
  (`apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx:1424-1489`).
- Persisted роль `admin` даёт capabilities `platform.operations` и `account.self`
  (`apps/webapp/src/app-layer/guards/workspaceCapabilities.ts:47-52`). Значит для измеренной учётки password-login
  продолжит вести в `/app/admin` (`apps/webapp/src/modules/auth/redirectPolicy.ts:17-21`).
- Эскалированную роль потребляет весь platform subtree: общий `/app/admin/*` layout и оставшиеся platform-страницы
  под `/app/doctor/*` вызывают `requirePlatformOperationsPage`
  (`apps/webapp/src/app/app/admin/layout.tsx:31-45`,
  `apps/webapp/src/app/app/(global-admin)/doctor/layout.tsx:7-21`). Settings-страницы используют тот же guard
  (`apps/webapp/src/app/app/settings/requireAdminDoctorPage.ts:7-24`).
- Серверные проверки: page guard без `platform.operations` перенаправляет на `/app`, platform API возвращает
  `401` без сессии и `403` без capability, bare admin API возвращает `403` при роли не `admin`
  (`apps/webapp/src/app-layer/guards/requireRole.ts:214-238`,
  `apps/webapp/src/app-layer/guards/requireRole.ts:241-306`). Proxy отправляет не свою роль в собственный hub с
  access-denied (`apps/webapp/src/proxy.ts:336-378`).
- Точный список прямых page/API consumers получен командами:

```bash
rg -l --glob '!**/*.test.*' "requirePlatformOperationsPage" apps/webapp/src/app | sort
rg -l --glob '!**/*.test.*' \
  "requirePlatformOperationsApiContext|requireAdminApiContext" apps/webapp/src/app/api | sort
```

Следствие по двум возможным состояниям:

- если live pin указывает на измеренную DB-учётку, существующие сессии после refresh сохранят `admin` из базы,
  страницы и API останутся доступны, а следующий вход пойдёт через пароль;
- если live pin указывает на другую роль, session refresh вернёт её настоящую роль, `/app/admin/*` уйдёт на
  `/app`/собственный hub, а platform API начнут отвечать `403`; если у этой учётки нет подходящего persisted
  `admin` + пароля, человек будет заперт с platform surface.

## 5. Форма починки

**Ответ:** меньше всего ломает вариант A — удалить обе list-based подмены и оставить DB-роль единственным
источником `admin`, но только после сверки live pin с DB и успешного живого входа владельца по паролю.

### Вариант A — снять эскалацию, опираться на роль в базе

Что менять после отдельного допуска на реализацию:

1. Удалить pin-подмену из `email-otp/confirm` и обычного session resolution одновременно; одиночная правка одной
   точки оставляет вторую дверь.
2. Оставить `email-otp/confirm` с существующим правилом: самостоятельный email-код создаёт session только
   `client`, а staff/admin получают `portal_access_denied`.
3. Удалить ставшие ложными комментарии и неиспользуемый role-elevation config/ops artifact; роль не выдавать
   миграцией. Если нужен повторяемый provisioning роли, он должен быть отдельной штатной ops-операцией, а не
   auth fallback и не миграционный `UPDATE`.

Цена: исчезает аварийный вход одним email-кодом. Взамен получается одна authority — persisted роль, уже
используемая password/passkey дверями и всеми guards. Для измеренной учётки data migration не нужна: роль и
пароль уже есть.

### Вариант B — оставить pin только как второй фактор после пароля

Что менять после отдельного допуска на реализацию:

1. Pin перестаёт назначать роль в `email-otp/confirm` и `getCurrentSession`.
2. Password-route сначала обязан успешно проверить password и загрузить persisted `admin`; только затем для
   pinned identity создаётся `staff_login_factor` email challenge через существующий continuation-механизм
   (`apps/webapp/src/app/api/auth/email-password/login/route.ts:261-303`,
   `apps/webapp/src/app/api/auth/email-password/login/factor/route.ts:70-117`).
3. Admin session выдаётся только после второго кода. Обычная session refresh никогда не повышает роль по email.

Цена: больше состояний и кода, зависимость входа владельца от доставки почты и ещё одна точка отказа. Сейчас у
учётки нет enrolment и platform-wide policy второго фактора; существующая email-factor policy клиничная и требует
membership, которой у dedicated admin нет. Поэтому вариант требует отдельного явного platform-admin правила и
recovery-пути, иначе он повышает риск lockout.

### Что сделать до снятия, чтобы не запереть владельца

1. В operator-среде, не печатая значение, сравнить фактический live `PLATFORM_OWNER_IDENTITY` с canonical
   confirmed email активной DEV/TEST/PROD-учётки отдельно для каждой среды. Этот ход установил только DEV
   committed anchor; TEST/PROD не трогались.
2. Для совпавшей учётки подтвердить `role='admin'`, active/non-merged состояние и строку password credentials.
   Если роль не `admin`, сначала штатно provision persisted role; не компенсировать это оставлением auth bypass.
3. Владелец лично выполняет полный живой вход на `/app/admin/login` email+password и открывает одну platform page.
   Наличие hash в БД не доказывает, что владелец знает актуальный пароль.
4. Если пароль неизвестен — до code removal пройти штатный setup/reset и повторить живой вход. Секрет агенту не
   передавать и в evidence не писать.
5. Только после этого одним изменением снять обе эскалации; после landing повторить живой password-login и
   platform page/API smoke. До этого текущий механизм не трогать.

## ЧЕГО Я НЕ СМОГ УСТАНОВИТЬ

- Не установлено фактическое значение `PLATFORM_OWNER_IDENTITY` у запущенного DEV Next. Команда ниже нашла
  процесс на `127.0.0.1:5200`, но переменной в его OS environment нет:

```bash
dev_pid="$(ss -ltnp '( sport = :5200 )' 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -n 1)"
tr '\0' '\n' < "/proc/$dev_pid/environ" | sed -n '/^PLATFORM_OWNER_IDENTITY=/p'
```

Это не доказывает пустой pin: webapp в development загружает `.env.dev` уже внутри процесса
(`apps/webapp/src/config/loadEnv.ts:4-14`). По запрету brief `.env.dev` не читался.

- Поэтому не доказано, что live DEV pin равен committed owner-anchor. Доказано более узкое: сам committed anchor
  совпадает ровно с одной активной DEV-учёткой `admin`, у которой есть password и нет второго фактора.
- Не установлено, знает ли владелец текущий пароль: hash не проверялся и пароль не запрашивался. Это обязательный
  live precondition перед вариантом A.
- Не измерялись TEST и оба PROD; к ним не было ни чтения, ни probe. Не запускались миграции, отправка email,
  изменение конфигурации, UI-автоматизация или продуктовые тесты.
