# Фаза 2: атомарные задачи (native booking)

Источник: `PLAN.md` (раздел «Фаза 2»), `BOOKING_MODULE_SPEC.md`, текущий код `integrator`/`webapp`, шаблон `DECOMPOSITION_MODEL.md`.

---

## Целевая структура модулей для Фазы 2

### Backend (по текущим конвенциям)

1. **Integrator (внешние интеграции и M2M):**
   - `apps/integrator/src/integrations/rubitime/` — API-клиент Rubitime и webhook ingress
   - `apps/integrator/src/integrations/google-calendar/` — Calendar sync
   - `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` — M2M маршруты от webapp
   - `apps/integrator/src/kernel/contracts/ports.ts` — контракты портов/типов
   - `apps/integrator/src/infra/adapters/*` — адаптеры вызовов webapp/integrator

2. **Webapp (продуктовый backend записи):**
   - `apps/webapp/src/modules/patient-booking/` — сервис и доменные порты booking
   - `apps/webapp/src/infra/repos/pgPatientBookings.ts` и `inMemoryPatientBookings.ts` — адаптеры хранилища
   - `apps/webapp/src/modules/integrator/bookingM2mApi.ts` — исходящие M2M вызовы в integrator
   - `apps/webapp/src/app/api/booking/*` — public API экрана записи (`slots/create/cancel/my`)
   - `apps/webapp/src/app-layer/di/buildAppDeps.ts` — wiring модулей/портов

### Frontend (по текущим конвенциям)

1. **Route/UI слой:**
   - `apps/webapp/src/app/app/patient/cabinet/page.tsx`
   - `apps/webapp/src/app/app/patient/cabinet/*.tsx` — компоненты экрана кабинета

2. **Модульный слой:**
   - `apps/webapp/src/modules/patient-booking/` — UI-facing use-cases и типы
   - `apps/webapp/src/modules/appointments/` — переиспользуемые форматтеры статусов/дат

---

## 2.A Backend (расписание, слоты, API, DB, синхронизация)

### Задача 2.A1: Контракты booking-модуля в webapp

**Цель:** Зафиксировать доменные порты и типы native booking, чтобы API и UI работали через единый контракт.

**Предусловия:**
- Фаза 0 завершена
- Существуют `buildAppDeps` и модульная структура `modules/*`

**Файлы для изменения:**
1. `apps/webapp/src/app-layer/di/buildAppDeps.ts` — подключить новый booking-сервис в DI

**Файлы для создания:**
1. `apps/webapp/src/modules/patient-booking/ports.ts` — порты чтения слотов, записи, отмены, списка
2. `apps/webapp/src/modules/patient-booking/types.ts` — DTO/enum (`bookingType`, `category`, `status`)
3. `apps/webapp/src/modules/patient-booking/service.ts` — фасад use-cases для route handlers
4. `apps/webapp/src/modules/patient-booking/patient-booking.md` — краткая документация модуля

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Описать строгие типы запроса/ответа для `slots/create/cancel/my`.
- Выделить порты: `BookingSlotsPort`, `PatientBookingsPort`, `BookingSyncPort`.
- В `service.ts` зафиксировать операции: `getSlots`, `createBooking`, `cancelBooking`, `listMyBookings`.
- Подключить сервис в `buildAppDeps` рядом с `patientCabinet`/`appointmentProjection`.

**Тесты:**
- [ ] Юнит: валидация входных параметров `service.ts` (ошибки на некорректных `type/city/date`)
- [ ] Юнит: контракт `createBooking` возвращает доменный статус/ошибку без утечки infra-деталей

**Критерии готовности:**
- [ ] В DI доступен `deps.patientBooking`
- [ ] Все booking-операции типизированы единообразно
- [ ] `pnpm run ci` зелёный

### Задача 2.A2: M2M API слотов в integrator + расширение Rubitime client

**Цель:** Дать webapp защищенный endpoint для получения доступных слотов из Rubitime через integrator.

