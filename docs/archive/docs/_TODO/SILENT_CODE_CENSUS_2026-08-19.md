# Перепись тихого кода — запись, абонементы, настройки (2026-08-19)

Источник задания: владелец, 19.08 — «пройти весь модуль записи, абонементов, всех настроек и посмотреть,
что не подключено к интерфейсу». Повод — `be_branches.timezone`: колонка в схеме, API принимает её на
создании/изменении филиала (`api/admin/booking-engine/branches/route.ts:20,55`, `[id]/route.ts:28,71`), поля
в интерфейсе нет вовсе, у всех филиалов держится подставленный по умолчанию `Europe/Moscow`.

Это документ-перепись, не план работ. Ничего не починено, карточки не заведены (по прямому запрету брифа).

## Числа

Всего находок тихого кода: **26** (включая исходный пример с `timezone`).

| Вид разрыва | Определение | Найдено |
|---|---|---|
| TYPE 1 | колонка/таблица пишется только миграцией/умолчанием, экран её не задаёт и не показывает | 9 |
| TYPE 2 | API-маршрут/серверное действие есть и подключено к БД, ни один экран его не зовёт | 13 |
| TYPE 3 | поле в интерфейсе есть, но значение теряется по дороге или пишется туда, что никто не читает | 1 |
| TYPE 4 | вся возможность реально работает, но включить её может только тот, кто ходит в Postgres руками | 3 |

По модулям: запись на приём — 11, абонементы и пакеты — 6, настройки (клиника — 3, платформа — 6) — 9.

Границы между TYPE 1/2/4 местами условны (пример: колонка, для которой API готов принять значение, но
UI-поля нет вовсе — по факту неотличимо от TYPE 1 «висит на дефолте», хотя причина ближе к TYPE 2 «звонить
некому»). Где это так, в таблице указано явно вторым типом через «/».

---

## 1. Запись на приём (booking) — 11 находок

