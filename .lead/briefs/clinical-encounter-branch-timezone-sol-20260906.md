# Worker brief: таймзона филиала на doctor-странице приёма

Ты product worker в свежей ветке `wt/clinical-encounter-branch-timezone-20260906`, созданной от актуальной головы
`feat/doctor-ui-rebuild`. Это узкая correction существующего клинического пути, а не новая поверхность.

До действий прочитай карту `AGENTS.md`, затем полностью §5, §16, §17, §21, §24.1–§24.3 и
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §34. Проверь полный P4.5 в
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`; authority этого прохода — точные пункты ниже.

## Один общий проход

Обязательное правило §5: «Варианты одного действия — параметры одной точки, а не отдельные функции». Нельзя
заводить второй formatter, repository или API рядом с существующим. Сначала расширь существующие typed read-model
и уже используемый проход `canonicalAppointmentId`; переиспользуй `displayZonePartsFromUtcInstant`.

## Точные owner-пункты

- `ENCOUNTER-PAGE-04` — в верхнем информационном блоке показана дата приёма.
- `ENCOUNTER-PAGE-05` — время приёма показано по IANA-таймзоне именно филиала, не приложения/браузера; в doctor UI
  рядом нет `UTC` и предупреждения о timezone устройства.
- `ENCOUNTER-PAGE-06` — в верхнем информационном блоке показан филиал.
- `ENCOUNTER-PAGE-07` — в верхнем информационном блоке показан специалист.
- `ENCOUNTER-PAGE-08` — при наличии связи показана конкретная связанная календарная запись.
- `ENCOUNTER-PAGE-08A` — дата и время связанной записи форматируются по той же timezone её филиала, что и шапка;
  один приём не показывает два разных времени.
- `ENCOUNTER-PAGE-08B` — canonical appointment/read-model передаёт IANA timezone выбранного филиала; UI не
  угадывает её по названию и не подменяет `app_display_timezone`.
- `ENCOUNTER-PAGE-08C` — для записи без филиала есть один явный общий fallback без выдачи fallback за timezone
  физического филиала.

## Требуемое поведение

- Расширь `PatientAppointmentItem` typed-полем timezone филиала. В уже существующем JOIN
  `pgDoctorClients.listPatientAppointments` выбери `be_branches.timezone` и передай его в read-model.
- Расширь `Visit` достаточным typed timezone/instant представлением. В `pgPatientClinical.listVisits` получай
  timezone филиала через существующую связь `clinical_visit.canonical_appointment_id -> be_appointments.branch_id
  -> be_branches.timezone`; не создавай новый repository/API и не дублируй отдельный запрос, если данные можно
  добавить в уже существующий пакетный проход canonical appointment IDs.
- Связанный приём форматирует дату/время в branch timezone и использует один и тот же результат для шапки и строки
  записи. Doctor UI не использует timezone браузера и не показывает `UTC`, красный `!` или сравнение устройства.
- Для отсутствующего филиала/связи оставь один явно определённый fallback через существующую общую точку; не
  называй его timezone филиала и не показывай warning.
- Не меняй DB schema: `be_branches.timezone` уже существует. Не меняй patient UI, calendar UI, clinical-list UI,
  модальный стек, платежи, миграции или grants.

## Разрешённый product scope

- `apps/webapp/src/modules/doctor-clients/ports.ts`
- `apps/webapp/src/infra/repos/pgDoctorClients.ts`
- существующий in-memory mirror doctor-clients, только для type parity
- `apps/webapp/src/modules/patient-clinical/ports.ts`
- `apps/webapp/src/infra/repos/pgPatientClinical.ts`
- существующий in-memory mirror patient-clinical, только для type parity
- `apps/webapp/src/app/app/doctor/patients/[userId]/visits/EncounterPageClient.tsx`
- один существующий shared datetime helper, только если его параметризация устраняет реальный дубль; новый helper
  файл не создавай.

## Проверки и завершение одного хода

По §10b product worker тесты не пишет и существующие тесты не редактирует. Можно и нужно запустить подходящие уже
существующие targeted tests, webapp typecheck, scoped ESLint и `git diff --check`; независимый auditor-live после
этого сам составит blind kill-set и добавит только оправданные acceptance tests.

Не запускай full CI, общий dev-server, DB, TEST/PROD; не land и не push. Не заканчивай ход в ожидании фоновой
команды: все точечные проверки выполняй foreground. До завершения явно проиндексируй только разрешённые product
пути и закоммить их. В финале назови закрытые owner-ID, SHA и точные команды проверок.