**Предусловия:**
- Задача 2.A1 выполнена
- Существуют `recordM2mRoute.ts` и HMAC-подпись M2M

**Файлы для изменения:**
1. `apps/integrator/src/integrations/rubitime/client.ts` — добавить метод получения слотов (API2/доступный аналог)
2. `apps/integrator/src/integrations/rubitime/schema.ts` — добавить Zod-схему ответа слотов
3. `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` — добавить `POST /api/bersoncare/rubitime/slots`
4. `apps/integrator/src/app/routes.ts` — убедиться, что новый маршрут регистрируется текущим bootstrap

**Файлы для создания:**
- Нет

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Расширить `client.ts` отдельной функцией `fetchRubitimeSlots(...)` с единым envelope/error handling.
- В `schema.ts` добавить валидацию массива слотов и нормализацию дат в ISO.
- В M2M route повторить существующий guard: `x-bersoncare-timestamp/signature`, window, secret.
- Вернуть унифицированный payload без Rubitime-специфичных полей (чтобы webapp не зависел от формата Rubitime).

**Тесты:**
- [ ] Юнит: schema parsing успешного/битого ответа Rubitime
- [ ] Интеграционный: route `/api/bersoncare/rubitime/slots` отклоняет запрос без валидной подписи

**Критерии готовности:**
- [ ] Integrator отдает слоты по защищенному M2M endpoint
- [ ] Ошибки Rubitime маппятся в предсказуемые коды/сообщения
- [ ] `pnpm run ci` зелёный

### Задача 2.A3: Адаптер вызова integrator slots API в webapp

**Цель:** Подключить webapp к M2M endpoint integrator для загрузки слотов.

**Предусловия:**
- Задача 2.A2 выполнена
- В webapp настроены `INTEGRATOR_API_URL` и секрет

**Файлы для изменения:**
1. `apps/webapp/src/config/env.ts` — добавить/проверить env-ключи для booking M2M
2. `apps/webapp/src/modules/patient-booking/service.ts` — подключить порт синхронизации слотов

**Файлы для создания:**
1. `apps/webapp/src/modules/integrator/bookingM2mApi.ts` — HMAC-клиент к `/api/bersoncare/rubitime/slots`

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Реализовать подпись по текущему стандарту (`timestamp.payload`) как в reminders/integrator API.
- Сконвертировать ответ integrator в доменный формат `BookingSlotsByDate`.
- Добавить graceful fallback (контролируемая ошибка сервиса, без падения SSR-страницы).

**Тесты:**
- [ ] Юнит: генерация подписи и canonical body для booking M2M
- [ ] Юнит: корректный маппинг ответа integrator в доменный формат слотов

**Критерии готовности:**
- [ ] Webapp получает слоты только через integrator M2M
- [ ] Нет прямых вызовов Rubitime из webapp
- [ ] `pnpm run ci` зелёный

### Задача 2.A4: Хранилище booking в webapp DB (patient_bookings)

**Цель:** Создать локальную таблицу и порт чтения/записи записей пациента для быстрого доступа и статусов.

**Предусловия:**
- Задача 2.A1 выполнена
- Миграционный pipeline webapp уже используется

**Файлы для изменения:**
1. `apps/webapp/src/app-layer/di/buildAppDeps.ts` — подключить PG/InMemory реализацию `PatientBookingsPort`

**Файлы для создания:**
1. `apps/webapp/src/infra/repos/pgPatientBookings.ts` — SQL-реализация портов `create/update/cancel/listByUser`
2. `apps/webapp/src/infra/repos/inMemoryPatientBookings.ts` — fallback-реализация для режима без БД
3. `apps/webapp/src/infra/db/migrations/<timestamp>_patient_bookings.sql` — таблица `patient_bookings` + индексы

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Добавить таблицу с колонками из спеки: пользователь, тип/категория/город, интервалы, статус, внешние ids (`rubitime`, `gcal`), snapshot контактов, флаги напоминаний.
- Сделать индексы: `user_id`, `status`, `slot_start`, `rubitime_id`.
- В repo выделить методы: `insertPending`, `markConfirmed`, `markCancelled`, `listUpcomingByUser`, `listHistoryByUser`.
- Сохранить идемпотентность обновлений по `rubitime_id`.

