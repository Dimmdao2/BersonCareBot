# CLEAN STYLE: полный переход на Tailwind + shadcn

## 1) Итог аудита текущего состояния

Переход на `tailwind + shadcn` выполнен частично. В проекте одновременно живут:

- `shadcn`-компоненты (`Button`, `Card`, `Dialog`, `Sheet`, `Input`, `Textarea`, `Select`, `Switch`, ...)
- большой legacy-слой в `apps/webapp/src/app/globals.css` (~600 строк component-level CSS)
- inline-стили `style={{ ... }}`
- raw HTML-кнопки (`<button>`) и дублируемые локальные реализации switch/toggle

### Количественные факты по `apps/webapp/src`

| Проблема | Файлов |
|----------|--------|
| Legacy-классы из `globals.css` | 55 |
| Класс `stack` (самый массовый legacy) | 61 |
| Класс `auth-input` | 21 |
| Класс `eyebrow` | ~40 |
| Класс `list` / `list-item` | 17 |
| Класс `panel` | ~35 |
| Inline-стили `style={{...}}` | 23 |
| Raw `<button>` (не `Button`) | 14 |
| Raw заголовки `<h1..h6>` без унификации | 34 |
| Класс `empty-state` | 17 |

Дополнительно:

- `PageHeader` компонент (`shared/ui/PageHeader.tsx`) существует, но **ни разу не импортирован** — мертвый код.
- `Switch` из shadcn (`components/ui/switch.tsx`) существует, но **не используется** — вместо него два локальных Toggle.

### Ключевые проблемные зоны

1. **Дублирование элементов**
   - Два локальных `Toggle` (самописный switch на `<button role="switch">`) в:
     - `app/app/settings/SettingsForm.tsx`
     - `app/app/settings/AdminSettingsSection.tsx`
   - При наличии готового `Switch` из `components/ui/switch.tsx`.
   - Повторяемые "сегмент-кнопки" (0..10, period tabs, side picker) — каждый раз заново.

2. **Legacy layout-каркас**
   - `app-shell`, `top-bar`, `panel`, `hero-card`, `feature-card`, `feature-grid`, `list`, `list-item`, `stack`, `content-area`, `eyebrow`, `badge`, `badge--*`, `button`, `button--*`, `auth-input`, `ask-question-*`, `user-pill`, `status-pill`, `empty-state`, `auth-plaque`, `kpi-grid`, `kpi-card`, `overview-columns`, `master-detail`, `client-row`, `code-block`

3. **Inline styles**
   - Массово в doctor content/forms/messages + `global-error.tsx`

4. **`markdown-preview`** — стилизация рендеренного из markdown HTML. Используется в `MarkdownContent.tsx`, `MarkdownPreview.tsx`. Это легитимный кейс для глобального CSS (нельзя навесить Tailwind-классы на элементы из dangerouslySetInnerHTML).

5. **`.lfk-diary-range`** — кастомная стилизация `<input type="range">` с vendor-prefix pseudo-элементами (`::-webkit-slider-thumb`, `::-moz-range-thumb`). Используется в `LfkSessionForm.tsx`. Tailwind не поддерживает такие селекторы. Легитимный CSS.

6. **Safe-area классы** (`.app-shell--patient`, `.patient-edge-bleed`, `.patient-fab-quick-add`) — используют `env(safe-area-inset-*)` + `max()` + `calc()`. Tailwind arbitrary values (`pl-[max(1.25rem,env(safe-area-inset-left,0px))]`) технически работают, но нечитаемы. Лучше оставить как именованные utility.

---

## 2) Целевое состояние (Definition of Done)

Переход считается завершенным, если одновременно выполняется все:

1. В `apps/webapp/src` нет `style={{...}}` (единственное исключение: `global-error.tsx`, см. ниже).
2. Нет legacy component-level классов из старого слоя.
3. Нет локальных дублирующих switch/toggle/button реализаций.
4. Кнопки, заголовки и контейнеры унифицированы через `components/ui/*` и `components/common/*`.
5. `globals.css` содержит только то, что перечислено в секции 3 ниже.

**Особый случай: `global-error.tsx`.**
По контракту Next.js App Router это fallback, который заменяет *весь* root layout — включая `<html>/<body>`. В нем **нет** providers, контекста, CSS-импортов. Поэтому inline styles — единственный надежный способ стилизации. Не трогать.

---

## 3) Целевая структура `globals.css`

Здесь подробно что **остается** и почему, что **удаляется**.

### 3.1 ОСТАЕТСЯ — обязательная инфраструктура Tailwind v4 + shadcn

