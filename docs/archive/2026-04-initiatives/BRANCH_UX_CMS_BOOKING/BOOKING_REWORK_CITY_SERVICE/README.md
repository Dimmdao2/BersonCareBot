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

**Вариант B (фактическая структура docs):** отдельные файлы `STAGE_8_*.md` … `STAGE_15_*.md` **не** добавляются в репозиторий; содержание Stages 8–15 сведено в **`EXECUTION_LOG.md`** (пошаговые задачи), **`CHECKLISTS.md` §7**, формальный разбор — **`AUDIT_STAGE_8_15.md`**. Единственный отдельный stage-файл из этого диапазона — **`STAGE_9_ONLINE_INTAKE.md`**.

| Stage | Кратко | Где искать (не битые ссылки) |
|------|--------|--------------------------------|
| 8 | Policy legacy-off, docs-sync, SHA-шаблон | `EXECUTION_LOG.md` §Stage 8; `CUTOVER_RUNBOOK.md` §6; `AUDIT_STAGE_8_15.md` |
| 9 | Спека online intake (LFK + nutrition) | **`STAGE_9_ONLINE_INTAKE.md`**; `API_CONTRACT_ONLINE_INTAKE_V1.md`; `MIGRATION_CONTRACT_ONLINE_INTAKE_V1.md` |
| 10 | Миграции + repos + API intake | `EXECUTION_LOG.md` §Stage 10; миграции `048_online_intake.sql` |
| 11 | Compat-sync Rubitime → `patient_bookings` | `EXECUTION_LOG.md` §Stage 11; `COMPATIBILITY_RUBITIME_WEBAPP.md` |
| 12 | Patient wizard online (LFK / nutrition) | `EXECUTION_LOG.md` §Stage 12; `STAGE_7_BOOKING_WIZARD_PAGES.md` (ссылки на intake в коде) |
| 13 | Doctor/admin inbox + notifications | `EXECUTION_LOG.md` §Stage 13; `apps/webapp/.../doctor/online-intake/` |
| 14 | Hardening, runbook, monitoring | `EXECUTION_LOG.md` §Stage 14; `CUTOVER_RUNBOOK.md` §7 и §«Проверки консистентности» |
| 15 | Финальный CI / readiness | `EXECUTION_LOG.md` §Stage 15 и §«Итог ветки (Stages 8–15)»; `CHECKLISTS.md` §7 |

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
