# SCREEN ARCHITECTURE GUIDE — Therapysto / Therapygo

> ⚠️ **ЧАСТИЧНО УСТАРЕЛО (2026-07-11).** §«T4 — Просмотр объекта (entity card)» использует `ClientProfileCard`
> (карточка клиента) как «врач-эталон» и ссылается на вкладку «Обзор» — этой вкладки в карточке пациента больше
> нет. Актуально: [`docs/design/bersoncare-карточка-пациента-CURRENT-SPEC.md`](../design/bersoncare-карточка-пациента-CURRENT-SPEC.md)
> (4 вкладки Карточка/Программа/Файлы/Учётка, без «Обзор», без правого превью). Остальной документ (модель зон
> Z0–Z6, шаблоны T1–T3/T5–T12, реестр §8) супесессии не подвержен и остаётся в силе.

> Единый язык построения экранов. Следующий уровень над **Design DNA v1.0 + Amendment v1.1**.
> Design DNA отвечает на вопрос **«из чего»** (цвет, типографика, форма, поверхности, тень, движение) — источник:
> `docs/design/dna/` (`design-dna-v1.0-spec.html`, `design-dna-v1.1-amendment.md`, токены `bersoncare-theme.css` — Tailwind v4 `@theme`).
> Этот документ отвечает на вопрос **«как собрать экран»** — зоны, шаблоны страниц, правила композиции.
>
> **Статус:** база для проектирования всех новых экранов и последующей унификации существующих.
> **Дата:** 2026-07-11. **Основано на:** Design DNA v1.0+v1.1 + полный аудит 76 экранов кабинета врача + 49 экранов пациента + сквозных примитивов.
>
> **Приоритет источников (при расхождении):** Design DNA v1.0+v1.1 (визуальная идентичность) → `.cursor/rules/*.mdc` → `DOCTOR_APP_UI_STYLE_GUIDE.md` / `PATIENT_APP_UI_STYLE_GUIDE.md` → этот документ → код.
> Этот гайд **не отменяет** уже задокументированный канон, а сводит его в один язык и достраивает недостающее (кросс-зонную таксономию, модель зон, паттерны пациента, реестр расхождений).
>
> **Важно про токены:** Design DNA — это целевой визуальный слой (`bersoncare-theme.css`, Nunito, моно-синий `#386FBA`, кремовый холст `#F6F4EF`). Задеплоенные сейчас токены зон (`doctorVisual.ts` / `patientVisual.ts` / `tailwind-engine.css` / `doctor.css` / `globals.css`) — **текущая реализация**, которую предстоит выровнять под DNA. Этот структурный гайд к значениям токенов нейтрален: зоны/шаблоны/композиция не зависят от того, какой именно синий и шрифт подставлены.

---

## 0. Как читать этот документ

- **§1–§2** — картина мира: две зоны, единый язык, изоляция.
- **§3** — универсальная **модель зон** экрана (общая для врача и пациента).
- **§4** — **каталог шаблонов страниц** (T1–T12): из чего строится каждый тип экрана.
- **§5** — где именно живут **заголовок, действия, фильтры, поиск, навигация**.
- **§6** — **реестр обязательных к переиспользованию примитивов**.
- **§7** — **правила композиции, которые соблюдаются всегда** (инварианты).
- **§8** — **реестр нарушений консистентности** + единое решение по каждому.
- **§9** — чек-лист «новый экран за 10 шагов» и порядок унификации.
- **§10** — открытые решения, которые нужно закрыть владельцу.

Термины намеренно совпадают с уже существующими в коде и доках (master-detail, page-level section, entity card, semantic surface, tab shell, hero) — мы **не переименовываем** прижившееся.

---

## 1. Две зоны, один язык

Платформа — это два физически изолированных UI-мира с **общей грамматикой**, но разной оболочкой и
плотностью (кабинет специалиста — Therapysto, приложение пациента — Therapygo или бренд клиники):

|                                      | **Кабинет врача** (`#app-shell-doctor`)                                                                        | **Приложение пациента** (`#app-shell-patient`)                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Роль                                 | рабочий инструмент, плотный, информационный                                                                    | сопровождение лечения, мобильный PWA, тёплый                         |
| Оболочка                             | `DoctorWorkspaceShell` (сайдбар + контент на md+, фикс-шапка на &lt;md)                                        | `PatientAppShell` (верхняя chrome + нижний таб-бар)                  |
| Ширина контента                      | `max-w-7xl` (1280px)                                                                                           | `max-w-[430px]` (mobile) → `max-w-[1180px]` (md+)                    |
| Плотность                            | высокая: контролы 32px, глубина границами, без теней                                                           | средняя: карточки с тенью и радиусом, крупный тап-таргет 44px        |
| DNA (идентичность)                   | Общий целевой слой: `docs/design/dna/bersoncare-theme.css` (Nunito, `#386FBA`, `#F6F4EF`) — един для обеих зон | ← тот же DNA                                                         |
| Реализация токенов/классов (текущая) | `src/shared/ui/doctor/doctorVisual.ts` + `doctorWorkspaceLayout.ts`                                            | `src/shared/ui/patient/patientVisual.ts`                             |
| Токены                               | `src/app/styles/doctor.css`                                                                                    | `src/app/globals.css` (`--patient-*`)                                |
| Прозаический канон                   | `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md` (§A–§21, 1007 строк)                                          | `docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md` (тонкий, 90 строк) |

**Правило изоляции (жёсткое, ESLint `no-restricted-imports`, `patient-doctor-ui-isolation.mdc`):**

- Врачебный и пациентский UI **не импортируют друг друга**.
- Продуктовые роуты **не импортируют** `@/components/ui/**` напрямую — только через `*/primitives/`.
- CSS зон раздельны; общего `AppShell`-импорта в этих деревьях нет.

**Общий язык (то, что этот документ фиксирует как единое):** модель зон (§3), таксономия шаблонов (§4), места заголовка/действий/фильтров (§5), инварианты композиции (§7). Реализация этих правил в каждой зоне — своими примитивами.

---

## 2. Слои построения экрана

Любой экран собирается из четырёх слоёв. Нарушение слоёв = архитектурный долг.

