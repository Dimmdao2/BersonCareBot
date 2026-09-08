# Аудит UI кабинета пациента — 2026-09-07

> **Owner correction 2026-09-08:** старый Design DNA v1.0/v1.1 был направлением кабинета врача,
> архивирован и не является baseline пациента. Выводы ниже скорректированы относительно текущего
> patient-кода и patient-канона; новый visual target требует отдельного owner-подтверждения.

## Статус и граница

- Область: `apps/webapp/src/app/app/patient/**`, `apps/webapp/src/shared/ui/patient/**`, `apps/webapp/src/app/styles/patient.css` и patient shell.
- Base commit: `25ad543cde7e4b93e04837eea6fb1ec9637d6800`.
- Отдельный worktree: `/home/dev/dev-projects/bcb-wt-patient-ui-system-audit-20260907`.
- Ветка: `wt/patient-ui-system-audit-20260907`; `feat` не затрагивался.
- Разделы до «Статус реализации» фиксируют исходный read-only аудит. После него в этой же отдельной
  ветке выполнена реализация; актуальное состояние и доказательства записаны в конце документа.

Канон, с которым сравнивалась реализация:

- [`PATIENT_APP_UI_STYLE_GUIDE.md`](../../../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md);
- [`SCREEN_ARCHITECTURE_GUIDE.md`](../../../ARCHITECTURE/SCREEN_ARCHITECTURE_GUIDE.md);
- `shared/ui/patient/patientVisual.ts`, `app/styles/patient.css` и пациентские примитивы;
- `AGENTS.md` §15, §17, §21, §22 и правила аудита/поведенческих тестов.

## Итог

Основа у patient UI уже есть и её не надо строить заново: единый `PatientAppShell`, patient-only import boundary, `PatientModal`, `patientVisual.ts`, `patient.css`, layout-классы. Главная проблема — эти слои не стали единственным способом собирать экран.

Сейчас внутри одного кабинета одновременно действуют:

1. глобальные shadcn/base-ui размеры и semantic tokens;
2. patient-классы из `patientVisual.ts`;
3. крупный home-only набор `patientHomeCardStyles.ts`;
4. локальные палитры, радиусы и геометрия отдельных страниц.

Из-за этого одинаковые по смыслу кнопки, поля, карточки, заголовки, табы и модалки выглядят по-разному. Исправлять надо не серией page-by-page косметических правок, а сначала сделать patient primitives реальными адаптерами patient-темы, затем мигрировать повторяющиеся паттерны.

## Что уже сделано правильно и должно сохраниться

### Изоляция patient / doctor

Прямых импортов глобальных primitives из feature-кода patient-зоны не найдено. Все найденные ссылки `@/shared/ui/primitives/*` находятся внутри `shared/ui/patient/primitives/*` и являются зональными мостами. Это правильная граница; объединять визуальные React-компоненты пациента и врача не надо.

Проверка:

```bash
rg -n --no-heading "@/shared/ui/primitives/" apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient --glob '*.ts' --glob '*.tsx'
```

Результат: 19 строк, все 19 — реализации/реэкспорты внутри `apps/webapp/src/shared/ui/patient/primitives/`.

### Shell и page boundary

`PatientAppShell` в основном монтируется на уровне `page.tsx`, а не внутри client-компонентов: команда ниже дала 28 `page.tsx` и 0 файлов `*Client.tsx` с прямым `PatientAppShell`.

```bash
printf 'PAGE_TSX_WITH_SHELL=%s\n' "$(rg -l 'PatientAppShell' apps/webapp/src/app/app/patient --glob 'page.tsx' | wc -l)"
printf 'CLIENT_TSX_WITH_SHELL=%s\n' "$(rg -l 'PatientAppShell' apps/webapp/src/app/app/patient --glob '*Client.tsx' | wc -l)"
```

Оставшиеся страницы в основном получают shell через `BookingWizardShell` либо являются специальными gated/public маршрутами. Старое замечание P1 из `SCREEN_ARCHITECTURE_GUIDE.md` нельзя переносить в новый backlog без route-by-route проверки: как системный дефект оно сейчас не подтверждено.

### Модальная основа

`PatientModal` уже используется в чате, обсуждениях программы, журнале симптомов и ЛФК, истории посещений, напоминаниях, web-push и media preview. Контракт правильный: desktop dialog, mobile drawer, один scroll-owner, footer portal, слои и fullscreen media.

### Не все raw-теги являются долгом

Raw `<input>` типов `hidden`, `range` и `file` не нужно механически заменять. Raw-кнопки календаря и media preview тоже требуют проверки семантики, а не запрета по имени тега. Но видимые text/radio/button controls сравнены с уже существующими patient `Input`, `Button` и `RadioGroup`; подтверждённые обходы вынесены в R8. Сам факт raw-тега не является finding.

## Подтверждённые дефекты

### F1. Muted-текст не проходит контраст на основном фоне

`--patient-text-muted: #98a2b3` используется вместе с обычным `text-sm` на белом `--patient-page-bg`/`--patient-card-bg`. Контраст — 2.58:1; для обычного текста нужен 4.5:1. Это не вкусовщина: пояснения в дневнике, профиле, формах и empty states объективно трудно читать.

Проверка:

```bash
node - <<'NODE'
function lum(hex){const a=hex.match(/[\da-f]{2}/gi).map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2]}
function ratio(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
console.log(ratio('#98a2b3','#ffffff').toFixed(2))
NODE
```

Исправление: заменить muted token на цвет, который даёт минимум 4.5:1 на фактических patient canvas/surface. Не подкрашивать отдельные страницы вручную. `#667085` на белом даёт 4.97:1 и уже существует как `--patient-text-secondary`; итоговый token проверить на каждом фактическом фоне patient-зоны.

### F2. Заголовок страницы визуально равен или меньше заголовка секции

В desktop/title-strip `PatientAppShell` рендерит `<h1>` с `patientSectionTitleClass`. Этот же класс предназначен для `h2/h3` секций и равен 16px/400. В mobile top chrome отдельный локальный класс задаёт 15px/400. При этом существующий `patientPageTitleClass` задаёт 17px mobile / 20px desktop и в shell не используется.

Фактическая шкала:

- mobile shell title: 15px (`PatientShellTopChrome.tsx`);
- shell/section title: 16px (`patientSectionTitleClass`);
- отдельный page title: 17px → 20px (`patientPageTitleClass`);
- Целевая иерархия должна быть закреплена в patient semantic typography, а не в page-local классах.

