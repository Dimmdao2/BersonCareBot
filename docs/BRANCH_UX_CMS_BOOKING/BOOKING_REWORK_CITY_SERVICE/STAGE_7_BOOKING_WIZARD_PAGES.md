# Stage 7: Booking Wizard — Полноэкранные страницы (Popup → Pages)

**Цель этапа:** убрать `Dialog` / `Sheet` попап из кабинета пациента и перенести весь flow записи
в самостоятельные URL-ориентированные страницы под `/app/patient/booking/new/`.

---

## Контекст и мотивация

Текущий flow записи (`CabinetBookingEntry.tsx`) открывает `Dialog` (desktop) или `Sheet` (mobile)
поверх кабинета. Это создаёт проблемы:

- нет URL — нельзя вернуться кнопкой «назад» браузера, нет deep-link на конкретный шаг;
- всё состояние в памяти — при обновлении страницы прогресс теряется;
- ограниченное пространство для контента (особенно calendar);
- сложность расширения шагов без разрастания одного компонента.

---

## Архитектурный подход

### URL-driven wizard

Каждый шаг — отдельная страница (Next.js App Router). Состояние передаётся через URL search params.
Кнопка «Назад» работает через `router.back()` / `<Link href={prevUrl}>`.

### Структура маршрутов

| URL | Шаг | Описание |
|-----|-----|----------|
| `/app/patient/booking/new` | 1 | Выбор формата (очный / онлайн) |
| `/app/patient/booking/new/city` | 2 | Выбор города (только очный) |
| `/app/patient/booking/new/service?cityCode=&cityTitle=` | 3 | Выбор услуги (только очный) |
| `/app/patient/booking/new/slot?{params}` | 4 | Выбор даты и времени (очный и онлайн) |
| `/app/patient/booking/new/confirm?{params}` | 5 | Форма подтверждения |

### Search params схема

**Шаги 1–2 (format, city):** обязательных query-параметров нет; `page.tsx` только session guard. Читать `searchParams` не требуется.

**Шаг 3 (service) входящие:**
```
?cityCode=msk&cityTitle=Москва
```
(`cityTitle` кодируется через `encodeURIComponent` в URL.)

**Шаг 4 (slot) входящие — очный:**
```
?type=in_person&cityCode=msk&cityTitle=Москва&branchServiceId=uuid&serviceTitle=Реабилитация
```

**Шаг 4 (slot) входящие — онлайн:**
```
?type=online&category=rehab_lfk
```

**Шаг 5 (confirm) входящие:** к параметрам шага 4 добавляются **`date`**, **`slot`**, **`slotEnd`** — все обязательны для отображения формы.

- `date` — календарная дата выбранного дня, `YYYY-MM-DD` (как у `BookingCalendar`).
- `slot` — начало интервала записи, **ISO-8601 instant** (`BookingSlot.startAt`), как возвращает API слотов.
- `slotEnd` — конец интервала, **ISO-8601 instant** (`BookingSlot.endAt`); нужен для восстановления `BookingSlot` и отправки в `createBooking` без потери длительности.

Пример (очный), одна строка:
```
?type=in_person&cityCode=msk&cityTitle=Москва&branchServiceId=uuid&serviceTitle=Реабилитация&date=2026-04-10&slot=2026-04-10T07:00:00.000Z&slotEnd=2026-04-10T08:00:00.000Z
```

Онлайн-подтверждение: те же `date` / `slot` / `slotEnd` плюс `type=online` и `category=…`.

**Guard на confirm:** при отсутствии `date`, `slot` или `slotEnd` — редирект на шаг slot с восстановлением query без этих трёх полей.

### Паттерн Server/Client

- `page.tsx` — Server Component: session guard, чтение `searchParams`, redirect при невалидных params, передача в дочерние клиентские компоненты явными props (в т.ч. фрагмент состояния wizard из query).
- `*StepClient.tsx` — Client Component (`"use client"`): интерактивность, хуки из `cabinet/`, `useRouter()` для навигации. **`useSearchParams` не обязателен:** состояние шага уже согласовано на сервере и передаётся пропсами — так уменьшается дублирование и расхождение URL с SSR.

При необходимости только клиентского чтения query в будущем можно добавить `useSearchParams()` точечно; в рамках Stage 7 достаточно серверного разбора `searchParams` в `page.tsx`.

### Переиспользование хуков

