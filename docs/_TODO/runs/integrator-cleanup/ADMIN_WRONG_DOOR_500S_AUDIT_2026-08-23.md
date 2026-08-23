# PASS — аудит перед приземлением `08f0fc3c7` «separate admin notification boundaries»

**Вердикт: PASS.** Граница между платформенным и арендным проведена по существу, а не снята; арендная защита
`branding` жива и доказана инъекцией отказа; новых прав на пациентские отношения админ не получил (миграций,
`GRANT`/`REVOKE`/`CREATE POLICY`/`declaration.ts` в коммите нет); `500` убран на обоих путях обхода.

Ниже — 7 находок для триажа владельца. Ни одна не отменяет PASS: три из них — про доказательность и
документацию, четвёртая — латентный класс в соседнем маршруте, который я проверил и признал сегодня
недостижимым. Ничего не чинил (граница брифа).

Ветка `wt/admin-doors-20260823`, аудит проведён против коммита `08f0fc3c7` в чистом дереве; после каждой
инъекции файл восстановлен, `git status` пуст.

---

## Пункт 1 — граница проведена, гвард не ослаблен · **взгляд** (PASS)

Коммит трогает три файла, через которые проходит доступ всего приложения. Разобрал каждый:

**`requireRole.ts` (+31/−7).** Изменения ровно два: переименование
`requireStaffWebPushSelfApiSession` → `requireAccountWebPushSelfApiSession` и подстановка человекочитаемых
`message` в три отказа. **Условия авторизации не тронуты ни на символ** — тот же набор:
`hasLaunchCapability('account.self') || hasLaunchCapability('platform.operations')`,
`isRestrictedStaffSecuritySession(session)`, `isPlatformUserUuid(session.user.userId)`, тот же
`enterStaffSecuritySelfPrincipal` на `session.user.userId`. Коды остались `401`/`403` — ни один отказ не стал
`200`. Ссылок на старое имя в репозитории не осталось (`grep` по всему дереву — 0 попаданий).

**`requireEntitlement.ts` (+18).** Чисто аддитивно: одна новая экспортируемая функция
`mechanicWriteClearanceRefusalResponse` и один импорт. `checkEntitlement`, `requireEntitlementForMutation`,
`requireEntitlementForRead` не изменены — то есть поведение всех остальных потребителей гварда физически то же.

**`portContextRuntime.ts` — единственная сквозная правка.** В список исключений патиентского порт-контекста
(переименован `PATIENT_ROOTS_BEFORE_A_TENANT_CLAIM` → `IDENTITY_ONLY_PATIENT_ROOTS`) добавлена одна запись:
`app.get_web_push_vapid_public_key()`. Проверил, что именно она открывает
(`deploy/postgres/patient-web-push-vapid-public-key-accessor.sql:72-98`):

```sql
SELECT NULLIF(btrim(s.value_json #>> '{value,publicKey}'), '')
FROM public.system_settings AS s
WHERE s.key='web_push_vapid' AND s.scope='admin' AND s.organization_id IS NULL
```

Аргументов нет, клиники нет, отношения пациента нет, `privateKey` не упоминается; `REVOKE ALL … FROM PUBLIC`,
`GRANT EXECUTE … TO app_patient`. Расширение — «безорганизационный пациентский принципал может прочитать
публичный ключ, который и так отдаётся его браузеру». Никакой другой маршрут этим не задет: остальные
безорганизационные вызовы по-прежнему проходят только по `descriptor.purpose === 'relation'` (обычные
табличные запросы) — условие не тронуто.

**Несвязанные маршруты, которые я взял для сверки:** `/api/admin/settings` (PATCH/DELETE),
`/api/patient/web-push/{status,subscribe,unsubscribe}`, `requireAuthenticatedApiSession`,
`requireAuthenticatedIdentitySelfApiSession`, `requireStaffSecurityApiSession`, `requirePatientApiSession`.
Ни один не изменён коммитом и ни один не зависит от изменённой ветки условия.

**Сверх брифа — правка не ослабила, а ужесточила два места.** (а) `{ organizationId: null }` как аргумент
записи больше не существует: `ManagedNotifWriteTarget` — размеченное объединение, обход арендной двери через
«передам null» стал ошибкой типа. (б) В старом коде `options.organizationId?.trim() || null` означал, что
клинический вызов с пустым `organizationId` МОЛЧА уходил в `allowPlatformGlobalFallbackWrite: true`, то есть
переписывал платформенный дефолт для всех клиник; теперь такой вызов идёт в `{ organizationId: '' }` без
флага и упирается в `SystemSettingsOrgContextRequiredError`.

