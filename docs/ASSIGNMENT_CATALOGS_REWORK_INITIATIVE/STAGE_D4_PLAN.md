# STAGE D4 PLAN — Q2: инстансное прохождение `qualitative` и этапный прогресс

## 0. Продуктовый вход

**Ничего решать владельцу не нужно:** сценарий уже зафиксирован в продуктовом ТЗ §8.2 (Q2) — для `qualitative` тот же контур прогресса, что и для остальных типов. Этап D4 — **техническая** проверка и тесты: что UI/API при сдаче теста в **экземпляре программы** передают итог (`normalizedDecision` / эквивалент), когда авто-вывод из числового score невозможен.

## 1. Цель

Зафиксировать и (если нужно) выровнять поведение: `qualitative` тесты проходят тот же путь «результат отмечен -> этапный прогресс -> следующий этап», как и прочие типы.

## 2. Scope

### In scope
- Анализ текущих progress-путей (`progress-service`, `patient-program-actions`).
- Выравнивание контракта submit/decision для `test_set`.
- Документация и тесты сценария `qualitative` (без отдельного «особого» режима).

### Out of scope
- Новый UI-редизайн patient flow.
- Новая модель scoring.

## 3. Технические факты (baseline)

- `patientSubmitTestResult` уже принимает `normalizedDecision` и завершает stage item при `allDone`.
- При completion вызывается `maybeCompleteStageFromItems()`; это и есть точка этапного прогресса.
- Для `qualitative` infer-from-score может не сработать; тогда нужен явный `normalizedDecision`. Контракт **`POST .../progress/test-result`** (в т.ч. qualitative vs fallback по `score`) — в [`api.md`](../../apps/webapp/src/app/api/api.md) раздел patient treatment-program progress **test-result**.

## 4. Пошаговая реализация

1. Подтвердить текущий runtime-контракт для `qualitative` (API + service + UI path).
2. Если есть расхождения, добавить явную передачу `normalizedDecision` в UI/route для `qualitative`.
3. Добавить/обновить тесты: `qualitative` -> result persisted -> stage item completed -> stage transitions.
4. Обновить docs (`api.md` + initiative LOG).

## 5. Усиленный execution checklist

1. [x] `rg "patientSubmitTestResult|inferNormalizedDecisionFromScoring|maybeCompleteStageFromItems"` — baseline зафиксирован.
2. [x] Определён точный источник `normalizedDecision` для `qualitative`.
3. [x] Нет отдельной «ветки исключения» для qualitative, нарушающей общий прогресс.
4. [x] Добавлены/обновлены unit/integration тесты на `qualitative`.
5. [x] Проверен сценарий «результат -> completedAt -> stage completion».
6. [x] `api.md` уточнён (какой payload обязателен для qualitative).
7. [x] `eslint`.
8. [x] `vitest`.
9. [x] `tsc --noEmit`.
10. [x] `LOG.md` обновлён.

## 6. Stage DoD

- Для `qualitative` не требуется отдельный продуктовый режим: прохождение встроено в общий pipeline прогресса.
- Тесты и docs подтверждают поведение.
