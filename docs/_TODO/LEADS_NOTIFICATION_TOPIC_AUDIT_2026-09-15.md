PASS — кандидат `e50752298` выполняет §9.11: тема `doctor_leads` видна только при effective `leads`, оба экрана идут через одну модель и общий resolver; блокирующих находок нет.

# Независимый аудит темы уведомлений «Заявки», 15.09.2026

Кандидат: `e5075229808ad1bfa2a0b2b746b1668143da2d20` на ветке `wt/leads-notify-topic`, база кандидата — `612936826`.
Оракул: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md` §9.11, в том числе дословные решения владельца «Уведомление о заявке едет под темой \"заявки\"» и «тема тоже подключается только при тарифе и включенной в кабинете механике».

## Таблица инъекций

| Поломка | Прогон | Что покраснело | Результат |
|---|---|---|---|
| Удалено условие `.filter((topicId) => topicId !== 'doctor_leads' || availability.hasLeads)`; реестр снова целиком пошёл в модель | `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit src/modules/doctor-notifications/doctorProfileTopicChannelsModel.unit.test.ts"` | `expect(unavailableTopics.some(...doctor_leads)).toBe(false)`: `expected true to be false`; `Test Files 1 failed (1)`, `Tests 1 failed (1)` | Условие имеет зубы: снятие двери ловится конечным выходом модели |
| Поломка возвращена, кандидат снова чистый | та же команда | `Test Files 1 passed (1)`, `Tests 1 passed (1)` | Обе стороны оракула зелёные: при `hasLeads=false` темы нет, при `hasLeads=true` она есть |

Новый тест допустим по §10a/§10b: способ проверки прямо задан brief как модельный поведенческий тест; независимый oracle — owner-решение §9.11; expected проверяет выход модели, а не DOM, текст, количество элементов или внутренний вызов. Автоматических UI-тестов нет.

## 1. Видимость темы и оба потребителя

`buildDoctorNotificationTopicModels` отбирает `doctor_leads` только по `availability.hasLeads`. Точечный прогон выше проверяет выключенное и включённое состояния, а fault injection доказывает, что тест краснеет именно при снятии условия.

Оба требуемых экрана получают один и тот же результат, отдельной сборки модели у них нет:

- профиль/настройки врача: `apps/webapp/src/app/app/settings/page.tsx` и fallback-страница `apps/webapp/src/app/app/account/page.tsx` вызывают `loadStaffNotificationsSection`;
- административный экран: `apps/webapp/src/app/app/admin/notifications/page.tsx` вызывает тот же `loadStaffNotificationsSection`;
- только `apps/webapp/src/app/app/account/staffNotificationsSection.tsx` вызывает `buildDoctorNotificationTopicModels`.

Проверка страниц сделана по wiring и модели, не по разметке: UI-тест был бы запрещён §10a.

## 2. Дверь одна

Признак не вычисляется локальной копией тарифного правила. `loadStaffNotificationsSection` передаёт в модель только
`hasLeads: workspaceModules?.leads === true`, а `workspaceModules` получает вызовом общего
`resolveDoctorWorkspaceModules(deps, workspaceAccess, preloadedComposition)`.

В самом общем resolver effective `leads` — пересечение `workspace.canManageOrganization`, результата общего
`resolveMechanicAccess(..., 'leads')` и сохранённого состава кабинета через `resolveWorkspaceModuleEffective`.
Отдельного списка видимых тем либо второй формулы «тариф + настройка» кандидат не добавляет. Реестр тем остаётся
`DOCTOR_NOTIFICATION_TOPIC_CODES`; перечисления в `doctorTopicChannelRules.ts` и
`doctorTopicChannelDefaults.ts` задают разрешённые/default-каналы, а не вторую дверь видимости.

## 3. Default-bootstrap предпочтений

`enableStaffWebPushNotificationDefaults` действительно перебирает весь `DOCTOR_NOTIFICATION_TOPIC_CODES` и не
получает ни organization, ни `hasLeads`. Поэтому после landing при первой staff web-push подписке он заведёт
user-global строку `doctor_leads / web_push / true` и для человека из клиники без механики.

Это подтверждено живым исполнением кандидата через общий замок:

```text
$ /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec tsx ../../.audit-leads-defaults-probe.ts"
{"beforeBootstrap":{"visibleWhileMechanicOff":false,"webPushEnabledAfterMechanicOn":true},"afterBootstrap":{"bootstrapReturnedDoctorLeads":true,"storedDoctorLeadsRows":[{"topicCode":"doctor_leads","channelCode":"web_push","isEnabled":true}],"visibleWhileMechanicOff":false,"webPushEnabledAfterMechanicOn":true}}
```