```
┌─────────────────────────────────────────────────────────┐
│ 1. SHELL     — оболочка зоны (навигация, chrome, ширина) │  DoctorWorkspaceShell / PatientAppShell
│  ┌──────────────────────────────────────────────────┐   │
│  │ 2. TEMPLATE — шаблон страницы (T1–T12)            │   │  каталог, деталь, форма, календарь…
│  │  ┌───────────────────────────────────────────┐   │   │
│  │  │ 3. ZONE    — зоны страницы (§3)            │   │   │  header / toolbar / content / rail / action
│  │  │  ┌────────────────────────────────────┐   │   │   │
│  │  │  │ 4. PRIMITIVE — DNA-примитивы (§6)   │   │   │   │  Section, StatCard, MediaThumb, кнопки…
│  │  │  └────────────────────────────────────┘   │   │   │
│  │  └───────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

- **Slot-контракт `page.tsx`:** роут-файл (RSC) грузит данные и **всегда** монтирует оболочку зоны на своём уровне, передавая в неё `title` / `backHref` / слоты. Он **никогда** не перерисовывает заголовок/навигацию сам (см. §8, D1/P2/P3).
- Тонкий RSC-`page.tsx` → клиентский `*Client`/`*Body`: данные передаются промисами, читаются через `use()` внутри `Suspense`. Это правильная граница данные/представление (эталон: `sections/[slug]/page.tsx` → `PatientSectionPageBody`; `exercises/page.tsx` → `ExercisesPageClient`).

---

## 3. Модель зон экрана (универсальная)

Любой экран раскладывается на семь именованных зон. Не все присутствуют на каждом экране, но **порядок и назначение фиксированы**.

| #      | Зона                      | Назначение                                                             | Врач                                                                         | Пациент                                                            |
| ------ | ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Z0** | **Shell chrome**          | глобальная навигация, идентичность, профиль                            | сайдбар `DoctorAdminSidebar` (md+) / фикс-шапка `DoctorHeader` (&lt;md)      | верхняя `PatientShellTopChrome` + нижний `PatientPrimaryNavStrip`  |
| **Z1** | **Page header**           | заголовок страницы, подзаголовок, контекстные баннеры, вкладки раздела | `DoctorPageHeader` (sticky-якорь, слоты `title/subtitle/info/tabs/toolbar`)  | title-strip в потоке (`PatientShellPageTitleStrip`) + back-chevron |
| **Z2** | **Action zone**           | первичные действия страницы (Создать, Сохранить, Опубликовать)         | **см. §8 D4 — сейчас разнесено, канон: правый слот Z1 + sticky publish-bar** | full-width CTA внизу блока                                         |
| **Z3** | **Toolbar / filter zone** | поиск, фильтры, сортировка, переключение вида, период                  | sticky `DoctorCatalogFiltersToolbar` под Z1                                  | редко; фильтр-чипы в потоке                                        |
| **Z4** | **Primary content**       | основное содержимое (список / деталь / форма / сетка)                  | `#app-shell-content` (`flex flex-col gap-3`)                                 | `patientInnerPageStackClass` (`gap-3 md:gap-4`)                    |
| **Z5** | **Detail / rail**         | вторичная колонка master-detail или боковая панель                     | правая колонка `CatalogRightPane`                                            | обычно отдельный роут (не колонка)                                 |
| **Z6** | **Footer / status**       | легал-ссылки, статус загрузки, сноски                                  | редко                                                                        | `LegalFooterLinks`                                                 |

**Ключевой факт о врачебной шапке (canon, `doctorWorkspaceLayout.ts`):** на desktop (md+) глобальной верхней шапки **нет** — роль «липкого якоря» страницы выполняет **per-page `DoctorPageHeader`**. Он сам измеряет свою высоту в `--doctor-page-header-h`, которая становится `--doctor-sticky-offset`, и под неё липнут тулбары Z3. Это уже правильно спроектировано и должно быть на **каждом** врачебном экране (сейчас каталоги его опускают — §8 D1).

**Ключевой факт о пациентской шапке:** заголовок и back живут в оболочке (`PatientAppShell`), а **не** в странице. Страница передаёт `title` / `backHref` / слоты. Пациентские слоты расширения: `patientMobileHeaderSlot`, `patientShellAboveTitleSlot`, `patientShellTitleSlot`, `patientSuppressShellTitle`.

---

## 4. Каталог шаблонов страниц (Page Templates)

Двенадцать архетипов покрывают весь продукт. Для каждого — назначение, зоны, эталон, скелет, обязательные примитивы.

### T1 — Dashboard / «Сегодня»

Стартовый экран роли: сводка + сигналы + быстрые входы.

- **Зоны:** Z1 (title) → Z4 (KPI-сетка + стек секций).
- **Врач:** `doctor/page.tsx` → `DoctorTodayDashboard.tsx`; KPI-строки `DoctorTodayLeftKpiRow`/`RightKpiRow`, мини-календарь, сигналы, глобальные задачи.
- **Пациент:** `patient/page.tsx` → `home/PatientHomeToday.tsx`; hero-карточки, лента блоков.
- **Скелет:**
  ```
  Z1 DoctorPageHeader title="Сегодня"
  Z4 doctorStatCardGridClass  ← KPI stat cards (кликабельны → KpiPreviewModal)
     DoctorSection …           ← стек page-level секций
  ```
- **Обязательно:** `doctorStatCardGridClass`, `DoctorSection`, `KpiPreviewModal` (врач) / `FeatureCard`, semantic surfaces (пациент). Главная пациента — единственное место с hero-геометрией (`patientHomeCardStyles.ts`), она **home-only** и не переносится на внутренние страницы.

### T2 — Простой список / таблица (без деталь-колонки)

Плоский перечень, клик уводит на отдельный роут детали.

- **Зоны:** Z1 → Z3 (sticky toolbar: поиск+добавить) → Z4 (список карточек-ссылок).
- **Врач:** `references/[categoryCode]/ReferenceItemsTableClient.tsx`, `audit-log/`, `content/library/`; клиентский список клиентов (`clients` — строки-ссылки на `/clients/[userId]`).
- **Пациент:** `courses/`, `help/`, `lessons/`, `sections/[slug]`.
- **Скелет:** `Z1 → DoctorCatalogStickyToolbar (поиск + Z2 «Добавить») → ul[ карточки-ссылки ]`.
- **Обязательно:** `FeatureCard` (пациент) / карточки-ссылки на `doctorSectionItemClass`; `DoctorEmptyState`.

### T3 — Каталог master-detail (список + деталь в одной колонке) ⭐ ЭТАЛОН

Самый зрелый и самый частый рабочий паттерн кабинета.

- **Зоны:** Z1 → Z3 (sticky filters) → Z4 (**master** список слева) + Z5 (**detail** справа).
- **Врач-эталон:** `exercises/ExercisesPageClient.tsx`. Идентично: `clinical-tests`, `recommendations`, `lfk-templates`, `test-sets`, `treatment-program-templates`.
- **Стек компонентов (canon):**
  ```
  DoctorCatalogPageLayout               (flex gap-3, slot toolbar)
    └ DoctorCatalogFiltersToolbar       (sticky Z3: start=фильтры, end=Z2 «Создать»)
    └ CatalogSplitLayout                (движок master-detail; lg=grid, mobile=slide-панели)
        ├ CatalogLeftPane               (bg-card border; headerSlot + скролл-тело)
        │   └ DoctorCatalogMasterListHeader   (сорт + scope + счётчик + переключатель список/плитки)
        │       ├ list-mode  → ul(doctorCatalogRowClass)          contentVisibility:auto
        │       └ tile-mode  → VirtualizedItemGrid(ExerciseTileCard)
        └ CatalogRightPane              (плоский bg-card, БЕЗ второй рамки; хостит форму детали)
            └ <форма редактирования>    (см. T5)
  ```
- **Данные:** сервер отдаёт один `listPromise` + `selectionPromise`; фильтрация/сортировка/поиск — **клиентские** (`useDoctorCatalogDisplayList`), URL синхронизируется императивно (`history.replaceState` + событие `doctorcatalog:urlsync`), без полной навигации. Вид (список/плитки) — `localStorage` (`doctorCatalogViewPreference`).
- **Мобайл:** одна вьюпорт-колонка, `list`↔`detail` слайдом (`translate-x`), `mobileBackSlot` «← Назад».
- **Обязательно:** весь стек `CatalogSplitLayout`/`CatalogLeftPane`/`CatalogRightPane`/`DoctorCatalogFiltersToolbar`/`DoctorCatalogMasterListHeader`. Новый каталог = **копия** этого стека (`doctor-ui-shared-primitives.mdc`).

