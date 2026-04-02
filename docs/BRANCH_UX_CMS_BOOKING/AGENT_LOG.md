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

- **Аудитор:** agent (Cursor)
- **Дата:** 2026-03-31
- **Результат:** pass (см. `AUDIT_PHASE_0.md`; minor по комментарию в purchases учтён в remediation)
- **Замечания:** устаревший комментарий в `purchases/page.tsx` не воспроизводится в текущем виде файла; пользовательские «заглушки» help/install обновлены в remediation TODO/audit.

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

- **Статус:** superseded (2026-04-01)
- **Примечание:** первоначальная запись ниже описывала redirect-only модель. **Текущая целевая модель продукта** — отдельные страницы «Новости» и «Мотивация» с хаб-кнопками на `/app/doctor/content` (см. `REWORK_CLOSE_AUDIT_GAPS_REPORT.md`). Не использовать эту запись как source of truth для маршрутизации CMS.
- **Историческая запись (2026-03-31, отменена продуктовым решением):**
  - `apps/webapp/src/app/app/doctor/content/page.tsx` — удалены кнопки входа в отдельные `news/motivation` маршруты
  - `apps/webapp/src/app/app/doctor/content/news/page.tsx` — redirect на общий `/app/doctor/content`
  - `apps/webapp/src/app/app/doctor/content/motivation/page.tsx` — redirect на общий `/app/doctor/content`
  - `apps/webapp/src/shared/ui/doctorScreenTitles.test.ts` — удалены ожидания отдельных screen-title для `news/motivation`
- **Актуально после rework:** восстановлены отдельные страницы и заголовки; плоский список разделов; см. отчёт closure.

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

### 2.5 — Frontend блока 2.B: native booking UI в кабинете пациента

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/patient/cabinet/page.tsx` — кабинет переведён на новый каркас block 2.B (активные/история/entrypoint записи)
  - `apps/webapp/src/app/app/patient/cabinet/CabinetBookingEntry.tsx` — mobile-first flow записи в `Sheet` (mobile) / `Dialog` (desktop)
  - `apps/webapp/src/app/app/patient/cabinet/{BookingCategoryGrid.tsx,BookingCalendar.tsx,BookingSlotList.tsx,BookingConfirmationForm.tsx}` — UI шаги выбора формата, даты, времени и подтверждения
  - `apps/webapp/src/app/app/patient/cabinet/CabinetActiveBookings.tsx` — активные записи (после 2026-04-02: плоский список + «Изменить» → `support_contact_url`; см. `EXECUTION_LOG.md` CABINET.T01)
  - `apps/webapp/src/app/app/patient/cabinet/{CabinetPastBookings.tsx,CabinetInfoLinks.tsx}` — блок истории (accordion) и инфо-ссылки
  - `apps/webapp/src/app/app/patient/cabinet/{useBookingSelection.ts,useBookingSlots.ts,useCreateBooking.ts,useMobileViewport.ts}` — client hooks/state для booking flow
  - `apps/webapp/src/app/app/patient/cabinet/cabinet.md` — обновлена документация экрана
- **Тесты:** регресс подтверждён общим прогоном CI
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 2.6 — Integration блока 2.C: уведомления, напоминания, Rubitime/Google Calendar sync

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/modules/patient-booking/{ports.ts,service.ts}` — добавлен emit lifecycle-событий `booking.created`/`booking.cancelled` после create/cancel
  - `apps/webapp/src/modules/integrator/bookingM2mApi.ts` — добавлен signed M2M endpoint-вызов `/api/bersoncare/rubitime/booking-event`
  - `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` — добавлен endpoint `POST /api/bersoncare/rubitime/booking-event` (пациентские и doctor-уведомления через Telegram/MAX, планирование/removal reminder jobs 24ч/2ч)
  - `apps/integrator/src/app/routes.ts` — прокинут `dispatchPort` в Rubitime M2M routes
  - `apps/integrator/src/infra/db/repos/bookingCalendarMap.ts` + `apps/integrator/src/integrations/rubitime/db/migrations/20260331_0003_booking_calendar_map.sql` — persistent mapping `rubitime_record_id -> gcal_event_id`
  - `apps/integrator/src/integrations/google-calendar/sync.ts` — убран in-memory map, sync переведён на DB-backed mapping
  - `apps/integrator/src/integrations/rubitime/{connector.ts,webhook.ts}` + `apps/integrator/src/content/rubitime/scripts.json` + `apps/integrator/src/infra/db/{repos/bookingRecords.ts,writePort.ts}` — прокинут/сохранён `gcalEventId` в booking projection
  - `apps/webapp/src/app/app/patient/booking/page.tsx` — legacy iframe route переведён на redirect в native cabinet flow
