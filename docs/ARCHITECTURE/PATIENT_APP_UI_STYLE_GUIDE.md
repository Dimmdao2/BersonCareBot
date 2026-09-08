# PATIENT_APP_UI_STYLE_GUIDE

Единый стандарт для визуальной разработки patient UI: что переиспользуем, где допустим кастом, и как не размывать общий стиль в новых редизайн-этапах.

## 0. Терминология: «ЛФК» и программа реабилитации (с 2026-05-09)

В **пользовательских текстах** кабинета пациента слова **«ЛФК»**, **«ЛФК занятие»**, **«программа ЛФК»** означают **программу реабилитации** (назначенный план лечения), а не отдельный UX-сценарий вокруг «комплекса ЛФК». Пациентский продукт **не** опирается на «комплекс ЛФК» как на самостоятельную навигационную сущность. Каноническое правило для агентов: `.cursor/rules/patient-lfk-means-rehab-program.mdc`.

## 1. Source of Truth

Для patient UI опираемся на три слоя:

1. `apps/webapp/src/shared/ui/patient/patientVisual.ts` — patient-specific shared classes (surface, typography, actions, page layout).
2. `apps/webapp/src/app/styles/patient.css` — токены patient темы (`:root` + `#app-shell-patient`: `--patient-*`, `--patient-surface-*`).
3. `apps/webapp/src/shared/ui/patient/primitives/*` — shadcn/base-ui копии **patient-зоны** (`Button`, `Card`, `Badge`, `Input`, `Textarea`, `Dialog`, `Drawer`, `Tabs`, `Switch`, `Select`, `Tooltip`).
4. `apps/webapp/src/shared/ui/patient/PatientModal.tsx` — единственный контейнер модалок пациента (§8).

`@/components/ui/**` в patient-маршрутах **запрещён** (ESLint + AGENTS.md §15/§17).

`apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts` — это отдельный home-specific слой. Его fixed geometry, hero-обвязку и dashboard-позиционирование нельзя механически переносить на внутренние страницы.

## 1b. Typography: patient semantic scale

`patient.css` is the portal-safe source of truth for patient typography. Its `--patient-font-*`,
`--patient-line-height-*`, `--patient-font-weight-*`, and `--patient-text-*` panel applies Manrope
and defines these roles; patient code uses the corresponding exports from `patientVisual.ts`, rather
than new local pixel values.

| Role                       | Contract                                             | Shared class                                        |
| -------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Page title                 | 22/28, 600, heading `#172f62`                        | `patientPageTitleClass`                             |
| Section / modal title      | 18/24, 500, heading                                  | `patientSectionTitleClass`                          |
| Body / readable form value | 16/24, 400, primary `#111827`                        | `patientBodyTextClass`                              |
| Primary action             | 16/20, 600                                           | `patientActionTextClass` and patient action classes |
| Secondary body             | 14/20, 400                                           | `patientMutedTextClass`                             |
| Form label                 | 14/20, 500                                           | `patientFormLabelClass`                             |
| Caption / meta             | 12/16, 500                                           | `patientCaptionTextClass`                           |
| Micro                      | 11/16, 500                                           | `patientMicroTextClass`                             |
| Metric / hero number       | 28/34, 600                                           | `patientMetricTextClass`                            |
| Home cover display heading | 20/24 mobile, 24/28 from `md`, 600                   | `patient-type-home-display`                         |
| Home primary hero title    | 20/24 mobile; 30/34, 34/38, 36/40 desktop scale, 600 | `patient-type-home-hero-title`                      |
| Booking success glyph      | 24/28, 400                                           | `patient-type-booking-success-glyph`                |

Micro is reserved for badges, counters, graph/calendar axes, and nonessential compact metadata.
It is not a fallback for readable prose, errors, schedules, form labels, or doctor comments. The
readable secondary/muted role is `#667085` or darker; `#98a2b3` is not a readable-text default.
Patient shell page titles use `patientPageTitleClass` on both mobile and desktop. Modal titles use
`patientSectionTitleClass`. Form primitives apply the body contract so mobile values remain at least
16px. Status tones remain semantic tokens, not duplicated direct text hex values.
The home cover display role is reserved for media-overlay headings; it is controlled by the same
patient typography panel and is not a responsive override of the page-title role.
The Home primary hero title is a distinct responsive role for the main dashboard hero; it is not used
for compact useful-post overlays.

## 1a. Responsive: patient shell (`md`)

