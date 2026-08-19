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
