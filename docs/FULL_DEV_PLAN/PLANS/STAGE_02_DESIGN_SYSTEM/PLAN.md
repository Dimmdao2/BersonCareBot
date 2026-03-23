# Этап 2: Дизайн-система (Tailwind + shadcn/ui)

> Приоритет: P1  
> Зависимости: Этап 1 (багфиксы); **рекомендуется Этап 0** (Tailwind + shadcn уже в репо)  
> Риск: низкий  
> Стек: Tailwind CSS 4 + shadcn/ui  

---

## Важно

- **`docs/FULL_DEV_PLAN/PLANS/STAGE_00_TAILWIND_SETUP/PLAN.md`** частично **дублирует** подэтапы 2.1–2.2 этого файла. Перед работой **проверить фактическое состояние** `apps/webapp/` (наличие `postcss.config.mjs`, `@import "tailwindcss"` в `globals.css`, `components.json`, `src/lib/utils.ts`, `src/components/ui/`). Не переустанавливать пакеты без необходимости.
- Новые стили — **Tailwind + shadcn**; старые классы из `globals.css` удалять **только** после переноса разметки в затронутых файлах (как в этапе 1).
- Перед пушем: **`pnpm run ci`** (полный пайплайн монорепо).
- При смене разметки/селекторов — обновить **e2e** и снапшоты, если ломаются.

---

## Контекст для агента

**Перед началом прочитать:**

- `README.md` — команды, структура.
- `apps/webapp/ARCHITECTURE.md` — слои webapp (если есть).
- `docs/FULL_DEV_PLAN/ROADMAP.md` — правила для агентов (CI, стили, исключения).
- Если Tailwind/shadcn ещё не настроены: **`STAGE_00_TAILWIND_SETUP/PLAN.md`** целиком или точечно по подэтапам 0.1–0.4.

**Правила этапа 2:**

1. **Не рефакторить** страницы вне зоны текущего подэтапа; точечные правки только там, где без этого не собрать шапку/меню.
2. **Один подэтап ≈ один коммит** (логичное атомарное целое); сообщение: `feat(webapp): <подэтап 2.x> <кратко>`.
3. После каждого подэтапа — **`pnpm run ci`**.
4. Тексты UI — **на русском**.

---

## Порядок работы (зависимости)

| Подэтап | Зависит от | Примечание |
|---------|------------|------------|
| 2.1 | Этап 0 или чистая установка | Сначала сверка с репо |
| 2.2 | 2.1 | Примитивы shadcn |
| 2.3 | 2.2 (Button/иконки по желанию) | Patient шапка |
| 2.4 | 2.2 (Sheet), 2.3 желательно | Меню пациента |
| 2.5 | 2.2, 2.4 (паттерн Sheet) | Кабинет врача |
| 2.6 | 2.2 | Общие блоки + toast |
| 2.7 | 2.3–2.5 по мере готовности layout | Обертки контента |
| 2.8 | — | Можно параллельно с 2.6 |

---

## Якоря в репозитории (отправная точка)

| Зона | Файлы / модули |
|------|----------------|
| Оболочка пациента | `apps/webapp/src/shared/ui/AppShell.tsx` — `variant="patient"` передаёт в `PatientHeader` только back; **заголовок страницы сейчас в `<main>`** (`page-title`). План 2.3 требует заголовок **в шапке** — понадобится проп вроде `pageTitle` в `PatientHeader` и передача `title` из `AppShell`. |
| Шапка пациента | `apps/webapp/src/shared/ui/PatientHeader.tsx` — сейчас кастомный drawer (`.drawer-panel`), не shadcn Sheet. |
| Меню / маршруты пациента | `apps/webapp/src/app-layer/routes/paths.ts` — добавить новые пути для заглушек. |
| Кабинет врача layout | `apps/webapp/src/app/app/doctor/layout.tsx` — `DoctorHeader` (fixed) + `pt-14` для контента. |
| Навигация врача | `apps/webapp/src/shared/ui/DoctorHeader.tsx` — шапка + Sheet-меню (старый `DoctorNavigation` удалён). |
| Оболочка врача на страницах | `apps/webapp/src/shared/ui/AppShell.tsx` — `variant="doctor"` только контент (без дублирующего top-bar). |
| Тема / глобальные стили | `apps/webapp/src/app/globals.css` |
| shadcn | `apps/webapp/components.json`, `apps/webapp/src/components/ui/`, `apps/webapp/src/lib/utils.ts` |
| Корневой layout | `apps/webapp/src/app/layout.tsx` — сюда обычно `<Toaster />` (подэтап 2.6). |

---

## Когда остановиться и запросить человека

