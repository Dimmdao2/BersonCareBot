---
name: "Own Booking Engine — Stage 9: Client card & full history"
overview: "Этап 9 закрыт (2026-05-30): карточка клиента и patient-срез — read-агрегатор `client-history` + `pgClientHistory` (timeline/оплаты/визиты из append-only событий этапов 1–8), booking-репутация (`be_patient_booking_profiles`), комментарии к записи (`be_appointment_staff_comments`), guard `booking_blocked`. Аудит: dedupe/enrichment, phone-fallback, UI календаря и purchases. Q6 — только ручной режим репутации."
gitBranch: initiative/own-booking-engine
status: completed
completedAt: "2026-05-30"
isProject: false
todos:
  - id: "s9-timeline"
    content: "Read-проекция таймлайна из append-only событий этапов 1–8 (patient_timeline_event агрегатор)"
    status: completed
  - id: "s9-history"
    content: "История оплат (§16.3) и посещений (§16.4) со всеми полями"
    status: completed
  - id: "s9-comments"
    content: "Комментарии в карточке клиента и к отдельной записи"
    status: completed
  - id: "s9-flags"
    content: "Booking-репутация: пометка «проблемный» + booking-блокировка (отдельно от is_blocked/is_archived)"
    status: completed
  - id: "s9-ui"
    content: "UI: раздел истории в карточке клиента + пометки/комментарии (§B-card); срез истории пациенту (§C-history)"
    status: completed
  - id: "s9-verify"
    content: "Тесты агрегации таймлайна/флагов; typecheck/lint; LOG.md, ROADMAP.md; финальный pnpm run ci"
    status: completed
  - id: "s9-audit"
    content: "Аудит этапа 9: product history, package usages fallback, dedupe, payment enrich, phone-fallback, UI calendar/purchases"
    status: completed
  - id: "s9-audit-rev2"
    content: "Ревизия аудита: isFinalPaymentEventType, dedupe package_usage/payment mirror, listTimeline phone payments, visit currency, refund UI"
    status: completed
---

# Этап 9 — Карточка клиента и полная история

> ТЗ: `STAGE_CHECKLISTS.md` §Этап 9 (ТЗ §16,21.6,22.5; исходный запрос владельца про комментарии/проблемных). Зависит от всех событий этапов 1–8.

## Контекст существующего кода

- Карточка клиента: `app/app/doctor/clients/**` (`ClientProfileCard.tsx`, `DoctorNotesPanel.tsx`, `SubscriberBlockPanel.tsx`, `DoctorClientLifecycleActions.tsx`, `AdminMergeAccountsPanel.tsx`), модуль `modules/doctor-clients/*`, репо `infra/repos/pgDoctorClients.ts`. Заметки врача — `modules/doctor-notes/service.ts` + `app/api/doctor/clients/[userId]/notes`.
- Флаги: `platform_users.is_blocked/blocked_reason/blocked_at/blocked_by` (messaging-блок чата), `is_archived` (видимость списка). Это **не** booking-«проблемный»/booking-блок (ТЗ требует отдельные).
- Таймлайн-каркас и события — этап 1 (`patient_timeline_event`/`appointment_history_event`), оплаты — этап 5 (`payment_history_event`), абонементы — этап 6 (`package_usage`).
- Пациентский профиль/история: `app/app/patient/profile/*`, `purchases/*`.
- Смежная инициатива карточки: `DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE`.

## Scope boundaries

- **Можно трогать:** карточка `app/app/doctor/clients/**` (новый раздел истории), агрегатор таймлайна (read-проекция), Drizzle booking-репутации (новые флаги/таблица), комментарии (расширить `doctor-notes` или новый), пациентский срез истории, docs.
- **Вне scope:** изменение messaging `is_blocked`/`is_archived` семантики (не переиспользовать под booking); полная переработка карточки клиники вне booking-истории (согласовать с `DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE`).

## Декомпозиция

### Шаг 9.1 — Таймлайн (todo s9-timeline) — ТЗ §16.1,16.2,21.6
- Read-проекция/агрегатор поверх append-only событий этапов 1–8 (без новой записи истины): записи, посещения, отмены, переносы, оплаты, предоплаты, возвраты, абонементы, списания, продукты, акции, комментарии.
- Чек: таймлайн собирается из событий; ничего не теряется.

