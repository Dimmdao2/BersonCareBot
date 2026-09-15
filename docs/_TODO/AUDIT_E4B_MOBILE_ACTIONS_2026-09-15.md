# Независимый аудит Э4b — действия модалки на mobile

## Вердикт

**PASS — MUST FIX: 0.** Проверен committed candidate `eaa39f795289d7ec5c8930e087d2d0ba24f2717a`
в ветке `wt/merge-conflict-detail`. Единственная продуктовая правка переводит footer общего
`DoctorModal` в одну колонку ниже `sm`; локальной mobile-модалки, изменения подписей или регрессии
desktop/tablet-раскладки в diff нет.

Проверка классифицирована как **взгляд**: предмет — CSS-геометрия, порядок JSX-детей, охват общего
примитива и честность снимков. Автоматический UI-тест здесь запрещён `AGENTS.md` §10a и не создавался.

## MUST FIX

Нет.

## Охват общего примитива

Числа получены в этом клоне следующими командами:

```bash
rg -l '<DoctorModal\b' apps/webapp/src --glob '*.tsx' | wc -l
# 50
rg -o '<DoctorModal\b' apps/webapp/src --glob '*.tsx' | wc -l
# 80

rg -l "@/shared/ui/doctor/primitives/dialog" apps/webapp/src --glob '*.tsx' | wc -l
# 42
rg -o '<Dialog\b' $(rg -l "@/shared/ui/doctor/primitives/dialog" apps/webapp/src --glob '*.tsx') | wc -l
# 63

comm -12 \
  <(rg -l '<DoctorModal\b' apps/webapp/src --glob '*.tsx' | sort) \
  <(rg -l "@/shared/ui/doctor/primitives/dialog" apps/webapp/src --glob '*.tsx' | sort)
# DoctorProgramDiscussionMessagesPanel.tsx
# PatientTabFiles.tsx

{ rg -l '<DoctorModal\b' apps/webapp/src --glob '*.tsx'; \
  rg -l "@/shared/ui/doctor/primitives/dialog" apps/webapp/src --glob '*.tsx'; } | sort -u | wc -l
# 90 уникальных TSX-consumer-файлов
```

Важная граница охвата: legacy `doctor/primitives/Dialog` действительно переходит на тот же
`DrawerContent` со свайпом вниз, но изменённую строку `doctorModalFooterBarClass` не использует. Его
mobile `DialogFooter` остаётся отдельным `flex flex-col-reverse`. Поэтому candidate меняет только
80 вызовов `DoctorModal` в 50 файлах, а не все 143 JSX-вызова обоих API.

Внутри `DoctorModal` footer реально объявлен в двух формах:

```bash
rg -n 'footer=\{' $(rg -l '<DoctorModal\b' apps/webapp/src --glob '*.tsx') | wc -l
# 32 footer-prop декларации
rg -n '<DoctorModalFooter\b' apps/webapp/src --glob '*.tsx' | wc -l
# 14 слотовых деклараций
```

Они сосредоточены в 29 source-файлах (20 с `footer={...}`, 10 с `DoctorModalFooter`, один файл
использует обе формы). Полный перечень затрагиваемых footer-контекстов:

