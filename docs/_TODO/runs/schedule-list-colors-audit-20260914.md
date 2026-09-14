# Независимый аудит: список, цвет филиала, подпись периода

Предмет проверки: commit `3e2f6824c21ee337ddc5f56a0e20af913e172e93` против
`docs/_TODO/DOCTOR_SCHEDULE_LIST_COLORS_PERIOD_2026-09-14.md`.

Классификация: **ВЗГЛЯД**. Тесты не создавались и не изменялись.

## Вердикт: FAIL

| Пункт | Результат | Кратко |
| --- | --- | --- |
| Э1 — якорь и прокрутка списка | **НЕ ЗАКРЫТ** | Для `weekgrid` вне текущей недели fallback берёт `anchorDate`, а не начало `visibleRange`; на первом дне месяца marker стоит перед заголовком месяца, а не на заголовке дня. |
| Э1.3 — синяя полоска ближайшей записи | **ЗАКРЫТ** | `isNext` по-прежнему выбирает первую будущую неотменённую запись, класс `border-t-2 !border-t-primary` сохранён; удалён только ref прокрутки к строке. |
| Э2 — цвет филиала | **НЕ ЗАКРЫТ** | `textColor` формируется и передаётся FullCalendar, но в основной сетке и мини-календаре его перекрывает `color: var(--foreground) !important`. Строка списка сделана правильно. |
| Э3 — подпись периода | **НЕ ЗАКРЫТ** | Форматирование диапазона и обе точки вывода правильны, но `loadKpis` и подпись используют разные источники `tz`; после синхронизации пояса устройства подпись может описывать не тот интервал, по которому получены числа. |

## Э1 — якорь и прокрутка списка: НЕ ЗАКРЫТ

### FAIL: fallback не всегда является началом видимого периода

`visibleRange('weekgrid', ...)` начинает период с `startOf('week')`
(`apps/webapp/src/app/app/doctor/schedule/scheduleCalendarRange.ts:26-32`). Однако `listAnchorDate`
вычисляет `periodStart` через `startOf('month')` только для `month`, а для любого другого вида возвращает
непосредственно `anchorDate` (`apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx:1763-1768`).

Достижимый сценарий: врач открывает `weekgrid` с anchor в середине недели, уходит на соседнюю неделю и включает
список. Сегодня в выбранную неделю не входит, поэтому по Э1.1 нужен понедельник из `visibleRange`, но код ставит
якорь на день недели из `anchorDate` и пропускает более ранние дни выбранной недели. Это прямое нарушение
«иначе — начало периода».

### FAIL: marker не всегда указывает на заголовок дня

Индекс целевой группы выбирается как первый `dateKey >= anchorDate`, а при отсутствии будущей группы — последняя
имеющаяся группа (`ScheduleCalendarTab.tsx:810-814`). Сам `anchorMarkerRef` вставлен перед условным заголовком
месяца, и только после него рендерится `ListDayCard` с заголовком дня (`ScheduleCalendarTab.tsx:914-931`; сам
заголовок дня — `ScheduleCalendarTab.tsx:632-638`). Эффект прокручивает именно к marker
(`ScheduleCalendarTab.tsx:816-845`).

Поэтому, когда целевой день является первой показанной датой нового месяца — в частности, сегодня первое число
месяца либо после последнего числа ближайшая запись приходится на первое число следующего месяца, — прокрутка
встаёт на заголовок месяца. Э1.2 требует целью заголовок дня.

### Остальные проверенные ветки

- Сегодня определяется в выбранном серверном поясе через `DateTime.now().setZone(zone)`, не через локальную дату
  браузера (`ScheduleCalendarTab.tsx:1763-1775`); группировка записей использует переданный `timeZone`
  (`ScheduleCalendarTab.tsx:768-793`). Сам выбор сегодня внутри полуоткрытого диапазона `[from, to)` корректен.
