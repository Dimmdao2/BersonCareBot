# `/app/admin/notifications` отдавала 500 — чтение почты мимо двери (22.08.2026)

Ветка `wt/admin-notifications-20260822`, голова брифа `34df2b067`. План: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт **Б2** + живой обход TEST 22.08.

Коротко: страница падала НЕ из-за отсутствующего гранта, который надо выдать. Она рисует ЛИЧНЫЙ раздел
человека под ПЛАТФОРМЕННЫМ принципалом, а личные таблицы платформенной роли не видны по решению
(D1). Дверь для «своих данных» в репозитории уже есть — идентичность-себя; страница ходила мимо неё.
Прав не добавлено ни одного: артефакты пересобраны и совпали побайтно.

Попутно измерен второй дефект того же цутовера, который отказом прав НЕ выглядел: подзапрос первичного
контакта коррелировал сам с собой и молча отдавал NULL — почта «пропадала» у всех, включая обычного врача.

---

## 1. Что измерено (не пересказ брифа)

### 1.1 Принципал страницы

`apps/webapp/src/app/app/admin/notifications/page.tsx:11` — `requirePlatformOperationsPage()`
(`apps/webapp/src/app-layer/guards/requireRole.ts:194`) штампует принципал `platform` →
`SET ROLE app_platform_settings`, пул глобального админа. Дальше страница рисует
`loadStaffNotificationsSection` — ЛИЧНЫЙ раздел уведомлений того же человека.

Первое чтение раздела — `getProfileEmailFields`:
`apps/webapp/src/infra/repos/pgUserProjection.ts:240`.

### 1.2 Почему у роли нет права — и почему его нельзя просто выдать

Живой каталог `bcb_webapp_dev` (совпадает с закоммиченным артефактом
`deploy/postgres/generated/privileges.*.sql`) по `public.user_contacts`:

| роль | грант | стена (permissive policy) |
|---|---|---|
| `app_patient` | SELECT по 8 колонкам | `platform_user_id = app.current_patient_user_id()` — только своя строка |
| `app_staff` | SELECT, DELETE | активный сотрудник ИЛИ зачисленный пациент ТЕКУЩЕЙ клиники |
| `app_tenant_service` | SELECT/INSERT/UPDATE/DELETE | та же арендаторская стена |
| 17 seam-owner'ов | по телу своего корня | `rev10_named_root_owner_gate_218` |
| **`app_platform_settings`** | **нет** | **политики нет вовсе** |

То же и на остальных ЧЕТЫРЁХ личных таблицах раздела (`user_channel_preferences`,
`user_notification_topics`, `user_notification_topic_channels`, `user_web_push_subscriptions`) —
у платформенной роли нет ни одного гранта ни на одну из них.

Отсюда два вывода, и оба важнее самой правки:

1. **Починить только `user_contacts` было бы обманом.** 500 сдвинулся бы на строку вниз, на
   `channelPreferencesPort.getPreferences`. Отказ был на первом чтении, а сломан весь раздел.
2. **Грант платформенной роли — не «мелкая правка», а открытие чужих ПДн.** Политики у роли нет,
   поэтому грант БЕЗ политики дал бы ноль строк молча (тихий ноль, против приёмочного инварианта D6),
   а грант С политикой означал бы «глобальный админ читает контакты всех людей» — решение владельца,
   а не работа исполнителя (D1).

### 1.3 Дверь, которая уже объявлена

Личные разделы `/app/account` уже ходят за своими данными под **идентичностью-себя** —
`runWithStaffSecuritySelfPrincipal` (`apps/webapp/src/app-layer/principal/staffSecuritySelfPrincipal.ts`),
роль `app_patient`, субъект — сам вошедший человек. Это тот же механизм, которым
`requireStaffPersonalInstallPage` уже отдаёт глобальному оператору его личный экран установки PWA.

Второй двери заводить не потребовалось: ни новой функции, ни гранта, ни миграции. Объявленный корень
`app.read_current_patient_identity_contacts()` тоже есть, но он отдаёт телефон+почту БЕЗ `confirmed_at`
и объявлен только для класса `patient`; расширять его не понадобилось — реляционное чтение под
идентичностью-себя закрыто политикой «только своя строка» и права уже объявлены.

### 1.4 Второй дефект: подзапрос коррелировал сам с собой

`drizzlePrimaryEmailCol` и три его близнеца (`userContactsSql.ts`) подставляли drizzle-колонки:

```
WHERE ${userContacts.platformUserId} = ${platformUsers.id}
```

Drizzle печатает колонку БЕЗ имени таблицы, когда фрагмент стоит в списке выборки `.select({…})`
(в `WHERE` — с именем; проверено рендером обоих режимов). В списке выборки выходило
`WHERE "platform_user_id" = "id"`, и `"id"` связывался с `user_contacts.id` — собственным ключом
подзапроса. Условие ложно всегда, ошибки нет, подзапрос отдаёт NULL.

Замер на `bcb_webapp_dev`: у владельца строка почты есть и подтверждена
(`confirmed_at = 2026-07-28`), а сломанный текст возвращает пусто:

```
$ psql -Atc "select (SELECT value_normalized FROM user_contacts WHERE platform_user_id = id AND …) from platform_users where id='9c40e322…'"
            <- пусто
$ psql -Atc "select (SELECT value_normalized FROM user_contacts uc WHERE uc.platform_user_id = pu.id AND …) from platform_users pu where pu.id='9c40e322…'"
dimmdao@gmail.com
```

Живое следствие видно и на исправной странице: на главном дереве (`:5200`, без правок) `/app/account`
доктора отдаёт `emailVerified:false` при подтверждённой почте, на этой ветке — `true`.

**Пострадавшие места — все, где фрагмент стоит в списке выборки:** `pgUserProjection` (почта,
подтверждение, телефон), `pgOAuthUserResolve`, `pgCanonicalPlatformUser`, `pgDoctorClientCreate`,
`pgUserByPhone`, `pgBookingEngine`, `pgBookingCalendar`, `pgPatientOrganization`,
`pgMaterialRatingFeedback`, `pgClientMediaFolders`. Употребления в `WHERE`
(`pgAdminClientProfileConflicts`, `pgOrganizationInvites`, `broadcastChannelCounts`,
`pgAnalyticsAudience`) печатались корректно и не пострадали.

Отдельно: `pgBroadcastEmailRecipients` вставлял тот же фрагмент в сырой SQL, где `platform_users`
имел псевдоним `pu`. Там корреляция печаталась квалифицированно — и запрос ломался бы 42P01
«invalid reference to FROM-clause entry for table platform_users». Псевдоним снят.

---

## 2. Что сделано

| файл | правка |
|---|---|
| `apps/webapp/src/app/app/account/staffNotificationsSection.tsx` | пять личных чтений раздела обёрнуты в `runWithStaffSecuritySelfPrincipal`; организационная (`doctor`-scope) настройка вынесена ИЗ области — её стена арендаторская |
| `apps/webapp/src/infra/repos/userContactsSql.ts` | четыре близнеца сведены в ОДНУ точку с параметрами (вид контакта, колонка); обе стороны корреляции квалифицированы, внутренняя таблица получила псевдоним |
| `apps/webapp/src/infra/repos/pgBroadcastEmailRecipients.ts` | снят псевдоним `pu` — иначе запрос ломается 42P01 |
| `apps/webapp/src/app/api/auth/email-password/register/confirm/route.ts` | чтение своей почты переведено на идентичность-себя (маршрут исполняется под `app_pre_session`, у которого гранта нет) |
| `apps/webapp/src/infra/repos/userContactsSql.unit.test.ts` | два теста на корреляцию: условие одинаково в обоих режимах печати drizzle и называет внешнюю таблицу |

Выбор стены стоит в ЕДИНСТВЕННОМ месте, где раздел читает базу, поэтому следующая страница, которая
отрисует его под своим принципалом, отказа не воспроизведёт.

**Прав не менялось.** `generate-cli.mjs --all` и `--all --port-context-only` пересобрали артефакты
без единого изменения в `deploy/` (`git status` пуст), оба `--check` — `exit=0`. Миграции нет.

---

## 3. Доказательства

Живой прогон из этого worktree, `next dev` на `127.0.0.1:5300` против `bcb_webapp_dev`; вход
`dimmdao@gmail.com` (глобальный админ) и `dimmdao@yandex.ru` (доктор).