### T4 — Просмотр объекта (entity card)

Карточка сущности с фиксированной шапкой и вкладками.

- **Зоны:** Z1 (entity header) → Z2 (action-strip) → Z3 (вкладки) → Z4 (контент вкладки).
- **Врач-эталон:** `ClientProfileCard` (карточка клиента `clients/[userId]`), chrome в `doctorClientCardChrome.ts`. Структура: `PatientCareBar` (sticky entity-header) → `PatientActionStrip` (чипы быстрых действий, только если есть attention-чипы) → `TabsList variant="line"` → `TabsContent`. Обзор = 2-колоночная сетка панелей уровня-2.
- **Пациент:** деталь программы `treatment/[instanceId]` (in-body табы, hero + этапы-коллапсы); деталь контента `content/[slug]`.
- **Модель карточек (canon §4 doctor guide):** уровень-1 = page-level section `rounded-xl border bg-card p-3`, **без тени**; уровень-2 = панель внутри карточки `rounded-xl … p-4 shadow-sm`. Не вкладывать более двух уровней рамок.
- **Обязательно:** для объект-детали **обязателен `DoctorPageHeader`** как единый якорь заголовка (сейчас деталь использует свой `MembershipCardHeader` — §8 D7). Вкладки — в слот `tabs` Z1, с lazy-mount.

### T5 — Создание / редактирование (форма)

- **Зоны:** Z1 → Z4 (секции полей) → Z2 (sticky publish-bar).
- **Два подтипа:**
  - **split-detail edit** (доминанта): форма живёт в `CatalogRightPane` каталога (эталон `ExerciseForm.tsx`).
  - **standalone editor**: отдельный роут `.../new` и `.../[id]` — одна `<section className={doctorCatalogEditorSectionClass}>` с формой.
- **Раскладка формы (canon §13):** `flex flex-col gap-4 px-4 py-4`, стеки `Label`+`Input`, контролы `h-8` `rounded-md`. Группировка — через `DoctorSection`/`DoctorSectionHeader`.
- **Сохранение (canon):** `DoctorCatalogPersistPublishBar` — единый двухкнопочный футер (Save/Persist + Publish) с централизованной disabled-логикой. Формы на React 19 `useActionState` + серверные экшены.
- **Дата/время:** только `DoctorDateTimePicker`/`DoctorDatePicker` + `DoctorTimeColumn`.
- **Пациент-формы:** стек `<section className={patientSectionSurfaceClass}>` + `patientSectionTitleClass`; `InlineEditField`; CTA — `patientButtonPrimaryClass` full-width. Конструктор программы (`InstanceEditorToolbar`) — отдельный подтип с кастомной 3-зонной sticky-шапкой (breadcrumb / comments / actions), переходящей в amber при несохранённом.
- **Обязательно:** `DoctorCatalogPersistPublishBar`, `ReferenceSelect`/`ReferenceMultiSelect`/`CreatableComboboxInput`, дата-стек. Действие сохранения — **не** inline-кнопка в произвольном месте (§8 D4).

### T6 — Календарь / расписание

- **Зоны:** Z1 (title + вкладки) → Z3 (sticky: дата/период/вид) → Z4 (сетка календаря) + Z5 (панель события).
- **Врач:** `schedule/DoctorScheduleShell.tsx` (табы Calendar/Work/Setup/Notifications, full-height) → `ScheduleCalendarTab.tsx` на **FullCalendar** (dayGrid/timeGrid/luxon, ru). Виды: `day`→timeGridDay, `weekgrid`→timeGridWeek, `month`→dayGridMonth, `3days`→кастом, `list`. `headerToolbar={false}` — навигация/вид кастомные. События из `/api/doctor/booking-engine`, типы `modules/booking-calendar/types.ts`, окно 9:00–19:00. Sticky-тулбар переиспользует `DOCTOR_CATALOG_STICKY_BAR_CLASS`. Панели события: `DoctorCalendarEventPanel`, `DoctorCalendarRescheduleDialog`.
- **Мини-календарь дашборда:** `DoctorTodayMiniCalendar` / `TodayMiniCalendarWithModal`.
- **Обязательно:** FullCalendar как единый движок; `DoctorTimeColumn` как единая тайм-колонка (используется и в пикере, и в календаре); KPI-строка расписания скрывается в режиме `day`.
- **Пробел канона:** нет прозаического описания структуры календарного экрана (виды/чипы) — §10.

### T7 — Аналитика

- **Зоны:** Z1 (title + таб-кнопки) → Z3 (период) → Z4 (KPI-сетки + графики).
- **Врач:** `analytics/DoctorAnalyticsShell.tsx`, `stats`, `usage`, `analytics/clients`, `analytics/notifications`. Таб-кнопки в слоте `tabs` Z1, lazy-mount вкладок.
- **KPI:** `DoctorMetricList` (обёртка над `doctorStatCardGridClass`) + `DoctorStatCard`; метрика `doctorMetricValueClass` (`text-2xl tabular-nums`). Клик по карточке → `KpiPreviewModal` (generic list-modal). Строки KPI — `AppointmentKpiItem` (общий для дашборда и расписания).
- **Графики (canon §7):** recharts в `Card` с фиксированными параметрами (ось fontSize 10, bar radius `[3,3,0,0]`, высоты 160/240), тултип только `AppRechartsTooltip`. Есть и чистый SVG (`ExerciseMicroChart`, `ExerciseExecutionGraph`) — §8 X6.
- **Инвариант:** KPI-сетку нельзя мешать в один `gap`-поток с page-level секциями без разделителя (canon §6).
- **Обязательно:** `DoctorMetricList` + `DoctorStatCard` (после промоушена в shared — §8 X5), `KpiPreviewModal`, `AppRechartsTooltip`.

### T8 — Видео / медиа

- **Превью/миниатюры (жёсткий инвариант, `MEDIA_PREVIEW_FRONTEND.md`):** только через `MediaThumb` + `MediaPreviewUiModel`; URL превью только через `mediaPreviewUrls.ts`. **Запрещено** `<img src={item.url}>` в списках/сетках/пикерах и клиентское «прощупывание» оригиналов. Лайтбокс — только превью, не оригинал. Проверяется `scripts/check-media-preview-invariants.sh`.
- **Полное воспроизведение:** единый плеер — врач `DoctorMediaPlaybackVideo` / пациент `PatientMediaPlaybackVideo`. HLS (`hls.js`) + MP4-fallback, источник только из `GET /api/media/[id]/playback`, формат решает сервер, пользователь его **не переключает**. Рендер через `NoContextMenuVideo`.
- **Медиа-сетка контента (врач):** `content/library/MediaCard.tsx` в `doctorMediaCardGridClass`; это **единственное** место, где оправдан `shadow-sm` (плавающие карточки без контейнера-секции, canon §11).
- **Пациент:** превью в списках/эскизах — **только статичная картинка** (`patient-ui-shared-primitives.mdc`), без `<video>` и без иконки-плёнки. Внешнее видео (YouTube/RuTube) — iframe через `toYoutubeOrRutubeEmbedSrc`; файловое — плеер.
- **Пикеры медиа (CMS):** единый `MediaPickerShell` + `MediaPickerPanel`, различия — пропсами, не копиями разметки (`cms-unified-media-picker-layout.mdc`).