### Шаг 9.2 — История оплат/посещений (todo s9-history) — ТЗ §16.3,16.4
- История оплат: дата/сумма/способ/провайдер/статус/назначение/связи/возвраты/удержания/комментарии.
- История посещений: дата-время/специалист/филиал/кабинет/услуга/длительность/статус/был ли по абонементу/какое занятие списано/предоплата/итоговая оплата/комментарий.
- Чек: оба раздела отображают полные поля.

### Шаг 9.3 — Комментарии (todo s9-comments) — ТЗ §9.3,16.1
- Комментарии в карточке клиента и к отдельной записи (расширить `doctor-notes` или новая таблица booking-комментариев к записи).
- Чек: комментарий к записи и к карточке создаётся/виден.

### Шаг 9.4 — Booking-репутация (todo s9-flags) — исходный запрос владельца
- Drizzle: новые поля/таблица — пометка «проблемный» (часто не приходит/переносит) и booking-блокировка (запрет/ограничение самостоятельной записи), **отдельно** от messaging `is_blocked`/`is_archived`.
- Пороги авто-пометки/ручной режим — Q6: ручной режим на первом инкременте (`SCOPE_DECISIONS.md`).
- Чек: пометка/блок booking влияют на возможность самостоятельной записи (этапы 2/3); messaging-флаги не затронуты.

### Шаг 9.5 — UI (todo s9-ui) — [`UI_SURFACES_CHECKLIST.md`](../../docs/OWN_BOOKING_ENGINE_INITIATIVE/UI_SURFACES_CHECKLIST.md) §B-card,§C-history
- Врач/админ: раздел истории в карточке + пометки «проблемный»/booking-блок + комментарии.
- Пациент: срез своей истории (profile/purchases).
- Чек: e2e карточки с историей и флагами.

### Шаг 9.6 — Верификация (todo s9-verify)
- Тесты: `clientHistoryUtils`, `history/route.test.ts`, `booking-profile/route.test.ts`, e2e smoke `doctor-clients-inprocess`.
- `typecheck`/`lint`; обновить `LOG.md`, `ROADMAP.md`, `client-history.md`.
- **Финальный `pnpm run ci`** и проверка DoD всей инициативы в `MASTER_PLAN.md` §6.

## Ключевые артефакты

| Область | Путь |
|---------|------|
| Модуль | `apps/webapp/src/modules/client-history/` |
| Read repo | `apps/webapp/src/infra/repos/pgClientHistory.ts` |
| Миграция | `apps/webapp/db/drizzle-migrations/0096_booking_stage9_client_history.sql` |
| Doctor UI | `ClientBookingHistoryPanel`, `AppointmentStaffCommentsSection` |
| Patient UI | `PatientBookingHistorySection` (profile, purchases) |
| Документация модуля | [`client-history.md`](../../apps/webapp/src/modules/client-history/client-history.md) |

## Definition of Done (этап 9)
- [x] Карточка клиента показывает полную историю из append-only событий (§16).
- [x] Таймлайн и карточка tenant-safe: агрегаты фильтруются по `organization_id` (C1).
- [x] История оплат и посещений со всеми полями (§16.3,16.4).
- [x] Комментарии (карточка/запись); пометка «проблемный» и booking-блок отдельно от messaging-флагов.
- [x] UI §B-card/§C-history; тесты/typecheck/lint зелёные; финальный `pnpm run ci`; DoD инициативы закрыт; docs/статусы обновлены.

## Закрытие хвостов по аудиту (2026-05-30)

- [x] `pgClientHistory`: `be_product_history_events`, fallback `be_package_usages`, dedupe timeline, enrichment оплат, phone-fallback.
- [x] UI: русские подписи оплат; `AppointmentStaffCommentsSection` (визиты + календарь); оплаты в patient profile/purchases; `endAt` в визитах.
- [x] Тесты: `clientHistoryUtils`, `history/route.test.ts`; `pnpm run ci` зелёный.

## Ревизия 2026-05-30 (второй проход)

- [x] Исправлена классификация `prepayment_captured` / refund в `isFinalPaymentEventType`.
- [x] Dedupe `package_usage` fallback и зеркал payment timeline.
- [x] Phone-fallback платежей в `listTimeline`; валюта визитов из события.
- [x] UI: возвраты, абонемент без summary; e2e smoke history-компонентов.

## Gate
Q6 (пороги «проблемный») — в `SCOPE_DECISIONS.md`. Согласовать с `DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE`.