| проверка | до | после |
|---|---|---|
| `/app/admin/notifications` (админ) | **500**, журнал БД: `42501 permission denied for table user_contacts` под `bcb_dev_webapp_global_admin` — тот же отказ, что снят на TEST в 16:04:11 | **200**, раздел уведомлений и операторские алерты нарисованы, `emailVerified:true` |
| то же на главном дереве `:5200` (контроль, без правок) | **500** | — |
| `/app/account` (админ) | 200 | 200 |
| `/app/account` (доктор) | 200, `emailVerified:**false**` при подтверждённой почте | 200, `emailVerified:**true**` |
| `/app/account?tab=notifications` (админ) | 307 → `/app/admin/notifications` | 307 → то же (поведение не менялось; именно поэтому эта страница И ЕСТЬ вкладка «Уведомления» глобального админа) |

**Инъекция неисправности.** Снял объявленное право
`REVOKE SELECT (value_normalized) ON public.user_contacts FROM app_patient` → страница перестала
отдавать 200 (307 на вход, в журнале `42501` под `bcb_dev_webapp_patient`). Право возвращено, ACL
таблицы и всех колонок сверен с дампом до инъекции — **побайтно совпадает**, страница снова 200 с
`emailVerified:true`.

**Инъекция в тест.** Вернул старый текст подзапроса — оба новых теста покраснели
(`2 failed | 6 passed`), с исправленным текстом — `8 passed`.

**Гейты.** `pnpm test:db-privileges` — 142 pass / 0 fail / 56 skip. `bash deploy/host/migrate-dev.sh
--preflight` — `PASS (pending=0 total=38 verified-objects=82)`; `--execute` не запускался.
`tsc --noEmit` по `apps/webapp` — чисто. `eslint` по затронутым файлам — чисто. Точечные vitest
(`userContactsSql`, `pgCanonicalPlatformUser`, `d15b6DoctorClientCreateRace`, `d15b5FioDualWriteGaps`,
`identityPhoneRowSchemas`) — 24 passed.

---

## 4. Перепись соседей: реляционные чтения `public.user_contacts` из `apps/webapp/**`

Правило, по которому классифицировано (следует из таблицы §1.2): реляционное чтение живёт, если
исполняется под `app_patient`, `app_staff` или `app_tenant_service`, и отказывает `42501` под
`app_platform_settings`, `app_pre_session`, `app_worker`/инфра, `app_clinic_billing`.

### 4.1 Живые и исправные (принципал с грантом)

Чтения врачебного и пациентского контура: `pgDoctorClients`, `pgDoctorClientCreate`,
`pgAdminClientProfileConflicts`, `pgOrganizationInvites`, `pgBookingEngine`, `pgBookingCalendar`,
`pgClientMediaFolders`, `pgPatientOrganization`, `pgMaterialRating(-Feedback)`, `pgLfk*`,
`pgSupportCommunication`, `pgChannelPreferences`, `pgUserByPhone`, `pgCanonicalPlatformUser`,
`broadcastChannelCounts`, `pgBroadcastEmailRecipients`, `app/api/doctor/**` — `app_staff`
(арендаторская стена) либо `app_patient` (своя строка). Отказа прав нет; дефект §1.4 их касался
и снят общей правкой хелпера.

### 4.2 Достижимы и сломаны — ПОЧИНЕНО в этой ветке

| место | принципал | статус |
|---|---|---|
| `/app/admin/notifications` → `staffNotificationsSection` → `getProfileEmailFields` | `platform` | почищено, 200 живьём |
| `/api/auth/email-password/register/confirm` → `getProfileEmailFields` | `pre_session` (`stampBootstrapPrincipal`, чтение ДО `enterStaffSecuritySelfPrincipal`) | переведено на идентичность-себя |

⚠️ Второе — **вывод из двух измеренных фактов** (у `app_pre_session` гранта на `user_contacts` нет;
чтение стоит выше по коду, чем вход в идентичность-себя), а НЕ живой повтор: чтобы дойти до этой
строки, нужен настоящий e-mail-челлендж регистрации. Правка типобезопасна и симметрична соседней
строке того же файла, но её живое доказательство за мной не числится — назвать ведущему.

### 4.3 Достижимы и сломаны — НЕ мои, вопрос ведущему (§24.6)

Замерено на `bcb_webapp_dev` под сессией глобального админа, коды и SQLSTATE из журнала БД:

| маршрут | код | SQLSTATE / таблица |
|---|---|---|
| `/api/doctor/clients/name-match-hints` (→ `platformUserNameMatchHints`) | 500 | `42501 user_contacts` |
| `/api/admin/platform-user-subscriber-stats` | 500 | `42501 user_contacts` |
| `/api/admin/platform-user-registration-stats` | 500 | `42501 platform_users` |
| `/api/admin/product-analytics` | 500 | `42501 platform_users` |

