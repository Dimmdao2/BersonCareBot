# DOCTOR_APP_UI_STYLE_GUIDE

Единый стандарт для визуальной разработки кабинета врача/администратора (`/app/doctor/**`).

**Каркас страницы:** `apps/webapp/src/shared/ui/doctorWorkspaceLayout.ts`  
**Shared UI-примитивы каталога:** `apps/webapp/src/shared/ui/doctor/`  
**Хром клиентской карточки:** `apps/webapp/src/app/app/doctor/clients/doctorClientCardChrome.ts`  
**Companion-файл констант:** `apps/webapp/src/shared/ui/doctorVisual.ts`

---

## 0. Принципы

1. **Reuse-first.** Перед добавлением нового UI проверить `shared/ui/doctor/`, `doctorClientCardChrome.ts`, `components/ui/*` и этот гайд.
2. **Нет локальных одноразовых карточек.** Если рисуешь секцию/список/тулбар с нуля — остановись и переиспользуй готовый класс или компонент.
3. **Эталон для каталожных страниц** — упражнения (`exercises/ExercisesPageClient.tsx`). Рекомендации, LFK-шаблоны, шаблоны программ — точные копии этого паттерна.
4. **Единая плотность** внутри одного экрана: не смешивать `DoctorStatCard` (крупное число) с компактными строками списка без промежуточного уровня.
5. **h2 всегда со стилем.** Голый `<h2>` без класса запрещён — браузерный default ломает иерархию.
6. **Двухуровневая модель карточек.** Секции на странице и панели внутри карточки выглядят по-разному — см. §4.

---

## 1. Page Shell

`AppShell` с `variant="doctor"` оборачивает контент в `DOCTOR_PAGE_CONTAINER_CLASS`:

```ts
// doctorWorkspaceLayout.ts
DOCTOR_PAGE_CONTAINER_CLASS = "mx-auto w-full max-w-7xl px-3 pt-3 pb-6"
```

Прямое использование `DOCTOR_PAGE_CONTAINER_CLASS` — только если не используется `AppShell`.

Фиксированная шапка: `DoctorHeader` (высота `h-14`, компенсация `DOCTOR_WORKSPACE_TOP_PADDING_CLASS`). Все страницы `/app/doctor/**` автоматически получают её через `layout.tsx`.

---

## 2. Типографика

Иерархия текста в кабинете врача:

| Роль | Тег | Класс |
|---|---|---|
| Заголовок страницы (h1 в шапке редактора/toolbar) | `h1` | `text-base font-semibold tracking-tight text-foreground` |
| Заголовок секции / панели | `h2` или `h3` | `text-sm font-semibold text-foreground` |
| Первичная строка сущности | `p` | `text-sm font-medium text-foreground` |
| Обычный текст | `p` | `text-sm text-foreground` |
| Вспомогательный текст | `p` | `text-xs text-muted-foreground` |
| Micro-label / бейдж-подпись | `span` | `text-[10px] text-muted-foreground` |
| Числовая метрика (крупная) | `p` | `text-3xl font-semibold tabular-nums` |
| Числовая метрика (строчная) | `span` | `font-semibold tabular-nums text-foreground` |
| Inline-link | `Link/a` | `text-primary underline underline-offset-2` |
| Hover-link (secondary) | `Link/a` | `text-primary underline-offset-4 hover:underline font-medium` |
| Строка с адресом / телефон | `a` | `font-medium text-primary underline underline-offset-2` |

**Запрещено:** голый `<h2>`, `<h3>` без className.

---

## 3. Инвентарь экранов

Карта всех типов экранов в кабинете и применяемые к ним паттерны:

| Экран | Паттерн UI |
|---|---|
| `/app/doctor` — «Сегодня» | Дашборд с секциями (§4.1) + KPI-сетка (§6) |
| `/app/doctor/clients` | Компактный список с фильтрами (§5.3) |
| `/app/doctor/clients/[id]` | Карточка сущности (§9) |
| `/app/doctor/appointments` | Секции с inline-списком (§4.1, §5.1) |
| `/app/doctor/analytics/clients` | Секции + chart-карточки + KPI-сетка (§6, §7) |
| `/app/doctor/exercises` | Каталог split-layout (§8) |
| `/app/doctor/recommendations` | Каталог split-layout (§8) |
| `/app/doctor/lfk-templates` | Каталог split-layout (§8) |
| `/app/doctor/treatment-program-templates` | Каталог split-layout (§8) |
| `/app/doctor/online-intake` | Список с inline-детальным просмотром (§5.1) |
| `/app/doctor/content` | CMS-страница с sidebar (§10) |
| `/app/doctor/content/library` | Медиагрид (§11) |
| `/app/doctor/clients/[id]/treatment-programs/[id]` | Конструктор с toolbar-шапкой (§12) |
| `/app/doctor/broadcasts` | Форма с подтверждением (§4.1 + Dialog) |

---

## 4. Двухуровневая модель карточек

Ключевое правило: карточка выглядит иначе в зависимости от **контекста вложенности**.

### Уровень 1 — Секция на странице (page-level section)

Используется для блоков прямо на странице: «Сегодня», «Записи», «Аналитика», «Сигналы».

```
rounded-xl border border-border bg-card p-3 flex flex-col gap-3
```

- `p-3` (12px внутренний отступ)
- Нет `shadow-sm`
- Нет `gap-4` — только `gap-3`

### Уровень 2 — Панель внутри карточки (card-internal panel)

Используется для панелей внутри карточки клиента (overview grid, таб-контент).

**Первичная панель** (светлая, с тенью):
```
rounded-xl border border-border bg-card p-4 shadow-sm
```
Константа: `doctorClientOverviewPrimaryCardClass` в `doctorClientCardChrome.ts`

**Вторичная / вспомогательная панель** (слегка приглушённая, без тени):
```
rounded-lg border border-border/80 bg-muted/15 p-4
```
Константа: `doctorClientOverviewSecondaryCardClass` в `doctorClientCardChrome.ts`

**Инлайн-стек карточка** (ещё компактнее, внутри таба):
```
rounded-lg border border-border bg-card p-3 shadow-sm
```
Константа: `doctorClientStackedCardClass` в `doctorClientCardChrome.ts`

### Дерево решений «какой класс выбрать»

```
Я рисую…
├── Блок прямо на странице → rounded-xl border border-border bg-card p-3
├── Панель в overview-сетке клиента
│   ├── Основная (программа, задачи) → doctorClientOverviewPrimaryCardClass
│   └── Вспомогательная (хронология, сигналы) → doctorClientOverviewSecondaryCardClass
├── Строку внутри панели (задача, запись, событие) → §5
├── Карточку в медиасетке → rounded-xl border border-border bg-card p-3 shadow-sm
└── Вложенный элемент внутри списка→ §5
```

**Антипаттерны (не вводить в новом коде; при ревью — исправлять):**
- `rounded-2xl` в page-level секциях → `doctorSectionCardClass` / `rounded-xl`
- `rounded-lg border border-border bg-card p-4 shadow-sm` на page-section без stat-карточек → `doctorSectionCardClass`, без лишнего `shadow-sm`
- `p-4` в page-level секциях без stat-карточек → `p-3`

---

## 5. Строки списка и элементы

### 5a. Вложенная строка-карточка (item внутри page-section)

Для записей, заявок, инсайтов — строка с рамкой внутри секции уровня 1:

```tsx
<li className="rounded-lg border border-border/70 bg-background/40 p-3 text-sm">
  <p className="font-medium text-foreground">{primaryLine}</p>
  <p className="text-xs text-muted-foreground mt-0.5">{secondaryLine}</p>
  <p className="mt-2">
    <Link href={href} className="text-primary underline underline-offset-2">{cta}</Link>
  </p>
</li>
```

### 5b. Строка с семантическим тоном (задача, событие)

Для задач, важных уведомлений — тон определяет border + background:

```tsx
<li className={cn(
  "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
  isUrgent
    ? "border-destructive/40 bg-destructive/5"
    : "border-border bg-muted/15",
)}>
  …
</li>
```

### 5c. Инсет-строка внутри card-internal панели

