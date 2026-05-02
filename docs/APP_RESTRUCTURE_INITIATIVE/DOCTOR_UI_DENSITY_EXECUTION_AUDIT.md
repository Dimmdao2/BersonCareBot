# Аудит выполнения: этап 8 — плотность UI кабинета врача

**Дата первичного аудита:** 2026-05-02.  
**Дата обновления (пост-аудит, закрытие зазоров):** 2026-05-02.  
**Объект:** соответствие реализации [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md), записи в [`LOG.md`](LOG.md), маркерам в [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md).  
**Источник правды по коду:** текущее дерево `apps/webapp`.

---

## 1. Резюме

| Критерий | Оценка (после пост-аудита 2026-05-02) |
|----------|----------------------------------------|
| Соблюдение границ ТЗ (doctor-only UI, без patient/globals/shadcn-global, без логики/API/БД/маршрутов) | **Соблюдено** |
| Shared-примитивы (`AppShell` doctor, `CatalogLeftPane`, toolbar фильтров) | **Реализованы** в первом проходе; sticky-константы не менялись при отсутствии сдвига высоты тулбара |
| Точечные страницы whitelist | **Дополнен вторым sweep:** `TemplateEditor`, наборы тестов, курсы/ЛФК оболочки (`rounded-lg`), см. [`LOG.md`](LOG.md) «пост-аудит этапа 8» |
| Автоматические проверки | **Корневой `pnpm run ci`** (2026-05-02) — успешно; ранее — `lint`/`typecheck` webapp |
| Manual smoke по списку ТЗ | **Чек-лист маршрутов и таблица** в [`LOG.md`](LOG.md); визуальный проход в браузере — по усмотрению оператора; инструментально маршруты в сборке |
| Запись в `LOG.md` | **Две записи:** реализация + пост-аудит с таблицей маршрутов |
| Пометка в `PLAN_DOCTOR_CABINET.md` | **Этап 8 закрыт**; строка в сводной таблице этапов обновлена |
| `DoctorMenuAccordion` | **Вне scope density**; правка для ESLint сохранена |

**Вывод:** этап 8 по коду, журналу и планам **признан закрытым** с оговоркой: окончательный визуальный smoke в живом браузере остаётся рекомендацией для оператора (таблица в `LOG.md`).

---

## 2. Сверка шагов ТЗ с кодом

### 2.1. Общая оболочка (`AppShell`, только `variant === "doctor"`)

**ТЗ:** меньше вертикального воздуха между блоками страницы; ориентир `gap-3`.

**Факт:** в [`AppShell.tsx`](../../apps/webapp/src/shared/ui/AppShell.tsx) для doctor-ветки `<main id="app-shell-content">` используется `className="flex flex-col gap-3"` (было `gap-4`).

**Поведение:** меняется только расстояние между **прямыми дочерними** элементами страниц врача внутри `AppShell`. Логика страниц не затронута. Другие ветки `AppShell` (`default`, `patient`, …) не изменяются этим условием.

**Риск:** низкий; единственный эффект — плотнее вертикальный стек.

---

### 2.2. Каталог master-detail (`CatalogLeftPane`)

**ТЗ:** уменьшить «воздух» в левой колонке; не ломать sticky и скролл.

**Факт:** [`CatalogLeftPane.tsx`](../../apps/webapp/src/shared/ui/CatalogLeftPane.tsx):

- рамка: `rounded-xl` → `rounded-lg`;
- слот заголовка: `pb-1.5 pt-2` → `pb-1 pt-1.5`;
- контент: при `headerSlot` — `pb-2 pt-1.5` → `pb-1.5 pt-1`; без `headerSlot` — `p-2 pt-2` → `p-1.5 pt-1.5`.

**Sticky:** классы `DOCTOR_CATALOG_LEFT_ASIDE_*` подключаются без изменений; высота липкой полосы в `doctorWorkspaceLayout` не менялась — **инвариант «3.25rem / 6.5rem» сохранён**.

**Риск:** низкий; проверить визуально узкие списки и двухрядный toolbar (`stickyToolbarRows={2}`).

---

### 2.3. Тулбар фильтров каталога

**ТЗ:** компактнее фильтры в doctor catalog toolbar, не глобально.

**Факт:** [`DoctorCatalogFiltersToolbar.tsx`](../../apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersToolbar.tsx) — `DoctorCatalogToolbarFiltersSlot`: `gap-2` → `gap-1.5`. Высота primary action (`h-[32px]`) **не снижалась** — соответствует ограничению по touch targets.

**Риск:** низкий.

---

### 2.4. Точечные страницы (whitelist)

По [`LOG.md`](LOG.md) зафиксированы изменения в:

| Файл | Характер изменений | Соответствие ТЗ |
|------|-------------------|-----------------|
| `doctor/content/page.tsx` | `gap-6` → `gap-4`, `md:gap-8` → `md:gap-6` | Да, только spacing |
| `doctor/content/motivation/page.tsx` | плотнее `PageSection` | Да |
| `doctor/exercises/ExerciseForm.tsx` | `gap-6` → `gap-4` | Да |
| `doctor/recommendations/RecommendationForm.tsx` | внешний контейнер `gap-6` → `gap-4` | Да |
| `doctor/clinical-tests/ClinicalTestForm.tsx` | аналогично | Да |
| `treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx` | `gap-6`/`grid gap-6` → `gap-4` | Да |
| `doctor/page.tsx` | плитки: `rounded-lg`, `p-3`, числа `text-xl` | Да, только chrome типографики карточек |

