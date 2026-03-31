# Промпты для выполнения: копируй и запускай

Каждый промпт — самодостаточный. Копируй целиком, вставляй в указанную модель.

---

## Порядок выполнения

```
ЭТАП 1: Декомпозиция Фазы 0      → GPT 5.3 / Sonnet 4.6 (этот чат или новый)
ЭТАП 2: Реализация Фазы 0         → Composer 1.5 (auto)
ЭТАП 3: Аудит Фазы 0              → GPT 5.3 Codex
ЭТАП 4: Фиксы Фазы 0              → Composer 1.5 (auto)
ЭТАП 5: Декомпозиция Фазы 1       → GPT 5.3 / Sonnet 4.6
ЭТАП 6: Реализация Фазы 1         → Composer 1.5 (auto) — блоками 1.A, 1.B, 1.C
ЭТАП 7: Аудит Фазы 1              → GPT 5.3 Codex
ЭТАП 8: Фиксы Фазы 1              → Composer 1.5 (auto)
ЭТАП 9: Декомпозиция Фазы 2       → GPT 5.3 / Sonnet 4.6
ЭТАП 10: Реализация Фазы 2        → Composer 1.5 (auto) — блоками 2.A, 2.B, 2.C
ЭТАП 11: Аудит Фазы 2             → GPT 5.3 Codex
ЭТАП 12: Фиксы Фазы 2             → Composer 1.5 (auto)
ЭТАП 13: Декомпозиция Фазы 3      → GPT 5.3 / Sonnet 4.6
ЭТАП 14: Реализация Фазы 3        → Composer 1.5 (auto)
ЭТАП 15: Аудит Фазы 3             → GPT 5.3 Codex
ЭТАП 16: Декомпозиция Фазы 4      → GPT 5.3 / Sonnet 4.6
ЭТАП 17: Реализация Фазы 4        → Composer 1.5 (auto)
ЭТАП 18: Аудит Фазы 4             → GPT 5.3 Codex
ЭТАП 19: Финальный аудит ветки     → GPT 5.3 Codex (или 5.4 при > 2 rework)
```

---

## ЭТАП 1 — Декомпозиция Фазы 0

**Модель:** GPT 5.3 или Sonnet 4.6 Opus (Cursor Agent)

```
Изучи документы:
- docs/BRANCH_UX_CMS_BOOKING/PLAN.md — раздел «Фаза 0»
- docs/BRANCH_UX_CMS_BOOKING/DECOMPOSITION_MODEL.md — шаблон атомарной задачи
- docs/REPORTS/UX_ANALYSIS_2026-03-31.md — контекст проблем

Затем изучи код файлов, которые нужно менять:
- apps/webapp/src/app-layer/routes/navigation.ts
- apps/webapp/src/shared/ui/PatientHeader.tsx
- apps/webapp/src/shared/ui/DoctorHeader.tsx
- apps/webapp/src/shared/ui/doctorScreenTitles.ts
- apps/webapp/src/app/app/doctor/page.tsx (DashboardTile)
- apps/webapp/src/app/app/doctor/broadcasts/page.tsx
- apps/webapp/src/app/app/patient/purchases/page.tsx

Для каждой задачи из Фазы 0 (0.1–0.8) создай атомарную спецификацию по шаблону из DECOMPOSITION_MODEL.md. Укажи точные файлы, строки, что убрать, что заменить.

Результат запиши в docs/BRANCH_UX_CMS_BOOKING/PHASE_0_TASKS.md
```

---

## ЭТАП 2 — Реализация Фазы 0

**Модель:** Composer 1.5 (auto)

```
Выполни все задачи из docs/BRANCH_UX_CMS_BOOKING/PHASE_0_TASKS.md последовательно.

Правила:
1. Перед каждой задачей прочитай её спецификацию из PHASE_0_TASKS.md
2. Внеси изменения в указанные файлы
3. После каждой задачи убедись, что нет lint-ошибок в изменённых файлах
4. После всех задач запусти pnpm run ci
5. Обнови docs/BRANCH_UX_CMS_BOOKING/AGENT_LOG.md — для каждой задачи заполни: статус done, изменённые файлы, CI результат
6. Коммит каждой задачи отдельно в формате: [0.N] краткое описание

Не добавляй новый функционал. Только убирай/скрывай/исправляй по спеку.
```

---

## ЭТАП 3 — Аудит Фазы 0

**Модель:** GPT 5.3 Codex