**Физическая подпорка (не заслуга коммита, но важна для оценки риска).** RLS на `public.system_settings`
(`rev10_system_settings_{insert,update,delete}_200`) разрешает `app_staff` писать только строки
`organization_id = app.current_org_id()`, а строки `organization_id IS NULL` — только `app_platform_settings`.
То есть даже если бы будущий клинический вызов передал `{ owner: 'platform' }`, база его не пропустит.

## Пункт 2 — арендная защита `branding` жива · **тест + инъекция отказа** (PASS)

`assertWriteClearance?.('branding')` стал условным: `if (target.owner === 'organization')`. Проверил прогоном,
а не чтением — нейтрализовал строку `notifTemplatesService.ts:292` и прогнал тест физической двери:

```
FAULT INJECTION → src/modules/notif-templates/notifTemplatesService.mechanicWriteClearance.test.ts
Tests  1 failed | 2 passed (3)   ← «refuses … without branding clearance» упал
восстановлено
```

Тест реальный: он держит именно арендную дверь и падает ровно тогда, когда её снимают. Клиника без механики
`branding` по-прежнему получает `MechanicWriteClearanceRequiredError` и `updateSettingIfUnchanged` не
вызывается.

## Пункт 3 — пациентские отношения админу не открыты · **взгляд** (PASS)

- В коммите нет ни одного файла из `deploy/postgres/**`, нет `declaration.ts`, нет миграций. `pnpm lint`
  прогнал `check-migration-privileges: OK (56 migration files)` — новых `GRANT`/`REVOKE`/`CREATE POLICY` нет.
- Новая дверь `/api/account/web-push/status` читает три вещи, все — про самого вошедшего человека:
  `getWebPushVapidPublicKeyOnly()` (публичный ключ, без аргументов), `hasAnyForUserId(uid)` и
  `getPreferences(uid)` — обе плоские таблицы `user_web_push_subscriptions` / `user_channel_preferences` по
  собственному `userId` под `identity-self` принципалом. Ни одного чтения `org_enrollments`, карточек,
  назначений, медицинских сущностей.
- Роль в БД не менялась: та же дверь и тот же принципал, которыми уже пользовались существующие
  `subscribe`/`unsubscribe`. Соответствует `Р-АДМИН` §2.3: п. (2) «поддержка входа — учётная запись человека»
  и п. (4) «открытое — … шаблоны писем»; медицинского в обоих путях нет.

## Пункт 4 — `500` убран на обоих путях · **тест + инъекция** (PASS)

**Путь А, «Сохранить оформление» → `/api/admin/notification-templates`.** Причина `500` устранена в корне:
платформенный target больше не стучится в арендную дверь. Адаптер `403` стоит поверх как страховка —
проверил инъекцией: удалил вызов `mechanicWriteClearanceRefusalResponse` из `catch`, прогнал route-тест —
`Tests 1 failed | 2 passed (3)`, восстановлено. Тело отказа объяснённое:
`{ ok:false, error:'mechanic_write_clearance_required', mechanic:'branding', message: … }`, статус `403`.

**Путь Б, «Включить»/«Восстановить» на `/app/admin/notifications`.** Проследил цепочку до самих кнопок:
`admin/notifications/page.tsx` → `loadStaffNotificationsSection` → `DoctorNotificationChannelsSection` →
`DoctorWebPushControls` → `staffWebPushApi` → теперь `/api/account/web-push/*`. Правка достаёт именно те две
кнопки из обхода. Причина `Patient port context requires an organization-scoped patient principal` снята
точечно: падал только именованный корень VAPID, а два оставшихся чтения идут обычным табличным путём
(`purpose === 'relation'`), который безорганизационный принципал допускал и раньше. Инъекция подтверждает,
что тест держит разрешение: убрал запись из списка — `portContextRuntime.test.ts` → `1 failed | 18 passed`.
Отказы гварда теперь `401`/`403` с текстом, клиент отличает `access_denied` от «VAPID не настроен».

## Независимая проверка зелёных гейтов автора

| Гейт | Мой прогон | Результат |
|---|---|---|
| 7 файлов / 75 тестов (список автора) | `vitest run …` | **7 passed / 75 passed** — заявленное воспроизводится |
| typecheck | `tsc --noEmit` | **exit 0** |
| lint + структурные гейты | `npm run lint` | **exit 0**, 0 ошибок, 2 существующих warning в `AppointmentPaymentSection.tsx` (не из этого коммита); все структурные гейты OK |

---

## Находки для триажа (не чинил — граница брифа)

**Н1. `api.md` разошёлся с реальностью — внесено этим коммитом.** `README.md:117` объявляет
`apps/webapp/src/app/api/api.md` реестром маршрутов. Там до сих пор описаны три маршрута, которых больше нет
(`doctor/web-push/status|subscribe|unsubscribe`, строки 94-96), и нет ни одного из трёх новых
`account/web-push/*`. Это единственное оставшееся в дереве упоминание `doctor/web-push`.

