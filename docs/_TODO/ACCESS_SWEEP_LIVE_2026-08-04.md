# Перепроверка доступов на живом TEST — часть 2, живой прогон экранов и ручек — 2026-08-04

Бриф: `docs/_TODO/runs/briefs/ACCESS_SWEEP_LIVE_BRIEF_2026-08-04.md`. Параллельная статическая проверка прав в
БД — отдельный агент (`wt/access-static`), её отчёт не читал, как и было велено.

**Метод:** реальные HTTP-запросы на `https://test.bersoncare.ru` (curl, свои cookie jars по роли), сверка с
`sudo -u postgres psql -d bersoncarebot_test` (только чтение) и `journalctl -u bersoncarebot-{webapp,api}-test.service`.
Сессии специалиста и глобального админа получены штатным email+паролем (`POST
/api/auth/email-password/login`) — пароли трём известным TEST-аккаунтам (`dimmdao@yandex.ru` — врач/владелец
клиники, `dimmdao@gmail.com` — глобальный админ, `kinesiospace@gmail.com` — пациент) переустановлены тем же
конвейером, что использовал вчерашний инцидент-раннер
(`apps/webapp/scripts/converge-saas-smoke-login-passwords.mjs --apply-test-from-stdin`, только TEST, только
`user_password_credentials`); новый пароль нигде не записан (ни в этот файл, ни в чат, ни в БД видимым текстом) —
живых пользователей на TEST нет, это разрешено брифом.

⚠️ Замечание процесса: рабочий worktree `bcb-wt-access-live` исчез посреди хода (фоновая прополка веток) —
пересоздан заново с той же точки (`feat/doctor-ui-rebuild` HEAD), потерь не было: коммитов в нём ещё не было.

## Коротко

Из четырёх слоёв три (неавторизованный, специалист/админ клиники, глобальный админ) в порядке — экраны и ручки,
которые должны отвечать, отвечают реальными данными; которые должны быть закрыты — закрыты. Слой «пациент» дал
два подтверждённых, живых, воспроизведённых прямо сейчас провала входа — **это те же две причины, что уже
названы в `docs/_TODO/runs/briefs/LOGIN_BROKEN_RLS_BRIEF_2026-08-04.md`, и обе всё ещё не почищены**: не чинил
(аудит), но каждую перепроверил заново своим замером, не полагаясь на чужой отчёт.

## Находки

### 1. [ПАДЕНИЕ] Вход по телефону падает 500 на этапе выбора канала — подтверждено заново, не почищено

`POST /api/auth/phone/start` с `+79189000782` (телефон TEST-аккаунта пациента) → **HTTP 500, пустое тело**.
Живой журнал `bersoncarebot-webapp-test.service` в момент вызова:

```
⨯ Error: Failed query: SELECT channel_code FROM user_channel_preferences … is_preferred_for_auth = true
  at Object.getPreferredAuthChannelCode → Object.resolveAuthOtpChannel
  [cause]: error: permission denied for table user_channel_preferences   (SQLSTATE 42501)
```

Проверено запросом прямо сейчас, что причина не устранена — у таблицы нет грантов для досессионной
(pre-session) роли:

```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='user_channel_preferences';
```

выдаёт `app_owner`, `app_patient`, `app_staff`, `bcb_test_integrator_login`, `bersoncarebot_test` — досессионной
login-роли (`app_identity_bootstrap`/bootstrap-пул) в списке нет, ровно как описано в причине 2 брифа-фикса.

Отдельно подтверждено: `auth_sms_enabled=false` в `system_settings` (канал SMS выключен административно), но
падение происходит **до** любой проверки этого флага — то есть даже включённый канал SMS не спас бы: код
исполняет запрос к `user_channel_preferences` независимо от состояния флага и падает раньше.

### 2. [ЛОЖНЫЙ УСПЕХ] Вход по почте отвечает «код отправлен», но письмо не уходит — подтверждено заново, не почищено

`POST /api/auth/email-otp/start` с `kinesiospace@gmail.com` (реальный публичный, досессионный вход пациента —
не `email/start`, тот требует уже открытой сессии и тут не при чём) → **HTTP 200
`{"ok":true,"challengeId":"…","retryAfterSeconds":60}`**. Экран пользователя показывает «код отправлен».

