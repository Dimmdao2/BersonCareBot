# Adversarial audit — doctor KPI filters and chevrons (2026-09-14)

## Предмет и метод

- Candidate: `223ba843fb05c51098ce681d8b5c8f0c1776fc8e`.
- Зафиксированная база candidate: `dcbbf191d3aab2ec51ff040b076efc31046b9334` — результат
  `git merge-base HEAD feat/doctor-ui-rebuild`. Во время аудита `feat/doctor-ui-rebuild` сдвинулся вперёд до
  `ff9f65f22`; согласно AGENTS.md §24.3 предмет аудита не менялся и свежий `feat` в candidate не вливался.
- Authority: `docs/_TODO/DOCTOR_KPI_FILTERS_2026-09-14.md`.
- Классификация каждого пункта: **ВЗГЛЯД**. Тесты не читались, не запускались, не создавались и не изменялись.
  Использованы diff, чтение production-кода, TypeScript AST-introspection вызовов `DoctorStatCard`, typecheck и
  lint. Сервер `:5200` не запускался, не перезапускался и не останавливался.

## Findings

### F1 — сохранённый KPI-фильтр становится невидимым и неснимаемым после отключения статистики

Файл и строки:

- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx:1656-1657` — KPI-фильтры всегда
  восстанавливаются из cache;
- `ScheduleCalendarTab.tsx:1775-1794` — восстановленный набор всегда строит и применяет predicate;
- `ScheduleCalendarTab.tsx:3520-3526,3635-3642` — обе поверхности KPI-плиток целиком скрыты при
  `doctorStatisticsEnabled === false`;
- `ScheduleCalendarTab.tsx:1711-1717` — красный индикатор видит фильтр, но отдельного сброса KPI нет.

Что ломается: человек видит урезанное (для `firstVisitInPeriod` при отсутствии `kpis` — пустое) расписание, но в
панели нет выбранной плитки, повторным нажатием снять фильтр невозможно. Красная кнопка предупреждает, однако не
даёт выхода: открытая панель содержит только филиал/сотрудника/услугу/«Показывать отмены».

Воспроизведение:

1. При доступной статистике выбрать KPI «Первичных» либо другой KPI и уйти со страницы — значение сохраняется.
2. Отключить для организации entitlement/модуль статистики, не очищая browser storage.
3. Вернуться в «Расписание → Записи».
4. Cache восстанавливает KPI и фильтрует календарь/список; KPI-плиток нет ни в aside, ни в модалке фильтров, снять
   фильтр через UI нельзя.

Это опровергает полноту Э2.7/Э3.2 и требование о реальном escape для сохранённого активного фильтра.

### F2 — «Выбирать несколько дней» ошибочно получает красное предупреждение о скрытых данных

Файл и строки:

- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx:1592-1604` — красный класс включается по
  `multiSelectEnabled`;
- `ScheduleWorkTab.tsx:1132-1173` — этот state меняет только механику выбора ячеек;
- `ScheduleWorkTab.tsx:1105-1121` — видимые записи фильтруются выбором филиалов, не `multiSelectEnabled`.

Что ломается: красный warning, который по owner-authority означает «часть записей скрыта», показывается для режима
редактирования, который ничего не скрывает.

Воспроизведение:

1. Открыть «Расписание → График работы».
2. Нажать кнопку «Выбирать несколько дней» (`Layers`).
3. Ни один день/график не исчезает, но ободок и иконка становятся красными.

Это опровергает утверждение Э3.4, что общий красный класс применён там, где активное состояние прячет записи.

### F3 — у мобильного фильтра «На сопровождении» иконка остаётся синей

Файл и строки:

- `apps/webapp/src/app/app/doctor/patients/PatientsPageClient.tsx:665-681` — button получает красный общий класс,
  но `DoctorSupportStar` получает собственный `text-primary`;
