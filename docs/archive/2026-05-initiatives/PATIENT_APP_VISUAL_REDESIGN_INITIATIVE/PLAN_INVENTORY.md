# PLAN_INVENTORY — Patient App Visual Redesign (Phase 0)

Дата инвентаризации: **2026-04-29**. Режим: readonly по коду в рабочем дереве; app-код не менялся.

## 0. Документы и ветка

- Прочитаны: `README.md`, `MASTER_PLAN.md`, `00_INVENTORY_PLAN.md` инициативы; `VISUAL_SYSTEM_SPEC.md` (полностью); `.cursor/rules` (clean-architecture, integration-in-db, runtime-config).
- **`docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md`** и **`CONTENT_PLAN.md`** в текущем дереве **отсутствуют** (файлы не найдены). Runtime-ограничения для EXEC брать из `VISUAL_SYSTEM_SPEC.md` + правил репозитория; редакционный ориентир `CONTENT_PLAN` — недоступен до восстановления файлов из ветки/archive.
- **`docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/references/`**: только `README.md`, **скриншотов нет** — Phase 3/4 по визуалу опираются на `VISUAL_SYSTEM_SPEC.md`.

## 1. Критическое расхождение: spec §4 vs фактический код

`VISUAL_SYSTEM_SPEC.md` §4 («Existing Code Mapping», колонка «Текущее состояние») описывает стек **после** patient home redesign: `PatientBottomNav`, `PatientHomeTodayLayout`, `patientHomeCardStyles.ts`, набор `PatientHome*Card.tsx` и расширенный `navigation.ts` с bottom items.

**В текущем дереве (baseline, выровненный под `main`): этого стека нет.**

Фактически:

- Главная `/app/patient` собирается в **`apps/webapp/src/app/app/patient/page.tsx`** из легаси-блоков: `PatientHomeBrowserHero`, ~~`PatientHomeLessonsSection`~~ *(файл удалён 2026-05-04; в инвентаризации 2026-04-29 ещё фигурировал в списке)*, `PatientHomeExtraBlocks`, `PatientHomeNewsSection`, `PatientHomeMailingsSection`, `PatientHomeMotivationSection`, миниапп-ветка `PatientMiniAppPatientHome` и т.д.
- **`PatientBottomNav.tsx`** — **файл отсутствует**; по репозиторию нет `PatientBottomNav`, `PATIENT_BOTTOM_NAV`, `patient-wide`.
- **`apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts`** — **отсутствует**.
- Компонентов вида **`PatientHomeToday*.tsx`**, **`PatientHomeGreeting.tsx`**, **`PatientHomeDailyWarmupCard.tsx`** и остальных из MASTER_PLAN Phase 3–4 — **нет**.

**Вывод:** Phase 3–5 планов инициативы и тестовый перечень из `VISUAL_SYSTEM_SPEC.md` §14 применимы **после** появления в коде соответствующих модулей (merge/port с линии `patient-home-redesign-initiative` или иной явной поставки кода главной «Сегодня»). До этого момента EXEC Phase 3/4 нужно **перепривязать** к фактическим компонентам главной или зафиксировать **пререквизит merge** в `LOG.md` перед стартом Phase 3.

## 2. Shell и layout (текущее)

| Артефакт | Файл | Наблюдение |
|----------|------|------------|
| Patient shell root | `apps/webapp/src/shared/ui/AppShell.tsx` | `id="app-shell-patient"`, `max-w-[480px]`, фон **`bg-[var(--patient-surface)]`** (сейчас совпадает с белым в `:root`). Нет `patient-wide` в этом файле. |
| Patient header gate | `PatientGatedHeader.tsx` | Тонкая обёртка над `PatientHeader`; скрывает шапку при `suppressPatientHeader` (телефон mini-app). |
| Patient header | `PatientHeader.tsx` | Sticky, `bg-[var(--patient-surface)]`. Слева: `Back` (если есть) + **иконка Home** → `/app/patient` (если не `hideHome`). Справа из **`patientNavByPlatform`**: на всех режимах **`["settings"]`** — ссылка на **`/app/settings`** (шестерёнка). Опционально sheet menu (`hasSheetMenu` сейчас false). |
| Bottom nav | — | **Отсутствует** как компонент и как разметка. |
| Layout обёртка | `PatientClientLayout.tsx` | Провайдеры телефона / mini-app; без nav. |
| Сессия layout | `layout.tsx` | Редиректы, гейт доступа; без UI-навигации. |