Хуки `useBookingCatalogCities`, `useBookingCatalogServices`, `useBookingSlots`, `useCreateBooking`
остаются в `apps/webapp/src/app/app/patient/cabinet/` и импортируются в новые страницы напрямую.
Переноса хуков в этом этапе нет (отдельная задача если понадобится).

---

## S7.T01 — Маршруты и redirect

**Предусловия:** Stage 4 выполнен (роуты `/booking/page.tsx` уже существует).

**Файлы:**
- `apps/webapp/src/app-layer/routes/paths.ts`
- `apps/webapp/src/app/app/patient/booking/page.tsx`

**Шаги:**

1. Добавить в `routePaths` пять новых констант:
   ```ts
   bookingNew:         "/app/patient/booking/new",
   bookingNewCity:     "/app/patient/booking/new/city",
   bookingNewService:  "/app/patient/booking/new/service",
   bookingNewSlot:     "/app/patient/booking/new/slot",
   bookingNewConfirm:  "/app/patient/booking/new/confirm",
   ```
2. В `apps/webapp/src/app/app/patient/booking/page.tsx` изменить:
   - было: `redirect(routePaths.cabinet)`
   - стало: `redirect(routePaths.bookingNew)`
3. `bookingNew` **не** добавлять в `patientPathsRequiringPhone` (booking без обязательного телефона — аналогично существующей политике).

**Тесты:** нет (routing, проверяется navigation smoke).

**Критерии готовности:**
- `routePaths.bookingNew` экспортируется и используется.
- Переход на `/app/patient/booking` редиректит на `/app/patient/booking/new`.

**Лог:** `S7.T01`.

---

## S7.T02 — BookingWizardShell: общая обёртка шагов

**Предусловия:** S7.T01 done.

**Файлы:**
- `apps/webapp/src/app/app/patient/booking/new/BookingWizardShell.tsx`

**Шаги:**

1. Создать Server Component `BookingWizardShell`:
   - Принимает `props`: `title: string`, `step: number` (1–5), `totalSteps: number` (=5), `backHref: string | null`, `children: React.ReactNode`.
   - Рендерит `<AppShell>` с `title`, `backHref` (если передан) и `backLabel="Назад"`, `variant="patient"`.
   - Внутри шапки показывает прогресс-строку: «Шаг N из M» — простой текст или `Progress` компонент из `@/components/ui/progress` (если уже в проекте).
   - Под шапкой — `{children}`.
2. Не добавлять бизнес-логику; только layout.

**Тесты:** нет (layout-only компонент).

**Критерии готовности:**
- `BookingWizardShell` принимает все props без TS-ошибок.
- Импортируется хотя бы в одну страницу шага без ошибок.

**Лог:** `S7.T02`.

---

## S7.T03 — Шаг 1: Выбор формата (`/booking/new`)

**Предусловия:** S7.T02 done.

**Файлы:**
- `apps/webapp/src/app/app/patient/booking/new/page.tsx`
- `apps/webapp/src/app/app/patient/booking/new/FormatStepClient.tsx`

**Шаги:**

1. `page.tsx` — Server Component:
   - Получить optional session (`getOptionalPatientSession`).
   - Если нет сессии → redirect на `routePaths.patient` (или показать `CabinetGuestAccess` — на усмотрение, аналогично cabinet).
   - Рендерить `BookingWizardShell step={1} title="Запись на приём" backHref={routePaths.cabinet}`.
   - Внутри — `<FormatStepClient />`.

2. `FormatStepClient.tsx` — Client Component:
   - Использовать `useRouter()` из `next/navigation`.
   - Отрисовать три кнопки (аналог `BookingFormatGrid`):
     - «Очный приём» → `router.push(routePaths.bookingNewCity)`.
     - «Онлайн — Реабилитация (ЛФК)» → `router.push(routePaths.bookingNewSlot + '?type=online&category=rehab_lfk')`.
     - «Онлайн — Нутрициология» → `router.push(routePaths.bookingNewSlot + '?type=online&category=nutrition')`.
   - Без состояния (нет `useBookingSelection`).
   - Переиспользовать `BookingFormatGrid` напрямую нельзя (он принимает selection-state callbacks), поэтому реализовать кнопки inline или создать адаптер-оболочку.

**Тесты:**
- [ ] Smoke: компонент рендерится без ошибок.
- [ ] Unit: клик «Очный» вызывает `router.push` с `/app/patient/booking/new/city`.

**Критерии готовности:**
- Страница `/app/patient/booking/new` рендерится.
- Кнопки ведут на корректные URL.
- Нет TS-ошибок.

**Лог:** `S7.T03`.