```
Проведи code review всех изменений Фазы 0.

Изучи:
1. docs/BRANCH_UX_CMS_BOOKING/PHASE_0_TASKS.md — спецификации задач
2. docs/BRANCH_UX_CMS_BOOKING/AGENT_LOG.md — лог выполнения
3. git diff main...HEAD — все изменения

Для каждой задачи 0.1–0.8 проверь:
- Изменения соответствуют спеку
- Нет сломанных импортов, unused imports
- Навигация корректна (нет битых ссылок)
- Нет регрессий в существующем функционале
- CSS без конфликтов

Используй шаблон аудита из docs/BRANCH_UX_CMS_BOOKING/DECOMPOSITION_MODEL.md (раздел 3).

Результат запиши в docs/BRANCH_UX_CMS_BOOKING/AUDIT_PHASE_0.md

В конце укажи: approve или rework + список конкретных замечаний для исправления.
```

---

## ЭТАП 4 — Фиксы Фазы 0

**Модель:** Composer 1.5 (auto)

*(Запускать только если аудит дал rework)*

```
Изучи docs/BRANCH_UX_CMS_BOOKING/AUDIT_PHASE_0.md.

Исправь все замечания аудитора. Для каждого замечания:
1. Найди указанный файл и строку
2. Внеси исправление
3. Проверь lint

После всех исправлений: pnpm run ci.
Обнови AGENT_LOG.md — добавь в каждую задачу раздел «Доработки».
Коммит: [0.fix] address audit remarks
```

---

## ЭТАП 5 — Декомпозиция Фазы 1

**Модель:** GPT 5.3 или Sonnet 4.6 Opus (Cursor Agent)

```
Изучи документы:
- docs/BRANCH_UX_CMS_BOOKING/PLAN.md — раздел «Фаза 1»
- docs/BRANCH_UX_CMS_BOOKING/DECOMPOSITION_MODEL.md — шаблон атомарной задачи
- docs/REPORTS/UX_ANALYSIS_2026-03-31.md — раздел 3 (Медиабиблиотека)

Изучи текущий код:
- apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx
- apps/webapp/src/app/app/doctor/content/library/page.tsx
- apps/webapp/src/app/app/doctor/content/MediaLibraryPickerDialog.tsx
- apps/webapp/src/app/app/doctor/content/ContentForm.tsx
- apps/webapp/src/app/app/doctor/content/ContentPagesSectionList.tsx
- apps/webapp/src/app/app/doctor/content/page.tsx
- apps/webapp/src/app/app/doctor/content/news/page.tsx
- apps/webapp/src/app/app/doctor/content/motivation/page.tsx
- API handlers: найди /api/admin/media и /api/media/upload

Разбей Фазу 1 на атомарные задачи по 3 блокам (1.A Загрузка, 1.B Просмотр, 1.C Picker/CMS).
Для каждой задачи создай полную спецификацию по шаблону из DECOMPOSITION_MODEL.md.

Результат: docs/BRANCH_UX_CMS_BOOKING/PHASE_1_TASKS.md
```

---

## ЭТАП 6 — Реализация Фазы 1

**Модель:** Composer 1.5 (auto)

Запускается 3 раза — по одному на блок.

### Блок 1.A (загрузка):
```
Выполни задачи блока 1.A из docs/BRANCH_UX_CMS_BOOKING/PHASE_1_TASKS.md (задачи 1.1–1.4).

Правила:
1. Прочитай спецификацию каждой задачи
2. Реализуй изменения
3. Проверь lint после каждой задачи
4. pnpm run ci после блока
5. Обнови AGENT_LOG.md
6. Коммит: [1.N] краткое описание
```

### Блок 1.B (просмотр):
```
Выполни задачи блока 1.B из docs/BRANCH_UX_CMS_BOOKING/PHASE_1_TASKS.md (задачи 1.5–1.9).

Правила те же: спек → код → lint → ci → log → commit [1.N].
```

### Блок 1.C (picker/CMS):
```
Выполни задачи блока 1.C из docs/BRANCH_UX_CMS_BOOKING/PHASE_1_TASKS.md (задачи 1.10–1.13).

Правила те же: спек → код → lint → ci → log → commit [1.N].
```

---

## ЭТАП 7 — Аудит Фазы 1

**Модель:** GPT 5.3 Codex

```
Проведи code review всех изменений Фазы 1 (CMS + Медиабиблиотека).

Изучи:
1. docs/BRANCH_UX_CMS_BOOKING/PHASE_1_TASKS.md — спецификации
2. docs/BRANCH_UX_CMS_BOOKING/AGENT_LOG.md — лог
3. git diff — изменения фазы 1

Проверь:
- Множественная загрузка работает (multiple + progress)
- Grid-view адаптивен (мобильный и десктоп)
- Drag-and-drop не ломает обычную загрузку
- Picker — настоящий Dialog/Sheet, не inline
- Нет регрессий в существующем CMS-функционале
- accept/capture атрибуты корректны

Результат: docs/BRANCH_UX_CMS_BOOKING/AUDIT_PHASE_1.md
```

