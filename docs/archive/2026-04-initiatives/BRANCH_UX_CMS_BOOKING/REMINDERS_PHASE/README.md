# Фаза: Механика напоминаний

**Дата старта:** 2026-04  
**Папка:** `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/`  
**Зависимости:** Фаза 0 (чистка), частично Фаза 2 (booking catalog, content sections)

---

## Цели

1. **Объектные напоминания** — привязка к ЛФК-комплексам, разминкам, тренировкам с глубокой ссылкой на контент.
2. **Произвольные напоминания** — пользователь создаёт напоминание для любого действия (текст + расписание).
3. **Мультиканальная доставка** — Telegram, MAX; позже WhatsApp, VK, push (webapp).
4. **Интерактивные уведомления** — inline-кнопки: открыть видео, отложить (30/60/120 мин), пропустить сегодня (с причиной).
5. **Журнал и статистика** — выполнения, пропуски, отложения; видно пациенту и врачу.
6. **Управление напоминаниями** — из раздела «Помощник», из ЛФК-списка, из разминок.
7. **Фикс механизма вопросов** — подтверждение перед отправкой вопроса администратору.

---

## Файлы фазы

| Файл | Назначение |
|------|------------|
| `README.md` | Этот файл — контекст и цели |
| `PLAN.md` | Мастер-план со стадиями, задачами, оценками |
| `PROMPTS_EXEC_AUDIT_FIX.md` | Готовые промпты для каждого шага (copy-paste) |
| `EXECUTION_LOG.md` | Лог выполнения (заполняется агентами) |

---

## Исходные документы

| Документ | Путь |
|----------|------|
| Текущие напоминания (модуль) | `apps/webapp/src/modules/reminders/` |
| Текущие напоминания (интегратор) | `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts` |
| Scheduler (интегратор) | `apps/integrator/src/infra/runtime/scheduler/main.ts` |
| Миграции напоминаний | `apps/webapp/migrations/010_reminders_content_access.sql`, `032_reminder_seen_status.sql` |
| ЛФК-модули | `apps/webapp/src/modules/lfk-exercises/`, `lfk-templates/`, `lfk-assignments/` |
| Контент-секции | `apps/webapp/src/modules/content-catalog/`, `apps/webapp/src/infra/repos/pgContentSections.ts` |
| Декомпозиционная модель | `docs/BRANCH_UX_CMS_BOOKING/DECOMPOSITION_MODEL.md` |
| Архитектура | `docs/ARCHITECTURE/SERVER CONVENTIONS.md` |

---

## Принцип: что уже есть

- **`reminder_rules`** — таблица правил напоминаний (category, interval, window, daysMask). Привязаны к `integrator_user_id`.
- **`reminder_occurrence_history`** — история срабатываний (sent_at, seen_at).
- **Scheduler (integrator)** — `reminders.dispatchDue` в цикле tick → рендерит шаблон, отправляет `message.send` intent.
- **Webapp** — UI правил (`/app/patient/reminders`), toggle/schedule, 30-дневная статистика.
- **Проблемы текущей системы:**
  - Нет привязки к объекту (ЛФК-комплексу, разминке, тренировке).
  - Нет произвольных пользовательских напоминаний.
  - Нет inline-кнопок (snooze, skip, open video) в уведомлениях.
  - Нет журнала пропусков с причинами.
  - Нет создания напоминаний из контекста контента (ЛФК-список, разминки).
