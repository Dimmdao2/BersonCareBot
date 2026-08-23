# Проверка стен доступа к данным перед выкаткой на TEST — 23.08.2026

**Ветка:** `wt/data-access-review2-20260823` · **база:** `23c03adda`
**Бриф:** `docs/_TODO/runs/briefs/DATA_ACCESS_REVIEW_BRIEF_2026-08-23.md` (заменил отклонённый
`docs/_TODO/runs/briefs/SECURITY_VULNERABILITY_RESEARCH_BRIEF_2026-08-23.md`).
**План-файл:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`.
**Оракул:** `D17_RELATION_READERS_2026-08-22.md` — «принятый контекст один на транзакцию».

**Это отчёт проверяющего, НЕ приёмка и НЕ список задач.** Код не менялся, `--execute` не запускался,
TEST и PROD не трогались. Всё измерено на `bcb_webapp_dev` (чтение каталога) и на своём стенде
`127.0.0.1:5311`, поднятом из этого worktree; общий dev-сервер на :5200 не трогался.

---

## 🔴 Блокер выкатки, найденный попутно (не утечка, но выкатывать нельзя)

**Вход по телефону и вся семья «почта + пароль» отвечают `500`.** Причина не в окружении: в целевой
модели доступа сквозной реляционной двери классу `pre_session` **не существует по решению**, и это
записано в самой декларации:

```
deploy/postgres/privileges/declaration.ts:2893
  // ... `capabilities['pre_session']` purpose=relation is intentionally absent
```

А `loadEmailAuthStateRows` до сих пор делает сырой реляционный SELECT под bootstrap-принципалом:

```
apps/webapp/src/infra/repos/pgEmailPasswordLookup.ts:84-98   SELECT ... FROM platform_users pu
    INNER JOIN app.find_platform_user_ids_by_any_confirmed_email($1) ...
```

Замер (свой стенд, `curl`, полный список проб — §1.3):

| маршрут | код |
|---|---|
| `POST /api/auth/phone/start` | **500** |
| `POST /api/auth/email-password/lookup` | **500** |
| `POST /api/auth/email-password/forgot` | **500** |
| `POST /api/auth/email-password/setup-access` | **500** |
| `POST /api/auth/email-otp/start` | 200 (идёт через именованные корни) |
| `POST /api/auth/check-phone` | 200 |

Причина в логе сервера дословно: `Error: Missing declared webapp port capability: pre_session`
(`apps/webapp/src/infra/db/portContextRuntime.ts:305`).

Перепись сквозных возможностей подтверждает, что дыры в окружении нет — класса просто нет нигде:

```
$ grep -oE "'(webapp|integrator)'::app.port_name, '[a-z_]+'::name, '[a-z_]+'::name, \
    '[a-z_]+'::app.port_context_class, '[^']+', NULL::regprocedure" \
    deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql | ...
→ 15 сквозных возможностей; классы: staff(2) · patient(1) · platform(2) · integrator(2) ·
  tenant_service(1) · service(7). Класса pre_session среди них НЕТ.