### T9 — Чат / сообщения

- **Зоны:** Z1 → Z4 (лента/переписка) — обычно full-bleed или full-height.
- **Врач:** `communications/DoctorCommunicationsShell.tsx` (табы chats/intake/comments/broadcasts, full-height), `messages/DoctorSupportInbox.tsx` — master-detail (список тредов ↔ переписка) на `CatalogSplitLayout`.
- **Пациент:** `messages`, `support`, `notifications` — единый `ChatView variant="patient"` из `modules/messaging`.
- **§8 P6:** пациентский `ChatView` подаётся то full-bleed (`messages`), то завёрнутым в карточку (`notifications`) — унифицировать.

### T10 — Мастер / визард (пошаговый сценарий)

- **Врач:** `exercises/auto-create`, `booking-merge`, `clients/name-match-hints` — сейчас ad-hoc, без общего визард-примитива.
- **Пациент:** запись `booking` (+ `city/service/slot/confirm/done`) через `BookingWizardShell` — «Шаг N из M» + back-ссылка поверх `PatientAppShell`.
- **§8 P2:** `BookingWizardShell` дублирует title/back оболочки — привести к слот-контракту.
- **Пробел:** нет единого визард-примитива (степпер, прогресс, назад/далее) — §10.

### T11 — Настройки / администрирование

- **Зоны:** Z1 → Z4 (стек `DoctorSection` / сетки карточек настроек).
- **Врач:** `admin/app-settings`, `admin/auth`, `admin/technical`, `admin/integrations`, `system-health`. `admin/booking/*` — вложенный sub-nav layout, сетки `BOOKING_CARD_GRID_CLASS`.
- **Пациент:** `profile`, `notifications/settings`, `address`, `reminders`, `intake/*`.
- **Замечание канона:** `admin/booking/**` и standalone-admin формы **вне** унифицированного каталог-канона (свои инициативы) — гайд на них не претендует.

### T12 — Инфо / легал / пустые / гостевые состояния

- **Инфо/легал:** `about`, `install`, `cabinet`, `legal/*` — стек `patientSectionSurfaceClass` + inline-ссылки + `LegalFooterLinks`.
- **Пустое состояние:** `DoctorEmptyState` (`sm`/`xs`) / `patientEmptyStateClass`. **Не** inline-строки классов (§8 X8).
- **Гость/гейт:** пациент — `GuestPlaceholder` / `DiarySectionGuestAccess`; §8 P7 — сейчас непоследовательно (то голый `<p>`, то компонент).
- **Ошибка загрузки:** `DataLoadFailureNotice` (`role="alert"` + digest-код для поддержки).

---

## 5. Где что располагается (сводная карта)

Единые правила размещения. **«Канон»** = целевое правило (может отличаться от текущей реализации — тогда см. §8).

| Элемент                                    | Врач — канон                                                                                             | Пациент — канон                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Заголовок страницы**                     | `DoctorPageHeader.title` (`<h1>` `text-base font-semibold`), sticky-якорь. Обязателен на КАЖДОМ экране.  | `PatientAppShell title` → title-strip в потоке. Страница не рисует свой `<h1>`.                          |
| **Подзаголовок**                           | `DoctorPageHeader.subtitle` (`text-xs muted`)                                                            | `patientPageSubtitleClass` под title                                                                     |
| **Назад**                                  | контекстно (мобильная `DoctorHeader` / `mobileBackSlot` каталога)                                        | back-chevron оболочки (`backHref`/`backLabel`), history-goBack с fallback                                |
| **Первичное действие** (Создать/Сохранить) | **правый слот Z1** (см. §8 D4: ввести `actions`-слот) + для форм sticky `DoctorCatalogPersistPublishBar` | full-width `patientButtonPrimaryClass` внизу блока/формы                                                 |
| **Вкладки раздела**                        | `DoctorPageHeader.tabs` (правый слот), lazy-mount                                                        | in-body табы (напр. программа)                                                                           |
| **Поиск**                                  | `DoctorCatalogFiltersForm` (debounce 350ms) в sticky Z3; в модалках — `PickerSearchField`                | фильтр-чипы/inline                                                                                       |
| **Фильтры**                                | `DoctorCatalogToolbarFiltersSlot` в sticky Z3 (start-сторона)                                            | inline                                                                                                   |
| **Сортировка / вид / scope**               | `DoctorCatalogMasterListHeader` (в шапке master-списка Z4), НЕ в Z3                                      | —                                                                                                        |
| **Период (аналитика/календарь)**           | sticky Z3 под Z1                                                                                         | —                                                                                                        |
| **Глобальная навигация**                   | `DoctorAdminSidebar` (md+) / гамбургер-`Sheet` (&lt;md); source `doctorNavLinks.ts`                      | `PatientPrimaryNavStrip` (нижний таб-бар mobile / inline desktop): Сегодня/Упражнения/Дневник/Запись/Чат |
| **Легал / футер**                          | редко                                                                                                    | `LegalFooterLinks` внизу контента                                                                        |

---

## 6. Реестр обязательных к переиспользованию примитивов

Перед созданием любого нового UI — проверить этот реестр (правило reuse-first, `doctor-ui-shared-primitives.mdc` / `patient-ui-shared-primitives.mdc`, оба `alwaysApply`). Одноразовые локальные карточки/шапки/бейджи/пустые-состояния при наличии shared-варианта **запрещены**.

### Кабинет врача

| Задача                            | Примитив                                                                                  | Путь                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Оболочка страницы                 | `DoctorAppShell` (`default`/`full-height`)                                                | `shared/ui/doctor/DoctorAppShell.tsx`                 |
| Шапка страницы                    | `DoctorPageHeader`                                                                        | `shared/ui/doctor/shell/DoctorPageHeader.tsx`         |
| Page-level секция                 | `DoctorSection` / `DoctorSectionHeader` / `DoctorSectionTitle`                            | `shared/ui/doctor/DoctorSection.tsx`                  |
| Master-detail                     | `CatalogSplitLayout` + `CatalogLeftPane` + `CatalogRightPane` + `DoctorCatalogPageLayout` | `shared/ui/doctor/catalog/*`                          |
| Тулбар фильтров                   | `DoctorCatalogFiltersToolbar` + `DoctorCatalogFiltersForm`                                | `shared/ui/doctor/*`                                  |
| Шапка списка                      | `DoctorCatalogMasterListHeader`                                                           | `shared/ui/doctor/DoctorCatalogMasterListHeader.tsx`  |
| Save/Publish                      | `DoctorCatalogPersistPublishBar`                                                          | `shared/ui/doctor/DoctorCatalogPersistPublishBar.tsx` |
| Reference-инпуты                  | `ReferenceSelect` / `ReferenceMultiSelect` / `CreatableComboboxInput`                     | `shared/ui/doctor/*`                                  |
| Дата/время                        | `DoctorDateTimePicker` / `DoctorDatePicker` / `DoctorTimeColumn`                          | `shared/ui/doctor/*`                                  |
| Модалка (адаптивная dialog↔sheet) | `DoctorModal`                                                                             | `shared/ui/doctor/DoctorModal.tsx`                    |
| KPI drill-down                    | `KpiPreviewModal` + `AppointmentKpiItem`                                                  | `shared/ui/doctor/*`                                  |
| KPI-сетка / карточка              | `DoctorMetricList` + `DoctorStatCard`¹                                                    | `shared/ui/doctor/*`                                  |
| Миниатюры / плеер                 | `MediaThumb` + `MediaPreviewUiModel` / `DoctorMediaPlaybackVideo`                         | `shared/ui/doctor/media/*`                            |
| Пустое / ошибка                   | `DoctorEmptyState` / `DataLoadFailureNotice`                                              | `shared/ui/doctor/*`                                  |
| Токены зон/визуала                | `doctorWorkspaceLayout.ts` + `doctorVisual.ts`                                            | `shared/ui/doctor/*`                                  |

