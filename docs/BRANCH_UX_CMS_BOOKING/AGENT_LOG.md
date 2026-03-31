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

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx` — включён множественный выбор файлов и batch-обработка
  - `apps/webapp/src/app/api/media/upload/route.ts` — добавлен приём нескольких файлов (`file`, `files`, `files[]`) с backward compatibility
  - `apps/webapp/src/app/api/media/upload/route.test.ts` — добавлены тесты multi-upload и mixed-batch ошибки
- **Тесты:** обновлены unit-тесты upload-route
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 1.2 — Прогресс-бар загрузки

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/content/library/uploadWithProgress.ts` — добавлен XHR helper с `onprogress` и типизированной ошибкой `UploadRequestError`
  - `apps/webapp/src/app/app/doctor/content/library/uploadWithProgress.test.ts` — добавлены unit-тесты helper (success/error)
  - `apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx` — последовательная batch-загрузка с общим прогрессом и статусом текущего файла
- **Тесты:** добавлены unit-тесты `uploadWithProgress.test.ts`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 1.3 — Drag-and-drop загрузка

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx` — добавлена drop-zone с drag state, desktop DnD-загрузка и window-level protection от случайного drop открытия файла
- **Тесты:** manual regression (desktop drag-and-drop + кнопка выбора файлов)
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 1.4 — Мобильный capture

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx` — добавлены mobile upload actions: «Снять фото/видео» (`accept` + `capture`) и «Выбрать из файлов»; desktop flow сохранён отдельно
- **Тесты:** manual mobile checks (capture/files paths), lint после каждой задачи
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 1.5 — Grid-режим просмотра

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/content/library/MediaCard.tsx` — добавлен карточный рендер элемента библиотеки
  - `apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx` — интегрирован grid-view и mobile-first карточный режим
- **Тесты:** manual regression (mobile grid, desktop table)
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 1.6 — Переключатель grid/table

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx` — добавлен переключатель `Плитки/Таблица` и сохранение режима в `localStorage`
- **Тесты:** manual regression (toggle + persistence after refresh)
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 1.7 — Lightbox

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/content/library/MediaLightbox.tsx` — добавлен полноэкранный просмотр медиа (image/video/audio/file fallback)
  - `apps/webapp/src/app/app/doctor/content/library/MediaCard.tsx` — карточка открывает lightbox по клику на превью
  - `apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx` — добавлено управление open/prev/next для lightbox
- **Тесты:** manual regression (open/close and next/prev navigation)
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 1.8 — Пагинация

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/api/admin/media/route.ts` — добавлены метаданные пагинации (`limit`, `offset`, `hasMore`, `nextOffset`)
  - `apps/webapp/src/app/api/admin/media/route.test.ts` — обновлены unit-тесты контракта списка с метаданными
  - `apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx` — внедрена постраничная загрузка и кнопка «Загрузить ещё»
- **Тесты:** обновлены unit-тесты `GET /api/admin/media`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 1.9 — Кнопка «Скопировать URL»

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/content/library/MediaCard.tsx` — добавлена кнопка «Скопировать URL» в карточках
  - `apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx` — добавлено копирование URL в таблице и карточках + fallback без Clipboard API
- **Тесты:** manual regression (copy in grid/table, fallback path)
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 1.10 — Модальный picker

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/content/MediaLibraryPickerDialog.tsx` — inline picker заменён на Dialog (desktop) / Sheet (mobile)
  - `apps/webapp/src/app/app/doctor/content/MediaPickerList.tsx` — вынесен список выбора файлов в переиспользуемый компонент
- **Тесты:** manual regression (mobile sheet + desktop dialog)
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 1.11 — Предпросмотр контент-страницы

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/content/ContentPreview.tsx` — добавлен patient-like preview контента (markdown/image/video)
  - `apps/webapp/src/app/app/doctor/content/ContentForm.tsx` — добавлен toggle-предпросмотр и синхронизация данных формы в preview
  - `apps/webapp/src/app/app/doctor/content/ContentForm.test.tsx` — добавлен тест на рендер preview
- **Тесты:** обновлены unit-тесты `ContentForm.test.tsx`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 1.12 — Убрать sort_order из ContentForm

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/content/ContentForm.tsx` — удалено поле `sort_order` из UI формы
  - `apps/webapp/src/app/app/doctor/content/actions.ts` — sortOrder вычисляется на сервере (append для new, сохранение existing)
  - `apps/webapp/src/app/app/doctor/content/actions.test.ts` — добавлены кейсы без `sort_order` и на сохранение порядка при edit