Строки внутри панели уровня 2 — слегка вдавленный вид:

```tsx
<li className="flex items-center gap-3 rounded-lg border border-border bg-muted/15 p-2.5 transition-colors hover:bg-muted/40">
  …
</li>
```
Константа: `doctorClientInsetListRowClass` в `doctorClientCardChrome.ts`

### 5d. Хроника / мини-событие (компактная строка)

Для хронологии изменений программы, компактных событий:

```tsx
<li className="rounded-md border border-border/60 bg-muted/10 px-2 py-1.5">
  <span className="text-xs text-muted-foreground">{dateLabel}</span>
  <span className="ml-2 text-sm">{summary}</span>
</li>
```

### 5e. Кликабельная строка каталога (master-list, list-режим)

В каталожном split-layout:

```tsx
<button className={cn(
  "flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted",
  isActive && "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25",
)}>…</button>
```

### 5f. Внешняя карточка-ссылка (список клиентов)

`<li>` — сам является карточкой-навигацией (standalone, не вложен в секцию уровня 1):

```tsx
<li className="rounded-lg border border-border bg-card p-0">
  <Link className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2
    text-left no-underline hover:bg-muted/50
    focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring">
    …
  </Link>
</li>
```

---

## 6. KPI и числовые метрики

### 6a. DoctorStatCard — крупное число (4-колоночная KPI-сетка)

```tsx
<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
  <DoctorStatCard id="…" title="Записи сегодня" value={n} />
  <DoctorStatCard id="…" title="Отмены за 30 дн." value={n} tone="warning" />
</section>
```

Импорт: `apps/webapp/src/app/app/doctor/analytics/clients/DoctorStatCard.tsx`  
Внутри: `p-4`, `text-3xl font-semibold tabular-nums`, `rounded-xl border bg-card`.  
Tone `warning`: `border-destructive/40 bg-destructive/5`.

**Правило:** KPI-сетку не смешивают в одном gap-потоке с секциями уровня 1 без явного разделителя.

### 6b. Summary Row — компактная строка-метрика

Для показателей внутри секций, где `DoctorStatCard` слишком крупный:

```tsx
<ul className="m-0 list-none space-y-1.5 p-0 text-sm">
  <li className="flex items-center justify-between gap-2">
    <span className="text-muted-foreground">Записей (сегодня)</span>
    <span className="font-semibold tabular-nums">{n}</span>
  </li>
  <li className="flex items-center justify-between gap-2">
    <span className="text-muted-foreground">Отмен за 30 дн.</span>
    <span className="font-semibold tabular-nums text-destructive">{n}</span>
  </li>
</ul>
```

---

## 7. Графики (recharts)

Обёртка — shadcn `Card` + `CardHeader` + `CardContent`:

```tsx
<Card className="md:col-span-2">
  <CardHeader className="py-2">
    <CardTitle className="text-sm">{title}</CardTitle>
  </CardHeader>
  <CardContent>
    <div style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="key" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
          <Tooltip contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            fontSize: 11,
          }} />
          <Bar dataKey="value" fill="hsl(215 55% 48% / 0.9)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </CardContent>
</Card>
```

| Параметр | Значение |
|---|---|
| Grid stroke | `hsl(var(--border))` |
| Axis font | `fontSize: 10` |
| YAxis width | `28` |
| XAxis interval | `"preserveStartEnd"` |
| Bar radius | `[3, 3, 0, 0]` |
| Bar fill | `hsl(215 55% 48% / 0.9)` |
| Chart height (compact) | `160` |
| Chart height (full) | `240` |
| Tooltip background | `hsl(var(--card))` |
| Tooltip border | `1px solid hsl(var(--border))` |
| Tooltip fontSize | `11` |

---

## 8. Каталожные страницы (split-layout)

Применяется к: упражнениям, рекомендациям, LFK-шаблонам, шаблонам программ лечения.  
Эталон: `exercises/ExercisesPageClient.tsx`.

### 8a. Компонентный стек

