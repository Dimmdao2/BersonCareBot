# STAGE D2 PLAN — `assessmentKind` в системный справочник БД (Q1)

## 1. Цель

Убрать жёсткую зависимость `assessmentKind` от TypeScript enum и перевести значения в БД-справочник, редактируемый через системный контур.

## 2. Scope

### In scope
- Новый источник `assessmentKind`: `reference_items` (категория `clinical_assessment_kind`) или согласованный эквивалент.
- Миграция/сид текущих v1 кодов.
- Обновление формы, фильтров списка и API валидации клин. тестов.

### Out of scope
- Изменение механики scoring.
- Изменение публикационных осей B1.

## 3. Технические решения

- Предпочтительно: категория в `reference_categories` + записи в `reference_items` (reuse существующего механизма управления).
- `tests.assessment_kind` остаётся текстовым кодом на этапе D2 (без обязательного FK), но валидация выполняется через справочник.
- Фоллбек legacy: при нераспознанном коде — не падать в list read, но блокировать новые invalid write.

## 4. Пошаговая реализация

1. Миграция: создать категорию/сиды `clinical_assessment_kind`.
2. Добавить модульный accessor `listAssessmentKinds()` через references порт.
3. Заменить `isClinicalAssessmentKind`-хардкод на валидацию по справочнику в server action/API.
4. Обновить `ClinicalTestForm` и фильтры списка на динамический источник.
5. Обновить тесты и `api.md`.

## 5. Усиленный execution checklist

1. [ ] `rg "isClinicalAssessmentKind|CLINICAL_ASSESSMENT_KIND_OPTIONS|assessment_kind"` — список точек замены зафиксирован.
2. [ ] Добавлена миграция category + seed items.
3. [ ] Динамический лист значений доступен в UI формы и списка.
4. [ ] write-path (actions/API/service) валидирует коды по справочнику.
5. [ ] read-path корректно обрабатывает legacy/unknown коды (без 500).
6. [ ] Обновлены unit-тесты на валидацию и list query.
7. [ ] Обновлён `api.md`.
8. [ ] `eslint`.
9. [ ] `vitest`.
10. [ ] `tsc --noEmit`.
11. [ ] `LOG.md` обновлён.

## 6. Stage DoD

- Новые/редактируемые клин. тесты используют справочник БД для `assessmentKind`.
- Текущие записи не ломают чтение.
- UI не содержит захардкоженного enum как единственный источник правды.