---

## S7.T04 — Шаг 2: Выбор города (`/booking/new/city`)

**Предусловия:** S7.T03 done.

**Файлы:**
- `apps/webapp/src/app/app/patient/booking/new/city/page.tsx`
- `apps/webapp/src/app/app/patient/booking/new/city/CityStepClient.tsx`

**Шаги:**

1. `page.tsx` — Server Component:
   - Session guard (аналогично S7.T03, redirect если нет сессии).
   - `BookingWizardShell step={2} title="Выберите город" backHref={routePaths.bookingNew}`.
   - `<CityStepClient />`.

2. `CityStepClient.tsx` — Client Component:
   - Использовать `useBookingCatalogCities(true)` (импорт из `../../cabinet/useBookingCatalog` или аналогичный путь).
   - Отрисовать список кнопок городов.
   - По клику на город:
     ```
     router.push(`${routePaths.bookingNewService}?cityCode=${c.code}&cityTitle=${encodeURIComponent(c.title)}`)
     ```
   - Показывать loading/error состояния (аналогично cabinet).
   - Кнопка «Повторить» при ошибке.

**Тесты:**
- [ ] Unit: клик на город вызывает `router.push` с правильными searchParams.
- [ ] Unit: при `loading=true` показывается индикатор загрузки.

**Критерии готовности:**
- Страница `/app/patient/booking/new/city` рендерит список городов из каталога.
- Клик навигирует на service с правильными params.

**Лог:** `S7.T04`.

---

## S7.T05 — Шаг 3: Выбор услуги (`/booking/new/service`)

**Предусловия:** S7.T04 done.

**Файлы:**
- `apps/webapp/src/app/app/patient/booking/new/service/page.tsx`
- `apps/webapp/src/app/app/patient/booking/new/service/ServiceStepClient.tsx`

**Шаги:**

1. `page.tsx` — Server Component:
   - Прочитать `searchParams`: `cityCode`, `cityTitle`.
   - Если `cityCode` отсутствует → `redirect(routePaths.bookingNewCity)`.
   - Session guard.
   - `BookingWizardShell step={3} title="Выберите услугу" backHref={routePaths.bookingNewCity}`.
   - Передать `cityCode` и `cityTitle` в `<ServiceStepClient cityCode={cityCode} cityTitle={cityTitle} />`.

2. `ServiceStepClient.tsx` — Client Component:
   - Props: `cityCode: string`, `cityTitle: string`.
   - `useBookingCatalogServices(cityCode, true)` (импорт из `../../cabinet/useBookingCatalog`).
   - Список услуг с `durationMinutes`.
   - По клику на услугу:
     ```
     router.push(
       `${routePaths.bookingNewSlot}?type=in_person` +
       `&cityCode=${cityCode}` +
       `&cityTitle=${encodeURIComponent(cityTitle)}` +
       `&branchServiceId=${s.id}` +
       `&serviceTitle=${encodeURIComponent(title)}`
     )
     ```
   - Empty state: «Нет доступных услуг в этом городе».
   - Кнопка «Повторить» при ошибке.

**Тесты:**
- [ ] Unit: клик на услугу — router.push с корректными params.
- [ ] Unit: нет услуг → показывается empty state.

**Критерии готовности:**
- При отсутствии `cityCode` в params → redirect на city-шаг.
- Список услуг корректно отражает каталог.

**Лог:** `S7.T05`.

---

## S7.T06 — Шаг 4: Выбор слота (`/booking/new/slot`)

**Предусловия:** S7.T05 done.

**Файлы:**
- `apps/webapp/src/app/app/patient/booking/new/slot/page.tsx`
- `apps/webapp/src/app/app/patient/booking/new/slot/SlotStepClient.tsx`

**Шаги:**

1. `page.tsx` — Server Component:
   - Прочитать `searchParams`: `type`, плюс для `in_person` — `branchServiceId`, `cityCode`, `cityTitle`, `serviceTitle`; для `online` — `category`.
   - Guard: если `type` отсутствует → `redirect(routePaths.bookingNew)`.
   - Guard: если `type === 'in_person'` и нет `branchServiceId` → `redirect(routePaths.bookingNewCity)`.
   - Guard: если `type === 'online'` и нет `category` → `redirect(routePaths.bookingNew)`.
   - Session guard.
   - Построить `backHref`:
     - in_person → `bookingNewService?cityCode=...&cityTitle=...`
     - online → `bookingNew`
   - `BookingWizardShell step={4} title="Выберите дату и время" backHref={backHref}`.
   - Передать все params в `<SlotStepClient ... />`.