| № | Что | Разрыв | Доказательство (что есть) | Доказательство (искал — не нашёл) | Последствие для человека |
|---|---|---|---|---|---|
| 1 | ~~`be_branches.timezone`~~ **ЗАКРЫТО 19.08** — поле выведено в интерфейс (правило §34, отчёт `docs/REPORTS/TIMEZONE_RULE_34_2026-08-19.md`) | TYPE 1 | Принимается API: `apps/webapp/src/app/api/admin/booking-engine/branches/route.ts:20,55`, `[id]/route.ts:28,71` | Поле не найдено ни в одном компоненте создания/редактирования филиала | У всех филиалов клиники московское время независимо от реального часового пояса — расписание и напоминания считаются неверно для регионов вне UTC+3 |
| 2 | `be_branches.shortTitle`, `be_branches.address` | TYPE 1 | API принимает на создании/изменении: `api/admin/booking-engine/branches/route.ts:16-17,20`, `[id]/route.ts:18-19,26` | `BookingEngineSection.tsx:189-217` (форма создания) — только title+city; `BookingEngineCatalogLists.tsx:120-260` (форма редактирования, оба layout) — только editTitle/editCity, поля нет | Клиника не может задать короткое название филиала для компактных списков и не может указать адрес — оба поля навсегда `null` |
| 3 | `be_specialist_service_availability.priceMinorOverride` (+ city/room scoping) | TYPE 1 | Полная Zod-схема принимает: `api/admin/booking-engine/availability/route.ts:14`; пишется в `infra/repos/pgBookingEngine.ts:1218,1237,1252` | `setServiceLocationAvailability` в `app/app/settings/bookingSoloAdminApi.ts:168-183` — POST всегда без `priceMinorOverride`; `BookingAvailabilityMatrixTable.tsx` (полное чтение) поле нигде не отображает | Клиника не может назначить одному специалисту цену услуги, отличную от базовой — экрана с этой возможностью нет вообще, даже посмотреть нельзя |
| 4 | `be_availability_rules` тип `buffer_minutes` (буфер между записями) | TYPE 2 | Сервис полностью рабочий: `modules/booking-scheduling/service.ts:236-249` (`upsertBufferMinutes`) → `infra/repos/pgBookingScheduling.ts:610-641`; активно читается при расчёте слотов (`service.ts:484`) | `grep -rn "upsertBufferMinutes" apps/webapp/src/app` → 0; `code-search.mjs "upsertBufferMinutes"` — только service/ports/repo/тесты, ни одного route.ts или .tsx | Клиника не может задать минимальный интервал между соседними записями специалиста — буфер навсегда 0 минут, хотя механика реально считается на каждый слот |
| 5 | `be_availability_rules` тип `max_chain_slots` | TYPE 1 | Значение разрешено CHECK-констрейнтом: `db/schema/bookingScheduling.ts:198-201` | `grep -rn "max_chain_slots\|maxChainSlots" apps/webapp/src` → 0 везде, кроме самого констрейнта | Ограничение на число подряд идущих слотов задумано в схеме, но нет ни читателя, ни писателя, ни экрана — сконфигурировать или хотя бы увидеть его нельзя никаким способом, включая ручную правку БД |
| 6 | `be_schedule_blocks` (блокировка времени специалиста/кабинета/филиала) | TYPE 2 | Полный сервис: `modules/booking-scheduling/service.ts:223-254` (`listScheduleBlocks`/`createScheduleBlock`/`deleteScheduleBlock`) → `infra/repos/pgBookingScheduling.ts:700-736` | `find apps/webapp/src/app/api/admin/booking-engine -iname "*schedule-block*"` → 0; `grep -rln "createScheduleBlock\|listScheduleBlocks"` в `app/**` → 0 (только модуль и тесты) | Персонал не может закрыть время специалиста/кабинета/филиала (отпуск, ремонт, разовая блокировка) ни с одного экрана — таблица гарантированно пустая в проде |
| 7 | `be_rooms` (создание нового кабинета) | TYPE 2 | Сервис рабочий: `modules/booking-engine/service.ts:309-311` (`upsertRoom`) → `infra/repos/pgBookingEngine.ts:960-982`; список читается в `api/admin/booking-engine/overview/route.ts:22` | `find apps/webapp/src/app/api/admin/booking-engine -iname "*room*"` → маршрута создания нет; `grep -rn "upsertRoom\b"` — только service+repo | Клиника, открывшая новый физический кабинет, не может завести его через интерфейс — только если кабинет был засеян миграцией |
| 8 | `be_specialist_rooms` (привязка специалиста к кабинету) | TYPE 3 | Форма существует: `app/app/settings/BookingEngineSection.tsx:439`, шлёт POST на `.../specialist-rooms` | `grep -rln "from '.*BookingEngineSection'"` → 0 (компонент нигде не импортируется — мёртвый); `find .../booking-engine -iname "*room*"` подтверждает, что и маршрута `.../specialist-rooms` нет | Единственная написанная форма привязки специалиста к кабинету не рендерится никогда и целится в несуществующий маршрут — привязку нельзя сделать вообще, только увидеть уже существующие строки в матрице |
| 9 | `be_booking_form_fields.visibleToStaff` | TYPE 1 | Принимается API: `api/admin/booking-engine/form-fields/route.ts:30`; активно фильтрует видимость для персонала: `infra/repos/pgBookingCalendar.ts:272` | `BookingFormFieldsSection.tsx` — `visibleToPatient` привязан к двум `Switch` (строки 206, 336), у `visibleToStaff` (37,50,95) контрола нет; `BookingSoloFormFieldsSection.tsx` жёстко шлёт `visibleToStaff: true` (79,135) без контрола | Клиника не может скрыть от персонала ответ на чувствительный вопрос анкеты записи — поле либо навсегда видимо, либо навсегда `true` в «соло»-потоке |
| 10 | `GET /api/doctor/appointments/list` (архив прошлых записей, пагинация) | TYPE 2 | Маршрут существует и делает полные запросы к БД: `api/doctor/appointments/list/route.ts:6` | `grep -rln "appointments/list"` вне route/теста → 0; по git — UI-экран (`DoctorAppointmentsListClient.tsx` и др.) удалён коммитом `c1c91b2ee`, маршрут оставлен; `ScheduleCalendarTab.tsx` (текущий календарь) без пагинации архива | Доктор больше не может листать историю прошлых записей — экран убрали, backend продолжает работать вхолостую |
| 11 | `POST .../appointments/[id]/manual-no-show` (отметить неявку) | TYPE 2 | Полная механика в БД: таблица `be_appointment_no_shows`, FSM `confirmed → no_show`, счётчик `no_show_count` на `be_patient_booking_profiles`, подавление уведомлений — см. `docs/BOOKING_REWORK_INITIATIVE/LOG.md` §«2026-06-14 — No-show handling» | `grep -rn "manual-no-show\|staffMarkNoShow"` в `.tsx` → 0 живых вызовов; не зарегистрирован в `protectedActionRegistry.ts` (в отличие от соседних `manual-cancel`/`manual-reschedule`) | У доктора/админа нет кнопки отметить неявку пациента нигде в продукте — **это осознанное решение владельца, зафиксированное в LOG**: «без явного подтверждения ничего из этого не реализовано». Не сюрприз, а известный открытый вопрос — см. секцию НЕ СДЕЛАНО |

