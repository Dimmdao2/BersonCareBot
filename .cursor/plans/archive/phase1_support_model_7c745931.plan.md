---
name: phase1 support model
overview: "Фаза 1 закрыта (2026-06-02): модель «На сопровождении», гейты комментариев/медиа, списки «Сегодня» и фильтры клиентов."
todos:
  - id: phase1-data-model
    content: Add Drizzle support profile table and backfill active doctor-program patients to on_support=true
    status: completed
  - id: phase1-domain-ports
    content: Extend doctor-clients domain/ports/infra with support profile, effective policy and filters
    status: completed
  - id: phase1-doctor-api-ui
    content: Add doctor support settings API, defaults keys and ClientProfileCard controls
    status: completed
  - id: phase1-today-filters
    content: Switch Today/on-support metrics to support flag and add program-without-support filter
    status: completed
  - id: phase1-patient-gates
    content: Apply effective comments/media policy to patient UI and API routes
    status: completed
  - id: phase1-docs-tests
    content: Update docs/logs and run targeted phase checks
    status: completed
isProject: false
---

# Фаза 1: Модель Сопровождения

**Статус: закрыта (2026-06-02).** Лог: `docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md`. Очередь: `docs/ACTIVE_WORKQUEUE.md`.

## Ответы На Пробелы

- **Схема данных:** завести новую Drizzle-таблицу `doctor_patient_support` в `apps/webapp/db/schema/doctorPatientSupport.ts`, а не добавлять `metadata` в `platform_users`. В текущей кодовой базе нет полноценной связи врач-пациент и нет `platform_users.metadata`, поэтому отдельная typed таблица лучше совпадает с правилами Drizzle и примером `be_patient_booking_profiles`.
- **`doctor_user_id`:** в первой реализации не добавлять обязательный `doctor_user_id`. Текущие `doctor-clients`, «Сегодня» и settings не скоупятся по конкретному врачу, поэтому обязательный `doctor_user_id` создаст ложную multi-doctor модель и потребует большой пересборки доступа. Вместо этого хранить app-wide профиль сопровождения пациента: `patient_user_id`, `on_support`, `comments_enabled`, `media_enabled`, `updated_at`, `updated_by`.
- **Backfill:** миграция создаёт строки `on_support=true` для пациентов с активной `treatment_program_instances.status='active' AND assignment_source='doctor'`. Это сохраняет текущее поведение «Сегодня» и не обнуляет список после выката. Пациенты без такой программы строки не получают и считаются `on_support=false`.
- **Автовключение при назначении программы:** новые назначения программы **не** включают сопровождение автоматически. Флаг ручной, как в постановке. Новая программа без флага попадает в фильтр «программа без сопровождения».
- **Effective gates:** `assignment_source='doctor'` остаётся базовым условием для program discussion/media. Поверх него добавляются admin rollout flags и support policy:
  - если `on_support=true`: comments/media разрешены по умолчанию, но per-patient override может выключить;
  - если `on_support=false`: comments/media берут doctor-scope defaults для клиентов без сопровождения, но per-patient override может переопределить;
  - `null` в `comments_enabled` / `media_enabled` означает «использовать default», `false` означает явный запрет, `true` явное разрешение.
- **Doctor defaults:** добавить `system_settings` keys scope `doctor`: `doctor_patient_support_comments_without_support_default_enabled` и `doctor_patient_support_media_without_support_default_enabled`, оба default `false`. Это консервативно: без сопровождения пациент не может писать/слать медиа, пока врач явно не включит default или per-patient override.
- **UI disabled vs hidden:** если программа doctor-assigned и admin rollout flag включён, кнопки рендерятся. Если support policy запрещает действие, кнопки остаются видимыми, но `disabled` + `aria-disabled` и не открывают dialog/media picker. Если admin rollout flag выключен или программа не doctor-assigned, controls скрыты как сейчас.
- **API gates:** все patient write/read endpoints discussion/media должны проверять effective support policy и возвращать `403` с машинным кодом вроде `patient_support_comments_disabled` или `patient_support_media_disabled`. Legacy `observation-note` тоже должен получить этот gate, иначе останется обход UI.
- **Фильтры списка:** заменить семантику «На сопровождении» на `support=on`; добавить отдельный фильтр `support=programWithoutSupport` для пациентов с активной doctor-программой, но `on_support=false`. Старый `treatmentProgram=1` можно оставить как backward-compatible фильтр «есть активная doctor-программа», но не использовать как источник «На сопровождении».

## Scope Boundaries