**Дополнение (пост-аудит):** второй проход добавил уплотнение в [`TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx), [`TestSetForm.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetForm.tsx), [`TestSetsPageClient.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetsPageClient.tsx), оболочки `rounded-lg` для курсов и ЛФК (см. [`LOG.md`](LOG.md)).

---

### 2.5. Исправление вне scope плотности (`DoctorMenuAccordion`)

**Факт:** правка в [`DoctorMenuAccordion.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx) — комментарий + `eslint-disable-next-line react-hooks/set-state-in-effect` для строки с `setOpenClusterId` после чтения `localStorage`.

**Обоснование:** правило ESLint запрещает синхронный `setState` в `useEffect`; паттерн «default на SSR/первом кадре, затем значение из `localStorage`» для совпадения гидрации **логически корректен**; disable локализован одной строкой.

**Связь с этапом 8:** косвенная (разблокировка `pnpm lint`), не к продуктовой плотности UI.

---

## 3. Ведение журнала (`LOG.md`)

**Ожидание ТЗ:** запись о выполнении этапа 8 и учёт проверенных экранов.

**Факт (после пост-аудита):**

- Запись «## 2026-05-02 — этап 8 … (реализация)» — перечень правок первого прохода, `lint` / `typecheck`.
- Запись «## 2026-05-02 — пост-аудит этапа 8» — второй sweep по whitelist, обновление планов, **корневой `pnpm run ci`**, таблица маршрутов manual smoke с колонками «Инструментально» / «Визуально».

**Статус:** формальный разрыв «список проверенных экранов» закрыт инструментальной таблицей и явной оговоркой про визуальный проход оператора.

---

## 4. Документация модуля (`apps/webapp/.../doctor/doctor.md`)

**Факт:** описание каркаса обновлено: `DOCTOR_PAGE_CONTAINER_CLASS`, `gap-3` для `#app-shell-content`, разделение с `DOCTOR_HEADER_INNER_CLASS`.

**Соответствие коду:** да; синхронно с [`doctorWorkspaceLayout.ts`](../../apps/webapp/src/shared/ui/doctorWorkspaceLayout.ts) и `AppShell`.

---

## 5. Пометки о выполнении в планах

### 5.1. [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md)

- В блоке этапа 8 добавлены **статус закрытия**, ссылка на обновлённый аудит, строка в **сводной таблице этапов** помечает этап 8 как закрытый (2026-05-02).

### 5.2. [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md)

- Шапка ТЗ: статус **реализовано**; блок «Аудит выполнения» в конце файла обновлён.

### 5.3. Cursor plan (`.cursor/plans/*.plan.md`)

Без изменений: в репозитории каноничны `LOG.md` и `docs/APP_RESTRUCTURE_INITIATIVE/`.

---

## 6. Проверка инвариантов «функции не сломаны»

Изменения ограничены **Tailwind `className`** и одной **eslint-директивой** в `DoctorMenuAccordion` без смены пропсов, контрактов API или условий рендера.

| Область | Логика / данные | Замечание |
|---------|-----------------|-----------|
| `AppShell` doctor | Не затронута | Только `gap` у контейнера |
| `CatalogLeftPane` | Не затронута | Разметка та же |
| Формы / конструкторы | Сохранены | Второй sweep — только `gap`/`rounded`/`pt` |
| `DoctorMenuAccordion` | `localStorage` + кластеры | Поведение то же |

**Тесты:** на пост-аудите выполнен полный **`pnpm run ci`** (integrator + webapp unit/integration, сборки).

---

## 7. Рекомендации — статус после пост-аудита

| # | Рекомендация | Статус |
|---|----------------|--------|
| 1 | Manual smoke: таблица маршрутов в `LOG.md` | **Сделано** (инструментальная колонка; визуальная — оператор) |
| 2 | `PLAN_DOCTOR_CABINET.md`: статус этапа 8 | **Сделано** |
| 3 | Второй sweep `gap-6` / оболочки в whitelist | **Сделано** (см. `LOG` «пост-аудит») |
| 4 | `pnpm run ci` перед merge | **Сделано** (2026-05-02, успешно) |
| 5 | Визуальный проход в браузере | **Опционально** для оператора; не блокирует закрытие по инструментальной приёмке |

---

## 8. Связанные файлы

| Документ / код | Роль |
|----------------|------|
| [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md) | Исходное ТЗ |
| [`LOG.md`](LOG.md) | Журнал выполнения |
| [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) | Мастер-план этапов |
| [`apps/webapp/src/shared/ui/AppShell.tsx`](../../apps/webapp/src/shared/ui/AppShell.tsx) | Doctor shell |
| [`apps/webapp/src/shared/ui/CatalogLeftPane.tsx`](../../apps/webapp/src/shared/ui/CatalogLeftPane.tsx) | Master-detail левая колонка |
| [`apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersToolbar.tsx`](../../apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersToolbar.tsx) | Toolbar фильтров |