- Если на сегодня записей нет, `findIndex(dateKey >= anchorDate)` выбирает ближайший последующий день с записью
  (`ScheduleCalendarTab.tsx:810-814`). Если будущих записей вообще нет, выбирается последняя имеющаяся группа; при
  полностью пустой ленте показывается `Записей нет` и эффект не пытается скроллить отсутствующий marker
  (`ScheduleCalendarTab.tsx:903-911`).
- Повторный вход в список перемонтирует условный `ListView` (`ScheduleCalendarTab.tsx:3182-3206`), поэтому refs
  позиционирования создаются заново (`ScheduleCalendarTab.tsx:752-758`). Нажатие «Сегодня» при уже сегодняшнем
  `anchorDate` всё равно увеличивает `listTodayRequest` (`ScheduleCalendarTab.tsx:1644-1650`), а эффект сравнивает
  и anchor, и номер запроса (`ScheduleCalendarTab.tsx:823-844`); защита не блокирует явное повторное
  позиционирование.
- Перед prepend сохраняются `scrollHeight` и `scrollTop`, после загрузки добавленная высота компенсируется
  (`ScheduleCalendarTab.tsx:855-875`, `ScheduleCalendarTab.tsx:887-893`). Эффект первоначального позиционирования
  не зависит от `appointments.length`/`loadingEarlier`, поэтому prepend сам по себе не возвращает список к anchor.

## Э1.3 — синяя полоска ближайшей записи: ЗАКРЫТ

Первая будущая неотменённая запись по-прежнему находится проходом по отсортированным дневным группам
(`ScheduleCalendarTab.tsx:795-808`). В строке вычисляется `isNext = appt.id === nextApptId`, после палитры строки
по-прежнему добавляется `border-t-2 !border-t-primary border-b-border/60`
(`ScheduleCalendarTab.tsx:640-663`). Из кандидата удалён `nextAppointmentRef`, ранее использовавшийся как цель
скролла, но вычисление `isNext` и визуальная отметка не удалены.

## Э2 — цвет филиала: НЕ ЗАКРЫТ

### Что реализовано правильно

- Кандидат убрал `text-foreground` именно из ветки `branch`
  (`apps/webapp/src/shared/ui/doctor/calendar/doctorCalendarPresentation.ts:120-125`) и возвращает валидный
  `textColor` вместе с branch background/border (`doctorCalendarPresentation.ts:239-262`). Если `branchColor`
  отсутствует, выбирается ветка `default` с `text-foreground`, поэтому поверхности без fallback для `null` нет
  (`doctorCalendarPresentation.ts:142-152`).
- Отмена первой перехватывает палитру и исключается из branch colors; абонемент выбирает violet surface и тоже
  исключается из branch colors; ожидание оплаты сохраняет branch background/text, но border оставляет статусному
  классу (`doctorCalendarPresentation.ts:142-155`, `doctorCalendarPresentation.ts:239-262`). Эти приоритеты
  кандидатом не сломаны.
- В списке CSS-переменная `--list-branch-text` задаётся только вместе с валидными background/border
  (`ScheduleCalendarTab.tsx:607-618`), подпись филиала использует её, имя пациента остаётся унаследованным
  `text-foreground`, а у отменённой записи подпись остаётся `text-muted-foreground`
  (`ScheduleCalendarTab.tsx:640-689`).

### FAIL: календарные поверхности перекрывают `textColor`

Основная сетка передаёт результат `doctorCalendarAppointmentBranchColors(event)` в EventInput
(`ScheduleCalendarTab.tsx:2471-2488`). FullCalendar кладёт этот `textColor` обычным inline `color` на
`.fc-event-main`, но тот же компонент затем задаёт `.fc-event .fc-event-main { color: var(--foreground)
!important; }` (`ScheduleCalendarTab.tsx:3263-3275`). `!important` author rule сильнее обычного inline style,
поэтому видимый текст остаётся foreground, а не цветом филиала.

