# FAIL — аудит перед приземлением `9ecec7598` (третья дверь pre-session + перепись), 23.08.2026

**Вердикт: FAIL. Причина — пункт 4: перепись неполна.** Мой независимый поиск нашёл ещё два кластера
реляционных точек под pre-session-принципалом, которых нет ни в таблице 18, ни в списке исключений:
идентификация мессенджер-входа (`pgIdentityResolution`, ~13 точек, четыре живые двери входа) и ветка
дублей почты (`pgEmailPasswordLookup`, 2 точки). Настоящий остаток — порядка 33 точек, а не 18.

**Сама дверь — корректна.** Пункты 1, 2, 3 и 5 закрыты; код и миграцию можно приземлять. FAIL относится
к документу переписи, который заявлен как граница следующего этапа: по нему будут планировать работу, а
пропущенные в нём двери вскроются живым отказом ровно так же, как вскрылся `phone/start`.

## Пункты брифа

| # | Пункт | Итог | Чем доказано |
|---|---|---|---|
| 1 | дверь не отдаёт данные чужого человека | PASS (с оговоркой) | прогон DB-теста + fault injection, разбор вызывающих |
| 2 | тело двери не потеряло логику выбора канала | PASS | построчно «было → стало» + уникальный индекс |
| 3 | `phone/start` доходит до постановки кода целиком | PASS по существу, доказательство автора слабее заявленного | сквозной разбор пути; route-тест мокает все адаптеры |
| 4 | перепись 18 точек полна и честна | **FAIL** | свой поиск: ещё ~15 точек в двух кластерах |
| 5 | стена не расширена, гейт первым, в миграции нет GRANT | PASS | миграция, сгенерированные артефакты, `--check` |

## 1. Дверь отдаёт только своё

Подстановка чужого `uuid` на уровне SQL невозможна: аргумент вшит в принятый контекст —
`app.require_accepted_context(..., app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))...]), ...)`.
Вызвать функцию с другим uuid, чем тот, под который установлен контекст, нельзя без переустановки контекста.

Проверки владельца аргумента внутри двери нет — до сессии опознанного владельца не существует, поэтому её и
не может быть. Это ровно форма уже принятой соседней двери `app.get_preferred_auth_channel_code(uuid)`. Уровнем
выше wall держат вызывающие: единственный путь — `resolveAuthOtpChannel` из `phone/start`, где `lookupUserId`
берётся из `findByPhone(normalized)` или из фиксированного decoy; клиент uuid не подставляет. Ответ наружу не
выходит (`deliveryChannel: 'automatic'`), а для почты дополнительно требуется, чтобы номер был доверен аккаунту
(`primaryConfirmedContactValue(user, 'phone')`). Утечки нет. Оговорка на будущее: дверь — оракул «какой канал
подтвердил этот аккаунт» для любого, кто сможет передать в неё произвольный `platform_user_id`; стена здесь —
дисциплина вызывающего, не тело двери.

Прогоны (мои, не пересказ отчёта):

```
RUN_PRESESSION_LOGIN_DOORS_DB=1 node --test --test-name-pattern=default-channel \
  deploy/postgres/privileges/pre-session-login-doors.devDbProof.test.mjs
# pass 2 / fail 0 — exact pre-session context → 'max'; patient-принципал → 42501

RUN_PRESESSION_LOGIN_DOORS_DB=1 PRESESSION_LOGIN_DOORS_FAULT=default_channel node --test ... 
# pass 1 / fail 1 — сломанный purpose роняет позитивный тест. Тест не тавтология.
```

Пробел покрытия: у обеих соседних дверей есть тест «отказывает БЕЗ принятого контекста»
(`pre-session-login-doors.devDbProof.test.mjs:372`, `:392`), у новой — только «отказывает с patient-контекстом».
Первый оператор `require_accepted_context` я проверил чтением тела миграции; тестом он не закрыт.

## 2. Логика выбора канала: было → стало

Совпадает, кроме одного перенесённого предиката.

