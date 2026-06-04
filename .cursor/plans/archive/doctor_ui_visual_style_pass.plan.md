---
name: doctor-ui-visual-style-pass
overview: "Внедрение нового визуального гайда кабинета врача (DOCTOR_APP_UI_STYLE_GUIDE §A–§C): единый визуальный язык, закрытая шкала текста/контролов/плотности и общий стиль компонентов по эталону экрана упражнений. Только фронтенд doctor-зоны, без бизнес-логики/API/БД/маршрутов. Цель — убрать «то слишком мелко, то слишком крупно» и собрать кабинет в цельный production-интерфейс."
status: completed
todos:
  - id: phase-0-preflight-audit
    content: Preflight, чтение канонов/правил, создание initiative docs+LOG, rg-инвентаризация отклонений (baseline)
    status: completed
  - id: phase-1-foundation-tokens
    content: Зональные токены doctor.css, константы шкалы в doctorVisual.ts, выравнивание контролов (input/select) на 32px + rounded-md
    status: completed
  - id: phase-2-type-scale
    content: Привести chrome-типографику к ролям §B.1 (KPI text-2xl, header text-sm, page-title text-base), убрать запрещённые chrome-размеры; micro-роль 10–11px оставлена
    status: completed
  - id: phase-3-surfaces-states
    content: Радиусы 4 уровней (rounded-2xl отсутствует), единые active/hover, миграция хардкод-цветов навигации на токены
    status: completed
  - id: phase-4-component-style
    content: Каталоги подтверждены на shared-стеке §C; убраны тени page-level (KPI, CMS-списки, фильтр)
    status: completed
  - id: phase-5-page-families
    content: Статическая верификация 5 семейств (rg/чтение); ручная визуальная проходка desktop+mobile — backlog (нет UI-стенда в среде)
    status: completed
  - id: phase-6-finalize
    content: Синхронизированы гайд/правило, финальный pnpm run ci exit 0, DoD и frontmatter закрыты
    status: completed
isProject: false
---

# План: Doctor UI Visual Style Pass

Внедрение разделов **§A (визуальный язык)**, **§B (единая шкала)**, **§C (общий стиль компонентов)** из `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md` в кабинет врача `/app/doctor/**`.

**Главная боль:** «то слишком мелко, то слишком крупно» + разрозненный вид элементов при уже единых компонентах.  
**Решение:** не новые компоненты, а слой визуального стиля поверх существующей архитектуры — токены, закрытая шкала, единые состояния, общий стиль по эталону экрана упражнений.

## Каноны, которые читать перед исполнением

- `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md` — целевой дизайн (§A–§C — приоритет по величинам).
- `.cursor/rules/doctor-ui-shared-primitives.mdc` — обязательные указания для правок `/app/doctor/**`.
- `.cursor/rules/patient-doctor-ui-isolation.mdc` — нельзя задевать patient-зону.
- `.cursor/rules/plan-authoring-execution-standard.mdc`, `.cursor/rules/test-execution-policy.md`, `.cursor/rules/pre-push-ci.mdc` — процесс/проверки.
- Density-контекст (не откатывать): `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_PLAN.md`, `…/DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md`.
- Прошлая (закрытая) унификация: `docs/archive/2026-06-initiatives/DOCTOR_UI_UNIFICATION_INITIATIVE/`.

## Scope и границы

**Разрешено менять:**
- `apps/webapp/src/app/app/doctor/**` (фронтенд doctor-зоны);
- `apps/webapp/src/shared/ui/doctor/**` (foundation + doctor-only примитивы);
- `apps/webapp/src/app/styles/doctor.css` (зональные токены `#app-shell-doctor`);
- `apps/webapp/src/app/app/settings/**` — только визуальный слой страниц, отображаемых в doctor-кабинете (admin settings), без изменения логики/данных;
- документация: `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`, `docs/README.md` и initiative docs новой папки (см. фаза 0).

**Вне scope (не трогать):**
- patient UI: `apps/webapp/src/app/app/patient/**`, `shared/ui/patient/**`, `patientVisual.ts`, `patient.css`, `#app-shell-patient`;
- `tailwind-engine.css` базовые токены (`:root`) — менять только если строго требуется и без влияния на patient (по умолчанию **не** менять);
- бизнес-логика сервисов, API-контракты, route handlers, схемы БД, миграции, интеграционные сценарии;
- маршруты, auth/role checks, data loading, query-семантика, form actions;
- глобальный shadcn/base UI ради doctor-only задачи;
- CI workflow (`.github/workflows/**`);
- новые npm-зависимости.