Источник размеров:

```bash
rg -n --no-heading "MOBILE_HEADER_TITLE_CLASS|patientSectionTitleClass|patientPageTitleClass|patient-block-heading-font-(size|weight)" apps/webapp/src/shared/ui/patient apps/webapp/src/app/styles/patient.css
```

На живом экране `/app/patient/diary` заголовок страницы «Статистика» оказался меньше заголовков секций «Самочувствие за неделю», «Отслеживаемые симптомы». Иерархия экрана сломана.

Исправление: один `PatientPageTitle`/shell-title contract и одна documented scale. `h1` не должен использовать section primitive; mobile chrome может обрезать размер, но не делать страницу визуально ниже секции.

### F3. `patientFormSurfaceClass` используется как класс поля ввода

В `ProgramItemCompleteDialog.tsx` поля `<Input>` получают `patientFormSurfaceClass`. Этот класс описан как **контейнер формы** и добавляет `flex flex-col gap-4 p-4`, карточный border/radius/shadow. На input он создаёт случайную смесь высоты `h-9`, padding формы, тени карточки и глобального input chrome.

Это конкретное неверное переиспользование существующего primitive, а не повод создать ещё один локальный класс. Поля должны использовать единый patient input variant; `patientFormSurfaceClass` должен оставаться на оболочке группы.

### F4. Patient `Select` могут показать UUID или enum-key

В найденных patient-селектах текущее `value` не равно человекочитаемой подписи, но `SelectValue` не получает ни `displayLabel`, ни `items`, ни явных детей. До первого монтирования options Base UI может отрисовать сырое значение:

- UUID организации — `PatientOrganizationContext.tsx`;
- enum-код канала OTP — `AuthOtpChannelPreference.tsx`;
- `disabled` или id режима напоминаний — `AppointmentReminderPreference.tsx`;
- UUID абонемента — `ConfirmStepClient.tsx`.

Это прямо нарушает `AGENTS.md` §22. Исправление не меняет тип контрола: передать в `SelectTrigger` вычисленный `displayLabel` либо карту `items` в `Select`. Проверка должна быть поведенческой: при заданном opaque `value` до открытия списка пользователь видит подпись, а не техническое значение.

Проверка вхождений:

```bash
rg -n --no-heading "<SelectValue|<SelectTrigger|value=\{" \
  apps/webapp/src/shared/ui/patient/organization/PatientOrganizationContext.tsx \
  apps/webapp/src/app/app/patient/profile/AuthOtpChannelPreference.tsx \
  apps/webapp/src/app/app/patient/booking/AppointmentReminderPreference.tsx \
  apps/webapp/src/app/app/patient/booking/confirm/ConfirmStepClient.tsx
```

### F5. Табы программы не имеют клавиатурного tab-контракта

`PatientPlanTabStrip.tsx` вручную рендерит набор `<button role="tab">`, но не задаёт roving `tabIndex`, `aria-controls`/`id` и не обрабатывает ArrowLeft/ArrowRight/Home/End. Все табы попадают в обычный Tab-order, а стрелки не переключают панели. `PatientPlanTabPanels.tsx` задаёт панелям только `role="tabpanel"` и `aria-label`, без связи с табами.

Это достижимый accessibility-дефек, а не стилевое замечание. В patient layer уже есть Base UI `Tabs`; нужно перенести на него текущую визуалку и проверить поведение клавиатурой.

### F6. Feature-модалки обходят единый `PatientModal`

Style guide §8 требует открывать любую feature-модалку пациента через `PatientModal`. Обходы остались в `LfkSessionForm.tsx` (date и time), `QuickAddPopup.tsx` и `ProgramItemCompleteDialog.tsx`: они напрямую рендерят `DialogContent`.

Промежуточный patient `DialogContent` на mobile уже делегируется в drawer, поэтому сам факт обхода не доказывает катастрофу geometry. Но эти модалки не получают единые header/footer/scroll/stack contracts и продолжают держать локальную spacing/button-композицию. Это прямое нарушение обязательного modal-контракта; переносить на `PatientModal`/`PatientModalFooter`, не заводя новую обёртку.

### F7. Fallback-рейтинг наследует primary button chrome и ломает radio-keyboard contract

`MaterialRatingNativeStars.tsx` — аварийный UI при ошибке `@smastrom/react-rating`. Каждая звезда рендерится patient `<Button>` без `variant`, поэтому получает global default `bg-primary`, `text-primary-foreground` и `h-9`. Локальный `className` меняет padding/radius, но не снимает фон: вместо нейтрального ряда звёзд fallback может показать primary button-boxes.

Кастомный `role="radiogroup"` также даёт каждому `role="radio"` одинаковый `tabIndex=0` и не обрабатывает стрелки. Исправление: снять button chrome явным patient variant и реализовать roving focus/arrow navigation либо использовать готовый radio primitive. Принимать при принудительном падении library-boundary, проверяя вид и клавиатуру поведенчески.

## Высокоприоритетный системный долг

### S1. Patient primitives сейчас почти пустые реэкспорты

`shared/ui/patient/primitives/{button,input,textarea,select,card,badge,tabs,switch}.tsx` реэкспортируют глобальные primitives без patient defaults. Граница импорта есть, но визуального контракта на этой границе нет.

Следствие для элементов одного назначения:

| Элемент | Глобальный default через patient re-export | Patient visual classes |
| --- | --- | --- |
| Button | 36px (`h-9`), `sm` 32px, `lg` 40px | primary 44px, secondary/ghost 40px, success 44→48px |
| Input | 32px, global `border-input`, `text-foreground` | локально часто принудительно `h-10`, `rounded-xl`, другой focus ring |
| SelectTrigger | 32px | локально часто `h-10 rounded-xl` |
| Card | `rounded-xl`, ring, internal `py-4`, gap | patient card 6px mobile / 8px desktop, border + собственная shadow |

Источник размеров/chrome:

```bash
sed -n '1,180p' apps/webapp/src/shared/ui/primitives/button-variants.ts
sed -n '1,120p' apps/webapp/src/shared/ui/primitives/input.tsx
sed -n '50,140p' apps/webapp/src/shared/ui/primitives/select.tsx
sed -n '1,100p' apps/webapp/src/shared/ui/primitives/card.tsx
sed -n '1,180p' apps/webapp/src/app/styles/patient.css
sed -n '240,390p' apps/webapp/src/shared/ui/patient/patientVisual.ts
```