Одноразовый probe вызывал настоящий `enableStaffWebPushNotificationDefaults` с наблюдаемым port-double и затем
настоящий model-builder; после прогона файл удалён. Он показывает два факта: скрытая строка не оживляет тему при
выключенной механике, а при последующем включении Push уже включён. Однако ровно тот же итог после включения был
и **до** bootstrap: default fallback темы уже содержит `web_push`. Значит предзапись не меняет пользовательское
поведение, не обходит visibility gate и не создаёт новое молчаливое последствие. По критерию §24.6 это безвредная
реализация существующего default, не audit finding.

Фактическое состояние именованной DEV измерено read-only командой:

```text
$ /home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -A -t -c \"BEGIN READ ONLY; SELECT count(*) FROM public.user_notification_topic_channels WHERE topic_code = 'doctor_leads'; ROLLBACK;\""
0
```

То есть до landing/исполнения candidate bootstrap строк на DEV нет. Отдельная транзакционная проба этой же
именованной базы показала `doctor_leads|web_push|t` и завершилась `ROLLBACK`; таблица принимает user-global тему,
organization-колонки в ней нет. Постоянных данных аудит не оставил.

Принятым evidence считается только приведённый locked-прогон. До него один такой же read-only `count(*)` был по
ошибке вызван напрямую без host-lock; он ничего не записал, после чего проверка была повторена штатно через
`run-tests.sh`. Все последующие тестовые и DB-пробы шли через общий замок.

## 4. Пациентский корень и миграции

В production-коде кандидата `doctor_leads` встречается только в реестре, model-filter и двух таблицах каналов.
Ни `notifyDoctorPatientMessageToStaff.ts`, ни `pgPatientStaffNotificationProfiles.ts`, ни SQL-функция
`app.read_current_patient_staff_notification_profiles(uuid,text)` не изменены. Вызова новой темы в этом кандидате
вообще нет, поэтому patient root её не получает.

Миграций в diff нет; число получено ровно командой:

```text
$ git diff --name-only e50752298^ e50752298 -- apps/webapp/db/drizzle-migrations | wc -l
0
```

SQL-root не переучивался принимать третью тему, и privilege declaration не менялась.

## Дополнительные проверки

```text
$ /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit src/modules/doctor-notifications/doctorProfileTopicChannelsModel.unit.test.ts"
Test Files  1 passed (1)
Tests       1 passed (1)

$ pnpm --dir apps/webapp exec eslint src/app/app/account/staffNotificationsSection.tsx src/app/app/account/page.tsx src/app/app/admin/notifications/page.tsx src/modules/doctor-notifications/doctorNotificationTopics.ts src/modules/doctor-notifications/doctorTopicChannelRules.ts src/modules/doctor-notifications/doctorTopicChannelDefaults.ts src/modules/doctor-notifications/doctorProfileTopicChannelsModel.ts src/modules/doctor-notifications/doctorProfileTopicChannelsModel.unit.test.ts
exit 0, вывод пуст

$ git diff --check
exit 0, вывод пуст
```

Полный CI не запускался по прямому запрету brief. Второй Next-сервер не поднимался. Прод не затрагивался.

## НЕ СДЕЛАНО

- Продуктовый код кандидата не исправлялся: блокирующих находок нет; временная fault injection полностью возвращена.
- Не менялись занятые соседней веткой `notifyClinicLeadCreated.ts`, `service.ts`, `pgStaffUsers.ts`.
- При сведении с `wt/leads-notify` ведущему предстоит в
  `apps/webapp/src/modules/leads/notifyClinicLeadCreated.ts` заменить строку
  `topicCode: 'doctor_patient_messages'` на `topicCode: 'doctor_leads'` (проверена текущая голова соседней ветки
  `a4458c578`). Отсутствие этой подстановки в данном кандидате не является дефектом.
- После сведения нужно сохранить уже заданную Л4 явную аудиторию `staffUserIds`: lead идёт под
  organization/tenant-service principal, и PG-adapter patient-profile возвращает `null` до вызова SQL-root.
  Учить `app.read_current_patient_staff_notification_profiles(uuid,text)` теме `doctor_leads` не требуется и
  запрещено §9.11.
- Строка вердикта в очередь `feat` не записывалась.