| Компонент | Расположение | Роль |
|---|---|---|
| `DoctorCatalogPageLayout` | `shared/ui/` | Обёртка: toolbar + content |
| `DoctorCatalogFiltersToolbar` | `shared/ui/doctor/` | Sticky toolbar: фильтры + action |
| `DoctorCatalogToolbarFiltersSlot` | `shared/ui/doctor/` | Слот фильтров в toolbar |
| `CatalogSplitLayout` | `shared/ui/` | Desktop split, mobile toggle |
| `CatalogLeftPane` | `shared/ui/` | Левая панель: header + scrollable list |
| `CatalogRightPane` | `shared/ui/` | Правая панель: форма |
| `DoctorCatalogMasterListHeader` | `shared/ui/doctor/` | Счётчик + вид + сортировка |
| `DoctorCatalogMasterListRow` | `shared/ui/doctor/` | Стандартная строка list-режима |
| `DoctorCatalogListSortHeader` | `shared/ui/doctor/` | Заголовок-сортировщик колонки |
| `VirtualizedItemGrid` | `shared/ui/` | Виртуальный grid tile-режима |

### 8b. Высота split-layout

```ts
DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE   // 1 ряд toolbar (~3.25rem)
DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_EXPANDED  // 2 ряда toolbar (~6.5rem)
```

### 8c. Tile-карточка каталога

```tsx
<Card size="sm" className={cn(
  "h-full w-full min-w-0 rounded-[calc(var(--radius-xl)*0.5)] transition-shadow data-[size=sm]:py-1.5",
  isActive && "ring-1 ring-primary/50 ring-offset-1 ring-offset-background",
)}>
  <CardContent className="flex h-full flex-col gap-1 py-px group-data-[size=sm]/card:px-1.5">
    <div className={cn(
      "w-full overflow-hidden rounded-[calc(var(--radius-md)*0.5)] border border-border/60 bg-muted/30",
      squarePreview ? "aspect-square shrink-0" : "h-[135px]",
    )}>
      <MediaThumb … />
    </div>
    <p className="line-clamp-2 text-center text-xs leading-snug text-foreground">{title}</p>
  </CardContent>
</Card>
```

### 8d. Число колонок тайлов

| Контекст | Колонки |
|---|---|
| Mobile | 3 |
| Desktop, ≤3 | 3 |
| Desktop, 4 | 4 |
| Desktop, 5–7 | 3 |
| Desktop, 8+ | 4 |

### 8e. Primary action кнопка тулбара

```ts
// из DoctorCatalogFiltersToolbar.tsx:
export const doctorCatalogToolbarPrimaryActionClassName = cn(
  buttonVariants({ size: "sm" }),
  "box-box h-[32px] min-h-[32px] inline-flex shrink-0 gap-1 px-3 py-1 text-sm leading-5",
);
```

Для dropdown-варианта (как в упражнениях): `DropdownMenuTrigger` с тем же классом.

---

## 9. Карточка сущности (ClientProfileCard)

Самый сложный паттерн кабинета. Структура фиксирована:

```
article.rounded-lg.border.border-border.bg-card.shadow-sm
  ├── PatientCareBar          — entity-header (§9a)
  ├── PatientActionStrip      — quick-action chips (§9b)
  ├── TabsList (line variant) — горизонтальные вкладки (§9c)
  └── TabsContent             — контент таба (§9d)
```

### 9a. Entity Header (PatientCareBar)

Шапка карточки сущности — sticky под DoctorHeader:

```tsx
<header className="border-b border-border bg-card px-4 py-3">
  {/* имя, телефон, ближайшая запись, quick actions */}
</header>
```

Имя клиента: `text-base font-semibold text-foreground`  
Статус-пилюля (архив/блок): `rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground`

### 9b. Quick Action Chips (PatientActionStrip)

Горизонтальная полоска кликабельных чипсов-уведомлений:

```tsx
<div className="border-b border-border bg-card px-2 py-1.5">
  <div className="flex flex-wrap gap-1.5">
    {chips.map(chip => (
      <button
        key={chip.key}
        className={cn(buttonVariants({ size: "sm", variant: chip.variant }), "h-7 px-2.5 text-xs")}
        onClick={chip.onClick}
      >
        {chip.label}
      </button>
    ))}
  </div>
</div>
```

