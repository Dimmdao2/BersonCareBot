# Execution Log: Механика напоминаний

---

## STAGE 1 — Контракты и схема

| Задача | Статус | Артефакт | Замечания |
|--------|--------|----------|-----------|
| S1.T01 Доменная модель | pending | | |
| S1.T02 reminder_journal | pending | | |
| S1.T03 Расширение occurrence_history | pending | | |
| S1.T04 API-контракты | pending | | |
| S1.T05 Inline keyboard layout | pending | | |
| S1.T06 Фикс вопросов UX | pending | | |
| S1.T07 Deep link формат | pending | | |

**Аудит S1:** pending  
**Фиксы S1:** —

---

## STAGE 2 — DB + Core-сервис

| Задача | Статус | Файлы | CI |
|--------|--------|-------|----|
| S2.T01 Миграция 048 | pending | | |
| S2.T02 Миграция 049 | pending | | |
| S2.T03 types.ts + ports.ts | pending | | |
| S2.T04 pgReminderRules | pending | | |
| S2.T05 ReminderJournalPort | pending | | |
| S2.T06 service расширение | pending | | |
| S2.T07 API route handlers | pending | | |
| S2.T08 Integrator-facing API | pending | | |
| S2.T09 buildAppDeps wiring | pending | | |
| S2.T10 Тесты | pending | | |

**Аудит S2:** pending  
**Фиксы S2:** —

---

## STAGE 3 — Бот-уведомления

| Задача | Статус | Файлы | CI |
|--------|--------|-------|----|
| S3.T01 Шаблон напоминания | pending | | |
| S3.T02 Inline-кнопки | pending | | |
| S3.T03 Snooze handler | pending | | |
| S3.T04 Skip handler | pending | | |
| S3.T05 Deep link builder | pending | | |
| S3.T06 Фикс вопросов | pending | | |
| S3.T07 Skip reason guard | pending | | |
| S3.T08 MAX адаптация | pending | | |
| S3.T09 Тесты | pending | | |

**Аудит S3:** pending  
**Фиксы S3:** —

---

## STAGE 4 — Webapp UI

| Задача | Статус | Файлы | CI |
|--------|--------|-------|----|
| S4.T01 LfkComplexCard | pending | | |
| S4.T02 Список ЛФК | pending | | |
| S4.T03 ReminderCreateDialog | pending | | |
| S4.T04 API интеграция | pending | | |
| S4.T05 Кнопка разминок | pending | | |
| S4.T07 Произвольные напоминания | pending | | |
| S4.T08 Единый список | pending | | |
| S4.T09 Изменение расписания | pending | | |
| S4.T10 Статистика | pending | | |

**Аудит S4:** pending  
**Фиксы S4:** —

---

## STAGE 5 — Тест и релиз

| Задача | Статус | Замечания |
|--------|--------|-----------|
| S5.T01 Тест-матрица | pending | |
| S5.T02 Миграции dev | pending | |
| S5.T03 Дополнительные тесты | pending | |
| S5.T04 pnpm run ci | pending | |
| S5.T05 Pre-release checklist | pending | |

---

## GLOBAL AUDIT

**Verdict:** pending  
**Замечания:** —

---

## GLOBAL FIX

**Исправления:** —  
**CI после фиксов:** —

---

## Pre-release Checklist

- [ ] Все миграции применяются на dev и prod
- [ ] Все тесты зелёные
- [ ] `pnpm run ci` зелёный
- [ ] Нет TODO/FIXME/HACK без комментария
- [ ] Нет console.log в production-коде
- [ ] Нет hardcoded secrets
- [ ] Inline-кнопки ≤ 64 байт callback_data
- [ ] Skip reason НЕ утекает админу
- [ ] Существующие категории напоминаний работают
- [ ] Diary tabs не сломаны
- [ ] Content sections не сломаны
- [ ] Support relay работает
- [ ] Фикс вопросов не ломает обычный admin forward
