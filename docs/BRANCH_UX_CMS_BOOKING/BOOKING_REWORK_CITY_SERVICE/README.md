# Booking Rework: City + Service (In-person)

Цель папки: дать авто-агенту исполнимый набор этапов для перехода на корректную модель очной записи:

- пациент выбирает `город -> услуга -> время`;
- сотрудник не выбирается в UI;
- webapp резолвит Rubitime IDs и передает их в integrator;
- integrator остается техническим мостом к Rubitime.

Источник бизнес-данных для seed:

- `docs/BRANCH_UX_CMS_BOOKING/FUTURE_SETTINGS_TOCHKA_ZDOROVYA.md`

## Порядок этапов (первичный rework in-person city+service, Stages 1–7)

1. `STAGE_1_SPEC_AND_CONTRACTS.md`
2. `STAGE_2_DB_AND_SEED.md`
3. `STAGE_3_ADMIN_CATALOG.md`
4. `STAGE_4_PATIENT_FLOW_IN_PERSON.md`
5. `STAGE_5_INTEGRATOR_BRIDGE_AND_CUTOVER.md`
6. `STAGE_6_TEST_AUDIT_RELEASE.md`
7. `STAGE_7_BOOKING_WIZARD_PAGES.md`

## Продолжение (Stages 8–15: аудит-ремедиация, online intake, compat-sync, release)

8. `STAGE_8_AUDIT_REMEDIATION.md` — закрытие замечаний аудита, docs-sync, cutover policy.
9. `STAGE_9_ONLINE_INTAKE.md` — спека и контракты online-потоков (LFK + nutrition intake).
10. `STAGE_10_INTAKE_DB_API.md` — миграции, репозитории, service layer и API для intake.
11. `STAGE_11_RUBITIME_COMPAT_BRIDGE.md` — полная совместимость Rubitime↔Webapp (compat-sync projection → patient_bookings).
12. `STAGE_12_PATIENT_WIZARD_ONLINE.md` — UI wizard online intake для пациента.
13. `STAGE_13_DOCTOR_ADMIN_INBOX.md` — Doctor/Admin inbox для обработки заявок.
14. `STAGE_14_RELEASE_HARDENING.md` — runbook, monitoring, rollback playbook.
15. `STAGE_15_FINAL_TEST_AUDIT_RELEASE.md` — финальный test suite, global audit, release sign-off.

## Обязательные сопутствующие документы

- Лог выполнения: `EXECUTION_LOG.md`
- Чек-листы этапов и релиза: `CHECKLISTS.md`
- Совместимость Rubitime↔Webapp: `COMPATIBILITY_RUBITIME_WEBAPP.md`

## Стандарт атомарной задачи (для авто-агента)

Каждая задача в этапах содержит:

- ID (`Sx.Tyy`);
- цель;
- предусловия;
- конкретные файлы;
- пошаговую реализацию;
- тесты;
- критерии готовности;
- запись в лог (`EXECUTION_LOG.md`).

Ограничение на размер задачи:

- 1-4 файла изменения;
- 1 фокус (schema/API/UI/test);
- завершение за один проход авто-агента.