Показывать только если есть хотя бы один chip с attention.

### 9c. Вкладки карточки

Используется `line` variant (подчёркивание):

```tsx
<div className="overflow-x-auto border-b border-border bg-card px-2">
  <TabsList variant="line" className="h-auto w-max min-w-full justify-start gap-0 bg-transparent p-0">
    <TabsTrigger value="overview" className="rounded-none px-3 py-2">Обзор</TabsTrigger>
    <TabsTrigger value="program" className="rounded-none px-3 py-2">
      Программа
      {badgeCount > 0 && <Badge>{badgeCount}</Badge>}
    </TabsTrigger>
  </TabsList>
</div>
```

### 9d. Tab section (контент таба с разделителями)

Каждая секция внутри таба — через класс из `doctorClientCardChrome.ts`:

```tsx
// Секция с border-bottom (не последняя):
<section className="border-b border-border px-4 py-4 last:border-b-0">
  {/* doctorClientTabSectionClass */}
</section>
```

### 9e. Overview grid (двухколоночная сетка)

Сетка панелей внутри overview-таба:

```tsx
<div className={doctorClientOverviewGridClass}>
  <section className={doctorClientOverviewPrimaryCardClass}>…</section>
  <section className={doctorClientOverviewSecondaryCardClass}>…</section>
</div>
```

Панели растягиваются на 2 колонки: `md:col-span-2` на `className`.

### 9f. Accordion (details/summary) внутри overview

Для опциональных секций (заметки, история):

```tsx
<details className={doctorClientOverviewPrimaryCardClass}>
  <summary className={cn("mb-0 cursor-pointer list-none", doctorClientSectionTitleClass,
    "[&::-webkit-details-marker]:hidden")}>
    Заметки
  </summary>
  <div className="mt-3">
    {/* контент */}
  </div>
</details>
```

### 9g. Хром-константы (doctorClientCardChrome.ts)

```ts
// Shell (§9, §5f)
doctorClientProfileCardClass           // article outer shell
doctorClientProfileStickyShellClass    // sticky care bar + action strip
doctorClientEntityHeaderClass          // PatientCareBar
doctorClientActionStripClass           // chips strip (only if chips.length > 0)
doctorClientTabsScrollClass            // tabs overflow row
doctorClientTabTriggerClass            // TabsTrigger
doctorClientBackLinkClass              // back to list CTA
doctorClientListRowLinkClass           // §5f list row inner Link
doctorClientPanelStackClass            // flex flex-col gap-3 inside tab/panel

// Tab / overview panels (§9d–§9e)
doctorClientOverviewGridClass          // overview two-column grid (§9e)
doctorClientOverviewPrimaryCardClass   // panel level 2, primary
doctorClientOverviewSecondaryCardClass // panel level 2, secondary/muted
doctorClientStackedCardClass           // panel level 2, compact stacked
doctorClientTabSectionClass            // tab section with border-b
doctorClientInsetListRowClass          // inset row inside panel
doctorClientSectionTitleClass          // h2/h3 text-sm font-semibold
doctorClientUrgentZoneClass            // urgent zone (same as primary)
```

---

## 10. CMS-страницы (content)

Страницы `/app/doctor/content/**` используют сайдбар-навигацию `ContentPagesSidebar`. Основной контент — в секциях уровня 1 (§4.1), формы — по паттерну §13.

---

## 11. Медиакарточки (content library)

```tsx
<article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
  <div className="overflow-hidden rounded-md border border-border/70 bg-muted/30">
    <MediaThumb className="h-40 w-full" imgClassName="max-h-40 w-full object-contain bg-muted/30" />
  </div>
  <div className="flex min-w-0 items-start justify-between gap-2">
    <p className="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
    <MediaCardActionsMenu />
  </div>
</article>
```

Сетка: `grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`  
`shadow-sm` оправдан — карточки «плавают» в сетке без контейнера-секции.

Превью: `h-40` (image/video через `MediaThumb` с `object-contain`), аудио — нативный `<audio controls>`, файл — плейсхолдер `h-40 flex items-center justify-center`.

