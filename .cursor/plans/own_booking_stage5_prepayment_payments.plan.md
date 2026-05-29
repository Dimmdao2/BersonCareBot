---
name: "Own Booking Engine — Stage 5: Prepayment & payments layer"
overview: "Этап 5: платёжный слой (Payment/PaymentIntent/Refund) с идемпотентными вебхуками, провайдеры с конфигом в system_settings (НЕ ENV) и выбором по сценарию/услуге/продукту, предоплата по услуге (фикс/процент/полная/откл), связь оплаты с записью, возврат/удержание при отмене/переносе, история оплат. Источник — docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md §Этап 5."
gitBranch: initiative/own-booking-engine
isProject: false
todos:
  - id: "s5-core"
    content: "Drizzle: payment/payment_intent/refund/payment_method (amountMinor+currency); связь с appointment/patient/product"
    status: pending
  - id: "s5-provider-port"
    content: "PaymentProviderPort (create intent/capture/refund/verify webhook) + адаптеры провайдеров"
    status: pending
  - id: "s5-config-db"
    content: "Конфиг провайдеров в system_settings (ALLOWED_KEYS + admin route + sync integrator); выбор провайдера по сценарию/услуге/продукту; БЕЗ ENV-секретов"
    status: pending
  - id: "s5-webhooks"
    content: "Идемпотентные вебхуки провайдеров (payment_provider_event) → service"
    status: pending
  - id: "s5-prepay"
    content: "PrepaymentPolicy по услуге (фикс/процент/полная/откл); статусы записи увязаны с оплатой"
    status: pending
  - id: "s5-refund-flow"
    content: "Возврат/удержание/на баланс при отмене/переносе по политике (интеграция с этапом 4)"
    status: pending
  - id: "s5-history"
    content: "PaymentHistoryEvent (дата/сумма/способ/провайдер/статус/назначение/связи/возвраты/удержания)"
    status: pending
  - id: "s5-ui"
    content: "UI: admin провайдеры+предоплата (§A9,§A10) + события уведомлений (§A13); пациент оплата+статус (§C-pay, §P-pay); врач/админ статус оплаты записи (§B-pay)"
    status: pending
  - id: "s5-verify"
    content: "Тесты идемпотентности/предоплаты/возврата; typecheck/lint; api.md, CONFIGURATION_ENV_VS_DATABASE.md, LOG.md, ROADMAP.md; ответы Q1/Q2"
    status: pending
---

# Этап 5 — Предоплата и базовые оплаты

> ТЗ: `STAGE_CHECKLISTS.md` §Этап 5 (ТЗ §10,13.1–13.3,16.3). КРИТИЧНО §24.12 — ключи в БД, не в ENV. Зависит от этапов 1,2 (запись/статусы); интеграция с этапом 4 (возвраты/удержания).
>
> Обязательно прочитать `.cursor/rules/000-critical-integration-config-in-db.mdc`, `runtime-config-env-vs-db.mdc`, `system-settings-integrator-mirror.mdc`.

## Контекст существующего кода

- **Платёжного шлюза в webapp нет** (нет Stripe/YooKassa/checkout). Есть только цены: `courses.price_minor/currency` (`db/schema/courses.ts`), `booking_services.price_minor`, snapshot `patient_bookings.price_minor_snapshot`. Rubitime-статус `awaiting_prepayment` — только аудит.
- Конфиг-механизм: `modules/system-settings/*` — `ALLOWED_KEYS` (`types.ts`), `updateSetting`+`syncSettingToIntegrator` (`service.ts`/`syncToIntegrator.ts`), admin route `app/api/admin/settings/route.ts` (`ADMIN_SCOPE_KEYS`), секреты редактируются с merge-сохранением (`smtp_outbound`/`web_push_vapid` как образец для секретных полей). Integrator receiver `apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts`.
- Outbox/идемпотентность как образец: `infra/integrator-push/integratorM2mPosts.ts`, `integrator_push_outbox`.

## Scope boundaries

- **Можно трогать:** новый модуль `modules/payments/*` (service+ports), Drizzle платёжных таблиц + политик предоплаты, адаптеры провайдеров (`infra/payments/*`), вебхук-роуты `app/api/payments/webhook/[provider]/route.ts`, расширение `system_settings` (ключи провайдеров), admin-секция провайдеров/предоплаты, пациентская оплата UI, интеграция с отменой/переносом этапа 4, docs.
- **Вне scope:** абонементы (этап 6 — оплата абонемента подключается там через этот слой), продукты/курсы/подписки (этап 7). **Категорически нельзя** вводить ENV-переменные под платёжные ключи/URL.

## Декомпозиция