**Тесты:**
- [ ] Repo test: insert/update/cancel и выборки upcoming/history
- [ ] Migration smoke: таблица и индексы создаются/откатываются корректно

**Критерии готовности:**
- [ ] В webapp есть отдельное хранилище `patient_bookings`
- [ ] Чтение кабинета не зависит от live-запроса в Rubitime
- [ ] `pnpm run ci` зелёный

### Задача 2.A5: Endpoint `GET /api/booking/slots`

**Цель:** Отдать фронтенду доступные слоты по фильтрам type/city/category/date в контракте Фазы 2.

**Предусловия:**
- Задачи 2.A1, 2.A3 выполнены

**Файлы для изменения:**
1. `apps/webapp/src/modules/patient-booking/service.ts` — реализовать use-case получения слотов

**Файлы для создания:**
1. `apps/webapp/src/app/api/booking/slots/route.ts` — route handler c auth + query validation
2. `apps/webapp/src/app/api/booking/slots/route.test.ts` — тесты API контракта

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Реализовать GET route для patient-сессии.
- Валидировать query параметры (`type`, `city`, `category`, `date`).
- Делегировать в `deps.patientBooking.getSlots`.
- Возвращать `ok + slots[]` строго в формате спецификации.

**Тесты:**
- [ ] API test: корректный ответ для валидного запроса
- [ ] API test: 400 при невалидных query параметрах

**Критерии готовности:**
- [ ] Endpoint `/api/booking/slots` работает по контракту спеки
- [ ] Только авторизованный пациент получает слоты
- [ ] `pnpm run ci` зелёный

### Задача 2.A6: Endpoint `POST /api/booking/create`

**Цель:** Реализовать создание записи с локальным сохранением в webapp и синхронизацией в Rubitime.

**Предусловия:**
- Задачи 2.A3, 2.A4 выполнены

**Файлы для изменения:**
1. `apps/webapp/src/modules/patient-booking/service.ts` — create flow (validate -> persist -> sync)
2. `apps/webapp/src/modules/integrator/bookingM2mApi.ts` — добавить вызов create-record в integrator

**Файлы для создания:**
1. `apps/webapp/src/app/api/booking/create/route.ts` — route handler
2. `apps/webapp/src/app/api/booking/create/route.test.ts` — API тесты

**Файлы для удаления:**
- Нет

**Детальное описание:**
- На входе валидировать slot/contact payload.
- Сохранить запись в `patient_bookings` в статусе pending/creating.
- Вызвать integrator M2M create-record (новый endpoint в integrator).
- По результату сохранить `rubitime_id`, статус `confirmed`, вернуть DTO для UI.
- На ошибке внешней синхронизации перевести запись в `failed_sync` (или доменно согласованный статус).

**Тесты:**
- [ ] API test: успешное создание записи возвращает `booking.id` и `status=confirmed`
- [ ] API test: ошибка integrator -> запись остается в контролируемом failed-state

**Критерии готовности:**
- [ ] Создание записи доступно через `POST /api/booking/create`
- [ ] Локальная запись и Rubitime синхронизируются в одной транзакционной логике
- [ ] `pnpm run ci` зелёный

### Задача 2.A7: Endpoint `POST /api/booking/cancel` + webhook reconciliation

**Цель:** Реализовать отмену/перенос с синхронизацией Rubitime и обновлением локальной записи по webhook.

**Предусловия:**
- Задача 2.A6 выполнена
- Существуют `webhook.ts` и `connector.ts` в integrator