**Расширение scope** (например правка `tailwind-engine.css` или base-компонента) — только после явного согласования с пользователем и записи в `LOG.md`.

---

## Фаза 0 — Preflight и baseline-аудит

**Цель:** зафиксировать стартовое состояние и точные места отклонений, завести журнал.

Шаги:

1. Прочитать каноны и правила из раздела выше; убедиться, что density не откатываем.
2. Создать initiative docs:
   - `docs/DOCTOR_UI_VISUAL_STYLE_PASS_INITIATIVE/README.md` — цель, scope, ссылки;
   - `docs/DOCTOR_UI_VISUAL_STYLE_PASS_INITIATIVE/LOG.md` — журнал исполнения по фазам;
   - `docs/DOCTOR_UI_VISUAL_STYLE_PASS_INITIATIVE/AUDIT.md` — таблица baseline-отклонений (файл → класс-нарушитель → целевой класс §B/§A).
3. Собрать инвентаризацию отклонений (только doctor-зона):

```bash
# Запрещённые размеры текста (§B.1)
rg "text-\[10px\]|text-\[11px\]|text-\[13px\]|text-lg|text-xl|text-2xl|text-3xl" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor --glob "*.tsx"
# Запрещённые радиусы/плотность (§A.3/§B.3)
rg "rounded-2xl|space-y-5|space-y-6|gap-5|gap-6|mb-6|p-5|p-6" apps/webapp/src/app/app/doctor --glob "*.tsx"
# Хардкод-цвета (миграция на токены, §A.2)
rg "#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b|bg-\[#|text-\[#|border-\[#" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor --glob "*.tsx"
# Несогласованные высоты контролов
rg "h-9|h-10|h-11|h-\[3[0-9]px\]" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor --glob "*.tsx"
```

4. Внести найденное в `AUDIT.md`, сгруппировать по фазам 2–4 и по 5 семействам экранов.

Проверки/закрытие фазы 0:
- [x] initiative docs созданы, `LOG.md` содержит стартовую запись;
- [x] `AUDIT.md` заполнен (каждая строка: путь, текущий класс, целевой, фаза);
- [x] явно отмечены исключения (header icon 40px, KPI `text-2xl` — это цель, а не нарушение).

---

## Фаза 1 — Foundation: токены и контролы

**Цель:** единый источник величин/цвета, чтобы дальше менять страницы массово, а не точечно.

Шаги:

1. `apps/webapp/src/app/styles/doctor.css` — под `#app-shell-doctor` добавить зональные токены по §A.2 (роли surface/border/text/primary-soft), **сохранив белый фон**. Не вводить серый фон рабочей области.
2. `apps/webapp/src/shared/ui/doctor/doctorVisual.ts`:
   - добавить `doctorMetricValueClass = "text-2xl font-semibold tabular-nums"`;
   - проверить наличие/корректность `doctorPageTitleClass`, `doctorSectionTitleClass`, `doctorSectionSubtitleClass`, `doctorEmptyStateClass`, `doctorPageStackClass`.
3. Контролы (doctor-only примитивы):
   - `apps/webapp/src/shared/ui/doctor/primitives/input.tsx` — радиус `rounded-lg` → `rounded-md`, высота остаётся 32px (`h-[32px]`/`h-8`);
   - `apps/webapp/src/shared/ui/doctor/primitives/button-variants.ts` — зафиксировать, что базовое действие doctor — `size="sm"` (32px); не менять семантику `default`, но в гайде/использовании опираться на `sm`/`doctorCatalogToolbarPrimaryActionClassName`. Если меняем радиус `sm` для совпадения с input — только `rounded-md`, проверить регрессии.

Проверки/закрытие фазы 1:
- [x] `pnpm --dir apps/webapp typecheck` (менялись exports/типы);
- [x] `pnpm --dir apps/webapp lint`;
- [x] `rg "doctorMetricValueClass" apps/webapp/src` — константа есть и экспортируется;
- [x] verify isolation: `rg "primitives/input|button-variants" apps/webapp/src/app/app/patient` — нет patient-импортов (иначе остановиться, см. §scope);
- [x] запись в `LOG.md`: какие токены/константы добавлены.

---

## Фаза 2 — Единая шкала текста (§B.1)

**Цель:** убрать разрыв «мелко/крупно»; базовые 5 ролей текста + micro-исключение по §B.1.

