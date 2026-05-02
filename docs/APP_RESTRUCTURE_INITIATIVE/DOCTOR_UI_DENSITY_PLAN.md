# DOCTOR_UI_DENSITY_PLAN — этап 8: плотность интерфейса врача

**Дата:** 2026-05-02.  
**Статус:** реализовано (2026-05-02); журнал исполнения и пост-аудит — [`LOG.md`](LOG.md), [`DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md`](DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md).  
**Исполнение плана / ТЗ:** **выполнено** (код, записи в журнале, пост-аудит, закрытие этапа в [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md)).  
**Связанный общий план:** [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md), этап 8.

---

## Цель

Уменьшить визуальную крупность кабинета врача: карточки, отступы, списки, тулбары и текст сейчас занимают слишком много места для рабочего кабинета. Нужно сделать интерфейс плотнее, чтобы врач видел больше полезной информации без уменьшения масштаба браузера.

Это аккуратный UI-проход, а не редизайн. Исполнитель должен менять только doctor UI и только там, где эффект заметен сразу.

---

## Продуктовый принцип

Нужна не «мелкая админка», а более рабочая плотность:

- меньше пустого воздуха в карточках и списках;
- больше строк и элементов помещается на первом экране;
- текст остаётся читаемым;
- основные CTA не становятся мелкими или трудными для нажатия;
- мобильный сценарий не ухудшается.

Если изменение выглядит как новый дизайн-системный слой, оно слишком большое для этого этапа.

---

## Scope boundaries

Разрешено трогать:

- `apps/webapp/src/shared/ui/doctorWorkspaceLayout.ts`;
- `apps/webapp/src/shared/ui/AppShell.tsx` только в ветке `variant === "doctor"`;
- `apps/webapp/src/shared/ui/DoctorCatalogPageLayout.tsx`;
- `apps/webapp/src/shared/ui/CatalogLeftPane.tsx`;
- `apps/webapp/src/shared/ui/doctor/DoctorCatalogStickyToolbar.tsx`;
- `apps/webapp/src/shared/ui/doctor/doctorCatalogToolbarFilterClasses.ts`;
- doctor-only shared компоненты, если они явно используются только в кабинете врача;
- точечно страницы кабинета врача, где нет shared-примитива и крупность особенно заметна:
  - `apps/webapp/src/app/app/doctor/content/**`;
  - `apps/webapp/src/app/app/doctor/exercises/**`;
  - `apps/webapp/src/app/app/doctor/lfk-templates/**`;
  - `apps/webapp/src/app/app/doctor/treatment-program-templates/**`;
  - `apps/webapp/src/app/app/doctor/recommendations/**`;
  - `apps/webapp/src/app/app/doctor/courses/**`;
  - `apps/webapp/src/app/app/doctor/clinical-tests/**`;
  - `apps/webapp/src/app/app/doctor/test-sets/**`;
  - `apps/webapp/src/app/app/doctor/page.tsx`, если нужно проверить главную врача;
- тесты по затронутым компонентам;
- `docs/APP_RESTRUCTURE_INITIATIVE/LOG.md`;
- при необходимости этот документ и `PLAN_DOCTOR_CABINET.md`.

Вне scope:

- не трогать пациентский интерфейс: `apps/webapp/src/app/app/patient/**`, `Patient*`, `patientVisual.ts`, `#app-shell-patient`;
- не менять shadcn/base UI глобально ради doctor density;
- не менять бизнес-логику, API, БД, миграции;
- не менять маршруты;
- не делать этап 2 меню, этап 3 бейджи, этап 4 дашборд или этап 7 usage counters;
- не переписывать карточку пациента глубоко. Для карточки пациента разрешён только визуальный smoke в конце, без новых функций;
- не добавлять новые зависимости.

---

## Основная стратегия

Сначала менять общие doctor-примитивы, потом точечно самые крупные экраны.

Приоритет:

1. Общая оболочка кабинета врача.
2. Каталожные layout-компоненты.
3. Левые списки / master-detail карточки.
4. Липкие тулбары и фильтры.
5. Самые заметные страницы с локальным custom chrome.

Не нужно вручную править десятки карточек, если проблему можно решить одним shared-классом.

---

## Целевые ориентиры

Это не строгие токены, а рабочие ориентиры для исполнителя:

- общий gap между блоками: чаще `gap-3`, а не `gap-4/5/6`;
- padding страницы врача: не увеличивать сверх текущего `px-3 pt-3 pb-6`;
- карточки catalog/master-detail: чаще `rounded-lg` или `rounded-xl`, `p-2` / `p-3`, а не крупные `p-5` / `p-6`;
- заголовки внутри рабочих карточек: чаще `text-sm` / `text-base`, а не `text-xl`, если это не главный заголовок страницы;
- вторичный текст: `text-xs` / `text-sm`, без чрезмерных line-height;
- фильтры в toolbar должны оставаться компактными и не раздувать высоту липкой полосы;
- touch target на мобильных не ломать: интерактивные элементы не делать неудобно мелкими.

Если экран уже плотный и читаемый, не трогать его ради единообразия.

---

## Шаги исполнения

### Шаг 0. Preflight и снимок текущей крупности

Собрать факты перед правками:

- перечитать `doctorWorkspaceLayout.ts`, `AppShell.tsx`, `DoctorCatalogPageLayout.tsx`, `CatalogLeftPane.tsx`, `DoctorCatalogStickyToolbar.tsx`;
- найти локальные крупные классы в doctor pages:
  - `rg "p-6|p-5|gap-6|gap-5|text-xl|text-2xl|rounded-\\[|rounded-2xl|space-y-6|space-y-5" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui`;
- выбрать 4-6 экранов для visual smoke:
  - CMS;
  - упражнения;
  - комплексы ЛФК;
  - шаблоны программ;
  - рекомендации;
  - курсы или тесты;
  - карточка пациента только как smoke, без рефакторинга.

Критерий закрытия: исполнитель понимает, где крупность задаётся общими primitives, а где локальными page-компонентами.

### Шаг 1. Общие doctor layout-примитивы

- Проверить `DOCTOR_PAGE_CONTAINER_CLASS`, `DOCTOR_CATALOG_STICKY_BAR_CLASS`, `DoctorCatalogPageLayout`.
- Если можно уменьшить крупность централизованно, сделать это там.
- Не менять ширину сайдбара и общую геометрию без явной причины.
- Не трогать patient shell.

Проверки:

- `rg "DOCTOR_PAGE_CONTAINER_CLASS|DOCTOR_CATALOG_STICKY_BAR_CLASS|DoctorCatalogPageLayout" apps/webapp/src`;
- visual smoke: любая doctor page через `AppShell variant="doctor"` не получила сломанные отступы.

### Шаг 2. Каталожные списки и master-detail

- Проверить `CatalogLeftPane` и страницы, которые его используют.
- Уменьшить внутренние отступы списков только если это даёт заметный выигрыш.
- Сохранить скролл и sticky-height поведение.
- Не ломать mobile карточный режим.

Проверки:

- visual smoke в упражнениях и одном каталоге с master-detail;
- если есть тесты на layout-компонент, обновить их только по необходимости.

### Шаг 3. Липкие тулбары и фильтры

- Проверить высоту `DoctorCatalogStickyToolbar`.
- Проверить `DOCTOR_CATALOG_TOOLBAR_FILTER_WRAP_CLASS`.
- Сделать фильтры компактнее только в doctor catalog toolbar, не глобально.

Проверки:

- visual smoke: фильтры не переносятся некрасиво на desktop;
- на узком экране фильтры не вылезают за контейнер.

### Шаг 4. Точечные крупные страницы