¹ `DoctorStatCard` сейчас page-local — промоутировать в shared (§8 X5).

### Приложение пациента

| Задача                | Примитив                                                                                                          | Путь                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Оболочка              | `PatientAppShell` (+ слоты)                                                                                       | `shared/ui/patient/PatientAppShell.tsx`           |
| Карточки/поверхности  | `patientCardClass`, `patientSectionSurfaceClass`, `patientFormSurfaceClass`, `patientListItemClass`               | `patientVisual.ts`                                |
| Semantic surfaces     | `patientSurfaceNeutral/Info/Success/Warning/DangerClass`                                                          | `patientVisual.ts`                                |
| Карточка списка/сетки | `FeatureCard`                                                                                                     | `shared/ui/patient/FeatureCard.tsx`               |
| CTA                   | `patientButtonPrimary/Success/Secondary/DangerOutline…Class`                                                      | `patientVisual.ts`                                |
| Модалка               | `PatientModalDialogContent`                                                                                       | `shared/ui/patient/PatientModalDialogContent.tsx` |
| Коллапсы              | `patientRecommendationCollapsible*` / `patientStageGoalsCollapsible*`                                             | `patientVisual.ts`                                |
| Загрузка              | `PatientLoadingShimmer` (4 паттерна: `gridCards`/`heroList`/`formRows`/`cardBlocks`) + `PatientRouteLoadingShell` | `shared/ui/patient/PatientLoadingShimmer.tsx`     |
| Пусто/гость           | `patientEmptyStateClass` / `GuestPlaceholder`                                                                     | `shared/ui/patient/*`                             |
| Плеер                 | `PatientMediaPlaybackVideo`                                                                                       | `shared/ui/patient/media/*`                       |
| Раскладка страницы    | `patientInnerPageStackClass`, `patientInnerCardGridClass`, `patientPageHeaderClass`                               | `patientVisual.ts`                                |

На мобильном viewport любая модалка открывается от нижнего края на фиксированную высоту
`calc(100dvh - 3.5rem)`: оставляет 56 px сверху, держит контент у верхнего края и прокручивает переполнение
внутри. Контракт задают общие `DialogContent` и нижний `SheetContent`; боковые панели навигации к нему не относятся.

---

## 7. Правила композиции, которые соблюдаются всегда (инварианты)

1. **Slot-контракт оболочки.** `page.tsx` монтирует `DoctorAppShell`/`PatientAppShell` на своём уровне и передаёт `title`/`backHref`/слоты. Страница **никогда** не перерисовывает заголовок/навигацию сама.
2. **Один заголовок на экран.** У врача — `DoctorPageHeader` (обязателен везде, включая каталоги и деталь). У пациента — заголовок оболочки. Двойной источник запрещён (§8 D1/P3).
3. **Reuse-first.** Сначала DNA-примитив (§6), потом shadcn/base-ui `primitives/*`, и только при явной продуктовой причине — кастом, зафиксированный в логе инициативы. Новых npm UI-зависимостей не добавляем.
4. **Изоляция зон.** Никаких кросс-импортов patient↔doctor и прямых `@/components/ui/**` из роутов.
5. **Глубина — границами, не тенями** (врач). `shadow-*` только на плавающих элементах (медиа-карточки, модалки). `rounded-2xl`/`space-y-6`/`gap-6` в врачебной зоне запрещены — плотность не откатываем.
6. **Две ступени карточек.** Уровень-1 (page-level section, без тени) → уровень-2 (панель внутри, `shadow-sm`). Глубже не вкладываем.
7. **Закрытая типографика/шкала.** Только заданный набор размеров (page 16 / section·body 14 / meta 12 / KPI 24; micro 10–11 лишь для бейджей/ячеек/осей). Голый `<h2>/<h3>` без класса запрещён.
8. **Медиа-инварианты.** Превью — только `MediaThumb`/preview-URL; воспроизведение — только единый плеер через `/playback`; пациентские превью — статичная картинка.
9. **KPI ≠ секции в одном потоке.** KPI-сетку отделять от page-level секций разделителем.
10. **Дисциплина копирайта** (`ui-copy-no-excess-labels.mdc`). Без лишних заголовков секций, вводных абзацев, декоративных подзаголовков, если спека их не требует.
11. **Select с непрозрачным value** обязан иметь `displayLabel`/`items`/явный `SelectValue` (`ui-select-trigger-display-label.mdc`).
12. **Данные через промисы + `Suspense`/`use()`**; фильтры — вне Suspense; клиентская фильтрация без полной навигации (URL через `replaceState`).
13. **Единый скелет на архетип.** Каждое async-тело — на named-паттерн шиммера, совпадающий с реальной раскладкой; скелет не дублируется (§8 X9/D5).
14. **Мобайл master-detail — слайд-панели**, не модалка; десктоп-деталь — правая колонка `CatalogRightPane` без второй рамки.

### Инварианты, наследуемые из Design DNA (визуальная композиция)

Эти правила задаёт Design DNA v1.0+v1.1; здесь они закреплены как обязательные при сборке экрана (полная спека — `docs/design/dna/`).

15. **Списки — плоские строки.** Строка = волосяная линия во всю ширину, слева сразу имя/текст, без аватаров и бейджей-пилюль на строке. Пилюли (`rounded-full`) на строках списка **запрещены** (DNA §7.1 / v1.1 §2).
16. **Состояние — структурой, а не заливкой.** Выделение/активность = полоска-акцент 3px слева заподлицо + вес текста 600 (акцентным синим), а не цветной фон строки (DNA принцип 3, §7.3).
17. **Цвет — точечно, не крупными заливками.** Акцент — насыщенная деталь или мелкий тон (бейдж, обводка). Крупные бледные/цветные заливки запрещены (DNA принцип 2, §3.2). Функциональные цвета (внимание/ошибка/успех) — приглушённые, точечно.
18. **«Тихие» статусы.** Статус = цветная полоска слева + маленький маркер + цветной заголовок, без крупной цветной плашки (DNA §7.11).
19. **Тепло в основе, лёгкий вес по умолчанию.** Фон тёплый/белый (холодные голубоватые фоны запрещены), текст — графит, не чёрный. Заголовки 600 (потолок 700), body 400 — жирнее по умолчанию не идём (DNA принципы 4–5, §5, v1.1 §1 Nunito).
20. **Pill — только для кнопок и поля поиска** (`rounded-full`), не для карточек/панелей/строк. Карточки — верх шкалы `radius-lg 14`; поля ввода `radius-sm 8` (DNA v1.1 §2).
21. **Vibrancy-материал** (v1.1 §3): полупрозрачные тулбары/оверлеи с blur — **нейтральный** материал (`.bc-vibrancy`), не цветная заливка. Уже согласуется с `backdrop-blur` sticky-шапок (`DoctorPageHeader`).
22. **Движение — сдержанное:** 150–200мс, ease-out, ничего пружинящего; уважать `prefers-reduced-motion` (DNA §7 движение).
23. **Light-first.** Тёмная тема — вторичная опция на будущее, не проектируем экран «тёмным по умолчанию» (DNA §10.5 / §9).
24. **Guardrail:** мягкий / округлый / полупрозрачный — да; детский / пастельный / wellness / техно-холодный / казённо-медицинский — нет (DNA §9.2 / v1.1 §4).

