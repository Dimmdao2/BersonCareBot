# LOG — Doctor UI Unification

## 2026-06-04 — Фаза 0 (baseline audit)

### Сделано

- Созданы `README.md`, `LOG.md`, `AUDIT.md`.
- Инвентарь: **78** маршрутов `page.tsx` под `apps/webapp/src/app/app/doctor/`.
- Прочитаны density-документы (ссылки в `README.md`); откат плотности **не** планируется.
- Заполнена audit-таблица: high-impact, client card, catalogs, CMS/media, tail routes, `admin/booking/**`.

### Проверки (локально, без полного CI)

```bash
# Отклонения карточек / теней
rg "rounded-2xl" apps/webapp/src/app/app/doctor --glob "*.tsx"  # 13 файлов, см. AUDIT

# Page-level «тяжёлая» карточка (rounded-lg + p-4 + shadow-sm)
rg "rounded-lg border border-border bg-card p-4 shadow-sm" apps/webapp/src/app/app/doctor --glob "*.tsx"

# Голые h2 (без className) — нарушение гайда §2
rg "<h2>[^<]" apps/webapp/src/app/app/doctor --glob "*.tsx"

# Уже на каноне (эталон / chrome)
rg "DoctorCatalogFiltersToolbar|CatalogSplitLayout|doctorClientOverviewPrimaryCardClass|doctorClientCardChrome" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui --glob "*.tsx"
```

### Наблюдения

- **Сегодня** (`DoctorTodayDashboard.tsx`): секции уже `rounded-xl` + `p-3`, заголовки `text-sm font-semibold` — фаза 2 точечно (KPI vs list density, не переписывать целиком).
- **Каталоги** (exercises, recommendations, lfk-templates, treatment-program-templates, test-sets, clinical-tests): split-layout + toolbar — **low**, фаза 4A = parity pass.
- **Главные долги:** `appointments`, `analytics/clients` (+ chart clients), `online-intake` (inline cards), `SubscriberProfileCard`, часть admin-панелей клиента (`rounded-2xl` + bare `h2`).
- **`doctorVisual.ts`** — добавлен в фазе 1 (см. запись ниже).

### Manual visual checklist

Фаза 0 — только desk audit в коде. Чеклист desktop/mobile — с фазы 2, записи в этот файл по завершении каждой фазы.

### Намеренно не делали

- Правки UI в коде.
- `doctorVisual.ts` и wrappers.
- Ссылку в `docs/README.md` (фаза 5).
- Полный `pnpm run ci`.

## 2026-06-04 — Фаза 0 (допроверка полноты)

### Что дополнили

- Полностью развернули индекс маршрутов в `AUDIT.md`: теперь это явный список **78/78** `page.tsx` (по одной строке на маршрут, с фазой и статусом).
- Добавили инвентарь non-page coverage: `*Panel.tsx` (18), `*Client.tsx` (27), `*Dialog.tsx` (10) с фазовой привязкой.
- Уточнили сигнал по заголовкам: зафиксированы **13** `h2` без `className` (включая client panels), `h3` без `className` не найдено.

### Проверки (локально)

```bash
# Сверка route-index vs реальные page.tsx
python3 <script>  # результат: pages 78, covered_pages 78, missing 0

# h2/h3 без className (line-level scan)
python3 <script>  # h2: 13 matches, h3: 0 matches
```

## 2026-06-04 — Фаза 1 (foundation)

### Сделано

- Создан `apps/webapp/src/shared/ui/doctorVisual.ts` по §20 гайда: section/list/typography/empty-state/grid токены + helper `getDoctorSectionItemClass`.
- Добавлены thin wrappers:
  - `apps/webapp/src/shared/ui/doctor/DoctorSection.tsx` (`DoctorSection`, `DoctorSectionHeader`, `DoctorSectionTitle`);
  - `apps/webapp/src/shared/ui/doctor/DoctorEmptyState.tsx`;
  - `apps/webapp/src/shared/ui/doctor/DoctorMetricList.tsx`.