- `apps/webapp/src/shared/ui/doctor/DoctorSupportStar.tsx:11-15` — текстовый цвет задаётся непосредственно child,
  поэтому родительский `text-destructive` не наследуется;
- `apps/webapp/src/lib/utils.ts:4-5` — `cn` применяет `twMerge`, оставляя явный child `text-primary`.

Что ломается: owner потребовал красными и ободок, и саму иконку; здесь красным становится только ободок, звезда
остаётся semantic-primary (синей).

Воспроизведение:

1. На mobile открыть список пациентов.
2. Нажать кнопку-звезду «Только: На сопровождении».
3. Список фильтруется, ободок красный, звезда синяя.

Это опровергает Э3.4 для `PatientsPageClient`.

### F4 — открывающая карточка «Отмены» в карточке пациента осталась без общего шеврона

Файл и строки:

- `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabRecords.tsx:791-804` — `DoctorStatCard` имеет
  `onClick`, который открывает/закрывает детали, но не имеет `opensDetails`;
- `PatientTabRecords.tsx:815-819` — по клику действительно раскрывается список отмен/неявок.

Что ломается: у карточки, которая открывает детали, отсутствует обещанный owner'ом единый affordance; полный
проход вызовов из Э1.5 пропустил этот call site.

Воспроизведение:

1. Открыть карточку пациента с отменой или неявкой и вкладку «Записи».
2. У плитки «Отмены» нет шеврона.
3. Нажать плитку — под KPI раскрывается панель деталей, то есть это не фильтр и не статичная карточка.

Это опровергает Э1.5. Сегментные карточки (`actionIcon`) корректно остаются без шеврона; KPI-фильтры расписания и
пациентов также корректно его не получают.

## Проверка claims authority

- **Э1.1–Э1.4 — подтверждены.** `opensDetails` и `ChevronRight` находятся в одном `DoctorStatCard`; класс находится
  в `doctorVisual.ts`; segmented branch рендерит `inner`, а не `content`; изменённые открывающие KPI «Сегодня»
  используют prop.
- **Э1.5 — не подтверждён:** F4. AST-introspection всех self-closing `DoctorStatCard` с `onClick`/`href` нашёл
  среди не-фильтров и не-segmented вызовов пропущенный `PatientTabRecords.tsx:792`.
- **Э1.6 — подтверждён чтением diff.** Команда
  `git diff --no-ext-diff --unified=0 feat/doctor-ui-rebuild...HEAD -- apps/webapp/src/app/app/doctor/DoctorTodayDashboard.tsx apps/webapp/src/app/app/doctor/DoctorTodayLeftKpiRow.tsx apps/webapp/src/app/app/doctor/DoctorTodayRightKpiRow.tsx`
  показывает только удаление цепочки `videoMeetingsEnabled` и добавление `opensDetails`; layout-классы верхних KPI
  не менялись.
- **Э2.1 — подтверждён.** State — массив, toggle добавляет/удаляет ключ без single-select.
- **Э2.2 — подтверждён для старого и повреждённого cache.** Отсутствующее поле, строка вместо массива и `null`
  дают `[]`; неизвестные ключи и non-string удаляются; дубликаты схлопываются `Set`; JSON/shape errors дают `null`
  без throw. Но доступность восстановленного валидного фильтра не учитывается — F1.
- **Э2.3 — подтверждён.** Predicate использует `selectedKpiFilters.every(...)` и применяется в
  `displayableCalendarEvents` и `visibleListAppointments`. В выражении календаря `&&` связывается раньше `||`,
  поэтому `event.kind !== 'appointment'` всегда пропускает working hours/blocks; KPI применяются только к
  appointments.
- **Э2.4 — подтверждён.** `includeCancelledAppointments` равен switch OR selected cancellation KPI, уходит в
  request и используется в обоих client filters. При снятии KPI с выключенным switch отмены сразу скрываются.
  Boolean входит в deps `fetchAppointmentFeedPage` → `loadInitialAppointmentFeed`; effect
  `ScheduleCalendarTab.tsx:1430-1437` перезапускает list feed при обоих переходах boolean. Другие KPI identity не
  вызывают reload.