- **Тесты:** обновлены unit-тесты `actions.test.ts`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 1.13 — Объединить news/motivation

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/content/page.tsx` — удалены кнопки входа в отдельные `news/motivation` маршруты
  - `apps/webapp/src/app/app/doctor/content/news/page.tsx` — маршрут переведён в redirect на общий `/app/doctor/content`
  - `apps/webapp/src/app/app/doctor/content/motivation/page.tsx` — маршрут переведён в redirect на общий `/app/doctor/content`
  - `apps/webapp/src/shared/ui/doctorScreenTitles.test.ts` — удалены ожидания отдельных screen-title для `news/motivation`
  - `apps/webapp/src/modules/patient-home/README.md` — обновлено описание точки управления новостями/цитатами
- **Тесты:** regression через `pnpm run ci` (включая webapp tests/build)
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

---

## Аудит Фазы 1

- **Аудитор:** GPT-5.3 Codex
- **Дата:** 2026-03-31
- **Результат:** pass (после доработок по `AUDIT_PHASE_1.md`)
- **CI:** green (`pnpm run ci`)
- **Замечания:** см. `docs/BRANCH_UX_CMS_BOOKING/AUDIT_PHASE_1.md`

---

## Доработки после аудита Фазы 1 (2026-03-31)

Закрытие findings из `AUDIT_PHASE_1.md`:

- **`MediaCard.tsx`** — убраны вложенные интерактивные элементы в кнопке превью; отдельная кнопка «Предпросмотр» для video/audio/file.
- **`actions.ts` / `actions.test.ts`** — обязательный `listAll` + `try/catch`; тест `listAll fails`.
- **`e2e/cms-content.test.ts`** — в мок `buildAppDeps` добавлен `listAll`.
- **`MediaLibraryClient.tsx`** — на mobile viewport всегда старт в `grid`; desktop читает `localStorage`.
- **`MediaLibraryPickerDialog.tsx`** — `useSyncExternalStore` для mobile/desktop вместо `useEffect` + `setState` (ESLint).

---

## Фаза 2 — Нативный модуль записи

### 2.1 — Сервис слотов Rubitime + M2M endpoint'ы integrator

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/integrator/src/integrations/rubitime/client.ts` — добавлены методы `create-record` и `get-slots`
  - `apps/integrator/src/integrations/rubitime/schema.ts` — добавлены схемы и парсер query для slots
  - `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` — добавлены маршруты `/api/bersoncare/rubitime/create-record` и `/api/bersoncare/rubitime/slots`
- **Тесты:** локально прогнаны `client.test.ts`, `recordM2mRoute.test.ts`, `schema.test.ts`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 2.2 — Базовый booking-модуль + локальное хранилище в webapp

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/modules/patient-booking/{types.ts,ports.ts,service.ts,patient-booking.md}` — добавлен модуль native booking
  - `apps/webapp/src/infra/repos/{pgPatientBookings.ts,inMemoryPatientBookings.ts}` — добавлены PG/in-memory адаптеры
  - `apps/webapp/migrations/040_patient_bookings.sql` — создана таблица `patient_bookings` и индексы
  - `apps/webapp/src/modules/integrator/bookingM2mApi.ts` — реализован M2M sync-порт webapp -> integrator
  - `apps/webapp/src/app-layer/di/buildAppDeps.ts` — подключён `patientBooking` сервис
- **Тесты:** модуль и адаптеры проверены через общий прогон CI
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 2.3 — API endpoints booking в webapp

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/api/booking/slots/route.ts` — `GET /api/booking/slots`
  - `apps/webapp/src/app/api/booking/create/route.ts` — `POST /api/booking/create`
  - `apps/webapp/src/app/api/booking/cancel/route.ts` — `POST /api/booking/cancel`
  - `apps/webapp/src/app/api/booking/my/route.ts` — `GET /api/booking/my`
  - `apps/webapp/src/app/api/booking/*/route.test.ts` — добавлены route-тесты для новых endpoint'ов
- **Тесты:** локально прогнаны route-тесты `booking/*`; вошли в общий CI
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 2.4 — Reconciliation: синхронизация patient_bookings из webhook-проекции

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/modules/integrator/events.ts` — добавлен вызов `patientBooking.applyRubitimeUpdate` для `appointment.record.upserted`
  - `apps/webapp/src/app/api/integrator/events/route.ts` — в deps обработчика добавлен `patientBooking`
- **Тесты:** покрыто интеграционным прогоном `pnpm run ci`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

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