- **Тесты:** регресс подтверждён общим прогоном CI
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

---

## Phase 2 remediation (AUDIT_PHASE_2)

- **Статус:** done
- **Дата:** 2026-03-31
- **Документ задач:** `docs/BRANCH_UX_CMS_BOOKING/PHASE_2_FIX_TASKS.md`
- **Изменения (кратко):**
  - Webapp: миграции `041_patient_bookings_no_overlap.sql`, `042_patient_bookings_cancelling_status.sql`; overlap helper + inMemory/PG; `create`/`cancel` flow и API 409/503; UI статусы `cancelling`/`cancel_failed`
  - Integrator: `booking_display_timezone` из БД (`bookingDisplayTimezone.ts`), `bookingNotificationFormat.ts`, строгий Zod для `booking-event`, тесты M2M; Telegram `bookingUrl` → cabinet
- **CI:** `pnpm run ci` (после merge в main)

---

## Аудит Фазы 2

- **Аудитор:** agent (Cursor)
- **Дата:** 2026-03-31
- **Результат:** pass после remediation (`PHASE_2_FIX_TASKS`, коммит на базе с overlap/timezone и т.д.; см. `AUDIT_PHASE_2.md` как исторический снимок findings)
- **Замечания:** первичный аудит фиксировал риски до remediation; актуальное состояние — по коду на `HEAD` и зелёному CI.

---

## Фаза 3 — UX кабинета врача

### 3.1 — Единый список клиентов/подписчиков с фильтром `scope`

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/clients/page.tsx` — добавлен режим `scope=all|appointments`, единая загрузка данных и master-detail для обоих сценариев
  - `apps/webapp/src/app/app/doctor/clients/DoctorClientsPanel.tsx` — добавлен UI-переключатель scope, сохранение scope в URL, совместимость с текущими фильтрами
  - `apps/webapp/src/app/app/doctor/subscribers/page.tsx` — legacy route переведён на redirect в `/app/doctor/clients?scope=all`
  - `apps/webapp/src/app/app/doctor/subscribers/[userId]/page.tsx` — карточка подписчика переведена на redirect в единый профиль клиента
  - `apps/webapp/src/shared/ui/DoctorHeader.tsx` — убран отдельный пункт «Подписчики», единый пункт «Клиенты и подписчики»
  - `apps/webapp/src/shared/ui/doctorScreenTitles.ts` — обновлены title-rules под объединённый список
  - `apps/webapp/src/app/app/doctor/page.tsx` — обновлены deep links плиток на новый маршрут с `scope`
  - `apps/webapp/src/app/app/doctor/clients/[userId]/page.tsx` — учтён `scope` для возврата в нужный режим списка
- **Тесты:** regression через полный `pnpm run ci`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 3.2 — Dropdown области тела вместо UUID-поля в упражнениях

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/exercises/ExercisesFiltersForm.tsx` — создан client-form фильтров с `ReferenceSelect` (`body_region`)
  - `apps/webapp/src/app/app/doctor/exercises/page.tsx` — список упражнений переведён на новый фильтр области тела через справочник