- **Э2.5 — подтверждён.** Команда
  `rg -n "kpiModalFilter|KpiPreviewModal" apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx`
  вернула пустой результат.
- **Э2.6 — подтверждён при доступной KPI-поверхности.** Условие `(selected || value > 0)` сохраняет handler у
  выбранной плитки после падения counter до нуля; повторный клик снимает её. F1 описывает состояние, когда сама
  поверхность скрыта.
- **Э2.7 — persistence работает, но claim не принимается полностью:** F1.
- **Э3.1–Э3.3 — подтверждены.** Общий класс содержит destructive border/text и только destructive hover tint;
  idle background остаётся outline/canvas, не красным. При активном фильтре variant остаётся `outline` и при
  открытой панели.
- **Э3.4 — не подтверждён:** F2 и F3. Branch filter в `ScheduleWorkTab`, обычная filter-icon в
  `PatientsPageClient` и branch picker в `DoctorAnalyticsShell` используют общий класс корректно.
- **Э3.5 — подтверждён.** `DoctorTasksPageClient.tsx:120` и `PatientTabOverview.tsx:1976` продолжают использовать
  синий `DOCTOR_ACTIVE_FILTER_BUTTON_CLASS`.
- **Э4.1 — подтверждён свежим прогоном candidate.** `pnpm -C apps/webapp typecheck` → exit 0;
  `pnpm -C apps/webapp lint` → exit 0. Команды запускались без pipe.
- **Э5.1–Э5.6 — подтверждены чтением итогового дерева.** В `DoctorTodayNextAppointment.tsx` единственный
  interactive descendant карточки — внешний `Button`; модалка является sibling. Состояния без записи и
  `isCurrent` сохранены. `TodayAppointmentFullModal.tsx:118-125` сохраняет ссылку пациента;
  `DoctorCalendarEventPanel.tsx:1227-1260` сохраняет условные «Удалить», «Изменить» и
  «Начать <приём>»/«Видеозвонок». Для активной следующей записи «Удалить» по-прежнему продуктово недоступно:
  удаляются только уже отменённые статусы (`DoctorCalendarEventPanel.tsx:1033-1037`), а активная запись отменяется
  через edit-flow. Это не потеря действия из прежней карточки — прежняя карточка «Удалить» не содержала.
  `videoMeetingsEnabled` отсутствует в удалённой цепочке; оставшиеся совпадения относятся к отдельному
  `PatientEncounterStartModal`. Возврат в активный звонок остаётся глобально доступен через
  `DoctorWorkspaceShell.tsx:138-140`.

## Явные запреты и границы

- Test files в branch diff отсутствуют: команда
  `git diff --name-only dcbbf191d...HEAD | rg '(\\.test\\.|\\.spec\\.|/e2e/)'` вернула пустой результат.
- Добавления patient photo в product TSX отсутствуют: команда
  `git diff --unified=0 dcbbf191d...HEAD -- 'apps/webapp/**/*.tsx' | rg '^\\+[^+].*(Avatar|avatar|Image|img|photo|Фото|фото)'`
  вернула пустой результат.
- Размер product/plan candidate до audit artifact: **21 файл**, команда
  `git diff --name-only dcbbf191d...HEAD | wc -l` → `21`.
- Live-пункты Э4.2/Э4.3 не заявляются пройденными: brief запретил трогать общий `:5200`, а plan оставляет их после
  landing. Э4.4/Э4.5 и Э6.1 не отмечены выполненными и не входят в claims candidate.

## Вердикт

Четыре owner-visible сценария опровергают отмеченные claims Э1.5, Э2.7/Э3.2 и Э3.4. Candidate не проходит gate.

FAIL
