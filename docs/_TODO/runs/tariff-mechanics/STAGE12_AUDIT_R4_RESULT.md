# VERDICT: FAIL

Два обязательных дефекта не позволяют закрыть этапы 1–2 и сливать delta: небезопасное удаление CMS usage-функции и невыполненный пункт 2.8.

## Closing matrix

| Пункт | Статус | Evidence |
|---|---|---|
| 1.1 | done | Пять классов и обязательный `class` у всего реестра: [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:11), [registry](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:55). |
| 1.2 | done | Discriminated union запрещает quota/period у недопустимых классов; `объём` допускает только bytes: [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:17), [TariffQuotaMap](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:90). Typecheck зелёный; worker-арбитр ранее получил TS2353 на числе у `возможность`. |
| 1.3 | done | Resolver ветвится по классу: [service.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:143). Проекции допускают только `места/объём`: [service.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:181). |
| 1.4 | done | `pnpm --filter webapp typecheck` — exit 0. Compile-time арбитр зафиксирован в worker report. |
| 2.1 | done | Ровно 11 capability-механик без числовых полей: [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:55), фильтр конструктора: [CommercialConstructorClient.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:74). |
| 2.2 | done-but-runtime-unproven | `0275` снимает course trigger/function: [0275](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0275_tariff_mechanics_stage12_local.sql:4). POST сохраняет mutation gate; отказ проверен handler-тестом. Создание при включённой механике после реального применения миграции не доказано. |
| 2.3 | not done | Trigger снимается, но миграция также удаляет всё ещё вызываемую `app.cms_pages_snapshot_usage`: MUST FIX 1. |
| 2.4 | done-but-runtime-unproven | Read adapters разрешают чтение без entitlement resolution: [requireEntitlement.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-layer/guards/requireEntitlement.ts:18). В public profile/booking/widget прямого CMS gate нет. Обязательная DEV-проверка трёх поверхностей не выполнена. |
| 2.5 | done | `patient_card`/`patient_app` имеют класс `никогда`, скрыты из конструктора и принудительно разрешены независимо от stored `false`: [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:62), [service.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:153), [test](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.test.ts:94). |
| 2.6 | done | `files` — `объём`, только bytes; назначенный тариф без числа fail-closed, compatibility остаётся unlimited, выдуманного ceiling нет: [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:61), [service.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:120). Rollout до 4.10 по канону запрещён и здесь дефектом не считается. |
| 2.7 | done | PUT шаблонов закрыт `branding`, GET и preview читаются: [notification-templates/route.ts](/home/dev/dev-projects/bcb-wt-[redacted-token]-templates/route.ts:62). Handler-тест отказа зелёный. |
| 2.8 | not done | Массовые рассылки по-прежнему используют платформенные Telegram/MAX/SMSC и глобальный `smtp_outbound`: MUST FIX 2. |
| 2.9 | done | Глобальная DB-backed настройка default-off: [registry.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/system-settings/registry.ts:80). Оба write-path возвращают 403; один тест проверяет оба. Отдельной тарифной механики нет. |
| 2.10 | done-but-runtime-unproven | Статически ровно 11 capability-checkboxes, targeted tests зелёные. Не открывался DEV-конструктор и не проверено сохранение доступа A/B после миграции/назначения. |

## MUST FIX

1. `0275` удаляет функцию, которую продолжает вызывать runtime.

   Достижимый сценарий: после применения миграции вызов `getEnforcedQuotaUsage()` исполняет `app.cms_pages_snapshot_usage`, уже удалённую в [0275:10](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0275_tariff_mechanics_stage12_local.sql:10). Вызов остался в [pgOrgEntitlements.ts:228](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:228). `/api/admin/organizations` проглатывает ошибку и возвращает пустой usage для организации: [route.ts:32](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:32).

   Impact: после миграции пропадает в том числе действующий счётчик занятых мест специалистов; каждый запрос создаёт SQL-ошибку. Нарушены 2.3 и требование отсутствия runtime-регрессий.

2. Пункт 2.8 не реализован: клиника может отправлять массовые рассылки через платформенные каналы.

   Достижимый сценарий: врач с включённой `mailings` выбирает Telegram/MAX/SMS/email и запускает рассылку. Delivery jobs направляются в общие `telegram`, `max`, `smsc`: [deliveryJobs.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/doctor-broadcasts/deliveryJobs.ts:186). Email читает глобальный `smtp_outbound`: [buildAppDeps.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-layer/di/buildAppDeps.ts:1624). Модели clinic-owned SMTP/bot/SMS credentials нет.

   Impact: платформа остаётся отправителем клиентского спама и несёт расходы/риски блокировок. Нарушены 2.8 и канон §1/§4. Требуется согласованное продолжение #1071; текущий delta этого не закрывает.

## Последний фикс

Он корректен:

- Для `file_storage_limit_not_configured` и `file_storage_limit_reached` показываются сообщения, называющие загрузку и способ снять отказ: [PatientTabFiles.tsx:209](</home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/tabs/PatientTabFiles.tsx:209>).
- HTTP, network и S3-отказы переводят панель в видимое error-state. Другого молчаливого refusal-path в компоненте не найдено.
- Input и drag-and-drop закрывают панель только после успеха: [PatientTabFiles.tsx:298](</home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/tabs/PatientTabFiles.tsx:298>).
- Тест заметит возврат прежнего безусловного закрытия на file-picker path: панель размонтируется, и ожидание сообщения на [tariffMechanics.route.test.ts:225](/home/dev/dev-projects/bcb-wt-[redacted-token].route.test.ts:225) упадёт.
- Обратную регрессию «успешная загрузка перестала закрывать панель» этот тест не ловит; текущее закрытие подтверждено кодом.

## Что верно

- Seat chokepoint сохраняет `transaction → org advisory lock → recount → refusal → insert`: [pgOrganizationInvites.ts:109](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:109).
- Stored `false` не выключает класс `никогда`.
- Numeric-классы не управляются скрытым boolean и fail-closed без выдуманного предела.
- Compatibility path без тарифа остаётся прежним.
- Reads не гейтятся; course/CMS/templates/files mutations гейтятся.
- File write-port использует одну транзакцию с lock → SUM → check → inserts: [pgPatientFiles.ts:94](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:94).
- Stage-only diff против актуального canonical feat определён через merge-base `be0adb412`: 22 файла, `877 insertions / 285 deletions`; все входят в расширенный §1 scope.
- Из миграций добавлена только `0275` и одна запись journal. `0270–0274` не менялись и не перенумеровывались; в текущем canonical feat номер `0275` пока свободен.

## Качество тестов

Два сильнейших:

1. `keeps the upload refusal visible for ...` — рендерит настоящий компонент и ловит исходную безусловную потерю панели. Пропустит регрессию только в drag-and-drop path или прекращение закрытия при успехе.
2. `allows the patient-card mutation guard when stored tariff and override values are false` — проходит через настоящий resolver/guard и ловит возврат commercial boolean для `никогда`. Пропустит поломку только `patient_app`, если `patient_card` останется исправным.

Два слабейших:

1. `accepts an upload through the configured ceiling and refuses the next byte` — единственный `it` в файле и in-memory port. Удаление PG advisory lock/recount или непередачу лимита production route этот тест не заметит.
2. `refuses course creation when courses are not included in the tariff` — handler настоящий, но решение guard подставлено. Замена mechanic key с `courses` на другой выключенный ключ либо fail-open в resolver пройдут незамеченными.

Census:

- Source-text assertions в трёх stage Vitest-файлах: `0`.
- Single-`it` files: `1` — `src/modules/patient-files/service.test.ts`.
- Чисто stub-call tests: `0`; один `not.toHaveBeenCalled()` дополняет HTTP oracle, а не заменяет его.
- Course/template tests используют stubbed guard verdict, но проверяют наблюдаемый HTTP-отказ.
- Seat race script действительно извлекает SQL из source text и сейчас неработоспособен; это pre-existing script, не новый stage-test.

## Что остаётся за лидом на живом DEV

После устранения MUST FIX:

- Применить финально перенумерованную миграцию и проверить отсутствие dangling DB-функций/counter errors.
- 2.2: включённые курсы создаются независимо от старого числа; выключенный course POST получает отказ.
- 2.4: при выключенной CMS работают профиль клиники, booking page и внешний widget; CMS mutations запрещены.
- 2.10: конструктор открывается, показывает 11 галочек, не показывает `никогда`, демо A/B сохраняют доступ.
- Визуально подтвердить оба сообщения загрузки и закрытие панели после успешной загрузки.
- Не выдавать файловый предел клиникам до реализации 4.10.

## Выполненные команды

- `pnpm --filter webapp typecheck` — PASS, exit 0, без diagnostics.
- `pnpm --filter webapp lint` — PASS, exit 0; ESLint, frozen legacy migrations и journal sync зелёные.
- Targeted Vitest — PASS: `3/3` files, `14/14` tests, duration `1.40s`.
- Seat race — FAIL: PostgreSQL `42601`, syntax error около `$`, буквальный `${CLINIC_SEAT_USAGE_SQL}`. Script одинаков в `a678edc7e` и `9ee6971c9`, SHA-256 в обоих: `09331d22…c13e523`; это pre-existing defect.
- Full CI не запускался.

## Чистота дерева

Я не изменил ни одного project-файла и не оставил untracked-файлов. App-код текущего HEAD идентичен `9ee6971c9`.

Однако `git status` формально не clean: уже до аудита десять tracked env-example файлов были подменены средой на character devices `/dev/null`. Список после аудита полностью совпадает с исходным. Я их не восстанавливал, поскольку mission запрещает менять файлы.