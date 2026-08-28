# Current State Baseline

Стартовый факт-снимок UX-01 на 2026-07-15 reconciled route inventory `150/150`; U0 current-source reconciliation
2026-07-19 supersedes only that live denominator with `152/152` while preserving this dated runtime evidence.
Patient replay выполнен. Независимый
patient-replay audit завершён с **PASS — UX-01 factual current-state audit complete**; канонический verdict и
сохранённые finding-only ограничения: [`UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md`](./UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md).

## Текущая среда UX-аудита

- DEV обновлена из TEST, миграции применены и является изменяемой UX-песочницей; прежний missing-function blocker больше не актуален.
- Раздельные входы существуют для public, registration entry, patient, regular doctor, clinic admin и global admin.
- TEST A/B walkthrough даёт актуальные desktop-состояния clinic-owner/clinic-admin и tenant separation.
- Current DEV освобождён от скопированного TEST-only settings lock по прямому разрешению владельца;
  `patient_app_maintenance_enabled=false` установлен стандартным API. Booking, treatment, profile/settings и
  patient navigation подтверждены. Today отдельно падает с `organization_principal_required` даже после
  восстановления active enrollment synthetic `dev:client`.

## Уже существует

### Public / entry

- `/` — patient-oriented landing с PWA install и секцией для специалиста;
- `/book/*` — публичная запись;
- `/legal/*` — privacy/terms;
- PWA разделена на patient и staff surfaces.
- `/api/auth/dev-public?view=registration` открывает specialist/organization registration с email, password, specialist name и organization title, когда `specialist_signup_enabled=true`; это подтверждено после контролируемого изменения setting через стандартный DEV admin API. Submit не проверялся.

### Patient

- primary navigation: `Сегодня`, `Упражнения`, `Статистика`, `Запись`, `Чат`;
- профиль доступен из header;
- treatment, diary, booking, messages, reminders, notifications, help, install и content существуют;
- identity tiers `guest → onboarding → patient` уже формализованы;
- подтверждённый email достаточен для patient tier, trusted phone дополнительно нужен для native booking.

### Specialist

- primary sections: `Сегодня`, `Пациенты`, `Расписание`, `Коммуникации`;
- каталоги назначений, CMS, media, courses;
- clinic-admin sections `Врачи` и `Настройки клиники`;
- global-admin sections analytics, platform settings и system health;
- во время активной UI-переработки layout families определяются по текущему коду и live UI; прежний inventory
  архивирован и не является authority.
- regular doctor, clinic admin и global admin имеют различимые server-derived role/navigation boundaries; assistant capability boundary остаётся не определена.

### Organization / SaaS

- membership roles: `owner`, `admin`, `doctor`, `assistant`;
- server-derived organization workspace context;
- clinic member list и email invite creation;
- invite accept API flow;
- org-scoped clinic settings;
- entitlement types и SaaS tariff/store plans;
- public clinic directory target model уже проработана в SaaS S6.

## Главные разрывы

| Область                  | Текущее состояние                            | Нужный discovery result                                           |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------- |
| Platform landing         | Прежде всего patient/PWA                     | Specialist-oriented acquisition IA с компактным patient entry     |
| Staff invite             | Создаётся URL для ручного копирования        | Delivery, accept, first-login, expired/revoked/error flows        |
| Patient invite           | Единого SaaS join flow не найдено            | Email-first invite, SMS fallback, activation, enrollment, install |
| Organization workspace   | Members/settings смешаны с doctor navigation | Целевая management IA и связь с clinical mode                     |
| Global admin             | Встроен в doctor sidebar                     | Отдельная platform-operations IA                                  |
| Multi-org patient        | Data foundation существует                   | Явный context selection и cross-org UX contract                   |
| Multi-specialist patient | Специалист присутствует в отдельных доменах  | Единая модель attribution, conversations и appointments           |
| Branding                 | В основном platform BersonCare               | Surface matrix и entitlement tiers                                |
| Custom domains           | Roadmap contract, UI нет                     | Verification/status/error/canonical redirect UX                   |
| Public organization page | Target projection описана, UI не закрыт      | Directory/profile/booking/join screen composition                 |

## Нельзя заключать без аудита

- наличие route не означает готовый рабочий сценарий;
- старые target-structure документы местами расходятся с текущей navigation implementation;
- invite API не означает доставку email;
- org-scoped setting не означает готовую white-label модель;
- один global identity не определяет автоматически UI выбора care context.