| Источник | Модалка / действия ниже `sm` |
| --- | --- |
| `calendar/AppointmentPaymentSection.tsx` | «Приём оплаты»: отправить ссылку или выставить счёт + «Оплачено наличными» (slot) |
| `calendar/DoctorAppointmentCancelModal.tsx` | «Отмена записи»: «Отмена» / «Подтвердить отмену» |
| `calendar/DoctorCalendarEventPanel.tsx` | создание: очно / онлайн либо «Отмена» / «Сохранить»; наложение: «Отмена» / «Создать наложение»; просмотр: удалить либо изменить + начать приём/видеозвонок; редактирование: «Отменить» / «Сохранить» (slot) |
| `clients/PatientPackageSessionsList.tsx` | два подтверждения: «Отмена» / «Продолжить» и «Отмена» / «Подтвердить» |
| `clients/SpecialistTaskDetailsDialog.tsx` | «Задача»: «Изменить» / «Выполнить» |
| `clients/SpecialistTaskFormDialog.tsx` | новая/изменяемая задача: «Отмена» или «Удалить» + «Сохранить» (slot); подтверждение удаления: «Не удалять» / «Удалить» |
| `clinic/members/ClinicMembersClient.tsx` | «Пригласить врача»: «Закрыть» / «Создать» |
| `clinical-tests/ClinicalTestForm.tsx` | создать/сохранить тест — одно действие (slot) |
| `exercises/ExerciseForm.tsx` | создать/сохранить упражнение — одно действие (slot) |
| `patients/[userId]/PatientEncounterStartModal.tsx` | очно / онлайн либо «Отмена» / «Начать» (slot) |
| `patients/[userId]/tabs/PatientTabAccount.tsx` | «Личные данные»: «Отмена» / «Сохранить» |
| `patients/[userId]/tabs/PatientTabOverview.tsx` | «Задачи»: mobile-spacer + «Новая задача»; spacer больше не резервирует колонку и оставляет только grid-gap перед полноширинной кнопкой |
| `patients/[userId]/tabs/karta/EncounterViewModal.tsx` | просмотр приёма: «Изменить» — одно действие |
| `patients/[userId]/tabs/karta/PatientClinicalSections.tsx` | симптом, диагноз и редакторы карты: «Изменить»/«Закрыть», одиночное «Сохранить», пары «Отмена»/«Сохранить», «Вернуть» или «В историю» + «Сохранить» |
| `recommendations/RecommendationForm.tsx` | создать/сохранить рекомендацию — одно действие (slot) |
| `schedule/tabs/ScheduleCalendarTab.tsx` | «Добавить рабочие часы»: «Отмена» / «Сохранить» (slot) |
| `schedule/tabs/ScheduleSetupTab.tsx` | форма абонемента: «Отмена» / «Добавить» или «Сохранить»; карточка абонемента: «В архив» или «Вернуть» / «Изменить» |
| `schedule/tabs/ScheduleWorkTab.tsx` | шаблон: «Отмена» / «Создать»; расписание и постоянное расписание: «Отмена» / «Сохранить»; очистка: «Нет» / «Да» |
| `treatment-program-shared/DoctorExerciseRecommendationsModal.tsx` | «Рекомендации»: «Отмена» / «Сохранить» |
| `treatment-program-templates/new/NewTemplateForm.tsx` | создать шаблон — одно действие (slot) |
| `settings/BookingSoloLocationsSection.tsx` | филиал: «Отмена» / «Создать» или «Сохранить» |
| `settings/BookingSoloServicesSection.tsx` | услуга: «Отмена» / «Создать» или «Сохранить» |
| `settings/BookingSoloSpecialistsSection.tsx` | специалист: «Отмена» / «Создать» или «Сохранить» |
| `DoctorCatalogMobileToolbar.tsx` | фильтры: «Сбросить фильтры» — одно действие |
| `DoctorCatalogPersistPublishBar.tsx` | сохранить черновик/изменения + опубликовать; slot используется mobile-модалками комплексов ЛФК, наборов тестов и шаблонов программ |
| `DoctorDateTimePicker.tsx` | «Применить» — одно действие |
| `DoctorMedicalMergeConflictProvider.tsx` | «Отказать и передать администраторам платформы» / «Слить в этой организации» |
| `DoctorNewClientAction.tsx` | новый клиент: «Отмена» / «Создать» |
| `KpiPreviewModal.tsx` | generic footer; фактический caller «Задачи на сегодня»: wrapper «Все задачи» / «Новая задача» |

### Где колонка меняет пространственный смысл

- Все пары «Отмена» / «Сохранить» вместо левого/правого ряда становятся верхним/нижним рядом:
  создание записи, новая задача, личные данные, анамнез заболевания, образ жизни, рабочие часы,
  форма абонемента, разовое и постоянное расписание, рекомендации к упражнению, редактирование
  филиала, услуги и специалиста. Порядок DOM не меняется: вторичное действие сверху, primary снизу.
