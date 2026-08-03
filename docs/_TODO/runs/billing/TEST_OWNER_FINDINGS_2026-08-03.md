# TEST 2026-08-03 — что реально было в логах, и почему у глобал админа нет аналитики

Диагностика по брифу `docs/_TODO/runs/billing/TEST_OWNER_FINDINGS_BRIEF_2026-08-03.md`. Только диагноз, без
исправлений. Источники: `/var/log/nginx/access.log` (формат `main_safe`: `$remote_addr - $host [$time_local]
"$request_method $safe_uri $server_protocol" $status $body_bytes_sent`), `journalctl -u
bersoncarebot-webapp-test.service`, чтение кода на `wt/test-owner-findings` (сверено побайтово с тем, что реально
задеплоено на TEST — `git -C /opt/projects/bersoncarebot-test log -1`, HEAD `5dca96c9e`), точечные read-only
`SELECT`/`\dp`/`\d` в `bersoncarebot_test` через `webapp.test`.

Отдельно от этого прогона: пароль владельца на TEST сегодня был перезаписан сторонним агентским скриптом
(`converge-saas-smoke-login-passwords.mjs`) — это установленный факт из параллельного `wt/test-password-restore`
(`docs/_TODO/runs/billing/TEST_PASSWORD_RESTORE_BRIEF_2026-08-03.md`), не переисследовался здесь. Он объясняет,
почему владелец сегодня ни разу не дошёл до `/api/auth/email-password/login` — он входил через email-OTP и OAuth,
а паролем пытался только выставить новый через «Изменить пароль».

## Finding 1 — что реально произошло с входом за 2026-08-03

Реальный браузерный трафик владельца (ноутбук, wg-easy NAT → `172.17.0.3`, Safari/Mac — единственный настоящий
браузер с этим IP за день; `127.0.0.1`+`User-Agent: node` в тех же логах — это фоновый health-probe/смоук, не
владелец) по auth-путям за 03.08, командой:

```
sudo grep -E "172\.17\.0\.|10\.9\.0\." /var/log/nginx/access.log | grep "03/Aug/2026" | grep -E '"(POST|PUT|DELETE) '
```

| Время (MSK) | Запрос | Статус | Тело, байт |
| --- | --- | --- | --- |
| 01:53:55, 01:55:00, 02:10:15, 03:05:27 | `POST /api/auth/email-otp/start` | **503** | 132 |
| 11:01:56 | `POST /api/auth/email-otp/start` | 200 | 87 |
| 17:45:53 | `POST /api/auth/oauth/start` | **500** | **0** |
| 17:46:00 / 17:46:11 | `email-otp/start` → `email-otp/confirm` | 200/200 | — (вход состоялся) |
| 17:46:43 | `POST /api/account/security/password/change` | **500** | 45 |
| 17:46:52 | `POST /api/account/security/totp/start` | 200 | 188 |

### 1а. Четыре `503` ночью — `email-otp/start`, старый код, реальная причина скрыта

На момент этих запросов на TEST был задеплоен код `route.ts` **до** двух сегодняшних фиксов (`04ae70531`
10:34:29, `528ce88ca` 11:23:18 — оба landed уже ПОСЛЕ этих попыток). В той версии (`git show
528ce88ca^:.../email-otp/start/route.ts`) при провале `startPublicEmailOtpChallenge` с кодом
`email_send_failed` роут отвечал:

```json
{"ok":false,"error":"email_send_failed","message":"Не удалось отправить код. Попробуйте позже."}
```