Показательный touch target: кнопки оценки самочувствия используют `size-9` (36px), хотя `patient.css` объявляет `--patient-touch: 44px`.

В результате feature-код постоянно «дособирает» пациентский элемент длинной строкой классов. Например:

- submit в `QuickAddPopup`, `LfkSessionForm`, `SymptomTrackingRow`, обоих journal clients и `PatientSupportForm` остаётся глобальной кнопкой default height;
- поля профиля остаются 32px;
- date/select поля журнала вручную переходят на 40px и `rounded-xl`;
- primary CTA через `patientButtonPrimaryClass` уже 44px.

Решение: не менять глобальные primitives. Реализовать patient wrappers с patient defaults и typed variants: `tone`, `size/touch`, `width`, `surface`. Затем постепенно свести `patientButton*Class` к API этих wrappers либо оставить class API только для `<Link>`.

### S2. Два несовместимых Card API

Глобальный `Card` и `patientCardClass` задают chrome независимо. Поэтому почти каждый `<Card>` в patient feature-коде вынужден добавлять `ring-0`, `!p-0`, `!py-0` или одновременно patient card/list class.

Проверка:

```bash
rg -n --no-heading '<Card\b' apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient --glob '*.tsx'
```

Найдено 11 рендеров `<Card>`; характерные примеры: `CabinetInfoLinksCard`, `CabinetBookingEntry`, `CabinetActiveBookings`, `CabinetPastBookings`, `LfkComplexCard`, `ReminderRulesClient`.

Решение: `shared/ui/patient/primitives/card.tsx` должен сам инкапсулировать patient chrome и spacing variants (`default`, `compact`, `list`, `flush`). Feature-код не должен гасить ring/padding глобального Card.

### S3. Тема раздвоена между `:root`, shell и fallback hex

В `patient.css` 16 имён `--patient-*` продублированы одновременно в `:root` и `#app-shell-patient` с одинаковыми значениями. При этом primary/success/warning/danger и semantic surface tokens объявлены только внутри shell. Портальные модалки находятся на `<body>`, поэтому код вынужден держать отдельный `patientModalPortalPrimaryCtaClass` и fallback `#284da0`.

Проверка числа дублей:

```bash
node - <<'NODE'
const fs=require('fs'); const s=fs.readFileSync('apps/webapp/src/app/styles/patient.css','utf8');
const root=s.match(/:root\s*\{([\s\S]*?)\n\}/)[1]; const shell=s.match(/#app-shell-patient\s*\{([\s\S]*?)\n\}/)[1];
const vars=x=>new Map([...x.matchAll(/(--patient-[\w-]+):\s*([^;]+);/g)].map(m=>[m[1],m[2].trim()]));
const a=vars(root),b=vars(shell); console.log([...a.keys()].filter(k=>b.has(k)).length);
NODE
```

Решение: применить patient semantic theme на `:root:has(#app-shell-patient)`, `body:has(#app-shell-patient)` и shell — тем же принципом, которым doctor theme уже покрывает portals. После этого удалить portal-only palette и fallback hex из feature classes.

### S4. Палитра не централизована; новый patient visual target ещё не утверждён

Текущий patient shell:

- Manrope;
- primary `#284da0`;
- белый canvas и белые cards;
- card radius 6px mobile / 8px desktop.

Кроме того, в patient TS/TSX найдено 206 Tailwind arbitrary color classes в 33 файлах. До owner-подтверждения нового patient visual target сохраняются Manrope и текущий patient blue; локальные оттенки всё равно должны быть сведены в patient semantic tokens.

Измерение:

```bash
node - <<'NODE'
const fs=require('fs'),path=require('path');
const roots=['apps/webapp/src/app/app/patient','apps/webapp/src/shared/ui/patient']; const files=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.(ts|tsx)$/.test(e.name)&&!(/\.(test|spec)\./.test(e.name)))files.push(p)}} roots.forEach(walk);
const rows=files.map(f=>[f,fs.readFileSync(f,'utf8')]);
const re=/(?:bg|text|border|ring|from|via|to)-\[(?:#|rgba?\()/g;
console.log({occurrences:rows.reduce((n,[,s])=>n+(s.match(re)||[]).length,0),files:rows.filter(([,s])=>(s.match(re)||[]).length>0).length});
NODE
```

Основные hotspots: `patientVisual.ts`, `PatientProgramStageItemPageClient.tsx`, `PatientPlanTabStrip.tsx`, `patientHomeCardStyles.ts`, booking service, diary week nav и treatment stage page.

Palette values должны жить в patient CSS tokens; компоненты используют semantic names, не hex. Значения нового визуального слоя нельзя выводить из врачебной зоны без owner-решения.

### S5. Радиусы образуют несколько несвязанных шкал

Точное сканирование literal classes дало:

```text
rounded-sm=8
rounded-md=42
rounded-lg=33
rounded-xl=18
rounded-full=43
rounded-[var(--patient-card-radius-mobile)]=23
rounded-[var(--patient-pill-radius)]=7
```

Команда:

```bash
for token in rounded-sm rounded-md rounded-lg rounded-xl rounded-full 'rounded-[var(--patient-card-radius-mobile)]' 'rounded-[var(--patient-pill-radius)]'; do count=$(rg -F -o --glob '*.tsx' --glob '*.ts' "$token" apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient | wc -l); printf '%s=%s\n' "$token" "$count"; done
```

`rounded-full` оправдан для icons/pills, но `rounded-md`, `rounded-lg`, `rounded-xl`, 6/8px patient card и 14px DNA card используются для одинаковых surfaces и form controls. Нужны семантические radius tokens (`control`, `card`, `panel`, `pill`), а не запрет конкретного Tailwind класса.

### S6. Размеры шрифтов и веса не образуют явной семантической шкалы

Инвентаризация literal classes:

```text
text-[10px]=29; text-[11px]=26; text-xs=223; text-sm=264; text-base=36; text-lg=8; text-xl=5; text-2xl=3
font-light=2; font-normal=80; font-medium=156; font-semibold=77; font-bold=6
```

Команда:

```bash
for token in 'text-[10px]' 'text-[11px]' text-xs text-sm text-base text-lg text-xl text-2xl; do count=$(rg -F -o --glob '*.tsx' --glob '*.ts' "$token" apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient | wc -l); printf '%s=%s\n' "$token" "$count"; done
for token in font-light font-normal font-medium font-semibold font-bold; do count=$(rg -F -o --glob '*.tsx' --glob '*.ts' "$token" apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient | wc -l); printf '%s=%s\n' "$token" "$count"; done
```

Сами размеры 10/11px допустимы для очень ограниченной metadata, но сейчас они встречаются в shell badges, tab subtitles, chat metadata, навигации и status copy. Нужны semantic primitives `PageTitle`, `SectionTitle`, `Body`, `Secondary`, `Caption`, `Meta`, с минимальным контрастом и documented responsive scale. После этого literal размер остаётся только у действительно уникальной графики.

### S7. Канонический §15 указывает на уже несуществующие пути

`AGENTS.md` §15 называет источниками `apps/webapp/src/shared/ui/patientVisual.ts` и `apps/webapp/src/app/globals.css`. Оба пути отсутствуют. Фактические источники — `apps/webapp/src/shared/ui/patient/patientVisual.ts` и `apps/webapp/src/app/styles/patient.css`; `PATIENT_APP_UI_STYLE_GUIDE.md` уже указывает их правильно.

Проверка:

```bash
for p in apps/webapp/src/shared/ui/patientVisual.ts apps/webapp/src/shared/ui/patient/patientVisual.ts apps/webapp/src/app/globals.css apps/webapp/src/app/styles/patient.css; do if [ -e "$p" ]; then printf 'EXISTS %s\n' "$p"; else printf 'MISSING %s\n' "$p"; fi; done
```

Это не визуальный дефект для пациента, но практическая причина новых дублей: следующий worker по обязательному маршруту приходит в несуществующий source of truth. Исправить две ссылки в §15 отдельной минимальной документной правкой; не копировать туда новый пересказ style guide.

## Повторяющиеся реализации, которые надо объединить

### R1. Segmented pager / tab strip

Три компонента повторяют одну композицию: border-container с `gap-px`, lavender backgrounds `#f8f3fd/#e4e2ff`, primary focus ring, 44/52px row и стрелки/три таба:

- `PatientDiaryWeekNavStrip.tsx`;
- `PatientDailyWarmupPager.tsx`;
- `PatientPlanTabStrip.tsx`.

Проверка:

```bash
sed -n '1,220p' apps/webapp/src/app/app/patient/treatment/program-detail/PatientPlanTabStrip.tsx
sed -n '1,140p' apps/webapp/src/app/app/patient/diary/PatientDiaryWeekNavStrip.tsx
sed -n '1,120p' apps/webapp/src/app/app/patient/content/[slug]/PatientDailyWarmupPager.tsx
```

В `PatientPlanTabStrip` три raw `<button role="tab">` почти дословно повторены внутри одного файла; keyboard-дефек отдельно зафиксирован в F5. Нужен patient `SegmentedStrip` + `SegmentedTab`/`PagerCell`, а для самих табов — patient Tabs variant на Base UI. Цвета должны стать tokens (`segmented-bg`, `segmented-active`, `segmented-divider`).

### R2. Журналы симптомов и ЛФК

`LfkJournalClient.tsx` и `SymptomsJournalClient.tsx` имеют почти одинаковые:

- back-to-stats action;
- entity selector;
- month navigation;
- list item + dropdown actions;
- edit modal/footer;
- date/time fields;
- delete/refresh/toast flow.

Не надо сливать domain actions. Нужен общий presentation scaffold: `PatientJournalToolbar`, `PatientJournalList`, `PatientJournalEditFields` или небольшой typed render-prop container. Это устранит параллельные правки размеров/labels/modal footer без смешивания symptom и LFK models.

### R3. Booking/cabinet appointment rows

`CabinetActiveBookings` и `BookingUpcomingSection`, а также `CabinetPastBookings` и `BookingPastHistorySection`, повторяют форматирование даты, timezone warning, provenance/subtitle, status badge и `patientListItemClass`. Различаются оболочка и доступные actions.

Нужен общий `PatientBookingListItem` с slots для status/actions, а не общий экран. Сейчас одна и та же запись визуально может разойтись между «Кабинетом» и «Записью».

### R4. Spacing variants через `!important`

В patient TS/TSX найдено 37 строк с Tailwind important overrides размеров/spacing. Часть техническая (fullscreen modal, Telegram iframe), но повторяемый продуктовый случай — `about`, `install`, `support` используют один и тот же `cn(patientSectionSurfaceClass, '!gap-4 !p-6')`.

Команда:

```bash
rg -n --no-heading --glob '*.tsx' --glob '*.ts' "![a-z-]+-?[0-9]|!min-|!max-|!w-|!h-" apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient | wc -l
```

Добавить explicit variants (`spacing="comfortable"`, `flush`, `compact`) на surface/card primitives. `!important` оставить только там, где адаптируется third-party DOM или fullscreen geometry.

### R5. Modal bypasses

Несмотря на действующий `PatientModal`, прямые feature-вызовы `DialogContent` остаются в:

- `LfkSessionForm.tsx` — date и time dialogs;
- `QuickAddPopup.tsx`;
- `ProgramItemCompleteDialog.tsx`.

Проверка:

```bash
rg -n --no-heading '<DialogContent' apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient --glob '*.tsx' | grep -v '/PatientModal.tsx'
```

Обход и его user-facing последствия зафиксированы в F6. Здесь эти файлы оставлены как инвентарь для одной миграционной серии, а не для независимых page fixes.

### R6. Loading унифицирован, empty state — почти нет

`AppContentLoading` используется последовательно в 19 production render sites, включая route suspense, чат, профиль, booking и treatment. Это удачный общий слой. Обратная ситуация с `patientEmptyStateClass`: поиск имени дал только export, import и один фактический render в `PatientBookingHistorySection`; остальные экраны выводят локальный muted `<p>` — «Пока пусто», «Записей пока нет», «В этом разделе пока нет материалов» — с разными padding/alignment.

Проверка:

```bash
printf 'EMPTY_CLASS_USES=%s\n' "$(rg -o 'patientEmptyStateClass' apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient --glob '*.tsx' --glob '*.ts' | wc -l)"
printf 'LOADING_COMPONENT_USES=%s\n' "$(rg -o '<AppContentLoading\b' apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient --glob '*.tsx' --glob '*.ts' | wc -l)"
```