Журнал `bersoncarebot-api-test.service` (интегратор) за то же окно — **ни одного обращения к отправке письма**,
только фоновые health-пинги. Ложный успех: ответ говорит «отправлено», факта отправки в журнале нет.

Причина подтверждена прямым запросом к БД прямо сейчас — определитель, которым публичный вход ищет
пользователя по email, всё ещё не принадлежит `app_owner` (значит под FORCE RLS сам подчиняется политике и не
находит строку → вход считает адрес «незнакомым» и по антиэнумерации отвечает `ok:true`, ничего не отправляя):

```sql
SELECT p.proname, p.proowner::regrole::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='app' AND p.prosecdef AND pg_get_functiondef(p.oid) ILIKE '%platform_users%';
```

`email_otp_public_find_user_by_email` (и ещё 11 соседних определителей, включая
`email_password_find_login_candidate`) всё ещё висят на `bersoncarebot_test` (роль мигратора), не на
`app_owner` — список совпадает с тем, что называет `LOGIN_BROKEN_RLS_BRIEF_2026-08-04.md`.

**Вывод по обеим находкам:** это не новые баги — это диагностированные вчера причины падения входа владельца,
но они физически ещё в коде/БД на момент этого прохода (04.08, ~04:35 MSK). Бриф-фикс существует, ветка под
него — нет решения по этому прогону: чинить не моя работа, фиксирую состояние «ещё сломано» как есть.

### 3. [НАБЛЮДЕНИЕ, вне периметра БД/интегратора] Фоновый health-тик падает раз в ~5 секунд

`bersoncarebot-webapp-test.service`, `jobKey":"health.operator_health_digest.tick"` — `level:40` ошибка почти
на каждом цикле (интервал ~5 сек, то есть сотни записей в час). Полное сообщение об ошибке приложение само
редактирует (`err":{"type":"Error"}` без текста) — не смог продиагностировать причину без правки логирования,
которую не делаю (аудит). Не похож по симптому на находки 1–2 (другой `jobKey`, не auth-путь), но это тоже
регулярный сбой в фоне, о котором стоит знать — отдельная строка, не часть двух находок выше.

## Что прошёл и что оказалось В ПОРЯДКЕ

**Неавторизованный (без сессии):**

- `GET /app`, `/app/tg`, `/app/max` — 200, отдают публичную оболочку.
- `GET /app/doctor`, `/app/patient`, `/app/admin` без сессии — корректный `307` на соответствующий `/login`,
  данные не текут.
- `GET /api/me`, `/api/admin/organizations`, `/api/doctor/patients` без сессии — `401`, тело без данных.
- **dev-bypass на TEST закрыт фактически, не только по документу:** `GET
  /api/auth/dev-bypass?token=dev:admin` → `303` на `/app`, сессионная cookie не выставляется. Проверено
  живым запросом, а не констатацией `ALLOW_DEV_AUTH_BYPASS=false` из конфига.
- `POST /api/auth/messenger/start` без тела/с неполным телом и `POST /api/auth/telegram-init` с фиктивным
  `initData` — корректно отбиваются (`400`/`403 auth_channel_disabled`); Telegram-канал на TEST
  административно выключен (`auth_telegram_enabled=false`) — ожидаемо, входящий Telegram на TEST не
  настроен в принципе (см. `SERVER CONVENTIONS.md`), это не находка.
- `GET /book` (публичная страница записи) — 200.

**Специалист / админ клиники** (сессия `dimmdao@yandex.ru`, роль `doctor` + `owner`-членство клиники «Точка
Здоровья»):

- `GET /api/doctor/patients` — 200, 234 живых карточки пациента (не пусто, не заглушка).
- `GET /api/doctor/patients/{id}` (карточка пациента) и `.../appointments` — 200, реальные записи/визиты.
- `GET /api/doctor/booking-engine/calendar` (расписание) — 200, реальные события в календаре.
- `GET /api/doctor/notification-templates` (рассылки, тот самый T3-редактор) — 200, реальные шаблоны по
  каналам (email/telegram/max).