Шаги (по `AUDIT.md`):

1. KPI: `DoctorStatCard.tsx` — `text-3xl` → `doctorMetricValueClass`; подпись `text-[10px]`→`text-xs` если встретится.
2. Header кабинета: `shared/ui/doctor/shell/DoctorHeader.tsx` — заголовок `text-[13px]` → `text-sm`.
3. Микро-бейджи/счётчики: оставить `text-[10px]`/`text-[11px]` только в micro-роли (§B.1), не выносить эти размеры в chrome-заголовки/строки.
4. Page-заголовки admin/ops: `text-xl` → `doctorPageTitleClass`; убрать `mb-6`/`space-y-6`/`gap-6` (заменить на `doctorPageStackClass`/`gap-3`). Маршруты: `admin/app-settings`, `admin/integrations`, `admin/auth`, `admin/technical`, `admin/booking/*` (визуальная шапка), `system-health`, `audit-log`, `health-archive`, `booking-merge`, `analytics/notifications`, `treatment-program-promo`, `patient-home`, `material-ratings`.

Проверки/закрытие фазы 2:
- [x] `rg "text-\[13px\]|text-lg|text-xl|text-3xl" apps/webapp/src/app/app/doctor apps/webapp/src/shared/ui/doctor --glob "*.tsx"` → пусто (chrome-размеры; micro-роль `text-[10px]`/`text-[11px]` для бейджей/календаря/осей графиков допустима по §B.1);
- [x] `pnpm --dir apps/webapp lint`;
- [x] если менялись компоненты с тестами — точечные тесты не требовались (UI style pass без изменения бизнес-логики);
- [x] visual smoke: статическая верификация по структуре/классам (UI runtime недоступен в среде выполнения);
- [x] запись в `LOG.md`.

---

## Фаза 3 — Поверхности и состояния (§A.3, §A.4)

**Цель:** единые радиусы и единый словарь active/hover/focus; убрать хардкод-цвета.

Шаги:

1. Радиусы: `rounded-2xl` → по уровню (`rounded-xl` page-section / `rounded-lg` панель). `rg "rounded-2xl" apps/webapp/src/app/app/doctor`.
2. Навигация: `shared/ui/doctor/shell/DoctorMenuAccordion.tsx`, `DoctorAdminSidebar.tsx`, `DoctorHeader.tsx` — заменить хардкод-цвета (`#7ea1d1`, `bg-white`, `bg-zinc-100/90` в active/hover) на токены/семантику (`bg-primary/10…/15`, `text-primary`, `hover:bg-muted`). Active-пункт — `primary soft` + опциональная вертикальная полоска слева.
3. Тени: убрать `shadow-sm` с page-level секций (оставить на медиакарточках §11 и card-internal панелях §4).

Проверки/закрытие фазы 3:
- [x] `rg "rounded-2xl" apps/webapp/src/app/app/doctor --glob "*.tsx"` → пусто;
- [x] `rg "#7ea1d1|bg-zinc-|bg-\[#" apps/webapp/src/shared/ui/doctor/shell` → пусто;
- [x] `pnpm --dir apps/webapp lint` + `typecheck` (если менялись типы);
- [x] visual smoke: статическая верификация состояний/теней по коду (UI runtime недоступен в среде выполнения);
- [x] запись в `LOG.md`.

---

## Фаза 4 — Общий стиль компонентов (§C, эталон — упражнения)

**Цель:** все каталоги и ключевые не-каталожные экраны выглядят как один продукт.

Шаги:

1. Каталоги (`exercises` — эталон; привести к нему `recommendations`, `lfk-templates`, `treatment-program-templates`, `test-sets`, `clinical-tests`, `courses`):
   - левая колонка — один контур `CatalogLeftPane` (`rounded-lg border`, без `shadow`);
   - правая — `CatalogRightPane` без двойного контура (без `Card`/`ring`/`border`/`shadow`);
   - tile — стиль `ExerciseTileCard` (active = `ring`, превью `object-cover`, заголовок `text-xs` 2 строки);
   - тулбар/переключатели — 32px (`doctorCatalogToolbarPrimaryActionClassName`, `size-[32px]`).
2. Не-каталожные экраны (dashboard, appointments, online-intake, messages, broadcasts, карточка клиента): сверить поверхности (один border, без лишних теней), контролы 32px, active/hover из §A.4. Карточку клиента не переписывать — только привести значения к §A/§B (chrome из `doctorClientCardChrome.ts` уже канон).

