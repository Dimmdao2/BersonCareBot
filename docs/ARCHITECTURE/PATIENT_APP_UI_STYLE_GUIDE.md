# PATIENT_APP_UI_STYLE_GUIDE

Единый стандарт для визуальной разработки patient UI: что переиспользуем, где допустим кастом, и как не размывать общий стиль в новых редизайн-этапах.

## 0. Терминология: «ЛФК» и программа реабилитации (с 2026-05-09)

В **пользовательских текстах** кабинета пациента слова **«ЛФК»**, **«ЛФК занятие»**, **«программа ЛФК»** означают **программу реабилитации** (назначенный план лечения), а не отдельный UX-сценарий вокруг «комплекса ЛФК». Пациентский продукт **не** опирается на «комплекс ЛФК» как на самостоятельную навигационную сущность. Каноническое правило для агентов: `.cursor/rules/patient-lfk-means-rehab-program.mdc`.

## 1. Source of Truth

Для patient UI опираемся на три слоя:

1. `apps/webapp/src/shared/ui/patientVisual.ts` — patient-specific shared classes (surface, typography, actions, page layout).
2. `apps/webapp/src/app/globals.css` (`#app-shell-patient`) — токены patient темы (`--patient-*`, `--patient-surface-*`).
3. `apps/webapp/src/components/ui/*` — базовые shadcn/base-ui primitives (`Button`, `Card`, `Badge`, `Input`, `Textarea`, `Dialog`, `Tabs`, `Switch`, `Select`, `Tooltip`).

`apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts` — это отдельный home-specific слой. Его fixed geometry, hero-обвязку и dashboard-позиционирование нельзя механически переносить на внутренние страницы.

## 2. Reuse-First Policy

Перед добавлением любого нового UI на patient-страницах:

1. Проверить, нет ли готового класса в `patientVisual.ts`.
2. Если нет — проверить подходящий primitive в `components/ui/*`.
3. Только если оба шага не покрывают задачу, вводить кастомный локальный UI.

Нельзя создавать одноразовые локальные реализации карточек/кнопок/бейджей/аккордеонов/форм-контролов, если уже есть shared или shadcn/base-ui вариант.

## 3. Что Уже Считается Общим Patient Layer

Минимальный набор, который нужно переиспользовать по умолчанию:

- Surfaces: `patientCardClass`, `patientCardCompactClass`, `patientListItemClass`, `patientSectionSurfaceClass`, `patientFormSurfaceClass`.
- Semantic tones: `patientSurfaceNeutralClass`, `patientSurfaceInfoClass`, `patientSurfaceSuccessClass`, `patientSurfaceWarningClass`, `patientSurfaceDangerClass`.
- Typography/layout: `patientSectionTitleClass`, `patientBodyTextClass`, `patientMutedTextClass`, `patientPageTitleClass`, `patientPageSubtitleClass`, `patientPageHeaderClass`, `patientInnerPageStackClass`, `patientInnerCardGridClass`.
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

**`Select` (выпадающий список):** если `value` — нечитаемый ключ (id, enum), а в закрытом поле нужна русская подпись, см. `.cursor/rules/ui-select-trigger-display-label.mdc` и комментарий в `components/ui/select.tsx` (`items` / явный `SelectValue`).

Нельзя менять глобальные doctor/admin-паттерны ради локального patient-эксперимента.

## 6. Правило Для Редизайн-Этапов

В любых будущих page-redesign/style-pass работах:

- не придумывать новый “локальный chrome” в компонентах, если shared слой уже покрывает кейс;
- не расширять scope в product/content/API/DB/env;
- deferred-экраны (`/messages`, `/emergency`, `/lessons`, `/address`, `/intake/*`, booking landing) стилизовать только в рамках отдельно подтверждённых фаз App Restructure / профильных инициатив.

## 7. Когда Кастом Разрешён

Кастом допустим только если:

1. Нет подходящего shared/shadcn примитива.
2. Есть явная продуктовая причина (новый паттерн, который не выражается текущими средствами).
3. Причина зафиксирована в документации активной инициативы/логе.

Без этих трёх условий кастом считается архитектурным долгом.
