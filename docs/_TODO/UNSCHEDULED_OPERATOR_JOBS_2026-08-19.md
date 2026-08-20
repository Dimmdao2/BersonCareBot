# Критическая проверка здоровья на TEST не запускается вовсе

Найдено 19.08.2026 при проверке, заработал ли тик после починки прав.

## Замер

    SELECT job_key, last_status, last_success_at FROM operator_job_status …

    media.preview.process                | success | 2026-08-19 10:35
    health.system_health_guard.tick      | success | 2026-08-19 10:33
    health.operator_health_critical.tick | success | 2026-08-16 05:00   ← 3 дня 5 часов назад

    SELECT now() - last_success_at … → 3 days 05:35:18

Критический тик по замыслу идёт **каждые 5 минут**. Он не шёл трое суток.

## Почему

В репозитории пять шаблонов расписания, установлен на TEST **один**:

| шаблон | установлен на TEST |
|---|---|
| `bersoncarebot-media-preview` | да (`bersoncarebot-test-media-preview`) |
| `bersoncarebot-operator-health-critical` | **НЕТ** |
| `bersoncarebot-operator-health-digest` | нет (но будит планировщик интегратора) |
| `bersoncarebot-saas-billing-renewal` | **НЕТ**, и в `operator_job_status` строки нет вовсе |
| `bersoncarebot-system-health-guard` | нет (но будит планировщик интегратора) |

Сами шаблоны написаны под ПРОД: порт 6200 и `webapp.prod`. Для TEST нужен вариант с портом 6300
и `webapp.test` — ровно так, как это уже сделано для превью медиа.

## Почему это тот же класс, что уборка по сроку хранения

Мы всю ночь чинили права у механизмов, которые должны замечать сбои. Здесь механизм исправен, но
его **никто не будит**. Разница для человека нулевая: и в том, и в другом случае сбой остаётся
незамеченным. Уборка по сроку хранения не работала месяцами ровно так же.

Отдельно: `billing.saas_renewal.tick` не имеет строки в `operator_job_status` вообще — то есть
не запускался НИ РАЗУ. Продление подписок на TEST не происходит.

## Что надо сделать

- [ ] Завести TEST-варианты трёх расписаний (`operator-health-critical`, `saas-billing-renewal`,
      и явный `operator-health-digest`, если полагаться на планировщик интегратора не хотим)
      через `cronport`, а не правкой `crontab` руками — это канон бокса.
- [ ] Убедиться замером, что после установки `last_success_at` начинает двигаться.
- [ ] Проверить, установлены ли те же расписания на ПРОДЕ. Прод не трогать — только посмотреть
      и доложить владельцу.


## Тик рапортовал успех поверх отказанного сигнала, а продление не запускалось ни разу (19.08, ветка `wt/tick-partial-failures-20260819`)

Предыдущий раздел объяснил, почему критический тик не ШЁЛ. Ведущий разбудил его руками — тик ответил 200 за
2.1 с и записал `health.operator_health_critical.tick | success | 2026-08-19 10:36:44`. В ту же секунду база
отказала одному из его сигналов, и `success` был неправдой.

### Дефект 1 — зелёная строка поверх канала, который не работал

**Воспроизведение (TEST, замер ведущего):**

    2026-08-19 10:36:42.290 bcb_test_webapp_staff@bersoncarebot_test 42501
    2026-08-19 10:36:43.480 bcb_test_webapp_staff@bersoncarebot_test 42501
    ERROR:  permission denied for table be_organization_members
    STATEMENT: select "platform_users"."id", "be_organization_members"."organization_id"
               from "be_organization_members"
               inner join "platform_users" on "platform_users"."id" = "be_organization_members"."platform_user_id"
               where ("be_organization_members"."status" = $1
                  and "platform_users"."role" in ($2, $3)
                  and "platform_users"."merged_into_id" is null)