---

## 8. Реестр нарушений консистентности + единое решение

Приоритет: **P0** — ломает единый язык, править первым; **P1** — заметное расхождение; **P2** — косметика/долг. Находки не автофиксить — это триаж-лист для планирования (`dont-autofix-acceptance-findings`).

> Реестр сведён из двух независимых аудитов (кабинет + пациент + сквозные примитивы); совпадающие находки взаимно подтверждены. Записи `X11`, `P9–P11` добавлены вторым аудитом.

### Кабинет врача

| ID           | Нарушение                                                                                                                                                                                                                           | Где                                                                                                                              | Приор. | Единое решение                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**       | Двойной источник заголовка: часть страниц ставят и `DoctorAppShell title`, и `DoctorPageHeader title`; каталоги (`exercises`) `DoctorPageHeader` **опускают** → на desktop у exercises нет видимой шапки, у recommendations — есть. | `recommendations/page.tsx:77`, `courses/page.tsx:73`, `exercises/page.tsx:68` (нет header), `ExercisesPageClient.tsx` (0 header) | **P0** | `DoctorPageHeader` — обязателен на **каждом** роуте, включая каталоги и деталь. `DoctorAppShell title` остаётся источником для мобильной шапки/a11y, но видимый desktop-заголовок всегда даёт `DoctorPageHeader`. |
| **D2**       | Шапка рендерится то в server `page.tsx`, то в client-shell — разное владение, из-за чего табы/действия доступны не везде.                                                                                                           | server: recommendations/courses/content-library; client: analytics/schedule/communications                                       | **P1** | Канон: `DoctorPageHeader` рендерит **клиентская** shell-обёртка страницы, если нужны интерактивные табы/действия; иначе — server page. Слоты (`tabs`,`info`,`actions`) — единый контракт.                         |
| **D4**       | Первичное действие в трёх местах: каталог — верх-право шапки списка; форма — inline внизу (`ExerciseForm.tsx:358`); справочник — футер списка (`ReferenceItemsTableClient.tsx:561`).                                                | там же                                                                                                                           | **P0** | Ввести в `DoctorPageHeader` явный **`actions`-слот** (верх-право Z1) для «Создать/первичное действие». Save/Publish форм — всегда `DoctorCatalogPersistPublishBar`. Убрать произвольные inline-кнопки.            |
| **D7**       | Объект-деталь без стандартной шапки: `patients/[userId]` использует `MembershipCardHeader`, нет `DoctorPageHeader`.                                                                                                                 | `patients/[userId]/page.tsx`                                                                                                     | **P1** | Обернуть entity-header в `DoctorPageHeader` (title=имя, tabs=вкладки карточки), `MembershipCardHeader` — как контент внутри, не как замена якоря.                                                                 |
| **X1**       | Два варианта шапки списка (`DoctorCatalogMasterListHeader` c переключателем вида vs `DoctorCatalogListSortHeader` без него) и два контрола статуса (`DoctorCatalogArchiveScopeSelect` одна ось vs `CatalogStatusFilters` две оси).  | `shared/ui/doctor/*`                                                                                                             | **P1** | Свести к одному `DoctorCatalogMasterListHeader` с опциональным переключателем; статус — единый `CatalogStatusFilters` (две оси arch×pub), одноосевой — его частный режим.                                         |
| **X2 / X10** | Контент-хаб — третий, дивергентный стиль каталога (сайдбар + inline-редактор `useInlineContentEditor`), не `CatalogSplitLayout`; выбор грузится иначе, чем promise-based у exercises.                                               | `content/ContentHubShell.tsx`, `ContentEditorRightPane.tsx`                                                                      | **P1** | Мигрировать контент-хаб на канонический стек T3 (`CatalogSplitLayout` + promise-selection), либо явно задокументировать как исключение с причиной.                                                                |
| **X3**       | Два разных поисковых поля: каталожный `Input` в `DoctorCatalogFiltersForm` vs `PickerSearchField` в модалках.                                                                                                                       | `shared/ui/doctor/*`                                                                                                             | **P2** | Выделить один `DoctorSearchField` (label+Input+debounce+clear), использовать в обоих контекстах.                                                                                                                  |
| **X4**       | Ширины фильтров захардкожены inline (`w-40`,`w-[128px]`,`w-[148px]`) вместо `DOCTOR_CATALOG_TOOLBAR_FILTER_WRAP_CLASS`.                                                                                                             | разные select-ы каталога                                                                                                         | **P2** | Все фильтр-контролы — через общий width-константу из `doctorCatalogToolbarFilterClasses.ts`.                                                                                                                      |
| **X5**       | `DoctorStatCard` — page-local (`analytics/clients/DoctorStatCard.tsx`), хотя классы shared и он переиспользуется в расписании.                                                                                                      | там же                                                                                                                           | **P1** | Промоутировать `DoctorStatCard` в `shared/ui/doctor/`.                                                                                                                                                            |
| **X6**       | Сосуществуют recharts и рукописный SVG (`ExerciseMicroChart`, `ExerciseExecutionGraph`) без общего chart-примитива.                                                                                                                 | `shared/ui/doctor/*`                                                                                                             | **P2** | Выбрать recharts как базу для стандартных графиков; SVG-микрочарты оставить как явный «спарклайн»-класс с задокументированной причиной.                                                                           |
| **X7**       | Часть редакторов открывает сырой `Dialog` вместо `DoctorModal` (напр. медиа-субдиалог в `ExerciseForm`).                                                                                                                            | `ExerciseForm.tsx`                                                                                                               | **P2** | Все модалки — через `DoctorModal` (адаптив dialog↔sheet).                                                                                                                                                         |
| **X8**       | Пустые состояния каталога — inline-строки `doctorCatalogListEmptyClass` вместо компонента `DoctorEmptyState`.                                                                                                                       | каталоги                                                                                                                         | **P2** | Заменить на `DoctorEmptyState`.                                                                                                                                                                                   |
| **D5 / X9**  | Скелет загрузки: route-level `loading.tsx` только у exercises; у остальных — inline Suspense или ничего; сам скелет дублируется (route-файл + inline `CatalogSplitLayoutSkeleton`).                                                 | `exercises/loading.tsx` + `ExercisesPageClient.tsx`                                                                              | **P1** | Один экспортируемый `CatalogSplitLayoutSkeleton`, переиспользуемый и в `loading.tsx`, и в Suspense-fallback. Каждый каталог получает `loading.tsx`.                                                               |
| **D6**       | `full-height` — ручной opt-in у 3 роутов; прочие внутренне-скроллящиеся списки полагаются на высотную математику `CatalogSplitLayout`.                                                                                              | patients/communications/schedule vs messages/online-intake                                                                       | **P2** | Задокументировать: `full-height` — для страниц с внутренним скролл-паном; `CatalogSplitLayout` уже держит высоту сам — не смешивать два механизма на одном экране.                                                |
| **X11**      | Два recharts-тултипа сосуществуют: `DoctorRechartsTooltip` (`shared/ui/doctor/`) и `AppRechartsTooltip` (`shared/ui/charts/`), хотя канон T7 указывает единственным `AppRechartsTooltip`.                                           | `shared/ui/doctor/DoctorRechartsTooltip.tsx` vs `shared/ui/charts/AppRechartsTooltip.tsx`                                        | **P2** | Оставить один тултип (`AppRechartsTooltip`), `DoctorRechartsTooltip` вывести из использования. Заодно проверить дубль скаффолда `analytics/` ↔ `stats/`.                                                          |

