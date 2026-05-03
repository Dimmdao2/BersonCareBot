# STAGE D1 PLAN — `measure_kinds` как управляемый системный справочник (Q6 step-1)

## 1. Цель

Дать врачу/админу доступ к системному справочнику `measure_kinds`: просмотр, редактирование и упорядочивание списка без merge/dedup логики.

## 2. Scope

### In scope
- UI-страница управления `measure_kinds`.
- API/порт для update (label/sortOrder/isActive если поддерживаем архивирование) или эквивалент soft-delete policy.
- Валидация уникальности `code` и безопасного редактирования `label`.

### Out of scope
- merge/dedup разных строк.
- миграция таблицы `clinical_test_measure_kinds` в другую структуру.

## 3. Технические решения

- Базовая модель данных остаётся `clinical_test_measure_kinds`.
- UI по паттерну `references/[categoryCode]/ReferenceItemsTableClient` (DnD + batch save).
- Источник правды для клинических тестов остаётся API `measure-kinds`.

## 4. Пошаговая реализация

1. Добавить в модуль `measureKinds` методы update/list-management (port + service + pg/inMemory).
2. Расширить API для управления (`PATCH`/`POST batch` — по выбранной схеме).
3. Реализовать страницу doctor settings/references для `measure_kinds`.
4. Привязать к существующему combobox: после сохранения список отражается без перезагрузки.
5. Обновить `api.md`.

## 5. Усиленный execution checklist

1. [ ] `rg "measureKinds|clinical_test_measure_kinds"` до начала: подтверждён текущий контур.
2. [ ] Обновлены port + service + pg + inMemory (паритет контрактов).
3. [ ] Добавлена управленческая API-операция с валидацией input.
4. [ ] Добавлена UI-страница со статусами save/error и оптимистичным UX.
5. [ ] Обновлён `api.md` (request/response и ограничения).
6. [ ] Unit-тесты service/port поведения (включая конфликт и пустой label).
7. [ ] UI-тест smoke: правка title/order отражается в таблице и в `CreatableComboboxInput`.
8. [ ] `eslint` по изменённым файлам.
9. [ ] `vitest` по изменённым файлам.
10. [ ] `tsc --noEmit`.
11. [ ] Запись в `LOG.md`.

## 6. Stage DoD

- Управление `measure_kinds` доступно из UI.
- Негативные пути (конфликт/пустой label) не ломают форму.
- Каталог клинических тестов продолжает работать без регрессий.