**Воспроизведение своими руками на DEV** (боевой код, настоящий логин, настоящий порт-контекст; тик поднят
`POST /api/internal/operator-health-critical/tick` на worktree-сервере):

    2026-08-19 11:06:06.249 bcb_dev_webapp_staff@bcb_webapp_dev 42501
    ERROR:  permission denied for table be_organization_members   (тот же STATEMENT)

- [x] **Какой сигнал и почему под `app_worker`.** Это `pgStaffUsers.listActiveStaffOrganizationRecipients` —
      аудитория staff-веб-пуша операторского алерта: `sendAdminIncidentStaffWebPush` ←
      `dispatchOperatorAlert` ← `runOperatorHealthCriticalTick`. Роль правильная и менять её не надо: тик —
      машинный, идёт инфра-принципалом (класс `service`, роль `app_worker`), как и все остальные внутренние
      тики. Неправильно было ЧТЕНИЕ: `be_organization_members` — арендаторская таблица (класс C, `org: true`),
      и межарендного чтения у рабочей роли нет и по решению быть не должно.

- [x] **Почему `success` был неправдой, и почему пустая аудитория тут не спасает.** Отказ гасился `.catch`
      вокруг `sendAdminIncidentStaffWebPush` внутри `dispatchOperatorAlert` и превращался в «этот канал ничего
      не доставил». Диспетчер НЕ верит пустой аудитории — на «никто не получил» он зовёт `reportEmptyAudience`,
      — но остальные каналы (telegram/max/sms/email) отвечали, поэтому «пусто» не наступало ни разу, и наверх
      уходил обычный успех. Цена человеку: канал веб-пуша операторского алерта не срабатывал вообще.

- [x] **Починка — дверь, а не грант; отказ стал невозможен, а не заметен.** Соседние каналы того же
      диспетчера переехали на объявленный корень ещё миграцией 0030
      (`app.read_admin_notification_targets(text)`, владелец `app_seam_telemetry_operator_owner`); веб-пуш
      остался сырым чтением отношения. Заведён корень-близнец с ТЕМ ЖЕ владельцем шва:
      `app.list_operator_alert_staff_push_recipients()` — `execute: ['app_worker']`, класс `service`, цель
      `notifications.staff-push-audience.read`, миграция
      `apps/webapp/db/drizzle-migrations/0040_two_machine_ticks_had_no_door_of_their_own.sql`.
      **Ни одной табличной привилегии рабочей роли не добавлено:** весь дифф прав на базу — две строки
      `GRANT EXECUTE … TO "app_worker"` и поколоночные гранты ШВУ
      (`be_organization_members(organization_id, platform_user_id, status)`;
      `platform_users(id, role, merged_into_id)` у него уже был под соседний корень).
      Вызов — `apps/webapp/src/infra/repos/pgStaffUsers.ts`; двух путей не оставлено: `beOrganizationMembers`
      из файла удалён.

- [x] **Доказательство поведения:** `apps/webapp/src/infra/repos/pgMachineTickRoots.unit.test.ts` —
      «операторский алерт находит, кому слать веб-пуш, а не молчит на отказе таблицы» и «никого не нашлось —
      это пустая аудитория, а не выдуманный получатель».
      **Fault injection на живом DEV:** вернул репозиторию чтение отношения (`git checkout HEAD -- pgStaffUsers.ts`)
      → прогон тика в 11:06:06 дал `42501 permission denied for table be_organization_members`; вернул корень
      → прогон в 11:06:23 не дал ни одного отказа на этой таблице. Последняя запись отказа в логе —
      именно инъекция 11:06:06, после восстановления новых нет.

### Дефект 2 — продление подписок заявляло личность, которой у машины нет

**Воспроизведение (TEST, замер ведущего):**

    curl -X POST -H "Authorization: Bearer $INTERNAL_JOB_SECRET" \
      http://127.0.0.1:6300/api/internal/saas-billing/renewal/tick   -->  500
    2026-08-19 10:36:56.919 bcb_test_webapp_global_admin@bersoncarebot_test 42501
    ERROR: platform port context actor is not a platform administrator