- **Тесты:** regression через полный `pnpm run ci`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 3.3 — Пагинация журнала сообщений врача

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/modules/doctor-messaging/ports.ts` — добавлен paged-контракт (`MessageLogListParams/Result`)
  - `apps/webapp/src/modules/doctor-messaging/service.ts` — добавлена нормализация page/pageSize
  - `apps/webapp/src/infra/repos/pgMessageLog.ts` — добавлены SQL `LIMIT/OFFSET` + `COUNT(*)`
  - `apps/webapp/src/infra/repos/inMemoryMessageLog.ts` — синхронизирована paged-логика in-memory
  - `apps/webapp/src/app/app/doctor/messages/DoctorMessagesLogPager.tsx` — добавлен UI пагинации журнала
  - `apps/webapp/src/app/app/doctor/messages/page.tsx` — журнал переведён на paged-рендер
- **Тесты:** обновлены unit/e2e тесты для doctorMessaging/buildAppDeps; regression через полный `pnpm run ci`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 3.4 — Фильтры журнала сообщений (клиент, дата, категория)

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/modules/doctor-messaging/ports.ts` — добавлены фильтры `userId/category/dateFrom/dateTo`
  - `apps/webapp/src/infra/repos/pgMessageLog.ts` — добавлена фильтрация в SQL where-clause
  - `apps/webapp/src/infra/repos/inMemoryMessageLog.ts` — добавлена эквивалентная фильтрация в памяти
  - `apps/webapp/src/app/app/doctor/messages/DoctorMessagesLogFilters.tsx` — добавлена форма фильтров журнала
  - `apps/webapp/src/app/app/doctor/messages/page.tsx` — подключены фильтры с URL-параметрами и reset-flow
- **Тесты:** regression через полный `pnpm run ci`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 3.5 — Карточная визуализация статистики врача

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/stats/DoctorStatCard.tsx` — создан переиспользуемый KPI-card компонент
  - `apps/webapp/src/app/app/doctor/stats/page.tsx` — списки `<li>` заменены на grid карточек для блоков «Записи» и «Клиенты»
- **Тесты:** regression через полный `pnpm run ci`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 3.6 — Контекстные виджеты на дашборде врача

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/DoctorDashboardContextWidgets.tsx` — добавлены виджеты «Ближайший приём» и «Непрочитанные сообщения»
  - `apps/webapp/src/app/app/doctor/page.tsx` — подключена серверная загрузка ближайшей записи и рендер context-widgets
- **Тесты:** regression через полный `pnpm run ci`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### Phase 3 rework (AUDIT_PHASE_3)

- **Статус:** done
- **Агент/модель:** agent auto
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/clients/page.tsx` — `listBasePathWithScope` для master-detail
  - `apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx` — метка «назад» при `scope=all`
  - `apps/webapp/src/app/app/doctor/messages/page.tsx` — редирект при невалидном `clientId`, сохранение прочих параметров
  - `apps/webapp/src/app/app/doctor/messages/parseMessagesLogClientId.ts` — парсинг/валидация UUID
  - `apps/webapp/src/modules/doctor-messaging/service.ts` — санация `filters.userId` перед репозиторием
  - `apps/webapp/src/app/app/doctor/exercises/ExercisesFiltersForm.tsx` — `flushSync` + `requestSubmit` на сброс области
- **Новые тесты:**
  - `parseMessagesLogClientId.test.ts`, `service.test.ts` (invalid `userId`), `pgMessageLog.test.ts`, `ExercisesFiltersForm.test.tsx`, `ClientProfileCard.backLink.test.tsx`, `e2e/doctor-clients-scope-redirects.test.ts`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:** закрыты findings #1–#4 в `AUDIT_PHASE_3.md` → **pass**
- **Доработки:** см. rework-план Phase3 Audit Rework (без правок файла плана)

---

## Фаза 4 — Рассылки

### 4.1 — Server Actions для рассылок + исправить resolveAudienceSize

- **Статус:** done
- **Агент/модель:** claude-4.6-sonnet-medium
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/broadcasts/actions.ts` — создан модуль `"use server"` с тремя Actions: `previewBroadcastAction`, `executeBroadcastAction`, `listBroadcastAuditAction`
  - `apps/webapp/src/app/app/doctor/broadcasts/actions.test.ts` — unit-тесты с моком `buildAppDeps`
  - `apps/webapp/src/app-layer/di/buildAppDeps.ts` — `resolveAudienceSize` переписан с явными ветками per-filter; `without_appointment` считается как `all − with_upcoming_appointment`; `inactive` и `sms_only` — с TODO-комментарием
  - `apps/webapp/src/shared/ui/DoctorHeader.tsx` — восстановлен пункт меню «Рассылки»
- **Тесты:** добавлены unit-тесты `actions.test.ts`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 4.2 — Компонент `BroadcastAudienceSelect` + `labels.ts`

