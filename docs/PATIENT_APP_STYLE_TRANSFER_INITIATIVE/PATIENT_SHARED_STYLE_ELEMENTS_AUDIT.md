# PATIENT SHARED STYLE ELEMENTS AUDIT

Дата: **2026-05-01**.

Цель документа: зафиксировать фактические стили новой patient home после redesign, выделить общие переиспользуемые элементы / кандидаты на переиспользование и сравнить их со стилями внутренних patient pages после `PATIENT_APP_STYLE_TRANSFER_INITIATIVE`.

Этот документ не предлагает менять контент, структуру страниц, business/API/DB/env. Это audit visual primitives и style gaps.

## 1. Главный вывод

Новая patient home и внутренние patient pages сейчас используют **не один полностью единый visual layer**.

Фактически есть два слоя:

1. **Home-specific layer** — `apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts`
   - задаёт hero, booking, situations, progress, reminder, mood, sos, plan, carousel/course geometry;
   - содержит много фиксированной геометрии, desktop grid placement, clamp/height rules;
   - не должен напрямую переноситься на все внутренние страницы.

2. **Shared patient layer** — `apps/webapp/src/shared/ui/patientVisual.ts`
   - содержит более общие primitives: card, compact card, list item, section surface, form surface, text tones, pill, actions, inline link;
   - применялся на внутренних страницах в рамках Style Transfer;
   - визуально мягче и менее заметен, потому что page background и card background сейчас оба белые, а border/shadow очень деликатные.

Именно поэтому на внутренних страницах может казаться, что “глобально ничего не поменялось”: нет единого сильного page-level layout, page title system, inner page grid rhythm и более контрастного surface separation.

## 2. Patient shell / общий фон

| Элемент | Новая home / shell | Внутренние страницы | Статус |
|---|---|---|---|
| App root | `#app-shell-patient` | тот же shell | общий |
| Page background | `--patient-page-bg: #ffffff` | тот же `#ffffff` | общий, но визуально почти не отличает страницу от карточек |
| Card background | `--patient-card-bg: #ffffff` | тот же `#ffffff` | общий, но слабый контраст |
| Mobile width | `max-w-[430px]` | `max-w-[430px]` | общий |
| Desktop width | `lg:max-w-[min(1180px,calc(100vw-2rem))]` | тот же | общий |
| Vertical rhythm | shell `gap-[var(--patient-gap)]`, `--patient-gap: 18px` | тот же shell, но page content often custom | частично общий |

### Gap

Нет отдельного named primitive для внутреннего page layout:

- `patientPageStackClass`;
- `patientPageGridClass`;
- `patientPageNarrowClass`;
- `patientPageIntroClass`.

Сейчас внутренние страницы часто используют локальные `flex flex-col gap-*`, `grid gap-4 md:grid-cols-2`, `mb-4`, etc.

## 3. Цветовые токены patient

Фактические tokens в `#app-shell-patient`:

| Token | Value | Назначение |
|---|---:|---|
| `--patient-color-primary` | `#284da0` | основной синий accent |
| `--patient-color-primary-soft` | `#e8eefb` | мягкий синий фон |
| `--patient-color-success` | `#16a34a` | запись / success |
| `--patient-color-success-soft` | `#ecfdf3` | фон записи |
| `--patient-color-warning` | `#f59e0b` | напоминания |
| `--patient-color-warning-soft` | `#fffaeb` | фон напоминания |
| `--patient-color-danger` | `#ef4444` | SOS / destructive |
| `--patient-color-danger-soft` | `#fef2f2` | фон SOS |
| `--patient-text-primary` | `#111827` | основной текст |
| `--patient-text-secondary` | `#667085` | вторичный текст |
| `--patient-text-muted` | `#98a2b3` | приглушённый текст |
| `--patient-block-heading` | `#172f62` | заголовки блоков home |
| `--patient-block-caption` | `#465880` | подписи/описания home |

### Gap

Внутренние страницы используют часть этих tokens (`patientMutedTextClass`, `patientCardClass`), но не всегда используют:

- `--patient-block-heading`;
- `--patient-block-caption`;
- semantic card tones (`success/warning/danger`) вне home.

## 4. Заголовки

### 4.1. Заголовок страницы

Текущее место:

- `AppShell` title strip for patient inner pages.

Фактический стиль:

- wrapper: `border-b border-[var(--patient-border)] bg-[var(--patient-surface)] px-4 py-2.5`;
- `h1`: `text-base font-semibold tracking-tight text-[var(--patient-text-primary)]`;
- hidden/suppressed on new home via `patientSuppressShellTitle`.

Примеры:

- “Мой профиль”;
- “Уведомления”;
- “Мои приёмы”;
- “Уроки и тренировки”.

Статус:

- общий элемент есть, но он живёт в shell, не как reusable page primitive.

Gap:

- нет `patientPageTitleClass`;
- title strip визуально не связан с home block heading system;
- page title не имеет варианта с subtitle/intro внутри content area.

### 4.2. Заголовок блока на новой home

Текущий primitive:

- `patientHomeBlockHeadingClass`.

Фактический стиль:

- `font-sans`;
- `font-size: var(--patient-block-heading-font-size)` → `0.875rem`;
- `line-height: var(--patient-block-heading-line-height)` → `1.25rem`;
- `font-weight: var(--patient-block-heading-font-weight)` → `600`;
- color `var(--patient-block-heading)` → `#172f62`.

Где используется:

- booking card heading “Нужна консультация?”;
- progress heading “Сегодня выполнено”;
- plan heading “Мой план реабилитации”;
- reminder/mood/sos headings.

Статус:

- хороший кандидат для общего `patientBlockTitleClass`, но с осторожностью: это **не page title**, а заголовок блока/карточки.

### 4.3. Заголовок секции на внутренних страницах

Текущий primitive:

- `patientSectionTitleClass`.

Фактический стиль:

- похож на home block heading;
- `font-semibold`;
- same tokenized size/line-height/color as block heading.

Gap:

- название `sectionTitle` есть, но используется не везде;
- нет пары `sectionDescription/subtitle`.

## 5. Тексты

| Элемент | Current primitive | Style | Где подходит |
|---|---|---|---|
| Основной текст | `patientBodyTextClass` | `text-sm`, `--patient-text-primary` | текст внутри карточек / форм |
| Приглушённый текст | `patientMutedTextClass` | `text-sm`, `--patient-text-muted` | подписи, empty states, helper text |
| Home caption | `patientHomeBlockBodySmClass` | `text-sm leading-5`, `--patient-block-caption` | подписи внутри home cards |
| Home small caption | `patientHomeBlockCaptionTypographyClass` | `12px`, medium, `--patient-block-caption` | подписи под situation icons |
| Hero summary | `patientHomeHeroSummaryClampClass` | mobile `12–13px`, desktop `15px`, `--patient-text-secondary` | только hero |

### Gap

Внутренним страницам не хватает явных primitives:

- `patientPageSubtitleClass` — текст под заголовком страницы;
- `patientCardDescriptionClass` — описание внутри карточки;
- `patientFieldHintClass` — подсказка под полем;
- `patientMetaTextClass` — мелкие meta/status строки.

Сейчас эти роли часто собираются ad hoc через `patientMutedTextClass` + локальные `text-xs`, `mt-*`, `truncate`.

## 6. Контейнеры / карточки / surfaces

### 6.1. Home base card

Primitive:

- `patientHomeCardClass`.

Style:

- border: `1px solid var(--patient-border)`;
- bg: `var(--patient-card-bg)`;
- text: `var(--patient-text-primary)`;
- padding: `p-4 lg:p-[18px]`;
- radius: `10px mobile`, `12px desktop`;
- shadow: `0 4px 14px rgba(15, 23, 42, 0.04)` mobile, `0 8px 24px rgba(15, 23, 42, 0.05)` desktop.

### 6.2. Shared patient card

Primitive:

- `patientCardClass`.

Style:

- same base border/bg/text/radius/shadow tokens;
- padding `p-4 lg:p-[18px]`.

Status:

- **это уже общий reusable element**;
- внутренние pages должны использовать его для card-like blocks.

### 6.3. Compact card

Primitives:

- `patientHomeCardCompactClass`;
- `patientCardCompactClass`.

Style:

- same border/bg/radius/shadow;
- smaller padding `p-3 lg:p-4`.

Status:

- общий candidate for dense lists / small cards.

### 6.4. List item

Primitive:

- `patientListItemClass`.

Style:

- `rounded-lg`;
- border `var(--patient-border)`;
- bg `var(--patient-card-bg)`;
- padding `p-3`;
- text primary;
- intentionally no full card shadow.

Status:

- хороший общий элемент для rows/lists.

### 6.5. Section surface / form surface

Primitives:

- `patientSectionSurfaceClass`;
- `patientFormSurfaceClass`.

Style:

- same surface tokens as card;
- `flex flex-col gap-4 p-4`.

Gap:

- слишком общий “one size fits all”;
- нет вариантов для:
  - hero/intro block;
  - warning/info surface;
  - compact settings section;
  - full-width page section;
  - no-shadow surface.