Того же семейства, не проверены живьём (тот же принципал, те же таблицы):
`/api/doctor/clients/[userId]/merge-candidates` и `/api/doctor/clients/merge` (`platformUserMergePreview`),
`(global-admin)/doctor/booking-merge` (`pgPublicBookingMergeCandidates`),
`(global-admin)/doctor/analytics/*` (`pgAnalyticsAudience`), `pgDoctorAnalyticsMetricAccounts`
(сегодня закрыт раньше базы флагом `platform_patient_drilldown_disabled`, 409).

**Почему не чиню:** границы брифа («страницы админки, кроме этой, не трогать») и, важнее, развилка
владельца. У всех этих мест ОДИН вопрос: **читает ли глобальный админ контакты и ПДн ЧУЖИХ людей?**
Ответ «да» = грант + новая политика платформенной роли (это правка D1). Ответ «нет» = каждое такое
чтение уходит за объявленный корень с сузенной выдачей (миграции, а `--execute` этой ветке запрещён).
Выдумывать ответ за владельца — ровно тот аудит-разгон, который канон запрещает.

---

## 5. Найдено попутно — НЕ моё, но чинит чужую работу (назвать вслух)

**На DEV сломан вход ВСЕМ, и это не моя ветка.** `app_ext.resolve_variant_a_identity(uuid, text)`
(шаг D15b/7a Ш4, приземлён сегодня) выводит `opaque_ref` из ОДНОГО `physical_user_id`, без
`ref_kind`. Значит ссылка вида `subject` выводится в тот же uuid, что уже лежит у `actor`, и вставка
падает на легаси-уникальном индексе `variant_a_identity_refs_opaque_ref_key` — арбитр
`ON CONFLICT (physical_user_id, ref_kind)` этот индекс не покрывает:

```
23505 duplicate key value violates unique constraint "variant_a_identity_refs_opaque_ref_key"
  CONTEXT: PL/pgSQL function resolve_variant_a_identity(uuid,text) line 20
  STATEMENT: SELECT app.pre_session_resolve_identity($1::uuid, $2::text)
```

Проверено: на `bcb_webapp_dev` было 26 строк `actor` и НОЛЬ `subject`, вход отдавал `server_error`
и на главном дереве (`:5200`), и в моём worktree — то есть до моих правок и без их участия.

**Чтобы получить живое доказательство, я засеял недостающие строки** (по одной `subject` на человека,
`gen_random_uuid()`, 26 строк). После этого вход заработал. Строки ОСТАВЛЕНЫ: без них вход на DEV мёртв
для всех агентов. Откат одной командой:

```
DELETE FROM app_ext.variant_a_identity_refs WHERE ref_kind = 'subject';
```

Настоящая починка — в ветке Ш4: либо выводить ссылку с учётом `ref_kind`, либо снять легаси-уникальный
индекс на `opaque_ref`. Мои строки ей не помешают (резолвер сначала читает существующую строку).

**Грабли для тех, кто будет делать инъекции прав** (стоили мне двух кругов починки ACL):
`REVOKE INSERT, SELECT ON TABLE t FROM r` снимает и КОЛОНОЧНЫЕ гранты той же привилегии, а
`GRANT INSERT, SELECT (col)` вешает список колонок только на ПОСЛЕДНЮЮ привилегию — `INSERT`
уезжает на таблицу целиком. Колоночный грант пишется как `GRANT INSERT (col), SELECT (col)`.

---

## 6. НЕ СДЕЛАНО

- §4.3 — четыре измеренных и пять предполагаемых платформенных маршрутов того же класса: ждут
  решения владельца по D1 (см. §4.3).
- Живой повтор отказа на `/api/auth/email-password/register/confirm` (§4.2) — правка есть,
  живого «до/после» нет.
- Полный CI, `push`, деплой, запись на TEST, `migrate-dev.sh --execute` — по брифу не мои.
- Расхождение двух семейств хелперов первичного контакта (`CONTACTS.*` для сырого SQL с `pu` и
  drizzle-подзапросы) не сведено в одну точку: это сотни колл-сайтов, отдельная работа, а не «заодно»
  (AGENTS.md §5, «граница — цена»).
