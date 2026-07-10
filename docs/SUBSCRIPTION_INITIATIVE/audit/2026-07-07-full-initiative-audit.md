# Аудит инициативы абонементов #386 перед доработками

Дата прохода: 2026-07-07 07:12 MSK.
Задача: #522.
Источник замечаний: `/home/dev/dev-projects/.lead/runs/bcb-subscriptions-feedback-2026-07-07.md`.

Репозиторный путь `.lead/runs/bcb-subscriptions-feedback-2026-07-07.md`, указанный в задаче, отсутствует; реальный файл найден по абсолютному пути из #521.

## Что уже сделано и подтверждено кодом

- Модель абонементов существует: `be_subscription_packages`, `be_package_items`, `be_patient_packages`, `be_patient_package_items`, `be_package_usages`, `be_package_history_events` (`apps/webapp/db/schema/bookingMemberships.ts`).
- Баланс считается из append-only ledger, остаток не хранится напрямую (`apps/webapp/src/modules/memberships/balanceCalculator.ts`).
- В Финансах карточки клиента встроена `DoctorClientMembershipsPanel`, создание с датой и кнопка "Пересчитать" уже есть (`PatientTabFinances.tsx`, `DoctorClientMembershipsPanel.tsx`).
- Bulk-пересчёт реализован в `recalcPastSessionsForPackage`: окно от `soldAt`, canonical status, skip already debited, stop at zero, append-only consume/refund summary (`modules/memberships/service.ts`).
- Календарь помечает записи по абонементу фиолетовым стилем, префиксом `✅` и KPI-фильтром "По абонементу" (`ScheduleCalendarTab.tsx`).
- Карта визита имеет UI-бейдж "По абонементу" и тест, но найден риск в маппинге источника записи (см. #532).

## Подтверждённые хвосты из feedback

- #523 покрывает отсутствие человекочитаемого номера абонемента и формата `аб.#001`: в модели есть UUID, но нет `number/serial/code`; таб "Записи" сейчас получает только boolean `isPackage` и рендерит старый бейдж "абонемент".
- #524 покрывает таб "Записи": сейчас вычисляются все активные, но показывается только `activePackages[0]`; история = все не-active статусы, а не правило "исчерпан и все пункты привязаны к состоявшимся прошлым записям"; раскрытие истории пока простая строка.
- #525 покрывает отсутствие кнопки "глаз" и подсветки связанных записей: в `PatientTabRecords` нет состояния выбранного package id, а строка записи не несёт package id.
- #526 покрывает Обзор/Визиты: Обзор сейчас показывает KPI `N из total` + title-hint только по первому активному абонементу; нет текста "Осталось N визитов", списка `n x услуга`, `аб #NN от дата` и вывода нескольких абонементов.

## Новые подтверждённые задачи

- #531 `Абонементы: починить advisory-lock пересчёта и атомарность correction-pass`.
  `pgMemberships.runWithPackageLock` открывает `db.transaction`, но lock берётся через `db.execute`, а `fn` использует обычные port-методы через `getDrizzle()`. Это надо проверить/исправить так, чтобы lock реально держался на read-balance -> debit pass. Correction-pass сейчас делает refund, clear ref и history отдельными вызовами.
- #532 `Абонементы: бейдж визита через appointment_records -> be_appointments mapping`.
  `NewVisitPanel` сохраняет `clinical_visit.appointment_record_id = appointment_records.id`, а `pgPatientClinical` ищет это значение как `be_package_usages.appointment_id = be_appointments.id`.
- #533 `Абонементы: защитить penalty/manual_adjust от повторного списания записи`.
  Unique index защищает только `usage_kind='consume'`; повторный penalty без reserve может списать баланс повторно.
- #535 `Абонементы на глобальной странице Записи: бейдж аб.#NN и package-поля`.
  `/app/doctor/appointments` не несёт package-полей в `AppointmentRow` и не рендерит абонементный бейдж. Связать форматтер/номер с #523.
- #534 `Абонементы: добавить тесты и docs для сценариев #523-#526`.
  После UI-доработок нужны targeted tests на `аб.#NN`, несколько активных, closed-history, eye-highlight, тексты Обзора/Визитов и синхронизация `memberships.md`/инициативных docs.

## Итоговая карта

- Backend списания в целом есть, но требует hardening по #531 и #533.
- Связь с визитами требует исправления маппинга по #532.
- Финансы уже являются основной точкой управления абонементом.
- Календарь частично закрыт: фиолетовый marker есть, но формат номера зависит от #523.
- Карточка клиента и записи требуют UI-доработок по уже заведённым #523-#526.
- Глобальная страница записей вынесена в #535, чтобы не потерять трактовку "страница записей".