**Воспроизведение своими руками на DEV** (боевой код ветки, откачен на HEAD, тот же маршрут):

    2026-08-19 11:05:22.980 bcb_dev_webapp_global_admin@bcb_webapp_dev 42501
    ERROR:  platform port context actor is not a platform administrator
    STATEMENT: SELECT app.begin_port_context($1::uuid, ROW(1, $2::app.port_context_class, …))
    CONTEXT:   PL/pgSQL function install_port_context(uuid,port_context_claims) line 59

- [x] **Под какой личностью job должен идти — установлено, а не предположено.** Маршрут входил
      `enterWithDbPlatformPrincipal` и подставлял актором нулевой UUID
      (`SAAS_BILLING_RENEWAL_TICK_SYSTEM_PLATFORM_USER_ID`). Класс `platform` по построению — класс живого
      администратора платформы: `app_ext.assert_port_context_claim` требует строку
      `platform_users.role='admin' AND merged_into_id IS NULL`, и выдуманного актора отвергает. Это не лишняя
      строгость, а СМЫСЛ класса, поэтому проверка не тронута.
      Замер, который решает вопрос: из ВСЕХ внутренних Bearer-тиков вебаппа
      (`WEBAPP_LOCKED_INFRA_CRON_SOURCES`, 19 источников) платформенным принципалом входил РОВНО ОДИН — этот,
      и он же единственный не работал. Остальные восемнадцать входят инфра-принципалом (класс `service`,
      роль `app_worker`). Машинная личность у машинного тика — не новая форма, а та, что уже принята в репозитории.

- [x] **Стена не ослаблена, а обойдена по правилам.** Маршрут переведён на
      `enterWithDbInfraPrincipal({ source: 'api/internal/saas-billing/renewal/tick:POST' })`; источник
      зарегистрирован и в `packages/db-principal/src/webappLockedInfraCronSources.ts`, и в
      `WEBAPP_WORKER_SOURCES` декларации (без второго рантайм отбивает вызов до базы:
      «Unknown webapp infra source in port-context mode» — так и было при первом живом прогоне).
      Перечисление «у кого кончился оплаченный период» — работа МЕЖАРЕНДНАЯ, а `app_worker` видит подписки
      только своей организации (RLS `rev10_direct_business_181`: `organization_id = app.current_org_id()`),
      поэтому у перечисления своя дверь: `app.list_saas_billing_subscriptions_due_for_renewal(timestamptz,integer)`
      — владелец шва коммерции `app_seam_org_commerce_owner` (тот же, что уже читает подписку и тариф в
      `app.refresh_saas_billing_invoice_purchased_tariff`), `execute: ['app_worker']`, верхняя граница
      `p_limit` закрыта в теле (1..200). Правило «за какой тариф платят» не раздвоено: корень применяет то же
      `pending_tariff_id ?? tariff_id`, что и `payableTariff.ts`, потому что из покупаемого тарифа берётся
      длина периода.

- [x] **Живое доказательство на DEV, что личность починена.** На `bcb_webapp_dev` подписке
      `1ba679e7-…` временно выставлен истёкший период и платный тариф «СТАРТ», прогон тем же маршрутом:
      отказа `platform port context actor is not a platform administrator` больше НЕТ (в логе 11 исторических
      вхождений, после правки ни одного нового), корень перечисления отработал и вернул строку — тик дошёл до
      следующего шага, `paidPeriodEndsAtForBillingCode`. Строка подписки на DEV восстановлена в исходный вид.

- [x] **Доказательство поведения:** `apps/webapp/src/infra/repos/pgMachineTickRoots.unit.test.ts` —
      «тик продления видит подписку, у которой кончился оплаченный период» (в том числе что покупаемым
      считается запланированный тариф). **Fault injection на живом DEV:** вернул маршрут и репозиторий на HEAD
      → 11:05:22 в логе `platform port context actor is not a platform administrator`; вернул правку → тик
      проходит установку контекста и перечисление.