**Целевое поведение по инициативе (напоминание):** bottom nav `< lg`, top nav `lg+`, взаимоисключение; профиль справа; без отдельной шестерёнки в patient header; без desktop `Back` и без top `Home` на главной в целевой модели — всё это **Phase 2+**, не Phase 1.

## 3. Навигация и конфиг (`navigation.ts`)

Файл: **`apps/webapp/src/app-layer/routes/navigation.ts`**.

- **`patientNavByPlatform`**: `bot` / `mobile` / `desktop` — одинаково **`headerRightIcons: ["settings"]`**, `hasSheetMenu: false`, `showLogout: false`. **Нет** декларации bottom items, **нет** профиля вместо settings в header.
- **`HomeBlockId`** и списки **`patientHomeBlocksCanonical`**, **`patientHomeBlocksByPlatform`**, **`patientHomeBlocksForEntry`** — это **легаси-модель блоков главной** (`cabinet`, `materials`, `news`, …), а не пункты bottom nav из spec (`Сегодня`, `Запись`, …).

**Вывод Phase 2:** потребуется существенное **расширение** `navigation.ts` (и новые компоненты nav), а не точечная правка существующего bottom-nav конфига.

## 4. CSS: переменные и использования

### 4.1. `:root` в `apps/webapp/src/app/globals.css`

Определены (и по правилам инициативы **значения не трогаем** до отдельного migration pass):

- `--patient-bg`, `--patient-surface` (сейчас оба `#ffffff`)
- `--patient-radius` (12px), `--patient-radius-lg` (16px)
- `--patient-shadow`, `--patient-shadow-hover`
- `--patient-touch` (44px), `--patient-gap` (18px)

Новых семантических токенов из README (`--patient-page-bg`, `--patient-card-radius-mobile`, …) **пока нет** — их добавление = Phase 1.

### 4.2. `#app-shell-patient` и patient-scope

В `globals.css` **нет** блока `#app-shell-patient { … }`. Есть только `id="app-shell-patient"` в разметке `AppShell`. Phase 1 по плану должен ввести токены **в scope** `#app-shell-patient` (или эквивалент), не ломая `:root` для doctor/admin.

### 4.3. Usages `--patient-*` (grep по `apps/webapp`)

| Символ | Файлы |
|--------|--------|
| `--patient-surface` | `AppShell.tsx`, `PatientHeader.tsx` |
| `--patient-gap` | `AppShell.tsx`, `BookingWizardShell.tsx` |
| `--patient-bg` | `DiaryTabsClient.tsx` (градиент фона) |

Старые `--patient-radius` / `--patient-shadow` в TSX на этом срезе **не найдены** grep’ом по показанному набору; могут быть в других путях — перед миграцией стоит повторить полный поиск.

### 4.4. Утилиты

- **`safe-padding-patient`**, **`safe-bleed-x`**, **`patient-iframe-bleed`**, **`safe-fab-br`** — в `globals.css` `@layer utilities`. Комментарий у `safe-padding-patient` ссылается на запас под FAB, **не** на bottom nav (nav нет).

## 5. Кнопки

**`apps/webapp/src/components/ui/button-variants.ts`**: `default`, `primary`, `outline`, `secondary`, `ghost`, `destructive`, `link`; sizes `xs`–`lg`, `icon*`. Отдельного **success / appointment** варианта **нет** — потребуется либо безопасное расширение `cva`, либо patient-scoped helper (как в Phase 1 чеклисте).