2. `SlotStepClient.tsx` — Client Component:
   - Props: `type: "in_person" | "online"`, `branchServiceId?: string`, `cityCode?: string`, `cityTitle?: string`, `serviceTitle?: string`, `category?: string`.
   - Собрать `BookingSelection` из props (эквивалент `useBookingSelection`):
     ```ts
     const selection: BookingSelection =
       type === "in_person"
         ? { type: "in_person", cityCode: cityCode!, cityTitle: cityTitle!, branchServiceId: branchServiceId!, serviceTitle: serviceTitle! }
         : { type: "online", category: category as BookingCategory };
     ```
   - `useBookingSlots(selection)` (импорт из `../../cabinet/useBookingSlots`).
   - Локальный state: `selectedDate: string | null`, `selectedSlot: BookingSlot | null`.
   - Рендерить `BookingCalendar` (импорт из `../../cabinet/BookingCalendar`) + `BookingSlotList` (импорт из `../../cabinet/BookingSlotList`).
   - По выбору слота показывать кнопку «Продолжить»:
     ```
     router.push(
       `${routePaths.bookingNewConfirm}?type=${type}&...params...&date=${selectedDate}&slot=${encodeURIComponent(selectedSlot.startAt)}&slotEnd=${encodeURIComponent(selectedSlot.endAt)}`
     )
     ```
   - Показывать loading/error от slotsState.

**Тесты:**
- [ ] Unit: guard — без `type` нет рендера (redirect handled server-side).
- [ ] Unit: при выборе слота кнопка «Продолжить» становится активной.

**Критерии готовности:**
- Страница корректно рендерит calendar + slots для обоих форматов.
- Кнопка «Продолжить» ведёт на confirm с полными params.

**Лог:** `S7.T06`.

---

## S7.T07 — Шаг 5: Подтверждение и отправка (`/booking/new/confirm`)

**Предусловия:** S7.T06 done.

**Файлы:**
- `apps/webapp/src/app/app/patient/booking/new/confirm/page.tsx`
- `apps/webapp/src/app/app/patient/booking/new/confirm/ConfirmStepClient.tsx`

**Шаги:**

1. `page.tsx` — Server Component:
   - Session guard: если нет сессии → redirect (booking требует авторизации).
   - Прочитать `searchParams`: `type`, `date`, `slot`, `slotEnd` — обязательные. Остальные по type.
   - Guard: если нет `date`, `slot` или `slotEnd` → `redirect(routePaths.bookingNewSlot + '?' + paramsStr)` (paramsStr без `date`/`slot`/`slotEnd`).
   - Получить `defaultName = session.user.displayName`, `defaultPhone = session.user.phone ?? ""`.
   - Построить `backHref` = slot page с теми же params без `date`/`slot`/`slotEnd`.
   - `BookingWizardShell step={5} title="Подтверждение записи" backHref={backHref}`.
   - Передать в `<ConfirmStepClient ... />`: все params + `defaultName` + `defaultPhone`.

2. `ConfirmStepClient.tsx` — Client Component:
   - Props: все search params + `defaultName: string`, `defaultPhone: string`.
   - Восстановить `BookingSelection` из params (аналогично SlotStepClient).
   - Восстановить `BookingSlot` из `{ startAt: slot, endAt: slotEnd }` (оба значения — ISO instant из query).
   - `useCreateBooking()` (импорт из `../../cabinet/useCreateBooking`).
   - Форма: имя, телефон, email — аналогично `BookingConfirmationForm`.
   - `onSuccess`: `router.push(routePaths.cabinet)` + toast/сообщение об успехе.
   - Сводка выбора над формой: формат / город / услуга / дата-время (из params).

**Тесты:**
- [ ] Unit: без `date` / `slot` / `slotEnd` params — redirect (server-side guard).
- [ ] Unit: `onSuccess` → `router.push(cabinet)`.
- [ ] Unit: форма не сабмитится без имени/телефона.

**Критерии готовности:**
- Форма подтверждения работает для in_person и online.
- После успешной записи пользователь попадает на `/app/patient/cabinet`.
- Ошибки API отображаются в форме.

**Лог:** `S7.T07`.

---

## S7.T08 — Упростить CabinetBookingEntry

**Предусловия:** S7.T03–S7.T07 done (страницы wizard реализованы).

**Файлы:**
- `apps/webapp/src/app/app/patient/cabinet/CabinetBookingEntry.tsx`