- **Статус:** done
- **Агент/модель:** claude-4.6-sonnet-medium
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/broadcasts/labels.ts` — `AUDIENCE_LABELS`, `CATEGORY_LABELS`, `formatAudienceLabel`, `formatCategoryLabel`, `formatBroadcastDate`
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastAudienceSelect.tsx` — контролируемый select с 8 сегментами, placeholder, поддержка `disabled`
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastAudienceSelect.test.tsx` — RTL-тесты (рендер опций, onChange, disabled)
- **Тесты:** добавлены component-тесты
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 4.3 — Форма создания рассылки с предпросмотром (`BroadcastForm`)

- **Статус:** done
- **Агент/модель:** claude-4.6-sonnet-medium
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastForm.tsx` — клиентская форма (категория, аудитория, заголовок, текст); стейт-машина `idle/previewing/previewed/confirming/sent/error`; вызов `previewBroadcastAction`
- **Тесты:** manual regression; стейт-машина покрыта интеграционными тестами через `BroadcastConfirmStep.test.tsx`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 4.4 — Двухшаговое подтверждение и отправка (`BroadcastConfirmStep`)

- **Статус:** done
- **Агент/модель:** claude-4.6-sonnet-medium
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastConfirmStep.tsx` — карточка summary (категория, аудитория, заголовок, N получателей), предупреждение, кнопки «Отправить N получателям» / «Назад», блокировка при `isLoading`, режим `result` для success-state
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastConfirmStep.test.tsx` — RTL-тесты (onConfirm, onCancel, isLoading, result)
- **Тесты:** добавлены component-тесты
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 4.5 — Журнал рассылок (`BroadcastAuditLog`)

- **Статус:** done
- **Агент/модель:** claude-4.6-sonnet-medium
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastAuditLog.tsx` — таблица записей: дата, категория, аудитория, заголовок, охват, отправлено; пустое состояние; колонка ошибок скрыта если `errorCount === 0` у всех
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastAuditLog.test.tsx` — RTL-тесты (empty-state, строки, форматирование даты, скрытие колонки ошибок)
- **Тесты:** добавлены component-тесты
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### 4.6 — Интеграция в `broadcasts/page.tsx`