### Работает без экрана — и это правильно
- `be_organizations.cabinetFirstEnteredAt` — ставится один раз SECURITY DEFINER функцией при первом входе в кабинет, чистая телеметрия.
- `be_appointments.deletedAt` — soft-delete от синка Rubitime, не ручной ввод.
- `be_appointments.attributionJson/.phoneNormalized/.chainId/.chainPosition/.originalStartAt/.rescheduleCount` — пишутся бизнес-логикой записи/переноса, не человеком напрямую.
- `be_payment_intents/payments/refunds/payment_provider_events/payment_history_events` — управляются вебхуками платёжного провайдера.
- `be_package_usages/package_history_events/appointment_history_events/patient_timeline_events` — append-only журналы от доменных сервисов.
- `GET /api/doctor/schedule-kpis`, `.../schedule/nearest-free-window` — реально вызываются из `ScheduleCalendarTab.tsx`, проверены и исключены как ложное срабатывание.
- Напоминания/уведомления модуля `booking-notifications` — драйвятся кроном, экран не нужен.
- `/api/integrator/appointments`, `/api/integrator/appointment-reminders` — интеграторские, не для человека.

---

## 2. Абонементы и пакеты (memberships) — 6 находок

| № | Что | Разрыв | Доказательство (что есть) | Доказательство (искал — не нашёл) | Последствие для человека |
|---|---|---|---|---|---|
| 1 | Самостоятельная покупка абонемента пациентом (`GET .../memberships/catalog` + `POST .../memberships/purchase` → `purchaseCatalogPackageForPatient`) | TYPE 2 | Маршруты и сервис полностью рабочие: `api/booking/memberships/catalog/route.ts:1-25`, `.../purchase/route.ts:1-53`, `modules/memberships/service.ts:502` | `grep -rln "memberships/purchase\|memberships/catalog"` в `app/app/**` → 0; проверены все 3 документированных потребителя (`PatientMembershipsSection.tsx` зовёт только `GET .../memberships` уже своих пакетов; `ConfirmStepClient.tsx:202` только `.../available`; `PatientPackagePayClient.tsx` только `.../payment-status` для уже выданного id) — ни один не открывает каталог для покупки | Пациент не может сам посмотреть каталог абонементов клиники и купить — абонемент может только вручную выдать сотрудник. Документация модуля (`memberships.md:61`) утверждает, что маршрут подключён к `PatientMembershipsSection` — это неверно |
| 2 | Отправка пациенту ссылки на онлайн-оплату пакета (`sendForPayment`/`activateImmediately`, статус `awaiting_payment`) | TYPE 2 | Ветка полностью рабочая, создаёт реальный payment intent: `modules/memberships/service.ts:240-259` (ручной пакет), `:287-312` (пакет из каталога); принимается API `api/doctor/booking-engine/patient-packages/route.ts:89,131-136` | `DoctorClientMembershipsPanel.tsx:216,219,261` — единственное место записи, оба флага жёстко зашиты (`activateImmediately: true`, `sendForPayment: false`), переключателя нет | Доктор/админ не может отправить пациенту ссылку на оплату индивидуального или каталожного пакета — каждый выданный пакет принудительно считается уже оплаченным сотрудником; вся логика `offered`/`awaiting_payment` и кнопка «Оплатить» в `PatientMembershipsSection.tsx:90-100` мертвы, потому что ни один реальный путь не может их породить |
| 3 | `be_subscription_packages.description` (описание шаблона пакета) | TYPE 1 | Принимается API: `api/doctor/booking-engine/packages/route.ts:19` (POST), `[id]/route.ts:20` (PATCH) | `grep -n "description"` в `ScheduleSetupTab.tsx` (единственный экран создания/редактирования шаблонов) → 0; в `PatientMembershipsSection.tsx`/`app/app/patient/memberships/*.tsx` → 0 | Админ не может написать описание пакета, а пациент не увидел бы его, даже если бы оно было — колонка навсегда `null` |
| 4 | `PATCH .../packages/[id]` — полное редактирование шаблона (title/price/items/validityDays/deductionMode) | TYPE 2 | Маршрут принимает полный набор полей: `api/doctor/booking-engine/packages/[id]/route.ts:22-70` | Единственный вызывающий — `ScheduleSetupTab.tsx:647` (`toggleActive()`), тело запроса только `{ isActive: !pkg.isActive }` (строки 644-658); других вызовов PATCH с прочими полями нет | Ошибку в цене или составе шаблона нельзя исправить на месте — только создать новый шаблон, оставив старый неправильный в списке |
| 5 | `validity_days`/`valid_until`/`deduction_mode` для **индивидуально назначенного** пакета | TYPE 1 | Принимается API: `manualSchema` в `api/doctor/booking-engine/patient-packages/route.ts:27-28`; соседняя форма шаблонов (`ScheduleSetupTab.tsx:553-556,772-792`) доказывает, что поле — рабочий, применяемый где-то ещё паттерн | `grep -n "deductionMode\|validityDays"` в `DoctorClientMembershipsPanel.tsx` (форма «Индивидуальный абонемент») → 0; тело `createManual()` (207-221) этих полей не шлёт | Разовый пакет, проданный конкретному пациенту, никогда не получает срок действия (`addValidity(now, null)` всегда возвращает `null` — пакет физически не может истечь) и не может быть переключён на ручное списание вместо автосписания по визиту |
| 6 | `patient_payment.visit_id` (привязка платежа к визиту) | TYPE 1 | Принимается API, задокументировано в шапке маршрута: `api/doctor/patients/[userId]/payments/route.ts:20-24,96` | `grep -n "visitId"` в `PatientTabFinances.tsx` (единственный экран записи платежа) → 0 (только поля «Услуга» и «Комментарий»); сам паттерн привязки к визиту реально работает в соседней вкладке `PatientTabFiles.tsx:685-734`, просто не применён здесь | При нескольких визитах пациента в один день/неделю нельзя указать, за какой именно визит внесена наличная/эквайринговая оплата — журнал платежей и финансовая отчётность по визитам не сходятся |