---

## 12. Конструктор программы (InstanceEditorToolbar)

Специфичный тип страницы — редактор с полностью кастомной sticky-шапкой. Константы:

```ts
// treatmentProgramConstructorShellStyles.ts:
INSTANCE_EDITOR_TOOLBAR_STICKY_CLASS  // sticky шапка конструктора
tplToolbarTextBtnClass               // кнопки в шапке
```

Шапка имеет три зоны (`grid-cols-[1fr_auto_1fr]`): слева — breadcrumb (название + клиент), центр — «Комментарии», справа — действия (добавить этап, сохранить).

При несохранённых изменениях: шапка переключается в `border-amber-500/40 bg-amber-500/5`.

При создании новых редакторов — брать этот компонент как шаблон sticky-шапки.

---

## 13. Формы

Стандартная форма в правой панели каталога или на отдельной странице:

```tsx
<form className="flex flex-col gap-4 px-4 py-4">
  <div className="flex flex-col gap-1.5">
    <Label htmlFor="title">Название</Label>
    <Input id="title" placeholder="…" />
  </div>
  <div className="flex flex-col gap-1.5">
    <Label htmlFor="desc">Описание</Label>
    <Textarea id="desc" rows={3} />
  </div>
  <div className="flex justify-end gap-2">
    <Button type="button" variant="outline" onClick={onCancel}>Отмена</Button>
    <Button type="submit">Сохранить</Button>
  </div>
</form>
```

Вариант с «Опубликовать / В архив» — использовать `DoctorCatalogPersistPublishBar` из `shared/ui/doctor/`.

---

## 14. Диалоги

Использовать shadcn `Dialog / DialogContent / DialogHeader / DialogTitle / DialogDescription / DialogFooter`.

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Заголовок</DialogTitle>
      <DialogDescription>Пояснение.</DialogDescription>
    </DialogHeader>
    {/* body */}
    <DialogFooter>
      <Button variant="outline" onClick={…}>Отмена</Button>
      <Button onClick={…}>Подтвердить</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

| Контекст | Width |
|---|---|
| Подтверждение / быстрая форма | `sm:max-w-md` |
| Пикер с библиотекой / большой список | `sm:max-w-2xl` |
| Reorder / drag-and-drop | `sm:max-w-lg` |

**Запрещено:** inline-раскрытие деталей через `useState` когда контент >4 строк или содержит destructive-действие. Разрешено: компактный accordion в каталоге (§9f).

---

## 15. Sticky Toolbar (каталог и фильтры)

Готовые компоненты — не изобретать заново:

```tsx
<DoctorCatalogFiltersToolbar
  filters={
    <DoctorCatalogToolbarFiltersSlot>
      <Input … />
      <Select … />
    </DoctorCatalogToolbarFiltersSlot>
  }
  end={<button className={doctorCatalogToolbarPrimaryActionClassName}>Создать</button>}
/>
```

Классы sticky-полосы (если нужно собрать вручную):
```ts
DOCTOR_CATALOG_STICKY_BAR_CLASS =
  "sticky z-20 -mx-3 -mt-3 border-b border-border/60 bg-background/95 px-3 py-1.5 backdrop-blur-md"
DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS =
  "top-[calc(3.5rem+env(safe-area-inset-top,0px))]"
```

**На страницах без каталога** (appointments, intake) — sticky toolbar не нужен. Фильтры-кнопки — в потоке страницы, `flex flex-wrap gap-2`.

---

## 16. Кнопки

| Контекст | Size | Variant |
|---|---|---|
| Тулбар, primary action (Создать) | `sm` | `default` |
| Тулбар, secondary (Комментарии, Порядок) | `sm` | `outline` / `secondary` |
| Scope-переключение (вид, фильтр) | `sm` | `default` / `outline` |
| Icon-кнопка в строке | `icon` | `outline` |
| Квадратная «+» в конструкторе | `icon`, доп. `size-7 shrink-0` | `outline` |
| Назад / скрыть (мобильный) | — | `ghost`, `h-9 px-2` |
| Destructive / удалить | `sm` | `destructive` |
| Inline CTA в tab/секции | `sm` | `outline` |
| Quick-action chips (action strip) | `sm` | `default` / `secondary` с `h-7 px-2.5 text-xs` |

