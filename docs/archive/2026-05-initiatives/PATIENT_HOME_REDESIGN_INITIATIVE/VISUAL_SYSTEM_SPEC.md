# Patient Visual System Spec

Цель документа: зафиксировать подробную спецификацию визуального редизайна пациентской части webapp на основе референсов главной "Сегодня" и последних продуктовых решений по навигации.

Этот документ дополняет `README.md` инициативы `PATIENT_HOME_REDESIGN_INITIATIVE`. Он не заменяет фазовую архитектуру, правила данных, ограничения по CMS и запрет на хардкод slug-ов из [`CONTENT_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/CONTENT_PLAN.md) (рабочая копия в `APP_RESTRUCTURE_INITIATIVE`).

### Положение в фазовой архитектуре

Visual redesign — отдельный pass поверх уже завершённых фаз 1–9 инициативы. Не встраивать визуальные изменения внутрь scope старых фаз и не считать его подзадачей `Phase 9` release rehearsal. Для исполнения создана отдельная инициатива `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/` со своими PLAN/EXEC/AUDIT/FIX промптами. Все ограничения `README.md §3 NOT IN SCOPE` и `EXECUTION_RULES.md` сохраняются.

---

## 1. Главный принцип исполнения

Редизайн должен максимально приблизить пациентский UI к референсам, но реализовываться через существующую структуру кода и общие примитивы проекта.

### 1.1. Что делать

- Сначала сопоставить visual spec с существующими элементами: `AppShell`, `PatientHeader`, `PatientBottomNav`, `buttonVariants`, `patientHomeCardStyles.ts`, `PatientHome*`.
- Менять стили в общих точках переиспользования, а не прошивать одноразовые Tailwind-классы в каждом блоке.
- Добавлять новые patient-примитивы только там, где существующий элемент не покрывает роль: hero card, tone card, badge, icon tile, progress/streak, desktop top nav.
- Сохранять текущие runtime-контракты: главная собирается из `patient_home_blocks` / `patient_home_block_items`, контент берется из CMS, настройки из `system_settings`.
- Выполнять редизайн как patient-scoped систему, пригодную для дальнейшего переноса на booking, reminders, diary, profile, courses/content pages.

### 1.2. Что не делать

- Не создавать параллельную дизайн-систему только для `/app/patient`.
- Не менять doctor/admin UI в этой задаче.
- Не хардкодить slug-и, названия ситуаций или привязку цветов к значениям из [`CONTENT_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/CONTENT_PLAN.md).
- Не добавлять новые env-переменные для визуального поведения или интеграций.
- Не восстанавливать старый floating FAB дневника.
- Не менять модель данных, если задача является только visual/system redesign.

---

## 2. Статус референсов

Референсы задают визуальное направление: мягкий светлый фон, крупная hero-карточка, app-like bottom nav, большие радиусы, спокойные pastel surfaces, clear CTA.

Референсы не являются точным контрактом структуры навигации:

- на mobile/tablet нижняя навигация остается основной;
- на desktop нижняя навигация заменяется верхней навигацией;
- кнопки `Back` на desktop нет;
- кнопка `Home` не дублируется в header, потому что `Сегодня` находится в основной навигации;
- `Профиль` находится справа в header/topbar, а не в нижней навигации;
- настройки находятся внутри профиля, отдельная шестеренка в patient UI не нужна.

---

## 3. Scope

### 3.1. In scope

- Patient shell: layout, background, max-width, safe-area padding.
- Patient navigation: mobile/tablet bottom nav, desktop top nav, profile/right icons.
- Patient visual tokens: colors, radii, shadows, spacing, typography.
- Shared patient UI primitives: cards, buttons, badges, icon containers, progress bars.
- Patient home components in `apps/webapp/src/app/app/patient/home/`.
- Visual empty/loading states that prevent layout jumps.
- Tests that protect semantics and navigation behavior.

### 3.2. Out of scope

- Doctor/admin redesign.
- Billing/subscription gating.
- New persona taxonomy.
- Changes to treatment program or LFK tables.
- New settings in env.
- Pixel-perfect dependency on reference image assets if assets are not available in CMS.

---

## 4. Existing Code Mapping

Перед началом implementation агент обязан проверить текущие файлы и использовать их как основную карту работ.

Колонка `Текущее состояние` фиксирует то, что есть в коде сегодня. Колонка `Ожидаемое изменение` — целевое состояние по этой spec. Несовпадение между ними является намеренным.