**Файлы для изменения:**
1. `apps/webapp/src/modules/patient-booking/service.ts` — cancel/reschedule flow
2. `apps/integrator/src/integrations/rubitime/client.ts` — убедиться в поддержке remove/update сценариев переноса
3. `apps/integrator/src/integrations/rubitime/connector.ts` — нормализация статусов для reconciliation
4. `apps/integrator/src/integrations/rubitime/webhook.ts` — отправка событий обновления статуса в webapp

**Файлы для создания:**
1. `apps/webapp/src/app/api/booking/cancel/route.ts` — API отмены
2. `apps/webapp/src/app/api/booking/cancel/route.test.ts` — тесты API
3. `apps/webapp/src/app/api/booking/my/route.ts` — API списка записей текущего пациента

**Файлы для удаления:**
- Нет

**Детальное описание:**
- В `cancel` route проверять владение записью текущим patient user.
- В service: `update local status -> M2M remove/update -> reconcile`.
- В integrator webhook path дополнительно отправлять status update в webapp (через существующий projection event pipeline).
- В `my` route вернуть upcoming/history в формате фронтенда.

**Тесты:**
- [ ] API test: пациент не может отменять чужую запись
- [ ] Integration test: webhook update меняет локальный статус записи

**Критерии готовности:**
- [ ] Отмена/перенос доступны через API webapp
- [ ] Статусы в webapp выравниваются webhook-событиями Rubitime
- [ ] `pnpm run ci` зелёный

---

## 2.B Frontend (экран записи, календарь, форма, карточки)

### Задача 2.B1: Новый каркас кабинета пациента под native booking

**Цель:** Перестроить `/app/patient/cabinet` под сценарий native booking вместо ссылки на iframe.

**Предусловия:**
- Задача 2.A1 выполнена
- Существуют `AppShell` и `patient` route guards

**Файлы для изменения:**
1. `apps/webapp/src/app/app/patient/cabinet/page.tsx` — заменить layout секций

**Файлы для создания:**
1. `apps/webapp/src/app/app/patient/cabinet/CabinetActiveBookings.tsx` — блок «Активные записи»
2. `apps/webapp/src/app/app/patient/cabinet/CabinetInfoLinks.tsx` — «Адрес/Подготовка/Стоимость»
3. `apps/webapp/src/app/app/patient/cabinet/CabinetBookingEntry.tsx` — CTA «Записаться»

**Файлы для удаления:**
- Нет

**Детальное описание:**
- На странице сохранить доступ для гостя (`CabinetGuestAccess`), но для авторизованного пациента отрисовывать новый состав секций.
- Заменить старую ссылку на `routePaths.patientBooking` кнопкой открытия нативного блока записи.
- Подключить `deps.patientBooking` для данных будущих/прошедших записей.

**Тесты:**
- [ ] RSC test: страница рендерит новый каркас блоков для patient session
- [ ] UI test: для гостя остается корректный fallback `CabinetGuestAccess`

**Критерии готовности:**
- [ ] В кабинете нет зависимости от iframe страницы
- [ ] Отображаются активные записи + инфо-ссылки + блок запуска записи
- [ ] `pnpm run ci` зелёный

### Задача 2.B2: Компонент выбора категории/формата записи (2x2 grid)

**Цель:** Реализовать интерактивный выбор типа приема и категории (очный/онлайн, Москва/СПб, ЛФК/нутрициология).

**Предусловия:**
- Задача 2.B1 выполнена

**Файлы для изменения:**
1. `apps/webapp/src/app/app/patient/cabinet/CabinetBookingEntry.tsx` — добавить раскрывающийся выбор

**Файлы для создания:**
1. `apps/webapp/src/app/app/patient/cabinet/BookingCategoryGrid.tsx` — 2x2 grid селектор
2. `apps/webapp/src/app/app/patient/cabinet/useBookingSelection.ts` — локальная state-машина выбора

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Сверстать grid с вариантами из спецификации.
- Реализовать единый selection-state (`type/city/category`) и события перехода.
- Пробросить выбранный контекст в шаг календаря.