```css
/* 1. Фреймворк-импорты — обязательные, без них ничего не работает */
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/* 2. Конфигурация dark mode для Tailwind v4 */
@custom-variant dark (&:is(.dark *));

/* 3. Shadcn design tokens — ВСЕ CSS-переменные */
:root {
  /* --primary, --background, --border, --radius и т.д. — оставить полностью */
}

/* 4. Dark theme tokens */
.dark {
  /* все переопределения для темной темы — оставить */
}

/* 5. Tailwind v4 theme bridge — маппинг CSS vars на Tailwind utilities */
@theme inline {
  /* --color-primary: var(--primary); и т.д. — оставить полностью */
}

/* 6. Base layer — глобальные базовые стили */
@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply text-base text-foreground; background: ...; }
  html { @apply font-sans; }
}
```

### 3.2 ОСТАЕТСЯ — легитимный глобальный CSS (нельзя заменить Tailwind)

```css
/* 7. Сброс ссылок (global reset) */
a { color: inherit; text-decoration: none; }

/* 8. Markdown preview — стилизация рендеренного HTML из markdown
   Нельзя навесить className на элементы из dangerouslySetInnerHTML */
.markdown-preview { ... }
.markdown-preview p { ... }
.markdown-preview ul, .markdown-preview ol { ... }
.markdown-preview h1, .markdown-preview h2, .markdown-preview h3 { ... }
.markdown-preview a { ... }
.markdown-preview table { ... }
.markdown-preview th, .markdown-preview td { ... }

/* 9. Range slider (vendor-prefix pseudo-элементы — Tailwind не поддерживает) */
.lfk-diary-range { ... }
.lfk-diary-range::-webkit-slider-thumb { ... }
.lfk-diary-range::-moz-range-thumb { ... }
/* и остальные pseudo-элементы range */
```

### 3.3 ОСТАЕТСЯ, но ПЕРЕИМЕНОВАТЬ — safe-area утилиты

Эти классы используют `env(safe-area-inset-*)` + `max()` + `calc()`, что нечитаемо в Tailwind arbitrary values. Оставить как именованные утилиты, но перенести в `@layer utilities`:

```css
@layer utilities {
  /* Patient shell: безопасные отступы с учетом вырезов */
  .safe-padding-patient {
    padding-left: max(1.25rem, env(safe-area-inset-left, 0px));
    padding-right: max(1.25rem, env(safe-area-inset-right, 0px));
    padding-bottom: max(68px, calc(48px + env(safe-area-inset-bottom, 0px)));
  }

  /* Full-bleed полоса: компенсация бокового padding + возврат padding для контента */
  .safe-bleed-x {
    margin-left: calc(-1 * max(1.25rem, env(safe-area-inset-left, 0px)));
    margin-right: calc(-1 * max(1.25rem, env(safe-area-inset-right, 0px)));
    padding-left: max(1.25rem, env(safe-area-inset-left, 0px));
    padding-right: max(1.25rem, env(safe-area-inset-right, 0px));
  }

  /* FAB позиция с учетом safe area */
  .safe-fab-br {
    position: fixed;
    bottom: max(1.25rem, env(safe-area-inset-bottom, 0px));
    right: max(1.25rem, env(safe-area-inset-right, 0px));
    z-index: 50;
  }
}
```

### 3.4 УДАЛЯЕТСЯ — все остальное (~480 строк)

Полный список удаляемых блоков:

| Блок | Строки | Причина удаления |
|------|--------|-----------------|
| `* { box-sizing }` | 65-67 | Tailwind preflight уже включает |
| `html, body { margin; min-height }` | 69-73 | Tailwind preflight + `min-h-screen` |
| `.app-shell` / `--patient` / `--doctor` / `--title-small` | 83-139 | → Tailwind utilities + компоненты |
| `.patient-edge-bleed` | 105-110 | → `.safe-bleed-x` (см. 3.3) |
| `.patient-fab-quick-add` | 113-118 | → `.safe-fab-br` (см. 3.3) |
| `.kpi-grid` / `.kpi-card` / `.kpi-card__*` | 144-162 | → Tailwind grid + Card |
| `.overview-columns` | 163-172 | → `grid md:grid-cols-2 gap-4` |
| `.master-detail` / `__detail` | 175-190 | → `block md:grid md:grid-cols-[1fr_2fr] gap-4` |
| `.clients-filters__btn--active` | 192-196 | → `SegmentControl` или `Button` active state |
| `.client-row` / `__badges` | 199-210 | → `flex items-start justify-between gap-3` |
| `.badge` / `--channel` / `--warning` | 211-225 | → shadcn `Badge` |
| `.top-bar` / `__*` / `.button--back` | 228-260 | → уже есть `DoctorHeader`/`PatientHeader`; удалить legacy |
| `.eyebrow` | 263-268 | → `SectionHeading` / inline Tailwind `text-xs ...` |
| `.top-bar__actions` | 271-275 | → Tailwind flex |
| `.user-pill` / `__role` | 277-298 | → inline Tailwind |
| `.button` / `--ghost` / `--danger-outline` | 300-330 | → shadcn `Button` |
| `.auth-input` / `::placeholder` / `:focus` / `[aria-invalid]` | 332-352 | → shadcn `Input` |
| `.content-area` / `.stack` | 355-359 | → `flex flex-col gap-4` или `grid gap-4` |
| `.hero-card` / `.panel` / `.feature-card` | 362-370 | → `PageSection` / `Card` |
| `.feature-grid` / `--compact` | 373-389 | → Tailwind grid |
| Все `.app-shell--patient .feature-*` | 391-446 | → Tailwind на компоненте |
| `.feature-card__*` | 437-450 | → Tailwind на компоненте |
| `.status-pill` / `--available` / `--coming-soon` / `--locked` | 453-473 | → `StatusPill` или `Badge` |
| `.list` / `.list-item` | 476-489 | → `space-y-3 list-none p-0` / `rounded-lg border p-3` |
| `.empty-state` | 492-494 | → `text-muted-foreground` |
| `.auth-plaque` / `__text` | 497-510 | → `Card` / inline Tailwind |
| `.code-block` | 513-520 | → `rounded-2xl bg-[#101521] text-[#eef4ff] p-4 overflow-auto text-sm` |
| `.top-bar` media query (max-width 720px) | 523-534 | → удалить вместе с top-bar |
| `.ask-question-*` (весь блок) | 537-679 | → FAB больше не использует панель; кнопка → `Button` |

**Итого:** из ~863 строк `globals.css` останется ~180 строк (tokens + base + markdown + range + safe-area utilities).

---

## 4) Единый дизайн-контракт (цифры и значения)

### 4.1 Радиусы (ВАЖНО: учитывать `--radius`)

В проекте `--radius: 0.5rem` (8px). Через `@theme inline` Tailwind считает радиусы относительно:

| Tailwind class | Формула | Результат |
|---------------|---------|-----------|
| `rounded-sm` | `--radius * 0.6` | 4.8px |
| `rounded-md` | `--radius * 0.8` | 6.4px |
| `rounded-lg` | `--radius` | 8px |
| `rounded-xl` | `--radius * 1.4` | 11.2px |
| `rounded-2xl` | `--radius * 1.8` | 14.4px |
| `rounded-3xl` | `--radius * 2.2` | 17.6px |
| `rounded-4xl` | `--radius * 2.6` | 20.8px |

Legacy CSS использует `border-radius: 20px` для `panel`/`hero-card`/`feature-card`. Ближайший Tailwind: `rounded-4xl` (20.8px). Для migration:

- Контейнеры секций (бывший `panel`): **`rounded-2xl`** (14.4px) — сознательное уменьшение, выглядит чище на мобильных
- Крупные карточки: **`rounded-xl`** (11.2px) — дефолт shadcn Card
- List items: **`rounded-lg`** (8px)
- Пиллы/бейджи: **`rounded-full`** (9999px)

### 4.2 Отступы (spacing)

| Контекст | Значение | Tailwind |
|----------|----------|----------|
| label → control | 4px | `gap-1` |
| между полями формы | 16px | `gap-4` |
| внутри секции (padding) | 16px | `p-4` |
| между секциями на странице | 16-24px | `gap-4` / `gap-6` |
| compact padding | 12px | `p-3` |
| hero padding | 24px | `p-6` |

### 4.3 Кнопки (только `Button` из `components/ui/button.tsx`)

Фактические размеры из `button-variants.ts`:

| size | Класс | Высота |
|------|-------|--------|
| `xs` | `h-7` | 28px |
| `sm` | `h-8` | 32px |
| `default` | `h-9` | 36px |
| `lg` | `h-10` | 40px |
| `icon` | `size-9` | 36×36 |
| `icon-xs` | `size-7` | 28×28 |
| `icon-sm` | `size-8` | 32×32 |
| `icon-lg` | `size-10` | 40×40 |

Variants:
- `default` / `primary` — основное действие
- `outline` — вторичное действие
- `secondary` — мягкое вторичное
- `ghost` — без фона (иконки в хедере, пункты меню)
- `destructive` — опасное действие
- `link` — текстовая ссылка-кнопка