Решение: небольшой `PatientEmptyState` с вариантами `inline`/`section` и optional action. Не превращать каждую пустую строку в большую иллюстрацию; цель — одинаковые отступ, тон и место CTA.

### R7. Field label/help/error собираются вручную

Одинаковая строка `text-xs font-(normal|medium) uppercase tracking-wide` встречается в 32 production-строках: diary forms, оба journal client, profile, support, auth, booking и bind-phone. Иногда это `<Label>`, иногда несвязанный `<span>`/`<p>`; error/help text также добавляются отдельно. В сочетании с тремя высотами controls это главный источник разъезда форм.

Проверка:

```bash
rg -n --no-heading "text-xs font-(normal|medium) uppercase tracking-wide" apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient --glob '*.tsx' --glob '*.ts' | wc -l
```

Нужен `PatientField`/`PatientFieldLabel` presentation primitive, который задаёт label typography, gap, `htmlFor`/`aria-describedby`, help и error slots. Он не должен владеть form state или domain validation.

### R8. Видимые controls повторно собираются raw-тегами

`PatientTreatmentProgramStagePageProgramSection.tsx` вручную собирает компактную форму из difficulty-кнопок, видимых text inputs и submit-кнопки. Все controls реализованы raw-тегами с локальным `fieldBase`/длинным button chrome, хотя рядом `ProgramItemCompleteDialog.tsx` делает ту же difficulty + metrics форму через patient `RadioGroup` и `Input`. Это и дубль, и прямой обход reuse-first §15.

`ConfirmStepClient.tsx` отдельно рендерит видимые raw radio для выбора канала подтверждения, хотя patient `RadioGroup` уже есть. Нужно не запрещать raw-теги глобально, а перенести эти конкретные видимые controls на patient primitives и общую форму completion metrics.

## Что выглядит плохо или хрупко на реальном экране

### V1. Белый canvas + белые cards стирают иерархию

`#app-shell-patient`, `<main>`, `--patient-page-bg` и `--patient-card-bg` все белые. На profile/diary карточки отделяются только очень светлой границей и слабой тенью; при этом muted text ещё светлее. Patient target должен развести canvas и surface единым набором semantic tokens; конкретная температура фона требует owner-подтверждения.

### V2. Desktop «Сегодня» растягивает mobile-композицию

На live 1440×900 shell растянулся до desktop cap, но блоки часто остались одноколоночными и прижатыми к левому краю. Hero «Разминка дня» имеет фиксированную `md:h-[300px]`, текст ограничен примерно 390px, справа резервируется media slot. Пока lazy cover не отрисован либо если media отсутствует/сломано, большую часть карточки занимает пустота. Mood row растягивает пять маленьких иконок почти на всю ширину.

Это не призыв вернуть узкий mobile shell. Нужны состояния `hasMedia/noMedia/loading` и desktop composition: ограниченная readable text column, явный media fallback/skeleton, либо двухколоночная раскладка. Fixed 300px без гарантированного визуального содержимого хрупок.

### V3. Формы смешивают три плотности

На одном form flow встречаются 32px input/select defaults, 36px default buttons, 40px локальные controls и 44px patient CTA. Визуально поля и кнопки не образуют строку, а на touch-device одинаковые действия имеют разную площадь нажатия. Канонический `--patient-touch: 44px` фактически опционален.

Рекомендуемая схема: touch default 44px для primary controls на mobile; compact 36/40px только для secondary toolbar actions при достаточной ширине hit-area. Это должно задаваться primitive variant, не каждым экраном.

### V4. Back contract смешивает destination-label и generic-label

Literal audit дал `backLabel="Меню"`, `"Назад"`, `"Профиль"`, `"Справка"`, `"Программы"`, `"План"`, `"Напоминания"`. В mobile это чаще aria-label и не визуальная строка, поэтому само разнообразие не finding. Но `BookingWizardShell` одновременно передаёт shell back и рисует дополнительную подчёркнутую ссылку «Назад» внутри wizard на шагах после первого — два владельца одного действия.

Решение: shell владеет back-action; label policy — либо destination name везде, либо generic «Назад» везде. Внутренний wizard оставляет только step indicator.

## Полная инвентаризация области

Команда ниже исключает tests/specs и считает только production TS/TSX в двух patient roots:

```bash
node - <<'NODE'
const fs=require('fs'),path=require('path');
const roots=['apps/webapp/src/app/app/patient','apps/webapp/src/shared/ui/patient']; const files=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.(ts|tsx)$/.test(e.name)&&!(/\.(test|spec)\./.test(e.name)))files.push(p)}} roots.forEach(walk);
const rows=files.map(f=>[f,fs.readFileSync(f,'utf8')]);
const metrics={files:files.length,lines:rows.reduce((n,[,s])=>n+s.split(/\n/).length,0),patientVisualImports:rows.filter(([,s])=>s.includes('shared/ui/patient/patientVisual')).length,rawButton:0,rawInput:0,rawSelect:0,Button:0,Input:0,SelectTrigger:0,inlineStyle:0,hex:0,arbitraryColor:0};
for(const [,s] of rows){for(const [k,re] of Object.entries({rawButton:/<button\b/g,rawInput:/<input\b/g,rawSelect:/<select\b/g,Button:/<Button\b/g,Input:/<Input\b/g,SelectTrigger:/<SelectTrigger\b/g,inlineStyle:/\bstyle=\{/g,hex:/#[0-9a-fA-F]{3,8}\b/g,arbitraryColor:/(?:bg|text|border|ring|from|via|to)-\[(?:#|rgba?\()/g}))metrics[k]+=(s.match(re)||[]).length}
console.log(JSON.stringify(metrics,null,2));
NODE
```

Результат:

```json
{
  "files": 325,
  "lines": 42899,
  "patientVisualImports": 138,
  "rawButton": 19,
  "rawInput": 24,
  "rawSelect": 3,
  "Button": 184,
  "Input": 43,
  "SelectTrigger": 11,
  "inlineStyle": 10,
  "hex": 259,
  "arbitraryColor": 206
}
```

Числа показывают размер поверхности, но не являются quality gates. Нельзя писать тест, который считает классы, таблицы, теги, hex или форматирование исходника.

## Рекомендуемая последовательность реализации

### Этап A — один patient foundation