**Тесты:**
- [ ] Компонентный тест: выбор опций меняет state и подсветку
- [ ] Компонентный тест: недопустимые комбинации (например city для online) не отправляются

**Критерии готовности:**
- [ ] Пользователь может выбрать формат и категорию в одном блоке
- [ ] Выбор передается на шаг календаря без ручного ввода
- [ ] `pnpm run ci` зелёный

### Задача 2.B3: Календарь доступных дней + загрузка слотов

**Цель:** Отрисовать календарь с подсветкой доступных дат и загрузкой слотов через `/api/booking/slots`.

**Предусловия:**
- Задача 2.A5 выполнена
- Задача 2.B2 выполнена

**Файлы для изменения:**
1. `apps/webapp/src/app/app/patient/cabinet/CabinetBookingEntry.tsx` — интеграция шага календаря

**Файлы для создания:**
1. `apps/webapp/src/app/app/patient/cabinet/BookingCalendar.tsx` — календарный компонент
2. `apps/webapp/src/app/app/patient/cabinet/useBookingSlots.ts` — клиентский fetch-хук слотов

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Показывать месяц, доступные/недоступные дни, выбранную дату.
- Загружать слоты после выбора `type/city/category` и/или даты.
- Обработать loading/error/empty states.

**Тесты:**
- [ ] Компонентный тест: доступные дни подсвечиваются по данным API
- [ ] Компонентный тест: при ошибке API показывается retry-состояние

**Критерии готовности:**
- [ ] Календарь показывает реальные доступные дни
- [ ] Слоты обновляются при смене даты/категории
- [ ] `pnpm run ci` зелёный

### Задача 2.B4: Список тайм-слотов и выбор времени

**Цель:** Дать пользователю понятный выбор времени и переход к подтверждению.

**Предусловия:**
- Задача 2.B3 выполнена

**Файлы для изменения:**
1. `apps/webapp/src/app/app/patient/cabinet/CabinetBookingEntry.tsx` — связать выбранный слот с формой

**Файлы для создания:**
1. `apps/webapp/src/app/app/patient/cabinet/BookingSlotList.tsx` — список кнопок времени

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Отобразить тайм-слоты выбранного дня как набор action-кнопок.
- Ввести состояние selected slot с блокировкой продолжения без выбора.
- Подготовить данные слота в формате для `POST /api/booking/create`.

**Тесты:**
- [ ] Компонентный тест: выбранный слот визуально активен, остальные неактивны
- [ ] Компонентный тест: кнопка подтверждения недоступна без слота

**Критерии готовности:**
- [ ] Пользователь выбирает конкретное время из доступных
- [ ] Выбранный слот корректно передается в форму подтверждения
- [ ] `pnpm run ci` зелёный

### Задача 2.B5: Форма подтверждения записи (prefill из профиля)

**Цель:** Добавить форму контактов с автозаполнением и отправкой create-запроса.

**Предусловия:**
- Задача 2.A6 выполнена
- Задача 2.B4 выполнена

**Файлы для изменения:**
1. `apps/webapp/src/app/app/patient/cabinet/page.tsx` — передать данные профиля в форму

**Файлы для создания:**
1. `apps/webapp/src/app/app/patient/cabinet/BookingConfirmationForm.tsx` — форма имени/телефона/email
2. `apps/webapp/src/app/app/patient/cabinet/useCreateBooking.ts` — submit-хук с optimistic state

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Предзаполнить name/phone/email из user profile/session.
- Провалидировать контакты до отправки.
- На submit вызвать `POST /api/booking/create`, показать success/failure toast/state.

**Тесты:**
- [ ] Компонентный тест: prefill данных из профиля
- [ ] Компонентный тест: форма не отправляется при невалидном телефоне

**Критерии готовности:**
- [ ] Пользователь не вводит телефон повторно при наличии в профиле
- [ ] Создание записи запускается из формы без перехода в iframe
- [ ] `pnpm run ci` зелёный

