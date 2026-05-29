---
name: "Own Booking Engine — Stage 7: Products, promos, subscriptions, courses"
overview: "Этап 7: универсальная модель продукта (разовый приём/абонемент/сертификат/акция/курс/подписка/доступ/индивидуальное предложение), акции и подарки со связью по телефону, подписки, курсы как продукт, выдача доступов (entitlements) после оплаты, индивидуальная ссылка на оплату. Источник — docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md §Этап 7."
todos:
  - id: s7-product
    content: "Drizzle: product/product_type (название/цена/состав/тип/правила доступа/оплаты/срок/связи/покупка по ссылке)"
    status: completed
  - id: s7-promo
    content: "promo_product/gift_certificate; связь покупки с пациентом по телефону; видно специалисту при записи"
    status: completed
  - id: s7-subscription
    content: "Подписка как продукт (доступ к материалам/урокам/программам/курсам/разделам)"
    status: completed
  - id: s7-course
    content: "Курс как продукт; покупка → доступ к материалам; согласование с COURSES_INITIATIVE (не дублировать движок)"
    status: completed
  - id: s7-entitlement
    content: "Выдача доступа (entitlement) после оплаты; переиспользовать content_access_grants_webapp"
    status: completed
  - id: s7-ui
    content: "UI: admin/doctor CRUD продуктов/акций/подписок/курсов (§A12,§B-products); пациент витрина/покупка/доступы (§C-products)"
    status: completed
  - id: s7-verify
    content: "Тесты покупки/связи по телефону/выдачи доступа; typecheck/lint; api.md, LOG.md, ROADMAP.md"
    status: completed
  - id: s7-audit-booking
    content: "productPurchaseId на create; products/available; consume/release визита; ConfirmStepClient"
    status: completed
  - id: s7-audit-public
    content: "/book/product/{token}; public products payment; resolveOrCreateUserByPhone для гостя"
    status: completed
  - id: s7-audit-grants
    content: "resolvePatientCanViewContent; filterPatientSectionPages; BookingPatientProductsSection"
    status: completed
isProject: false
---

# Этап 7 — Продукты, акции, подписки, курсы

> ТЗ: `STAGE_CHECKLISTS.md` §Этап 7 (ТЗ §12,13.4–13.5,14). Зависит от этапов 5 (оплаты), 6 (абонемент-продукт).

## Контекст существующего кода

- Курсы: `modules/courses/*` (`listPublishedCatalog`, `enrollPatient`→`assignTemplateToPatient` с `assignmentSource:"course"`), `infra/repos/pgCourses.ts`, `db/schema/courses.ts` (`price_minor`/`currency`/`access_settings`), пациентский каталог `app/app/patient/courses/*`, enroll API `app/api/patient/courses/[courseId]/enroll/route.ts`. Курс — отдельная сущность (см. `COURSES_INITIATIVE`, НЕ план лечения).
- Доступы: `content_access_grants_webapp` (проекция из integrator `content.access.granted`, `modules/integrator/events.ts`, `pgReminderProjection.upsertContentAccessGrantFromProjection`). CMS-доступ сейчас — `content_pages.requires_auth` + `resolvePatientCanViewAuthOnlyContent`, не grant-строки.
- Покупки: `app/app/patient/purchases/*` — placeholder без оплаты.
- Платёжный слой — этап 5; абонемент-продукт — этап 6.
- Identity/merge по телефону — `pgUserProjection.ts`/`@bersoncare/platform-merge` (C5).

## Scope boundaries

- **Можно трогать:** новый модуль `modules/products/*` + `modules/entitlements/*`, Drizzle продуктовых таблиц, интеграция с платёжным слоем (5) и абонементами (6), курсами (`modules/courses`), доступами (`content_access_grants_webapp`), admin/doctor CRUD, пациентская витрина/purchases, docs.
- **Вне scope:** новый «курс-движок» (запрещено — переиспользовать `COURSES_INITIATIVE`); календарь (8); карточка (9 — здесь срез покупок).

## Декомпозиция