| Ситуация | Действие |
|----------|----------|
| Нет брендовых SVG (логотипы мессенджеров и т.д.) | Оставить в `public/icons/README.md` только имена файлов; в UI — **lucide-react** или плейсхолдеры. |
| Неясно, считать ли этап 0 «выполненным» | Сверить чеклист **«Общий критерий завершения этапа 0»** в `STAGE_00_.../PLAN.md`; зафиксировать в коммите/описании, что сделано. |
| Конфликт с `ROADMAP` (путь компонентов) | Для **примитивов дизайн-системы** использовать `src/components/ui/` (shadcn) и **`src/shared/ui/`** для обёрток проекта (InfoBlock, PageHeader) — явное **исключение** от правила «только modules/». |

---

## Подэтап 2.1: Tailwind CSS 4 + shadcn — сверка или установка

**Задача:** в webapp доступны Tailwind 4, PostCSS, shadcn init, `cn()`, без дублирования этапа 0.

**Действия:**

1. Проверить наличие: `apps/webapp/postcss.config.mjs`, строка `@import "tailwindcss"` в `apps/webapp/src/app/globals.css`, `apps/webapp/components.json`, `apps/webapp/src/lib/utils.ts` с `cn()`.
2. Если чего-то нет — следовать **`STAGE_00_TAILWIND_SETUP`** (0.1–0.2), не выдумывать версии пакетов: смотреть соседний lockfile / существующий `package.json`.
3. Если всё есть — **только** выровнять конфиг с целями этапа 2 (без массового удаления старого CSS): при необходимости подправить `components.json` (пути, tailwind config).

**Критерий:**

- `pnpm run ci` проходит.
- Один тестовый утилити-класс на странице можно добавить и удалить локально — сборка не ломается.

---

## Подэтап 2.2: shadcn/ui примитивы и тема

**Задача:** в проекте есть нужные примитивы; кнопки и CSS variables соответствуют продуктовым значениям.

**Файлы:**

- `apps/webapp/src/components/ui/*`
- `apps/webapp/src/app/globals.css` (секция `:root` / `.dark` для shadcn)

**Действия:**

1. Сравнить список с **этапом 0.4**; добавить недостающие через `npx shadcn@latest add ...` из корня `apps/webapp` (команды как в разделе 2.2 старой версии плана — ниже ориентир):
   ```bash
   cd apps/webapp
   npx shadcn@latest add button card dialog tabs select input textarea badge
   npx shadcn@latest add dropdown-menu popover tooltip scroll-area separator
   ```
   При конфликте имён — **не перезаписывать** кастомизации без чтения diff.
2. **Button:** варианты `default`, `secondary`, `outline`, `destructive`; при необходимости кастомный вариант **`primary`** (тёплый серо-синий) через `buttonVariants` в `components/ui/button.tsx`, не ломая остальное.
3. **Тема в CSS variables** (ориентиры из плана):
   - `--primary` → `hsl(215 35% 40%)` (или формат без `hsl()` — как принято в текущем `globals.css`).
   - `--destructive` → приглушённый красный `hsl(0 55% 45%)`.
   - `--radius` → `0.5rem` (8px).
4. Убедиться, что скругления кнопок согласованы с `input` (визуально в dev).

**Критерий:**

- Импорты из `@/components/ui/*` работают.
- Все заявленные компоненты присутствуют или явно не нужны (задокументировать в коммите).
- `pnpm run ci` проходит.

---

## Подэтап 2.3: AppShell / шапка (patient)

**Задача:** компактная шапка на Tailwind; **заголовок экрана в центре шапки**; справа иконки; без лишнего дублирования заголовка в контенте.

**Файлы:**

- `apps/webapp/src/shared/ui/AppShell.tsx`
- `apps/webapp/src/shared/ui/PatientHeader.tsx`
- `apps/webapp/src/app/globals.css` — удалить неиспользуемые правила `.patient-header*`, `.drawer-*` **после** переноса на Tailwind/shadcn.

**Действия:**

1. Передать в `PatientHeader` проп **`pageTitle`** (строка) из `AppShell` — значение текущего `title`. В `<main>` **убрать** дублирующий `<h1 className="page-title">`, если заголовок отображается в шапке (или оставить один источник истины — предпочтительно только шапка).
2. Разметка шапки (ориентир):
   ```
   [← назад] [🏠] .... Заголовок .... [💬] [🔔] [☰]
   ```
   - Центр: `pageTitle`, стили в духе `text-sm text-muted-foreground`, по центру колонки.
   - Домик: слева от центра или как в макете; использовать **lucide-react** (`House`, и т.д.).
   - Справа: сообщения (с бейджем счётчика **0 или заглушка** до появления API), колокольчик (можно disabled), меню.