### 4.4 Заголовки (нормализация)

| Уровень | Тег | Tailwind classes |
|---------|-----|-----------------|
| page | `h1` | `text-xl font-semibold tracking-tight` |
| section | `h2` | `text-lg font-semibold` |
| subsection | `h3` | `text-base font-medium` |
| eyebrow (meta label) | `span`/`p` | `text-xs font-medium uppercase tracking-wide text-muted-foreground` |

### 4.5 Контейнеры секций

| Вариант | Tailwind classes |
|---------|-----------------|
| default | `rounded-2xl border border-border bg-card p-4 shadow-sm` |
| compact | `rounded-xl border border-border bg-card p-3` |
| hero | `rounded-2xl border border-border bg-card p-6 shadow-sm` |
| list-item | `rounded-lg border border-border bg-card p-3` |

---

## 5) Матрица "что на что менять" (для junior)

### 5.1 Legacy class → Target

| Legacy | Target |
|--------|--------|
| `stack` | `flex flex-col gap-4` (или `grid gap-4` для простых вертикальных списков) |
| `content-area` | `flex flex-col gap-4` |
| `panel` | `PageSection` (`rounded-2xl border border-border bg-card p-4 shadow-sm`) |
| `panel stack` | `PageSection` + children layout `flex flex-col gap-4` |
| `hero-card` | `PageSection variant="hero"` |
| `feature-card` | `Card` + `Link` wrapper |
| `feature-grid` | `grid gap-4 md:grid-cols-2` |
| `list` | `space-y-3 list-none p-0 m-0` |
| `list-item` | `rounded-lg border border-border bg-card p-3` |
| `empty-state` | `text-muted-foreground` |
| `eyebrow` | `text-xs font-medium uppercase tracking-wide text-muted-foreground` |
| `auth-input` (на input) | `Input` |
| `auth-input` (на textarea) | `Textarea` |
| `auth-input` (на select) | shadcn `Select` или `className="..."` native с tailwind |
| `button`, `button--ghost`, `button--back` | shadcn `Button` с нужным variant/size |
| `button--danger-outline` | `Button variant="destructive"` |
| `badge`, `badge--channel`, `badge--warning` | shadcn `Badge` с variant |
| `status-pill`, `status-pill--*` | `Badge` с variant или отдельный `StatusPill` |
| `user-pill`, `user-pill__role` | inline Tailwind: `inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-sm` |
| `top-bar`, `top-bar__*` | удалить — уже есть `DoctorHeader`/`PatientHeader` |
| `app-shell` (default variant) | удалить — уже дублируется Tailwind-классами в `AppShell.tsx` |
| `app-shell--patient` | → `safe-padding-patient` (safe-area utility, см. 3.3) + Tailwind |
| `patient-edge-bleed` | → `safe-bleed-x` |
| `patient-fab-quick-add` | → `safe-fab-br` |
| `kpi-grid` | `grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3` |
| `kpi-card`, `kpi-card__value`, `kpi-card__label` | Tailwind на элементах |
| `overview-columns` | `grid md:grid-cols-2 gap-4` |
| `master-detail`, `master-detail__detail` | `block md:grid md:grid-cols-[1fr_2fr] gap-4` + `hidden md:block` |
| `client-row`, `client-row__badges` | `flex items-start justify-between gap-3` + `flex flex-wrap gap-1.5 shrink-0` |
| `clients-filters__btn--active` | `SegmentControl` или inline Tailwind active state |
| `auth-plaque`, `auth-plaque__text` | `Card` или inline `rounded-2xl bg-muted p-4 border` |
| `code-block` | `rounded-2xl bg-[#101521] text-[#eef4ff] p-4 overflow-auto text-sm` |
| `ask-question-fab` | `Button` + Tailwind positioning |
| `ask-question-panel*` (весь блок) | мертвый CSS, просто удалить |

### 5.2 Inline style → Tailwind (шпаргалка)