| Требование | Существующая точка входа | Текущее состояние | Ожидаемое изменение |
|---|---|---|---|
| Patient shell | `apps/webapp/src/shared/ui/AppShell.tsx` | `max-w-[480px]` (`patient`), `max-w-[480px] lg:max-w-6xl` (`patient-wide`), фон через `var(--patient-surface)` (`#FFFFFF`) | mobile `max-width: 430px`, desktop wide `max-w-[1120px]…[1200px]`, page bg `#F7F8FB`, content surface остаётся белым через carded layout |
| Header | `apps/webapp/src/shared/ui/PatientHeader.tsx` / `PatientGatedHeader.tsx` | sticky toolbar с `Back`/`Home` слева и иконками справа во всех patient-страницах | разделить home/inner/desktop поведение; убрать desktop `Back`, убрать top `Home`; profile справа; settings gear не показывать |
| Bottom nav | `apps/webapp/src/shared/ui/PatientBottomNav.tsx` | `fixed bottom`, mobile-контейнер `max-width: 430px`, `lg:hidden` (виден только `< lg`) | размеры/цвета по spec; скрывать `lg+` (desktop), оставлять `< lg` (mobile/tablet) |
| Nav config | `apps/webapp/src/app-layer/routes/navigation.ts` | `PATIENT_BOTTOM_NAV_ITEMS = [Сегодня, Запись, Разминки, План, Дневник]`; `patientNavByPlatform.*.headerRightIcons = ["profile"]` | состав bottom nav сохранить; `Профиль` остаётся top/right; добавить декларативный конфиг desktop top nav |
| Greeting | `apps/webapp/src/app/app/patient/home/PatientHomeGreeting.tsx` | `Здравствуйте` / `Здравствуйте, <name>` + статичный subtitle | time-of-day greeting (`Доброе утро`/`день`/`вечер`) с учётом app display tz; подписка по spec §10.1 |
| Button primitives | `apps/webapp/src/components/ui/button-variants.ts` | `variant: default/primary/outline/secondary/ghost/destructive/link`, sizes `xs..lg` + icon-* | расширить или добавить patient-специфичный `success` (appointment) и подкорректировать размеры под spec; не ломать doctor/admin |
| Patient card styles | `apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts` | один экспорт `patientHomeCardClass` с `rounded-3xl border bg-card p-4 shadow-md` | расширить до набора `base/compact/hero/success/warning/danger/gradientWarm`, явные mobile vs desktop размеры; для `useful_post` — оболочка без padding/bg текста базовой карточки (`patientHomeUsefulPostCardShellClass`), full-bleed обложка |
| Home layout | `apps/webapp/src/app/app/patient/home/PatientHomeTodayLayout.tsx` | grid `lg:grid-cols-[3fr_2fr]` с per-block ordering | mobile single column, desktop dashboard grid (см. §6.2), сохранить per-block placement |
| Hero | `apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.tsx` | image сверху (`aspect-[4/3]`), затем title/summary/CTA в карточке `patientHomeCardClass` | gradient hero, image справа снизу, badge row и accent duration line по §10.2 |
| Booking | `apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.tsx` | белая карточка, два CTA (`primary`, `outline`) | success-toned appointment card, success CTA + secondary outline CTA |
| Situations | `apps/webapp/src/app/app/patient/home/PatientHomeSituationsRow.tsx` | tile `w-[4.5rem]`, `h-14 w-14` icon box, нейтральные цвета | tiles по §10.4; цвет берётся из CMS asset, без slug-based colors |
| Progress | `apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx` | progress row + streak строкой ниже | progress + streak как одна двухколоночная карточка |
| Reminder | `apps/webapp/src/app/app/patient/home/PatientHomeNextReminderCard.tsx` | белая карточка с inline-link `Открыть напоминания` | warning-toned card по §10.6 |
| Mood | `apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.tsx` | белая карточка `patientHomeCardClass`, 5 круглых кнопок 11x11 | pastel check-in card по §10.7, 5 равных слотов с tap area `>= 44px` |
| SOS | `apps/webapp/src/app/app/patient/home/PatientHomeSosCard.tsx` | image-on-top карточка-ссылка, primary text-link | danger-toned card по §10.8 с red icon circle и icon fallback |
| Plan | `apps/webapp/src/app/app/patient/home/PatientHomePlanCard.tsx` | белая карточка с title/subtitle и primary text-link | plan card с leading icon, опциональным progress bar (если данные есть) и primary link |
| Subscription | `apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.tsx` | snap-x carousel, `min-w-[280px]…[320px]` | сохранить горизонтальный скролл; перевести на patient base/compact card primitives и patient badge |
| Courses | `apps/webapp/src/app/app/patient/home/PatientHomeCoursesRow.tsx` | вертикальный список карточек | оставить вертикальный список; перевести на patient base/compact card |
| Global CSS / tokens | `apps/webapp/src/app/globals.css` | в `:root` уже есть `--patient-bg`, `--patient-surface`, `--patient-radius`, `--patient-radius-lg`, `--patient-shadow`, `--patient-shadow-hover`, `--patient-touch`, `--patient-gap`; utilities `safe-padding-patient`, `safe-bleed-x`, `patient-iframe-bleed`, `safe-fab-br` | расширить и при необходимости переименовать токены в patient-scope (см. §7); сохранить обратную совместимость для `--patient-bg`, `--patient-surface`, `--patient-touch`, `--patient-gap`, потому что они уже используются (например `DiaryTabsClient.tsx`, `PatientHeader.tsx`) |

If an implementation needs a new file, prefer names that make the scope explicit:

- `apps/webapp/src/shared/ui/patientVisual.ts`
- `apps/webapp/src/shared/ui/PatientTopNav.tsx`
- `apps/webapp/src/app/app/patient/home/patientHomeVisual.ts`

Do not add a new generic UI package unless the primitive is demonstrably useful outside patient UI.

---

## 5. Navigation Decision

### 5.1. Mobile and tablet

Bottom navigation is the primary navigation for patient UI on mobile and tablet.

Recommended breakpoint:

- bottom nav: visible `< lg` (`< 1024px`), hidden `lg+`;
- desktop top nav: hidden `< lg`, visible `lg+`.

Bottom nav and desktop top nav must never be visible together at the same viewport width.