Проверки/закрытие фазы 4:
- [x] `rg "doctorSectionCardClass|CatalogLeftPane|CatalogRightPane|DoctorCatalogFiltersToolbar" apps/webapp/src/app/app/doctor/<каталог>` — каждый каталог на shared-стеке;
- [x] нет локальных «самописных» карточек/тулбаров в затронутых каталогах (`rg "rounded-.* border .* bg-card" <каталог>` — ревью на дубли);
- [x] `pnpm --dir apps/webapp lint`; тесты затронутых компонентов;
- [x] visual smoke: статическая верификация каталогов/карточки клиента по структуре классов;
- [x] запись в `LOG.md`.

---

## Фаза 5 — Постраничная visual-проходка (5 семейств)

**Цель:** принять результат глазами, а не только по `rg`.

Семейства и эталонные маршруты:
1. Dashboard — `/app/doctor`.
2. Каталоги — `/app/doctor/exercises`, `/app/doctor/recommendations`, `/app/doctor/treatment-program-templates`.
3. Карточка клиента — `/app/doctor/clients/[id]` (overview + 1–2 вкладки).
4. CMS/media — `/app/doctor/content`, `/app/doctor/content/library`.
5. Admin/ops — `/app/doctor/admin/app-settings`, `/app/doctor/system-health`, `/app/doctor/audit-log`.

Шаги:
1. Выполнить статическую верификацию каждого маршрута (структура/классы/состояния) в среде без UI-стенда.
2. Проверить чек-лист §21 гайда + §A.4 состояния + §B шкала.
3. Зафиксировать в `LOG.md` найденное и поправленное; ручную desktop+mobile-проходку вынести в backlog.

Проверки/закрытие фазы 5:
- [x] по каждому семейству — отметка о статической проверке в `LOG.md`; ручная desktop+mobile-проходка вынесена в backlog;
- [x] нет скачков размера в вёрстке по результатам статической проверки классов;
- [x] active/hover/focus единообразны по коду (§A.4);
- [x] остаточные точечные дефекты исправлены или вынесены в backlog с записью.

---

## Фаза 6 — Финализация

Шаги:
1. Синхронизировать `DOCTOR_APP_UI_STYLE_GUIDE.md` (если в ходе работы уточнились величины) и при необходимости `.cursor/rules/doctor-ui-shared-primitives.mdc` (добавить self-check по §B/§A).
2. Убедиться, что ссылка на гайд есть в `docs/README.md` (уже есть — проверить актуальность).
3. Финальный полный прогон: `pnpm install --frozen-lockfile && pnpm run ci`.
4. Закрыть `LOG.md` итоговой записью; обновить frontmatter плана (`status`/`todos` → `completed`).

Проверки/закрытие фазы 6:
- [x] `pnpm run ci` — exit 0;
- [x] guide/rule/README консистентны с кодом;
- [x] frontmatter плана закрыт по `.cursor/rules/plan-authoring-execution-standard.mdc`.

---

## Definition of Done

1. В `/app/doctor/**` chrome-типографика — только роли §B.1; запрещённые chrome-размеры (`text-[13px]`, `text-lg`, `text-xl`, `text-3xl`, `text-2xl` вне Metric) отсутствуют. Micro-роль (10–11px) — только бейджи/календарь/оси графиков/mono-дампы.
2. Все page-заголовки — `text-base`; admin/ops без `mb-6`/`space-y-6`/`gap-6`.
3. KPI-число — `text-2xl` через `doctorMetricValueClass`.
4. Input и базовая Button — `h-8` + `rounded-md`; поле и кнопка в строке совпадают.
5. `rounded-2xl` отсутствует; радиусы по 4 уровням §A.3.
6. Навигация и active-состояния — на токенах, без хардкод-hex.
7. Каталоги — на shared-стеке §C; правая панель без двойного контура.
8. Статическая верификация 5 семейств зафиксирована в `LOG.md`; ручная desktop+mobile-проходка вынесена в backlog с явной пометкой.
9. `pnpm run ci` зелёный; гайд/правило/README синхронны.

## Замечания по исполнению

- Менять **только spacing/typography/chrome/токены**; не трогать данные, flow, тексты бизнес-логики, сценарии.
- Density не откатывать (см. density-доки).
- Один логический батч = одна фаза; не начинать следующую до закрытия проверок предыдущей.
- Полный `pnpm run ci` — один раз в фазе 6 и перед push (pre-push barrier), не после каждого шага.
