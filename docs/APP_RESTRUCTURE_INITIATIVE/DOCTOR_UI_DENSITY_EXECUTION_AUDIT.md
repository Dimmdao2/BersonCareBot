# Аудит выполнения: этап 8 — плотность UI кабинета врача

**Дата аудита:** 2026-05-02.  
**Объект:** соответствие реализации [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md), записи в [`LOG.md`](LOG.md), маркерам в [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md).  
**Источник правды по коду:** текущее дерево `apps/webapp` (ревизия на момент аудита).

---

## 1. Резюме

| Критерий | Оценка |
|----------|--------|
| Соблюдение границ ТЗ (doctor-only UI, без patient/globals/shadcn-global, без логики/API/БД/маршрутов) | **Соблюдено** по затронутым файлам |
| Shared-примитивы (`AppShell` doctor, `CatalogLeftPane`, toolbar фильтров) | **Реализованы**; `doctorWorkspaceLayout` sticky-константы **не менялись** — согласовано с отсутствием изменения высоты липкой полосы |
| Точечные страницы whitelist | **Частично покрыты**: CMS hub, мотивации, формы, конструктор шаблона программы, дашборд; не проходились отдельно `courses/**`, `lfk-templates/**` страницы каталога, `test-sets/**`, `clinical-tests/**` list-only как отдельный sweep |
| Автоматические проверки (`lint`, `typecheck`) | **Зафиксированы как пройденные** в `LOG.md` |
| Manual smoke по списку ТЗ | **Не зафиксирован как выполненный** в `LOG.md` (указано «выполнить при поднятом dev») — **разрыв с Definition of Done ТЗ** |
| Запись в `LOG.md` | **Есть**, перечислены файлы и исключения |
| Пометка «этап 8 закрыт» в `PLAN_DOCTOR_CABINET.md` | **Отсутствует** — этап описан как активный блок без статуса «реализовано / закрыт» |
| Вспомогательное исправление вне ТЗ плотности | [`DoctorMenuAccordion.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx): `eslint-disable` для `setState` в `useEffect` — **не про density**, но **необходимо для прохождения lint** |

**Вывод:** реализация по коду соответствует духу ТЗ (уплотнение без редизайна). Для формального закрытия этапа по тексту [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md) не хватает: явного списка пройденных smoke-маршрутов в `LOG.md`, опционально — пометки статуса этапа в [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) и обновления шапки [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md).

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

**Не отражено в `LOG` как отдельный проход:** страницы каталогов «только список» в `lfk-templates`, `courses`, `test-sets`, `clinical-tests` без форм — если там остались крупные `gap-6` / `p-6`, это **остаточный визуальный долг**, не блокер для частичного закрытия этапа.

---

### 2.5. Исправление вне scope плотности (`DoctorMenuAccordion`)

**Факт:** правка в [`DoctorMenuAccordion.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx) — комментарий + `eslint-disable-next-line react-hooks/set-state-in-effect` для строки с `setOpenClusterId` после чтения `localStorage`.

**Обоснование:** правило ESLint запрещает синхронный `setState` в `useEffect`; паттерн «default на SSR/первом кадре, затем значение из `localStorage`» для совпадения гидрации **логически корректен**; disable локализован одной строкой.

**Связь с этапом 8:** косвенная (разблокировка `pnpm lint`), не к продуктовой плотности UI.

---

## 3. Ведение журнала (`LOG.md`)

**Ожидание ТЗ ([`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md) §Definition of Done):** запись о выполнении этапа 8 и **список проверенных экранов**.

**Факт:** запись «## 2026-05-02 — этап 8 … (реализация)» содержит:

- перечень изменённых примитивов и файлов;
- `lint` / `typecheck` — ok;
- тесты webapp — явно «не запускали» с обоснованием;
- manual smoke — **не как выполненный чек-лист**, а как рекомендация для dev.

**Зазор:** для полного соответствия тексту DoD ТЗ нужно после ручного прогона **дописать в ту же запись** маркированный список маршрутов из раздела «Проверки этапа» ТЗ с отметками «ok» / дата / окружение.

---

## 4. Документация модуля (`apps/webapp/.../doctor/doctor.md`)

**Факт:** описание каркаса обновлено: `DOCTOR_PAGE_CONTAINER_CLASS`, `gap-3` для `#app-shell-content`, разделение с `DOCTOR_HEADER_INNER_CLASS`.

**Соответствие коду:** да; синхронно с [`doctorWorkspaceLayout.ts`](../../apps/webapp/src/shared/ui/doctorWorkspaceLayout.ts) и `AppShell`.

---

## 5. Пометки о выполнении в планах

### 5.1. [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md)

- В шапке зафиксирован только **закрытый этап 1 (CMS)**.
- Блок **«Этап 8. Плотность интерфейса»** не содержит строки вида «реализовано / закрыт по аудиту» и ссылки на этот документ.

**Рекомендация:** по решению команды добавить под этапом 8 одну строку: ссылка на [`DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md`](DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md) и статус (например «реализовано в коде, smoke — вручную»).

### 5.2. [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md)

- Шапка до аудита: «ТЗ готово к исполнению» — после принятия аудита целесообразно добавить блок «Аудит выполнения» (см. конец файла ТЗ) со ссылкой сюда и кратким статусом.

### 5.3. Cursor plan (`.cursor/plans/*.plan.md`)

Файлы планов Cursor обычно **не хранятся в репозитории**; синхронизация `todos`/`status` в frontmatter с фактом merge — **на совести исполнителя в IDE**. В репозитории каноничны `LOG.md` и документы в `docs/APP_RESTRUCTURE_INITIATIVE/`.

---

## 6. Проверка инвариантов «функции не сломаны»

Изменения ограничены **Tailwind `className`** и одной **eslint-директивой** без смены пропсов, контрактов API или условий рендера.

| Область | Логика / данные | Замечание |
|---------|-----------------|-----------|
| `AppShell` doctor | Не затронута | Только `gap` у контейнера |
| `CatalogLeftPane` | Не затронута | Разметка та же |
| Формы (Exercise, Recommendation, Clinical test) | `action`, поля, `useActionState` | Не менялись |
| `TreatmentProgramConstructorClient` | Сетка этапов, API вызовы | По коду ожидается только визуальный `gap` |
| `DoctorMenuAccordion` | `localStorage` + раскрытие кластеров | Поведение то же; только подавление lint для одной строки |

Автотесты webapp по затронутым компонентам **не добавлялись и явно не прогонялись** под этот этап — приёмка опирается на `lint`/`typecheck` и ручной smoke.

---

## 7. Рекомендации (закрытие формальных пробелов)

1. **Manual smoke:** один раз пройти маршруты из [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md) §«Проверки этапа» и **дописать список в `LOG.md`** под записью 2026-05-02.
2. **`PLAN_DOCTOR_CABINET.md`:** при принятии этапа — строка со статусом этапа 8 и ссылкой на этот аудит.
3. **Опционально:** точечный `rg` по whitelist-папкам на оставшиеся `gap-6` / `p-6` для второго микро-прохода без расширения scope.
4. **`pnpm run ci`:** перед merge в `main` — по правилам репозитория (корневой CI).

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