---

## ЭТАП 8 — Фиксы Фазы 1

**Модель:** Composer 1.5 (auto)

*(Только при rework)*

```
Изучи docs/BRANCH_UX_CMS_BOOKING/AUDIT_PHASE_1.md.
Исправь все замечания. pnpm run ci. Обнови AGENT_LOG.md.
Коммит: [1.fix] address audit remarks
```

---

## ЭТАП 9 — Декомпозиция Фазы 2

**Модель:** GPT 5.3 или Sonnet 4.6 Opus (Cursor Agent)

```
Изучи документы:
- docs/BRANCH_UX_CMS_BOOKING/PLAN.md — раздел «Фаза 2»
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_MODULE_SPEC.md — полная спецификация
- docs/BRANCH_UX_CMS_BOOKING/DECOMPOSITION_MODEL.md — шаблон
- apps/integrator/src/integrations/rubitime/ — текущая интеграция (client.ts, schema.ts, webhook.ts, connector.ts)
- apps/webapp/src/app/app/patient/cabinet/page.tsx — текущий экран записей
- apps/webapp/src/app/app/patient/booking/page.tsx — текущий iframe

Разбей Фазу 2 на атомарные задачи по 3 блокам:
- 2.A: Backend (расписание, слоты, API, DB, синхронизация)
- 2.B: Frontend (экран записи, календарь, форма, карточки)
- 2.C: Интеграция (уведомления, напоминания, Google Calendar)

Каждая задача — по шаблону из DECOMPOSITION_MODEL.md.

ВАЖНО: для backend-задач указывай точную структуру модулей по конвенции проекта (порты, адаптеры, сервисы). Для frontend — точную структуру компонентов.

Результат: docs/BRANCH_UX_CMS_BOOKING/PHASE_2_TASKS.md
```

---

## ЭТАП 10 — Реализация Фазы 2

**Модель:** Composer 1.5 (auto)

### Блок 2.A (backend):
```
Выполни задачи блока 2.A из docs/BRANCH_UX_CMS_BOOKING/PHASE_2_TASKS.md.

Это backend-задачи: DB миграции, сервисы, API endpoints.
Следуй конвенциям проекта:
- Порты (interfaces) в modules/
- Адаптеры в infra/
- Роуты в app-layer/

pnpm run ci после блока. Обнови AGENT_LOG.md.
Коммит каждой задачи: [2.N] описание.
```

### Блок 2.B (frontend):
```
Выполни задачи блока 2.B из docs/BRANCH_UX_CMS_BOOKING/PHASE_2_TASKS.md.

Это frontend-задачи: новые страницы, компоненты, UI записи.
Используй существующие UI-компоненты проекта (shadcn/ui: Button, Card, Dialog, Sheet, Badge).
Mobile-first дизайн.

pnpm run ci после блока. Обнови AGENT_LOG.md.
Коммит: [2.N] описание.
```

### Блок 2.C (интеграция):
```
Выполни задачи блока 2.C из docs/BRANCH_UX_CMS_BOOKING/PHASE_2_TASKS.md.

Уведомления, напоминания, синхронизация с Rubitime и Google Calendar.
Используй существующие механизмы отправки сообщений в Telegram/MAX.

pnpm run ci после блока. Обнови AGENT_LOG.md.
Коммит: [2.N] описание.
```

---

## ЭТАП 11 — Аудит Фазы 2

**Модель:** GPT 5.3 Codex

```
Проведи code review Фазы 2 (нативный модуль записи на приём).

Изучи:
1. docs/BRANCH_UX_CMS_BOOKING/BOOKING_MODULE_SPEC.md — спецификация
2. docs/BRANCH_UX_CMS_BOOKING/PHASE_2_TASKS.md — задачи
3. git diff — изменения

Особое внимание:
- Безопасность: аутентификация на всех booking endpoints
- Целостность данных: транзакции при создании/отмене
- Синхронизация: Rubitime API ошибки не ломают локальную запись
- EXCLUDE constraint для пересечения слотов
- Корректность временных зон (UTC vs local)
- Обработка ошибок Google Calendar (не блокирует запись)

Результат: docs/BRANCH_UX_CMS_BOOKING/AUDIT_PHASE_2.md
```

---

## ЭТАП 12 — Фиксы Фазы 2

**Модель:** Composer 1.5 (auto)