### Продление всё равно НЕ доводит подписку до счёта — дальше стоят ещё три стены

Личность была ПЕРВОЙ стеной, но не последней. Замерено исполнением на DEV (транзакции откачены) и живым
прогоном тика с настоящей просроченной подпиской:

1. `app.list_saas_billing_period_catalog()` — «Missing unique declared webapp port capability»: у корня
   объявлены возможности `staff`/`app_clinic_billing` и (у платформенного близнеца) `platform`, класса
   `service` нет. Ветвление в `pgSaasBilling.listBillingPeriods` (`getCurrentDbPrincipal()?.kind === 'platform'`)
   написано ровно под старую платформенную личность тика.
2. INSERT счёта не выдан НИ ОДНОЙ рабочей роли:

       select has_table_privilege(r, 'public.saas_billing_invoices', 'INSERT')
       app_worker f · app_platform_settings f · app_clinic_billing f · app_staff f · app_object_owner t

       BEGIN; SET LOCAL ROLE app_worker; INSERT INTO public.saas_billing_invoices (…) …
         --> 42501 permission denied for table saas_billing_invoices

   То есть счёт продления не мог быть выставлен НИКОГДА и ни под какой личностью — платформенный отказ
   контекста лишь прятал это. `createSaasBillingRenewalInvoiceIfAbsent` пишет счёт прямым drizzle-INSERT
   внутри транзакции; форма починки — узкий шов вроде `app.refresh_saas_billing_invoice_purchased_tariff`,
   которому сумма выводится ВНУТРИ (money-wall, `saas-billing-invoice-money-wall.test.mjs`), а не приходит
   аргументом. Это отдельная работа со своей приёмкой.
3. Тем же прямым путём идут `attachSaasBillingInvoiceProviderIntent`, `markSaasBillingInvoiceFailed` и
   `promoteDueSaasBillingPaidInvoice` — весь репозиторий SaaS-биллинга реляционный (37 обращений через
   `getDrizzle()`, три через объявленные корни).

**Что это значит для строки состояния.** `billing.saas_renewal.tick` теперь будет ПОЯВЛЯТЬСЯ и честно
показывать `failed` с причиной, вместо того чтобы не существовать вовсе. Успеха она не покажет, пока не
заведены двери из пунктов 1–3.

## НЕ СДЕЛАНО

- Ничего из списка выше («Что надо сделать»). Установка расписаний меняет состояние хоста, поэтому вынесено
  владельцу отдельным пунктом, а не сделано ночью между делом.

**Работа `wt/tick-partial-failures-20260819`, что осталось за границей:**

- **Живая проверка на TEST** — не моя: выкатывает ведущий. На DEV проверено всё, что на DEV проверяемо
  (доказательства и fault injection у пунктов выше). До выкатки критический тик на TEST по-прежнему
  рапортует успех поверх молчащего канала веб-пуша, а `billing.saas_renewal.tick` по-прежнему без строки.

- **Продление подписки НЕ доходит до счёта.** Три стены названы замером в разделе выше (класс `service` у
  каталога периодов; INSERT счёта не выдан ни одной рабочей роли; весь репозиторий SaaS-биллинга
  реляционный). Ни одной из них я не залатал: выдать рабочей роли INSERT на таблицу счетов — прямо против
  money-wall решения, а завести шов, который собирает счёт целиком, — отдельная работа со своей приёмкой.
  Поэтому теста «просроченная подписка ДЕЙСТВИТЕЛЬНО продлевается» в этой ветке нет и быть не может: он был
  бы зелёным только на моках, то есть врал бы.