3. Уменьшить вертикальные отступы шапки ~на 15% (`py-2` или эквивалент).
4. Боковое меню пациента **в подэтапе 2.4** перевести на shadcn **Sheet**; в 2.3 можно оставить временный drawer, если 2.4 идёт сразу следом — иначе минимальный рабочий UI.

**Критерий:**

- Заголовок виден в шапке, дубля в main нет.
- Шапка на утилити-классах Tailwind (+ при необходимости `cn()`).
- `pnpm run ci` проходит; e2e при наличии сценариев пациента — зелёные.

---

## Подэтап 2.4: Боковое меню (patient) на shadcn Sheet

**Задача:** выезжающее меню на **Sheet**; симметричные отступы; новые пункты и заглушки.

**Файлы:**

- Новый компонент, например `apps/webapp/src/shared/ui/PatientMenuSheet.tsx` (или логика внутри `PatientHeader.tsx`, если файл не раздувается > ~200 строк — иначе вынести).
- `apps/webapp/src/app-layer/routes/paths.ts` — константы путей.
- Новые страницы-заглушки под маршруты ниже.

**Действия:**

1. Заменить кастомный `.drawer-panel` на `<Sheet>` из shadcn; кнопка открытия — как сейчас (гамбургер), `aria-expanded` связать с Sheet.
2. Добавить в `routePaths` (или рядом) ключи:
   - `messages`: `/app/patient/messages`
   - `help`: `/app/patient/help`
   - `install`: `/app/patient/install`
3. Создать страницы-заглушки: единый простой компонент `PlaceholderPage({ title })` или повторяющийся JSX «Раздел в разработке».
4. Пункты меню:
   - «Сообщения» → `routePaths.messages`
   - «Адрес кабинета» → `window.open('https://dmitryberson.ru/adress', '_blank')` (URL как в плане; опечатка `adress` сохраняется, если так в проде — иначе уточнить у владельца)
   - «Справка» → `help`
   - «Поделиться с другом» → `navigator.clipboard.writeText` с URL текущего origin + `/app/patient` (или лендинг) + **toast** «Ссылка скопирована» (toast будет в 2.6 — до этого `alert` допустим как временная мера **или** перенести порядок 2.6 раньше на один коммит только для Toaster).
   - «Установить приложение» → `install`
5. Padding контента Sheet: одинаковый слева/справа (`px-4` или симметрично из темы).

**Критерий:**

- Меню открывается/закрывается, фокус-ловушка не хуже текущей.
- Все ссылки ведут на существующие маршруты или внешний URL.
- `pnpm run ci` проходит.

---

## Подэтап 2.5: Шапка и меню (doctor)

**Задача:** фиксированная шапка + правое меню (Sheet); убрать горизонтальный `DoctorNavigation` из layout.

**Файлы:**

- `apps/webapp/src/app/app/doctor/layout.tsx`
- Новый: `apps/webapp/src/shared/ui/DoctorHeader.tsx` (или `apps/webapp/src/components/DoctorHeader.tsx` — зафиксировать один путь и импортировать оттуда)
- `apps/webapp/src/shared/ui/AppShell.tsx` — страницы доктора должны получать отступ сверху под fixed header (`pt-*` или обёртка), не перекрывать контент.
- `apps/webapp/src/shared/ui/DoctorNavigation.tsx` — удалить использование или файл после миграции.

**Действия:**

1. Создать `DoctorHeader` (client): фиксация `fixed top-0 inset-x-0 z-50`, фон и граница через Tailwind/shadcn.
2. Структура (ориентир):
   ```
   [←] [🏠 дашборд] .... Название экрана .... [👤 клиенты] [💬 N] [☰]
   ```
   - Название экрана: проп `screenTitle` или брать из `usePathname()` + карта заголовков — предпочтительно **явный проп из страницы** через layout slot или контекст; минимально — статическая карта `pathname → title` в одном файле.
   - Счётчик сообщений: заглушка `0` до API.
3. Правое меню (Sheet): пункты **Клиенты** `/app/doctor/clients`, **Записи** `/app/doctor/appointments`, **Рассылки** `/app/doctor/broadcasts`, **Справочники** — если маршрута нет, заглушка `/app/doctor/references` или уточнение в комментарии TODO; **CMS** `/app/doctor/content`, **Статистика** `/app/doctor/stats`, разделитель, **Профиль** (если есть страница доктора; иначе ссылка на настройки профиля), **Настройки** `/app/settings`.
4. В `layout.tsx`: убрать `<DoctorNavigation />`; вставить `<DoctorHeader />` и обернуть `children` в контейнер с **`padding-top`** равным высоте шапки (или `main` с `pt-14` — измерить).
5. **Убрать дублирующую ссылку «Настройки»** со страниц доктора, если она есть в шапке/меню (план: не вести настройки с каждой страницы отдельно — только из меню). Поиск: `grep -r "Настройки" apps/webapp/src/app/app/doctor`.
6. Страницы, использующие `AppShell variant="doctor"`, привести к единой схеме: контент не под шапкой layout дважды.