## 7. Semantic home cards

Эти элементы выглядят как кандидаты на reuse, но не все можно переносить напрямую.

| Home element | Primitive | Current style | Reuse recommendation |
|---|---|---|---|
| Hero card | `patientHomeCardHeroClass` / `patientHomeHeroCardGeometryClass` | gradient, purple border, fixed image slot, fixed heights | не переносить целиком; только как inspiration для future `patientHeroSurfaceClass` |
| Booking / success card | `patientHomeCardSuccessClass` | green soft bg, green border, same radius/shadow | candidate: `patientSuccessSurfaceClass` |
| Reminder / warning card | `patientHomeCardWarningClass` / `patientHomeReminderCardGeometryClass` | warning soft bg/border; geometry fixed | candidate: split tone from geometry |
| SOS / danger card | `patientHomeCardDangerClass` | danger soft bg/border | candidate: `patientDangerSurfaceClass` |
| Mood gradient | `patientHomeMoodCheckinShellClass` / gradient warm legacy | special responsive behavior | keep home-specific |
| Useful post cover | `patientHomeUsefulPostCardShellClass` | full-bleed cover card | keep content-card-specific |

### Important split needed

Home classes mix two responsibilities:

1. **Tone/surface** — success/warning/danger/hero colors.
2. **Geometry** — fixed height, grid placement, image slot, mobile/desktop adjustments.

For reuse on internal pages, extract only tone/surface pieces, not fixed home geometry.

## 8. Buttons / actions

### Current shared primitives

| Primitive | Style / role |
|---|---|
| `patientButtonPrimaryClass` | blue primary, full-width by default, min touch height |
| `patientButtonSuccessClass` | green success/appointment action |
| `patientButtonSecondaryClass` | white bordered secondary |
| `patientButtonGhostLinkClass` | ghost/link action |
| `patientButtonDangerOutlineClass` | danger outline |
| `patientButtonWarningOutlineClass` | warning outline |
| `patientPrimaryActionClass` | alias primary |
| `patientSecondaryActionClass` | alias secondary |
| `patientDangerActionClass` | alias danger |

Status:

- reusable;
- already used on internal pages.

Gap:

- button classes are strings, not shadcn variants;
- no single API like `<PatientButton variant="primary|secondary|success|danger">`;
- some pages still use shadcn `Button` with default project variants, so visual consistency is mixed.

Recommendation:

- Do not rewrite all buttons casually.
- Consider a future `PatientActionButton` wrapper or shadcn `Button` variant strategy if doctor/admin impact is controlled.

## 9. Pills / badges

### Current primitives

- `patientPillClass` in `patientVisual.ts`;
- home-specific:
  - `patientHomeHeroBadgeClass`;
  - `patientHomeHeroDurationBadgeClass`;
  - `patientHomeUsefulPostCoverBadgeClass`;
  - `patientBadgePrimaryClass`;
  - `patientBadgeSuccessClass`;
  - `patientBadgeWarningClass`;
  - `patientBadgeDangerClass`;
  - `patientBadgeDurationClass`.

Status:

- home has richer badge taxonomy than internal pages.

Gap:

- internal pages still often use shadcn `Badge` variants or ad hoc spans;
- no unified patient badge/tone primitive for status semantics.

Candidate:

- `patientStatusBadgeClass({ tone })` or shadcn `Badge` wrapper with patient tones.

## 10. Icons / image slots

Home primitives:

- `patientIconLeadingClass`;
- `patientIconLeadingWarningClass`;
- `patientIconLeadingDangerClass`;
- `patientHomeSituationTileMediaClass`;
- `patientHomeHeroImageSlotClass`;
- `patientHomeCardMediaSlotClass`.

Status:

- leading icon circles are good candidates for reuse;
- hero image slot and situation tile geometry are home-specific.

Gap:

- internal pages do not have a common leading-icon primitive for settings/cabinet/list cards.

Candidate:

- `patientLeadingIconClass`;
- `patientLeadingIconToneClass(success|warning|danger|primary)`.

## 11. Layout / grid

### New home grid

`PatientHomeTodayLayout`:

- mobile: `flex flex-col gap-3`;
- desktop: `lg:grid-cols-12`, `lg:grid-flow-row-dense`, `lg:gap-5 xl:gap-6`;
- block-specific placement:
  - warmup 8 columns + useful post 4;
  - situations 8 + booking 4;
  - progress 8 + reminder 4;
  - mood/sos/plan 4 + 4 + 4;
  - subscription and courses full width.

Status:

- this is dashboard layout, not an inner page layout.

### Internal pages

Examples:

- `/sections`: `grid gap-4 md:grid-cols-2`;
- `/cabinet`: `section flex flex-col gap-6`;
- `/profile`: `flex flex-col gap-3`;
- many pages use local stacks.

Gap:

- no common inner page layout primitive.

Candidates:

- `patientInnerPageStackClass = "flex flex-col gap-3 lg:gap-4"`;
- `patientInnerCardGridClass = "grid gap-4 md:grid-cols-2"`;
- `patientDashboardStackClass` for pages like cabinet;
- `patientPageIntroBlockClass`.

## 12. Comparison: old/internal pages vs new home

| Area | New home | Internal pages after transfer | Difference visible to user |
|---|---|---|---|
| Background | white shell + white cards | same white shell + white cards | low contrast; changes are subtle |
| Cards | tokenized, sometimes colored/semantic | mostly white card/list surfaces | inner pages lack semantic tones |
| Page title | suppressed; greeting/content-led | shell title strip `h1 text-base` | no unified page heading system with home |
| Layout | strong dashboard grid | local flex/grid per page | no single inner page grid rhythm |
| Buttons | patient action classes on home cards | mixed patient classes + shadcn Button | partial consistency |
| Text | home uses block heading/caption taxonomy | mostly muted/body primitives | less rich hierarchy |
| Badges | rich home badge classes | shadcn Badge / patientPill / custom spans | inconsistent status/tone model |
| Icons | strong leading icon circles / media slots | ad hoc icons or none | less visual continuity |

## 13. Main reusable elements already available

These can be treated as current shared patient style primitives:

- `patientCardClass`;
- `patientCardCompactClass`;
- `patientListItemClass`;
- `patientSectionSurfaceClass`;
- `patientFormSurfaceClass`;
- `patientSectionTitleClass`;
- `patientBodyTextClass`;
- `patientMutedTextClass`;
- `patientEmptyStateClass`;
- `patientPillClass`;
- `patientInlineLinkClass`;
- `patientInfoLinkTileClass`;
- `patientPrimaryActionClass`;
- `patientSecondaryActionClass`;
- `patientDangerActionClass`;
- `patientButtonSuccessClass`;
- `patientButtonGhostLinkClass`;
- `patientButtonWarningOutlineClass`.

## 14. Main candidates to create / extract

### Page-level

- `patientPageTitleClass`
- `patientPageSubtitleClass`
- `patientPageHeaderClass`
- `patientPageIntroTextClass`

### Layout

- `patientInnerPageStackClass`
- `patientInnerCardGridClass`
- `patientDashboardStackClass`
- `patientPageSectionGapClass`

### Cards / surfaces

- `patientSuccessSurfaceClass`
- `patientWarningSurfaceClass`
- `patientDangerSurfaceClass`
- `patientInfoSurfaceClass`
- `patientNoShadowSurfaceClass`

### Typography

- `patientCardTitleClass`
- `patientCardDescriptionClass`
- `patientMetaTextClass`
- `patientFieldLabelClass`
- `patientFieldHintClass`

### Badges / icons

- `patientStatusBadgeClass` / shadcn `Badge` wrapper;
- `patientLeadingIconClass`;
- `patientLeadingIconToneClass`.

### Buttons

- `PatientActionButton` wrapper around shadcn `Button`, or controlled shadcn variant mapping.

This should be decided separately because global `buttonVariants` may affect doctor/admin if changed in the wrong layer.

## 15. Why changes on other pages may look invisible

Likely reasons:

1. **White-on-white surfaces**: page background and card background are both `#ffffff`.
2. **Subtle border/shadow**: `#e5e7eb` border and low-opacity shadow do not create a strong visual break.
3. **No unified page heading system**: internal pages still use shell title strip, not a content-level page header matching new home hierarchy.
4. **No unified internal grid**: each page keeps local layout (`gap-3`, `gap-4`, `md:grid-cols-2`, etc.).
5. **Semantic colors mostly stayed on home**: success/warning/danger surfaces were not broadly extracted to inner pages.
6. **Many controls still shadcn/default**: buttons, badges, forms are mixed between shadcn defaults and patient classes.

## 16. Recommended next audit/fix direction

Do not start by restyling all pages.

Suggested order:

1. Define shared inner page primitives (`page title`, `subtitle`, `inner stack`, `card grid`).
2. Extract semantic surface tones from home without geometry.
3. Apply those primitives to 2–3 representative internal pages:
   - `cabinet`;
   - `sections`;
   - `profile` or `notifications`.
4. Compare screenshots before/after for:
   - page title clarity;
   - card separation;
   - button consistency;
   - text hierarchy.
5. Only then expand to deferred routes.