**Шаги:**

1. Удалить из `CabinetBookingEntry`:
   - import'ы: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`.
   - import'ы: `BookingFormatGrid`, `BookingCalendar`, `BookingSlotList`, `BookingConfirmationForm`.
   - import'ы: `useBookingSelection`, `useBookingSlots`, `useBookingCatalogCities`, `useBookingCatalogServices`, `useMobileViewport`.
   - Весь local state (`open`, `selectedDate`, `selectedSlot`, `isMobile`).
   - `headerLabel` memo.
   - `bookingBody` JSX.

2. Заменить кнопку «Записаться на приём» на `<Link href={routePaths.bookingNew}>` — внешний вид кнопки. Варианты:
   - Radix-style: `Button asChild` + `Link` (если `Button` поддерживает `asChild`).
   - Эквивалент в webapp: `Link` с `className={cn(buttonVariants({ className: "w-full" }))}` — текущий `Button` на Base UI не предоставляет `asChild`, поэтому стиль кнопки задаётся через `buttonVariants`.
   ```tsx
   import Link from "next/link";
   import { buttonVariants } from "@/components/ui/button-variants";
   import { cn } from "@/lib/utils";
   import { routePaths } from "@/app-layer/routes/paths";

   <Link href={routePaths.bookingNew} className={cn(buttonVariants({ className: "w-full" }))}>
     Записаться на приём
   </Link>
   ```

3. Компонент перестаёт быть `"use client"` — убрать директиву если больше нет клиентских хуков. Если `Link` из `next/link` позволяет — сделать Server Component.

4. Проверить: `useMobileViewport.ts` — если не используется нигде кроме `CabinetBookingEntry`, оставить файл (не удалять — может понадобиться позже), но убрать import.

**Тесты:**
- [ ] Smoke: `CabinetBookingEntry` рендерится без ошибок.
- [ ] `CabinetBookingEntry.test.tsx` — обновить: убрать тесты диалога, добавить проверку что Link ведёт на `bookingNew`.

**Критерии готовности:**
- `CabinetBookingEntry` не содержит Dialog/Sheet/state.
- Кнопка — Link на wizard.
- Компонент рендерится на Server если возможно.
- Тест обновлён.

**Лог:** `S7.T08`.

---

## S7.T09 — Тесты и CI

**Предусловия:** S7.T01–S7.T08 done.

**Файлы:**
- `apps/webapp/src/app/app/patient/booking/new/slot/SlotStepClient.test.tsx` (новый)
- `apps/webapp/src/app/app/patient/booking/new/confirm/ConfirmStepClient.test.tsx` (новый)
- `apps/webapp/src/app/app/patient/booking/new/city/CityStepClient.test.tsx`, `service/ServiceStepClient.test.tsx` — smoke навигации и loading/empty

**Шаги:**

1. `SlotStepClient.test.tsx`:
   - Mock `useBookingSlots` → возвращает fixtures слотов.
   - Проверить: при выборе даты фильтруются слоты.
   - Проверить: до выбора слота кнопка «Продолжить» disabled.
   - Проверить: после выбора слота кнопка «Продолжить» enabled + корректный `router.push` url.

2. `ConfirmStepClient.test.tsx`:
   - Mock `useCreateBooking` → возвращает `{ submitting: false, error: null, createBooking: mockFn }`.
   - Проверить: форма с prefilled name/phone из props.
   - Проверить: submit без имени — кнопка disabled.
   - Проверить: успешный submit → `mockFn` вызван с корректными параметрами.

3. Прогнать:
   ```bash
   pnpm run ci
   ```

**Критерии готовности:**
- `pnpm run ci` проходит (lint, typecheck, test, build).
- Новые тесты зелёные.
- Нет регрессий в существующих тестах cabinet.

**Лог:** `S7.T09`.

---

## Критерии готовности этапа

- [ ] Маршруты добавлены в `routePaths`.
- [ ] Все 5 шагов wizard реализованы как отдельные страницы.
- [ ] URL-state корректно передаётся между шагами через search params.
- [ ] Guard'ы: невалидные params → redirect на корректный шаг.
- [ ] `CabinetBookingEntry` — только Link, без Dialog/Sheet.
- [ ] Онлайн и очный форматы работают через wizard.
- [ ] После успешной записи → редирект на `/app/patient/cabinet`.
- [ ] `pnpm run ci` green.
- [ ] `EXECUTION_LOG.md` обновлён по всем задачам S7.T01–S7.T09.