**Не использовать `ghost` как primary action.** Ghost — только навигация «назад», «скрыть».

---

## 17. Статусные бейджи и тоны

shadcn `Badge`:
```tsx
<Badge variant="default">Новая</Badge>        // синий/primary
<Badge variant="secondary">В работе</Badge>   // серый
<Badge variant="outline">Закрыта</Badge>       // контурный
<Badge variant="destructive">Отмена</Badge>   // красный
```

Статус-пилюля (inline, не Badge):
```tsx
<span className={cn(
  "rounded-md px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide",
  isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
)}>{label}</span>
```

Семантические тоны для секций:

| Тон | Border | Background |
|---|---|---|
| Предупреждение / warning | `border-destructive/40` | `bg-destructive/5` |
| Amber (несохранённые изменения) | `border-amber-500/40` | `bg-amber-500/5` |
| Акцент / deep-link | `border-primary/30` | `bg-card` |
| Ошибка / блокировка | `border-destructive/50` | `bg-destructive/10` |
| Amber info (предупреждение параметра) | `border-amber-500/40` | `bg-amber-500/10` |

Счётчик непрочитанных (в tab или строке списка):
```
rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium tabular-nums
```

Счётчик в кнопке (на светлом фоне кнопки):
```
ml-1.5 rounded-full bg-primary-foreground px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary
```

---

## 18. Пустые состояния

Единый паттерн — внутри любого контейнера:

```tsx
<div className="flex flex-col gap-2 text-sm text-muted-foreground">
  <p>{emptyMessage}</p>
  {fallbackHref && (
    <Link href={fallbackHref} className="text-primary underline underline-offset-2 w-fit">
      {fallbackLabel}
    </Link>
  )}
</div>
```

В каталожном list/tile режиме:
```tsx
<p className="px-2 pb-2 text-sm text-muted-foreground">Нет элементов по заданным фильтрам.</p>
```

---

## 19. Mobile-паттерны

- **Split-layout каталога:** на мобильном `mobileView="list" | "detail"` + кнопка «← Назад» (`variant="ghost" mb-2 h-9 px-2`). Не показывать split-колонки одновременно.
- **Секции:** те же классы что и desktop, без правой колонки.
- **Тайлы на мобильном:** 3 колонки фиксировано.
- **Фильтры:** `flex flex-wrap gap-2`, без горизонтального скролла.
- **Карточка сущности:** `PatientCareBar` адаптируется сам: часть блоков с `hidden md:block` / `md:hidden`.
- **Вкладки:** `overflow-x-auto` + `w-max min-w-full` — горизонтальный скролл если не влезают.
- **Конструктор программы:** toolbar сжимается в вертикальный стек на mobile (`flex-col lg:grid-cols-3`).

---

## 20. Companion-файл doctorVisual.ts

Канонический файл: `apps/webapp/src/shared/ui/doctorVisual.ts` (импортировать константы, не копировать строки классов в route-компоненты). Агентам: `.cursor/rules/doctor-ui-shared-primitives.mdc`.

Содержимое (синхронизировать при добавлении экспортов):