— ровно 132 байта (`node -e 'console.log(Buffer.byteLength(JSON.stringify({ok:false,error:"email_send_failed",
message:"Не удалось отправить код. Попробуйте позже."})))'` → `132`, совпадает с nginx построчно). Toast на
клиенте — именно этот `message`, т.е. владелец видел «Не удалось отправить код. Попробуйте позже.» четыре раза
подряд за час с лишним (01:53–03:05). Сообщение не врёт, но не называет причину (сбой доставки на стороне
email-провайдера) и не даёт другого действия, кроме «повторить». Оба сегодняшних коммита переписали именно эту
ветку: теперь `email_send_failed` (и вообще любое исключение доставки) отвечает фальшивым `ok:true` и логирует
`warn` только на сервере — т.е. сам симптом «непонятная ошибка» для будущих попыток уже погашен маскировкой, а
не диагностикой причины сбоя доставки.

### 1б. `oauth/start` → `500`, тело **0 байт** — реальный «непонятно, читается как не работает система»

Это и есть тот самый паттерн из жалобы владельца. Журнал вебаппа на секунду `17:45:53`:

```
⨯ Error [RuntimeSettingUnavailableError]: runtime_setting_unavailable:yandex_oauth_client_id
  [cause]: Error: Failed query: SELECT scope, organization_id, value_json FROM system_settings
           WHERE key = $1 AND scope = ANY($2::text[]) AND organization_id IS NULL
    [cause]: error: permission denied for table system_settings   (code 42501)
```

`apps/webapp/src/app/api/auth/oauth/start/route.ts:141-147` читает `getYandexOauthClientId()` **без** try/catch —
исключение улетает необработанным, Next.js отдаёt `500` без тела вообще (`0` байт). На клиенте `fetchJsonSafe`
всё равно получает `ok:true` (ответ был), `response.json()` на пустом теле падает и гасится
`.catch(()=>({}))` → `data = {}`. `startOauth()` (`AuthFlowV2.tsx:456-492`) проходит все ветки мимо и
показывает `toast.error(data.message ?? 'Провайдер недоступен')` → **«Провайдер недоступен»** — без единого
намёка на причину. Это она и есть: «не про то что неверный пароль или емэйл — читается как не работает
система», просто на кнопке OAuth, а не на форме пароля (которой он сегодня не касался).

Причина подтверждена читкой прав напрямую на TEST:

```
sudo bash -c 'set -a && source /opt/env/bersoncarebot/webapp.test && set +a && psql "$DATABASE_URL" -At -c \
  "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='"'"'system_settings'"'"';"'
→ t|t   (FORCE ROW LEVEL SECURITY включён)

sudo bash -c 'set -a && source /opt/env/bersoncarebot/webapp.test && set +a && psql "$DATABASE_URL" -c "\dp system_settings"'
→ GRANT на system_settings есть только у app_staff/app_owner/app_platform_settings/saas_system_health_owner
  и владельца bersoncarebot_test; у базовой login-роли (`SELECT current_user` в том же соединении →
  bcb_test_worker_login) — прав нет вообще.
```

`oauth/start` — публичный роут **до** входа: принципала ещё нет, `SET ROLE` ни на что не переключается,
соединение остаётся на базовой `bcb_test_worker_login` → `42501` до RLS вообще не доходит. Это ТОТ ЖЕ класс
дефекта, что уже один раз ловили и чинили для платформенных RSC-страниц 2026-07-25 (см. комментарий
`requireRole.ts:169-185`) — только там фикс `enterWithDbPlatformPrincipal` применим, потому что там УЖЕ есть
аутентифицированная сессия админа; здесь принципала ставить не с чего, потому что запрос идёт ДО входа.

### 1в. `password/change` → `500`, 45 байт

```
[account/security/password/change] password change failed
errorMessage: "Failed query: SELECT status, lease_token::text AS lease_token, password_hash, user_id::text
AS user_id, retry_after_seconds, captcha_required FROM app.password_login_acquire($1, $2, $3::uuid, $4) ..."
```