## 6. Тесты (текущее покрытие)

### 6.1. Shell / header / navigation

| Файл | Есть? |
|------|--------|
| `AppShell.test.tsx` | **Нет** в репозитории |
| `PatientHeader.test.tsx` | **Да** — `apps/webapp/src/shared/ui/PatientHeader.test.tsx` (goBack, settings link, hideHome/hideRightIcons) |
| `PatientBottomNav.test.tsx` | **Нет** (компонента нет) |
| `navigation.test.ts` | **Да** — `apps/webapp/src/app-layer/routes/navigation.test.ts` (patientNavByPlatform, patientHomeBlocks*) |

### 6.2. Patient home (`app/app/patient/home/`)

**Нет** `*.test.tsx` / `*.test.ts` в `home/` — тесты из `VISUAL_SYSTEM_SPEC.md` §14.2 для `PatientHomeToday*`, карточек и т.д. **относятся к будущему коду**, не к текущему дереву.

### 6.3. Другие тесты под `app/patient` (не home cards)

Под `apps/webapp/src/app/app/patient` есть тесты booking/cabinet/diary/profile/… — **вне scope** визуального редизайна главной по MASTER_PLAN §4, но могут задеться только если меняются общие примитивы (осторожно в Phase 1 с `button-variants`).

## 7. Зависимости Phase 3 (timezone)

- **`getAppDisplayTimeZone()`** — `apps/webapp/src/modules/system-settings/appDisplayTimezone.ts`, async, читает `system_settings` через `getConfigValue` — **пригоден для Server Components**.
- **`PatientHomeGreeting.tsx`** в дереве **нет**; при появлении SSR-обёртки главной greeting должен получать tz с сервера (как в hardened плане инициативы).

## 8. High-risk файлы (blast radius)

| Риск | Файл / зона | Почему |
|------|-------------|--------|
| Высокий | `button-variants.ts` | Общий doctor/patient/admin; ошибка варианта = визуальные регрессии вне patient. |
| Высокий | `globals.css` | Глобальная тема Tailwind/shadcn; нарушение scope → побочный эффект на всё webapp. |
| Средний | `AppShell.tsx` | Все варианты shell; нужен smoke default/doctor (Phase 1). |
| Средний–высокий | `PatientHeader.tsx` + навигация Phase 2 | Много платформенных и UX-инвариантов; пересечение с mini-app, back, settings. |
| Высокий (Phase 2) | Новый `PatientBottomNav` + `PatientTopNav` + `navigation.ts` | Новая поверхность поведения, breakpoints, a11y, тесты взаимоисключения. |
| Высокий (Phase 3+) | Импорт/merge стека главной «Сегодня» | Пока файлов нет — риск планирования «в пустоту». |

## 9. Файловый и тестовый scope по фазам (уточнение под текущее дерево)

### Phase 1 — Foundation

**Целевые файлы (как в `01_FOUNDATION_PLAN.md`, с поправкой на отсутствующие):**

- `apps/webapp/src/app/globals.css` — новые токены под `#app-shell-patient`; legacy `--patient-*` в `:root` не удалять и значения не менять.
- `apps/webapp/src/shared/ui/AppShell.tsx` — **только** фон (и при необходимости тень страницы), **без** `max-w-*`.
- `apps/webapp/src/components/ui/button-variants.ts` — **опционально**, только безопасные добавления.
- **`apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts`** — **создать** при EXEC (сейчас отсутствует); либо `patientHomeVisual.ts` по плану — экспорт базовых классов без обязательного подключения ко всем легаси-блокам в той же задаче.
- **`apps/webapp/src/shared/ui/AppShell.test.tsx`** — **создать** (в плане указан; в репозитории нет).

**Не трогать в Phase 1:** `PatientHeader`, `PatientGatedHeader`, `navigation.ts`, max-width `AppShell`, отдельные страницы patient.

