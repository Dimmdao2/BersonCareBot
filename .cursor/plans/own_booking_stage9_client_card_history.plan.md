---
name: "Own Booking Engine — Stage 9: Client card & full history"
overview: "Этап 9: карточка клиента как полный таймлайн (записи/посещения/отмены/переносы/оплаты/предоплаты/возвраты/абонементы/списания/продукты/акции/комментарии), комментарии в карточке и к записи, пометка «проблемный» и booking-блокировка (отдельно от messaging is_blocked/is_archived). Источник — docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md §Этап 9."
gitBranch: initiative/own-booking-engine
isProject: false
todos:
  - id: "s9-timeline"
    content: "Read-проекция таймлайна из append-only событий этапов 1–8 (patient_timeline_event агрегатор)"
    status: pending
  - id: "s9-history"
    content: "История оплат (§16.3) и посещений (§16.4) со всеми полями"
    status: pending
  - id: "s9-comments"
    content: "Комментарии в карточке клиента и к отдельной записи"
    status: pending
  - id: "s9-flags"
    content: "Booking-репутация: пометка «проблемный» + booking-блокировка (отдельно от is_blocked/is_archived)"
    status: pending
  - id: "s9-ui"
    content: "UI: раздел истории в карточке клиента + пометки/комментарии (§B-card); срез истории пациенту (§C-history)"
    status: pending
  - id: "s9-verify"
    content: "Тесты агрегации таймлайна/флагов; typecheck/lint; api.md, LOG.md, ROADMAP.md; финальный pnpm run ci"
    status: pending
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
- Пороги авто-пометки/ручной режим — `[need-decision]` Q6 (`SCOPE_DECISIONS.md`).
- Чек: пометка/блок booking влияют на возможность самостоятельной записи (этапы 2/3); messaging-флаги не затронуты.

### Шаг 9.5 — UI (todo s9-ui) — [`UI_SURFACES_CHECKLIST.md`](../../docs/OWN_BOOKING_ENGINE_INITIATIVE/UI_SURFACES_CHECKLIST.md) §B-card,§C-history
- Врач/админ: раздел истории в карточке + пометки «проблемный»/booking-блок + комментарии.
- Пациент: срез своей истории (profile/purchases).
- Чек: e2e карточки с историей и флагами.

### Шаг 9.6 — Верификация (todo s9-verify)
- Тесты агрегации/флагов; `typecheck`/`lint`; обновить `api.md`, `LOG.md`, `ROADMAP.md`.
- **Финальный `pnpm run ci`** (завершение крупной инициативы) и проверка DoD всей инициативы в `MASTER_PLAN.md` §6.

## Definition of Done (этап 9)
- [ ] Карточка клиента показывает полную историю из append-only событий (§16).
- [ ] Таймлайн и карточка tenant-safe: агрегаты фильтруются по `organization_id` (C1).
- [ ] История оплат и посещений со всеми полями (§16.3,16.4).
- [ ] Комментарии (карточка/запись); пометка «проблемный» и booking-блок отдельно от messaging-флагов.
- [ ] UI §B-card/§C-history; тесты/typecheck/lint зелёные; финальный `pnpm run ci`; DoD инициативы закрыт; docs/статусы обновлены.

## Gate
Q6 (пороги «проблемный») — в `SCOPE_DECISIONS.md`. Согласовать с `DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE`.