Разрешено менять:
- `apps/webapp/db/schema/doctorPatientSupport.ts` и Drizzle migration в `apps/webapp/db/drizzle-migrations/`.
- `apps/webapp/src/modules/doctor-clients/*` и infra implementation для нового support profile через Drizzle (`getDrizzle`).
- `apps/webapp/src/app/api/doctor/clients/[userId]/**` для PATCH/GET support settings.
- Patient treatment routes/components under `apps/webapp/src/app/app/patient/treatment/**` and `apps/webapp/src/app/api/patient/treatment-program-instances/**`.
- Doctor surfaces: `loadDoctorTodayDashboard.ts`, `DoctorTodayDashboard.tsx`, `clients/page.tsx`, `ClientProfileCard.tsx`, `/api/doctor/settings/route.ts`.
- Relevant docs: `docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md`, initiative `LOG.md`, `docs/TODO.md`.

Вне scope:
- Настоящая multi-doctor ownership model.
- Переработка карточки врача из фазы 2.
- Новая inbox/feed логика из фаз 5+.
- Изменение GitHub CI workflow.

## Implementation Steps

1. **Drizzle data model** — [x]
   - Add table `doctor_patient_support` with unique `patient_user_id`, FK to `platform_users`, nullable boolean overrides, audit fields.
   - Generate Drizzle migration with backfill from active doctor programs.
   - Add indexes for `on_support` and patient lookup.
   - Checks: `drizzle-kit check` if available; inspect generated SQL; targeted schema typecheck.

2. **Domain and ports** — [x]
   - Extend `modules/doctor-clients/ports.ts` with support profile types, filters `supportStatus`, and methods `getClientSupport`, `updateClientSupport`, `getPatientProgramInteractionPolicy`.
   - Implement support reads/writes in infra using `getDrizzle`, keeping existing raw SQL only for legacy list pieces.
   - Update in-memory port and service tests.
   - Checks: `vitest` for `doctor-clients` service/port tests; `tsc --noEmit` for webapp.

3. **Doctor APIs and settings defaults** — [x]
   - Add `GET/PATCH /api/doctor/clients/[userId]/support-settings` with thin handler: auth, zod, call service.
   - Add two doctor-scope keys to `ALLOWED_KEYS` and `DOCTOR_SCOPE_KEYS`.
   - Use `updateSetting` for defaults so system_settings mirror remains consistent.
   - Checks: route tests for support settings and doctor settings keys.

4. **Doctor UI and filters** — [x]
   - Add toggle and comments/media controls in `ClientProfileCard` near existing patient header/program area.
   - Change `loadDoctorTodayDashboard` to `listClients({ supportStatus: 'on' })`; update Today href to `?scope=all&support=on`.
   - Add `support=programWithoutSupport` list filter and link label for patients with active doctor-program but no support.
   - Checks: `DoctorTodayDashboard.test.tsx`, client page/filter tests where present.

5. **Patient UI gates** — [x]
   - In RSC loaders for program detail and item page, load effective policy for current patient and pass structured props to clients.
   - Keep visibility based on doctor assignment + admin rollout flags; disable controls when support policy denies.
   - Do not add extra explanatory UI copy beyond disabled state / accessibility labels.
   - Checks: patient treatment UI tests for visible-disabled and hidden cases.

6. **Patient API gates** — [x]
   - Add shared helper for effective comments/media access so discussion routes, media routes, presign/confirm/status and legacy `observation-note` use the same rule.
   - Keep service domain guards for promo/course/clinical_test/inactive items as invariant backstop.
   - Checks: route tests for 403 when support policy disables comments/media; existing promo/course tests still pass.

7. **Docs and phase gate** — [x]
   - Update metrics docs: `onSupportCount` now means `doctor_patient_support.on_support=true`, not active program.
   - Update active initiative log and `docs/TODO.md` checkbox/status notes.
   - Run targeted tests first, then phase-level `pnpm --dir apps/webapp test` or project webapp test command appropriate to changed area.

## Definition Of Done

- [x] `onSupportCount` and Today support list use `doctor_patient_support.on_support`, not active program.
- [x] Existing active doctor-program patients are backfilled to `on_support=true`.
- [x] Doctor can toggle support and per-patient comments/media settings from the client card.
- [x] Patients see comments/media controls disabled when policy denies, and API cannot be bypassed.
- [x] «Программа без сопровождения» filter lists active doctor-program patients with `on_support=false`.
- [x] Relevant route/unit/UI tests pass; docs/log reflect the new metric definition.

## Пост-аудит (2026-06-02)

- Доработки UX (`support` только при `scope=all`, `listBasePath`, ссылка на «Сегодня»), route-тесты policy gate, `inMemory` фильтры, `api.md` / `PROMO_ASSIGNMENT_SOURCE.md` — см. LOG §«доработки по аудиту».