### Шаг 5.1 — Платёжный слой (todo s5-core) — ТЗ §13.1,21.5
- Drizzle: `payment`, `payment_intent`, `refund`, `payment_method`; деньги `amountMinor:int`+`currency`; связь с `appointment`/`platform_user`/`product`(nullable до этапа 7).
- Чек: создание интента/платежа атомарно с событием истории.

### Шаг 5.2 — PaymentProviderPort + адаптеры (todo s5-provider-port) — ТЗ §13.2–13.3
- Порт `PaymentProviderPort`: createIntent, capture, refund, verifyWebhook. Конкретные адаптеры реализуют порт (стартовый список — `[need-decision]` Q1: YooKassa/CloudPayments/TBank).
- Чек: мок-адаптер проходит контрактные тесты порта.

### Шаг 5.3 — Конфиг провайдеров в БД (todo s5-config-db) — ТЗ §13.2, §24.12
- Ключи/токены/настройки провайдеров — в `system_settings` (scope `admin`): добавить ключи в `ALLOWED_KEYS` + `ADMIN_SCOPE_KEYS` + merge-сохранение секретов (как `smtp_outbound`); синк в integrator через `updateSetting`.
- Включение/отключение провайдера; выбор провайдера для сценария/страницы/продукта/услуги; несколько способов одновременно.
- Чек: смена активного провайдера в админке без релиза; секрет не возвращается клиенту (redaction).

### Шаг 5.4 — Идемпотентные вебхуки (todo s5-webhooks) — ТЗ §13.1
- Drizzle: `payment_provider_event`; роут вебхука идемпотентен (ключ провайдера), верификация подписи через порт.
- Чек: повторный вебхук не двоит платёж (тест).

### Шаг 5.5 — Предоплата (todo s5-prepay) — ТЗ §10
- Drizzle/конфиг: `prepayment_policy` по услуге (фикс/процент/полная/откл). Статусы записи: «ожидает оплаты/предоплаты»→«оплачена» (C2).
- Чек: запись с предоплатой не подтверждается до оплаты; сумма считается по политике.

### Шаг 5.6 — Возврат/удержание при отмене/переносе (todo s5-refund-flow) — ТЗ §10.3–10.4
- Реализовать возврат/удержание/на баланс по политике этапа 4 (`[need-decision]` Q2: нужен ли «баланс пациента»).
- Корректный перенос переносит предоплату на новую дату; нарушающий — по политике (C6).
- Чек: сценарии возврата/удержания проходят тестами.

### Шаг 5.7 — История оплат (todo s5-history) — ТЗ §16.3,C3
- `payment_history_event`: дата/сумма/способ/провайдер/статус/назначение/связи/возвраты/удержания/комментарии.
- Чек: события читаемы для карточки (этап 9).

### Шаг 5.8 — UI (todo s5-ui) — [`UI_SURFACES_CHECKLIST.md`](../../docs/OWN_BOOKING_ENGINE_INITIATIVE/UI_SURFACES_CHECKLIST.md) §A9,§A10,§C-pay,§B-pay
- Admin: новая секция провайдеров (по образцу `EmailSmtpSection`/`AuthProvidersSection` с redaction секретов) + предоплата по услуге (в admin услугах этапа 1).
- Пациент: «нужна оплата/предоплата», оплата, статус, история своих оплат.
- Врач/админ: статус оплаты/предоплаты записи + история, возвраты/удержания.
- Публичный вход: если услуга требует предоплаты, гость оплачивает из public flow (UI §P-pay, после этапа 3).
- Admin: настройка уведомлений о событиях оплаты/предоплаты (UI §A13).
- Чек: e2e оплаты (мок-провайдер).

### Шаг 5.9 — Верификация (todo s5-verify)
- Тесты идемпотентности/предоплаты/возврата; `typecheck`/`lint`.
- Обновить `api.md`, `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`, `LOG.md`, `ROADMAP.md`; зафиксировать Q1/Q2 в `SCOPE_DECISIONS.md`.

## Definition of Done (этап 5)
- [ ] Платёжный слой с идемпотентными вебхуками; деньги в minor units.
- [ ] Платёжные сущности tenant-aware (`organization_id`) и не смешивают данные разных клиник (C1).
- [ ] Провайдеры из `system_settings` (НЕ ENV), переключаются без релиза, выбор по сценарию/услуге/продукту (§13.2,§24.12).
- [ ] Предоплата по услуге; статусы записи увязаны с оплатой (§10,C2).
- [ ] Возврат/удержание при отмене/переносе по политике (§10.3–10.4,C6).
- [ ] История оплат (§16.3,C3).
- [ ] UI §A9/§A10/§A13/§C-pay/§P-pay/§B-pay; тесты/typecheck/lint зелёные; docs/статусы обновлены; Q1/Q2 закрыты.

## Gate
Оплата абонементов/продуктов — этапы 6/7 поверх этого слоя. Сужения — в `SCOPE_DECISIONS.md`.