- **`operator_incidents` не пишется под `app_worker` — критический тик падает на DEV именно здесь.**
  Замер: `has_table_privilege('app_worker','public.operator_incidents','INSERT')` = `f`, у роли только
  SELECT; INSERT есть лишь у `app_object_owner`. В логе DEV отказ повторяется КАЖДЫЙ прогон тика
  (11:00:37, 11:06:06, 11:06:23) и одинаково — и до моей правки, и после: путь идёт от кандидата
  `tenant_isolation` через каденцию инцидента, аудитории веб-пуша не касается. На TEST этого кандидата в
  момент замера ведущего не было, поэтому там тик и вернул 200. Это соседний дефект того же семейства
  (сторож не может записать то, что заметил), НЕ моя правка и НЕ мой скоуп — назван, а не залатан.

- **`user_web_push_subscriptions` и `user_channel_preferences` отказаны под `app_worker`.** Видно на DEV
  сразу после исправленной аудитории: тик доходит до проверки настроек каждого получателя и получает
  `42501` на обеих таблицах (у них есть `app_staff`, но не `app_worker`). То есть даже с правильной
  аудиторией веб-пуш оператора пока не уедет — это следующий разрыв на том же пути, своя дверь и своя
  приёмка. Найден по дороге, не чинился.

- **`dispatchOperatorAlert` по-прежнему гасит отказ канала веб-пуша в `.catch` и возвращает «не
  доставлено».** Для ЭТОГО сигнала отказ теперь невозможен (дверь есть), поэтому новой машинерии проверок я
  не добавлял — владелец не любит защитное дублирование. Но механизм «канал упал → тик всё равно успех»
  остался общим для всех каналов диспетчера; сделать его громким — отдельное решение, в плане такого пункта
  нет.

- **`.env.dev` главного дерева не знает новых возможностей.** `migrate-dev.sh --execute` дописал их в
  `.env.dev` ЭТОГО worktree; `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` остался прежним —
  до слияния ветки запуск новых корней из главного дерева упрётся в «Missing declared webapp port capability».

## Сторож видел инциденты и не мог открыть ни одного (19.08, ветка `wt/worker-incident-insert-20260819`)

Последнее звено цепочки. После 0040 критический тик перестал врать и стал честно падать — но работать не
начал. Замер на живом TEST, голова `ab1bee3554`:

    2026-08-19 11:28:36 POST /api/internal/operator-health-critical/tick  -->  500 {"ok":false,"error":"internal_error"}
    2026-08-19 11:28:37.039 bcb_test_webapp_staff@bersoncarebot_test [unknown] 42501
    ERROR:  permission denied for table operator_incidents
    STATEMENT: insert into "operator_incidents" ("id", "dedup_key", "direction", "integration",
               "error_class", "error_detail", "opened_at", "last_seen_at", "occurrence_count",
               "resolved_at", "alert_sent_at", "acknowledged_at", "initial_alert_sent_at",
               "one_hour_alert_sent_at", "alert_claim_phase", "alert_claim_token",
               "alert_claimed_at") values (default, $1, ...) on conflict ("dedup_key")
               where resolved_at IS NULL do update set ...

Отказ повторялся КАЖДЫЕ пять минут (11:20:02, 11:25:02, 11:27:27, 11:28:37, 11:30:01) — расписание уже
поставлено, будильник звонит, сторож падает.

- [x] **Что именно было отказано — измерено, а не предположено.** Не «`app_worker` держит только SELECT»:
      у роли на `public.operator_incidents` табличный SELECT, ПОКОЛОНОЧНЫЙ INSERT на семь колонок
      (`dedup_key`, `direction`, `integration`, `error_class`, `error_detail`, `opened_at`, `last_seen_at`)
      и поколоночный UPDATE на десять. `has_table_privilege(...,'INSERT')` отдаёт `f` именно потому, что
      грант поколоночный. Drizzle же перечисляет в INSERT ВСЕ семнадцать колонок таблицы, подставляя
      `default` десяти невыданным, — и упирается в них. Отсюда и то, почему до 0040 тик отвечал 200:
      UPDATE-путь каденции (claim/complete/release/resolve) трогает только выданные колонки, а до INSERT
      тик доходил лишь тогда, когда появлялся критический кандидат. **Цена человеку:** ровно в ту минуту,
      когда сторож ДЕЙСТВИТЕЛЬНО что-то заметил, он падал целиком и не оставлял на
      `/app/admin/system-health` ни строки.

