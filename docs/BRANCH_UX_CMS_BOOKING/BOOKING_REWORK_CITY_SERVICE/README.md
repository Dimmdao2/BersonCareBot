# Booking Rework: City + Service (In-person)

Цель папки: дать авто-агенту исполнимый набор этапов для перехода на корректную модель очной записи:

- пациент выбирает `город -> услуга -> время`;
- сотрудник не выбирается в UI;
- webapp резолвит Rubitime IDs и передает их в integrator;
- integrator остается техническим мостом к Rubitime.

Источник бизнес-данных для seed:

- `docs/BRANCH_UX_CMS_BOOKING/FUTURE_SETTINGS_TOCHKA_ZDOROVYA.md`

## Порядок этапов

1. `STAGE_1_SPEC_AND_CONTRACTS.md`
2. `STAGE_2_DB_AND_SEED.md`
3. `STAGE_3_ADMIN_CATALOG.md`
4. `STAGE_4_PATIENT_FLOW_IN_PERSON.md`
5. `STAGE_5_INTEGRATOR_BRIDGE_AND_CUTOVER.md`
6. `STAGE_6_TEST_AUDIT_RELEASE.md`

## Обязательные сопутствующие документы

- Лог выполнения: `EXECUTION_LOG.md`
- Чек-листы этапов и релиза: `CHECKLISTS.md`

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