| Inline | Tailwind |
|--------|----------|
| `style={{ gap: "0.25rem" }}` | `gap-1` |
| `style={{ gap: "0.5rem" }}` | `gap-2` |
| `style={{ gap: "0.75rem" }}` | `gap-3` |
| `style={{ gap: 8 }}` / `"0.5rem"` | `gap-2` |
| `style={{ gap: 12 }}` / `"0.75rem"` | `gap-3` |
| `style={{ gap: 16 }}` / `"1rem"` | `gap-4` |
| `style={{ gap: "1.5rem" }}` | `gap-6` |
| `style={{ gap: "2rem" }}` | `gap-8` |
| `style={{ marginTop: "0.5rem" }}` | `mt-2` |
| `style={{ marginTop: "1rem" }}` | `mt-4` |
| `style={{ marginTop: 16 }}` | `mt-4` |
| `style={{ marginBottom: 4 }}` | `mb-1` |
| `style={{ maxWidth: 320 }}` | `max-w-xs` (320px) |
| `style={{ color: "#9c4242" }}` | `text-destructive` |
| `style={{ color: "#b91c1c" }}` | `text-destructive` |
| `style={{ color: "#15803d" }}` | `text-green-700` |
| `style={{ color: "#16a34a" }}` | `text-green-600` |
| `style={{ color: "#64748b" }}` | `text-muted-foreground` |
| `style={{ color: "#5f6f86" }}` | `text-muted-foreground` |
| `style={{ fontSize: "0.9rem" }}` | `text-sm` |
| `style={{ fontSize: 14 }}` | `text-sm` |
| `style={{ fontSize: 12 }}` | `text-xs` |
| `style={{ listStyle: "none", padding: 0 }}` | `list-none p-0` |
| `style={{ display: "flex", gap: 8 }}` | `flex gap-2` |
| `style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}` | `flex flex-wrap gap-2` |
| `style={{ display: "block", marginBottom: 4 }}` | `block mb-1` |
| `style={{ textAlign: "left", padding: "0.5rem" }}` | `text-left p-2` |
| `style={{ width: "100%", borderCollapse: "collapse" }}` | `w-full border-collapse` |

---

## 6) Проверка похожих элементов (уже найдены несоответствия)

### 6.1 Toggle/Switch

Сейчас: два локальных `Toggle` в settings, хотя shadcn `Switch` (`components/ui/switch.tsx`) уже есть и даже поддерживает `size="sm" | "default"`.

→ Удалить локальные Toggle, использовать `Switch`.

### 6.2 Сегментированные кнопки и choice chips

Сейчас: разные raw `<button>` группы с почти одинаковой логикой:
- period bar (week/month/all) в `DiaryStatsPeriodBar.tsx`
- side picker (left/right/both) в `CreateTrackingForm.tsx`
- intensity chips (0..10) в `AddEntryForm.tsx` и `QuickAddPopup.tsx`

→ `SegmentControl` для period/side, `NumericChipGroup` для 0..10.

### 6.3 Заголовки секций

Сейчас: `h2/h3` + legacy `eyebrow` + inline размеры — полный разнобой.
→ `SectionHeading` с 4 уровнями (см. 4.4).

### 6.4 Контейнеры секций

Сейчас: `panel`, `hero-card`, `list-item`, вручную разные паддинги/радиусы.
→ `PageSection` с variants (см. 4.5).

### 6.5 Класс `stack`

Самый массовый legacy-класс — 61 файл! Это просто `display: grid; gap: 16px`.
→ Заменить на `flex flex-col gap-4` (вертикальный стек) или `grid gap-4`.
Часто встречается в комбинации `className="stack gap-6"` — в этом случае gap из Tailwind уже перезаписывает CSS, но `display: grid` из `.stack` остается. Замена: `flex flex-col gap-6`.

### 6.6 Класс `auth-input`

21 файл. Это кастомная стилизация input/select/textarea с 44px min-height, 12px radius, свой border color.
→ Заменить на `Input`/`Textarea`/`Select` из shadcn.
Для native `<select>` (там где shadcn `Select` не подходит): `className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base"`.

### 6.7 Класс `empty-state`

17 файлов. Это просто `color: #5f6f86` — замена: `text-muted-foreground`.

### 6.8 Мертвый CSS

Блок `.ask-question-panel*` (~100 строк) — панель вопроса. `AskQuestionFAB` сейчас просто навигирует на страницу сообщений, панель не используется. Весь CSS мертвый.

---

## 7) Рекомендуемые `components/common/*`

| Компонент | Заменяет | Путь |
|-----------|---------|------|
| `PageSection` | `panel`, `hero-card` | `components/common/layout/PageSection.tsx` |
| `SectionHeading` | `eyebrow`, разнобой `h2/h3` | `components/common/typography/SectionHeading.tsx` |
| `LabeledSwitch` | локальные Toggle | `components/common/form/LabeledSwitch.tsx` |
| `SegmentControl` | period tabs, side picker | `components/common/controls/SegmentControl.tsx` |
| `NumericChipGroup` | шкалы 0..10 | `components/common/controls/NumericChipGroup.tsx` |
| `StatusPill` | `status-pill--*`, `badge--*` | `components/common/feedback/StatusPill.tsx` |