### Работает без экрана — и это правильно
- `api/payments/webhook/[provider]`, `api/payments/patient-acquiring-webhook/[provider]` — колбэки платёжного провайдера, активируют пакет после захвата платежа.
- `api/payments/saas-webhook/[provider]` + `saas_billing_provider_events` — журнал вебхуков SaaS-биллинга.
- `api/internal/saas-billing/renewal/tick` — крон продления биллинг-периода.
- Синк `package_linked`/`package_unlinked` в календарь — интеграторский, best-effort.
- `api/integrator/web-push/subscriptions/**` — не про абонементы, но тоже корректно без экрана.

---

## 3. Настройки — 9 находок

### 3.1 Клиника — 3 находки

| № | Что | Разрыв | Доказательство (что есть) | Доказательство (искал — не нашёл) | Последствие для человека |
|---|---|---|---|---|---|
| 1 | Политики отмены/переноса на уровне специалиста/услуги (`scopeLevel = 'specialist'/'service'`) | TYPE 2 | Схема, API и резолвер полностью поддерживают приоритет специалист/услуга > клиника: `db/schema/bookingPolicies.ts:18-19,43-157`; `modules/booking-policies/policyResolver.ts:12-57`; маршрут принимает произвольный `scopeEntityId`: `api/admin/booking-engine/policies/route.ts:14-52,71-149` | `withOrganizationDrafts()` в `app/app/settings/BookingPoliciesSection.tsx:56-92` создаёт черновик только для `scopeLevel === 'organization'` (61-64,76-79); для `specialist`/`service` форма (329, 423) не рендерится, когда строки ещё нет — единственный писатель этих таблиц во всём дереве и есть этот компонент | Клиника не может дать одному специалисту или одной услуге более строгую/мягкую политику отмены, чем клиника в целом (например «эта услуга невозвратна, остальное — гибко») — при этом сообщение в UI (`BookingPoliciesSection.tsx:579-583`) обманчиво намекает, что выбор специалиста/услуги позволяет создать политику: не позволяет |
| 2 | `be_cancellation_policies`/`be_reschedule_policies`: `title`, `isActive`, `requiresStaffConfirmation`, `chargePackageSessionOnLate`, `refundPrepaymentOnLate`, `sortOrder` | TYPE 1 | Принимаются и обязательны в Zod: `api/admin/booking-engine/policies/route.ts:10-32,34-52`; `requiresStaffConfirmation`/`chargePackageSessionOnLate` реально читаются движком допуска: `policyResolver.ts:64-142,154-159,262,272,281`, а `chargePackageSessionOnLate` — ещё и в `modules/booking-appointment-lifecycle/service.ts` | В `BookingPoliciesSection.tsx` все шесть идентификаторов встречаются только внутри исходящего payload `save()` (строки 184-194, 215-227) — ни один не привязан ни к одному `<Input>/<Switch>/<Select>`; для сравнения `notifyPatient`/`notifyStaff` там же имеют реальные `Switch` (397/408, 547/560) | Клиника не может переименовать политику из общего дефолта, не может деактивировать конкретную политику (именно по `isActive` резолвер и фильтрует, `policyResolver.ts:26`), не может потребовать подтверждения персонала перед отменой/переносом и не может включить списание пакетного визита при поздней отмене — все четыре реально участвуют в движке допуска и просто недостижимы |
| 3 | Роль участника клиники `'assistant'` (ассистент/ресепшн) | TYPE 4 | Значение разрешено CHECK-констрейнтом (`db/schema/bookingEngine.ts:266`) и типизировано в `modules/organization-membership/ports.ts:1-2`; downstream-код уже рассуждает про эту роль: `patient-visibility/ports.ts:11-18` | Единственное место присвоения — `modules/auth/devBypassClinicAdminWorkspaceReconciliation.ts:24,52` (dev-обход, недостижим в проде); формы приглашения ограничены `admin`/`doctor`: схема `ORGANIZATION_MEMBER_INVITE_ROLES` (`organizationMemberInvites.ts:15-16`), UI `TeamSection.tsx:366-369`, `ClinicMembersClient.tsx:324-327`; смены роли уже существующего участника нет вообще ни одним маршрутом | Клиника не может завести ограниченного сотрудника (например ресепшн) — роль полностью смоделирована в данных и коде, но ни одна форма её не выдаёт |

