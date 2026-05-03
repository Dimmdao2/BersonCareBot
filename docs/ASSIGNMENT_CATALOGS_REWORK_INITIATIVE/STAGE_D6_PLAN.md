# STAGE D6 PLAN — Global defer closure audit

## 1. Цель

Закрыть defer-wave формальным аудитом D1–D5 и синхронизировать product/docs/implementation статусы.

## 2. Scope

### In scope
- Сводный аудит результатов D1–D5.
- Проверка, что отклонённые пункты (`publication_status`, bulk API) не «протекли» в код.
- Проверка согласованности §5/§7/§8 продуктового плана с фактическим кодом.

### Out of scope
- Новые фичи.
- Редизайн за пределами D1–D5.

## 3. Артефакты

- `AUDIT_STAGE_D1.md` … `AUDIT_STAGE_D5.md` (или эквиваленты по каждому этапу).
- `AUDIT_DEFER_CLOSURE_GLOBAL.md` (новый сводный файл).
- Обновление `LOG.md`.

## 4. Усиленный execution checklist

1. [ ] Собраны все stage-аудиты D1–D5 с verdict.
2. [ ] Проверено отсутствие незакрытых critical/major.
3. [ ] Проверено, что решения «не делаем» (`publication_status`, bulk API) соблюдены.
4. [ ] Product plan §5/§7/§8 синхронизирован с кодом.
5. [ ] `AUDIT_DEFER_CLOSURE_GLOBAL.md` создан и содержит residual risks/defer.
6. [ ] Таргетный sanity-run по изменённым зонам (`eslint`, `vitest`, `tsc`).
7. [ ] `LOG.md` обновлён.

## 5. Stage DoD

- Defer-wave имеет формально завершённый audit trail.
- Решения и фактическая реализация не расходятся.