### Задача 2.B6: Карточки активных записей с действиями «Отменить/Перенести»

**Цель:** Отображать актуальные записи и позволить управлять ими из карточки.

**Предусловия:**
- Задача 2.A7 выполнена
- Задача 2.B1 выполнена

**Файлы для изменения:**
1. `apps/webapp/src/app/app/patient/cabinet/CabinetActiveBookings.tsx` — добавить action buttons и статусы

**Файлы для создания:**
1. `apps/webapp/src/app/app/patient/cabinet/BookingCardActions.tsx` — отмена/перенос + confirm dialog
2. `apps/webapp/src/app/app/patient/cabinet/useCancelBooking.ts` — вызов `POST /api/booking/cancel`

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Для каждой активной карточки показывать статус, дату/время, тип, город.
- Добавить кнопки отмены/переноса с подтверждением.
- После успешного действия обновлять список записей и показывать результат в UI.

**Тесты:**
- [ ] Компонентный тест: cancel action вызывает API с правильным `bookingId`
- [ ] Компонентный тест: после отмены карточка меняет статус без full reload

**Критерии готовности:**
- [ ] Отмена/перенос доступны из карточки записи
- [ ] Статус карточки синхронен с API ответом
- [ ] `pnpm run ci` зелёный

### Задача 2.B7: Журнал прошедших приемов (accordion/link)

**Цель:** Перенести историю записей в отдельный нижний блок с чистым UX.

**Предусловия:**
- Задача 2.B1 выполнена
- Доступен `GET /api/booking/my`

**Файлы для изменения:**
1. `apps/webapp/src/app/app/patient/cabinet/page.tsx` — заменить таблицу истории на компактный блок

**Файлы для создания:**
1. `apps/webapp/src/app/app/patient/cabinet/CabinetPastBookings.tsx` — accordion/list прошедших записей

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Убрать текущую таблицу history и заменить на аккордеон/кликабельный блок.
- Сохранить бейджи статусов и формат дат.
- Добавить пустое состояние, если истории нет.

**Тесты:**
- [ ] Компонентный тест: блок сворачивается/разворачивается
- [ ] Компонентный тест: пустая история отображается корректным текстом

**Критерии готовности:**
- [ ] История приемов вынесена в нижний компактный блок
- [ ] Визуальная структура экрана соответствует спецификации Фазы 2
- [ ] `pnpm run ci` зелёный

---

## 2.C Интеграция (уведомления, напоминания, Google Calendar)

### Задача 2.C1: События booking.created/cancelled в интеграционном контуре

**Цель:** Ввести явные события записи для уведомлений пациента/врача и последующего планирования напоминаний.

**Предусловия:**
- Задача 2.A6 выполнена
- Существуют `webappEventsPort` и event pipeline в integrator

**Файлы для изменения:**
1. `apps/integrator/src/kernel/contracts/ports.ts` — расширить контракт событий booking
2. `apps/integrator/src/kernel/domain/executor/handlers/booking.ts` — обработка новых action/event типов
3. `apps/webapp/src/modules/integrator/bookingM2mApi.ts` — отправка интеграционных событий после create/cancel

**Файлы для создания:**
- Нет

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Формализовать payload `booking.created`/`booking.cancelled` (user, slot, contact, type, city).
- На стороне integrator подготовить обработку этих событий для маршрутизации уведомлений.
- Обеспечить idempotency key для повторных доставок.

**Тесты:**
- [ ] Юнит: event payload валидируется и не теряет обязательные поля
- [ ] Юнит: повторная отправка с тем же idempotency key не создает дублей

**Критерии готовности:**
- [ ] Есть единый событийный контракт booking для webapp↔integrator
- [ ] События пригодны для нотификаций и напоминаний
- [ ] `pnpm run ci` зелёный

### Задача 2.C2: Уведомление пациента через Telegram/MAX при создании записи

