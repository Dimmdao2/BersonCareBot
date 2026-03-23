# Этап 2: Дизайн-система (Tailwind + shadcn/ui)

> Приоритет: P1
> Зависимости: Этап 1 (багфиксы)
> Риск: низкий
> Стек: Tailwind CSS 4 + shadcn/ui

---

## Подэтап 2.1: Установка Tailwind CSS 4 + shadcn/ui

**Задача:** настроить Tailwind и shadcn/ui в webapp.

**Файлы:**
- `apps/webapp/package.json`
- `apps/webapp/tailwind.config.ts` (или CSS-based config для Tailwind 4)
- `apps/webapp/src/app/globals.css`
- `apps/webapp/components.json` (shadcn config)
- `apps/webapp/src/lib/utils.ts` (утилита `cn()`)

**Действия:**
1. Установить Tailwind CSS 4: `pnpm --filter webapp add tailwindcss @tailwindcss/postcss postcss`.
2. Настроить PostCSS и Tailwind (или CSS-based конфигурацию Tailwind 4).
3. Добавить Tailwind директивы в `globals.css`:
   ```css
   @import "tailwindcss";
   ```
4. Настроить тему: цвета проекта (patient-bg, surface, текст), радиусы, шрифты — как CSS-переменные для shadcn.
5. Инициализировать shadcn/ui: `npx shadcn@latest init`.
6. Создать `src/lib/utils.ts` с `cn()` (clsx + tailwind-merge).
7. Убедиться что существующий CSS в globals.css не конфликтует с Tailwind (оставить его пока — будет удаляться попутно).

**Критерий:**
- `pnpm run ci` проходит.
- Tailwind классы работают в компонентах.
- shadcn/ui инициализирован.

---

## Подэтап 2.2: shadcn/ui примитивы

**Задача:** добавить базовые shadcn-компоненты.

**Файлы:**
- `apps/webapp/src/components/ui/` (стандартная shadcn-структура)

**Действия:**
1. Добавить компоненты shadcn/ui:
   ```bash
   npx shadcn@latest add button card dialog tabs select input textarea badge
   npx shadcn@latest add dropdown-menu popover tooltip scroll-area separator
   ```
2. Настроить Button варианты в соответствии с планом:
   - `default` — обычная.
   - `secondary` / `outline` — инверсия (тёмно-серый текст, светлый фон).
   - `destructive` — красная (приглушённый красный).
   - Добавить кастомный variant `primary` — серовато тёмно-синий (тёплый, не яркий).
3. Настроить цветовую схему в CSS-переменных shadcn:
   - `--primary`: тёплый приглушённый синий (`hsl(215 35% 40%)`).
   - `--destructive`: приглушённый красный (`hsl(0 55% 45%)`).
   - `--radius`: 8px (уменьшить от текущих 12–16px).
4. Скругления кнопок не должны конфликтовать с полями ввода.

**Критерий:**
- Все shadcn-компоненты доступны.
- Button 4 варианта работают.
- Цвета и скругления по плану.

---

## Подэтап 2.3: AppShell / шапка (patient)

**Задача:** переписать шапку на Tailwind, уменьшить, добавить заголовок и иконки.

**Файлы:**
- `apps/webapp/src/shared/ui/AppShell.tsx`
- `apps/webapp/src/shared/ui/PatientHeader.tsx`

**Действия:**
1. Переписать PatientHeader на Tailwind-классы.
2. Уменьшить высоту шапки на ~15% (padding `py-2` вместо текущего).
3. Структура:
   ```
   [← назад] [🏠] .... Заголовок страницы .... [💬] [🔔] [☰]
   ```
4. Заголовок: props `pageTitle`, по центру, `text-sm text-muted-foreground`.
5. Иконка домика: прижать влево рядом со стрелкой.
6. Справа: иконка сообщений (со счётчиком), колокольчик (будущее), меню.
7. Удалить старые CSS-классы из globals.css (`top-bar`, `top-bar__actions` и т.д.) по мере замены.

**Критерий:**
- Шапка компактнее, на Tailwind.
- Заголовок страницы по центру.
- Иконки справа.
- Старые CSS-классы шапки можно удалить.

---

## Подэтап 2.4: Боковое меню (patient)

**Задача:** боковое меню на shadcn Sheet/Dialog, новые пункты.

**Файлы:**
- Компонент бокового меню
- `apps/webapp/src/app-layer/routes/paths.ts`

**Действия:**
1. Использовать shadcn `Sheet` (side drawer) для бокового меню.
2. Выровнять padding: одинаковый слева и справа.
3. Добавить пункты:
   - «Сообщения» → `/app/patient/messages` (пока заглушка).
   - «Адрес кабинета» → `window.open('https://dmitryberson.ru/adress', '_blank')`.
   - «Справка» → `/app/patient/help` (пока заглушка).
   - «Поделиться с другом» → копирование ссылки + toast.
   - «Установить приложение» → `/app/patient/install` (пока заглушка).