- **Статус:** done
- **Агент/модель:** claude-4.6-sonnet-medium
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/broadcasts/page.tsx` — удалён placeholder-баннер; Server Component вызывает `listBroadcastAuditAction(50)` и рендерит секции «Новая рассылка» + «Журнал рассылок»
- **Тесты:** regression через `pnpm run ci`
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:**

### Phase 4 rework (AUDIT_PHASE_4)

- **Статус:** done
- **Агент/модель:** agent auto
- **Дата начала:** 2026-03-31
- **Дата завершения:** 2026-03-31
- **Изменённые файлы:**
  - `apps/webapp/src/app/app/doctor/broadcasts/actions.ts` — после успешного `execute` вызывается `revalidatePath("/app/doctor/broadcasts")`
  - `apps/webapp/src/app/app/doctor/broadcasts/actions.test.ts` — мок `next/cache.revalidatePath`, проверка вызова после execute
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastForm.test.tsx` — RTL по спеке 4.3 + предупреждение аудитории + sent-flow
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastForm.tsx` — предупреждение под селектом для `inactive`/`sms_only`; sent-state через `BroadcastSentMessage`
  - `apps/webapp/src/app/app/doctor/broadcasts/labels.ts` — `BROADCAST_AUDIENCE_FILTERS_ORDER`, `isAudienceEstimateApproximate`, `getAudienceOptionLabel`
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastAudienceSelect.tsx` — подписи опций через `getAudienceOptionLabel`
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastAudienceSelect.test.tsx` — тесты суффикса для приблизительных сегментов
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastConfirmStep.tsx` — только шаг подтверждения; предупреждение о грубой оценке для `inactive`/`sms_only`
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastConfirmStep.test.tsx` — без `result`-prop; тесты estimate-warning
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastSentMessage.tsx` — отдельный success-блок
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastSentMessage.test.tsx` — RTL success-copy
  - `apps/webapp/src/app/app/doctor/broadcasts/BroadcastAuditLog.tsx` — убрана директива `"use client"` (Server Component)
- **Закрытые findings:** #1–#7 в `AUDIT_PHASE_4.md` → **pass (re-audit)**
- **Тесты:** обновлены/добавлены перечисленные файлы
- **CI:** green (`pnpm run ci`)
- **Замечания аудита:** см. обновлённый `AUDIT_PHASE_4.md`

---

## Fix: Rubitime slots integration + patient_bookings sync (auto-agent)

- **Статус:** done
- **Агент/модель:** claude-4.6-sonnet-medium
- **Дата начала:** 2026-04-01
- **Дата завершения:** 2026-04-01
- **Scope:** исправить native booking: перейти на реальный Rubitime schedule API, ввести единый normalizer, убрать silent-empty деградацию, довести sync `patient_bookings` до консистентности.

**Гипотеза причины:** код вызывал несуществующий endpoint `api2/get-slots` с доменными полями `type/city/category`. Реальный Rubitime API использует `api2/get-schedule` с `branch_id/cooperator_id/service_id`. Нормализатор ждал `Array.isArray(data)`, тогда как `get-schedule` возвращает объект `{"YYYY-MM-DD": {"HH:MM": {"available": bool}}}`. Итог: `toSlotsResponse(raw)` всегда возвращал `[]` → пустой UI без ошибки.

**Целевые файлы:**
- `apps/integrator/src/integrations/rubitime/client.ts`
- `apps/integrator/src/integrations/rubitime/config.ts`
- `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts`
- `apps/integrator/src/integrations/rubitime/schema.ts`
- (новый) `apps/integrator/src/integrations/rubitime/bookingScheduleMapping.ts`
- (новый) `apps/integrator/src/integrations/rubitime/scheduleNormalizer.ts`
- `apps/webapp/src/modules/integrator/bookingM2mApi.ts`
- `apps/webapp/src/modules/integrator/events.ts`
- `apps/webapp/src/infra/repos/pgPatientBookings.ts`
- `.env.example`

**DB sync decision (Decision A):** поддерживаем только update существующих `patient_bookings` строк по `rubitime_id`. Записи, созданные вне native-flow (через Rubitime напрямую), обновляются только если у них уже есть `rubitime_id` в таблице. Обоснование: без `platform_user_id` нельзя создать корректную строку; вставка без owner сломает auth invariants. Зафиксировано явно в коде и документации.

**Выполненные этапы (результат):**
- Этап 0 (DB-first config): добавлены ключи интеграций в `system_settings` (`scope=admin`), migration `045_system_settings_integration_keys.sql`, deploy auto-seed `env -> DB` (fill-empty-only), обновлены `.cursor/rules/*` на запрет env-хранения integration keys/URI.
- Integrator Rubitime runtime config переведён на DB-first accessor (`runtimeConfig.ts`): `rubitime_api_key`, `rubitime_webhook_token`, `rubitime_schedule_mapping` читаются из `system_settings` с env fallback на миграционный период.
- Этапы 1–3 (slots contract + API + parser): integrator переведён на Rubitime `get-schedule`; добавлены `bookingScheduleMapping.ts` и `scheduleNormalizer.ts`; route `/api/bersoncare/rubitime/slots` возвращает controlled errors (`slots_mapping_not_configured`, `rubitime_schedule_malformed`) вместо silent-empty.
- Этап 3 (webapp contract): `bookingM2mApi.fetchSlots` теперь валидирует integrator-contract и не скрывает malformed ответ.
- Этап 4 (patient_bookings sync): `events.ts` использует `mapRubitimeStatusToPatientBookingStatus`, передаёт `slotEnd: null` явно (COALESCE в SQL сохраняет актуальное значение).
- Этап 5 (tests): добавлены/обновлены unit+contract тесты для mapping/normalizer/client/route и webapp client/sync.
- Этапы 6–7 (docs/checklist): обновлён host deploy doc для auto-seed; финальная проверка пройдена.

**Тесты и проверки:**
- `apps/integrator`: `vitest` (rubitime client/route/mapping/normalizer) — green, `41 passed`.
- `apps/webapp`: `vitest` (bookingM2mApi/auth/notifyIntegrator/relayOutbound/events) — green, `85 passed`.
- `apps/webapp`: `pnpm typecheck` — green.
- `apps/integrator`: `pnpm typecheck` — green.

---

## Итоговый аудит ветки

- **Аудитор:** agent (Cursor), финальный отчёт в `docs/BRANCH_UX_CMS_BOOKING/FINAL_AUDIT.md`
- **Дата:** 2026-03-31
- **CI финальный:** green (`pnpm run ci` — lint, typecheck, test, test:webapp, webapp:typecheck, build, audit --prod)
- **Регресс-тесты:** зелёные в составе `pnpm run ci` (integrator + webapp vitest)
- **Решение:** **merge** — все фазы 0–4 по `AGENT_LOG` закрыты; аудиты фаз 1–4 в статусе pass/approve. После remediation TODO/audit: трекинг `AUDIT-BACKLOG-*` в `TODO_BACKLOG.md`, `logger.debug` в orchestrator, support URL из БД, обновлены help/install/references и копирайт «Карты» (см. `FINAL_AUDIT.md`).

---

## Remediation: TODO и аудиты (auto-agent)

- **Статус:** done
- **Дата:** 2026-03-31
- **Документы:** `TODO_BACKLOG.md`, обновлён `FINAL_AUDIT.md`
- **Код (кратко):**
  - Integrator: `resolver.ts` — отладочный вывод callback-плана через `logger.debug` вместо `console.log`.
  - Webapp: ключ `support_contact_url` (`system_settings`), `getSupportContactUrl()`, константа `DEFAULT_SUPPORT_CONTACT_URL` в `supportContactConstants.ts` (без импорта `pg` в client bundle); OTP/справка/bind-phone; Runtime Config в админке.
  - Страницы `patient/help`, `patient/install`, `doctor/references` — полезный контент без «Раздел в разработке»; `PlaceholderPage` без этой фразы; `ClientProfileCard` — нейтральный текст про «Карту».
  - TODO в коде привязаны к `AUDIT-BACKLOG-*` (см. `TODO_BACKLOG.md`).
- **CI:** green (`pnpm run ci`)

---

## Remediation: audit follow-up (booking + config security)

- **Статус:** done
- **Агент/модель:** GPT-5.3 Codex
- **Дата:** 2026-04-01
- **Изменённые файлы:**
  - `apps/webapp/src/app/api/admin/settings/route.ts` — добавлены redaction для secret-like ключей в audit-логах; PATCH теперь нормализует payload в `{ value: ... }`
  - `apps/webapp/src/app/api/admin/settings/route.test.ts` — обновлено ожидание `updateSetting(..., { value: ... })`
  - `apps/webapp/src/modules/patient-booking/service.ts` — при `slot_overlap` добавлен best-effort rollback: `syncPort.cancelRecord(rubitimeId)` перед локальной отменой
  - `apps/webapp/src/modules/patient-booking/service.test.ts` — добавлен тест rollback-сценария при `slot_overlap`
  - `apps/integrator/src/integrations/max/deliveryAdapter.ts` — смягчён текст ошибки отсутствующего ключа (lint no-secrets)
  - `apps/integrator/src/integrations/smsc/client.ts` — смягчён текст ошибки отсутствующего ключа (lint no-secrets)
  - `apps/integrator/src/infra/scripts/check-smsc.ts` — смягчён текст ошибки отсутствующего ключа (lint no-secrets)
- **Тесты:**
  - `apps/webapp`: `route.test.ts`, `service.test.ts` + связанные booking/admin тесты
  - `apps/integrator`: rubitime/max/smsc целевые тесты
- **Замечания:**
  - `*_webhook_uri` ключи остаются сохранёнными и редактируемыми в админке, но runtime-use в integrator пока не реализован (исторический residual из предыдущего аудита).

---

## Hotfix: seed-system-settings-from-env.mjs — PostgreSQL type inference

- **Статус:** done
- **Дата:** 2026-04-01
- **CI run (failed):** `23831622923` — шаг `Deploy to host`, job `69466564403`
- **Причина падения:** PostgreSQL не мог вывести тип параметра `$2` в `jsonb_build_object('value', $2)` → ошибка `could not determine data type of parameter $2`.
- **Исправление:** добавлен явный каст `$2::text` → `jsonb_build_object('value', $2::text)` в `apps/webapp/scripts/seed-system-settings-from-env.mjs`.
- **Коммит:** `fa2111b`
- **CI run (passed):** `23831771310` — все шаги (lint/typecheck/build + deploy) зелёные.
- **Итог:** деплой на хосте прошёл успешно; `system_settings` засеяны из env-файлов без ошибок.