**Цель:** Подтверждать запись в привычном канале (Telegram/MAX) вместо SMS.

**Предусловия:**
- Задача 2.C1 выполнена
- Работает `deliveryTargets` для пользователя

**Файлы для изменения:**
1. `apps/integrator/src/kernel/orchestrator/index.ts` — добавить маршрут сценария для booking created
2. `apps/integrator/src/kernel/domain/usecases/notifications.ts` — шаблон и отправка подтверждения
3. `apps/integrator/src/infra/adapters/deliveryTargetsPort.ts` — убедиться, что booking flow использует linked channels

**Файлы для создания:**
- Нет

**Файлы для удаления:**
- Нет

**Детальное описание:**
- На событие `booking.created` собрать текст из шаблона (`дата/время/тип/город`).
- Выбрать канал доставки через существующий `deliveryTargetsPort`.
- Логировать попытки доставки и fallback, не блокируя основной create flow.

**Тесты:**
- [ ] Юнит: формат текста уведомления пациента соответствует шаблону
- [ ] Интеграционный: при наличии telegram/max bindings уведомление уходит в доступный канал

**Критерии готовности:**
- [ ] После создания записи пациент получает сообщение в боте
- [ ] SMS не используется как primary канал для этого сценария
- [ ] `pnpm run ci` зелёный

### Задача 2.C3: Напоминания за 24ч и 2ч

**Цель:** Автоматически планировать и отправлять напоминания о записи через worker.

**Предусловия:**
- Задача 2.C2 выполнена
- Работает runtime worker и job queue

**Файлы для изменения:**
1. `apps/integrator/src/infra/db/writePort.ts` — постановка reminder jobs при booking.created
2. `apps/integrator/src/infra/runtime/worker/main.ts` — убедиться в обработке новых job kind
3. `apps/integrator/src/kernel/domain/usecases/notifications.ts` — шаблоны 24ч/2ч

**Файлы для создания:**
1. `apps/integrator/src/infra/runtime/worker/bookingReminders.ts` — обработчик reminder jobs

**Файлы для удаления:**
- Нет

**Детальное описание:**
- На create планировать две отложенные задачи: `slotStart - 24h` и `slotStart - 2h`.
- На cancel/reschedule пересчитывать/отменять pending jobs.
- Отправлять напоминания через тот же канал, что и подтверждение, с fallback по существующей политике доставки.

**Тесты:**
- [ ] Юнит: расчет времени постановки job на 24ч и 2ч
- [ ] Интеграционный: cancel/reschedule удаляет или пересоздает reminder jobs

**Критерии готовности:**
- [ ] Напоминания отправляются автоматически за 24ч и 2ч
- [ ] При отмене записи напоминания не уходят
- [ ] `pnpm run ci` зелёный

### Задача 2.C4: Уведомление врача о новой/отмененной записи

**Цель:** Уведомлять врача о новых и отмененных записях в рабочем канале.

**Предусловия:**
- Задача 2.C1 выполнена

**Файлы для изменения:**
1. `apps/integrator/src/kernel/domain/usecases/notifications.ts` — шаблоны уведомлений врача
2. `apps/integrator/src/kernel/orchestrator/index.ts` — маршрутизация doctor-notify intents
3. `apps/webapp/src/app/app/doctor/appointments/page.tsx` — (опционально) обновление/индикатор в UI врача

**Файлы для создания:**
- Нет

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Сформировать отдельный шаблон для врача: имя пациента, дата/время, тип.
- Отправить в админский канал/чат по текущей policy (Telegram/MAX/webapp-notification).
- Для webapp doctor UI добавить мягкий индикатор нового события (если выбран web канал).

**Тесты:**
- [ ] Юнит: событие `booking.created` формирует корректный doctor message
- [ ] Юнит: событие `booking.cancelled` формирует уведомление об отмене

**Критерии готовности:**
- [ ] Врач получает уведомления о новых и отмененных записях
- [ ] Формат уведомлений соответствует спецификации
- [ ] `pnpm run ci` зелёный

