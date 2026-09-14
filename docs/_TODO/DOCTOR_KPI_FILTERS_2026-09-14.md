# КПИ-плитки: фильтры вместо списков + понятная «открывашка» (14.09.2026)

Ветка: `wt/kpi-filters`. Клон: `/home/dev/dev-projects/bcb-wt-kpi-filters` (суффикс порта `kpi-filters`).
Миграций в задаче нет. **Тестов на интерфейс в этой работе не появляется** — прямое указание владельца.

## Что сказал владелец (дословно, 14.09)

> «У нас есть КПИ, одни из них открывают списки. Другие мы можем сделать фильтрами… надо, чтобы они не
> открывали списки, а чтобы они начинали фильтровать содержимое календаря… они могут несколько
> одновременно быть выбранными… модалку свернули, и мы должны видеть на календаре или в списке записей
> только отфильтрованное значение… она должна сохраняться… в рамках этой сессии».

> «Имеет смысл сделать иконку выбранных фильтров не с синим ободочком и синего цвета, а с красным
> ободочком и красного цвета, только не надо фон красный у неё делать — достаточно просто вместо синего
> цвета сейчас ободка и самого цвета иконки поменять на красный».

> «Если эта карточка что-то открывает, например, модалку со списком, то справа у неё вот эта вот галочка
> должна появиться… и тогда это будет понятнее… что сюда можно ткнуть».

> «Не надо менять верхние карточки… этого делать не надо» — из присланной картинки берётся ТОЛЬКО принцип
> «шеврон справа у того, что открывается». Раскладку карточек с картинки не переносить.

> «Не надо писать тесты на интерфейс, никаких тестов в этой работе не должно появиться».

> «Сделано это едиными элементами, переиспользованием, никаких кастомных, чтобы не было везде написано
> по-разному».

## Почему красный, а не синий (смысл правила, не улика)

Активный фильтр означает, что человек видит **часть** записей. Забыть об этом — значит принять решение по
неполной картине. Синий у нас означает «активный элемент управления» и встречается повсюду; красный
ободок читается как предупреждение и держит внимание. Фон красным не заливаем — это кнопка панели, а не
ошибка.

---

## Э1. Общий шеврон у карточки, которая что-то открывает

- [x] Э1.1 В `apps/webapp/src/app/app/doctor/analytics/clients/DoctorStatCard.tsx` добавлен один
      опциональный признак (`opensDetails?: boolean`), при котором справа в карточке рисуется общий
      шеврон `ChevronRight`. Никакой per-page вёрстки шеврона нигде больше нет.
      Доказательство: `DoctorStatCard.tsx:32,180-187`.
- [x] Э1.2 Класс шеврона живёт в `apps/webapp/src/shared/ui/doctor/doctorVisual.ts` рядом с остальными
      `doctorStatCard*`-классами (один источник вида).
      Доказательство: `doctorVisual.ts:138-139`.
- [x] Э1.3 Шеврон не появляется у сегментной карточки (`actionIcon` + `onActionClick`) — у неё справа уже
      есть свой сегмент действия.
      Доказательство: `DoctorStatCard.tsx:189-205` рендерит segment с `inner`, не `content`.
- [x] Э1.4 Признак проставлен на странице «Сегодня» (`DoctorTodayLeftKpiRow.tsx`,
      `DoctorTodayRightKpiRow.tsx`, `DoctorTodayDashboard.tsx`) у тех плиток, клик по которым открывает
      модалку со списком или уводит на страницу.
      Доказательство: `DoctorTodayLeftKpiRow.tsx:191,205,219`, `DoctorTodayRightKpiRow.tsx:183`, `DoctorTodayDashboard.tsx:351,358,380,391`.
- [x] Э1.5 Пройдены остальные вызовы `DoctorStatCard` (список ниже) и признак проставлен там, где клик
      открывает список/страницу. Плитка-фильтр и плитка без клика шеврон НЕ получают.
      Доказательство: `rg -n "opensDetails" apps/webapp/src/app/app` — открывающие KPI в analytics/material-ratings; schedule/patients filters не содержат prop.
- [x] Э1.6 Верхние карточки страницы «Сегодня» по раскладке не изменены (сверка скриншотом до/после).
      Доказательство: `git diff -- DoctorTodayDashboard.tsx DoctorTodayLeftKpiRow.tsx DoctorTodayRightKpiRow.tsx` — добавлены только `opensDetails`, layout-классы не менялись.

## Э2. КПИ расписания фильтруют календарь, а не открывают модалку

- [x] Э2.1 В `ScheduleCalendarTab.tsx` одиночный `kpiModalFilter` заменён набором выбранных КПИ-фильтров
      (несколько одновременно).
      Доказательство: `ScheduleCalendarTab.tsx:990,2716-2719`.
- [x] Э2.2 Выбор складывается в уже существующее хранилище фильтров вкладки
      (`SCHEDULE_FILTERS_STORAGE_KEY`, `readCachedScheduleFilters` / `writeCachedScheduleFilters`) — тем
      же способом, каким сохраняются «показывать отмены» и выбор филиала. Нового механизма хранения не
      заводится.
      Доказательство: `ScheduleCalendarTab.tsx:172-208,1662-1679`.
- [x] Э2.3 Выбор применяется и к календарю, и к списку записей: показываются только записи, проходящие
      **все** выбранные КПИ-условия.
      Доказательство: `ScheduleCalendarTab.tsx:1771-1803,2641-2664`.