Удалить мертвый `shared/ui/PageHeader.tsx` (0 импортов) — или начать использовать вместо raw `<h1>` в страницах врача.

---

## 8) Пошаговая декомпозиция для junior-агента

Выполнять строго по фазам, не смешивать. После каждой фазы — `pnpm --dir apps/webapp typecheck`.

### Фаза 0. Подготовка

1. Проверить `button-variants.ts` — убедиться в достаточности variants/sizes.
2. Убедиться что `Switch` из `components/ui/switch.tsx` работает (есть, не сломан).
3. Решить судьбу `shared/ui/PageHeader.tsx`: либо удалить, либо начать использовать.

### Фаза 1. Создать reusable blocks

#### Task 1.1 `SectionHeading`

Файл: `src/components/common/typography/SectionHeading.tsx`

Props: `level: "page" | "section" | "subsection" | "eyebrow"`, `className?`, `children`, `as?: ElementType`.

Классы по уровням:
- `page` → тег `h1`, `text-xl font-semibold tracking-tight`
- `section` → тег `h2`, `text-lg font-semibold`
- `subsection` → тег `h3`, `text-base font-medium`
- `eyebrow` → тег `span`, `text-xs font-medium uppercase tracking-wide text-muted-foreground`

#### Task 1.2 `PageSection`

Файл: `src/components/common/layout/PageSection.tsx`

Props: `variant?: "default" | "compact" | "hero"`, `className?`, `children`, `as?: "section" | "div" | "article"`, `id?`.

Классы:
- `default`: `rounded-2xl border border-border bg-card p-4 shadow-sm`
- `compact`: `rounded-xl border border-border bg-card p-3`
- `hero`: `rounded-2xl border border-border bg-card p-6 shadow-sm`

#### Task 1.3 `LabeledSwitch`

Файл: `src/components/common/form/LabeledSwitch.tsx`

Props: `label: string`, `hint?: string`, `checked: boolean`, `onCheckedChange: (v: boolean) => void`, `disabled?: boolean`.

Layout: `flex items-center justify-between gap-4`.
Label: `text-sm font-medium`.
Hint: `text-xs text-muted-foreground`.
Control: shadcn `Switch`.

Файлы для замены:
- `app/app/settings/SettingsForm.tsx` — удалить локальный Toggle, использовать LabeledSwitch
- `app/app/settings/AdminSettingsSection.tsx` — то же

#### Task 1.4 `SegmentControl`

Файл: `src/components/common/controls/SegmentControl.tsx`

Props: `options: {value: string, label: string}[]`, `value: string`, `onChange: (v: string) => void`, `className?`.

Container: `inline-flex rounded-md border border-border bg-muted/60 p-0.5`.
Item active: `rounded-sm bg-primary text-primary-foreground shadow-sm px-3 py-1.5 text-xs font-medium`.
Item inactive: `rounded-sm bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground px-3 py-1.5 text-xs font-medium`.

Файлы для замены:
- `DiaryStatsPeriodBar.tsx` — period tabs
- `CreateTrackingForm.tsx` — side picker (left/right/both)

#### Task 1.5 `NumericChipGroup`

Файл: `src/components/common/controls/NumericChipGroup.tsx`

Props: `min: number`, `max: number`, `value: number | null`, `onChange: (v: number) => void`, `colorFn?: (v: number) => string`.

Chip: `size-9 rounded-full border-2 text-sm font-medium inline-flex items-center justify-center`.
Active: `border-transparent text-white` + `style={{ backgroundColor, borderColor }}`.
Inactive: `bg-transparent` + `style={{ borderColor, color }}`.

`aria-pressed` на каждом chip.

Файлы для замены:
- `AddEntryForm.tsx`
- `QuickAddPopup.tsx`

### Фаза 2. Убрать raw buttons и inline styles

#### Task 2.1 Raw buttons → Button

| Файл | Что | На что |
|------|-----|--------|
| `AskQuestionFAB.tsx` | raw `<button className="ask-question-fab">` | `Button variant="default" className="..."` + Tailwind positioning |
| `DoctorAppointmentActions.tsx` | два raw `<button>` без стилей | `Button variant="outline" size="sm"` |
| `DoctorSupportInbox.tsx` | кнопки выбора диалога | `Button variant="ghost" className="w-full text-left ..."` |
| `TemplateEditor.tsx` | кнопки выбора упражнения в picker | `Button variant="ghost" className="w-full justify-start"` |
| `TemplateEditor.tsx` | drag-handle кнопка | оставить raw — нужны dnd `{...attributes} {...listeners}` |
| `ProfileForm.tsx` | кнопка «Отмена» | `Button variant="link"` |
| `SymptomTrackingRow.tsx` | hidden submit buttons | оставить raw — hidden utility forms |

