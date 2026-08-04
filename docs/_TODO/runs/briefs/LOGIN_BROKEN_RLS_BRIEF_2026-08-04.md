# Вход не работает ни по почте, ни по телефону — причина найдена, нужно починить

Rules: `AGENTS.md` — Маршрут, CORE-правила. Живой TEST: `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.
⚠️ **Один ход, следующего не будет**: коммить до конца хода. ⛔ Push и merge НЕ делать, себя НЕ принимать.

Владелец 04.08: «я вообще ни по телефону ни по имейлу не могу войти». Причины лид уже установил замерами на
живой TEST-базе — ниже они с доказательствами. **Не переоткрывай диагностику, чини.**

## Причина 1 — вход по почте: определители принадлежат мигратору, а не `app_owner`

`app.email_otp_public_find_user_by_email('dimmdao@yandex.ru')` возвращает **ноль строк**, хотя в
`platform_users` такая строка есть (`b0021a38-…`, `email_normalized` совпадает). Из-за этого публичный вход
считает адрес незнакомым, отвечает «код отправлен» (анти-энумерация) и **не отправляет ничего** — в логе
интегратора при этом нет ни одного обращения к отправке.

Доказательство причины, замер лида:

- `platform_users` — `relrowsecurity=t`, `relforcerowsecurity=t` (это приземлилось вместе с D15b/4);
- функция `SECURITY DEFINER`, но её владелец — **`bersoncarebot_test`** (`rolbypassrls=f`), а не `app_owner`;
- `SET ROLE bersoncarebot_test; SELECT count(*) FROM platform_users WHERE email_normalized='…'` → **0**;
- та же выборка через определитель, принадлежащий `app_owner` (`app.find_platform_user_ids_by_any_confirmed_email`)
  → **находит строку**.

То есть под FORCE RLS владелец таблицы сам подчиняется политикам, а политика
`platform_users_identity_bootstrap_select` требует членства `CURRENT_USER` в `app_identity_bootstrap` —
у мигратора его нет. Канон этого места описан в шапке миграции
`0240_smtp_outbound_public_config_accessor.sql`: такие определители **обязаны принадлежать `app_owner`**
(NOLOGIN, BYPASSRLS, без членов, недостижим из запроса). Двадцать четыре соседних определителя так и сделаны —
эти четырнадцать нет:

```
bump_platform_user_session_epoch_self          email_otp_public_register_patient
email_auth_find_email_owner_conflict           email_password_delete_unverified_registration
email_auth_verify_user_email                   email_password_find_login_candidate
email_otp_public_delete_unverified_registration email_password_register_pending
email_otp_public_find_or_create_user           patient_done_reminder_occurrence
email_otp_public_find_user_by_email            patient_skip_reminder_occurrence
email_otp_public_consume_… (проверь список сам) patient_snooze_reminder_occurrence
                                               propagate_staff_session_version_to_session_epoch
```

Список получен запросом — **пересними его сам** и почини все, а не только те, что в примере:

```sql
SELECT p.proname, p.proowner::regrole::text
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'app' AND p.prosecdef
  AND pg_get_functiondef(p.oid) ILIKE '%platform_users%';
```

**Что сделать:** миграцией передать владение этими определителями `app_owner`, идемпотентно и под проверкой
существования роли — ровно тем же идиомом, что уже стоит в `0240` (`DO $$ … ALTER FUNCTION … OWNER TO app_owner`).
Ничего в их теле не менять.

⚠️ **Перед передачей владения прочитай тело КАЖДОЙ функции.** Передача владения даёт ей BYPASSRLS — это
допустимо только для функции, которая сама сужает выборку своими аргументами (найти пользователя по адресу,
изменить свою запись). Если найдёшь среди них такую, которая под BYPASSRLS начнёт отдавать чужие данные
широко, — **не передавай владение ей**, вынеси отдельной строкой в отчёт и объясни. Это не формальность:
именно так RLS и обходят по неосторожности.

## Причина 2 — вход по телефону: у досессионной роли нет доступа к `user_channel_preferences`

Живой лог TEST, попытка входа 04.08 03:59:18:

```
Error: Failed query: SELECT channel_code FROM user_channel_preferences … is_preferred_for_auth = true
  at Object.getPreferredAuthChannelCode → Object.resolveAuthOtpChannel
cause: permission denied for table user_channel_preferences   (SQLSTATE 42501)
```

Зовёт это `apps/webapp/src/app/api/auth/phone/start/route.ts:127` — публичный, досессионный путь. У таблицы
RLS **нет** (`relrowsecurity=f`), не хватает именно табличного гранта: `SELECT` есть у `app_patient`,
`app_staff`, `app_owner` и пары операционных ролей, а досессионная роль (`app_identity_bootstrap`, под ней
работает bootstrap-пул) его не имеет.

**Как чинить — по канону 0240, а не грантом на таблицу:** маленький `SECURITY DEFINER`-определитель, который
отдаёт ТОЛЬКО код предпочитаемого канала по переданному идентификатору пользователя, принадлежит `app_owner`,
`SET search_path = pg_catalog`, `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE` стабильным ролям (`app_patient`).
Грант для досессионной login-роли зависит от окружения (имя роли разное на разных хостах) — его место
`deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql`, рядом с таким же грантом на
`app.get_public_config_bool`. Репозиторный код перевести на этот определитель.

## Границы

- **RLS и FORCE RLS не ослаблять**, политики не править, `GRANT SELECT` на `platform_users` не выдавать.
  Чинится ВЛАДЕНИЕ определителей, а не стена.
- PROD не трогать. Миграция — временный номер `NNNN_..._local`, следующий свободный. Применённые миграции
  не переименовывать и не править.
- Задачи и карточки не заводить.

## Готово значит

1. `app.email_otp_public_find_user_by_email('dimmdao@yandex.ru')` находит пользователя (проверить на
   DEV-базе запросом, а не рассуждением).
2. Публичный старт входа по почте доходит до отправки: в логе интегратора видно обращение к отправке письма.
3. Старт входа по телефону больше не падает на 42501.
4. Поведенческий тест на то, что определитель находит пользователя под досессионной ролью, — иначе следующая
   миграция с RLS сломает это снова молча.
5. Полный lint + полный typecheck + затронутые тесты зелёные. Коммит на своей ветке.

Отчёт: что починил, полный список функций, которым сменил владельца, и отдельно — те, которым НЕ стал менять,
с причиной.
