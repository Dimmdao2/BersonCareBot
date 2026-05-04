# STAGE D6 PLAN — Global defer closure audit

## 1. Цель

Закрыть defer-wave формальным аудитом **D1–D4**, зафиксированным статусом **D5** и сверкой с продуктовым планом §5/§7/§8.

## 2. Scope

### In scope
- Сводный аудит результатов D1–D4 и **зафиксированного** статуса D5 (включая `deferred (owner pause)` без spike).
- Учёт отдельного инженерного follow-up **`DROP clinical_tests.scoring_config`** (решение владельца; см. продуктовый план §7) — в аудите отметить, применена ли миграция на момент закрытия D6 или остаётся в backlog.
- Проверка, что отклонённые пункты (`publication_status`, bulk API) не «протекли» в код.
- Проверка согласованности §5/§7/§8 продуктового плана с фактическим кодом.

### Out of scope
- Новые фичи.
- Редизайн за пределами аудита D1–D4 и фиксации статуса D5.

## 3. Артефакты

- `AUDIT_STAGE_D1.md` … `AUDIT_STAGE_D4.md` обязательны; `AUDIT_STAGE_D5.md` — **если** D5 выходил из паузы и выполнялся; иначе в глобальном аудите явная строка про статус D5.
- `AUDIT_DEFER_CLOSURE_GLOBAL.md` (новый сводный файл).
- Обновление `LOG.md`.

## 4. Усиленный execution checklist

1. [x] Собраны stage-аудиты D1–D4 с verdict + зафиксирован статус D5 (`done` / `deferred with evidence` / `deferred (owner pause)`).
2. [x] Проверено отсутствие незакрытых critical/major.
3. [x] Проверено, что решения «не делаем» (`publication_status`, bulk API) соблюдены.
4. [x] Product plan §5/§7/§8 синхронизирован с кодом.
5. [x] `AUDIT_DEFER_CLOSURE_GLOBAL.md` создан и содержит residual risks/defer.
6. [x] Таргетный sanity-run по изменённым зонам (`eslint`, `vitest`, `tsc`).
7. [x] `LOG.md` обновлён.

## 5. Stage DoD

- Defer-wave имеет формально завершённый audit trail.
- Решения и фактическая реализация не расходятся.