4. Заглушки: компонент с текстом «Раздел в разработке».

**Критерий:**
- Меню через shadcn Sheet.
- Все пункты кликабельны.
- Padding симметричный.

---

## Подэтап 2.5: Шапка и меню (doctor)

**Задача:** создать фиксированную шапку и правое меню для доктора.

**Файлы:**
- `apps/webapp/src/shared/ui/DoctorNavigation.tsx` → заменить
- Новый: `DoctorHeader.tsx`

**Действия:**
1. Создать `DoctorHeader` на Tailwind по аналогии с PatientHeader:
   ```
   [← назад] [🏠 дашборд] .... Название экрана .... [👤 клиенты] [💬 N] [☰]
   ```
2. Фиксированная позиция: `fixed top-0 z-50`.
3. Правое меню (shadcn Sheet): Клиенты, Записи, Рассылки, Справочники, CMS, Статистика, --- , Профиль, Настройки.
4. Убрать DoctorNavigation (кнопки вверху страниц).
5. Убрать кнопку «настройки» со всех страниц доктора.

**Критерий:**
- Шапка доктора фиксирована сверху.
- Правое меню shadcn Sheet с пунктами.
- Старая навигация убрана.

---

## Подэтап 2.6: Базовые переиспользуемые компоненты

**Задача:** создать набор базовых компонентов проекта на shadcn.

**Файлы:**
- `apps/webapp/src/components/` (новая структура)

**Действия:**
1. **InfoBlock** — компонент информационных сообщений:
   - Props: `children`, `variant: 'info' | 'important'`.
   - `info`: мягкий фон (`bg-muted`), тонкая border.
   - `important`: красный фон (`bg-destructive/10`), красный текст.
2. **PageHeader** — заголовок страницы + breadcrumb (опционально).
3. **EmptyState** — пустое состояние с текстом и опциональной кнопкой.
4. **StatusBadge** — цветной бейдж для статусов (зелёный/сиреневый/красный).
5. Интегрировать `react-hot-toast`: добавить `<Toaster />` в layout.tsx.

**Критерий:**
- InfoBlock, EmptyState, StatusBadge, PageHeader — работают.
- Toast-уведомления работают.

---

## Подэтап 2.7: Адаптивность — breakpoints

**Задача:** настроить breakpoints в Tailwind.

**Файлы:**
- Tailwind config

**Действия:**
1. Tailwind breakpoints по умолчанию (sm:640, md:768, lg:1024, xl:1280) — подходят.
2. Обернуть основной контент:
   - Patient: `max-w-[480px] mx-auto` (как сейчас).
   - Doctor: `max-w-7xl mx-auto` на desktop, `w-full` на mobile.
3. Doctor layout: подготовить sidebar placeholder на desktop (`hidden md:block`).

**Критерий:**
- Mobile: текущий вид.
- Desktop: контент центрирован.
- Breakpoints готовы.

---

## Подэтап 2.8: Каталог иконок

**Задача:** создать каталог public-медиа для дизайна.

**Файлы:**
- Новая папка: `apps/webapp/public/icons/`
- Новый: `apps/webapp/public/icons/README.md`

**Действия:**
1. Создать папку `public/icons/`.
2. Составить список необходимых иконок (SVG):
   - Мессенджеры: telegram.svg, max.svg, vk.svg
   - Навигация: home.svg, back.svg, menu.svg, close.svg
   - Действия: send.svg, edit.svg, delete.svg, add.svg, search.svg
   - Статусы: check.svg, bell.svg, message.svg, calendar.svg
   - Дневник: chart.svg, exercise.svg, diary.svg
   - Прочее: share.svg, install.svg, settings.svg, user.svg, users.svg
3. Создать `README.md` со списком иконок и именами файлов.
4. Для начала: использовать lucide-react (идёт вместе с shadcn/ui) для стандартных иконок. Кастомные (мессенджеры) — inline SVG или файлы от владельца.

**Критерий:**
- Каталог создан, список определён.
- lucide-react используется для стандартных иконок.
- README с именами файлов для кастомных иконок.

---

## Общий критерий завершения этапа 2

- [ ] Tailwind CSS 4 установлен и работает.
- [ ] shadcn/ui инициализирован, базовые компоненты добавлены.
- [ ] Button 4 варианта, цвета и скругления по плану.
- [ ] Шапка patient: компактная, заголовок, иконки — на Tailwind.
- [ ] Боковое меню patient: shadcn Sheet, все пункты, симметричные отступы.
- [ ] Шапка + меню doctor: фиксированная, shadcn Sheet, старая навигация убрана.
- [ ] InfoBlock, EmptyState, StatusBadge, PageHeader — на Tailwind.
- [ ] Toast-система (react-hot-toast).
- [ ] Breakpoints настроены.
- [ ] Каталог иконок создан.
- [ ] `pnpm run ci` проходит.