- [x] **Близнец, а не переиспользование — с обоснованием.** `app.open_or_touch_operator_incident
      (text,text,text,text,text)` действительно существует и у него ТОТ ЖЕ владелец шва
      (`app_seam_telemetry_operator_owner`). Переиспользовать его нельзя тремя независимыми причинами:
      (1) его набор исполнителей закрыт утверждением в `deploy/postgres/integrator-server-runtime-config.sql`
      — дословно `NOT has_function_privilege('app_worker', 'app.open_or_touch_operator_incident
      (text,text,text,text,text)', 'EXECUTE')` плюс проверка «неожиданных грантополучателей» (владелец +
      рантайм-роль интегратора + `app_operational_delivery_worker`); выдать `app_worker` EXECUTE — значит
      переписать проверку, чтобы задача прошла; (2) второй способ «под правильным принципалом» — войти
      вебаппом как `app_operational_delivery_worker` — отдаёт пятиминутному сторожу ВСЮ личность
      доставщика вместе с его поверхностью очереди ради одной строки; (3) контракт не тот: тот корень
      принимает `error_class`/`integration` свободным текстом и возвращает `(id, occurrence_count)`, а
      каденции нужен `opened_at` (по нему считается T0 -> +1ч). Заведён близнец
      `app.open_or_touch_operator_critical_incident(text,text,text,timestamptz,text)` того же владельца
      шва, `execute: ['app_worker']`, класс `service`, цель `health.critical-incident.open-or-touch`,
      миграция `apps/webapp/db/drizzle-migrations/0041_the_watchman_could_read_incidents_but_not_open_one.sql`.
      Дверь УЖЕ прежнего пути: `error_class` прибит к `critical` в теле, `integration` закрыт списком двух
      каденций, `opened_at` приходит часами тика.

- [x] **Рабочей роли не добавлено ни одной привилегии — наоборот, снята.** Весь дифф прав на базу:
      одна строка `GRANT EXECUTE … TO "app_worker"`, поколоночные гранты ШВУ (`opened_at` на
      INSERT/SELECT/UPDATE — поверхность его собственного тела) и **удаление**
      `GRANT INSERT ("dedup_key","direction","error_class","error_detail","integration","last_seen_at","opened_at")
      … TO "app_worker"`: прямого INSERT в коде больше нет, двух путей к одной записи не оставлено.
      Вызов — `apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts#openOrTouchCriticalAlertIncident`.
      `node deploy/postgres/privileges/generate-cli.mjs --check` — побайтно; корень зарегистрирован в
      каталоге вызовов и каталоге возможностей, датированные счётчики сдвинуты.

- [x] **Живое доказательство: 200 И строка, которую видит человек.** На `bcb_webapp_dev` боевым кодом
      ветки через настоящий маршрут:
      `11:42:31 POST /api/internal/operator-health-critical/tick --> 200
      {"ok":true,"alerted":4,"keys":[...]}`, и в базе появились ЧЕТЫРЕ строки —
      `critical:tenant_isolation:diagnostics:critical`, `critical:outbound_oldest_unsent:over_threshold`,
      `critical:heartbeat_absent:digest:never`, `critical:notification_audience_empty:active`
      (`integration=critical_alert_cadence`, `error_class=critical`, `opened_at=11:42:45.097`). Второй
      прогон в 11:43:20 дал 200 и `alerted:0`: `occurrence_count` вырос 1 → 2, `opened_at` не сдвинулся,
      `last_seen_at` ушёл вперёд — то есть работает не только открытие, но и каденция «повтор не будит
      второй раз». Отказов на `operator_incidents` в логе за это время — ноль.

