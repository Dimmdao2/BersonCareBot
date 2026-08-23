# Pre-session: третий вызывающий и перепись дверей входа — 23.08.2026

## Итог

Источник оракула: `docs/_TODO/OWNER_WALKTHROUGHS/2026-08-23_TEST_FULL_WALK.md`, шаг «Войти по номеру телефона».

Причина измеренного `500 /api/auth/phone/start` закрыта: два сырых запроса `getDefaultAuthOtpChannel` заменены
одним точным корнем `app.pre_session_get_default_auth_otp_channel(uuid)`. Корень читает
`user_phone_history`, `user_channel_bindings` и `user_contacts` под capability
`auth.phone-login.default-channel`; у `app_pre_session` есть `EXECUTE`, у пациентского принципала нет.

Перепись обнаружила **18 ещё не закрытых точек входа в реляционные адаптеры** под pre-session-принципалом:
13 в общем OAuth-resolver, 2 в синхронизации timezone после OAuth и 3 в best-effort auth analytics.
Команда, которой получено число из таблицы ниже:

```bash
awk -F'|' '/^\| [0-9]+ / { n++ } END { print n }' \
  docs/_TODO/runs/integrator-cleanup/PRESESSION_THIRD_CALLER_CENSUS_2026-08-23.md
# 18
```

Единица счёта — место вызова реляционного адаптера/общего SQL-помощника из pre-session-пути. Несколько SQL-
операторов внутри одного переиспользуемого помощника перечислены как отношения одной точки; разные вызовы того же
помощника считаются отдельно, потому что будущие двери имеют разные входные данные и назначение.

Эти 18 мест не исправлялись в этом круге: они не находятся на измеренном пути `phone/start`, а перепись должна
остаться границей следующего отдельного этапа. OAuth-точки способны вернуть контролируемый `db_error`; timezone
может оборвать callback; analytics сейчас проглатывает ошибку на `recordAuthRegistration.ts:101-113`, поэтому не
ломает вход, но теряет событие.

## Повторяемый метод переписи

1. Перечислить все route-корни и отделить маршруты, которые вообще входят под bootstrap principal:

   ```bash
   rg --files apps/webapp/src/app/api/auth | rg '/route\.ts$' | wc -l
   # 48
   rg -l "stampBootstrapPrincipal" apps/webapp/src/app/api/auth --glob 'route.ts' | sort | wc -l
   # 45
   comm -23 \
     <(rg --files apps/webapp/src/app/api/auth | rg '/route\.ts$' | sort) \
     <(rg -l "stampBootstrapPrincipal" apps/webapp/src/app/api/auth --glob 'route.ts' | sort)
   # три authenticated passkey route: credentials, register/options, register/verify
   ```

2. Сначала пройти индексом по уже известному классу сбоя, затем точным поиском получить все порты route-файлов:

   ```bash
   node /home/dev/brain/tools/code-search.mjs \
     "pre_session auth route relational read runWebappPgText getDefaultAuthOtpChannel phone start" \
     --repo bcb -k 40
   rg -n "\bdeps\.[A-Za-z0-9_]+|buildAppDeps\(\)\.[A-Za-z0-9_]+" \
     apps/webapp/src/app/api/auth --glob 'route.ts'
   ```

3. Для каждого вызова до явного `enterStaffSecuritySelfPrincipal`/patient-перехода пройти импорты и wiring
   `buildAppDeps` до infra-реализации. В реализации классифицировать каждый Drizzle query,
   `runWebappSql`/`runWebappPgText` и общий SQL writer: точный `runWebappNamedRoot` с объявленной capability —
   закрытая дверь; всё остальное — строка переписи. После явной смены principal pre-session-обход заканчивается.

4. Отдельно раскрыть best-effort ветки, иначе их проглоченный `42501` не виден в HTTP. Список auth callers
   аналитики воспроизводится так:

   ```bash
   rg -l "recordAuthRegistration(Attempt|Success|Failure)\(" \
     apps/webapp/src/app/api/auth apps/webapp/src/modules/auth \
     apps/webapp/src/app-layer/product-analytics --glob '*.ts' | sort
   ```

5. Проверить back-references готовых функций в declaration и миграциях, чтобы не принять просто вызванную SQL-
   функцию за точную дверь:

   ```bash
   rg -n "find_platform_user_ids_by_any_confirmed_email" \
     deploy/postgres/privileges/declaration.ts apps/webapp/db/drizzle-migrations
   ```

## Перепись оставшихся мест

Все пять OAuth callback-входов здесь — Google GET, Apple POST, Yandex GET, legacy Yandex GET
`/api/auth/oauth/callback` и VK GET. Google/Apple вызывают `resolveUserIdForWebOAuthLogin`; обе Yandex-двери —
`resolveUserIdForYandexOAuth`; VK — `resolveUserIdForVkOAuth`. Все перечисленные операции происходят до явного
self-principal; Yandex/VK переключаются только в callback handlers после resolver и timezone.

