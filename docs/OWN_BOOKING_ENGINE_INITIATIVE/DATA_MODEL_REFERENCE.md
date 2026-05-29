# DATA_MODEL_REFERENCE — справочник канонических сущностей (ориентир)

Это **ориентир** для проектирования, а не финальный DDL. Финальные таблицы/колонки/индексы проектирует агент-исполнитель этапа в Drizzle (`apps/webapp/db/schema/*.ts`) с миграциями. Источник требований — [`SOURCE_SPEC.md`](SOURCE_SPEC.md) §21. Архитектурные правила — [`MASTER_PLAN.md`](MASTER_PLAN.md) §3.

## Общие соглашения
- **Tenant:** каждая доменная таблица несёт `organization_id` (C1). Запросы фильтруются по tenant.
- **Деньги:** `amountMinor: integer` + `currency: text` (как в `courses`).
- **Время:** UTC в БД; бизнес-таймзона — из `system_settings` (IANA).
- **Полиморфные ссылки:** без FK в БД (валидация в service) — напр. `linked_object_type`/`linked_object_id`, `item_ref_id`.
- **История:** append-only `*_event`-таблицы; текущее состояние допустимо денормализовать как кэш, но истина — события.
- **Внешние ID (Rubitime/GCal):** в отдельных bridge-колонках/таблицах, не в каноне.

## Организационные (этап 1)
- **organization** (clinic) — tenant-контейнер.
- **branch** (location) — город/адрес/точка; принадлежит организации; **не** держит услуги.
- **room** — кабинет в филиале.
- **specialist** — специалист организации.
- **specialist_location** — связь специалист×филиал.
- **specialist_room** — связь специалист×кабинет.
- **service** — общая услуга клиники (длительность, цена, описание, активность, флаги: prepayment_applicable, usable_in_packages, online_payment_applicable, public_widget_visible).
- **specialist_service_availability** — доступность услуги: уровни специалист / +филиал / +кабинет / +город.
- **service_location_availability** — услуга×локация (фильтр «город → услуги»).

## Записи и расписание (этапы 1, 2, 4, 8)
- **appointment** → `be_appointments` — каноническая запись (organization, branch, room, specialist, service, patient, start_at, end_at, duration, source, status, original_start_at, reschedule_count, payment_ref?, package_usage_ref?).
- **appointment_status** — enum (ТЗ §17); переходы — `appointmentStatusFsm.ts`.
- **appointment_event** → `be_appointment_events`, `be_appointment_history_events` — append-only история записи.
- **appointment_reschedule** → `be_appointment_reschedules` (этап 4, миграция `0091`) — from/to, актор, free-window flags, `applied_policy_snapshot`, `notifications_sent` (JSON), `manual_override`.
- **appointment_cancellation** → `be_appointment_cancellations` — тип отмены, штраф/возврат/списание (флаги; фактические деньги — этап 5), `notifications_sent`, staff_comment.
- **cancellation_policy** → `be_cancellation_policies`; **reschedule_policy** → `be_reschedule_policies` — `scope_level` organization | specialist | service | product; резолвер — `modules/booking-policies/policyResolver.ts`.
- **working_hours** — рабочее время специалиста (по филиалу/кабинету).
- **availability_rule** — правила доступности.
- **schedule_block** — блокировки/отсутствия/отпуска.
- **time_slot** — (производное) вычисляемые слоты; может быть вычислением, не таблицей.
- **calendar_event** — представление для календаря (может быть проекцией над appointment + block).

## Пациенты и формы (этапы 2, 3, 9)
- **patient** — переиспользовать `platform_users` (не плодить дубль identity); booking-специфичные поля выносить в смежные таблицы.
- **patient_contact** — контакты (телефон/email), `phone_normalized`.
- **patient_merge_candidate** — кандидаты на объединение профилей (C5).
- **patient_profile_field / booking_form_field** — конфигурация полей записи.
- **booking_form_submission** — ответы пациента по записи.
- **booking-репутация** (этап 9) — флаги «проблемный» / booking-блок, **отдельно** от `is_blocked`/`is_archived` (мессенджинг/видимость).

## Абонементы и продукты (этапы 6, 7)
- **product / product_type** — универсальный продукт.
- **package (subscription_package) / package_item** — составной абонемент (произвольные услуги×количества).
- **patient_package / patient_package_balance / package_usage** — экземпляр у пациента, остатки, списания (append-only).
- **promo_product / gift_certificate** — акции/подарки.
- **entitlement / content_access_grant** — выдача доступа после покупки (переиспользовать существующие `content_access_grants`).

## Оплаты (этап 5, реализовано: `0092`, `0093`)
- **payment_provider / payment_provider_config** — `system_settings.booking_payment_providers` + `booking_payment_enabled`; секреты только в БД (scope `admin`), не ENV.
- **payment_method** — логически `provider_id` на `be_payment_intents` / `be_payments` + подпись провайдера в `system_settings` (отдельная таблица не требуется для booking-prepayment).
- **payment / payment_intent / refund** → `be_payments`, `be_payment_intents`, `be_refunds`; `be_appointments.payment_ref` при capture.
- **prepayment_policy** → `be_prepayment_policies` (очная услуга **или** онлайн-категория `rehab_lfk` | `nutrition` | `general`).
- **payment_history_event** → `be_payment_history_events`; **payment_provider_event** → `be_payment_provider_events`.

## История/таймлайн (этапы 1, 9)
- **patient_timeline_event** — агрегатор событий пациента (для карточки).
- **appointment_history_event / payment_history_event / package_history_event** — доменные истории (могут быть представлениями над `*_event`).

## Связь с существующими таблицами (не дублировать)
- Идентичность: `platform_users`, `user_channel_bindings`, `phone_normalized`, `integrator_user_id` — переиспользовать.
- Текущая запись: `patient_bookings`, `appointment_records` (проекция Rubitime), `rubitime_records` — мигрировать/проецировать в канон, не оставлять второй источник истины.
- Текущий booking-каталог: `booking_branches/booking_cities/booking_specialists/booking_services/booking_branch_services`, `rubitime_booking_profiles` — переосмыслить под новую модель доступности (миграция, не параллельная модель).
- Курсы: `courses` (+`priceMinor`/`currency`), `content_pages`, `content_access_grants` — потребители продуктового/платёжного слоя.
- Конфиг: `system_settings` (+`ALLOWED_KEYS`) — единственное место для платёжных ключей.
