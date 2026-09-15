# Тема уведомлений «Заявки» — отчёт исполнителя, 15.09.2026

## Сделано

- В реестр doctor-notifications добавлена тема `doctor_leads` с подписью «Заявки».
- Для темы выбраны `web_push`, `telegram`, `max` и тот же fallback. Это набор двух соседних тем о
  событиях пациента (`doctor_patient_messages`, `doctor_patient_program_notes`): заявка, как и они,
  требует оперативного уведомления в кабинете и привязанных мессенджерах; email эти соседние темы не
  используют.
- Строка темы отбирается в `buildDoctorNotificationTopicModels` только когда `hasLeads` истинно.
  Его единственный источник в личном разделе — `resolveDoctorWorkspaceModules(...).leads`; этот общий
  резолвер уже пересекает право управления кабинетом, оплаченную механику `leads` и сохранённое включение
  модуля кабинета. Третьего реестра тем или новой формулы нет.
- Точечный unit-тест проверяет выход модели: при неэффективном `leads` темы нет, при эффективном — есть.
  Это не UI-тест и не проверка подписи, списка или DOM.

## Для сведения ведущим

В `apps/webapp/src/modules/leads/notifyClinicLeadCreated.ts`, в создаваемом другой веткой входе
`notifyDoctorPatientMessageToStaff`, заменить прежний `topicCode: 'doctor_patient_messages'` на
`topicCode: 'doctor_leads'`. Этот файл здесь не существует и по границе работ не менялся.

Новый код нельзя передавать через `notifyDoctorPatientMessageToStaff`: этот путь начинает с
`patientStaffNotificationProfiles.listForCurrentPatientOrganization`, а у заявки нет пациента и
аудитория приходит в `staffUserIds`. SQL-корень `app.read_current_patient_staff_notification_profiles`
не изменялся.

## Проверки

- ` /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/doctor-notifications/doctorProfileTopicChannelsModel.unit.test.ts"` — PASS: 1 файл, 1 тест.
- `pnpm --dir apps/webapp exec eslint src/app/app/account/staffNotificationsSection.tsx src/app/app/account/page.tsx src/app/app/admin/notifications/page.tsx src/modules/doctor-notifications/doctorNotificationTopics.ts src/modules/doctor-notifications/doctorTopicChannelRules.ts src/modules/doctor-notifications/doctorTopicChannelDefaults.ts src/modules/doctor-notifications/doctorProfileTopicChannelsModel.ts src/modules/doctor-notifications/doctorProfileTopicChannelsModel.unit.test.ts` — PASS.
- `pnpm --dir apps/webapp exec tsc --noEmit` — FAIL на базовых, не затронутых этой работой ошибках: отсутствующий generated route `api/doctor/appointment-reminder-presets/route.js` и несовместимые типы `MergeDependentConflictError` / `MergePlatformUsersOptions` в `pgPatientMergeCandidate.ts` и `pgPlatformUserMerge.ts`.

## НЕ СДЕЛАНО

- Не менялись занятые другой веткой `notifyClinicLeadCreated.ts`, `service.ts` и `pgStaffUsers.ts`; подстановку кода темы выполняет ведущий при сведении.
- Не запускались полный CI, миграции, SQL/preflight, privilege reconciliation, DEV-база и второй Next-сервер.
- Живая UI-приёмка возможна только после landing на общем `:5200`; автоматические UI-тесты не создавались.

## Строка вердикта для накопителя `feat` (в `feat` не пишу)

`КАНДИДАТ К НЕЗАВИСИМОМУ АУДИТУ — тема doctor_leads зарегистрирована с Push/Telegram/MAX и показывается только через effective workspace module leads; точечный model-test и ESLint зелёные, полный webapp tsc заблокирован несвязанными базовыми ошибками.`