| Было (TS) | Стало (SQL) |
|---|---|
| `SELECT confirming_channel ... WHERE platform_user_id=$1 AND valid_to IS NULL LIMIT 1`, затем в TS `if (ch === 'telegram'\|'max'\|'email') return ch` | тот же SELECT, но `AND confirming_channel IN ('telegram','max','email')` **внутри** подзапроса, и `COALESCE` |
| второй запрос: UNION ALL (`user_channel_bindings` telegram/max) + (`user_contacts` primary confirmed email), `ORDER BY at ASC LIMIT 1` | тот же UNION ALL, тот же `ORDER BY ... ASC LIMIT 1` |
| финальный whitelist `telegram\|max\|email`, иначе `null` | сохранён в адаптере (`pgChannelPreferences.ts:241`) |

Перенос фильтра безопасен: `uq_user_phone_history_user_active` (`apps/webapp/db/schema/schema.ts:412`) —
уникальный частичный индекс по `platform_user_id WHERE valid_to IS NULL`, то есть активная строка ровно одна.
Разойтись «было/стало» они могли бы только при нескольких активных строках, чего индекс не допускает.
`confirming_channel='sms'` и `NULL` в обоих вариантах уводят на fallback (check-констрейнт разрешает 'sms').
`ORDER BY verified_at ASC` — `confirmed_at IS NOT NULL` отфильтрован, `created_at` не NULL, поведение NULLS LAST не
задействовано.

**Регресс покрытия.** Три из четырёх тестов в `pgChannelPreferences.getDefaultAuthOtpChannel.test.ts` после
правки не проверяют того, что написано в их названии: «falls back to the earliest-linked binding when
`confirming_channel` is NULL», «...when no active phone-history row exists» и «never returns SMS as a default»
теперь просто мокают возврат корня и сверяют его с собой. Вся ветка fallback и исключение SMS уехали в SQL и не
покрыты нигде: DB-тест сеет `confirming_channel='max'`, то есть проходит только первую ветку COALESCE.
Названия тестов стали неправдой — их надо либо переписать под то, что они реально проверяют, либо покрыть
fallback в DB-тесте.

## 3. Путь `POST /api/auth/phone/start` целиком

Прошёл от входа до постановки кода. Реляционных чтений мимо именованных корней на пути **не осталось**:

| Шаг | Где | Чем ходит |
|---|---|---|
| `findByPhone` | `pgUserByPhone.ts:314` | `app.pre_session_find_session_user_by_phone(text)` |
| `getClientVisibleAuthChannelPolicy` | `pgAppRuntimeSettings.ts:48`, `pgSystemSettings.ts:301` | `app.read_public_runtime_setting`, `app.is_*_configured()` |
| `getPreferredAuthChannelCode` | `pgChannelPreferences.ts:176` | `app.get_preferred_auth_channel_code(uuid)` |
| **новая дверь** | `pgChannelPreferences.ts:231` | `app.pre_session_get_default_auth_otp_channel(uuid)` |
| `assertPhoneCanStartChallenge` | `pgPhoneOtpLimits.ts:8,20` | `app.phone_auth_find_otp_lock`, `..._find_latest_challenge_created_at` |
| `deleteByPhone` + `set` | `pgPhoneChallengeStore.ts:108,178` | `app.phone_challenge_store_upsert`, `..._delete_by_phone` |
| `registerPhoneSend` | `phoneOtpLimits.ts:86` | без БД в режиме реальной БД |
| analytics | `recordAuthRegistration.ts:101-113` | после ответа (`after`), ошибка проглатывается |

Все перечисленные корни объявлены `contextClass: 'pre_session'` (`declaration.ts:3438-3472`) — грант у
bootstrap-принципала есть.

Заодно проверил следующий шаг того же прохода владельца, `POST /api/auth/phone/confirm`: до
`enterStaffSecuritySelfPrincipal` (`route.ts:123`) он ходит только корнями. Сырой `UPDATE platform_users` в
`pgUserProjection.ts:227` из `confirmPhoneAuth` достижим лишь при `result.user.role !== effectiveRole`, а
`resolveRoleFromEnv` с 26.07 всегда возвращает `'client'` и `reconcileDbRoleWithEnvRole` для всех трёх ролей
идемпотентна — условие структурно ложно. То есть вход по номеру после этой правки доходит до конца.