### 3.2 Платформа — 6 находок

| № | Что | Разрыв | Доказательство (что есть) | Доказательство (искал — не нашёл) | Последствие для человека |
|---|---|---|---|---|---|
| 1 | `admin_emails` (allowlist email для промоушена в admin через OTP) | TYPE 4 | Комментарий в реестре описывает намерение: `modules/system-settings/registry.ts:540` | Явно исключён из обеих таблиц доступных ключей: `api/admin/settings/route.ts` (`ADMIN_SCOPE_KEYS`/`DOCTOR_SCOPE_KEYS`), `api/platform/settings/route.ts` (`PLATFORM_GLOBAL_SETTINGS_API_KEYS`) — нет ключа нигде; код, который должен был бы его читать, реально сверяет только `env.PLATFORM_OWNER_IDENTITY` (`modules/auth/envRole.ts:68-77`) | Собственный комментарий в реестре обещает вторичный allowlist админов по email — ни задать, ни прочитать его нельзя никаким путём, кроме ручной вставки в БД, и даже тогда код его не читает |
| 2 | `auth_altcha_hmac_secret` (корневой секрет CAPTCHA для входа по паролю) | TYPE 4 | Реально читается и используется: `infra/repos/pgPasswordLoginProtection.ts:113-120` → `modules/auth/passwordAltcha.ts:79,123`; готова клиентская проекция-статус: `modules/system-settings/webPushVapidRuntime.ts:130-141` | Отсутствует в обеих таблицах доступных ключей API-настроек (`ADMIN_SCOPE_KEYS`, `PLATFORM_GLOBAL_SETTINGS_API_KEYS`); готовая проекция `{hasStoredSecret}` не рендерится ни одним `.tsx` | Единственный секрет из всего реестра без экрана настройки/ротации (для сравнения — `smtp_outbound`, `telegram_bot_token` в реестре рядом уже имеют путь): провизия и ротация — только прямой SQL |
| 3 | `smsc_enabled`/`smsc_api_key`/`smsc_base_url` (платформенный SMS-шлюз) | TYPE 2 | В списке доступных ключей общего PATCH `api/admin/settings/route.ts:155-157`; статус «настроено/нет» уже вычисляется: `configAdapter.ts:238-242`, отображается в `PlatformAuthChannelPolicySection.tsx` | `grep` каждого ключа по всем `.tsx` в `app/app` → 0; клиентский аналог для клиники (`clinic_smsc_api_key`) подключён к `ClinicDeliveryChannelsSection.tsx` — платформенная тройка такого поля не имеет | Оператор платформы видит значок «SMS-канал не настроен», но нет ни одной формы ввести ключ/URL/включить шлюз — только прямой вызов PATCH или правка БД |
| 4 | `telegram_bot_token`/`telegram_webhook_secret` | TYPE 2 | В списке доступных ключей: `route.ts:114-115`; реально читаются для проверки подписи входа: `modules/system-settings/integrationRuntime.ts:25-26`, `api/auth/telegram-login/route.ts` | `grep` по `.tsx` → 0; `AuthProvidersSection.tsx` показывает только `telegram_login_bot_username` (публичное имя), не токен/секрет | Оператор может назвать бота, но не может задать сам API-токен или webhook-секрет, без которых вход через Telegram не проверяется — только прямой PATCH/правка БД |
| 5 | `max_webhook_secret`/`max_api_base_url` (платформенные креды бота MAX) | TYPE 2 | В списке доступных ключей: `route.ts:111-112` | `grep` по `.tsx` → 0; `AuthProvidersSection.tsx` показывает только `max_bot_api_key` — двух других полей нет | Оператор может задать ключ MAX-бота, но не webhook-секрет и не базовый URL API, нужные для верификации входящих вебхуков — только прямой PATCH/правка БД |
| 6 | `operator_heartbeat_config` (пороги устаревания heartbeat-монитора платформы) | TYPE 2 | В списке доступных ключей: `route.ts:193`; реально обязателен для работы — при отсутствии/поломке строки бросает `runtime_setting_unavailable:operator_heartbeat_config` (`modules/operator-health/heartbeat.ts:66-83`), питает `SystemHealthSection.tsx` через `heartbeatReceiver.ts:61-68`, `deliveryHeartbeatObserver.ts:38-39` | `grep` по `.tsx` → 0; в миграциях сид-строки нет (`grep` по `drizzle-migrations/*.sql` → 0); соседний экран `OperatorHealthProbeSettingsSection.tsx` покрывает ключ `operator_health_probe_config`, но не этот | Собственный dead-man's-switch мониторинга платформы требует эту JSON-строку, чтобы не падать с ошибкой — ни сида, ни экрана нет, оператор не может ни настроить, ни даже понять, почему heartbeat красный, без похода в БД |