1. Зафиксировать показанный владельцу и явно подтверждённый visual target patient-зоны. До подтверждения сохранить Manrope и текущий patient blue, исправляя только консистентность, доступность и функциональные разрывы.
2. Распространить patient theme на shell и portal root/body.
3. Сделать `patient/primitives/Button`, `Input`, `Textarea`, `SelectTrigger`, `Card`, `Badge`, `Tabs` настоящими patient adapters с typed variants и touch defaults.
4. Оставить `patientVisual.ts` для semantic composition classes и link-compatible strings, но убрать дублирование primitive chrome.
5. Ввести semantic typography components/classes и исправить контраст muted token.

### Этап B — удалить самые дорогие локальные диалекты

1. `PatientPlanTabStrip` + diary/warmup pagers → общий segmented primitive.
2. Direct Dialog feature uses → `PatientModal`.
3. Journal toolbars/edit forms → общий presentation scaffold.
4. Booking rows → общий list item.
5. Surface spacing → variants вместо `!p-*`/`!gap-*`.

### Этап C — page pass

1. Home/diary/profile/booking/treatment/messages/reminders на 390×844 и 1440×900.
2. Исправить no-media/loading desktop hero states.
3. Проверить page title hierarchy, control height, empty/loading/error states и back ownership.
4. Только после foundation-pass убирать оставшиеся arbitrary colors/radii по semantic mapping; не делать механическую замену hex на ближайший token без проверки смысла.

## Как принимать изменения

Автоматизировать только поведение:

- keyboard navigation/focus/escape и возврат focus у modal/tab/select;
- submit действительно сохраняет форму и disabled/loading не даёт двойную отправку;
- modal stack возвращает пользователя в предыдущий слой с сохранённым draft;
- back-action ведёт в правильный маршрут;
- no-media/error/loading states не оставляют пустой фиксированный блок;
- contrast проверяется по rendered computed colors.

Live-приёмка обязательна на mobile и desktop для representative flows. Не добавлять tests/gates на число классов, hex, таблиц, DOM-обёрток, порядок utility classes или форматирование.

## Runtime-проверка и ограничение доказательства

Кандидат запускался из audit worktree на отдельном порту `5210`; штатный DEV patient login успешно открыл кабинет пациента. Headless были просмотрены `/app/patient`, `/app/patient/diary`, `/app/patient/profile`, `/app/patient/booking` и shell `/app/patient/messages` на 390×844; `/app/patient` также на 1440×900.

Команды запуска и capture:

```bash
DEV_WEBAPP_PORT=5210 bash scripts/run-webapp-dev.sh webpack
BASE=http://127.0.0.1:5210 CHROME=/home/dev/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome VIEWPORT_W=390 VIEWPORT_H=844 DPR=1 FULLPAGE=0 WAIT_MS=700 node /home/dev/brain/host-orch/shot.mjs /tmp/bcb-patient-ui-audit.cookies /tmp/bcb-patient-ui-audit/mobile /app/patient/diary /app/patient/treatment /app/patient/messages /app/patient/profile
BASE=http://127.0.0.1:5210 CHROME=/home/dev/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome VIEWPORT_W=1440 VIEWPORT_H=900 DPR=1 FULLPAGE=0 WAIT_MS=1500 node /home/dev/brain/host-orch/shot.mjs /tmp/bcb-patient-ui-audit.cookies /tmp/bcb-patient-ui-audit/desktop /app/patient /app/patient/diary /app/patient/profile
```

Не каждый путь во второй и третьей командах завершил capture: webpack server был остановлен lifecycle диагностической сессии; в доказательство визуального вывода включены только успешно записанные экраны, перечисленные выше.

Чат в headless capture оставался в loading state. Это **не записано как finding**: прямой API-запрос вернул `HTTP 200` за 3.63s и 60 сообщений, а отдельный webpack dev server в symlinked worktree долго компилировал chunks и был остановлен lifecycle диагностической сессии. Перед правкой чата нужен повторный проход на стабильном DEV server; по этому аудиту утверждать, что production chat зависает, нельзя.

Команда API-проверки:

```bash
curl -sS --max-time 20 -b /tmp/bcb-patient-ui-audit.cookies -o /tmp/bcb-patient-messages.json -w 'HTTP %{http_code} total=%{time_total}s\n' http://127.0.0.1:5210/api/patient/messages
node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync("/tmp/bcb-patient-messages.json","utf8"));console.log({ok:j.ok,messageCount:Array.isArray(j.messages)?j.messages.length:null})'
```

## Дополнение 2026-09-08: точная карта одинаковых элементов и хардкодов

Это не второй audit-pass и не новый visual target. Раздел делает прежние S1–S6 пригодными для
последующей миграции: перечисляет только повторяющиеся элементы одного назначения и палитры,
которые обязаны меняться из одного patient token. Уникальные clinical шкалы, графики, media
preview и home-only geometry намеренно не включены.

### Повторяющиеся элементы одного назначения