- [x] **Доказательство поведения:** `apps/webapp/src/infra/repos/pgMachineTickRoots.unit.test.ts` —
      «замеченный критический сбой открывает инцидент, который человек увидит на панели здоровья» и
      «дверь ответила без строки инцидента — это отказ, а не открытый инцидент».
      **Fault injection на живом DEV:** вернул репозиторию прямую вставку отношением
      (`git stash` правки) → прогон в 11:43:34 дал `500` и в логе
      `11:43:35.856 42501 permission denied for table operator_incidents` с тем же drizzle-STATEMENT;
      вернул корень → прогон в 11:43:49 дал `200`, отказов на этой таблице после восстановления ноль.

### Вердикт по двум соседним стенам: доставку рвут, тик — нет

`user_web_push_subscriptions` и `user_channel_preferences` под `app_worker` отказаны — это подтверждено, но
успеху тика они НЕ мешают. Замер того же успешного прогона 11:42:50 на DEV: 28 отказов
`permission denied for table user_channel_preferences` и 28 — `user_web_push_subscriptions`, и при этом тик
вернул 200, инциденты открылись, `alerted:4`. Причина: обе стены стоят ЗА `dispatchOperatorAlert`, внутри
канала веб-пуша, чей отказ гасится `.catch` и превращается в «канал ничего не доставил»; остальные каналы
отвечают, поэтому «пусто» не наступает.

Не чинил: та же дорога, но НЕ та же форма. Это не операторская телеметрия, а пер-получательские таблицы
пользовательских подписок и предпочтений — другой шов, другая дверь и своя приёмка. Своим корнем их сюда не
затащить, не расширив шов операторской телеметрии на пользовательские данные.

**Что это значит для человека прямо сейчас:** критический тик работает и записывает то, что заметил —
операторская панель здоровья наполняется. Веб-пуш операторского алерта по-прежнему не уезжает, хотя
аудитория (0040) теперь находится: он падает на настройках каждого получателя. Остальные каналы
(telegram/max/sms/email) идут своим путём и не затронуты.

### НЕ СДЕЛАНО (`wt/worker-incident-insert-20260819`)

- **Живая проверка на TEST — не моя: выкатывает ведущий.** Воспроизведение 500/42501 сделано на TEST
  (только POST тика, состояние хоста не менялось), а починка проверена живьём на DEV. До выкатки
  критический тик на TEST продолжит отвечать 500 каждые пять минут.
- **`user_web_push_subscriptions` и `user_channel_preferences` не починены** — вердикт и замер выше:
  успеху тика не мешают, рвут только канал веб-пуша, форма другая. Своей строки в плане у них нет —
  это вопрос владельцу, а не работа, которую я завёл сам.
- **`dispatchOperatorAlert` по-прежнему гасит отказ канала в `.catch`.** Ровно поэтому 56 отказов выше
  не сделали тик красным. Механизм «канал упал → тик всё равно успех» остался общим для всех каналов;
  новой машинерии проверок не добавлял (владелец не любит защитное дублирование), но и решения о том,
  делать ли его громким, в плане нет.
- **UPDATE-путь каденции остался реляционным** (`claimIncidentAlertIfDue`, `complete/release`,
  `resolveStaleCriticalAlertIncidents`, `markOpenIncidentsAlertSent`): он работает под выданными
  поколоночными грантами `app_worker` и в скоуп «дать двери на ОТКРЫТИЕ» не входит. Переносить его на
  корни — отдельная работа со своей приёмкой; трогать его «заодно» я не стал.
- **`.env.dev` главного дерева не знает новых возможностей.** `migrate-dev.sh --execute` дописал их в
  `.env.dev` ЭТОГО worktree; `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` остался прежним.
- **Расписания из первого раздела этого плана по-прежнему не мои** — установка расписаний меняет
  состояние хоста и вынесена владельцу.