- **Порог широкой колонки:** Tailwind **`md`** (768px). У `#app-shell-patient` (`AppShell` с `variant="patient"` / `patient-wide`): ниже `md` — узкая колонка `max-w-[430px]`; с **`md`** — до **`max-w-[min(1180px,calc(100vw-2rem))]`** (как в коде `AppShell`).
- **`PatientTopNav`:** до `md` — мобильная полоска primary nav; с **`md`** — desktop-ветка (ширина и sticky-согласование с колонкой shell).
- **Patient shell (с 2026-05):** по умолчанию {@link PatientShellTopChrome} (mobile: профиль справа; desktop: вкладки + профиль в одной строке) и {@link PatientBottomNav} (mobile). Заголовок подстраницы — в потоке контента ({@link PatientShellPageTitleStrip}), не в fixed chrome. Mobile chrome — `fixed inset-x-0` на всю ширину viewport. Откат: `PATIENT_SHELL_NAV_VARIANT = "top"`.
- **Главная «Сегодня»:** двенадцатиколоночная сетка и grid-placement блоков в `PatientHomeTodayLayout` включаются с **`md`** (атрибуты отладки на блоках — `data-md-*`).
- **`patientVisual.ts` (внутренние страницы и общие карточки):** радиус/тень/padding карточных токенов (`patientCardSurfaceTokens`, `patientSemanticSurfaceCardChrome`, `patientCardClass`, semantic surfaces), типовые отступы списков/коллапсов, вертикальный rhythm (`patientInnerPageStackClass`, `patientInnerCardGridClass`, `patientPageSectionGapClass`), крупная типографика inner-hero и связанные CTA переключаются с **`md`**, в одну линию с широким shell — без отдельного «скачка» на `lg` (1024px). Ступени только **`xl:`** (и узкие `min-[380px]:`) сохраняются там, где нужна третья ступень масштаба.
- **`patientHomeCardStyles.ts`:** семантические оболочки карточек главной (базовая/plan/success/warning/danger/compact/useful post shell, ведущие иконки) используют **`md:`** для desktop radius/shadow/padding вместе с shell; отдельные **трёхступенчатые высоты** слотов (`md` + `lg` для min-height строк) остаются осознанно — это вертикальная сетка, не порог оболочки.
- **Правило для правок:** интервал **ниже `md`** трактуется как мобильный режим оболочки; менять там базовые классы без префикса ради ширины/layout — только по отдельной задаче. Для переключений «узкий shell / широкий shell» на главной и в shell предпочитать пары **`max-md:` / `md:`**, а не вводить промежуточные брейкпоинты между мобильным и `md`.
- **Журнал и контекст задачи:** [`docs/archive/2026-05-initiatives/PATIENT_SHELL_MD_BREAKPOINT/`](../archive/2026-05-initiatives/PATIENT_SHELL_MD_BREAKPOINT/README.md).

## 2. Reuse-First Policy

Перед добавлением любого нового UI на patient-страницах:

1. Проверить, нет ли готового класса в `patientVisual.ts`.
2. Если нет — проверить подходящий primitive в `shared/ui/patient/primitives/*` (модалки — `PatientModal`, §8).
3. Только если оба шага не покрывают задачу, вводить кастомный локальный UI.

Нельзя создавать одноразовые локальные реализации карточек/кнопок/бейджей/аккордеонов/форм-контролов, если уже есть shared или shadcn/base-ui вариант.

## 3. Что Уже Считается Общим Patient Layer

Минимальный набор, который нужно переиспользовать по умолчанию:

- Surfaces: `patientCardClass`, `patientCardCompactClass`, `patientListItemClass`, `patientSectionSurfaceClass`, `patientFormSurfaceClass`.
- Semantic tones: `patientSurfaceNeutralClass`, `patientSurfaceInfoClass`, `patientSurfaceSuccessClass`, `patientSurfaceWarningClass`, `patientSurfaceDangerClass`.
- Typography/layout: `patientPageTitleClass`, `patientSectionTitleClass`, `patientBodyTextClass`, `patientMutedTextClass`, `patientCaptionTextClass`, `patientMicroTextClass`, `patientActionTextClass`, `patientMetricTextClass`, `patientPageSubtitleClass`, `patientPageHeaderClass`, `patientInnerPageStackClass`, `patientInnerCardGridClass`.
- Actions/links: `patientPrimaryActionClass`, `patientSecondaryActionClass`, `patientDangerActionClass`, `patientInlineLinkClass`, `patientInfoLinkTileClass`.
- Pills/empty: `patientPillClass`, `patientEmptyStateClass`.

## 4. Граница Между Home И Inner Pages

Из home-дизайна на внутренние страницы переносим:

- цветовые/semantic tones;
- типографику и action patterns;
- общие card/list/form обертки.

Не переносим без отдельного решения:

- hero geometry, fixed heights, grid placement и отдельные media slots;
- home-only поведение блоков;
- продуктовую композицию главной.

## 5. Shadcn + Patient Layer (не вместо, а вместе)

- Shadcn/base-ui отвечает за базовую семантику, interaction и accessibility.
- Patient layer отвечает за product-specific визуальный язык пациента.
- Допустим смешанный подход: `Card`/`Badge`/`Button` + patient classes/tokens.

