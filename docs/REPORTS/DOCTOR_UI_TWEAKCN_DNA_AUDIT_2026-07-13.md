# Doctor UI tweakcn / Design DNA audit — 2026-07-13

Короткий вывод: текущий интерфейс уже неплохо структурирован вокруг `DoctorAppShell`, `DoctorPageHeader`, `DoctorSection` и catalog primitives, но визуально он еще не живет в Design DNA. Самое большое расхождение не в одном цвете или шрифте, а в смеси старых карточек, списков, теней, локальных цветов и разных layout-паттернов.

## Что подключено

- Добавлен app-level hook для tweakcn/DNA-токенов: `apps/webapp/src/app/styles/bersoncare-tweakcn-theme.css`.
- Он импортируется из `tailwind-engine.css`, поэтому Tailwind v4 видит `bc-*` theme tokens.
- Live-интерфейс не переключен глобально на Nunito/теплый canvas. Для безопасного preview есть opt-in scope: `.theme-bersoncare-dna` или `[data-theme="bersoncare-dna"]`.

Причина: Design DNA близок к финалу, но шрифт/теплота фона еще будут проверяться на живом продукте. Поэтому сейчас нужен управляемый theme hook, а не внезапный глобальный редизайн.

## Расхождение с Design DNA

### 1. Токены

Сейчас:

- базовый фон в app engine белый;
- primary — старый приглушенный HSL-синий;
- нейтрали частично холодные/серые;
- шрифт системный;
- часть chart/status цветов захардкожена прямо в компонентах.

DNA:

- теплый canvas `#F6F4EF` или белый как осознанная поверхность;
- моно-синий `#386FBA`;
- графитовый текст `#232A31`, не черный;
- теплые линии `#EFECE4`;
- Nunito как кандидат/текущий DNA-v1.1 выбор, но не финальное решение для live.

Оценка: расхождение средне-большое. Его можно сильно уменьшить токенной миграцией без переписывания экранов, но только после структурных правок списков/layouts.

### 2. Списки

Сейчас:

- catalog row обычно `rounded-md` + заливка `bg-primary/15`;
- много карточных/list-item вариантов;
- местами строки выглядят как маленькие карточки.

DNA:

- списки — ключевой компонент;
- строки плоские, с hairline-разделителем во всю ширину;
- selected state — полоска слева + вес/синий текст, а не крупная заливка;
- pill/сильное скругление для строк запрещены.

Оценка: это главное визуальное расхождение для кабинета врача. Даже если подобрать правильные цвета через tweakcn, текущие list rows все равно будут отличаться по характеру.

### 3. Карточки и глубина

Сейчас:

- doctor-гайд уже двигает нас к border-first, без тяжелых теней;
- но в коде еще много `shadow-sm`, `shadow-md`, `shadow-lg`;
- встречается `rounded-2xl`;
- разные страницы используют разные card chrome.

DNA:

- теплая рамка, микротень, но без material-heavy тени;
- карточки/панели мягче, radius до 14px;
- depth должен быть тихим и одинаковым.

Оценка: расхождение среднее. Направление правильное, но нужна унификация shared chrome.

### 4. Типографика

Сейчас:

- в doctor guide зафиксирована компактная шкала;
- в коде все еще встречаются `text-xl`, `text-3xl`, `text-lg`, `text-[13px]`;
- `doctorMetricValueClass` сейчас `text-xl`, а сам гайд говорит про KPI `text-2xl`.

DNA:

- легкий вес по умолчанию;
- заголовки 600, потолок 700;
- body 400;
- никаких тяжелых/восторженных заголовков.

Оценка: среднее. Тут важнее не сразу менять font-family, а сначала закрыть разнобой размеров и весов.

### 5. Цвета графиков и статусов

Сейчас:

- в analytics/material ratings/schedule/patient card много прямых hex и Tailwind blue/green/purple/orange;
- графики выглядят как отдельный мир от общей палитры.

DNA:

- моно-синий как ядро;
- зеленый только маленький success-marker;
- функциональные цвета приглушенные и точечные;
- палитра аналитики пока отдельный открытый вопрос.

Оценка: большое расхождение, но оно P2: сначала layout/list/card, потом chart palette.

## Потенциально кривые места

1. **CMS hub и media library.** В текущей base-ветке они остаются outlier-layouts: CMS смешивает навигацию, список и inline editor; media library одноколоночная, хотя продуктово просится дерево/список слева и содержимое справа.

2. **Settings/admin forms.** Много старого `CardContent gap-6`, `space-y-6`, отдельных секций и больших промежутков. Это выглядит менее плотным и менее цельным, чем doctor catalog pages.

3. **Patient card / entity card.** Самая большая зона внутреннего разнобоя: local panels, shadows, hardcoded colors, chart SVG, разные tab/body grids. Нужна отдельная волна по entity-card chrome.

4. **Schedule/calendar.** FullCalendar и branch colors живут со своей палитрой и своими hardcoded backgrounds. Это нормально как сложный виджет, но визуально он пока не DNA-aligned.

5. **Analytics/material ratings.** Функционально нормально, визуально много chart-specific цветов и старого dashboard-характера.

6. **Shared doctor primitives.** `doctorVisual.ts` сам местами расходится с новым гайдом: например editor section с `shadow-sm`, KPI `text-xl`, часть card chrome еще не совпадает с DNA.

7. **Navigation/flyouts.** Основная проблема не критичная, но есть `shadow-md`, ring и filled active states. Под DNA лучше сделать тише: теплый material/flyout, меньше синей заливки, больше line/weight/strip.

## Рекомендованный порядок

1. **Сначала структура:** довести CMS и media library до master-detail/list-detail модели, не занимаясь финальным цветом.
2. **Потом shared primitives:** list row, card chrome, metric card, section shell, nav active state.
3. **Потом токенная миграция через tweakcn:** включить `.theme-bersoncare-dna` на doctor shell в отдельной preview-ветке и сравнить живые экраны.
4. **После этого шрифт:** отдельно сравнить current system font vs Nunito на реальных врачебных экранах, не решать это вслепую.
5. **Последним слоем:** chart/status palette и сложные виджеты schedule/analytics.

## Практический критерий

Если после включения DNA-токенов экран все еще выглядит не как DNA, значит проблема не в теме, а в компонентной структуре: чаще всего это список, карточка, layout или локальный hardcoded color.