```ts
import { cn } from "@/lib/utils";

// ── Секции на странице ──────────────────────────────────────────────────────

/** Page-level секция: основной контейнер на странице. */
export const doctorSectionCardClass =
  "rounded-xl border border-border bg-card p-3 flex flex-col gap-3";

/** Вложенная строка-карточка внутри page-section (записи, заявки, инсайты). */
export const doctorSectionItemClass =
  "rounded-lg border border-border/70 bg-background/40 p-3 text-sm";

/** Строка с семантическим тоном (urgent = destructive, normal = muted). */
export const doctorSectionItemUrgentClass = "border-destructive/40 bg-destructive/5";
export const doctorSectionItemNeutralClass = "border-border bg-muted/15";

// ── Списки ──────────────────────────────────────────────────────────────────

/** Внешняя карточка-ссылка (строка списка клиентов, standalone). */
export const doctorListItemOuterClass = "rounded-lg border border-border bg-card p-0";

/** Кликабельная строка master-list в каталоге. */
export const doctorCatalogRowClass =
  "flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted";

/** Активная строка master-list. */
export const doctorCatalogRowActiveClass =
  "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25";

/** Пустой master-list (list mode). */
export const doctorCatalogListEmptyClass = "px-2 pb-2 text-sm text-muted-foreground";

/** Пустая tile-сетка каталога. */
export const doctorCatalogListEmptyTilesClass = "px-2 text-sm text-muted-foreground";

/** Standalone editor page (`new` / `[id]` вне split-layout). */
export const doctorCatalogEditorSectionClass =
  "flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm";

/** Хроника / мини-событие внутри панели. */
export const doctorHistoryRowClass =
  "rounded-md border border-border/60 bg-muted/10 px-2 py-1.5";

// ── Типографика ─────────────────────────────────────────────────────────────

/** Заголовок секции / панели (h2, h3). */
export const doctorSectionTitleClass = "text-sm font-semibold text-foreground";

/** Вспомогательный текст под заголовком. */
export const doctorSectionSubtitleClass = "text-xs text-muted-foreground";

/** Inline-link. */
export const doctorInlineLinkClass = "text-primary underline underline-offset-2";

/** Hover-link (вторичная ссылка). */
export const doctorHoverLinkClass = "text-primary underline-offset-4 hover:underline font-medium";

// ── Пустые состояния ────────────────────────────────────────────────────────

/** Обёртка пустого состояния. */
export const doctorEmptyStateClass = "flex flex-col gap-2 text-sm text-muted-foreground";

// ── Сетки ───────────────────────────────────────────────────────────────────

/** Сетка KPI stat-карточек. */
export const doctorStatCardGridClass = "grid gap-3 sm:grid-cols-2 xl:grid-cols-4";

/** Сетка медиакарточек библиотеки. */
export const doctorMediaCardGridClass = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

// ── Лэйаут-хелперы ───────────────────────────────────────────────────────────

/** Заголовок страницы (h1) в AppShell или standalone-header. */
export const doctorPageTitleClass = "text-base font-semibold tracking-tight text-foreground";

/** Вертикальный стек контента doctor-страницы. */
export const doctorPageStackClass = "flex flex-col gap-3";

/** Стек заголовка внутри page-level секции. */
export const doctorSectionHeaderStackClass = "flex flex-col gap-0.5";

```

Overview-сетка и панели уровня 2 — в `doctorClientCardChrome.ts` (`doctorClientOverviewGridClass`, primary/secondary/stacked).

---

## 21. Чеклист code review

При добавлении нового экрана или блока в `/app/doctor/**`:

- [ ] Нет голого `<h2>` / `<h3>` без className
- [ ] Page-level секция: `rounded-xl border border-border bg-card p-3` (не `rounded-2xl`, не `rounded-lg`)
- [ ] `shadow-sm` добавлен только на медиакарточки или card-internal панели (§4)
- [ ] `p-4` — только в card-internal панелях и `DoctorStatCard`, не в page-секциях
- [ ] Каталожный toolbar: `DoctorCatalogFiltersToolbar` (не кастомный sticky)
- [ ] Primary action — `default` Button или `doctorCatalogToolbarPrimaryActionClassName`
- [ ] Пустое состояние по §18
- [ ] Диалог: `Dialog / DialogContent / DialogHeader / DialogTitle / DialogFooter`
- [ ] Нет inline-раскрытия деталей с destructive-действием вне Dialog
- [ ] Плотность контента согласована: KPI-сетка ↔ секция ↔ строки (§4 + §6)
- [ ] `tabular-nums` на всех числовых метриках
- [ ] Тон строки задачи/события — по §5b, не ad-hoc цвет
- [ ] Карточка сущности (если нужна) — по §9, используя `doctorClientCardChrome.ts`
- [ ] График — через shadcn Card + recharts по §7 (не кастомный контейнер)