### Работает без экрана — и это правильно
- `staff_security_profiles` — персональный 2FA, подключён к `/app/app/account`, намеренно не организационная настройка.
- Модуль `org-branding` (`org_brand_revisions`) — полностью подключён к `OrgBrandingSection.tsx`/`brandingActions.ts`, publish-lifecycle сознательно не выведен в UI (см. `BRANDING_DOMAIN_CONTRACT.md`).
- `ManagedNotifPresentation.logoAssetId/.avatarAssetId` — типизированы `null`, документированы как «спящие до появления резолвера опубликованных ассетов брендинга».
- `ClinicDeliveryChannelsSection.tsx` — клиникин SMTP/SMS/Telegram/MAX уже полностью подключён (в отличие от платформенных близнецов выше).
- `modules/menu`, `modules/help-content` — статический контент/роутинг, не настройка.
- `modules/platform-access`, `modules/platform-analytics`, `modules/admin-platform-stats` — read-only дашборды, не настройка.
- Интеграторские read-only потребители `public.system_settings` (`apps/integrator/src/infra/db/publicSystemSettings.ts`) — по канону §4 (одна public-таблица, зеркала нет), UI на их стороне не нужен.

---

## Ранжирование

### Подключить в первую очередь (реальная потеря для живого человека, вероятно недорого)