### Задача 2.C5: Надежная синхронизация с Google Calendar (persistent mapping)

**Цель:** Сделать Google Calendar sync устойчивым к рестартам (без in-memory map).

**Предусловия:**
- Задача 2.A6 выполнена
- Текущая интеграция `integrations/google-calendar/sync.ts` включена

**Файлы для изменения:**
1. `apps/integrator/src/integrations/google-calendar/sync.ts` — убрать in-memory map, читать/писать persistent mapping
2. `apps/integrator/src/integrations/rubitime/connector.ts` — передавать нужный payload для upsert/delete Calendar event
3. `apps/integrator/src/infra/db/writePort.ts` — сохранять `gcal_event_id` при успехе sync

**Файлы для создания:**
1. `apps/integrator/src/infra/db/repos/bookingCalendarMap.ts` — repo связи `rubitime_record_id -> gcal_event_id`
2. `apps/integrator/src/integrations/telegram/db/migrations/<timestamp>_booking_calendar_map.sql` — миграция таблицы связи

**Файлы для удаления:**
- Нет

**Детальное описание:**
- Вынести хранение соответствия Rubitime↔Google event в БД.
- Для created/updated: upsert event и сохранение `gcal_event_id`.
- Для cancelled: delete event по mapping и очистка связи.
- Сохранить optional режим: если Calendar не настроен, booking flow не ломается.

**Тесты:**
- [ ] Repo test: CRUD для `bookingCalendarMap`
- [ ] Интеграционный: create/update/cancel корректно управляют Google event и mapping

**Критерии готовности:**
- [ ] Sync с Google Calendar не зависит от памяти процесса
- [ ] Создание/отмена записи отражаются в календаре стабильно
- [ ] `pnpm run ci` зелёный

### Задача 2.C6: Вывод iframe Rubitime из продукта

**Цель:** Полностью убрать пользовательский сценарий через `/app/patient/booking` и перевести entrypoint в новый кабинет.

**Предусловия:**
- Задачи 2.B1–2.B7 выполнены
- Задачи 2.A5–2.A7 выполнены

**Файлы для изменения:**
1. `apps/webapp/src/app-layer/routes/paths.ts` — удалить `patientBooking` из активной навигационной модели
2. `apps/webapp/src/app/app/patient/cabinet/page.tsx` — убрать любые переходы на iframe route
3. `apps/webapp/src/app/app/patient/booking/page.tsx` — заменить на redirect в `/app/patient/cabinet` или info-страницу миграции
4. `apps/integrator/src/integrations/telegram/*` — обновить deep-link «Записаться» на новый URL кабинета

**Файлы для создания:**
- Нет

**Файлы для удаления:**
- `apps/webapp/src/app/app/patient/booking/page.tsx` — если выбран вариант полного удаления маршрута

**Детальное описание:**
- Убрать кнопку/линк на iframe из UI и навигации.
- Обновить bot button/deep-link на путь нового нативного кабинета.
- Сохранить обратную совместимость для старых ссылок через redirect.

**Тесты:**
- [ ] E2E: путь «Записаться» из кабинета и из бота открывает нативный сценарий
- [ ] Route test: старый `/app/patient/booking` не показывает iframe и не ломает пользовательский flow

**Критерии готовности:**
- [ ] Iframe Rubitime больше не используется в пользовательском интерфейсе
- [ ] Все точки входа ведут в native booking flow
- [ ] `pnpm run ci` зелёный

---

## Общие критерии готовности Фазы 2 (агрегировано)

- [ ] Пациент записывается через native UI без повторного ввода телефона
- [ ] Данные записи синхронизируются в Rubitime и локальном webapp-хранилище
- [ ] Подтверждения и напоминания приходят через Telegram/MAX
- [ ] Врач получает уведомления о новых/отмененных записях
- [ ] Google Calendar sync работает в persistent режиме
- [ ] `pnpm run ci` зелёный