**Доказательство автора слабее, чем описано.** Route-тест `phoneStartFallback.route.test.ts` мокает
`buildAppDeps` целиком (`:71-86`) — `startPhoneAuth`, `resolveAuthOtpChannel`, `findByPhone` подменены на
`vi.fn`. Он проверяет ветвление маршрута, а не путь до БД: ни одного адаптера и ни одного корня он не трогает.
Формулировка «путь до постановки кода пройден» этим тестом не подтверждается — подтверждается разбором выше.
Теста, который прогоняет маршрут → адаптер → БД под pre-session-принципалом, нет ни одного; сделать его в этом
круге нельзя, потому что миграция на DEV не применена (`--execute` запрещён брифом).

## 4. Перепись: 18 — это меньше, чем есть

18 перечисленных точек я перепроверил: `pgOAuthUserResolve` (13), `pgPatientCalendarTimezone` (2),
`pgProductAnalytics` (3) — все на месте, все действительно сырые, исключения (`auth_oauth_upsert_binding`,
`auth_oauth_find_user`, `writePlatformAuditLog`) обоснованы.

Проверил, что общей relation-capability для pre-session действительно нет: в
`deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql` строки `'relation', NULL::regprocedure`
есть у `patient`, `staff`, `platform`, `service`, `tenant_service`, `integrator` — и НЕТ у `pre_session`. Значит
любой сырой доступ под bootstrap падает тем же `Missing declared webapp port capability: pre_session`
(`portContextRuntime.ts:305`). `getPool()` тоже идёт через port-context-провайдер (`infra/db/client.ts:67-88`),
так что «взять пул напрямую» гейт не обходит.

### Кластер А (пропущен): идентификация мессенджер-входа — 4 живые двери

`pgIdentityResolution.findOrCreateByChannelBinding` (`:79`) открывает `getPool()` +
`withPoolTransaction` и внутри работает сырыми запросами:

| Файл:строка | Операция |
|---|---|
| `pgIdentityResolution.ts:82` | `user_channel_bindings` SELECT ... FOR UPDATE |
| `pgIdentityResolution.ts:51` | `resolveCanonicalUserId` → `platform_users` SELECT + merged-into цепочка |
| `pgIdentityResolution.ts:61` | `findTrustedCanonicalUserIdByPhone` → `user_contacts` JOIN `platform_users` SELECT |
| `pgIdentityResolution.ts:106` | `mergeCanonicalPlatformUserCandidates` (сырой merge в `pgUserProjection`) |
| `pgIdentityResolution.ts:109` | `platform_users` UPDATE display_name |
| `pgIdentityResolution.ts:117`, `:141` | `user_identity` FIO mirror INSERT/UPDATE |
| `pgIdentityResolution.ts:130` | `platform_users` INSERT |
| `pgIdentityResolution.ts:143`, `:157`, `:169` | `user_channel_bindings` INSERT, перечитывание, `DELETE FROM platform_users` |
| `pgIdentityResolution.ts:71-72` | `resolveCanonicalUserId` + `loadSessionIdentityUser` (сырой `runIdentityPoolPgText`, `pgUserByPhone.ts:111`) |

Достижимо из четырёх маршрутов, каждый под bootstrap-принципалом и БЕЗ смены principal до вызова:
`api/auth/telegram-init:96`, `api/auth/max-init:143`, `api/auth/telegram-login:40`, `api/auth/exchange:72`
(порт передаётся в `buildAppDeps.ts:1618-1622`, внутри адаптера ни одного `runWithDb*Principal`).
Это ~13 точек в единицах счёта самой переписи — то есть кластер размером с весь заявленный остаток.

### Кластер Б (пропущен): ветка дублей почты

| Файл:строка | Операция |
|---|---|
| `pgEmailPasswordLookup.ts:63` | `upsertOpenConflictLog(getPool(), …)` → `admin_audit_log` SELECT ... FOR UPDATE / UPDATE / INSERT (`adminAuditLog.ts:259-300`) |
| `pgEmailPasswordLookup.ts:115-118` | `runWebappTransaction` + `mergePlatformUsersInTransaction` через сырой `runWebappPgText`-клиент (`:37`) |

