# Лог выполнения: UX Cleanup + CMS/Media + Native Booking

Заполняется агентами по мере выполнения задач. Каждая запись — один атомарный шаг.

---

## Формат записи

```
### [Фаза].[ID] — [Название задачи]

- **Статус:** pending | in_progress | done | blocked | skipped
- **Агент/модель:** (кто выполнял)
- **Дата начала:**
- **Дата завершения:**
- **Изменённые файлы:**
  - `path/to/file.tsx` — что изменено
- **Тесты:** (добавлены / обновлены / не нужны)
- **CI:** (green / red — причина)
- **Замечания аудита:**
  - (если есть замечания от аудитора)
- **Доработки:**
  - (если были переделки после аудита)
```

---

## Фаза 0 — Чистка UI/UX

### 0.1 — Скрыть `/app/patient/purchases` из навигации

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app-layer/routes/navigation.ts` — удалён `purchases` из `HomeBlockId` и комментарии условной инъекции
  - `apps/webapp/src/app-layer/routes/navigation.test.ts` — добавлена проверка, что canonical-блоки не содержат `purchases`
  - `apps/webapp/src/app/app/patient/home/PatientHomeExtraBlocks.tsx` — убран legacy-meta блока `purchases` (фиксация typecheck после запуска CI)
- **Тесты:** обновлены unit-тесты `navigation.test.ts`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 0.2 — Скрыть `/app/patient/help` из навигации

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app-layer/routes/navigation.ts` — удалён `help` из `HeaderIconId` и наборов `headerRightIcons`
  - `apps/webapp/src/shared/ui/PatientHeader.tsx` — удалена ветка рендера `case "help"`
  - `apps/webapp/src/app-layer/routes/navigation.test.ts` — обновлены ожидаемые наборы иконок
- **Тесты:** обновлены unit-тесты `navigation.test.ts`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 0.3 — Скрыть `/app/patient/install` из навигации

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app-layer/routes/navigation.ts` — удалён флаг `showInstallPrompt` из модели и конфигов
  - `apps/webapp/src/app-layer/routes/navigation.test.ts` — удалены проверки `showInstallPrompt`
- **Тесты:** обновлены unit-тесты `navigation.test.ts`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 0.4 — Скрыть `/app/doctor/references` из меню

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/shared/ui/DoctorHeader.tsx` — удалён пункт `references` из `DOCTOR_MENU_LINKS`
  - `apps/webapp/src/shared/ui/doctorScreenTitles.ts` — удалён title для `/app/doctor/references`
  - `apps/webapp/src/shared/ui/doctorScreenTitles.test.ts` — удалён legacy-тест про `references` (фиксация падения CI)
- **Тесты:** обновлены unit-тесты `doctorScreenTitles.test.ts`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 0.5 — Убрать API-вызовы из broadcasts, скрыть или баннер

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/broadcasts/page.tsx` — удалены `buildAppDeps`, `getCategories`, `listAudit`; оставлен статический баннер
  - `apps/webapp/src/shared/ui/DoctorHeader.tsx` — удалён пункт `broadcasts` из меню
- **Тесты:** новых тестов не потребовалось
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 0.6 — Исправить DashboardTile CSS

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/page.tsx` — нормализован `className` у `DashboardTile`, убраны дублирующие классы
- **Тесты:** новых тестов не потребовалось
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 0.7 — Заменить «Быстрые действия» на дашборде

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/page.tsx` — удалена секция `doctor-dashboard-quick-actions`
  - `apps/webapp/src/app/app/doctor/page.tsx` — удалён неиспользуемый импорт `buttonVariants`
- **Тесты:** новых тестов не потребовалось
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 0.8 — Заменить мок-данные purchases на пустое состояние

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/patient/purchases/page.tsx` — удалены `MOCK_ITEMS` и рендер списка; добавлено пустое состояние
- **Тесты:** новых тестов не потребовалось
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

---

## Аудит Фазы 0

- **Аудитор:**
- **Дата:**
- **Результат:** (pass / fail)
- **Замечания:**

---

## Фаза 1 — CMS + Медиабиблиотека

### 1.1 — Множественная загрузка файлов

- **Статус:** pending
- **Агент/модель:**
- **Изменённые файлы:**
- **CI:**

### 1.2 — Прогресс-бар загрузки

- **Статус:** pending

### 1.3 — Drag-and-drop загрузка

- **Статус:** pending

### 1.4 — Мобильный capture

- **Статус:** pending

### 1.5 — Grid-режим просмотра

- **Статус:** pending

### 1.6 — Переключатель grid/table

- **Статус:** pending

### 1.7 — Lightbox

- **Статус:** pending

### 1.8 — Пагинация

- **Статус:** pending

### 1.9 — Кнопка «Скопировать URL»

- **Статус:** pending

### 1.10 — Модальный picker

- **Статус:** pending

### 1.11 — Предпросмотр контент-страницы

- **Статус:** pending

### 1.12 — Убрать sort_order из ContentForm

- **Статус:** pending

### 1.13 — Объединить news/motivation

- **Статус:** pending

---

## Аудит Фазы 1

- **Аудитор:**
- **Дата:**
- **Результат:**
- **Замечания:**

---

## Фаза 2 — Нативный модуль записи

*(записи добавляются по мере декомпозиции — 24 задачи, см. PLAN.md)*

---

## Аудит Фазы 2

- **Аудитор:**
- **Дата:**
- **Результат:**
- **Замечания:**

---

## Фаза 3 — UX кабинета врача

*(записи добавляются по мере декомпозиции — 6 задач, см. PLAN.md)*

---

## Фаза 4 — Рассылки

*(записи добавляются по мере декомпозиции — 4 задачи, см. PLAN.md)*

---

## Итоговый аудит ветки

- **Аудитор:**
- **Дата:**
- **CI финальный:**
- **Регресс-тесты:**
- **Решение:** merge / доработка