```

То же самое говорит сгенерированная перепись `deploy/postgres/privileges/name-census.json`
(`relationWideCapabilities`, 15 записей, `webapp_pre_session_relation` отсутствует).

**Отказ правильный — fail-closed, данные не текут.** Но человек, который сегодня попробует войти по
телефону или восстановить пароль, не войдёт. Это и есть причина, по которой ниже часть проб сделана по
живому каталогу БД, а не сессией пациента: сессию на DEV получить нечем.

---

## 1. Что и чем проверялось

### 1.1. Поверхность

```
$ find apps/webapp/src/app/api -name route.ts | wc -l      → 457
$ find apps/webapp/src/app/api/auth -name route.ts | wc -l  →  47
```

### 1.2. Живой каталог БД (только чтение, `sudo -n -u postgres psql -X -d bcb_webapp_dev`)

Права ролей — `pg_class.relacl` / `pg_attribute.attacl` через `aclexplode`; политики — `pg_policy` +
`pg_get_expr`; членства — `pg_auth_members`. Ни одной записи в DEV не сделано.

### 1.3. Живой стенд

Поднят из этого worktree по рецепту worktree-запуска на **альтернативном порту 5311**
(`npx next dev --webpack -H 127.0.0.1 -p 5311`), чтобы не убить параллельный сервер на 5200.
Пробы — `curl` с `origin`/`referer`/`x-forwarded-for` (иначе `csrf_origin_forbidden`), адреса и телефоны
заведомо несуществующие, чтобы ни одному живому человеку ничего не ушло.

### 1.4. Гейт предиката арендатора

```
$ node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs
# tests 14 # pass 14 # fail 0     (EXIT=0, 2.8 s)
```

---

## 2. Находки

Сортировка — по реальному риску для человека.

| # | находка | где | достижимость | чьи данные и кому | чем доказано | что поправить |
|---|---|---|---|---|---|---|
| **F1** | Политика `app_staff` на `content_access_grants_webapp` **не содержит предиката организации**, хотя колонка `organization_id` в таблице есть, а соседняя политика `app_tenant_service` на этой же таблице ею сужена. Роли выданы `SELECT` **и `DELETE`** на всю таблицу. | политика `rev10_direct_business_84`, `USING (CURRENT_USER = 'app_staff')`, `FOR ALL`; описание — `deploy/postgres/privileges/declaration.ts` | **сотрудник другой клиники** — но сегодня только при доступе к SQL под рабочим логином `bcb_*_webapp_staff`: живого читателя-маршрута в вебаппе нет (см. «оговорка» ниже) | сотрудник любой клиники читает строки **всех** клиник: `organization_id`, `platform_user_id`, `integrator_user_id`, `purpose`, `token_hash`, `expires_at`, `meta_json`; и может удалить чужие выдачи доступа к контенту | перепись по живому каталогу (§2.1): это **единственная** таблица `public` с колонкой `organization_id`, где у `app_staff` есть SELECT и разрешающая политика без `current_org_id()` | поставить в политику `organization_id = app.current_org_id()` (как у `rev10_tenant_update_84` рядом) либо снять права `app_staff`, если читателя нет |
| **F2** | `POST /api/auth/email-password/lookup` отдаёт точное состояние учётки по произвольной почте — **без ограничения частоты и без выравнивания времени ответа** | `apps/webapp/src/app/api/auth/email-password/lookup/route.ts:19-32` | **аноним из интернета** | по любому адресу видно `free` / `pending_registration` / `verified_with_password` / `needs_email_setup` / `email_conflict` — то есть «человек с этим адресом есть на платформе клиник» и в каком он состоянии | маршрут возвращает `state.kind` дословно (`toPublicState`, строка 14-16), сессии не требует; **ни одного лимитера в файле** — при том, что соседний публичный `check-phone` несёт и лимитер, и пол в 500 мс (`check-phone/route.ts:10,37-49`); перепись лимитеров по всем 47 auth-маршрутам — §2.2 | лимит по IP + по адресу и тот же пол ответа, что у `check-phone`; либо убрать состояние из публичного ответа |
| **F3** | `POST /api/auth/email-password/forgot` заявлен нейтральным, но ветка `needs_email_setup` отвечает **другой формой** — с `challengeId` и `setupRequired: true` | `apps/webapp/src/app/api/auth/email-password/forgot/route.ts:66-78` против нейтрального `forgotPasswordNeutralResponse` в строках 17-22 | **аноним из интернета** | отличает класс «почта заведена врачом, пароля ещё нет» — то есть «этот адрес принадлежит пациенту клиники на этой платформе»; попутно шлёт этому человеку код настройки пароля | чтение маршрута: две разные формы ответа на одном и том же классе входа; лимитера в файле нет (§2.2) | отвечать одной формой во всех ветках; `challengeId` отдавать только после явного шага, начатого владельцем адреса |
| **F4** | Анонимный запрос запускает **запись**: `lookup` при двух и более строках на адрес сам сливает учётные записи `platform_users` в транзакции | `apps/webapp/src/infra/repos/pgEmailPasswordLookup.ts:145-160` → `tryAutoMergeDuplicateEmailUsers:102-140` → `mergePlatformUsersInTransaction` | **аноним из интернета** (тот же маршрут F2) | необратимое слияние двух личностей: `merged_into_id` проставляется, контакты и привязки съезжают на цель, выбранную `pickEmailConflictTarget`; выбор цели зависит только от данных, не от человека | чтение цепочки; на маршруте нет ни сессии, ни лимитера | слияние — операция с последствиями, ей место за подтверждённым действием владельца адреса или за операторским разбором, а не за публичным чтением состояния |
| **F5** | Лимитер входа при **первой же** ошибке БД навсегда (на весь процесс) переключается на счётчик в памяти и больше не пробует БД | `apps/webapp/src/modules/auth/createSlidingWindowRateLimit.ts:25,78-94,98` | **аноним из интернета** (эксплуатируется косвенно: достаточно одной аварии БД) | защита от перебора кодов входа и паролей слабеет молча: счёт становится по-процессный (при N инстансах фактический предел ×N) и обнуляется при каждом рестарте | воспроизведено на стенде: в логе один раз `event: "auth_rate_limit_db_fallback"`, `scope: "auth.check_phone"`, текст «database unavailable; **permanently** using in-memory fallback»; после этого `check-phone` продолжает отвечать 200 | ретрай БД с backoff вместо защёлки; при недоступности хранилища лимитов — отказывать, а не пропускать |
| **F6** | Предупреждение о деградации лимитера печатается **один раз на процесс** и **без текста ошибки** | тот же файл, строки 79-90 (`shouldLogFallback = !dbUnavailable`); логгер срезает сообщение | оператор | оператор не узнаёт ни что защита выключилась (одна строка за всё время жизни процесса), ни почему | в логе стенда дословно: `err: { "type": "Error" }` — ни `message`, ни SQLSTATE | периодическое повторение предупреждения + пробрасывать `message`/SQLSTATE (тот же дефект логгера, что зафиксирован для интегратора) |
| **F7** | Один секрет на два назначения допущен **в проде**, а роль сессии приходит внутри подписанного entry-токена | `apps/webapp/src/config/env.ts:69` («only for non-production») против `:308-317`, где прод принимает `INTEGRATOR_SHARED_SECRET` и как entry-, и как webhook-секрет; `apps/webapp/src/modules/auth/service.ts:300` (`if (parsed.role === 'admin') return true`), `:527-541` (роль из токена уходит в `findOrCreateByChannelBinding`) | **только при уже утёкшем секрете** | утечка одного `INTEGRATOR_SHARED_SECRET` даёт и подпись M2M-запросов к `/api/integrator/*` с **любым** `organizationId`, и чеканку entry-токена с `role: 'admin'` → сессия глобального админа | чтение: комментарий в env противоречит собственной прод-проверке; `isAllowedByWhitelist` возвращает `true` по роли из токена до всех прочих проверок | развести секреты жёстко (запретить `INTEGRATOR_SHARED_SECRET` в проде, как это уже сделано для `SESSION_COOKIE_SECRET`); роль сессии брать из БД, а не из токена |

### 2.1. Доказательство F1 — перепись, а не догадка

Вопрос переписи: «у каких таблиц `public` с колонкой `organization_id` роль имеет SELECT, но
разрешающая политика этой роли не сужена принципалом». Прогнано по пяти арендным ролям.

```sql
with t as (          -- таблицы public, несущие organization_id
  select c.oid, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
   and n.nspname='public'
  where c.relkind='r' and exists (select 1 from pg_attribute a
        where a.attrelid=c.oid and a.attname='organization_id' and a.attnum>0 and not a.attisdropped)
), granted as (      -- из них те, где у роли есть SELECT (табличный или колоночный)
  ... aclexplode(relacl) / aclexplode(attacl) ...
)
select g.relname, string_agg(p.polname||':'||p.polcmd::text, ',')
from granted g join pg_policy p on p.polrelid=g.oid
where '<роль>' = any(select rolname from pg_roles where oid=any(p.polroles))
  and p.polname not like 'rev10_context_gate%' and p.polcmd in ('r','*')
  and coalesce(pg_get_expr(p.polqual,p.polrelid),'') not like '%current_org_id%'
  and coalesce(pg_get_expr(p.polqual,p.polrelid),'') not like '%current_actor_user_id%'
  and coalesce(pg_get_expr(p.polqual,p.polrelid),'') not like '%current_patient_user_id%'
group by g.relname;
```

Результат:

| роль | найдено |
|---|---|
| `app_staff` | **`content_access_grants_webapp` [`rev10_direct_business_84`:`*`]** |
| `app_patient` | пусто |
| `app_tenant_service` | пусто |
| `app_clinic_billing` | пусто |
| `app_integrator_request` | пусто |

Права и режим RLS этой таблицы, дословно из каталога:

```
relacl: app_object_owner=arwdDxt/app_object_owner | app_staff=rd/app_object_owner
rowsecurity=true force=true owner=app_object_owner

rev10_direct_business_84 | *  | roles=app_staff          | USING=(CURRENT_USER = 'app_staff'::name)
rev10_tenant_update_84   | w  | roles=app_tenant_service | USING=(organization_id = app.current_org_id()) …
```

`app_staff=rd` — это SELECT и DELETE на всю таблицу. `FORCE RLS` стоит, владельца он не пускает, но
сама политика ничего не сужает.

**Оговорка, снижающая срочность (проверена перечислением мест, где искал):**

```
$ grep -rn "content_access_grants_webapp\|contentAccessGrantsWebapp" apps packages \
    --include=*.ts --include=*.tsx | grep -v node_modules | grep -v '\.test\.'
```

В вебаппе — только определение схемы (`apps/webapp/db/schema/schema.ts:793`) и связи
(`db/schema/relations.ts:251`); **живого читателя-маршрута нет**. Пишет в таблицу интегратор
(`apps/integrator/src/infra/db/repos/reminders.ts:376`). На DEV строк 0 (`rows=0 orgs=0`), поэтому
чужой строки в живом прогоне я показать не могу — и не выдаю за показанное.

То есть это **открытая дверь без замка**, а не идущая утечка. Класс ровно тот, ради которого закрывали
шесть DEFINER-корней Д1–Д6 (`DEFINER_TENANT_SIX_ROOTS_FIX_2026-08-22.md`): «защита кодом приложения, а
не дверью». Здесь защиты нет и в приложении — её заменяет отсутствие вызывающего.

### 2.2. Доказательство F2/F3/F5 — перепись ограничения частоты по всем 47 auth-маршрутам

```
$ for f in $(find apps/webapp/src/app/api/auth -name route.ts | sort); do
    echo "$(grep -cE 'RateLimit|rateLimit|isRateLimited|Limited\(' "$f")  ${f#…/auth/}"; done
```

Ноль совпадений (лимитера в файле нет) у **28** маршрутов из 47. Разбор нулей — какие из них важны:

| маршрут | ноль опасен? |
|---|---|
| `email-password/lookup` | **да — F2** (публичный оракул состояния учётки) |
| `email-password/forgot` | **да — F3** (публичный, шлёт письмо, расходится по форме) |
| `email-password/setup-access`, `register`, `register/confirm` | да, тот же класс; сегодня отвечают 500 (блокер вверху) |
| `phone/start` | нет: лимит внутри `startPhoneAuth` — маршрут отдаёт `rate_limited`/`429` (`phone/start/route.ts:338-357`) |
| `email/start` | нет: требует сессию (`:23-29`), лимит внутри `startEmailChallenge` |
| `messenger/poll`, `exchange` | нет как перебор: токены 144 бита (`randomBytes(18)`, `messengerLoginToken.ts:5`) и HMAC-подпись соответственно; остаётся только шум |
| `oauth/callback/*`, `logout`, `telegram-login/config`, `login/alternatives-config` | нет: без секрета ничего не отдают |

Ради контраста — как выглядит маршрут, где это сделано: `check-phone/route.ts` несёт
`isCheckPhoneRateLimited(phone)` (строка 37) и пол ответа `PUBLIC_CHECK_PHONE_MIN_RESPONSE_MS = 500`
(строки 10, 46-49). В `lookup` нет ни того, ни другого.

### 2.3. Доказательство F5 — воспроизведено, а не выведено

Стенд, `POST /api/auth/check-phone` → `200`, и в том же логе:

```
WARN [auth-rate-limit] database unavailable; permanently using in-memory fallback
    scope: "auth.check_phone"
    event: "auth_rate_limit_db_fallback"
    err: { "type": "Error" }
```

Код: `dbUnavailable` — переменная замыкания (строка 25), выставляется в `catch` (строка 80) и
проверяется на входе (строка 98). Пути назад в БД нет ни одного. `shouldLogFallback = !dbUnavailable`
(строка 79) — второй и последующие разы предупреждение не печатается.

---

## 3. Выглядит опасно, но стеной закрыто — сюда работу не тратить

Каждый пункт — с тем, чем именно проверен.

1. **DEFINER-корни арендаторов.** Гейт `definer-tenant-predicate.test.mjs` — 14/14 зелёный, EXIT=0.
   Шесть дыр Д1–Д6 из `DEFINER_TENANT_PREDICATE_GATE_2026-08-22.md` закрыты
   (`DEFINER_TENANT_SIX_ROOTS_FIX_2026-08-22.md`): мёртвый корень удалён, лишний EXECUTE снят,
   в четыре тела вписана сверка `p_organization_id` с `app.current_org_id()`.
2. **Глобальный админ и медицина.** У `app_platform_admin`, `saas_telemetry_operator`,
   `app_integrator_request`, `app_integrator_resolver`, `app_pre_session` — **ноль** табличных грантов
   в `public` (`aclexplode(relacl)` по всем пяти ролям вернул пустой результат). У `app_platform_admin`
   ровно 13 `GRANT EXECUTE`: аксессоры принципала, аудит платформы, инциденты, архив health-отказов,
   `pre_session_resolve_identity`. Ни одного медицинского отношения. У `app_platform_settings` —
   18 таблиц: организации, филиалы, услуги, тарифы, биллинг, `system_settings`. Медицины нет.
3. **Узкая роль интегратора.** `app_integrator_tenant_service` — 8 отношений, права **колоночные**
   (`platform_users` — только `id`, `integrator_user_id`, `merged_into_id`; имени и ФИО нет),
   `rowsecurity=t force=t` на каждом, и у каждой разрешающей политики есть предикат:
   `organization_id = app.current_org_id()` либо связка через активное членство
   `be_organization_members` / активное зачисление `org_enrollments`. Широкое членство
   `bcb_*_integrator → app_tenant_service` **снято** (`pg_auth_members`: остались
   `app_integrator_request`, `app_integrator_resolver`, `app_integrator_tenant_service`,
   `app_operational_delivery_worker`, `app_operational_scheduler`, `app_service`).
   `integratorDoorsOnTheWebappTenantRole` в переписи — **0 записей** (было 1).
4. **Стена пациента на ПДн.** `platform_users`, `user_contacts`, `user_channel_bindings`,
   `user_identity`, `user_phone_history`, `user_channel_preferences`, `user_notification_topics(_channels)`,
   `user_web_push_subscriptions` — у всех политика `app_patient` вида
   `<колонка> = app.current_actor_user_id()`. Пациент видит только себя; соседа по клинике — нет.
5. **Стена пациента на медицине.** 33 клинических отношения (дневник, симптомы, тесты, программы
   лечения, практики, обсуждения, поддержка, абонементы) — все с предикатом на пациента.
   Org-wide у пациента только каталог и оформление клиники (`content_pages`, `content_sections`,
   `reference_*`, `patient_home_blocks`, `org_brand_revisions`) — и то `org_brand_revisions`
   дополнительно требует `status='published'` **и** активного зачисления.
6. **Медиа.** `usage_purpose='program_item_submission'` (загрузки пациента) закрыто дважды: политикой
   `rev10_media_files_patient_read_109` (`uploaded_by = app.current_patient_user_id()`) и приложением
   (`canAccessProgramSubmissionMedia`). Замер по DEV: других классов у медиа нет
   (`178 строк usage_purpose IS NULL` — библиотека клиники, `6 — program_item_submission`).
   Патиентские ветки `/api/media/[id]/preview|playback|hls` **не остаются без принципала**:
   `requirePatientApiBusinessAccess` сам зовёт `stampPatientPrincipalForApi`
   (`app-layer/guards/requireRole.ts:892`) — я это проверил отдельно, потому что в
   `/api/media/[id]/route.ts` обёртка стоит явно, а в трёх соседях нет, и это выглядит как пропуск.
7. **Загрузка файлов.** `modules/media/uploadValidation.ts`: закрытый реестр политик (routes выбирают
   `policyId`, а не собирают объект), закрытая карта MIME→расширение, предел размера на политику,
   и **сверка сигнатуры файла после заливки** (`file_signature_mismatch`, `received_size_mismatch`,
   `received_content_type_mismatch`). SVG в списке разрешённых MIME отсутствует.
8. **Вебхуки каналов (аноним из интернета).** Telegram (`webhook.ts:430`), MAX (`:205`), VK (`:40`) —
   секрет сверяется `isWebhookSecretValid` (`timingSafeEqual` + предварительная сверка длины,
   `integrations/common/webhookSecretCompare.ts`) **до** разбора тела и до любого обращения к БД.
9. **M2M-двери интегратора в вебапп.** `assertIntegratorGetRequest` → `verifyIntegratorGetSignature`:
   HMAC-SHA256 по канонической строке `GET {pathname}{search}`, окно свежести ±300 с,
   `timingSafeEqual`. Организация, названная в запросе, входит ровно через один chokepoint —
   `enterVerifiedIntegratorOrganizationPrincipal` (единственный вызывающий
   `enterWithDbOrganizationPrincipal` во всём вебаппе).
10. **Переключение клиники пациентом.** `organizationId` из запроса — не «названная», а сверенная:
    `resolveActiveOrganizationForPatient` ищет её среди активных зачислений самого пациента и иначе
    отдаёт `organization_target_not_authorized` (`modules/patient-organization/service.ts:63-71`).
11. **Dev-обход входа.** `/api/auth/dev-public` требует `NODE_ENV=development` **и**
    `ALLOW_DEV_AUTH_BYPASS=true`, а `assertDevAuthBypassConfiguration` роняет **старт процесса**, если
    флаг включён в проде. Маршрута `/api/auth/dev-bypass`, о котором помнят старые записки, в дереве нет.
12. **Токены входа.** deep-link мессенджера — `randomBytes(18)` (144 бита), bind-секрет —
    `randomBytes(24)` (192 бита), оба хранятся хешем SHA-256. Перебором не берутся.

---

## 4. НЕ ПРОВЕРЕНО (честная граница этой проверки)

- **Маршрутные пробы под живой сессией врача и пациента не выполнялись.** Причина названа вверху:
  вход по телефону и по паролю на DEV отдаёт 500, а `/api/auth/dev-bypass` в дереве больше нет.
  Поэтому «стена пациента на вложенных ресурсах» проверена по правам и политикам БД и по чтению
  маршрутов, но не сквозным `curl` с чужим идентификатором.
- **Исходящая доставка между клиниками** — прочитан только слой матрицы egress
  (`outboundMessagePolicy.ts`: класс сообщения + возможность, без вывода доверия из id/источника).
  Арендный фильтр на `ENQUEUE` и путь рассылки не замерялись.
- **101 DEFINER-корень вне гейта** (у них вызывающий — неарендная роль: `app_pre_session`,
  `app_platform_settings`, воркеры). У них другое свойство — «платформенная роль не должна отдавать
  арендатору», — и гейта под него нет. Это не пропуск гейта, а его объявленная граница
  (`DEFINER_TENANT_PREDICATE_GATE_2026-08-22.md` §1.1); проверять её здесь я не брался.
- **TEST и PROD не трогались вовсе**, `--execute`, деплой, `push`, full CI не запускались.
- **Живой строки чужой клиники по F1 не показано** — на DEV таблица пуста, и я это не маскирую.
- **Секреты в клиентском бандле** не проверялись сборкой (`next build` не гонялся); проверено только
  разделение секретов по назначению в `config/env.ts`.