**Критерий:**

- Нет `DoctorNavigation` в дереве рендера.
- Шапка фиксирована, контент не перекрывается.
- `pnpm run ci` проходит.

---

## Подэтап 2.6: Базовые переиспользуемые компоненты + toast

**Задача:** общие блоки для контента; глобальные уведомления.

**Расположение (согласовано с ROADMAP):**

- `apps/webapp/src/components/ui/*` — только shadcn.
- Обёртки проекта: **`apps/webapp/src/shared/ui/`** — `InfoBlock.tsx`, `EmptyState.tsx`, `StatusBadge.tsx`, `PageHeader.tsx` (или подпапка `shared/ui/ds/` при росте числа файлов).

**Действия:**

1. **InfoBlock:** `variant: 'info' | 'important'` — muted vs destructive/10.
2. **PageHeader:** заголовок + опциональный breadcrumb (проп `breadcrumbs?: { label: string; href?: string }[]`).
3. **EmptyState:** текст + опционально `action` (ReactNode или слот под `Button`).
4. **StatusBadge:** несколько визуальных вариантов (success / neutral / destructive) через `className` или `variant`.
5. **`react-hot-toast`:** `pnpm --filter webapp add react-hot-toast`; в `apps/webapp/src/app/layout.tsx` добавить `<Toaster />` (и при необходимости позиционирование через пропы).

**Критерий:**

- Компоненты экспортируются и типизированы.
- Один вызов `toast()` работает с клиентской страницы.
- `pnpm run ci` проходит.

---

## Подэтап 2.7: Адаптивность — breakpoints и оболочки

**Задача:** предсказуемые контейнеры для patient/doctor.

**Файлы:**

- `apps/webapp/src/app/app/layout.tsx` и/или сегментные layout под `app/patient`, `app/doctor` — **проверить фактическую структуру** перед правками.

**Действия:**

1. Использовать стандартные breakpoints Tailwind (sm/md/lg/xl) без изобретения своих, если нет ТЗ.
2. Patient: основной контент в обёртке `max-w-[480px] mx-auto w-full px-...` (на уровне layout или AppShell — одно место, не дублировать).
3. Doctor: `max-w-7xl mx-auto` на широких экранах; на mobile `w-full`.
4. **Sidebar placeholder:** блок `hidden md:block w-64 shrink-0` в layout доктора **или** комментарий TODO + пустой `<aside>` — не ломать текущий master-detail на клиентах.

**Критерий:**

- На узком экране нет горизонтального скролла из-за обёртки.
- `pnpm run ci` проходит.

---

## Подэтап 2.8: Каталог иконок (public)

**Задача:** структура папки и реестр имён; рисованные иконки не обязаны быть в репо в первом проходе.

**Файлы:**

- `apps/webapp/public/icons/README.md`
- При наличии ассетов — `apps/webapp/public/icons/*.svg`

**Действия:**

1. Создать `public/icons/` и `README.md` со списком из плана (telegram, max, vk, home, back, menu, …).
2. В UI по умолчанию использовать **lucide-react**; кастомные SVG — подключать из `public/icons/` по мере появления файлов.
3. Не коммитить тяжёлые бинарники без необходимости.

**Критерий:**

- README отражает договорённые имена файлов.
- `pnpm run ci` проходит.

---

## Общий критерий завершения этапа 2

- [ ] Этап 0 учтён: нет дублирующей установки; конфиги согласованы.
- [ ] shadcn примитивы и тема (primary, destructive, radius) соответствуют плану.
- [ ] Шапка patient: заголовок в шапке, Tailwind, компактнее.
- [ ] Меню patient: Sheet, новые маршруты и заглушки.
- [ ] Шапка doctor: fixed + Sheet-меню; `DoctorNavigation` удалён из использования.
- [ ] InfoBlock, EmptyState, StatusBadge, PageHeader добавлены; Toaster в layout.
- [ ] Контейнеры patient/doctor и breakpoints применены осмысленно.
- [ ] `public/icons/README.md` создан.
- [ ] `pnpm run ci` проходит без ошибок.
- [ ] E2E / тесты обновлены при смене селекторов.

---

## Отчёт агента (рекомендуется)

Кратко: что сделано по подэтапам; отличия от STAGE_00, если этап 0 выполнялся частично; список новых маршрутов; TODO для счётчиков сообщений и «Справочников».