(параметры и хэш-подобные значения намеренно не переношу сюда — граница брифа). `err.code` в логе отсутствует
(pino вывел `errorCode` пустым — значит исключение пришло без `.code`, в отличие от прямой `pg`-ошибки из 1б).
Роут (`route.ts:75-86`) ловит исключение и отвечает `{"ok":false,"error":"password_change_failed"}` — ровно 45
байт (`Buffer.byteLength(...)` → `45`, сходится). На клиенте это **не** безымянный fallback:
`staffSecurityErrorText('password_change_failed','change_password')` имеет отдельный `case` → тост **«Пароль не
изменён из-за временной ошибки. Повторите попытку позже.»** Причина сбоя (сама функция `app.password_login_acquire`)
— в зоне параллельного `wt/test-password-restore`, который отдельно ведёт password-инцидент; здесь фиксирую
только то, что видел браузер, и что сообщение не бессодержательное, но и не называет причину.

### Список кодов, которые в `submitEmailPasswordLogin` (`AuthFlowV2.tsx:842-906`) доходят до голого fallback

Сверено с `apps/webapp/src/app/api/auth/email-password/login/route.ts` — клиент явно разбирает только
`invalid_credentials` (401) и `email_not_verified`/409; всё остальное падает в `toast.error('Не удалось войти.')`
без причины:

- `proxy_configuration` (503, отсутствует `X-Real-Ip` от прокси);
- `rate_limited` (429);
- `invalid_body` (400);
- `security_setup_pending` (503, сбой `ensureProfile()` при добора специалиста).

Плюс структурный риск, который сегодня уже реализовался в соседнем роуте (1б): у `email-password/login` тоже
нет try/catch вокруг DB-вызовов (`verifyEmailPasswordForLogin`, `staffSecurity.getStatus()`, чтения роли) —
любое `permission denied`/необработанное исключение здесь даст **пустое тело `500`**, и `data={}` уйдёт в тот же
голый `toast.error('Не удалось войти.')`. Сегодня этот конкретный роут не вызывался, но `oauth/start` в это же
окно показал, что риск не гипотетический.

**Чем чинить (не делать в этом прогоне):** различить в клиенте пустой/неопознанный ответ от штатного кода
(отдельное сообщение «сервис временно недоступен, причина зафиксирована» вместо молчаливого «Не удалось
войти.»), и обернуть публичные pre-auth роуты (`oauth/start`, `email-password/login` и соседей) в try/catch,
как это уже сделали сегодня для `email-otp/start`, чтобы permission-denied не улетал пустым 500.

## Finding 2 — у глобал админа нет аналитики

**Экран:** пункт «Аналитика» в плоском меню платформенного (global admin) кабинета —
`apps/webapp/src/shared/ui/doctor/platformNavLinks.ts:41-45`, `href: '/app/doctor/analytics'`. Резолвится в
`apps/webapp/src/app/app/(global-admin)/doctor/analytics/page.tsx` (Next.js route group `(global-admin)` не
меняет URL; конкурирующего `page.tsx` вне группы нет — сама папка `app/app/doctor/analytics/` содержит только
общие компоненты клинической аналитики, без собственного `page.tsx`).

**Гейт страницы устроен верно.** Layout `(global-admin)/doctor/layout.tsx` зовёт
`requirePlatformOperationsPage()` (`requireRole.ts:186-212`), которая пускает `role==='admin' &&
adminMode===true` и — по комментарию на этом же гейте — уже чинили ровно этот класс дефекта 25.07 для
платформенных RSC-страниц (`enterWithDbPlatformPrincipal`, чтобы читать `system_settings` не под голой
login-ролью). Страница внутри — не заглушка-ошибка, а честный `DoctorEmptyState`: «Аналитика платформы появится
после C6» (агрегатная аналитика ещё не построена, это отдельно от бага доступа).