### Phase 2 — Navigation

- `navigation.ts` — расширение конфига (bottom + desktop top), профиль, убрать settings из patient header config.
- Новые: **`PatientBottomNav.tsx`**, **`PatientTopNav.tsx`** (или эквивалент).
- `PatientHeader.tsx`, `PatientGatedHeader.tsx`, `AppShell.tsx` (max-width 430 / wide 1120–1200, монтаж nav).
- Тесты: **новый** `PatientBottomNav.test.tsx`, расширить `PatientHeader.test.tsx`, **новый/расширенный** `AppShell.test.tsx`, при необходимости `navigation.test.ts`.

### Phase 3 — Home primary

По MASTER_PLAN: `PatientHomeTodayLayout`, `PatientHomeGreeting`, `PatientHomeDailyWarmupCard`, `PatientHomeBookingCard`, `PatientHomeSituationsRow` + тесты.

**Сейчас:** файлов нет — **либо** перенос кода главной с линии redesign **либо** пересмотр списка файлов под `page.tsx` + существующие `PatientHomeBrowserHero` / секции (вне текущего буквального MASTER_PLAN; требует продуктового решения).

### Phase 4 — Home secondary

Аналогично: перечисленные в MASTER_PLAN `PatientHome*` — **ожидают появления кода**.

### Phase 5 — QA / cleanup

- Все тесты, затронутые Phase 1–4; `LOG.md`; опционально `AUDIT_VISUAL_FINAL.md`.
- Лимиты MASTER_PLAN §8 (не раздувать scope).

## 10. Модельная эскалация (когда Codex 5.3 / GPT 5.5)

| Ситуация | Рекомендация |
|----------|----------------|
| Противоречие **VISUAL_SYSTEM_SPEC §4** («текущее состояние») и фактического репозитория при планировании merge | **GPT 5.5** — один проход для согласования карты файлов и обновления spec/README (без исполнения архивных PROMPT’ов). |
| Phase 2: сложный refactor nav + header + два nav + matchMedia / responsive тесты, два неудачных Composer-прохода | **Codex 5.3** (как в MASTER_PLAN §12). |
| Phase 5: противоречивые аудиты | **GPT 5.5** по явной политике инициативы. |
| Phase 1 | По умолчанию **Composer 2**; Codex — только при залипании на Tailwind v4 / `cva` / scope. |

## 11. GO / NO-GO для Phase 1

**GO** для старта **Phase 1 (Foundation)** с явными условиями:

1. EXEC Phase 1 **создаёт** отсутствующие артефакты из scope (`AppShell.test.tsx`, `patientHomeCardStyles.ts` или задокументированная альтернатива `patientHomeVisual.ts`), а не предполагает их наличие.
2. Не ожидать, что `patientHomeCardClass` уже импортируется существующими home-карточками легаси-главной — подключение к реальным блокам может отложиться до появления/merge стека «Сегодня» (зафиксировать в `LOG.md` при EXEC).
3. Phase 3+ **не стартовать**, пока не определён источник кода блоков главной (merge vs перепривязка планов).

**NO-GO** только в узком смысле: «выполнить Phase 1 ровно как правку существующего `patientHomeCardStyles.ts` без создания файлов» — **так нельзя**, файла нет.

## 12. Post-audit FIX (`AUDIT_PHASE_0.md` §2 — только mandatory)

Дата: **2026-04-29**. Режим: **FIX** по итогам `AUDIT_PHASE_0.md`; app-код не менялся; full CI не запускался.

- В **`AUDIT_PHASE_0.md` §2 (Mandatory fixes)** зафиксировано: **обязательных исправлений нет** — устранять по mandatory-блоку было нечего; содержимое разделов 1–11 `PLAN_INVENTORY.md` не пересматривалось и не расширялось по scope.

---

*Инвентаризация выполнена без изменений app-кода и без `pnpm run ci`.*