If visual QA shows that tablet landscape behaves more like PWA than desktop, the breakpoint can be raised to `xl` (`< 1280px`) in a follow-up. Start with `lg` for implementation simplicity.

Bottom nav items:

1. `Сегодня`
2. `Запись`
3. `Разминки`
4. `План`
5. `Дневник`

Rules:

- `Профиль` is not a bottom nav item.
- `Профиль` is a top/right icon.
- Settings are inside profile. Do not show a separate settings gear in patient header.
- `Home` is not shown in top header when bottom nav exists.
- On inner mobile pages `Back` may be shown when useful for mini-app/PWA navigation.

Visual requirements:

- Fixed bottom.
- Height: `72-80px` plus safe area.
- Background: `rgba(255,255,255,0.96)`.
- Border top: `#E5E7EB`.
- Shadow: `0 -4px 16px rgba(15, 23, 42, 0.04)`.
- Active icon/text: `#4F46E5`.
- Inactive icon/text: `#667085`.
- Label: `11-12px`, active `700`, inactive `500`.
- Icon: inactive `23-24px`, active `24-26px`.
- Center item (`Разминки`) may have a stronger active treatment when active, but it must not become a floating FAB.

### 5.2. Desktop

Desktop patient UI uses a top navigation bar. Desktop does not show a patient `Back` button.

Topbar layout:

- Left: brand icon/logo + текст `BersonCare` (короткий бренд для patient UI; не повторять eyebrow `BersonCare Platform` из default `AppShell`-варианта).
- Center/left after brand: nav items `Сегодня`, `Запись`, `Разминки`, `План`, `Дневник`.
- Right: notifications if enabled, profile icon/menu.

Desktop rules:

- Browser already has a back button; do not duplicate `Back` in patient UI.
- Do not show separate `Home`; `Сегодня` is the home nav item.
- Do not show a settings gear; settings live inside profile.
- Topbar should align to the same max-width as page content.

Topbar visual requirements:

- Height: `64-72px`.
- Page-level background remains `#F7F8FB`; topbar surface is white or near-white.
- Brand icon: `24px`.
- Brand text: `18px / 24px / 700`, color `#111827`.
- Nav item height: `40-44px`.
- Nav item radius: `12-14px`.
- Active bg: `#EEF2FF`, active text/icon: `#4F46E5`.
- Inactive text/icon: `#667085`; hover bg: `#F3F4F6` or patient muted.

---

## 6. Layout Breakpoints

Use existing Tailwind breakpoints. Do not invent custom breakpoints unless necessary.

- `sm`: `640px`
- `md`: `768px`
- `lg`: `1024px`
- `xl`: `1280px`

### 6.1. Mobile

- Target visual width: `390px`.
- Supported: `360-430px`.
- Must still work at `320px` without horizontal scroll.
- Patient container: `width: 100%`, `max-width: 430px`. Это намеренно у́же текущего `max-w-[480px]` (см. §4): сократить до `430px` при обновлении `AppShell` и `PatientBottomNav`.
- Horizontal padding: `16px` plus safe-area.
- Top padding: `12-16px`.
- Bottom padding: `88-96px` when bottom nav is visible.
- Large block gap: `16px`.
- Section gap: `20-24px`.
- Inner card gap: `8-12px`.

### 6.2. Desktop

- Page max-width: `1120-1200px`.
- Content padding: `24-32px`.
- Dashboard grid gap: `20-24px`.
- Main dashboard columns: `2fr 1fr` or current `3fr 2fr` if visual QA confirms it matches reference.
- **Patient home «Сегодня» (`lg+`, `lg:grid-cols-12`) — фактическая финальная сетка 2026-05-01:** верхний ряд — разминка (`daily_warmup`, 8) + полезный пост (`useful_post`, 4); второй — ситуации (8) + запись (`booking`, 4); третий — прогресс (8) + ближайшее напоминание (4); затем компактный ряд `mood_checkin` (4) + `sos` (4) + `plan` (4); далее `subscription_carousel` на всю ширину (12); `courses` — хвостовой full-width ряд (12) при наличии карточек.
- Single-column content pages: max-width `720-760px`.

---

## 7. Patient Visual Tokens

Implement tokens in patient scope, not globally across doctor/admin.

Preferred scope:

```css
#app-shell-patient {
  --patient-bg: #F7F8FB;
  --patient-card: #FFFFFF;
  --patient-border: #E5E7EB;
  --patient-text: #111827;
  --patient-text-secondary: #667085;
  --patient-text-muted: #98A2B3;
}
```

Do not rely only on global `--primary` if changing it would affect doctor/admin. Use patient tokens or patient-scoped overrides.

### 7.1. Base colors

- Page background: `#F7F8FB`.
- Card background: `#FFFFFF`.
- Neutral border: `#E5E7EB`.
- Text primary: `#111827`.
- Text secondary: `#667085`.
- Text muted: `#98A2B3`.
- Disabled bg: `#F2F4F7`.
- Disabled text: `#98A2B3`.

### 7.2. Semantic colors

Акцентный primary на главной пациента и в patient-scope UI фактически задан токенами из §7.5 (`--patient-color-primary`, мягкий фон `--patient-color-primary-soft`). Значения ниже в блоке «Primary / warmups» — ориентир для legacy/нейтральных состояний и не должны противоречить §7.5 там, где речь о текущей реализации «Сегодня».