| Семейство | Где повторено | Общая точка вместо локальных реализаций |
| --- | --- | --- |
| 40px field chrome: `h-10`, `rounded-xl`, border/background, focus ring | `diary/lfk/LfkSessionForm.tsx:116,185,218,244`; `diary/QuickAddPopup.tsx:131,193`; `diary/lfk/journal/LfkJournalClient.tsx:93`; `diary/symptoms/journal/SymptomsJournalClient.tsx:93` | Patient `Input`/`Textarea`/`SelectTrigger` должны получить один variant `control` (40px, radius, surface, focus). Это не card token и не page-local class. |
| Form label | 32 production-места с `text-xs font-(normal|medium) uppercase tracking-wide`, в том числе `LfkSessionForm.tsx:105,139,157,235,249`, оба journal client, profile, support, auth, booking | Нужен presentation primitive `PatientFieldLabel` или `PatientField`; он владеет label, gap, help/error slots и связью `htmlFor`/`aria-describedby`, но не form state. |
| Две journal-формы | `diary/lfk/journal/LfkJournalClient.tsx:73-305`; `diary/symptoms/journal/SymptomsJournalClient.tsx:73-…` | Общий journal presentation scaffold: back action, selector, month toolbar, row, edit modal/footer. Модель и save/delete callback остаются доменными. |
| Submit формы | 36px default `<Button>`: `LfkSessionForm.tsx:296`, `QuickAddPopup.tsx:157,206`, journal submit, `SymptomTrackingRow.tsx:103`; 44px patient CTA: `booking/confirm/ConfirmStepClient.tsx:374,542` | Один patient Button primary/touch variant. `patientButtonPrimaryClass` оставить class API для Link/нестандартного DOM, не собирать submit повторно. |
| Warning CTA | `patientVisual.ts:295-300`; `home/PatientHomeNextReminderCard.tsx:21-33`; `booking/BookingUpcomingSection.tsx:29-34`; `treatment/program-detail/PatientPlanTodayRemindersCard.tsx:42-46` | Один warning-action base с size/width variants. Различия ширины/высоты не оправдывают отдельные палитры. |
| Segmented navigation / pager | `diary/PatientDiaryWeekNavStrip.tsx:9-65`; `content/[slug]/PatientDailyWarmupPager.tsx:6-37`; `treatment/program-detail/PatientPlanTabStrip.tsx:21-128`; `PatientProgramStageItemPageClient.tsx:707-820` | Для tab behavior — patient `Tabs`; поверх него общий `PatientSegmentedStrip`/pager presentation. Он владеет cell geometry, focus и active/disabled tones. |
| Card chrome | `cabinet/CabinetInfoLinksCard.tsx:9`; `CabinetBookingEntry.tsx:10`; `CabinetActiveBookings.tsx:109,121`; `CabinetPastBookings.tsx:48`; `diary/lfk/LfkComplexCard.tsx:49`; `reminders/ReminderRulesClient.tsx:101,195` | Patient `Card` с variants `default`, `compact`, `list`, `flush`; не сочетать global Card chrome с `patientCardClass` и override-ами. |
| List rows в organization UI | `shared/ui/patient/organization/PatientOrganizationContext.tsx:161,204,258`; `PatientOrganizationRelationships.tsx:52,66,96` | `patientListItemClass`, `patientSurfaceInfoClass`, `patientSurfaceWarningClass` уже выражают эти роли. |
| Form surface ошибочно надето на поле | `treatment/PatientTestSetProgressForm.tsx:632,675`; definition `patientVisual.ts:172` | `patientFormSurfaceClass` остаётся контейнером; textarea должен получить field primitive. |
| Empty state | definition `patientVisual.ts:202-204`; фактический render `profile/PatientBookingHistorySection.tsx:105`, тогда как другие страницы собирают локальные muted paragraphs | `PatientEmptyState`/`patientEmptyStateClass` с variants `inline`/`section` и optional action. |

### Токены, которые сейчас не меняют все одинаковые элементы

| Семейство значения | Повторения / обходы | Нужное исправление в patient theme |
| --- | --- | --- |
| Scope палитры для portal | В `patient.css:9-31` на `:root` только часть значений; рабочие primary/success/warning/danger и surfaces находятся в `#app-shell-patient:99-151`. `PatientModal` рендерится вне shell. Fallback primary остаётся в `patientVisual.ts:251-252,338-339,481-483`, pager/tab, auth и booking. | Канонические semantic tokens должны существовать в scope portal; shell переопределяет только clinic brand. После этого убрать literal fallback `#284da0`. |
| Primary CTA | `PwaInstallSection.tsx:90,119`; `PatientWebPushOnboardingCard.tsx:47`; `patientVisual.ts:481-483`. Shadow повторён в `PatientHomeDailyWarmupCard.tsx:138`, `PatientPlanHero.tsx:127`, `patientVisual.ts:482`. | `--patient-color-primary`, `--patient-color-primary-soft`, один `--patient-color-primary-hover` и `--patient-shadow-primary-cta`. Сейчас PWA `#1f3d85` и shared `#1f3d82` расходятся. |
| Secondary web-push action | `PatientWebPushOnboardingCard.tsx:78`; `PatientWebPushFreshLoginDeniedDialog.tsx:47` используют `#e5e7eb/#ffffff/#e8eefb`. | Уже есть `--patient-border`, `--patient-card-bg`, `--patient-color-primary-soft`; использовать shared secondary action state. |
| Warning action | `patientVisual.ts:296-299`; `BookingUpcomingSection.tsx:31-34`; `PatientHomeNextReminderCard.tsx:22-25`; `PatientPlanTodayRemindersCard.tsx:44-47` повторяют `#fde68a/#fffbeb/#d97706/#fef3c7/#f59e0b`. | Полный warning-action token family: bg, border, text, hover, active, focus. Текущие warning surface tokens покрывают не все эти роли. |
| Success surface/action | `patientVisual.ts:308-312`; `home/patientHomeCardStyles.ts:69`; `PatientHomeBookingCard.tsx:68`; `PatientStageCompositionList.tsx:194` повторяют `#dcfce7/#16a34a/#166534/#bbf7d0`. | Полный semantic success token family; как минимум заменить `patientHomeCardStyles.ts:69` на существующий `--patient-surface-success-border`. |
| Lavender segmented chrome | `PatientDiaryWeekNavStrip.tsx:9-23,35,52`; `PatientDailyWarmupPager.tsx:6-11,22,29`; `PatientProgramStageItemPageClient.tsx:704-712,804,820`; `PatientPlanTabStrip.tsx:31-35,43-55,65-69,77-89,99-103,111-123`. | `--patient-segmented-{bg,hover,active,border,text,muted,disabled-*}` плюс общий presentation component. |
| Material rating | CSS `patient.css:276-280`; library props `MaterialRatingBlock.tsx:64-72`; summary stars `MaterialRatingBlock.tsx:302-303`; native stars `MaterialRatingNativeStars.tsx:62-63`. | `--patient-rating-{fill-on,fill-off,stroke-on,stroke-off}` в portal-safe scope; SVG/library получают CSS vars, не очередную копию hex. |
| Shell translucency | `PatientTopNav.tsx:217,275,292`; `PatientBottomNav.tsx:34` повторяют `rgba(255,255,255,.96)`, одновременно `patient.css:51` хранит `--patient-header-chrome-opacity:82%`. | Один chrome-surface token, основанный на `--patient-page-bg`; убрать две разные opacity systems. |
| Modal footer surface | `PatientModal.tsx:37`; `patient/primitives/dialog.tsx:190` повторяют `rgba(248,250,252,.9)`. | `--patient-modal-footer-bg` в portal-safe scope. |
| Control radius | Form controls используют `rounded-xl`, cards — 6/8px tokens, actions — `rounded-md`/`rounded-sm`. | `--patient-control-radius`; control primitive задаёт его один раз. Не применять card radius к field по умолчанию. |