Мини-календарь «Сегодня» действительно использует тот же общий helper
(`apps/webapp/src/app/app/doctor/DoctorTodayMiniCalendar.tsx:124-138`), но повторяет то же перекрытие:
`--fc-event-text-color: var(--foreground) !important` и `color: var(--foreground) !important`
(`DoctorTodayMiniCalendar.tsx:201-214`). Поэтому Э2.1 и Э2.3 не достигают наблюдаемого результата ни в основной
сетке, ни в «Сегодня».

## Э3 — подпись периода: НЕ ЗАКРЫТ

### Что реализовано правильно

`kpiPeriodLabel` берёт полуоткрытый `visibleRange` и вычитает сутки из `to`
(`ScheduleCalendarTab.tsx:428-438`). Это даёт:

- `day` — один включённый день (`scheduleCalendarRange.ts:44-49`);
- `3days` — anchor и ещё два включённых дня (`scheduleCalendarRange.ts:17-23`);
- `weekgrid` — понедельник—воскресенье (`scheduleCalendarRange.ts:26-32`);
- `month` — первое—последнее число месяца (`scheduleCalendarRange.ts:35-41`).

Ветки форматирования в `kpiPeriodLabel` корректно сокращают общий месяц/год и полностью печатают оба года при
переходе через границу года (`ScheduleCalendarTab.tsx:433-438`). Один и тот же `kpiPeriod` передан в sidebar
(`ScheduleCalendarTab.tsx:3588-3601`) и в мобильную/узкую панель фильтров
(`ScheduleCalendarTab.tsx:3708-3718`). Сам диапазон KPI кандидатом не менялся: `loadKpis` продолжает вызывать
`visibleRange` (`ScheduleCalendarTab.tsx:1487-1503`).

### FAIL: подпись и KPI не связаны одним `tz`

`loadKpis` строит `from/to` по замороженному при mount `timeZone`
(`ScheduleCalendarTab.tsx:988`, `ScheduleCalendarTab.tsx:1487-1518`), а `kpiPeriod` передаёт в helper
`data?.timeZone ?? timeZone` (`ScheduleCalendarTab.tsx:1749-1753`). Это разные источники диапазона.

Расхождение достижимо без ручной настройки: staff-shell после mount синхронизирует сохранённый пояс с поясом
устройства (`apps/webapp/src/shared/ui/doctor/StaffCalendarTimezoneBootstrap.tsx:44-56`), а каждый calendar API
request заново разрешает effective timezone и возвращает его как `data.timeZone`
(`apps/webapp/src/app/api/doctor/booking-engine/calendar/route.ts:41-47`,
`apps/webapp/src/app/api/doctor/booking-engine/calendar/route.ts:72-79`). После первого входа либо переезда
calendar refresh может уже вернуть новый пояс, тогда как state `timeZone` остаётся старым. Числа KPI считаются по
старым UTC-границам, а подпись строится по новым. На границе локального дня это меняет включённые записи и нарушает
Э3.2.

## Вне плана

Нет вопросов или рекомендаций вне authority.

## Что я проверить не смог

- Живой candidate UI не проверялся: общий `:5200` запущен из главного дерева, а brief запрещает поднимать или
  перезапускать candidate-сервер. По §24.7 эта проверка остаётся после landing.
- Во время аудита ветка была внешне продвинута с проверяемого `3e2f6824c` на `434c3a6e9`. Поэтому кодовые выводы
  выше получены из точного snapshot командой `git show 3e2f6824c:<path>`, а локальная автоматическая проверка ниже
  относится уже к рабочему дереву на `434c3a6e9`, не является доказательством точного SHA кандидата и не меняет
  FAIL-вердикт.

## Выполненная автоматическая проверка

Команда без пайпа:

```bash
pnpm --dir apps/webapp exec eslint src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx src/shared/ui/doctor/calendar/doctorCalendarPresentation.ts && pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp exec vitest run src/shared/ui/doctor/calendar/doctorCalendarPresentation.unit.test.ts
```

Результат: exit `0`; Vitest сообщил `Test Files 1 passed (1)` и `Tests 8 passed (8)`. Существующий unit-файл
подтверждает возврат палитры helper, но не проверяет CSS cascade живого FullCalendar и потому не опровергает
находку Э2.