Primary / warmups:

- Primary: `#4F46E5`.
- Primary dark: `#4338CA`.
- Primary light bg: `#EEF2FF`.
- Primary softer bg: `#F3F0FF`.
- Primary text: `#3730A3`.

Appointment / success:

- Success: `#16A34A`.
- Success dark: `#15803D`.
- Success light bg: `#ECFDF3`.
- Success border: `#BBF7D0`.
- Success text: `#166534`.

Reminder / warning:

- Warning: `#F59E0B`.
- Warning dark: `#D97706`.
- Warning light bg: `#FFFAEB`.
- Warning border: `#FDE68A`.
- Warning text: `#92400E`.

SOS / danger:

- Danger: `#EF4444`.
- Danger dark: `#DC2626`.
- Danger light bg: `#FEF2F2`.
- Danger border: `#FECACA`.
- Danger text: `#B91C1C`.

### 7.3. Radii and shadows

Define a small patient radius/shadow scale and reuse it.

Current `patient home` tokens after 2026-05-01 visual QA:

- `--patient-card-radius-mobile`: `10px`.
- `--patient-card-radius-desktop`: `12px`.
- `--patient-hero-radius-mobile`: `12px`.
- `--patient-hero-radius-desktop`: `14px`.
- `--patient-pill-radius`: `10px`.

Legacy/older reference values (`20px+` cards, fully rounded pills) are no longer the target for the current home screen. Do not change button radii when adjusting these card/badge tokens.

- Mobile base card shadow: `0 4px 14px rgba(15, 23, 42, 0.04)`.
- Desktop base card shadow: `0 8px 24px rgba(15, 23, 42, 0.05)`.
- Nav shadow: `0 -4px 16px rgba(15, 23, 42, 0.04)` for bottom nav.

### 7.4. Migration of existing CSS variables

В `:root` уже определены: `--patient-bg`, `--patient-surface`, `--patient-radius`, `--patient-radius-lg`, `--patient-shadow`, `--patient-shadow-hover`, `--patient-touch`, `--patient-gap`. Они используются в текущем коде (например `AppShell.tsx`, `PatientHeader.tsx`, `PatientBottomNav.tsx`, `DiaryTabsClient.tsx`).

Стратегия миграции:

- **Не удалять** существующие переменные одним коммитом. Сначала добавить новые `--patient-radius-sm/md/lg/xl/pill`, `--patient-shadow-card`, `--patient-shadow-card-desktop`, `--patient-shadow-nav`, `--patient-bg`, `--patient-card`, `--patient-border`, `--patient-text`, `--patient-text-secondary`, `--patient-text-muted` рядом со старыми.
- **Старые имена** `--patient-bg`, `--patient-surface`, `--patient-touch`, `--patient-gap` сохранить минимум до завершения foundation phase. Допустимо переопределить их значения на новые токены (например `--patient-bg: #F7F8FB`).
- `--patient-radius` (`12px`) и `--patient-radius-lg` (`16px`) с текущей семантикой не совпадают с новой шкалой. Переопределять их не безопасно: они используются как small/medium radius. Поэтому ввести новые имена и постепенно заменять usages, не трогая старые значения, пока есть зависимости.
- В новом коде использовать только новые имена.
- В `LOG.md` зафиксировать список оставшихся usages старых переменных и план их замены.

### 7.5. Текущее выравнивание patient home (обновление 2026-04)

Фактические акценты главной «Сегодня» в webapp (для согласования спеки с кодом):

- Primary в patient-scope: `#284da0` (`--patient-color-primary`), мягкий фон под primary‑элементы: `#e8eefb` (`--patient-color-primary-soft`).
- Страница / контентная поверхность в patient shell: белый фон `#ffffff` для основной области (см. `--patient-card-bg` / shell).
- Заголовки малых блоков главной (`patientHomeBlockHeadingClass`) должны читать числовые параметры из общих токенов `--patient-block-heading-font-size`, `--patient-block-heading-line-height`, `--patient-block-heading-font-weight` и цвет из `--patient-block-heading`. Позиция заголовков не унифицируется принудительно: часть заголовков остаётся внутри карточек, часть — section-heading над списком/каруселью.

---

## 8. Typography

Do not connect a new font. Use the existing project/system font via current font variables.

### 8.0. Open issue: block heading fonts (2026-05-01)

Статус: **не решено**, переносится в отдельный follow-up.

Проблема: заголовки `Как вы себя чувствуете?`, `Выберите пользу для себя:`, `Материалы по подписке` визуально всё ещё воспринимаются как несинхронизированные, хотя в коде они сведены к одному `patientHomeBlockHeadingClass`. Последний проход вынес только size / line-height / weight в CSS variables:

- `--patient-block-heading-font-size: 0.875rem`;
- `--patient-block-heading-line-height: 1.25rem`;
- `--patient-block-heading-font-weight: 600`.

Что не доказано и требует следующего pass:

- фактический computed `font-family` для заголовков внутри карточек и section-heading вне карточек;
- влияние разных фоновых контекстов (градиентная mood-card, белая situations-card, page background у subscription);
- различие tag/context (`h2`/`p`, внутри padding карточки vs внешний заголовок секции);
- нужно ли добавить отдельный токен `--patient-block-heading-font-family` и явно применить его в `patientHomeBlockHeadingClass`.