```
Изучи docs/BRANCH_UX_CMS_BOOKING/AUDIT_PHASE_2.md.
Исправь замечания. pnpm run ci. Обнови AGENT_LOG.md.
Коммит: [2.fix] address audit remarks
```

---

## ЭТАП 13 — Декомпозиция Фазы 3

**Модель:** GPT 5.3 / Sonnet 4.6

```
Изучи docs/BRANCH_UX_CMS_BOOKING/PLAN.md — раздел «Фаза 3» (UX кабинета врача).
Изучи docs/BRANCH_UX_CMS_BOOKING/DECOMPOSITION_MODEL.md.

Изучи код:
- apps/webapp/src/app/app/doctor/clients/page.tsx
- apps/webapp/src/app/app/doctor/subscribers/page.tsx
- apps/webapp/src/app/app/doctor/clients/DoctorClientsPanel.tsx
- apps/webapp/src/app/app/doctor/messages/page.tsx
- apps/webapp/src/app/app/doctor/stats/page.tsx
- apps/webapp/src/app/app/doctor/page.tsx
- apps/webapp/src/app/app/doctor/exercises/page.tsx

Разбей 6 задач фазы 3 на атомарные спеки.

Результат: docs/BRANCH_UX_CMS_BOOKING/PHASE_3_TASKS.md
```

---

## ЭТАП 14 — Реализация Фазы 3

**Модель:** Composer 1.5 (auto)

```
Выполни все задачи из docs/BRANCH_UX_CMS_BOOKING/PHASE_3_TASKS.md.
pnpm run ci. Обнови AGENT_LOG.md. Коммиты: [3.N] описание.
```

---

## ЭТАП 15 — Аудит Фазы 3

**Модель:** GPT 5.3 Codex

```
Code review Фазы 3. Спеки: PHASE_3_TASKS.md. Diff: git diff.
Проверь: объединение списков не ломает ссылки, пагинация корректна, фильтры работают.
Результат: docs/BRANCH_UX_CMS_BOOKING/AUDIT_PHASE_3.md
```

---

## ЭТАП 16 — Декомпозиция Фазы 4

**Модель:** GPT 5.3 / Sonnet 4.6

```
Изучи docs/BRANCH_UX_CMS_BOOKING/PLAN.md — «Фаза 4» (Рассылки).
Изучи:
- apps/webapp/src/app/app/doctor/broadcasts/page.tsx
- Существующий сервис doctorBroadcasts (найди в коде)
- docs/BRANCH_UX_CMS_BOOKING/DECOMPOSITION_MODEL.md

Разбей 4 задачи на атомарные спеки.
Результат: docs/BRANCH_UX_CMS_BOOKING/PHASE_4_TASKS.md
```

---

## ЭТАП 17 — Реализация Фазы 4

**Модель:** Composer 1.5 (auto)

```
Выполни задачи из docs/BRANCH_UX_CMS_BOOKING/PHASE_4_TASKS.md.
pnpm run ci. Обнови AGENT_LOG.md. Коммиты: [4.N] описание.
```

---

## ЭТАП 18 — Аудит Фазы 4

**Модель:** GPT 5.3 Codex

```
Code review Фазы 4. Спеки: PHASE_4_TASKS.md. Diff: git diff.
Проверь: сегментация аудитории корректна, preview рассылки, двухшаговое подтверждение.
Результат: docs/BRANCH_UX_CMS_BOOKING/AUDIT_PHASE_4.md
```

---

## ЭТАП 19 — Финальный аудит ветки

**Модель:** GPT 5.3 Codex (эскалация на 5.4 при > 2 rework в любой фазе)

```
Финальный аудит всей ветки feature/ux-cms-booking перед мержем в main.

Изучи:
1. docs/BRANCH_UX_CMS_BOOKING/PLAN.md — весь план
2. docs/BRANCH_UX_CMS_BOOKING/AGENT_LOG.md — лог выполнения
3. Все аудиты: AUDIT_PHASE_0..4.md
4. git diff main...HEAD — полный diff

Проверь:
- Все задачи всех фаз закрыты (done в AGENT_LOG)
- pnpm run ci зелёный
- Нет TODO/FIXME/HACK без issue
- Нет console.log в production коде
- Навигация пациента: нет битых ссылок, нет заглушек
- Навигация врача: нет битых ссылок
- Booking: полный цикл (создание → подтверждение → напоминание → отмена)
- CMS: загрузка → просмотр → выбор в форме → предпросмотр
- Мобильный: все экраны адаптивны

Результат: docs/BRANCH_UX_CMS_BOOKING/FINAL_AUDIT.md
Решение: merge / доработка (с конкретным списком)

Если merge — обнови AGENT_LOG.md раздел «Итоговый аудит ветки».
```
