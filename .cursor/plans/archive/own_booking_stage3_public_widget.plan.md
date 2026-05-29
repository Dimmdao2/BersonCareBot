---
name: "Own Booking Engine — Stage 3: Public booking page & embeddable widget"
overview: "Этап 3: публичная страница записи вне /app (без сессии), форматы встраивания (JS-виджет/iframe/popup/ссылка) под Tilda, параметры/UTM, гостевая идентификация по телефону + кандидаты на мердж. Источник — docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md §Этап 3."
status: completed
gitBranch: initiative/own-booking-engine
isProject: false
todos:
  - id: "s3-public-route"
    content: "Публичная страница записи вне /app без обязательной сессии (новый route + слой без auth-guard)"
    status: completed
  - id: "s3-embed"
    content: "Форматы встраивания: JS-виджет, iframe, popup, публичная ссылка; CSP/embedding под Tilda и dmitryberson.ru"
    status: completed
  - id: "s3-params"
    content: "Параметры виджета (клиника/филиал/специалист/услуга/акция/город/услуга) + UTM; сохранение источника в записи"
    status: completed
  - id: "s3-guest"
    content: "Гостевая идентификация по телефону + создание/линковка platform_user; rate-limit/антибот"
    status: completed
  - id: "s3-merge"
    content: "PatientMergeCandidate + admin-поверхность ручного/полуавтоматического мерджа"
    status: completed
  - id: "s3-flow"
    content: "Созданная запись попадает в канон/кабинеты/уведомления/историю (переиспользовать ядро этапа 2)"
    status: completed
  - id: "s3-verify"
    content: "Тесты публичного flow/rate-limit/merge; typecheck/lint; api.md, LOG.md, ROADMAP.md, SCOPE_DECISIONS (Q4 CSP)"
    status: completed
---

# Этап 3 — Публичный виджет / страница записи

> ТЗ: `STAGE_CHECKLISTS.md` §Этап 3 (ТЗ §4.3–4.4, §19). Зависит от этапа 2 (ядро записи, слот-движок, поля).

## Контекст существующего кода

- Текущий пациентский визард требует сессию: `apps/webapp/src/app/app/patient/layout.tsx` всегда `getCurrentSession()` → redirect `/app`. Гарды — `app-layer/guards/requireRole.ts`. Публичных no-session паттернов для записи нет (есть `/legal/*` с `legal/layout.tsx` без auth, `/app/contact-support`).
- Identity/merge: `apps/webapp/src/infra/repos/pgUserProjection.ts` (`ensureAppointmentClientTx`, `findByPhoneNormalized`, `updateProfileByPhone`), `pgUserByPhone.ts` (`createOrBind`, `normalizeRuPhoneE164`), `pgIdentityResolution.ts`, пакет `@bersoncare/platform-merge`; preview `infra/platformUserMergePreview.ts` (`searchMergeCandidates`), ручной мердж `infra/manualPlatformUserMerge.ts`, API `app/api/doctor/clients/[userId]/merge-candidates/route.ts`, UI `AdminMergeAccountsPanel.tsx`. Конфликты — `auto_merge_conflict` (`infra/adminAuditLog.ts`, `AdminAuditLogSection.tsx`).
- Каталог для пациента: `app/api/booking/catalog/cities|services`, `modules/booking-catalog/*`.

## Scope boundaries

- **Можно трогать:** новый публичный route (вне `app/app/patient`, напр. `app/book/**` или `app/(public)/book/**`), новый публичный API (`app/api/public/booking/*` без auth-guard, со своей валидацией/rate-limit), JS-виджет (статический скрипт + страница для iframe/popup), модель `patient_merge_candidate` + admin-поверхность, переиспользование ядра записи этапа 2, docs.
- **Вне scope:** ослабление гардов `/app`; оплаты (этап 5 — публичная оплата подключается там); изменение слот-движка (переиспользуем этап 2).

## Декомпозиция

### Шаг 3.1 — Публичная страница (todo s3-public-route) — ТЗ §19.1
- Новый маршрут вне `app/app/patient` без обязательной сессии (отдельный layout без `getCurrentSession`-redirect, по образцу `legal/layout.tsx`).
- Та же доступность/поля/слоты, что в приложении (через ядро этапа 2), но гостевой режим.
- Чек: страница открывается без сессии и без редиректа.

### Шаг 3.2 — Встраивание (todo s3-embed) — ТЗ §19.2
- JS-виджет (скрипт-вставка открывает iframe/popup на публичную страницу); поддержать iframe и публичную ссылку.
- Настроить CSP/`frame-ancestors`/CORS для Tilda и `dmitryberson.ru` (`[need-decision]` Q4 в `SCOPE_DECISIONS.md` — подтвердить домены/политику).
- Чек: демо-вставка на стороннем домене открывает форму записи.

### Шаг 3.3 — Параметры и UTM (todo s3-params) — ТЗ §19.3–19.4
- Поддержать data-атрибуты/URL-параметры: клиника, филиал, специалист, услуга, акция, источник, UTM, предвыбранный город/услуга.
- Сохранять источник/UTM в записи (поле в `appointment`/`booking_form_submission`) — для карточки (этап 9) и аналитики.
- Чек: параметры долетают и сохраняются в записи.

### Шаг 3.4 — Гостевая идентификация (todo s3-guest) — ТЗ §4.4, C5
- Телефон как основной идентификатор; создание/линковка `platform_user` через существующий identity (`createOrBind`/`ensureAppointmentClientTx`/`normalizeRuPhoneE164`).
- Rate-limit/антибот на публичном эндпойнте (незащищённый вход).
- Чек: гость с телефоном создаёт запись; повторный телефон линкуется к тому же пользователю.

### Шаг 3.5 — Кандидаты на мердж (todo s3-merge) — ТЗ §4.4
- Drizzle: `patient_merge_candidate` (коллизия «есть аккаунт без телефона»); генерировать кандидата при неоднозначности.
- Admin-поверхность мерджа: переиспользовать `searchMergeCandidates`/`AdminMergeAccountsPanel`/merge-candidates API; добавить просмотр booking-кандидатов.
- Чек: коллизия порождает кандидата; админ мерджит вручную.

### Шаг 3.6 — Интеграция с каноном (todo s3-flow) — ТЗ §19.4
- Запись из виджета → канон/календарь/карточка/уведомления/история (всё через ядро этапа 2).
- Чек: публичная запись видна врачу/админу и в истории.

### Шаг 3.7 — Верификация (todo s3-verify)
- Тесты публичного flow, rate-limit, генерации кандидатов мерджа; `typecheck`/`lint`.
- Обновить `api.md`, `LOG.md`, `ROADMAP.md`; зафиксировать ответ Q4 (CSP/домены) в `SCOPE_DECISIONS.md`.

## Definition of Done (этап 3)
- [x] Запись создаётся с внешнего сайта (демо как на Tilda) без входа в приложение (§19).
- [x] JS-виджет/iframe/popup/ссылка работают; CSP/embedding настроены для целевых доменов.
- [x] Параметры/UTM долетают и сохраняются; запись видна в каноне/кабинетах.
- [x] Гость идентифицируется по телефону; кандидаты на мердж формируются; admin-мердж работает (C5).
- [x] Tenant-scoping сохраняется для публичного канала: запись всегда создаётся в корректной `organization_id` и не протекает между клиниками (C1).
- [x] UI §A7, §B-merge, §P-page/§P-widget; тесты/typecheck/lint зелёные; docs/статусы обновлены.

## Gate
Сужения и решение по CSP/доменам — в `SCOPE_DECISIONS.md`. Публичная оплата (§P-pay) подключается на этапе 5.