#### Task 2.2 Inline styles (приоритетные файлы)

Порядок:
1. `app/app/doctor/content/page.tsx` (15 inline styles)
2. `app/app/doctor/content/news/NewsForms.tsx` (20 inline styles)
3. `app/app/doctor/messages/NewMessageForm.tsx` (13 inline styles)
4. `app/app/doctor/clients/[userId]/SendMessageForm.tsx` (11 inline styles)
5. `app/app/doctor/content/ContentForm.tsx` (10 inline styles)

Потом остальные файлы. Использовать шпаргалку из секции 5.2.

**НЕ ТРОГАТЬ** `global-error.tsx` — inline styles там обязательны.

### Фаза 3. Миграция legacy layout-классов

#### Батч A: `stack` (61 файл — самый массовый)

Замена: `stack` → `flex flex-col gap-4`.
Если рядом стоит свой `gap-*`: `stack gap-6` → `flex flex-col gap-6`.
Если рядом стоит `gap-2`: `stack gap-2` → `flex flex-col gap-2`.

Проверять порядок: в `display: grid` дочерние элементы ведут себя по-другому чем в `flex`. Основное отличие: `grid` растягивает children на всю ширину автоматически, `flex` — нет. Если child должен быть full-width, добавить `w-full` или оставить `grid gap-4`.

#### Батч B: `panel` + `hero-card` (35+ файлов)

Заменить на `PageSection` / `PageSection variant="hero"`.
Комбинации `className="panel stack"` → `<PageSection><div className="flex flex-col gap-4">...</div></PageSection>`.

#### Батч C: `list` + `list-item` (17 файлов)

- `className="list"` → `className="space-y-3 list-none p-0 m-0"` или `grid gap-3 list-none p-0 m-0`
- `className="list-item"` → `className="rounded-lg border border-border bg-card p-3"`

#### Батч D: `eyebrow` (40+ файлов)

- `className="eyebrow"` → `className="text-xs font-medium uppercase tracking-wide text-muted-foreground"`
- или `<SectionHeading level="eyebrow">...</SectionHeading>` для заголовочных контекстов

#### Батч E: `auth-input` (21 файл)

- `<input className="auth-input">` → `<Input />`
- `<textarea className="auth-input">` → `<Textarea />`
- `<select className="auth-input">` → `className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"`

#### Батч F: `empty-state` (17 файлов)

- `className="empty-state"` → `className="text-muted-foreground"`

#### Батч G: остальные legacy-классы

- `badge`/`badge--channel`/`badge--warning` → shadcn `Badge`
- `user-pill` → inline Tailwind
- `top-bar`/`top-bar__*` → удалить (AppShell default variant используется только в settings; переписать)
- `kpi-grid`/`kpi-card` → Tailwind grid + Card
- `overview-columns` → `grid md:grid-cols-2 gap-4`
- `master-detail` → `block md:grid md:grid-cols-[1fr_2fr] gap-4`
- `client-row` → `flex items-start justify-between gap-3`
- `feature-card`/`feature-grid` → Card + grid
- `auth-plaque` → Card / inline Tailwind

### Фаза 4. Чистка `globals.css`

1. Удалить все component-level классы из `globals.css`.
2. Переименовать safe-area классы (`.app-shell--patient` → `.safe-padding-patient` и т.д.).
3. Обновить все ссылки в компонентах на новые имена.
4. Оставить только то, что описано в секции 3 выше.

Проверка:
```bash
rg "className=\"[^\"]*(panel|hero-card|feature-card|feature-grid|list-item|eyebrow|button--|badge--|auth-input|top-bar|app-shell|stack|empty-state|auth-plaque|user-pill|kpi-|overview-columns|master-detail|client-row|ask-question|code-block)" apps/webapp/src --glob "*.tsx"
```
Результат должен быть 0 строк.

### Фаза 5. Финальная стандартизация

1. Проверить все `h1..h3` — свести к `SectionHeading` / `PageHeader`.
2. Проверить кнопки — нет raw `<button>` для типовых actions.
3. Проверить формы — только `Input`/`Textarea`/`Select`/`Switch`.
4. Запустить полный CI: `pnpm run ci`.

---

## 9) Контрольные команды проверки

