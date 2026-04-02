# Execution Log: Механика напоминаний

---

## STAGE 1 — Контракты и схема

| Задача | Статус | Артефакт | Замечания |
|--------|--------|----------|-----------|
| S1.T01 Доменная модель | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Добавлены `linked_object_type`, `linked_object_id`, `custom_title`, `custom_text` в контракт модели |
| S1.T02 reminder_journal | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Полный draft SQL для расширения `reminder_rules` и создания `reminder_journal` |
| S1.T03 Расширение occurrence_history | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Полный draft SQL для `snoozed_*`/`skipped_*` полей |
| S1.T04 API-контракты | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Описаны request/response JSON schema для всех новых endpoint-ов |
| S1.T05 Inline keyboard layout | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Зафиксированы layout, callback format, snooze/skip flow |
| S1.T06 Фикс вопросов UX | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Подтверждение вопроса "да/нет" и правила anti-forward |
| S1.T07 Deep link формат | done | `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md` | Форматы deep link для ЛФК и разминок + fallback |

**Аудит S1:** rework (major замечания) -> fixed in contracts  
**Фиксы S1:** 2026-04-02, обновлён `STAGE_1_CONTRACTS.md`:
- Добавлены ownership/authorization invariants для всех patient API.
- Добавлены contract-level idempotency guards для snooze/skip/done.
- Уточнён deep-link для `lfk_complex` на маршрут с `complexId`.
- Добавлены read-контракты `journal`/`journal stats` + источник события `done`.
- Добавлен terminal-step для skip flow (`ack + state=idle`).
- Синхронизирована нумерация миграций S2 с `PLAN.md` (`050`/`051`, см. также `STAGE_1_CONTRACTS.md`).

---

## STAGE 2 — DB + Core-сервис

| Задача | Статус | Файлы | CI |
|--------|--------|-------|----|
| S2.T01 Миграция 050 | done | `apps/webapp/migrations/050_reminder_rules_object_links_and_journal.sql` | green |
| S2.T02 Миграция 051 | done | `apps/webapp/migrations/051_reminder_occurrence_actions.sql` | green |
| S2.T03 types.ts + ports.ts | done | `modules/reminders/types.ts`, `ports.ts` | green |
| S2.T04 pgReminderRules | done | `infra/repos/pgReminderRules.ts`, `inMemoryReminderRules.ts` | green |
| S2.T05 ReminderJournalPort | done | `reminderJournalPort.ts`, `pgReminderJournal.ts`, `inMemoryReminderJournal.ts` | green |
| S2.T06 service расширение | done | `modules/reminders/service.ts` | green |
| S2.T07 API route handlers | done | `app/api/patient/reminders/create`, `[id]`, `[id]/snooze`, `[id]/skip` | green |
| S2.T08 Integrator-facing API | done | `pgReminderProjection`, `buildReminderDeepLink.ts` | green |
| S2.T09 buildAppDeps wiring | done | `app-layer/di/buildAppDeps.ts` | green |
| S2.T10 Тесты | done | `modules/reminders/service.test.ts` | green |

**Аудит S2:** pending  
**Фиксы S2:** —  
**CI после S2:** `pnpm run ci` green (2026-04-02)

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