- [x] Э2.4 Выбранный фильтр «Отмены» сам показывает отменённые записи, не требуя отдельно включать
      «Показывать отмены» (иначе фильтр даёт пустой экран).
      Доказательство: `ScheduleCalendarTab.tsx:1279-1296,1792-1803,2645-2648`.
- [x] Э2.5 Модалка КПИ-списка на этой вкладке больше не открывается; мёртвый код модалки убран.
      Доказательство: `rg -n "kpiModalFilter|KpiPreviewModal" ScheduleCalendarTab.tsx` — 0 совпадений.
- [x] Э2.6 Выбранное состояние плитки видно (используется уже имеющийся `selected` у `DoctorStatCard`),
      повторный клик снимает фильтр.
      Доказательство: `ScheduleCalendarTab.tsx:511-535,2716-2719`.
- [x] Э2.7 Фильтры переживают уход со страницы и возврат в пределах сессии.
      Доказательство: `ScheduleCalendarTab.tsx:181-208,1640-1679` (`localStorage` existing cache).

## Э3. Красный индикатор активных фильтров

- [x] Э3.1 В `apps/webapp/src/shared/ui/doctor/calendar/DoctorSchedulePeriodNav.tsx` рядом с
      `DOCTOR_ACTIVE_FILTER_BUTTON_CLASS` заведён один общий класс для состояния «фильтры прячут часть
      записей»: красный ободок и красная иконка, **фон не красный**.
      Доказательство: `DoctorSchedulePeriodNav.tsx:14-17`.
- [x] Э3.2 Обе кнопки фильтра в `ScheduleCalendarTab.tsx` используют его, когда активен хоть один фильтр —
      включая новые КПИ-фильтры (`hasActiveScheduleFilters` расширен ими).
      Доказательство: `ScheduleCalendarTab.tsx:1707-1713,2814-2823,3052-3061`.
- [x] Э3.3 Красный виден и при открытой панели фильтров тоже (сейчас открытая панель перекрашивает кнопку
      в синий `variant="default"`).
      Доказательство: `ScheduleCalendarTab.tsx:2817,3055` выбирают `default` только без активных фильтров.
- [x] Э3.4 Тот же общий класс применён там, где активный фильтр так же прячет записи:
      `ScheduleWorkTab.tsx`, `PatientsPageClient.tsx`, `DoctorAnalyticsShell.tsx`.
      Доказательство: `ScheduleWorkTab.tsx:1564,1595`, `PatientsPageClient.tsx:671,690`, `DoctorAnalyticsShell.tsx:224`.
- [x] Э3.5 Переключатели «показывать выполненные задачи» (`DoctorTasksPageClient.tsx`,
      `PatientTabOverview.tsx`) остаются синими: они записи не прячут, а наоборот показывают.
      Доказательство: `git diff --name-only` не содержит `DoctorTasksPageClient.tsx` или `PatientTabOverview.tsx`.

## Э4. Приёмка

- [ ] Э4.1 `pnpm -C apps/webapp lint` и `typecheck` зелёные на ветке.
      Не закрыто: `pnpm run typecheck` — green; полный lint блокирует предсуществующий HEAD-файл `apps/webapp/db/drizzle-migrations/20260914T111500_leads_core.sql:61-62` (RLS declaration вне scope).
- [ ] Э4.2 Живой прогон на DEV: расписание — выбрать два КПИ, свернуть панель, увидеть отфильтрованный
      календарь и список; уйти со страницы и вернуться — фильтры на месте; иконка фильтра красная.
- [ ] Э4.3 Живой прогон на DEV: «Сегодня» — у открывающих плиток виден шеврон, верхние карточки по
      раскладке не изменились.
- [ ] Э4.4 Независимый адверсарный аудит ветки, строка вердикта в
      `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`.
- [ ] Э4.5 Приземление — **только по слову владельца** («Я скажу, когда можно»).

## Вызовы `DoctorStatCard` (полный список для Э1.5)

`admin/analytics/PlatformAnalyticsPageClient.tsx`, `doctor/DoctorTodayDashboard.tsx`,
`doctor/DoctorTodayLeftKpiRow.tsx`, `doctor/DoctorTodayRightKpiRow.tsx`,
`doctor/analytics/activity/ActivityAnalyticsTab.tsx`,
`doctor/analytics/clients/AdminPlatformRegistrationStatsClient.tsx`,
`doctor/analytics/clients/AdminPlatformSubscriberStatsClient.tsx`,
`doctor/analytics/clients/DoctorAnalyticsAppointmentsSection.tsx`,
`doctor/analytics/clients/DoctorAnalyticsClientsPageClient.tsx`,
`doctor/analytics/finance/FinanceAnalyticsTab.tsx`,
`doctor/analytics/notifications/NotificationsAnalyticsClient.tsx`,
`doctor/analytics/records/RecordsAnalyticsTab.tsx`,
`doctor/material-ratings/MaterialContentStatsClient.tsx`, `doctor/patients/PatientsPageClient.tsx`,
`doctor/patients/[userId]/tabs/PatientTabFinances.tsx`,
`doctor/patients/[userId]/tabs/PatientTabOverview.tsx`,
`doctor/patients/[userId]/tabs/PatientTabRecords.tsx`,
`doctor/schedule/tabs/ScheduleCalendarTab.tsx`, `doctor/usage/ProductAnalyticsSection.tsx`.

## Открытые вопросы владельцу (не работа — вопрос)

- Э3.4: красный индикатор применён не только на расписании, но и на списке пациентов и в аналитике —
  там активный фильтр точно так же прячет часть записей. Если нужно только на расписании — скажи, сниму.
