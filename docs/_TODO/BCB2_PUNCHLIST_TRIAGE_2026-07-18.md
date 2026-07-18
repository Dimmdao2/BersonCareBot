# BCB пунш-лист — триаж против кода (feat/doctor-ui-rebuild), 2026-07-18

Независимый триаж каждого пункта `BCB2_OWNER_PUNCHLIST_2026-07-18.md` против ФАКТИЧЕСКОГО кода (не по названиям файлов).
Итог: **26 из 32 проверенных пунктов уже DONE в коде.** Реальная работа — 6 пунктов (ниже). Пути под `apps/webapp/`.

## Уже DONE (проверено, evidence)
| ID | Evidence |
|---|---|
| TDY-1..6 | `DoctorTodayRightKpiRow.tsx` (split-карточки, клик-по-половине, гейт пустой модалки, поиск не передаётся); TDY-6 влит 0847697e5 |
| SCH-G2 (=SET-L1) | пикер цвета `BookingSoloLocationsSection.tsx:107-113,204-222`; потребляется календарём/графиком/заливкой (`ScheduleCalendarTab.tsx:449,471-489`, `ScheduleWorkTab.tsx:309-335,366-381`) |
| SCH-G4 | `ScheduleWorkTab.tsx:185-212` + effect `:1003-1026` (prefill по первому выбранному дню) |
| SCH-G6 | перерыв после приёма шаг 5 мин `BookingSoloServicesSection.tsx:123,243`, валидация `services/route.ts:10`, применяется `service.ts:430` |
| SCH-C1 | `ScheduleSetupTab.tsx:377,340` `booking_calendar_default_window`, потребляется Schedule+Today |
| SCH-C2 | `ScheduleWorkTab.tsx:778` emit → `ScheduleCalendarTab.tsx:1067-1073` listener → reload не нужен |
| SCH-C3 | `booking-calendar/visibleTimeWindow.ts:4-62` дефолт 09–19, только расширяется ±60мин, не ужимается |
| SCH-C7 | `booking-calendar/appointmentStatusLabels.ts:7` `confirmed→Подтверждена`, применён в Schedule-календаре+панели |
| SCH-C8 | красный круг все режимы `ScheduleCalendarTab.tsx:1832-1967`, шапка выше |
| CLI-2 | `PatientsPageClient.tsx:329-336,1193-1201` (filtered + разделитель + всего) |
| CLI-5 | `PatientsPageClient.tsx:1253-1263` фильтр «Пуш-уведомления» (`hasWebPush`) |
| CLI-7 | кликабельные каналы `PatientsPageClient.tsx:644,656,660,671` |
| CLP-1 | возраст в шапке `PatientCardClient.tsx:534` (`calculateAgeYears`) |
| CLP-2 | `PatientCardClient.tsx:476-481` общий `DoctorDatePicker` (как в визите) |
| CLP-3 | кликабельные каналы `PatientCardClient.tsx:631-711` |
| PRG-1 | первый этап unlocked `instanceEditorBatchApply.ts:440` + тест |
| PRG-2 | стрелки порядка групп + persist `TreatmentProgramInstanceDetailClient.tsx:1594-1613` → `pgTreatmentProgramInstance.ts:1351-1377` (реальный UPDATE). ⚠ владелец пишет «не работает» — рекомендую живой клик-тест |
| ABO-4 | каталог шаблонов `ScheduleSetupTab.tsx:472-774` (SectionPackages) |
| ABO-5 | будущая дата запрещена `DoctorDatePicker.tsx:44,72` + `max={today}` |
| ABO-6 | только активные+usableInPackages `ScheduleSetupTab.tsx:589`, `DoctorClientMembershipsPanel.tsx:412` |
| ABO-7 | реальная расшифровка `{svc.title} × {qty}` `ScheduleSetupTab.tsx:627-716`; строки «Позиций: N» в репо нет |
| AB2-1 | фиолетовый бейдж `PatientTabRecords.tsx:389-396` и др. |
| AB2-2 | `bookingMemberships.ts:104-127` `display_number` unique; `memberships/display.ts` `аб.#001` |
| AB2-4 | все активные абонементы `PatientTabRecords.tsx:653-736` |
| AB2-5 | история закрытых collapsible `PatientTabRecords.tsx:798-887` |
| AB2-6 | «глаз» → подсветка привязанных `PatientTabRecords.tsx:770-858` |
| AB2-8 | «Осталось N визитов…» `PatientTabOverview.tsx:1122-1145` |
| SET-N1 | кнопки-переменные plain-label `NotificationTemplatesPageClient.tsx:131-146` |
| SET-N2 | два контейнера клиенту/специалисту по 3 карточки `NotificationTemplatesPageClient.tsx:31-169` |