- `GET /api/doctor/test-sets`, `/measure-kinds`, `/clinical-tests`, `/treatment-program-templates` — 200,
  непустые каталоги.
- `GET /api/doctor/schedule-kpis`, `/api/doctor/tasks` — `403 entitlement_required`: это тарифный гейт (у
  тестовой клиники в тарифе нет мех. `doctor_statistics`/`specialist_tasks`), не баг доступа — проверено по
  телу ответа.
- **Граница вверх — держит:** `/api/admin/organizations`, `/api/admin/audit-log`,
  `/api/admin/saas-billing/payments/summary`, `/api/admin/system-health` под сессией врача — везде `403`.
- `GET /api/admin/settings` под врачом отвечает `200`, но это намеренно общий роут
  (`requireClinicManagementApiContext` для клиник-менеджеров + `requirePlatformOperationsApiContext` для
  глобального админа): врач видит **36** ключей (Google Calendar своей клиники, настройки букинга,
  темы уведомлений), глобальный админ — **138**. Сверил построчно: платформенные секреты
  (`apple_oauth_private_key`, `google_client_secret`, `integrator_webhook_secret`, `max_api_key`,
  `max_webhook_secret`, `auth_altcha_hmac_secret`, `admin_telegram_ids`/`admin_phones`/`admin_max_ids`) в
  ответе врача **отсутствуют** — утечки нет, разграничение по ключам реально работает, не только на бумаге.
  Пробный `PATCH` тем же врачом на явно admin-only ключ (`max_api_key`) — отбит валидацией (`400`), запись не
  прошла.

**Глобальный админ** (сессия `dimmdao@gmail.com`, роль `admin`):

- `GET /api/admin/organizations` (клиники) — 200, обе клиники TEST («Точка Здоровья», «Тест Клиника») с
  тарифами и trial-статусом. **Закрывает открытый вопрос №4 из `docs/_TODO/TEST_LIVE_FINDINGS_2026-08-04.md`**
  («экран Клиники пустой?») — под настоящей сессией глобального админа экран не пуст, гипотеза про
  стейл-вкладку из той находки подтверждается: с чистой сессией и свежим запросом данные на месте.
  `GET /api/admin/settings` — 200, полные 138 ключей.
- `GET /api/admin/audit-log` (безопасность/журнал действий) — 200, реальные записи (включая недавние billing-
  события с человеко-читаемой причиной).
- `GET /api/admin/saas-billing/payments/summary` (платежи) — 200, реальные суммы по валюте/статусам.
- `GET /api/admin/system-health` — 200, живые метрики (`webappDb: up`, projection snapshot и т.п.).

**Пациент** — полную живую сессию в своём кабинете (записи/напоминания/дневник/профиль/чат) в этом проходе
получить не удалось и не мог: с 2026-08-04 пароль для роли `client` архитектурно запрещён
(`AUTH_AND_IDENTITY_CANON.md` §9, `isPasswordEligibleRole` — `role !== 'client'`), а оба кодовых канала (email,
телефон) как раз и есть находки 1–2 выше — код туда, куда у меня нет доступа (реальный email/телефон
владельца, это тот же адрес/номер, что дефолтная цель `DEV→` редиректа непереданных получателей на TEST).
Поэтому проверил именно то, что доступно без сессии и что реально нужно владельцу прямо сейчас — сами
публичные, досессионные двери входа пациента (находки 1–2), а не экраны кабинета. Это не пропуск слоя, а его
единственная проверяемая в этих условиях часть: обе двери пациента ведут на подтверждённый провал входа.

## Границы, которые держал

- В БД — только `SELECT`, кроме явно разрешённого брифом: смена пароля трём TEST-аккаунтам через штатный
  конвейер (`user_password_credentials`), больше никаких `INSERT/UPDATE/GRANT/ALTER`.
- Прод не трогал, код не чинил.
- Реальные письма/SMS не гонял по кругу: `email-otp/start` вызвал один раз, `phone/start` — один раз.
- Задачи/карточки не заводил.
- Коммит — на своей ветке `wt/access-live`, без push/merge.