### Приложение пациента

| ID      | Нарушение                                                                                                                                                                                                                                                                                   | Где                                                                                                               | Приор. | Единое решение                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1**  | Оболочка монтируется то в `page.tsx`, то делегируется целиком клиенту (`memberships/[id]`, `broadcasts/[auditId]`, booking, lessons) → контракт title/back дрейфует по экранам.                                                                                                             | указанные роуты                                                                                                   | **P0** | `PatientAppShell` — всегда на уровне `page.tsx`. Клиентские компоненты получают только тело; заголовок/back — через пропсы оболочки.                  |
| **P2**  | У записи параллельная оболочка `BookingWizardShell`, дублирующая title/back; `booking/page.tsx` перерисовывает заголовок, которым уже владеет shell.                                                                                                                                        | `BookingWizardShell.tsx`, `booking/page.tsx:77`                                                                   | **P0** | Визард использует слоты `PatientAppShell` (`patientShellAboveTitleSlot` для «Шаг N из M»); не рисует свой `<h1>`. Ввести общий визард-примитив (§10). |
| **P3**  | Разметка `<h1>`+badge продублирована в 3 компонентах с разными классами (`PatientAppShell`, `PatientBottomShellFrame`, `PatientShellTopChrome`).                                                                                                                                            | указанные файлы                                                                                                   | **P1** | Один компонент `PatientShellTitle` (title+badge), единый класс; остальные его используют.                                                             |
| **P4**  | Ad-hoc кнопки/ссылки в обход CTA-примитивов (bespoke «Задать вопрос», «Адрес кабинета», raw `text-primary underline`).                                                                                                                                                                      | `booking/page.tsx:105`, `profile/page.tsx:61`, `BookingWizardShell.tsx:57`                                        | **P1** | Только `patientButton*Class` / `patientInlineLinkClass`. Запрет inline-Tailwind для CTA/поверхностей — вынести в правило.                             |
| **P5**  | Разные подписи «назад» к одной цели: «Меню» / «Назад» / имя таба.                                                                                                                                                                                                                           | courses/sections/profile/diary vs notifications vs программа                                                      | **P2** | Единое правило back-label: к главному разделу → «Меню»; внутри раздела → название родителя; иначе → «Назад».                                          |
| **P6**  | Один `ChatView` подаётся то full-bleed (`messages`), то в карточке `patientSectionSurfaceClass` (`notifications`).                                                                                                                                                                          | messages vs notifications                                                                                         | **P2** | Выбрать один chrome для чата (рекоменд.: full-bleed на выделенном экране, карточка — только во встроенном контексте) и задокументировать.             |
| **P7**  | Гостевые/пустые состояния: где-то голый `<p patientMutedTextClass>`, где-то компонент (`DiarySectionGuestAccess`).                                                                                                                                                                          | `treatment/[instanceId]/page.tsx` vs `diary/page.tsx`                                                             | **P1** | Единый `GuestPlaceholder`/`patientEmptyStateClass` для всех гость/пусто веток.                                                                        |
| **P8**  | Выход за паддинг колонки вручную (`-mx-4 w-[calc(100%+2rem)]`).                                                                                                                                                                                                                             | `booking/` promo-banner                                                                                           | **P2** | Ввести примитив full-bleed-обёртки (напр. `patientBleedClass`) вместо разовых расчётов.                                                               |
| **P9**  | «Назад» решается тремя механизмами с разными иконками и местами (не только разной подписью — см. P5): history-chevron `ChevronLeft`, top-chrome chevron, in-content `ArrowLeft`.                                                                                                            | `PatientShellPageTitleWithHistoryBack.tsx`, `shell/PatientShellTopChrome.tsx`, `PatientBackToSectionShellRow.tsx` | **P2** | Один back-примитив (единый chevron + `usePatientShellGoBack`); in-content «← Назад к разделу» использует его же, а не свою иконку.                    |
| **P10** | Заголовок страницы `<h1>` переиспользует `patientSectionTitleClass` (стиль in-card `h3`, 16px) → у экрана нет контраста между заголовком страницы и заголовком секции.                                                                                                                      | `PatientAppShell.tsx` title-strip vs `patientSectionTitleClass`                                                   | **P1** | Ввести отдельный размер page-title (крупнее секции); title-strip использует его, секции — `patientSectionTitleClass`. Согласовать с DNA-шкалой.       |
| **P11** | Portal CSS-var leakage: контент модалок/порталов рендерится **вне** `#app-shell-patient`, где `--patient-*` не заданы; из-за этого все `patientButton*` несут hex-фолбэки (`#284da0`…) и заведён отдельный `patientModalPortalPrimaryCtaClass` → риск рассинхрона token↔fallback цвета CTA. | `patientVisual.ts` (фолбэки), `patientModalPortalPrimaryCtaClass`                                                 | **P2** | Прокинуть `--patient-*` в портал (scope-обёртка на `DialogContent`) — один источник цвета, убрать hex-фолбэки и портальный CTA-дубль.                 |

### Кросс-зонные / канон

| ID     | Пробел                                                               | Приор. | Решение                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | -------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** | Не было единой кросс-зонной таксономии экранов.                      | —      | Закрывается этим документом (§4).                                                                                                                                                                                                                                                                                                                                                                                            |
| **C2** | Пациентский гайд тонкий — нет per-screen-type раскладок.             | **P1** | §4 даёт пациентские скелеты; перенести ключевое в `PATIENT_APP_UI_STYLE_GUIDE.md` или сослаться на этот документ.                                                                                                                                                                                                                                                                                                            |
| **C4** | ~~Лаб-токены «Direction E» не сверены с задеплоенными.~~ **РЕШЕНО.** | ✅     | Авторитет — **Design DNA v1.0+v1.1** (`docs/design/dna/bersoncare-theme.css`: canvas `#F6F4EF`, accent `#386FBA`, Nunito). Direction E (`docs/design/style-directions/`) — его исследовательский предок, DNA — финализированная версия. Задеплоенные токены зон (`doctorVisual.ts`/`patientVisual.ts`/`doctor.css`/`globals.css`) — **текущая реализация**, подлежит выравниванию под DNA отдельной инициативой (см. §10.6). |

---

## 9. Чек-лист «новый экран за 10 шагов»