## Реальные TODO (6)
| ID | Тип | Статус | Указатель + решение |
|---|---|---|---|
| **PRG-3** | UI-рефактор | **В РАБОТЕ (Codex wt-prg3)** | Переверстать `InstanceAddLibraryItemDialog.tsx` (плоский `<ul>` → канонический split-pane `shared/ui/doctor/catalog/*` + полный фильтр `DoctorCatalogFiltersToolbar`). Логика (мультивыбор/re-click/no-reload) уже верна — только вид. Бэкенд не трогать. |
| **SCH-C4** | layout | НЕ ВОСПРОИЗВЁЛ | «нет отступа снизу». Код уже: `ScheduleCalendarTab.tsx:1770 pb-4, :1536 pb-8, :1749 pb-4`. Живой шот с ПУСТЫМ расписанием бага не показал (нужен вьюпорт+данные). → **проверка владельцем**: подтвердить вьюпорт/данные; если воспроизводится — фикс фикс-`calc()` высот. Вслепую не менять. |
| **SCH-C5** | layout | НЕ ВОСПРОИЗВЁЛ | режим «список» контейнер обрезан. Код: `ScheduleCalendarTab.tsx:1749 lg:h-[calc(100dvh-15rem)], :722 overflow-y-auto`. Фикс-`calc` — вероятная причина; заменить на flex-fill. → **проверка владельцем** (нет данных для repro). |
| **SCH-C6** | layout | НЕ ВОСПРОИЗВЁЛ | правый инфо-блок обрезан. Код: `ScheduleCalendarTab.tsx:2044 lg:max-h-[calc(100dvh-8rem)] overflow-y-auto`. → **проверка владельцем**. |
| **SCH-G5** | логика | TODO (careful) | клиентские слоты по default-weekday, не по графику: `booking-scheduling/service.ts:433-462` + `computeSlots.ts:161-175` (для дня без per-date `be_working_days` — fallback на weekday `be_working_hours`). **Model-decision**: строго графо-ведомо (нет графика→нет слотов) vs fallback. Меняет семантику доступности записи → **вопрос владельцу** перед фиксом. |
| **PRG-4** | новая фича | HOLD owner | индивидуальные упражнения в инстансе (миграция scope/isPersonal + presign-роут доктора `indive_program_exercises` HLS 480/720 + вкладки «создать/в общую базу» + edit-mode). Дизайн: `docs/_TODO/PROGRAM_INDIVIDUAL_ITEM_DESIGN.md` (чек-лист не тронут). Многодневная, нужен sign-off §5. |

### Вопросы владельцу (не сборка)
- **SCH-G5**: клиентские слоты для дней без ручного графика — показывать пусто (строго по графику) или fallback на недельные часы? (сейчас fallback → выглядит как баг).
- **SCH-C4/C5/C6**: пере-репортил 07-18, но код уже обрабатывает; на каком вьюпорте/с какими данными воспроизводится? (нужен твой экран — я не воспроизвёл на пустом расписании).
- **PRG-4**: подтвердить §5 дизайна перед многодневной сборкой.
- **PRG-2**: код полный — подтверди живым кликом, реально ли «не работает».
