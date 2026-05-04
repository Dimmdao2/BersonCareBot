# PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE

> **Архив (2026-05-05).** Папка перенесена из `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/` в **`docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/`**. Этапы A/B/C и документация закрыты 2026-05-04; операционный канон по пунктам **1.0 / 1.1 / 1.1a** остаётся в [`ROADMAP_2.md`](../../../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §3.

Мини-инициатива по **рабочему экрану программы лечения** пациента: список `/app/patient/treatment-programs` и деталь `/app/patient/treatment-programs/[instanceId]`, плюс data-enabler `started_at` для корректной даты ожидаемого контроля по этапу.

**Статус:** этапы **A / B / C** закрыты (2026-05-04); глобальное закрытие документации и ROADMAP — [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md) + запись **GLOBAL FIX** в [`LOG.md`](LOG.md).

**Операционный источник правды по приоритету и DoD:** [`ROADMAP_2.md`](../../../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) — пункты **1.0**, **1.1**, **1.1a** (часть 1, §3).

## Зачем отдельная папка

По [`ROADMAP_2.md`](../../../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §9 каждая пациентская поверхность — отдельный мини-проход с собственным `README` + `STAGE_PLAN` + `LOG`. Здесь объединены **три связанных шага** одного продуктового среза (список + деталь + миграция), чтобы не плодить три отдельные папки с дублированием контекста.

## Документы внутри инициативы

| Файл | Назначение |
|------|------------|
| [`STAGE_PLAN.md`](STAGE_PLAN.md) | Индекс порядка A → B → C, таблица файлов, DoD всей мини-инициативы |
| [`STAGE_A.md`](STAGE_A.md) | Этап **A** (roadmap **1.0**): `started_at`, миграция, тесты |
| [`STAGE_B.md`](STAGE_B.md) | Этап **B** (roadmap **1.1a**): деталь `[instanceId]` |
| [`STAGE_C.md`](STAGE_C.md) | Этап **C** (roadmap **1.1**): список `/treatment-programs` |
| [`PROMPTS_COPYPASTE.md`](PROMPTS_COPYPASTE.md) | Копипаст-конвейер: `A/B/C (EXEC->AUDIT->FIX)` -> `GLOBAL AUDIT` -> `GLOBAL FIX` -> `PREPUSH POSTFIX` |
| [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md) | Итоговый аудит мини-инициативы после A/B/C + MANDATORY FIX по severity |
| [`LOG.md`](LOG.md) | Журнал исполнения (решения, проверки, что не делали) |

## Продуктовые инварианты (MVP)

- Страница отвечает на вопрос **«что мне сейчас делать по назначению»**, а не на дашборд с ложной аналитикой.
- **Не показывать** проценты «прогресса» (`% за день`, `% этапа`, `% программы`) до появления модели периодичности/расписания — см. `ROADMAP_2` §1.1 / §1.1a.
- **Этап 0** (`sort_order = 0`) — отдельный блок «Общие рекомендации», не смешивать с текущим этапом прохождения.
- **Дата ожидаемого контроля:** `stage.started_at + stage.expected_duration_days`, только если оба заданы (после внедрения **1.0**).
- **«План обновлён»** — сигнал изменений от врача, не метрика прогресса.

## Правила кода и UI

- `.cursor/rules/patient-ui-shared-primitives.mdc` — `patientVisual.ts`, shadcn base, `#app-shell-patient`.
- `.cursor/rules/clean-architecture-module-isolation.mdc` — модули без прямого импорта `@/infra/db/*` / `@/infra/repos/*`; DI через `buildAppDeps`.
- **Исключение цикла ROADMAP_2:** миграция + поле `started_at` на `treatment_program_instance_stages` (п. **1.0**); других правок закрытого ядра без явного решения не расширять.

## Правило исполнения (жестко)

- Перед любым действием по этапу агент обязан прочитать rules из [`STAGE_PLAN.md`](STAGE_PLAN.md) и зафиксировать это в [`LOG.md`](LOG.md) до правок кода.
- Без записи `read-rules + scope` в [`LOG.md`](LOG.md) этап считается не начатым.

## Post-MVP (не в этой инициативе до закрытия MVP)

- Несколько контролей внутри одного этапа (история / перенос / следующий контроль).
- Комментарий пациента к факту выполнения `exercise` / `lesson` / actionable `recommendation`.

См. также: [`../TODO.md`](../../../TODO.md) (раздел Treatment program), [`../BACKLOG_TAILS.md`](../../../BACKLOG_TAILS.md).

## Связанные документы

- [`../APP_RESTRUCTURE_INITIATIVE/E2E_ACCEPTANCE_AFTER_AB.md`](../../../APP_RESTRUCTURE_INITIATIVE/E2E_ACCEPTANCE_AFTER_AB.md)
- [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md)
- [`../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`](../../../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md)