- Wrapper-решение зафиксировано как **accepted**: в фазе 2 один и тот же section shell действительно используется 3+ раз (today/appointments/analytics/online-intake), empty-state повторяется 3+ раз, summary metrics — 2+ экрана.
- Foundation уже подключён на page-level и adjacent doctor sections без смены бизнес-логики:
  - `DoctorTodayDashboard.tsx`;
  - `DoctorGlobalTasksSection.tsx`;
  - `DoctorTodayProactiveInsightsSection.tsx`;
  - `DoctorTodayPendingProgramTestsSection.tsx`.

### Совместимость с текущими shared-примитивами

- `DoctorCatalogFiltersToolbar` / `DoctorCatalogMasterListRow` / `DoctorCatalogPageLayout` — без изменений API; конфликтов импорта нет.
- `DoctorStatCard` продолжает отвечать за внутреннюю KPI-карточку (`p-4`, `shadow-sm`), а `DoctorMetricList` — только за внешнюю сетку.
- `doctorClientCardChrome.ts` не дублировали и не меняли (уровень entity-card остаётся отдельным слоем).

### Проверки фазы

```bash
rg "doctorSectionCardClass|doctorEmptyStateClass|doctorStatCardGridClass" apps/webapp/src
pnpm --dir apps/webapp exec tsc --noEmit
```

- `ReadLints` по новым и изменённым файлам: ошибок нет.

### Дозавершение по результатам аудита

- Убраны остатки ad-hoc foundation-классов в уже затронутых doctor-секциях (`DoctorTodayDashboard`, `DoctorTodayProactiveInsightsSection`, `DoctorTodayPendingProgramTestsSection`, `DoctorGlobalTasksSection`):
  - ссылки секций сведены к `doctorInlineLinkClass`;
  - заголовочные стек-блоки сведены к `DoctorSectionHeader` там, где применимо;
  - empty state задач сведён к `DoctorEmptyState`.
- Повторная проверка:

```bash
rg "text-primary underline underline-offset-2|rounded-xl border border-border bg-card p-3 flex flex-col gap-3|rounded-lg border border-border/70 bg-background/40 p-3 text-sm" \
  apps/webapp/src/app/app/doctor/DoctorTodayDashboard.tsx \
  apps/webapp/src/app/app/doctor/DoctorTodayProactiveInsightsSection.tsx \
  apps/webapp/src/app/app/doctor/DoctorTodayPendingProgramTestsSection.tsx \
  apps/webapp/src/app/app/doctor/DoctorGlobalTasksSection.tsx  # no matches
pnpm --dir apps/webapp exec tsc --noEmit
```

## 2026-06-04 — Хвосты после аудита фазы 1

### Сделано

- `README.md`: фаза 1 → **done**, граница 1/2 (foundation на «Сегодня» ≠ закрытие high-impact).
- `doctorClientOverviewGridClass` перенесён из `doctorVisual.ts` в `doctorClientCardChrome.ts`; подключён в `DoctorClientOverviewTab.tsx` (без дубля слоёв).
- `AUDIT.md`: шапка про `doctorVisual` + entity-card; уточнены строки proactive/global-tasks.
- `DOCTOR_APP_UI_STYLE_GUIDE.md`: §9e/§9g и §20 — overview grid только в `doctorClientCardChrome`.

### Граница фаз 1 и 2 для `/app/doctor`

| Что сделано в фазе 1 | Остаётся на фазу 2 |
|----------------------|-------------------|
| `DoctorSection` / `DoctorEmptyState` / `DoctorMetricList` на дашборде и соседних секциях | Manual visual checklist (desktop/mobile) |
| Константы ссылок и строк списка | KPI vs compact list density на «Сегодня» |
| — | `appointments`, `analytics/clients`, `online-intake` |

### Проверки

```bash
rg "doctorClientOverviewGridClass" apps/webapp/src
pnpm --dir apps/webapp exec tsc --noEmit
```
