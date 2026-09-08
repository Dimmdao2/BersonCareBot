# Worker brief — #1100 appointment delivery format (`очно` / `онлайн`)

Ты реализуешь один цельный этап Wave 2 G в отдельной ветке. Сначала выполни карту заголовков `AGENTS.md`, затем
прочитай целиком его §1 migration/privilege subsections, §4a, §5, §10/§10a/§10b, §12, §16, §17, §21, §22 и §24,
а также `README.md`, релевантные architecture docs и полную authority ниже. Для поиска путей сначала используй
`node /home/dev/brain/tools/code-search.mjs "<query>" --repo bcb`, затем точечный `rg`.

## Authority

Единственная product authority: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, owner-correction 08.09.2026,
UI-04, UI-05, UI-06, UI-07, GATE-01 и «Поток G — формат записи и основной CTA». Высокий Opus-аудит и конкретные
ошибки прежней формулировки: `docs/audit/video-appointment-format-plan-2026-09-08.md` MF-1..MF-5.

Источник оракула: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` — «Редактирование идёт через единственную
существующую дверь `manual-reschedule`, расширенную формат-параметром, без второго endpoint.»

Owner-checklist, который обязан работать целиком:

- **UI-04:** онлайн-запись на «Сегодня» показывает единственное главное «Начать созвон» только когда effective
  `video_meetings` включён и есть связанный patient account; иначе fallback «Начать приём». Очная запись всегда
  «Начать приём», отдельной камеры на Today нет. Формат от fallback не меняется.
- **UI-05:** текущая create/start modal сохраняет две нижние кнопки «Очный приём» / «Онлайн-приём»; нажатие также
  сохраняет соответствующий explicit format, чтобы действие и будущая запись не расходились.
- **UI-06:** у canonical `be_appointments` хранится `in_person | online`; его можно менять в существующей форме
  details/create. Built-in Online branch и online patient-booking path дают default `online`, физический филиал —
  `in_person`; специалист может override. Branch/format никогда не grant/revoke video.
- **UI-07:** вне перечисленных appointment form/CTA/buttons ничего в интерфейсе не менять.
- **GATE-01:** видимость и server permission video остаются только `tariff ∩ doctor_workspace_composition`;
  appointment format и Online branch не становятся доступом.

## Обязательная реализация

1. Расширь существующую Drizzle-схему `be_appointments` колонкой canonical delivery format. Используй словарь
   `in_person | online`; TypeScript strict, без `any`. Добавь timestamp-forward migration с правильными
   statement-owner/breakpoint/verify markers. Backfill: `online` для built-in Online branch ИЛИ связанной
   `patient_bookings.booking_type='online'`, иначе `in_person`; data statement имеет `BCB-MIGRATION-BACKFILL`,
   затем NOT NULL/default. Grants/REVOKE/policy в migration запрещены. Индекс не нужен.
2. Сначала синхронно расширь `deploy/postgres/privileges/declaration.ts`: app_staff INSERT/UPDATE новой колонки,
   все five whole-row SECURITY DEFINER relation surfaces из MF-3 и patient self-booking insert seam. Если тела
   функций перечисляют колонки/создают row, миграция обновляет их по канону и marker `BCB-MIGRATION-REHOME-FUNCTION`
   там, где он действительно требуется. Сгенерируй canonical privilege artifacts и оставь `--check` green.
3. Не создавай второй update endpoint/service/repository method. Параметризуй существующий manual-reschedule
   chokepoint. Format-only edit не меняет status/rescheduleCount, не вставляет `be_appointment_reschedules`/history
   переноса, не вызывает `booking.rescheduled`, cancel/rematerialize reminders или payment carry-over. Эти effects
   происходят только при фактическом изменении start time. Format-only edit не уведомляет пациента.
4. Проведи format через все staff/patient create и required read paths. Online patient flow даёт `online` даже при
   `branch_id=NULL`. В existing `ensureStaffBookingProjection` `patient_bookings.booking_type` выводится из
   canonical appointment format; hardcoded `in_person` больше не второй источник истины.
5. Для create/details используй существующий `DoctorAppointmentForm` / `DoctorCalendarEventPanel` /
   `TodayAppointmentFullModal`; не создавай параллельную форму или footer. Built-in branch default приходит явным
   server-derived `isOnline` flag через существующий filter-meta path и `isBuiltInOnlineLocation`, не вычисляется
   из label на клиенте. Existing Select обязан соблюдать AGENTS §22 `displayLabel`.
6. Параметризуй существующий `DoctorTodayNextAppointment` и его loader/read DTO. Не добавляй camera action для
   in-person. Существующую независимую камеру карточки пациента не трогай.
7. Учитывай existing active code, а не устаревшие строки plan status. Расширяй существующий общий chokepoint; если
   он действительно не может нести формат без второй двери, остановись и отдай точный blocker, не создавай обход.

## Запреты

- **Не писать, не удалять, не ослаблять и не переписывать тесты.** Воркер может запускать уже существующие
  targeted checks, но недостающее поведенческое покрытие пишет только независимый аудитор.
- Не запускать DEV/TEST/PROD, миграцию на БД, disposable DB, deploy, push, full CI или browser/live acceptance.
  Candidate rollback-only preflight выполняет лид после твоего коммита.
- Не трогать Jitsi/coturn, video provider/core permissions, daily notes, unrelated patient/doctor pages, тарифы,
  workspace composition, notification pipeline и PROD.
- Не делать широких refactor, второй enum/source of truth, второй branch detector, второй appointment update path.
- Не закрывать owner-checkbox без фактического evidence; финальное закрытие делает лид.

## Проверки и сдача одним ходом

- Проверь schema/migration/declaration generated checks, TypeScript и scoped lint существующими командами repo;
  не выдумывай новый test runner. Запиши точные команды и результаты.
- Дай письменный privilege analysis по четырём пунктам AGENTS §1: изменённые objects/functions; owner/runtime role;
  required privileges; что добавлено в declaration. Подтверди, что migration не содержит grants/policies.
- `git diff --check`; проинспектируй весь diff от base; stage только явные task paths, не `git add -A`.
- Сделай осмысленный commit `feat(#1100): ...`; дерево оставь чистым. Не заканчивай ход в ожидании процесса.