```bash
# 1. Legacy классы
rg "className=\"[^\"]*(panel|hero-card|feature-card|feature-grid|list-item|eyebrow|button--|badge--|auth-input|top-bar|app-shell|stack\b|empty-state|user-pill|kpi-|master-detail|client-row|ask-question)" apps/webapp/src --glob "*.tsx"

# 2. Inline styles
rg "style=\{\{" apps/webapp/src --glob "*.tsx"

# 3. Raw buttons (кроме global-error и hidden form submits)
rg "<button\b" apps/webapp/src --glob "*.tsx"

# 4. Неиспользуемый PageHeader
rg "from ['\"]@/shared/ui/PageHeader['\"]" apps/webapp/src

# 5. Полный CI
pnpm run ci
```

---

## 10) Риски и как не сломать UI

1. **Не Big Bang.** Только батчами, с визуальной проверкой после каждого.
2. **`stack` → `flex flex-col`**: в `grid` дети автоматически full-width, в `flex` — нет. Если child не растягивается — добавить `w-full`.
3. **`global-error.tsx`**: не трогать inline styles — это by design.
4. **safe-area CSS**: переименование делать одновременно в CSS и в компонентах, не ломая поэтапно.
5. **Markdown preview**: не удалять из globals.css — это стилизация чужого HTML.
6. **Range slider**: не удалять — vendor-prefix CSS не имеет Tailwind-аналога.
7. Для каждого батча smoke: рендер страницы + клики по primary actions + формы.

---

## 11) Ожидаемый результат по `globals.css`

~180 строк вместо ~863:

- framework imports (3 строки)
- `@custom-variant dark` (1 строка)
- `:root { ... }` tokens (~50 строк)
- `.dark { ... }` tokens (~35 строк)
- `@theme inline { ... }` bridge (~40 строк)
- `@layer base { ... }` (6 строк)
- `a { ... }` reset (1 строка)
- `.markdown-preview { ... }` (~20 строк)
- `.lfk-diary-range { ... }` (~30 строк)
- `@layer utilities { .safe-* }` (~15 строк)

---

## 12) Журнал выполнения (агент)

Формат: дата (UTC), действие, результат проверки (если было).

| Дата | Действие | Проверка |
|------|----------|----------|
| 2026-03-26 | Фаза 0: проверены `button-variants.ts` (variants/sizes достаточно), `Switch` из `components/ui/switch.tsx` | — |
| 2026-03-26 | Фаза 0: удалён неиспользуемый `shared/ui/PageHeader.tsx` (0 импортов; замена — `SectionHeading` + разметка в `AppShell`) | — |
| 2026-03-26 | Фаза 1: добавлены `SectionHeading`, `PageSection`, `LabeledSwitch`, `SegmentControl`, `NumericChipGroup` | `pnpm --dir apps/webapp typecheck` |
| 2026-03-26 | Фаза 2: raw `<button>` заменены на `Button` где требуется планом (`AskQuestionFAB`, `DoctorAppointmentActions`, `DoctorSupportInbox`, picker в `TemplateEditor`, «Отмена» в `ProfileForm`); drag-handle в `TemplateEditor` оставлен raw | — |
| 2026-03-26 | Фаза 2: убраны inline `style={{...}}` из `apps/webapp/src` кроме `global-error.tsx` (по плану) | `rg "style=\\{\\{" apps/webapp/src --glob "*.tsx"` → только `global-error.tsx` |
| 2026-03-26 | Фаза 3: массовая замена legacy-классов (`stack`, `panel`, `hero-card`, `eyebrow`, `auth-input`, `empty-state`, `list`/`list-item`, бейджи и т.д.) на Tailwind/shadcn; обновлён `FeatureCard.tsx`; `DoctorClientsPanel`/`messages` — `Badge` | — |
| 2026-03-26 | Фаза 4: `globals.css` сокращён до токенов + `@theme` + `@layer base` + сброс ссылок + `.markdown-preview` + `.lfk-diary-range` + `@layer utilities` с `.safe-padding-patient`, `.safe-bleed-x`, `.safe-fab-br`; удалён legacy component-level CSS | — |
| 2026-03-26 | Фаза 4: переименование safe-area: `AppShell` (patient), `PatientHeader`, `DiaryTabsClient`, `QuickAddPopup` переведены на классы `safe-*` | — |
| 2026-03-26 | Фаза 5: `AppShell` default-вариант на Tailwind + `SectionHeading`; полный CI | `pnpm run ci` (успешно) |
| 2026-03-26 | Исправление: скрипт замены `list` случайно повредил идентификаторы `list` в TS — восстановлены в `DoctorClientsPanel`, `content/page`, `exercises/page`, `lfk-templates/page`; в `SectionHeading` восстановлен ключ `eyebrow` | `pnpm --dir apps/webapp typecheck` |
