# Этап 0: Установка Tailwind CSS 4 + shadcn/ui

> Приоритет: P0 (выполняется ПЕРЕД всеми остальными этапами)
> Зависимости: нет
> Риск: низкий
> Цель: все последующие этапы работают с Tailwind + shadcn/ui

---

## Контекст для агента

- Репозиторий: monorepo pnpm, webapp в `apps/webapp/`.
- Текущий CSS: один файл `apps/webapp/src/app/globals.css` (~896 строк), inline styles в ~29 файлах.
- Текущий UI: кастомные CSS-классы (`.button`, `.panel`, `.top-bar`, `.list-item` и т.д.).
- **Не удалять** существующий `globals.css` — он нужен для пока не переписанных компонентов. Tailwind и старый CSS сосуществуют.
- Перед пушем: `pnpm run ci`.

---

## Подэтап 0.1: Установка Tailwind CSS 4

**Задача:** настроить Tailwind CSS в webapp.

**Действия:**
1. `pnpm --filter webapp add -D tailwindcss @tailwindcss/postcss postcss`.
2. Создать `apps/webapp/postcss.config.mjs`:
   ```js
   export default {
     plugins: {
       '@tailwindcss/postcss': {},
     },
   };
   ```
3. Добавить в начало `globals.css`:
   ```css
   @import "tailwindcss";
   ```
4. Проверить, что Tailwind работает: добавить `className="text-red-500"` в любой компонент → красный текст.
5. Убрать тестовый класс.

**Критерий:**
- `pnpm run ci` проходит.
- Tailwind классы работают в компонентах.
- Существующий CSS не сломан.

---

## Подэтап 0.2: Установка shadcn/ui

**Задача:** инициализировать shadcn/ui.

**Действия:**
1. `pnpm --filter webapp add tailwind-merge clsx`.
2. Создать `apps/webapp/src/lib/utils.ts`:
   ```ts
   import { type ClassValue, clsx } from 'clsx';
   import { twMerge } from 'tailwind-merge';

   export function cn(...inputs: ClassValue[]) {
     return twMerge(clsx(inputs));
   }
   ```
3. Инициализировать shadcn: `cd apps/webapp && npx shadcn@latest init`.
   - Style: Default.
   - Base color: Slate (настроим позже).
   - CSS variables: Yes.
   - `components` path: `src/components/ui`.
   - `utils` path: `src/lib/utils`.
4. Проверить, что `components.json` создан.

**Критерий:**
- shadcn инициализирован.
- `cn()` доступен.
- `pnpm run ci` проходит.

---

## Подэтап 0.3: Настройка темы проекта

**Задача:** настроить CSS-переменные shadcn под дизайн BersonCare.

**Действия:**
1. В `globals.css` (в секции shadcn CSS variables) настроить цвета:
   ```css
   :root {
     --primary: 215 35% 40%;           /* тёплый приглушённый синий */
     --primary-foreground: 0 0% 100%;
     --destructive: 0 55% 45%;         /* приглушённый красный */
     --destructive-foreground: 0 0% 100%;
     --muted: 220 14% 96%;
     --muted-foreground: 220 9% 46%;
     --accent: 220 14% 96%;
     --accent-foreground: 220 40% 20%;
     --radius: 0.5rem;                 /* 8px — уменьшено от текущих 12-16px */
   }
   ```
2. Настроить patient-specific переменные (если нужны) рядом.
3. Удалить дублирующиеся `--patient-radius` и подобные после того, как компоненты перейдут на shadcn.

**Критерий:**
- Цвета соответствуют плану (синяя primary, красная destructive, скругления 8px).
- `pnpm run ci` проходит.

---

## Подэтап 0.4: Добавление базовых shadcn-компонентов

**Задача:** установить набор компонентов для использования в последующих этапах.

**Действия:**
1. Добавить компоненты:
   ```bash
   cd apps/webapp
   npx shadcn@latest add button card input textarea badge separator
   npx shadcn@latest add dialog sheet tabs dropdown-menu popover tooltip
   npx shadcn@latest add select scroll-area
   ```
2. Проверить, что все компоненты в `src/components/ui/`.
3. Настроить Button варианты (если нужны дополнительные):
   - `default` — обычная.
   - `secondary` — инверсия.
   - `destructive` — красная.
   - Добавить кастомный `primary` если shadcn default не совпадает с `--primary`.

**Критерий:**
- Все компоненты установлены и импортируются без ошибок.
- `pnpm run ci` проходит.

---

## Подэтап 0.5: Установка @next/bundle-analyzer

**Задача:** настроить анализ размера бандла.

**Действия:**
1. `pnpm --filter webapp add -D @next/bundle-analyzer`.
2. Обновить `next.config.ts`:
   ```ts
   import withBundleAnalyzer from '@next/bundle-analyzer';

   const config = withBundleAnalyzer({
     enabled: process.env.ANALYZE === 'true',
   })({ /* existing config */ });
   ```
3. Добавить скрипт в `package.json`: `"analyze": "ANALYZE=true next build"`.

**Критерий:**
- `pnpm --filter webapp run analyze` генерирует отчёт.
- `pnpm run ci` проходит.

---

## Общий критерий завершения этапа 0

- [ ] Tailwind CSS 4 установлен и работает (утилити-классы рендерятся).
- [ ] shadcn/ui инициализирован, `cn()` доступен.
- [ ] Тема настроена (цвета, радиусы).
- [ ] Базовые shadcn-компоненты установлены (button, card, dialog, tabs, select, input и др.).
- [ ] `@next/bundle-analyzer` настроен.
- [ ] Существующий CSS не сломан (globals.css работает как раньше).
- [ ] `pnpm run ci` проходит.