| № | Файл:строка | Отношение / операция | Из какого auth route достижимо |
|---:|---|---|---|
| 1 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:49` | `user_contacts` SELECT primary e-mail | все 5 OAuth callback, ветка существующей binding или финального подтверждения |
| 2 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:53` | `user_contacts` SELECT/UPDATE/INSERT через `mutateCanonicalUserContactsWebapp` | все 5 OAuth callback при trusted e-mail |
| 3 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:60` | `user_contacts` + `platform_users` SELECT через `app.find_platform_user_ids_by_any_confirmed_email(text)`, вызванную не как exact root | все 5 OAuth callback, третий email-match tier |
| 4 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:69` | `platform_users` + primary-phone `user_contacts` SELECT | Yandex/legacy Yandex/VK, spare-phone ветка |
| 5 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:80` | `user_phone_history` UPDATE/INSERT и `user_contacts` upsert через `applyPlatformUserPhoneHistoryTransition` | Yandex/legacy Yandex/VK, свободный spare phone |
| 6 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:88` | `user_contacts` JOIN `platform_users` SELECT confirmed e-mail | все 5 OAuth callback |
| 7 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:107` | `user_contacts` JOIN `platform_users` SELECT active e-mail | все 5 OAuth callback, fallback после №6 |
| 8 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:125` | `platform_users` INSERT | все 5 OAuth callback, создание аккаунта |
| 9 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:133` | `platform_users` SELECT + `user_identity` INSERT/UPDATE через FIO mirror | все 5 OAuth callback, создание аккаунта |
| 10 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:134` | `user_contacts` SELECT/UPDATE/INSERT через canonical contact writer | Yandex/legacy Yandex/VK, создание аккаунта с телефоном |
| 11 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:158` | `user_contacts` SELECT/UPDATE/INSERT после успешной OAuth binding | все 5 OAuth callback при e-mail |
| 12 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:170` | `user_contacts` JOIN `platform_users` SELECT canonical owner by phone | Yandex/legacy Yandex/VK |
| 13 | `apps/webapp/src/infra/repos/pgOAuthUserResolve.ts:174` | `platform_users` + `user_identity` SELECT и merge-chain `platform_users` SELECT | все 5 OAuth callback |
| 14 | `apps/webapp/src/infra/repos/pgPatientCalendarTimezone.ts:18` | `platform_users` SELECT timezone | все 5 OAuth callback после resolver, до session principal |
| 15 | `apps/webapp/src/infra/repos/pgPatientCalendarTimezone.ts:51` | `platform_users` UPDATE timezone | все 5 OAuth callback после resolver, до session principal |
| 16 | `apps/webapp/src/infra/repos/pgProductAnalytics.ts:158` | `product_analytics_events_recent` INSERT | auth routes/modules, которые вызывают `recordAuthRegistration*`; best-effort |
| 17 | `apps/webapp/src/infra/repos/pgProductAnalytics.ts:75` | `product_analytics_hourly` INSERT/UPDATE | те же auth registration callers; best-effort |
| 18 | `apps/webapp/src/infra/repos/pgProductAnalytics.ts:109` | `product_analytics_user_hourly` INSERT/UPDATE при известном user id | те же success/failure callers; best-effort |

Не включены в остаток: `oauthBindings.findUserByOAuthId` и `auth_oauth_upsert_binding` уже идут через exact named
roots; `writePlatformAuditLog` использует `app.append_platform_audit_event`; relation-backed password/e-mail/phone
challenge lookup уже закрыты ранее; DB-операции после явного self/patient principal относятся к другому
principal-пути.

## Сделанная дверь

- Migration `20260823T023138_pre_session_default_auth_otp_channel.sql` создаёт один pre-session root. Первый
  оператор после `BEGIN` — `app.require_accepted_context`; `DECLARE` нет.
- Внутри сохранён прежний порядок: активный `user_phone_history.confirming_channel`, затем earliest-linked
  `user_channel_bindings`/primary confirmed `user_contacts`.
- В `declaration.ts` объявлены capability, владелец и три relation surfaces. `crossesTenantWall` отсутствует.
- В migration нет `GRANT`, `REVOKE`, `CREATE POLICY`, `CREATE ROLE`; права получены только генерацией.
- `pgChannelPreferences.ts:231` вызывает корень через `runWebappNamedRoot`; сырых чтений из этого adapter method
  больше нет.

## Доказательство

- `pnpm --dir apps/webapp test src/infra/repos/pgChannelPreferences.getDefaultAuthOtpChannel.test.ts src/modules/auth/phoneStartFallback.route.test.ts`
  — PASS, 2 файла / 17 тестов. Route-тест вызывает `POST /api/auth/phone/start`, получает `200`, и проверяет
  фактический вызов `startPhoneAuth` с delivery и deferred delivery result — путь до постановки кода пройден.
- `RUN_PRESESSION_LOGIN_DOORS_DB=1 node --test --test-name-pattern=default-channel deploy/postgres/privileges/pre-session-login-doors.devDbProof.test.mjs`
  — PASS, 2/2: точный pre-session context возвращает `max`; пациентский relation principal получает SQLSTATE
  `42501`.
- Fault injection:
  `RUN_PRESESSION_LOGIN_DOORS_DB=1 PRESESSION_LOGIN_DOORS_FAULT=default_channel node --test --test-name-pattern=default-channel deploy/postgres/privileges/pre-session-login-doors.devDbProof.test.mjs`
  — ожидаемый RED, 1 pass / 1 fail: сломанный purpose приводит own-principal к `42501 accepted port context
  required`. Непосредственно перед ним healthy-прогон выше был GREEN.
- `node deploy/postgres/privileges/generate-cli.mjs --all` — PASS.
- `node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only` — PASS.
- `node deploy/postgres/privileges/generate-cli.mjs --all --check` — PASS, byte-for-byte.
- `node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs` — PASS, 14/14.
- `pnpm --dir apps/webapp typecheck` — PASS.
- `pnpm --dir apps/webapp lint` — PASS без errors; два существующих warning в
  `AppointmentPaymentSection.tsx` вне этого diff.
- `bash deploy/host/migrate-dev.sh --preflight` — PASS на именованной DEV БД: `pending=1 total=54`, миграция
  owner-ordered, применена в rollback-транзакции. `--execute` не запускался.

TEST, PROD и push не выполнялись. Галочки планов не менялись.