1. **Тумблер отправки ссылки на оплату пакета** (memberships #2) — вся ветка `awaiting_payment`/«Оплатить» в пациентском кабинете уже построена и мертва только из-за двух жёстко зашитых значений в одной форме.
2. **Блокировка времени специалиста/кабинета/филиала** (booking #6) — базовая операционная потребность любой клиники (отпуск, ремонт), backend полностью готов.
3. **Нередактируемые флаги политики отмены/переноса** (settings-клиника #2) — `requiresStaffConfirmation`/`chargePackageSessionOnLate` реально участвуют в движке допуска, но задать их нельзя никогда.
4. **Добавление кабинета через UI** (booking #7) — без этого масштабирование клиники на новый кабинет физически требует миграции.
5. **Полное редактирование шаблона пакета** (memberships #4) — сейчас ошибку цены/состава нельзя исправить, только плодить новые шаблоны.
6. **Платформенные креды Telegram/SMSC/MAX** (settings-платформа #3-5) — блокируют реальное включение каналов новым операторам, путь один клик до готовности (общий PATCH уже есть, не хватает трёх полей формы).
7. **Персональная цена специалиста** (booking #3) — прямое влияние на монетизацию, сейчас нельзя даже увидеть, что механика существует.
8. **Буфer между записями** (booking #4) — реально учитывается в расчёте слотов, но недостижим.
9. **Срок действия индивидуального пакета** (memberships #5) — разовый пакет физически не может истечь.
10. **Политики по специалисту/услуге** (settings-клиника #1) — приоритетный резолвер готов, создать переопределение нельзя, а сообщение в UI вводит в заблуждение.

### Честнее удалить как мёртвое

- `BookingEngineSection.tsx` и его дети (`BookingEngineCatalogLists`, `BookingFormFieldsSection`, `BookingAvailabilityMatrixTable` — в части, дублирующей Solo-поток) — не импортируются нигде, вытеснены `BookingSolo*Section`; вместе с ними падает находка booking #8 (`be_specialist_rooms`), которая целится в несуществующий маршрут.
- `GET /api/doctor/appointments/list` (booking #10) — либо восстановить архив-экран, либо удалить маршрут; сейчас гоняет полные запросы к БД вхолостую.
- `GET /api/booking/catalog/cities`, `.../catalog/services`, `GET /api/booking/my` — заменены прямыми вызовами из RSC-страниц (коммит `172d57b93`), маршруты не удалены, тесты держат их зелёными.
- `POST .../package/refund`, `.../package/unlink` — по плану (`STAGE3_DECOMPOSITION.md:303`) сознательно оставлены deprecated-обёртками до 3.4, удалять не сейчас.
- `be_availability_rules` тип `max_chain_slots` (booking #5) — ни писателя, ни читателя, ни UI; чистый мёртвый enum.
- `ClinicMembersClient.tsx` — недостижим из-за безусловного `redirect()` в `page.tsx`.
- `AccessListsSection.tsx` — сам код и документация (`envRole.ts:7-15`) подтверждают: роль по этим ключам решением C-4 отключена, экран и путь записи не нужны вместе.
- `admin_emails` (settings-платформа #1) — либо реально подключить как второй allowlist, либо удалить как несбывшееся намерение; сейчас не работает ни с одной стороны (ни записи, ни чтения).
- `integration_test_ids` — вытеснен `test_account_identifiers`, ни экрана, ни читателя.

---

## НЕ СДЕЛАНО

- Не прошли column-by-column весь `apps/webapp/db/schema/schema.ts` (4026 строк, 212 таблиц/схема-файлов) вручную — агенты грепали по релевантным именам таблиц/модулей внутри своего среза; таблицы booking/memberships/settings, не всплывшие ни в одном грепе по ключевым словам, могли остаться незамеченными.
- Не проверялась мобильная/PWA-специфика интерфейса отдельно — весь обзор шёл по `apps/webapp/src/app/**`, общий для web/PWA.
- Не проверялся `apps/integrator/**` на предмет собственных настроек, отдельных от `public.system_settings` (только зафиксировано, что интегратор корректно read-only на этой таблице).
- Находка booking #11 (`manual-no-show`) — не новая проблема, а уже известный владельцу открытый вопрос (`docs/BOOKING_REWORK_INITIATIVE/LOG.md`, запись 2026-06-14); включена в перепись для полноты, но не требует нового решения от владельца, он уже видел этот пункт.
- Ранжирование в конце — рекомендация агентов-аудиторов, не решение владельца; ни один пункт не подключён и не удалён, карточки не заведены.