**Реальная причина — на уровень выше, в edge-прокси, до того как страница вообще открывается.**
`apps/webapp/src/proxy.ts:69-91` классифицирует ЛЮБОЙ `/app/doctor/*` как «doctor»-портал
(`portalForAppPath`, `apps/webapp/src/modules/auth/roleLogin.ts:25-31`) и пускает туда только
`roleCanUsePortal(role,'doctor') → role === 'doctor'` (`roleLogin.ts:19-23`) — **буквально**, без исключения для
`admin`. Это чтение — из сырого cookie (`decodeSessionCookie`), не из `getCurrentSession()`, т.е. без учёта
`platform.operations`/`adminMode`. Глобальный админ по конструкции (`resolveLaunchCapabilities`,
`workspaceCapabilities.ts:48-50`) имеет `role==='admin'`, никогда не `'doctor'` — значит для ЛЮБОГО URL под
`/app/doctor/*` прокси отбивает его назад **до** того, как страница успевает применить свой (корректный) гейт.
`platformNavLinks.ts:27-29` сам это документирует как известный долг: «analytics, всё ещё указывает на
клиническую /app/doctor/analytics — обновится в слайсах 5-7» (остальные пункты меню уже переехали под
`/app/admin/*`, аналитика — нет).

**Живое воспроизведение — собственный клик владельца сегодня**, командой:

```
sudo grep "172.17.0.3" /var/log/nginx/access.log | grep "03/Aug/2026:17:4[5-7]"
```

```
17:46:11  GET /app/admin/system-health          200 2978   (открыл платформенную панель — admin+adminMode подтверждены)
17:46:26  GET /app/doctor/analytics              307 44     referer=.../admin/system-health  ← клик «Аналитика»
17:46:26  GET /app/admin/system-health           200 1655   referer=.../admin/system-health
17:46:26  GET /app/admin/system-health           200 1627   referer=.../admin/system-health?app_access_denied=1
```

`Location` для такого 307 строит `buildOwnHubUrlWithAccessDeniedToast('admin')`
(`apps/webapp/src/shared/lib/appAccessDeniedToast.ts:18-23`, вызывается из `proxy.ts:84`) — редирект на «свой
хаб» с флагом тоста; тост фиксированный: **«Нет доступа к этому разделу»** (`appAccessDeniedToast.ts:11`).
Проверено дополнительно неавторизованным curl на живой TEST-порт `6300` — базовый 307 подтверждён (для сессии
без cookie редирект идёт на `/app/doctor/login?next=...`, т.е. это тот же перехват на уровне `proxy.ts`, другой
только конечный адрес):

```
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" -H "Host: test.bersoncare.ru" http://127.0.0.1:6300/app/doctor/analytics
→ 307 http://127.0.0.1:6300/app/doctor/login?next=%2Fapp%2Fdoctor%2Fanalytics
```

**Классификация: (b)** — гейт требует буквально клинической роли (`role==='doctor'`) для URL-префикса, которой
глобал админ по построению не может иметь; это не отсутствующий грант и не забытый экран — экран и его
собственный гейт (`requirePlatformOperationsPage`) в порядке, но на уровень выше их никогда не достигают,
потому что маршрут физически лежит под чужим портом URL-классификации в `proxy.ts`. Тост при этом честный
(«Нет доступа к этому разделу»), так что для владельца это не «непонятная ошибка» — это ровно то, что он и
сообщил: раздел недоступен.

**Чем чинить (не делать в этом прогоне):** либо дать `roleCanUsePortal`/`portalForAppPath` исключение для
`admin`-сессии на `/app/doctor/*`, либо — раз меню само это уже наметило («слайсы 5-7») — перенести
платформенную аналитику под `/app/admin/analytics`, как остальные пункты этого меню, и одной строкой поправить
`href` в `platformNavLinks.ts`.

## Границы

Весь прогон — чтение (`grep`/`journalctl`/`git show`/`\dp`/`SELECT` без `INSERT/UPDATE/DELETE`) на TEST
(`151.241.228.122`, `bersoncarebot_test`); `135.106.162.170` не затрагивался. Ни один пароль, хэш или токен в
этот файл не попал (не печатались и в терминале, кроме одного read-only `SELECT current_user`, вернувшего имя
служебной login-роли, не секрет).