Достижимо из `resolveAuthState` под bootstrap: `email-password/lookup:29`, `setup-access:29`, `forgot:66`,
`register:170`, `setup-code/complete:65` — все со `stampBootstrapPrincipal` и без смены principal. Ветка
включается, когда одну подтверждённую почту держат ≥2 аккаунта. Круг 2
(`PRESESSION_LOGIN_DOORS_2026-08-23.md`) закрыл в этом файле только основное чтение
(`app.pre_session_load_email_auth_state`) — ветку слияния он не трогал.

### Честность границы

В «Итоге» число подано без ограничения области: «18 ещё не закрытых точек входа в реляционные адаптеры под
pre-session-принципалом». Фактически метод переписи ограничен каталогом `apps/webapp/src/app/api/auth`
(шаг 1 явно считает 48/45 route-файлов именно там). Вне этого каталога под bootstrap входят ещё 23 маршрута
(`booking/public/*`, `clinic/invites/accept/*`, `join/*`, `public/*`, `references/*`, `payments/*-webhook/*`,
`account/security/password/*`, `integrator/channel-link/complete`, `patient-app/client-boot-report`) — они не
подметались вовсе. Сами route-файлы сырых запросов не содержат, но их адаптеры я не разбирал: это отдельная
работа, и её объём должен быть назван в переписи, а не умолчан.

Ложных строк в 18 не нашёл — только недобор.

## 5. Стена, гейт, миграция

- В миграции нет `GRANT`, `REVOKE`, `CREATE POLICY`, `CREATE/ALTER ROLE`, `SECURITY LABEL` (проверено грепом).
- Первый оператор после `BEGIN` — `app.require_accepted_context`, `DECLARE` нет, `search_path=pg_catalog`,
  все отношения квалифицированы `public.`.
- `crossesTenantWall` отсутствует; `node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs`
  — 14/14 PASS (мой прогон). Арендного вызывающего у двери нет, пометка и не нужна.
- `node deploy/postgres/privileges/generate-cli.mjs --all --check` — побайтно совпадает (мой прогон).
- Стена не расширена. Три новые строки `GRANT SELECT (колонки) … TO app_seam_identity_lookup_owner` —
  подмножества уже существовавших грантов того же владельца на те же таблицы
  (`privileges.bcb_webapp_dev.sql:19540-19546`, `:19693-19699`, `:20196-20200`); фактических прав не
  прибавилось. Ни одной удалённой строки `GRANT`/`REVOKE`/`ALTER` в сгенерированных артефактах нет.
- `GRANT EXECUTE` на новую функцию — только `app_pre_session`, плюс `REVOKE ALL … FROM PUBLIC` и от всех
  прочих ролей.

## Что я прогнал

```
node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs                    # 14/14 PASS
node deploy/postgres/privileges/generate-cli.mjs --all --check                              # побайтно PASS
pnpm vitest run src/infra/repos/pgChannelPreferences.getDefaultAuthOtpChannel.test.ts \
               src/modules/auth/phoneStartFallback.route.test.ts                            # 2 файла / 17 PASS
RUN_PRESESSION_LOGIN_DOORS_DB=1 node --test --test-name-pattern=default-channel \
  deploy/postgres/privileges/pre-session-login-doors.devDbProof.test.mjs                    # 2/2 PASS
RUN_PRESESSION_LOGIN_DOORS_DB=1 PRESESSION_LOGIN_DOORS_FAULT=default_channel node --test …  # ожидаемый RED 1/1
```

TEST, PROD, `--execute`, push не выполнялись. Ничего не чинил, чужие файлы не трогал, галочки планов не менял.

## Что надо сделать перед следующим кругом (решение владельца, не моя правка)

1. Дописать в перепись кластеры А и Б с file:line и назвать реальное число остатка (~33, а не 18).
2. Явно назвать границу переписи: либо распространить её на 23 bootstrap-маршрута вне `api/auth`, либо
   написать в «Итоге», что число относится только к `api/auth`.
3. Починить названия трёх тестов в `pgChannelPreferences.getDefaultAuthOtpChannel.test.ts` или покрыть
   fallback-ветку в DB-тесте.
4. Добавить новой двери тест «отказывает без принятого контекста» — как у обеих соседних.