### Шаг 7.1 — Модель продукта (todo s7-product) — ТЗ §13.4,21.4
- Drizzle: `product` + `product_type` (разовый приём/абонемент/сертификат/акция/курс/подписка/доступ/индивидуальное). Поля: название, цена, состав, тип, правила доступа, правила оплаты, срок, связь с услугами/материалами/курсами, отображение в кабинете, покупка по ссылке.
- Индивидуальная ссылка на оплату с активацией после оплаты (§13.5; ср. этап 6 ссылка абонемента).
- Чек: продукт каждого типа создаётся; ссылка на оплату активирует продукт.

### Шаг 7.2 — Акции/подарки (todo s7-promo) — ТЗ §12
- Реализация: `product_type` в `be_products` (не отдельные таблицы `promo_product`/`gift_certificate`). Связь по телефону (C5); запись — `productPurchaseId`, `consumeVisitForAppointment` / `applyCancelVisitOutcome`.
- Специалист видит: что куплено/оплачено/использовано/остаток визитов. Пациент видит купленные акции/подарочные абонементы/доступные продукты/статус/возможность записи/остаток.
- Чек: покупка по телефону связывается; видна специалисту при записи.

### Шаг 7.3 — Подписки (todo s7-subscription) — ТЗ §14.1
- Подписка как продукт: доступ к материалам/урокам/программам/курсам/закрытым разделам/доп. функциям.
- Чек: активная подписка открывает доступ (через entitlement).

### Шаг 7.4 — Курсы (todo s7-course) — ТЗ §14.2
- Курс как продукт: покупка → доступ к материалам курса; связь с платёжным слоем и кабинетом. Переиспользовать `modules/courses`/`access_settings`, согласовать с `COURSES_INITIATIVE`.
- Чек: покупка курса даёт доступ; движок курса не дублируется.

### Шаг 7.5 — Выдача доступов (todo s7-entitlement) — ТЗ §14.3
- Сервис выдачи entitlement после оплаты: курс/программа/материалы/подписка/запись по абонементу. Переиспользовать `content_access_grants_webapp` где применимо.
- Чек: после оплаты доступ выдаётся и проверяется.

### Шаг 7.6 — UI (todo s7-ui) — [`UI_SURFACES_CHECKLIST.md`](../../docs/OWN_BOOKING_ENGINE_INITIATIVE/UI_SURFACES_CHECKLIST.md) §A12,§B-products,§C-products
- Admin/doctor: CRUD продуктов/типов/акций/сертификатов/подписок/привязка курсов; правила доступа/оплаты/срок; покупка по ссылке. Расширить `app/app/doctor/courses/*` паттерн.
- Пациент: витрина/покупка/доступы (`app/app/patient/purchases` + `courses`); инфо о покупке при записи (врач).
- Чек: e2e покупки продукта и выдачи доступа.

### Шаг 7.7 — Верификация (todo s7-verify)
- Тесты покупки/связи по телефону/выдачи доступа; `typecheck`/`lint`; обновить `api.md`, `LOG.md`, `ROADMAP.md`.

## Definition of Done (этап 7)
- [x] Универсальная модель продукта; продукт/акция/подарок/подписка/курс продаётся через слой этапа 5 (§13.4).
- [x] Продуктовые сущности tenant-aware (`organization_id`) и фильтруются по клинике (C1).
- [x] Покупка по телефону связывается с пациентом; видна специалисту и пациенту (§12).
- [x] Доступ выдаётся после оплаты (§14.3); курс-движок не дублируется (согласовано с COURSES_INITIATIVE).
- [x] UI §A12/§B-products/§C-products; тесты/typecheck/lint зелёные; docs/статусы обновлены.

## Реализовано (схема и пути)

- DDL: `0095_booking_stage7_products.sql`, `apps/webapp/db/schema/bookingProducts.ts`
- Модули: `modules/products`, `modules/entitlements`, `infra/repos/pgProducts.ts`, `pgEntitlements.ts`
- API: `booking/products/*`, `booking/public/products/*`, `admin|doctor/booking-engine/products`, `patient-products` (+ `[id]/consume`)
- UI: `BookingCatalogProductsSection`, `BookingPatientProductsSection`, `PatientPurchasesClient`, `/book/product/[token]`, `ConfirmStepClient` (покупка при записи)
- Доступ: `resolvePatientCanViewContent`, `filterPatientSectionPages`

## Gate
Сужения — в `SCOPE_DECISIONS.md`.