### 8.1. Mobile

- Page title: `28px / 34px / 700`, letter spacing `-0.02em`, color `#111827`.
- Greeting title: `17-18px / 24px / 700`.
- Greeting subtitle: `14px / 20px / 400`, color `#667085`.
- Section title: `18px / 24px / 700`.
- Card title: `18-20px / 24-28px / 700`.
- Hero title: `28-30px / 34-36px / 800`, letter spacing `-0.03em`.
- Hero accent line: `26-28px / 32-34px / 800`, color `#4F46E5`.
- Body: `15-16px / 22-24px / 400`.
- Meta: `12-13px / 16-18px / 500`.
- Bottom nav label: `11-12px / 14-16px`, inactive `500`, active `700`.

### 8.2. Desktop

- Page title: `32-36px / 40px / 700`.
- Hero title: `34-40px / 42-48px / 800`.
- Section title: `20-22px / 28px / 700`.
- Card title: `20-24px / 28-32px / 700`.
- Body: `16px / 24px`.
- Meta: `13-14px / 18-20px`.

---

## 9. Core Patient Primitives

### 9.1. Buttons

Prefer extending `apps/webapp/src/components/ui/button-variants.ts` over adding one-off classes.

Required patient variants:

- Primary: bg `#4F46E5`, hover/active `#4338CA`, white text.
- Success/appointment: bg `#16A34A`, hover/active `#15803D`, white text.
- Secondary: white, border `#E5E7EB`, text `#111827`.
- Ghost/link: transparent, text `#4F46E5`.
- Danger/SOS: white, border `#EF4444`, text `#DC2626`.

Recommended sizes:

- Primary mobile: `48-52px` height, radius `14-16px`, font `15-16px / 20-24px / 700`.
- Primary desktop: `52-56px`.
- Appointment mobile: `42-48px`.
- Secondary mobile: `40-44px`.
- Ghost/link: `32-40px`.
- Icon gap: `8-10px`.

If adding generic variants to `buttonVariants` would impact doctor/admin, use patient-specific wrapper/helper classes and keep them under patient scope.

### 9.2. Cards

Extend `patientHomeCardStyles.ts` from one base class into reusable patient card styles. Текущий экспорт `patientHomeCardClass` использует `rounded-3xl` (24px) и одну shadow для всех ширин — это намеренно меняется на mobile-vs-desktop scale ниже.

Minimum variants:

- `base`: white card, neutral border, radius `20px` mobile / `24px` desktop.
- `compact`: radius `16-20px`, padding `12-18px`, min-height `72-104px`.
- `hero`: primary gradient, border `#DDD6FE`, radius `24px` mobile / `28px` desktop.
- `success`: appointment card.
- `warning`: reminder card.
- `danger`: SOS card.
- `gradientWarm`: mood/check-in card.

Base card:

- Mobile: background `#FFFFFF`, border `1px solid #E5E7EB`, radius `20px`, padding `16px`, shadow `0 4px 14px rgba(15, 23, 42, 0.04)`.
- Desktop: radius `24px`, padding `20-24px`, shadow `0 8px 24px rgba(15, 23, 42, 0.05)`.

Цветные варианты карточек (success/warning/danger/gradientWarm) сейчас в коде нет — все home-карточки используют один `patientHomeCardClass`. При внедрении не делать tone-варианты как полные копии, а как extensions общего base.

### 9.3. Badges

Use a shared patient badge primitive/style.

- Height: `28-32px`.
- Padding-x: `10-12px`.
- Radius: full.
- Font: `12-13px / 16px / 700`.
- Primary badge: bg `#EEF2FF`, text `#3730A3`.
- Duration badge: bg white, text `#4F46E5`, border `#E0E7FF`.
- Success badge: bg `#DCFCE7`, text `#166534`.
- Warning badge: bg `#FEF3C7`, text `#92400E`.
- Danger badge: bg `#FEE2E2`, text `#B91C1C`.

### 9.4. Icons

Keep `lucide-react` for system UI icons. Use CMS images for content-specific icons.

- Header icons: actual icon `24px`, tap area `>= 44px` (см. §12 Accessibility); рекомендуемый desktop tap area `44-48px`.
- Situation icon box: `58-64px` mobile / `72-80px` desktop.
- Situation actual icon/image: `28-34px` mobile / `36-42px` desktop.
- Card leading icon box: `44-48px` mobile / `52-56px` desktop.

Situation icons:

- Prefer CMS `icon_image_url` with color already in the asset.
- Do not map color by slug/title from [`CONTENT_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/CONTENT_PLAN.md).
- If no `icon_image_url`, use a deterministic neutral fallback by item order or initials; do not infer category-specific color from slug.

---

## 10. Patient Home Blocks

All blocks below must reuse the patient primitives from this document.

### 10.1. Greeting/header area

Home page greeting should look like the reference but respect data availability.

Mobile home:

- No top `Back`.
- No top `Home`.
- Left: greeting content. If avatar data is unavailable, use no avatar or initials placeholder.
- Right: notifications/profile.
- Title example: `Доброе утро, Анна!` when full patient tier and name is available.
- Fallback: `Доброе утро!`, `Добрый день!`, `Добрый вечер!` based on app display timezone.
- Subtitle: `Забота о себе — это сила` (starter copy; владелец продукта может уточнить в CMS/копирайте без изменения компонента).

Inner mobile pages:

- May show `Back` when useful.
- Do not show top `Home`.
- Right icons remain profile/notifications as appropriate.

Desktop:

- Greeting is content inside page, not topbar navigation.
- Topbar contains brand/nav/profile.
- No desktop `Back`.

### 10.2. Hero card: `daily_warmup`

The hero card is the most important visual block. It must be redesigned as a proper hero, not a standard image-on-top card.

**Текущая реализация webapp (patient home):** градиент фона `linear-gradient(205deg, #f1ecf1 10%, #f9f4ff 52%, #fafaf5 80%)`; mobile высота от `min-h-[192px]` и `min-[380px]:min-h-[204px]`; desktop слот `h-[300px]`; внутренние отступы `p-4` / `lg:p-5`; бейджи верхнего ряда высотой `24px` (`h-6`), типографика `text-[11px] font-semibold` для pill «Разминка дня» / длительности; image-slot справа снизу с фиксированными размерами по breakpoint (см. `patientHomeHeroImageSlotClass`); CTA блок с отступами `pt-6 pb-3 lg:pb-[34px]`.

Mobile:

- Min-height: `300-360px`.
- Radius: `24px`.
- Padding: `20px`.
- Background: `linear-gradient(135deg, #F3F0FF 0%, #EEF2FF 100%)`.
- Border: `1px solid #DDD6FE`.
- Overflow hidden.
- Badge row: left `Разминка дня`, right duration badge if duration is known or fallback `3 мин` only if product accepts fallback.
- Title: `28-30px / 34-36px / 800`.
- Accent duration line: `26-28px / 32-34px / 800`, color primary.
- Description: `15-16px / 23-24px`, max-width `240-260px`.
- CTA: primary button `Начать разминку`, icon optional.
- Image: position right bottom, width `150-190px`, max-height `230-280px`.

Desktop:

- Min-height: `360-420px`.
- Radius: `28px`.
- Padding: `28-32px`.
- Hero title: `36-40px / 44-48px`.
- Accent line: `34-38px / 42-46px`.
- Description max-width: `360-420px`.
- Image width: `260-360px`, max-height `360-420px`.

Asset fallback:

- If `imageUrl` is empty, keep hero height and show a subtle decorative radial gradient or abstract shape.
- Do not collapse hero into a small empty card.

### 10.2.1. Cover card: `useful_post`

Карточка без заголовка блока и без leading-icon: одна CMS-страница (`content_page`), обложка на всю карточку, градиент затемнения снизу, заголовок страницы поверх (белый текст). Опциональный бейдж из `badge_label` (продуктовый дефолт копирайта — «Новый пост»), только если строка непустая. Визуальная оболочка — `patientHomeUsefulPostCardShellClass` (border/radius/shadow без «белого» padding-блока базовой карточки; контент и отступы задаются внутри cover-слоя).

В настройках главной врача: две галочки — «Отображать заголовок текстом» (`show_title`) и «Показывать бейдж «Новый пост»» (`badge_label`). Если для item задан произвольный текст в `badge_label`, при сохранении с включённым чекбоксом бейджа текст заменяется на канонический «Новый пост»; UI показывает пояснение в этом случае.

Mobile:

- Минимальная высота карточки ~`172px`, padding контента `16px`.
- Заголовок: до 3 строк (`line-clamp-3`), `20px / medium`.

Desktop:

- Высота ряда с разминкой: `300px` ( companion к hero ).
- Padding контента `20px`.

Нет отдельного summary на карточке (при необходимости расширять отдельным решением).

### 10.3. Appointment card: `booking`

Mobile:

- Background `#ECFDF3`.
- Border `#BBF7D0`.
- Radius uses current card token (`--patient-card-radius-mobile`, currently `10px`).
- Padding `14-16px`.
- Min-height `104-128px`.
- Layout may be horizontal when space permits: icon + text + actions.
- Button `Записаться` uses success variant.
- Button `Мои приёмы` uses secondary variant.

Desktop:

- Radius uses current card token (`--patient-card-radius-desktop`, currently `12px`).
- Padding `20px`.
- Target height в ряду рядом с **situations**: ~`170px` (компактная карточка, не companion hero).
- Icon перед заголовком в зелёном круге (`#dcfce7`), кнопки в один ряд на desktop фиксированной ширины (~`8.75rem` каждая).
- Designed as the right-column companion to **situations** on the second dashboard row.

### 10.4. Quick situations: `situations`

Section container:

- Обернуть блок в базовую patient-карточку (`patientHomeCardClass`): высота desktop ~`170px`, padding `16px` mobile / `20px` desktop.
- Заголовок: продуктовый текст `Выберите пользу для себя:`; типографика через `patientHomeBlockHeadingClass`. На mobile заголовок в текущей реализации скрыт, чтобы блок ситуаций выглядел как компактная карусель под hero.

Section heading:

- Link `Все ситуации`: `14px / 20px / 600`, primary.

Item:

- Горизонтальный скролл на mobile; на desktop — сетка до 6 колонок.
- Mobile item width: ~`76px`; desktop — равномерная сетка.
- Icon box: мягкий primary-soft фон, лёгкое кольцо границы; без отдельной «плитки-карточки» вокруг айтема.
- Label margin-top: `8px`.
- Label mobile: `13px / 18px / 500`.
- Label desktop: `14px / 20px / 500`.

Color rule:

- Do not hardcode category colors by slug/title.
- If product wants exact category colors, add an explicit CMS/admin style field in a separate scoped change.
- Without a style field, show CMS icon assets on neutral/pastel tiles.

### 10.5. Progress + streak: `progress`

Render progress and streak as one card with two visual regions.

Mobile:

- Card: base white, radius `20px`, padding `16px`, min-height ~`150px`.
- Title: `Сегодня выполнено`, `16px / medium`.
- Main value: показывать как **`{n} из {target}`** (число цели крупнее/primary, «из N» — secondary/muted), например `28px / semibold` + `24px / semibold` для suffix.
- Progress bar height: `8px`, bg `#E5E7EB`, fill primary (`var(--patient-color-primary)`).
- Hint: `14px / 20px`, secondary.
- Streak: круг `white` с кольцом `ring-[8px] ring-[#f3f4f6]`, внутри иконка и число серии; подпись «дней подряд» под кругом.

Layout:

- Desktop target row height ~`150px` после compact QA.
- Grid: основная колонка + узкая колонка под streak (`4.5rem` на mobile, `7.5rem` на `lg`). На mobile сохраняется вертикальный divider; на desktop — белый круг streak с `ring-[8px]`.
- Подпись `дней подряд` должна переноситься на две строки и оставаться внутри круга.

### 10.6. Reminder: `next_reminder`

Mobile:

- Background `#FFFAEB`.
- Border `#FDE68A`.
- Radius `18-20px`.
- Padding `14-16px`.
- Min-height ~`150px`.

Leading icon:

- Контейнер `44px`, radius `16px`, фон `#FEF3C7`, warning icon color.

CTA:

- Не на всю ширину на desktop: компактная кнопка ~`8.75rem`, `rounded-xl`, border `#FDE68A`, фон `#FFFBEB`, текст `#D97706`.

Desktop:

- Min-height/height ~`150px`.
- Label: `13px / 18px / 500`, warning brown text.
- Title/time line: `18px / 24px / semibold`.
- Description hidden on `lg` in empty/active compact card if it breaks height parity with progress.

### 10.7. Mood check-in: `mood_checkin`

Mobile:

- Background: `linear-gradient(135deg, #FFF7ED 0%, #FFF1F2 100%)`.
- Border: `#FED7AA`.
- Radius: `20px`.
- Padding: `16px`.
- Fixed compact height in current home row: `132px` mobile, `136px` `sm/lg`.
- Title: `Как вы себя чувствуете?`.
- Subtitle removed from the current card; no default status text before user action.

Mood buttons:

- Five equal slots.
- Tap area: `44-52px`.
- Circle/image fills the round button slot (`size-full` for CMS image; fallback icon `40-44px`).
- Border is thin (`1px`) and color-matched to score; hover border is intentionally slightly brighter than the resting border.
- Active state is pale score-colored bg + subtle `ring-1`, not a heavy primary ring.
- Use configured mood icons from `patient_home_mood_icons` when available.
- Fallback emoji is acceptable until CMS assets are configured.

### 10.8. SOS: `sos`

Mobile:

- Background `#FEF2F2`.
- Border `#FECACA`.
- Radius uses current card token (`--patient-card-radius-mobile`, currently `10px`).
- Padding `14-16px`.
- Min-height `96-120px`.
- Leading icon circle: `48px`, bg `#EF4444`, icon white.
- Title: `Если болит сейчас`.
- Text: `Рекомендации по облегчению боли`, `14px / 20px`.
- Button text: `Быстрая помощь`. Button is white with darker calmer danger outline/text (`#b91c1c` / `#991b1b` in current override), positioned right and close to the bottom edge.
- The card itself is not a link and must not translate/move on hover; only the CTA link is interactive.

If CMS item has no image:

- Show a red circle with `Zap`, `AlertCircle`, or equivalent lucide icon.
- Do not use a large empty image placeholder.

### 10.9. My plan: `plan`

Mobile:

- Base white card.
- Radius uses current card token (`--patient-card-radius-mobile`, currently `10px`).
- Padding `16px`.
- Fixed compact height: `136px`.
- Section title: `Мой план реабилитации`.
- Empty-state subtitle: `Назначит специалист или выберите готовую программу`; do not show `Нет активного плана`.
- Empty-state link: `Выбрать курс`, primary ghost link, right/bottom aligned.
- Active link: `Смотреть план`, primary ghost link, right/bottom aligned.
- Icon container: `48px`, bg `#EEF2FF`, icon primary.
- Program title: `15-16px / 22px / 700`.
- Meta: `13-14px / 18-20px`.
- Percent: `14-15px / 20px / 600`.
- Progress height: `6-8px`.

If no active plan exists, render the compact empty-state above; do not omit the block when CMS has it enabled.

### 10.10. Subscription carousel and courses

Use the same base card primitives.

Subscription cards (`PatientHomeSubscriptionCarousel.tsx`):

- Horizontal scroll on mobile.
- Snap alignment on mobile; desktop is a full-width grid row.
- Badge uses patient badge primitive.
- Image ratio can remain content-dependent, but cards should visually match the soft radius/shadow system.
- If only one subscription card exists on desktop, it may span the full row.

Courses (`PatientHomeCoursesRow.tsx`):

- Use base/compact patient card style.
- If there are no course cards, render nothing on the patient home page.
- Do not mix course engine changes into this visual task.

---

## 11. Empty, Loading, Guest and Access States

Reference images show the ideal full-data state. The real app must keep stable layouts when data is missing.

Rules:

- Blocks with zero CMS items may remain hidden if that is current behavior and product accepts it.
- Hero must not visually collapse when `daily_warmup` is missing; show a polished empty state.
- Progress loading should use skeleton or reserved space, not plain text that changes card height.
- Mood disabled/guest states should use the same card shell and a clear CTA/copy.
- Guest/auth-only restrictions must not leak personal data.
- Do not introduce subscription gating when showing subscription badges.

---

## 12. Accessibility

Minimum requirements:

- All interactive targets are at least `44x44px`. Visual icon size может быть меньше (например `22-24px`), но кликабельная область должна быть `>= 44px`.
- All icon-only buttons have `aria-label`.
- Active nav item uses `aria-current="page"`.
- Mood buttons expose `aria-pressed` and meaningful labels.
- Progress uses `role="progressbar"` with values.
- Focus visible state is preserved for buttons, links, nav items and mood controls.
- Color pairs must meet WCAG AA for body text; verify especially warning/danger pastel backgrounds with muted text.

---

## 13. Implementation Order

Recommended order for an execution agent:

1. Inventory existing styles/components listed in section 4.
2. Add/update patient-scoped tokens in `globals.css`.
3. Update patient shell sizing/background/safe padding in `AppShell`.
4. Implement navigation model: bottom nav below desktop, top nav on desktop, no desktop back, profile right.
5. Extend button/card/badge/icon primitives.
6. Refactor patient home blocks to use primitives, starting with hero and booking.
7. Update progress/reminder/mood/SOS/plan/subscription/courses.
8. Update tests for changed semantics/navigation.
9. Run scope-appropriate checks from repository policy.
10. Record deviations/known visual gaps in `LOG.md`.

Do not start redesigning other patient pages until the home/foundation pass is stable.

---

## 14. Test Expectations

Avoid brittle snapshot tests for visual layout.

### 14.1. Required coverage (new or extended)

- `PatientBottomNav`: correct items, active state, `aria-current`. Тесты для bottom nav сейчас отсутствуют (`apps/webapp/src/shared/ui/PatientBottomNav.test.tsx` нет) — добавить новый файл.
- Desktop top nav: новый компонент, добавить тест на brand `BersonCare`, expected items, active state.
- Patient shell: расширить `apps/webapp/src/shared/ui/AppShell.test.tsx` — bottom nav absent when desktop top nav is used; hidden when `patientHideBottomNav` / embed mode applies.
- `PatientHeader`: расширить `apps/webapp/src/shared/ui/PatientHeader.test.tsx` — на home page нет top `Home` button, на desktop нет patient `Back`, settings gear отсутствует.
- Hero card: renders CTA, badge/title/summary/image or image fallback.
- Booking card: renders both booking and appointments CTAs with correct links for guest/auth states.
- Progress: progressbar values and streak text.
- Mood: active selection, disabled/submitting state, labels.
- SOS: icon fallback when no image.

### 14.2. Existing tests that will need updates

При визуальном редизайне ожидается, что эти тесты потребуют синхронной правки. Не удалять — проверять и корректировать assertions, которые завязаны на старом DOM/классах:

- `apps/webapp/src/app/app/patient/home/PatientHomeToday.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeTodayLayout.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSituationsRow.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeNextReminderCard.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSosCard.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeNewsSection.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeMailingsSection.test.tsx`
- `apps/webapp/src/shared/ui/AppShell.test.tsx`
- `apps/webapp/src/shared/ui/PatientHeader.test.tsx`

Семантические assertions (`role`, `aria-*`, наличие CTA, наличие текста) должны остаться. Тесты на конкретные Tailwind-классы переписать на проверку поведения, а не классов.

### 14.3. Visual QA targets

- Chrome desktop at `1280px`.
- Tablet width around `768-1024px`.
- Mobile `390px`.
- Narrow mobile `320-360px`.
- Telegram/MAX WebView if available.

---

## 15. Acceptance Criteria

The visual redesign pass is acceptable when:

- Patient UI uses the new patient-scoped tokens and shared primitives.
- Mobile home visually matches the reference direction: soft page bg, large warmup hero, success booking card, pastel mood/SOS/reminder cards, fixed bottom nav.
- Desktop home uses top navigation with brand and no patient `Back`.
- Bottom nav items are `Сегодня`, `Запись`, `Разминки`, `План`, `Дневник`.
- Profile is top/right, not a bottom nav item.
- Settings gear is not shown as a separate patient header action.
- Existing patient logic and CMS-driven block model are preserved.
- No doctor/admin visual regressions are intentionally introduced.
- No runtime slug hardcode from [`CONTENT_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/CONTENT_PLAN.md) is added.
- Tests and lints appropriate to the changed files pass.

---

## 16. Known Product Decisions

Confirmed decisions from product discussion:

- Tablet can keep bottom nav; desktop should move all primary navigation into a top line.
- Desktop does not need a patient `Back` button because browser navigation exists.
- Desktop topbar must show brand icon/logo and `BersonCare`.
- Bottom nav keeps `Дневник`; `Профиль` moves to the top/right.
- Settings move inside profile; no separate settings gear in patient header.
- The reference images are examples; navigation intentionally differs from them where listed above.