### Локальные shared-слои, которые сами обходят theme

`patientVisual.ts` ещё содержит palette literals для danger (`:277`), skip (`:287-290`), warning action
(`:296-299`), badges (`:305,311,317,323,328`), success done CTA (`:366-367`) и program text
(`:430,435,440`). Пока эти значения не вынесены в tokens, изменение одной patient variable не сможет
поменять все элементы одного значения даже при миграции feature-кода.

### Сознательно исключено из унификации

- clinical severity slider и wellbeing/map/chart markers;
- media-specific placeholder и fullscreen geometry;
- fixed home grid/hero geometry, которую style guide объявляет home-specific;
- мелкая typography 10–11px: в текущем коде она смешивает nav labels, metadata и axis-like status. Для неё
  нельзя выбирать один token без отдельного visual decision.

Эта карта — инвентарь и порядок миграции, не source-based test/gate. Проверять будущие изменения нужно
наблюдаемым поведением control/modal/tab, а не числом классов, hex или строк исходника.

## Статус реализации 2026-09-08

Работа остаётся в `wt/patient-ui-system-audit-20260907`; в `feat/doctor-ui-rebuild` ничего не
приземлено. Новый visual target не выбирался: сохранены Manrope, patient blue, существующие размеры и
геометрия. Изменения систематизируют уже существующий пациентский UI и копируют у doctor UI только
проверенное поведение диалогов/чата/медиа.

### Реализовано

- Все feature-диалоги пациента переведены на `PatientModal`/`PatientModalFooter`; нативные
  `window.confirm`/`window.alert` удалены из пациентского дерева. Mobile использует единый drawer со
  стартовой/завершающей анимацией, desktop — dialog; вложенные слои и возврат фокуса остаются в одном
  контракте.
- Messages и комментарии программы используют общий `PatientChatComposer` и doctor-like reconcile:
  новые сообщения добавляются по id без полной замены неизменившихся строк и без сброса загруженной
  пагинации. Заголовок пациента заменён на имя врача/клиники без ссылки.
- На mobile видео открывается статичным preview в полноэкранном `PatientModal`; плеер монтируется только
  при открытии. На desktop тот же media player остаётся inline на отдельном экране пункта программы.
- `Input`, `Textarea`, `Select`, `Label`, `Button`, `Card`, поля формы и segmented navigation получили
  patient adapters/typed variants. Повторяющиеся journal controls, primary submit actions, карточки и
  tab/pager chrome используют общие точки.
- Повторяемые primary/status/rating/modal/chat/segmented значения вынесены в portal-safe patient tokens.
  Точный разовый замер production TS/TSX дал 163 raw hex вместо 209 на исходном SHA; остаток включает
  сознательно исключённые clinical/chart/media/home-specific значения и отдельный будущий page-pass.
- Жалоба, которую врач записывает с severity, транзакционно создаёт и связывает patient symptom tracking;
  повторная запись использует ту же связь, конкурентные записи сериализуются блокировкой строки жалобы.
  Пациент добавляет мгновенные значения 0–10 и видит горизонтальную историю в модалке.
- Исправлены два препятствия живому patient runtime, выявленные при приёмке: client boundary карточки
  разминки и чтение `patient_label` через его зарегистрированный scope. Domain/surface routing и права
  БД не менялись.

Основные коммиты этапа: `9e8a2550c`, `106d24642`, `f530e23e4`, `2ec27e0a8`, `3e7740295`,
`398e9ed20`, `01e240f23`, `5049c8673`, `ad563e5bc`, `cec338b35`, `5c6d4eb6c`.
Последние media/modal/runtime изменения будут зафиксированы отдельным итоговым коммитом после финального
аудита.

### Проверки

```text
pnpm lint
EXIT=0

pnpm --dir apps/webapp typecheck
EXIT=0

pnpm --dir apps/webapp exec eslint src/shared/ui/patient/primitives/button.tsx
EXIT=0

pnpm --dir apps/webapp exec vitest run \
  src/app/app/patient/diary/symptoms/SymptomTrackingRow.ui.test.tsx \
  src/app/app/patient/treatment/PatientProgramMediaBlock.ui.test.tsx \
  src/shared/ui/patient/PatientSegmentedStrip.ui.test.tsx \
  src/infra/repos/pgPatientClinicalSymptomBridge.unit.test.ts \
  src/modules/system-settings/runtimeSettingsNoSubstitution.unit.test.ts
Test Files 5 passed; Tests 26 passed

git diff --check
EXIT=0
```

Корневой `pnpm typecheck` сначала обнаружил один новый дефект совместимости patient Button с
функциональным `className`. После исправления все ранее завершившиеся workspace-пакеты оставались зелёными,
а отдельно повторённый `pnpm --dir apps/webapp typecheck` завершился с `EXIT=0`; это переиспользование
зелёных фаз по §10, а не сокрытие первого падения.

Разовые проверки состояния (не tests/gates на текст исходника):

```text
rg -l 'DialogContent' apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient -g '*.tsx'
apps/webapp/src/shared/ui/patient/primitives/dialog.tsx
apps/webapp/src/shared/ui/patient/PatientModal.tsx

rg -n 'window\.(confirm|alert)' apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient
0 совпадений
```

### Живая приёмка

На изолированном DEV-порту сняты patient-only mobile экраны главной, дневника, пункта программы,
загруженных messages и комментариев, mobile fullscreen media mechanics, а также desktop пункт программы.
Сравнение с исходными скриншотами не показало пропажи контента, действий или сломанной page geometry;
новые chat/comment composers компактнее и соответствуют принятому doctor-like поведению.

Независимый media/modal audit дал PASS для mobile static preview → fullscreen modal, Escape/возврата
фокуса, desktop inline player и общей 300ms drawer-механики.

### Незакрытый pre-landing gate

Штатный DEV-вход врача отвечает `HTTP 500` на `POST /api/auth/email-password/login`; старые doctor
сессии отвечают `401`. Это не вызвано patient candidate и воспроизводится в отдельном auth worktree,
но без doctor session нельзя штатно создать новую жалобу и затем принять её symptom modal в живом
patient UI. База напрямую не изменялась и auth-обход не применялся.

Пока этот живой путь не проверен, candidate не имеет статуса `land-ready`: merge в
`feat/doctor-ui-rebuild`, полный CI интеграционного SHA и push `feat` не выполняются. TEST не
разворачивается.