1. **Определи архетип** из §4 (T1–T12). Не изобретай новый без причины в логе инициативы.
2. **Определи зону** (врач/пациент) → её оболочка и DNA-слой.
3. **`page.tsx` (RSC):** грузит данные промисами, монтирует оболочку зоны, передаёт `title`/`backHref`/слоты. Заголовок сам не рисует.
4. **Zone Z1:** врач — `DoctorPageHeader` (title + при необходимости tabs/actions/toolbar); пациент — `title` оболочки.
5. **Zone Z3 (если список/аналитика/календарь):** sticky-тулбар из канонных примитивов (`DoctorCatalogFiltersToolbar` / период).
6. **Zone Z4:** тело из §6-примитивов. Каталог = копия стека T3. Форма = T5 + `DoctorCatalogPersistPublishBar`.
7. **Действия:** первичное — правый слот Z1 (врач) / full-width CTA (пациент); сохранение — publish-bar. Не inline в произвольном месте.
8. **Состояния:** `Suspense` + named-скелет (§6), `DoctorEmptyState`/`patientEmptyStateClass`, `DataLoadFailureNotice`.
9. **Медиа:** только `MediaThumb`/`*MediaPlaybackVideo`. **Модалка:** только `DoctorModal`/`PatientModalDialogContent`.
10. **Само-проверка по §7 (инварианты)** + прогон reuse-first: не сделал ли локальную копию существующего примитива.

### Порядок унификации существующего (по приоритету §8)

1. **P0 сначала:** D1, D4 (единая шапка + actions-слот врача); P1, P2 (slot-контракт пациента). Это скелет языка — остальное встаёт на него.
2. **P1:** D2, D7, X1, X5, D5/X9, P3, P4, P7, C2.
3. **P2:** остальное (косметика/долг), пачками по семейству примитива.
4. Каждый шаг — точечные тесты по своим файлам; полный CI — один раз в конце ветки (см. память проекта по тест-режиму).

---

## 10. Открытые решения для владельца

1. **`actions`-слот в `DoctorPageHeader`** (D4). Ввести явную зону первичного действия справа в шапке? Рекомендация: **да** — это чинит D1/D4 разом. _Нужно ваше «ок» на добавление слота в общий примитив._
2. ✅ **Direction E vs токены** (C4) — **решено**: авторитет = Design DNA v1.0+v1.1 (`docs/design/dna/`); Direction E — его лаб-предок.
3. **Миграция токенов под DNA** (новое, следствие C4). Задеплоенные токены зон ещё не выровнены под `bersoncare-theme.css` (Nunito, `#386FBA`, `#F6F4EF`, шкала радиусов 5·8·11·14, микротень, vibrancy). Это **отдельная инициатива уровня токенов/DNA**, а не часть структурной унификации §8 — запускать её отдельной задачей. _Нужно ваше слово: делать выравнивание токенов сейчас или после структурных P0?_ Рекомендация: сначала структурные P0 (§9), затем токен-миграция под DNA — чтобы не переверстывать дважды.

   **Инструмент для токен-миграции — TweakCN** (`tweakcn.com`). Визуальный no-code редактор темы shadcn/ui + Tailwind: цвета, радиусы, тени, шрифты правятся в UI и экспортируются готовым набором CSS-переменных (`:root` / `@theme`, Tailwind v3/v4). Подходит именно для этого шага — быстро собрать и итерировать целевой набор токенов под DNA и выгрузить его в `bersoncare-theme.css`, не подбирая hex вручную. **Важные оговорки под нашу архитектуру:**
   - TweakCN трогает **только токен-слой** (визуальная идентичность) — структурные правила этого гайда (зоны/шаблоны/композиция §3–§7) он не заменяет и к ним нейтрален.
   - Он генерирует **один глобальный** `:root`-набор, а у нас **две зональные области** (`#app-shell-doctor` / `#app-shell-patient`) с раздельными токенами — экспорт TweakCN нужно **разнести по зонам**, а не вставлять как единый глобальный блок.
   - Базовая модель shadcn (`base-color: slate`) не несёт наши нюансы (тёплый холст `#F6F4EF`, моно-синий `#386FBA`, Nunito, микротень, vibrancy) — их доводить вручную поверх экспорта, сверяясь с Design DNA v1.0+v1.1.
   - Использовать как **ускоритель авторинга темы**, а не как источник правды: источник правды остаётся `docs/design/dna/`.

4. **Открытые вопросы самого DNA** (перенесены из спеки §9, чтобы не потерялись): финальная сила микротени; толщина обводки иконок (1.4 vs 1.5); финал набора иконок (Lucide — кандидат); степень тепла/воздуха в пациентской части; тёмная тема как вторичная; палитра для графиков/аналитики (расширение моно-синего без зелёного как основного). Закрываются по мере появления живых экранов.
5. **Общий визард-примитив** (T10/P2): выделять степпер (прогресс + назад/далее) для записи и врачебных bulk-tool (`booking-merge`, `auto-create`)? Рекомендация: да, средним приоритетом.
6. **Единый chart-стек** (X6): recharts как стандарт, SVG — только явные спарклайны? Палитра графиков — открытый вопрос DNA (п.4). Рекомендация: да.
7. **Границы применения гайда:** `admin/booking/**` и standalone-admin формы официально вне канона (свои инициативы) — оставляем так? (Сейчас так.)

> Ничего из §10 не трогается без вашего подтверждения — это вставки в общие примитивы/инициативы, а не косметика.

---

## Приложение A — карта источников

- **Design DNA (визуальная идентичность, целевой слой):** `docs/design/dna/design-dna-v1.0-spec.html` (полная спека: философия, характер, 7 принципов, цвет, типографика, компоненты, иконки, ориентиры, открытые вопросы), `docs/design/dna/design-dna-v1.1-amendment.md` (Nunito, pill для кнопок/поиска, vibrancy, guardrail), `docs/design/dna/bersoncare-theme.css` (токены Tailwind v4 `@theme`).
- **Оболочки:** `shared/ui/doctor/shell/DoctorWorkspaceShell.tsx`, `DoctorPageHeader.tsx`, `DoctorAdminSidebar.tsx`, `DoctorHeader.tsx`; `shared/ui/patient/PatientAppShell.tsx`, `shell/PatientShellTopChrome.tsx`, `PatientPrimaryNavStrip.tsx`.
- **Раскладка/токены:** `shared/ui/doctor/doctorWorkspaceLayout.ts`, `doctorVisual.ts`; `shared/ui/patient/patientVisual.ts`, `pwaLayoutClasses.ts`.
- **Каталог:** `shared/ui/doctor/catalog/*`, `DoctorCatalog*`.
- **Прозаический канон:** `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md` (§A–§21), `PATIENT_APP_UI_STYLE_GUIDE.md`, `DOCTOR_CABINET_NAVIGATION.md`, `SPECIALIST_CABINET_STRUCTURE.md`, `EXERCISES_CATALOG_PERFORMANCE_PRIMITIVES.md`, `MEDIA_PREVIEW_FRONTEND.md`, `PATIENT_MEDIA_PLAYBACK_VIDEO.md`.
- **Правила (canon, override):** `.cursor/rules/doctor-ui-shared-primitives.mdc`, `patient-ui-shared-primitives.mdc`, `patient-doctor-ui-isolation.mdc`, `ui-copy-no-excess-labels.mdc`, `ui-select-trigger-display-label.mdc`, `cms-unified-media-picker-layout.mdc`.
- **Дизайн-лаб:** `docs/design/style-directions/` (directions A–E, «E» — выбранное направление), `doctor-cabinet-wireframe.html`.
- **Экраны-заголовки:** `shared/ui/doctorScreenTitles.ts`; навигация `shared/ui/doctor/doctorNavLinks.ts`, `app-layer/routes/navigation.ts`.

_Конец документа. Это база; при изменении примитивов — обновлять §6 и §8._