- В изменяемом `DoctorModal` нет состояния с тремя одновременно показанными действиями. Три
  синтаксических ветки в просмотре записи взаимоисключаются: отменённая запись даёт «Удалить»,
  активная — максимум «Изменить» + «Начать…»/«Видеозвонок». Аналогично ветки оплаты, старта приёма
  и сопутствующего заболевания показывают максимум два действия.
- Две реальные тройки найдены только в legacy `DialogFooter`: «Отмена / Скрыть / Сохранить» в
  `TreatmentProgramInstanceDetailClient.tsx` и «Удалить группу / Отмена / Сохранить» в
  `TreatmentProgramConstructorClient.tsx`. Candidate их не меняет: legacy footer уже был
  `flex-col-reverse` на mobile.
- `max-sm:[&>div]:contents` на прямом `div`-ребёнке footer снимает его собственный layout-box и
  делает его детей grid-items общей панели. Поэтому wrapper из `DoctorCatalogPersistPublishBar` и
  wrapper «Все задачи / Новая задача» больше не удерживают свой внутренний ряд/`justify-between` на
  mobile: дети становятся отдельными полноширинными строками. `max-sm:[&>div>*]:w-full` задаёт им
  ширину. На `sm+` оба `max-sm`-селектора не действуют, wrapper сохраняется.

## Порядок действий в модалке конфликта

JSX-порядок сохранён: первым ребёнком footer остаётся отказ, вторым — слияние. При `grid-cols-1`
сверху будет «Отказать и передать администраторам платформы», ниже — «Слить в этой организации».

`DOCTOR_APP_UI_STYLE_GUIDE.md` §14 требует `DoctorModal`, §16 задаёт варианты primary/secondary,
§19 описывает mobile-геометрию; ни один из этих разделов не задаёт вертикальный порядок действий.
Канон идентичности §18б также задаёт ровно два действия, но не их положение. Поэтому это **не
finding**, а вопрос владельцу ниже.

## Каскад Tailwind на `sm+`

Минимальная компиляция именно установленным `tailwindcss 4.3.3` выполнена через общий host-lock:

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm --dir apps/webapp exec node --input-type=module -e '<compile указанного набора classes>'"
# EXIT=0
```

Tailwind выдал правила в таком существенном порядке:

1. `.grid { display: grid }`;
2. `.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)) }`;
3. внутри `@media (width >= 40rem)` — `.sm:flex { display: flex }`, затем
   `.sm:justify-end { justify-content: flex-end }`;
4. базовый `[&>*]:w-full`;
5. внутри следующего `@media (width >= 40rem)` — `sm:[&>*]:w-auto`;
6. только внутри `@media (width < 40rem)` — оба `max-sm`-селектора для `display: contents` и
   `width: 100%`.

На `sm+` `sm:flex` идёт после `.grid` с той же специфичностью и меняет `display` на `flex`;
`grid-template-columns` не переопределяется, а становится неактивным для flex-контейнера.
`sm:[&>*]:w-auto` идёт после базового `[&>*]:w-full` и возвращает прямым детям auto-width.
Итоговая desktop/tablet-геометрия остаётся прежней: flex-ряд, выровненный вправо. Диапазоны
`width >= 40rem` и `width < 40rem` не пересекаются.

## Подписи и локальные копии

```bash
rg -n "Отказать и передать администраторам платформы|Слить в этой организации|truncate|line-clamp" \
  apps/webapp/src/shared/ui/doctor/DoctorMedicalMergeConflictProvider.tsx
# строки обеих полных подписей; truncate/line-clamp в компоненте нет

rg -n "grid-flow-col auto-cols-fr|max-sm:\[&>div\]:contents|<Drawer(Content)?\b" \
  apps/webapp/src/app/app/doctor apps/webapp/src/app/app/settings \
  apps/webapp/src/shared/ui/doctor --glob '*.tsx'