Если после shared-правок крупность всё ещё заметна, точечно пройти самые проблемные doctor pages:

- CMS;
- упражнения;
- комплексы ЛФК;
- шаблоны программ;
- рекомендации;
- курсы;
- клинические тесты / наборы тестов.

Правило: менять только spacing/typography/chrome. Не менять данные, flow, тексты бизнес-логики и сценарии.

Проверки:

- `rg` по изменённым файлам на случайные patient imports / patient classes;
- visual smoke каждого изменённого экрана.

### Шаг 5. Guardrail: пациентский UI не затронут

- Проверить, что не менялись patient-файлы.
- Если изменён shared-компонент, убедиться, что он doctor-only или что patient usage отсутствует.
- Если компонент используется и врачом, и пациентом, остановиться и либо вынести doctor variant, либо согласовать расширение scope.

Проверки:

- `git diff -- apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patientVisual.ts apps/webapp/src/app/globals.css`;
- `rg "<changed shared symbol>" apps/webapp/src/app/app/patient apps/webapp/src/shared/ui`.

### Шаг 6. Документация и лог

- Добавить запись в `LOG.md`: какие shared-примитивы изменены, какие экраны проверены, что сознательно не делали.
- Если появились новые doctor density primitives, кратко описать их в `apps/webapp/src/app/app/doctor/doctor.md` или рядом с изменённым shared-файлом, если такой файл уже есть.

---

## Проверки этапа

Step-level после точечных правок:

```bash
pnpm --dir apps/webapp lint
```

Если менялись типы/exports shared-компонентов:

```bash
pnpm --dir apps/webapp typecheck
```

Если менялись компоненты с существующими тестами:

```bash
pnpm --dir apps/webapp test -- <relevant-test-file-or-pattern>
```

Полный корневой `pnpm run ci` внутри этого этапа не нужен, если изменения ограничены doctor UI. Перед push действует общее правило репозитория.

Manual smoke обязателен:

- `/app/doctor` или текущая главная врача;
- `/app/doctor/content`;
- `/app/doctor/exercises`;
- `/app/doctor/lfk-templates`;
- `/app/doctor/treatment-program-templates`;
- `/app/doctor/recommendations`;
- один экран курсов или тестов;
- одна карточка пациента только для проверки, что визуально ничего не развалилось.

---

## Stop conditions

Исполнитель должен остановиться и спросить, если:

- нужное изменение требует глобальной правки shadcn/base components;
- shared-компонент используется и врачом, и пациентом, и doctor-only variant не очевиден;
- задача начинает превращаться в redesign отдельных страниц;
- нужно менять бизнес-логику, маршруты или данные;
- после уменьшения отступов ломается mobile usability;
- изменения требуют новых дизайн-токенов в `globals.css` или patient tokens;
- чтобы получить эффект, нужно трогать больше 6-8 крупных страниц вручную.

---

## Definition of Done

- Общая оболочка и каталожные doctor-примитивы стали плотнее там, где это даёт заметный эффект.
- Самые крупные doctor screens прошли точечный visual smoke.
- Пациентский интерфейс не затронут.
- Нет глобального изменения shadcn/base UI.
- Нет изменений бизнес-логики, API, БД и маршрутов.
- `pnpm --dir apps/webapp lint` прошёл; `typecheck` и targeted tests выполнены, если scope этого требовал.
- `LOG.md` содержит запись о выполнении этапа 8 и список проверенных экранов.

---

## Аудит выполнения

Подробная сверка ТЗ, кода, [`LOG.md`](LOG.md) и пометок в мастер-плане: [`DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md`](DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md).

**Кратко:** реализация и инструментальные проверки зафиксированы в [`LOG.md`](LOG.md); актуальное состояние сверки ТЗ/кода — [`DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md`](DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md). Визуальный smoke по маршрутам ТЗ остаётся на оператора при работе в dev/stage (таблица в журнале, пост-аудит этапа 8).