**Н2. У самой стены порт-контекста нет отрицательного теста.** Коммит расширил список исключений и добавил
тест на РАЗРЕШЕНИЕ, но ничто не держит сам запрет. Инъекция: удалил из `portContextRuntime.ts` всё условие
`(!principal.organizationId && purpose !== 'relation' && !IDENTITY_ONLY_PATIENT_ROOTS.has(…))` — то есть снял
арендную стену для пациентских принципалов целиком — и прогнал `vitest run src/infra/db/`:
**5 файлов / 30 тестов, все зелёные.** Строка
`'Patient port context requires an organization-scoped patient principal'` не встречается ни в одном тесте
репозитория (`grep` по `apps/webapp/src` — единственное попадание сам `portContextRuntime.ts:372`).
Следствие: следующее расширение этого списка пройдёт CI молча.

**Н3. Латентный тот же класс в соседней двери — сегодня недостижим, проверял.**
`assertMechanicWriteClearance` вшит в `buildAppDeps` глобально, а выдача clearance в
`/api/admin/settings` PATCH стоит под `gate.ctx.kind === 'clinic'` (строки 558-632). Для платформенного
контекста (`organizationId: null`, clearance не выдаётся) запись любого ключа из
`TARIFF_MECHANIC_SETTING_KEYS` / `PATIENT_HOME_SETTING_MECHANICS` бросит тот же
`MechanicWriteClearanceRequiredError`, а `catch` там ловит только `systemSettingsOrgContextErrorResponse` и
`operator_health_probe_config` → был бы такой же необработанный `500`. Проверил достижимость: все эти ключи
пишутся из клинических экранов (`app/app/settings/*` — `GoogleCalendarSection`,
`ClinicDeliveryChannelsSection`), которые идут веткой `kind === 'clinic'` и clearance получают; в кабинете
глобального админа писателя этих ключей я не нашёл. То есть сегодня это не баг, а мина: любой будущий
платформенный экран, пишущий тарифно-гейтированный ключ, повторит ровно исходную поломку. Развёртка автора
(«route-level обработчика не было») искала по вызовам двух `saveManaged*` и по имени класса ошибки, а не по
вопросу «какие платформенные маршруты зовут запись, защищённую арендной механикой».

**Н4. Кнопка «Отключить» на том же экране отказ не показывает.**
`unsubscribeAllStaffWebPush()` возвращает голый `res.ok`, а `DoctorWebPushControls.onDisable` (строки 75-87)
на `false` не делает НИЧЕГО — ни toast, ни смены состояния. Человек жмёт и видит тишину. Не регрессия (так
было и до коммита) и не одна из двух кнопок обхода, но пункт «отказ показывается человеку как объяснённый
отказ» на этом экране закрыт на 2 кнопки из 3.

**Н5. Настоящий `500` покажется как «Push не настроен».** В `fetchStaffWebPushStatus` тело ошибки читается
через `res.json().catch(() => null)`. У объяснённого отказа есть `error` → клиент даёт `access_denied`. У
реального `500` (HTML-страница Next) `body === null` → ветка падает в `vapid_unavailable`, и человек читает
«Push-уведомления не настроены» вместо «что-то сломалось». Диагностика сбоя маскируется под конфигурацию.

**Н6. Комментарий над переименованным списком описывает старое содержимое.**
`portContextRuntime.ts:253-272`: «**Both** are about the relationship itself…», «Requiring an organisation on
the principal here would be circular» — записей теперь три, и третья не пре-арендный корень отношения, а
идентичность-себя. Имя списка исправлено, шапка — нет.

**Н7. У клинического `/api/doctor/notification-templates` нет route-теста вообще.** Коммит добавил туда
адаптер `403`, но файла `route.route.test.ts` в этой папке не существует (проверял `find`). Новое поведение
клинической двери не закреплено ничем на уровне маршрута — только сервисным тестом уровнем ниже.

---

## Что НЕ сделано в этом аудите

- **Живой проверки на TEST нет.** По границе брифа `--execute`, TEST, PROD и push запрещены; обе кнопки в
  живом кабинете проверяет ведущий после выкатки. Всё выше — разбор кода, прогоны и инъекции отказа в
  локальном worktree.
- Полный `vitest` по всему проекту не гонялся — только 7 заявленных файлов, `src/infra/db/` и точечные
  прогоны под инъекции (правило «гонять затронутое, не весь suite»).
- Находки Н1-Н7 не исправлялись и в чужую ветку не коммитились.