**`Select` (выпадающий список):** если `value` — нечитаемый ключ (id, enum), а в закрытом поле нужна русская подпись, см. AGENTS.md §22 и комментарий в `shared/ui/primitives/select.tsx` (`displayLabel` / `items` / явный `SelectValue`).

Нельзя менять глобальные doctor/admin-паттерны ради локального patient-эксперимента.

## 6. Правило Для Редизайн-Этапов

В любых будущих page-redesign/style-pass работах:

- не придумывать новый “локальный chrome” в компонентах, если shared слой уже покрывает кейс;
- не расширять scope в product/content/API/DB/env;
- deferred-экраны (`/emergency`, `/lessons`, `/address`, `/intake/*`, booking landing) стилизовать только в рамках отдельно подтверждённых фаз App Restructure / профильных инициатив. `/messages` из этого списка выведен: чат ведётся самостоятельной страницей кабинета; модалкой остаётся обсуждение упражнения (§8).

## 7. Когда Кастом Разрешён

Кастом допустим только если:

1. Нет подходящего shared/shadcn примитива.
2. Есть явная продуктовая причина (новый паттерн, который не выражается текущими средствами).
3. Причина зафиксирована в документации активной инициативы/логе.

Без этих трёх условий кастом считается архитектурным долгом.

## 8. Модалки: один контейнер на всю patient-зону

**Источник истины — `apps/webapp/src/shared/ui/patient/PatientModal.tsx`.** Любая feature-модалка пациента
открывается через `PatientModal`; собственные `Dialog`/`Sheet`-обёртки со своей геометрией не заводятся.

### Что даёт контейнер

- **Desktop** — диалог по центру, **mobile** — канонический bottom-drawer (`shared/ui/patient/primitives/drawer.tsx`,
  ширина ограничена колонкой оболочки 430px). Порог мобильного вьюпорта — `primitives/useIsMobileViewport.ts`,
  тот же, что у `patient-mobile` в `app/styles/patient.css` (узкий **или** низкий экран).
- **Шапка / тело / подвал закреплены:** прокручивается только тело — единственный владелец скролла.
  Заголовок — `title`, вторая строка контекста — `titleSubject` (простой текст, не ссылка).
- **Подвал** — проп `footer` либо `PatientModalFooter` из содержимого (портал в ту же панель). Панель одна:
  одинаковая геометрия, `env(safe-area-inset-bottom)` и одинаковые по ширине кнопки на mobile. Кнопка
  `type="submit"` из формы связывается с подвалом атрибутом `form`, потому что портал уносит её из DOM формы.
- **Размеры** `sm | md | lg | content`. `content` отдаёт телу flex-колонку под контент со СВОИМ внутренним
  скроллом — например, обсуждение упражнения (`ProgramItemDiscussionDialog`).
- **Слои и затемнение:** `PatientModalLayerContext` держит вложенные и соседние модалки в одном стеке —
  затемнение рисует только первый открытый слой. Модалка под вложенной остаётся смонтированной, поэтому
  закрытие верхнего слоя возвращает в тот же экран с сохранённым черновиком.
- **`presentation="fullscreen-media"`** — полноэкранный просмотр фото/видео поверх обсуждения; видео
  показывает `PatientMediaPlaybackVideo presentation="fullscreen"` (AGENTS.md §19), закрытие возвращает в тред.
- Тело сбрасывает скролл наверх при открытии.

### Legacy-диалоги

`shared/ui/patient/primitives/dialog.tsx` на mobile делегирует геометрию тому же `DrawerContent`, поэтому
оставшиеся прямые `Dialog`-вызовы зоны не могут разъехаться с `PatientModal`. Это переходный слой:
новые модалки пишутся на `PatientModal`, локальные mobile-ветки с собственной геометрией, фоном или
анимацией запрещены.

### Граница patient / doctor (AGENTS.md §17)

Patient-модалки и их примитивы **не импортируют** `@/shared/ui/doctor/**` и `@/components/ui/**`, doctor —
`@/shared/ui/patient/**`. Совпадение поведения достигается зеркальной реализацией, а не общим компонентом:
`PatientModal` повторяет проверенный контракт `DoctorModal`, не заимствуя его код. Если экран нужен обеим
зонам, общей делается только модель без UI (пример — `shared/ui/chat/useDiscussionMessageMediaPlayback.ts`),
а рендер остаётся зональной обёрткой.

### Портал вне `#app-shell-patient`

Модалка рендерится в портал на `<body>`, поэтому доступны только `:root`-токены `patient.css`
(`--patient-card-bg`, `--patient-border`, `--patient-font-*`, `--patient-text-*`). `--patient-color-primary`
объявлен на `#app-shell-patient` и в портале **не резолвится** — для primary CTA внутри модалки использовать
`patientModalPortalPrimaryCtaClass`.