# footer-класс только в DoctorModal.tsx; Drawer-разметка только в DoctorModal.tsx
# и legacy doctor/primitives/dialog.tsx
```

Подписи не менялись, не сокращались и не получили `truncate`/иконную замену. Это выполняет прямой
критерий текущего Э4b-аудита. В актуальном `AUTH_AND_IDENTITY_CANON.md` §18б уже записан следующий
этап Э4c с будущими короткими «Принять»/«Отказать» и подтверждениями; он не реализован этим
candidate и не превращён здесь в finding против ограниченной правки Э4b.

Локальной копии mobile-разметки candidate не добавил. Diff commit содержит одну замену класса в
общем примитиве, две исходные PNG и отчёт автора.

## Типы, линт и статические проверки

Ограничение worktree подтверждено, а не принято со слов автора. При временно убранном и затем
немедленно восстановленном `packages/platform-merge/dist` команда:

```bash
pnpm --dir apps/webapp exec tsc --noEmit --pretty false
# EXIT=1; TS2307: Cannot find module '@bersoncare/platform-merge'
```

После разрешённой сборки пакета через общий замок:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir packages/platform-merge run build"
# EXIT=0
pnpm --dir apps/webapp exec tsc --noEmit --pretty false
# EXIT=0
pnpm --dir apps/webapp exec eslint src/shared/ui/doctor/DoctorModal.tsx
# EXIT=0
git diff --check eaa39f795^ eaa39f795
# EXIT=0
```

Причина первого падения — отсутствующий build-output workspace-пакета; после его сборки новых
ошибок типов нет. Полный CI и автоматические UI-тесты не запускались.

## Честность отчёта автора

Отчёт не выдаёт pre-fix PNG за post-fix: обе строки «После» явно помечены `BLOCKED`, а таблица и
текст называют два PNG исходными. Их побайтовая идентичность источникам подтверждена:

```bash
sha256sum docs/_TODO/E4B_MOBILE_ACTIONS_2026-09-15/*.png \
  docs/_TODO/LIVE_ACCEPTANCE_E4B_MODAL_2026-09-15/*.png
# desktop-копия и источник: 6ed2c7f...; mobile-копия и источник: ec77ec12...
```

Причина блокировки подтверждена текущим runtime-состоянием:

```bash
ss -ltnp '( sport = :5200 )'
# next-server, PID 2254475
readlink -f /proc/2254475/cwd
# /home/dev/dev-projects/BersonCareBot/apps/webapp
git -C /home/dev/dev-projects/BersonCareBot merge-base --is-ancestor eaa39f795 HEAD
# EXIT=1
```

В основном дереве у запущенного сервера строка всё ещё `grid-flow-col auto-cols-fr`; значит живой
`:5200` не содержит candidate. По §1a/§24.3 аудитор не вправе поднимать второй Next или подменять
основное дерево до landing. Отсутствие упомянутого helper дополнительно проверено точным
`find /home/dev/dev-projects -name port-shot.sh -type f -print` (пусто), точным `rg` и
`code-search`: найдено только документационное упоминание, исполняемого файла нет.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

1. Какой вертикальный приоритет должен стать каноническим для mobile footer: DOM-порядок
   `secondary сверху → primary снизу`, который теперь получает `DoctorModal`, или существующий у
   legacy `DialogFooter` порядок `primary сверху → secondary снизу` через `flex-col-reverse`?
   Для конфликта это выбор между «Отказать» сверху / «Принять» снизу и обратным порядком. Канон
   сейчас положение не задаёт, поэтому решение не блокирует этот PASS и не порождает fix без ответа.

## НЕ СДЕЛАНО

- Не сняты post-fix desktop/mobile-снимки модалки конфликта и соседних модалок: candidate ещё не
  landed в единственный runtime `:5200`.
- Не выполнена живая UI-приёмка; она остаётся post-landing gate ведущего/владельца.
- Не запускались полный CI, Vitest, component/DOM/UI-тесты.
- Не поднимался второй Next, не занимался и не перезапускался `:5200`.
- Не применялись миграции и не выполнялись операции с DEV/TEST/PROD или правами.
- Не изменялись product-код, подписи, план и строка вердикта в `feat`; аудитор оставил только этот
  audit-artifact.
