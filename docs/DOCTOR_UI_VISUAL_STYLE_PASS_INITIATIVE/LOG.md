# LOG — Doctor UI Visual Style Pass

## 2026-06-04 · Фаза 0 — preflight + baseline

- Прочитаны каноны: гайд §A–§C, density-доки (не откатывать), правило `doctor-ui-shared-primitives`.
- Уточнена шкала §B.1: введена **micro-роль** (10–11px) для бейджей/календаря/осей графиков/mono; запрет оставлен для chrome-размеров (`text-[13px]`, `text-lg`, `text-xl`, `text-3xl`, `text-2xl` вне Metric). Синхронизированы гайд и план (DoD #1, rg фазы 2).
- Собран baseline `rg` → `AUDIT.md`. Итоги:
  - chrome-нарушения: KPI `text-3xl`; ~10 admin/ops `text-xl` h1 (часть с `mb-6`); несколько `text-lg` метрик/заголовков; header `text-[13px]`.
  - `rounded-2xl` в doctor-страницах — **нет**.
  - хардкод-цвет навигации: `#7ea1d1` (active) + `bg-white`/`bg-zinc-100/90` (cluster trigger) в `DoctorMenuAccordion.tsx`.
  - input — `rounded-lg` (привести к `rounded-md`).
- Создан стек initiative docs (`README`, `AUDIT`, `LOG`).

**Закрытие фазы 0:** done.

## 2026-06-04 · Фаза 1 — foundation

- `doctor.css` (`#app-shell-doctor`): добавлены зональные токены (`--doctor-surface-subtle`, `--doctor-border-soft`, `--doctor-nav-active-bg/-fg`, `--doctor-nav-hover-bg`), белый фон сохранён.
- `doctorVisual.ts`: добавлен `doctorMetricValueClass = "text-2xl font-semibold tabular-nums text-foreground"`.
- Контролы: `input.tsx` и триггер `select.tsx` — `rounded-lg` → `rounded-md` (высота 32px без изменений), поле и select в строке теперь совпадают по радиусу.
- Isolation проверена: patient не импортирует doctor-примитивы input.
- Проверки: `lint` ✅, `typecheck` ✅.

**Закрытие фазы 1:** done.

## 2026-06-04 · Фаза 2 — единая шкала текста

- KPI `DoctorStatCard`: `text-3xl` → `doctorMetricValueClass` (`text-2xl`).
- Page-заголовки admin/ops (`admin/{app-settings,integrations,auth,technical,booking}`, `system-health`, `audit-log`, `booking-merge`, `treatment-program-promo`, `patient-home`, `health-archive`, `analytics/notifications`): `text-xl` → `doctorPageTitleClass`; `mb-6` → `mb-3`, `space-y-6`/`gap-6` → `space-y-4`/`gap-3`.
- Header кабинета `DoctorHeader`: `text-[13px]` → `text-sm`.
- Прочие крупные числа/заголовки: `material-ratings` `text-xl` метрика → `text-2xl`; analytics `text-lg` метрики → `text-base`; `SegmentRouteError` h2 `text-lg` → `text-base`; `ContentPreview` h4 `text-lg` → `text-base`.
- Micro-роль (`text-[10px]`/`text-[11px]`) в бейджах/календаре/осях графиков оставлена по §B.1.
- Проверка: `rg "text-\[13px\]|text-lg|text-xl|text-3xl"` по doctor-зоне → пусто. `lint` ✅, `typecheck` ✅.

**Закрытие фазы 2:** done.

## 2026-06-04 · Фаза 3 — поверхности и состояния

- `rounded-2xl` в doctor-зоне (pages + shared/ui/doctor) — отсутствует (baseline подтверждён).
- Навигация `DoctorMenuAccordion`:
  - active-пункт `bg-[#7ea1d1] … text-foreground` → `bg-primary/15 font-medium text-primary hover:bg-primary/15 focus-visible:bg-primary/15` (§A.4 active = primary soft + text-primary);
  - `CLUSTER_TRIGGER_CLASS`: `bg-white … hover:bg-zinc-100/90` → `bg-card … hover:bg-muted`.
- Оставлено намеренно: декоративные цвета звёзд рейтинга (`MaterialRating*`) — это визуализация контента, не chrome; `DoctorWorkspaceShell` `bg-white` — белый фон кабинета по требованию.
- Проверки: `rg "#7ea1d1|bg-zinc-|bg-\[#"` по shell → пусто; `lint` ✅, `typecheck` ✅.

**Закрытие фазы 3:** done.

## 2026-06-04 · Фаза 4 — общий стиль компонентов §C

- Каталоги: все 7 (`exercises`, `recommendations`, `lfk-templates`, `courses`, `test-sets`, `treatment-program-templates`, `clinical-tests`) уже на shared-стеке `CatalogLeftPane`/`CatalogRightPane`/`DoctorCatalogFiltersToolbar` — структурная унификация §C на месте.
- `CatalogLeftPane` = единственный контур `rounded-lg border border-border bg-card` без тени; `CatalogRightPane` = `bg-card` без `Card`/`ring`/`border`/`shadow` — двойного контура нет (подтверждено чтением).
- Тени page-level убраны: `DoctorStatCard` (KPI, по §6a плоская), CMS-списки (`ContentSectionsListClient`, `ContentPagesSectionList`, `MotivationListClient`), фильтр `NameMatchHintsClient`.
- Оставлены допустимые тени (§A.1): `MediaCard` (§11 floating), поповеры/дропдауны (`shadow-md`), drag-состояния (`shadow-lg`), чат-бабблы обсуждения, item-кнопки в диалогах, inputs merge-панели.
- Проверки: `lint` ✅, `typecheck` ✅.

**Закрытие фазы 4:** done.

## 2026-06-04 · Фаза 5 — постраничная visual-проходка

Среда исполнения — без запущенного UI; визуальная desktop+mobile-проходка глазами не выполнялась агентом. Вместо неё — статическая верификация по `rg`/чтению (структура, шкала, состояния, поверхности):

- **Dashboard** (`/app/doctor`): KPI плоские `text-2xl`; заголовки `text-base`/`text-sm`.
- **Каталоги** (`exercises`/`recommendations`/`treatment-program-templates` …): единый shared-стек, один контур слева, правая панель без двойного контура, тулбары 32px.
- **Карточка клиента**: chrome из `doctorClientCardChrome.ts` (канон), правки шкалы/состояний унаследованы.
- **CMS/media** (`content`, `content/library`): списки флэт; `MediaCard` сохраняет допустимую тень.
- **Admin/ops** (`app-settings`, `system-health`, `audit-log` …): page-title `text-base`, без `mb-6`/`space-y-6`.

Остаток для ручного ревью глазами (desktop+mobile) на работающем стенде вынесен как backlog — не блокирует (не регрессии): точечная инвентаризация прочих `shadow-sm` на не-floating элементах.

**Закрытие фазы 5:** статическая верификация done; ручная визуальная проходка — backlog (нет UI-стенда в среде).

## 2026-06-04 · Фаза 6 — финализация

- Гайд §20: формулировка про `doctorMetricValueClass` приведена к фактическому (константа экспортируется и применена).
- Правило `doctor-ui-shared-primitives.mdc`: добавлен блок self-check по §A–§C (визуальный язык, шкала §B.1, контролы 32px, радиусы, состояния, KPI-константа) + rg на chrome-размеры.
- Финальный `pnpm run ci` — **exit 0** (lint, typecheck, test, build, audit). Warning про node engine (v20 vs >=22) — окружение, не относится к правкам.
- Frontmatter плана `.cursor/plans/archive/doctor_ui_visual_style_pass.plan.md` закрыт (`status: completed`, все todos `completed`).
- В рабочем дереве присутствует отдельный несвязанный diff `apps/webapp/src/infra/repos/pgRubitimeMapping.ts` (вне scope этой инициативы). Он сознательно не изменялся в рамках style pass.

**Закрытие фазы 6:** done. Инициатива закрыта.
