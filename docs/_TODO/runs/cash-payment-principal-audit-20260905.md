# Независимый аудит: `912e6196d` — cash payment writes under the principal its door installed

- Кандидат: `912e6196d` на `wt/cash-payment-fix-20260905` (2 файла: `apps/webapp/src/infra/repos/pgPatientPayments.ts`, новый `pgPatientPayments.principal.unit.test.ts`).
- Дефект владельца: «Оплачено наличными» на записи 7 000 ₽ отвечало «Не удалось выполнить действие».
- Критерий приёмки: после закоммиченного платежа не сообщать об ошибке; не открыть cross-tenant запись; не наплодить дублей в ledger.
- Вердикт: **PASS**. Kill-set: **8 убитых / 0 непойманных**.

Kill-set построен до чтения нового теста — по диффу, по фактическим принципалам вызывающих дверей и по живому
каталогу возможностей DEV.

## 1. Матрица: требование → доказательство в коде → доказательство в рантайме → вердикт

| # | требование гейта | код | рантайм | вердикт |
|---|---|---|---|---|
| 1 | staff-оплата наличными доходит до объявленного писателя и возвращает успех | `runPatientPaymentMutation` больше не переустанавливает принципала; пишет под тем, что поставила дверь (`pgPatientPayments.ts:63-68`) | живой DEV: `POST /api/doctor/booking-engine/appointments/62b52494…/payment {"action":"cash"}` → **200**, строка `fb12ae2b…` 700000 minor; в логе PostgreSQL `bcb_dev_webapp_staff@bcb_webapp_dev … insert into "patient_payment" …`, ни одного 42501 | PASS |
| 2 | несовпадение организации отвергается до записи | `if (requiredPrincipalOrganizationId() !== organizationId) throw 'patient_payment_organization_principal_mismatch'` до `withTransaction` | тест 2/3: `rejects.toThrow(...)` **и** `expect(withTransaction).not.toHaveBeenCalled()` | PASS |
| 3 | отсутствие принципала отвергается до записи | `requiredPrincipalOrganizationId()` → `organization_principal_required` | тест 3/3, `withTransaction` не вызван | PASS |
| 4 | повтор и гонка идемпотентны, ложного отказа после коммита нет | `onConflictDoNothing()` + перечитывание по (org, appointment, package, idempotency_key) | живой DEV: повтор → **409 `already_paid`**, ровно 1 строка, `manualPaidMinor` 700000; два ОДНОВРЕМЕННЫХ POST на свежей записи `e16fb997…` → оба **200**, **один и тот же** `payment.id dc39e99e…`, ровно 1 строка ledger | PASS |
| 5 | не создан cross-tenant путь и не сломан легитимный не-staff вызывающий | у функции ровно два внешних входа: staff-двери и вебхук эквайринга | см. §3 и §4 | PASS |
| 6 | новый тест доказывает поведение, а не текст исходника, и краснеет на названной регрессии | использует настоящий `@bersoncare/db-principal`, снимает `kind`/`organizationId` принципала В МОМЕНТ входа в `withTransaction` | fault injection (возврат `runWithDbOrganizationPrincipal`) → **3/3 красных**, в т.ч. `expected 'organization' to be 'staff'` | PASS |

## 2. Корневая причина проверена против живой реальности, а не против текста коммита

Утверждение кандидата: класс `tenant_service` не имеет сквозной двери `purpose: 'relation'`, поэтому организационный
принципал ронял резолвер до единого SQL-оператора.

Проверено двумя независимыми способами на живом DEV:

1. **Каталог возможностей рантайма** (`WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON`, 237 записей): ключа `tenant_service`
   НЕТ. Возможностей с `purpose: 'relation'` девять — `staff → app_staff`, `patient → app_patient`,
   `clinicBilling → app_clinic_billing`, `platform*`, четыре сервисных; класса `tenant_service` среди них ноль
   (при 10 объявленных возможностях этого класса — все именованные корни). Значит
   `capabilityFor(capabilities, 'tenant_service', …)` в `portContextRuntime.ts:308` бросал
   `Missing declared webapp port capability: tenant_service` до открытия транзакции — ровно то, что видел владелец.
2. **Права в самом кластере** `bcb_webapp_dev`:

   | роль | `has_any_column_privilege(… ,'public.patient_payment','INSERT')` | `… 'SELECT'` |
   |---|---|---|
   | `app_staff` | **t** | **t** |
   | `app_tenant_service` | f | f |
   | `app_patient` | f | f |
   | `app_platform_settings` | f | f |
   | `app_clinic_billing` | f | f |

   `app_staff` — единственная роль с любым правом на ledger. То есть даже если бы возможность существовала,
   организационный принципал получил бы 42501. Направление правки (писать под принципалом двери) — единственно
   возможное, а не одно из двух.

Статический контракт `deploy/postgres/privileges/staff-drizzle-insert-grant-coverage.test.mjs` (каждая колонка,
которую называет Drizzle-INSERT, выдана `app_staff`) — зелёный: 1/1.

## 3. Все вызывающие двери: организация в аргументе совпадает с принципалом

`runPatientPaymentMutation` достижима из трёх staff-дверей и одного вебхука. Новая проверка равенства ломала бы
любую дверь, где аргумент `organizationId` берётся не из того же источника, что установленный принципал. Проверено
поимённо:

| дверь | принципал | аргумент | совпадает |
|---|---|---|---|
| `api/doctor/booking-engine/appointments/[id]/payment` → `staffAppointmentPayments.createPayment` | `withDoctorWorkspacePrincipal(gate.ctx, 'doctor.booking.appointment-payment.cash')` → staff, org = `gate.ctx.organizationId` | `organizationId: gate.ctx.organizationId` | да |
| `api/doctor/patients/[userId]/payments` | `withDoctorWorkspacePrincipal(gate.ctx, 'doctor.patients.payments.cash.create')` | `gate.ctx.organizationId` | да |
| `api/doctor/booking-engine/patient-packages` → `staffMembershipSale` (`runners.runCashWrite`) | `withDoctorWorkspacePrincipal(gate.ctx, '…patient-packages.cash')` | `common.organizationId = gate.ctx.organizationId` | да |
| `api/doctor/patients/[userId]/acquiring-charge` → `recordAcquiringCharge` → `insertAcquiringPending` | `withDoctorWorkspacePrincipal(gate.ctx, '…acquiring.record')` | `gate.ctx.organizationId` | да |
| `api/payments/patient-acquiring-webhook/[provider]` → `handleAcquiringWebhookEvent` → `updatePatientPaymentStatus` | `runWithDbOrganizationPrincipal(organizationId, …)` на самом маршруте (route.ts:70) | `payment.organizationId` (тот же арендатор) | да |

`withDoctorWorkspacePrincipal` дополнительно требует, чтобы окружающий принципал уже был `staff`
(`doctor_workspace_staff_principal_required`), — подмена организации из тела запроса недостижима.

Прежний код был строго ХУЖЕ по мультиарендности: он *переопределял* принципала аргументом, то есть переданный
`organizationId` молча становился арендатором. Новая проверка это закрывает.

## 4. Вебхук эквайринга: регрессии нет (и почему)

Кандидат вебхук не трогает. До правки репозиторий пере-входил в `runWithDbOrganizationPrincipal(organizationId, …)`
поверх организационного принципала, который маршрут уже установил на route.ts:70 — тот же вид, тот же арендатор,
тот же исход резолвера. После правки принципал ровно тот же, просто без повторного входа. Поведение вебхука
идентично до и после. Проверено чтением обоих путей и полным перечнем вызывающих
(`handleAcquiringWebhookEvent` и `recordAcquiringCharge` имеют по одному вызывающему каждый).

## 5. Ложный отказ после коммита: путь закрыт конструктивно

Опасный класс — `onConflictDoNothing()` без цели: если конфликт сработал по индексу, ключ которого шире, чем условие
перечитывания, перечитывание вернёт 0 строк и дверь ответит `cash_payment_idempotency_lookup_failed` уже ПОСЛЕ
чужого коммита. Проверены реальные индексы `bcb_webapp_dev`:

```
uq_patient_payment_appointment_idempotency  (organization_id, appointment_id, idempotency_key) WHERE idempotency_key IS NOT NULL
uq_patient_payment_package_idempotency      (organization_id, patient_package_id, idempotency_key) WHERE patient_package_id IS NOT NULL AND idempotency_key IS NOT NULL
```

Оба несут `idempotency_key` в ключе, а условие перечитывания — ровно (org, appointment, package, idempotency_key).
Значит после конфликта перечитывание всегда находит ровно ту строку, которая конфликт и вызвала: `existing.length`
не может быть 0. Живая гонка это подтвердила (§1, строка 4).

## 6. Kill-set (составлен до чтения нового теста)

| # | класс отказа кандидата | результат |
|---|---|---|
| 1 | корневая причина неверна — организационный принципал на самом деле достижим | УБИТ: ключа `tenant_service` нет в живом каталоге (237 записей); `app_tenant_service` не имеет ни одного права на `public.patient_payment` |
| 2 | staff-оплата всё ещё падает / не доходит до объявленного писателя | УБИТ: живой 200 + строка ledger под `bcb_dev_webapp_staff`, 0 ошибок в логе PostgreSQL |
| 3 | отсутствие принципала пропускает беспринципальную запись | УБИТ: `organization_principal_required` до `withTransaction` |
| 4 | несовпадение организации открывает cross-tenant запись | УБИТ: `patient_payment_organization_principal_mismatch` до `withTransaction`; прежний код был хуже (переопределял арендатора) |
| 5 | снятие пере-входа ломает вебхук эквайринга | УБИТ: маршрут ставит тот же организационный принципал сам; вид и арендатор идентичны до/после |
| 6 | повтор или гонка дают ложный отказ после коммита | УБИТ: 409 с одной строкой; две одновременные заявки → один `payment.id`, одна строка; ключи индексов совпадают с условием перечитывания |
| 7 | новый тест — тавтология или проверка текста исходника | УБИТ: настоящий `@bersoncare/db-principal`, снимок принципала в момент записи; fault injection 3/3 красных |
| 8 | другая легитимная дверь ломается новой проверкой равенства | УБИТ: все четыре staff-двери передают `gate.ctx.organizationId` под staff-принципалом с тем же org |

Непойманных классов: **0**.

## 7. Команды и счётчики

```
pnpm --dir apps/webapp exec vitest run src/infra/repos/pgPatientPayments.principal.unit.test.ts
  → 1 файл / 3 теста PASS

# fault injection: возврат runWithDbOrganizationPrincipal в runPatientPaymentMutation
  → 1 файл / 3 теста FAIL (3/3), в т.ч. «expected 'organization' to be 'staff'»; правка отменена, дерево чистое

pnpm --dir apps/webapp exec vitest run \
  'src/app/api/doctor/booking-engine/appointments/[id]/payment/route.route.test.ts' \
  src/app/api/doctor/booking-engine/patient-packages/route.route.test.ts \
  src/app/api/payments/patientAcquiring.route.test.ts \
  src/app-layer/booking/staffMembershipSale.unit.test.ts \
  src/app-layer/booking/staffMembershipSaleAttemptIdentity.unit.test.ts \
  src/modules/patient-payments/service.unit.test.ts \
  src/infra/repos/pgPatientPayments.principal.unit.test.ts
  → 7 файлов / 63 теста PASS

pnpm --dir apps/webapp typecheck                                             → exit 0
node --test deploy/postgres/privileges/staff-drizzle-insert-grant-coverage.test.mjs → 1/1 PASS
```

Живая проверка — worktree-сервер на `127.0.0.1:5301` (`:5200` соседнего чата не тронут), сессия доктора
`dimmdao@yandex.ru`, база `bcb_webapp_dev`:

```
POST …/appointments/62b52494-3fc6-4394-889e-b13f5b262624/payment {"action":"cash"} → 200, payment fb12ae2b…, 700000
POST то же ещё раз                                                                 → 409 already_paid, строк 1
GET  …/payment                                                                     → totalMinor 700000, manualPaidMinor 700000
2 × POST одновременно на e16fb997-1c02-45ae-bf26-f122d6fd83d8                       → 200/200, один id dc39e99e…, строк 1
```

**Уборка:** обе пробные строки ledger (`fb12ae2b…`, `dc39e99e…`) удалены; повторный запрос по обеим записям
даёт 0 строк. Fault injection отменена, `git status` чист до аудиторских файлов. Сервер `:5301` остановлен.
Продуктовый код аудитом не менялся.

## 8. Мины деплоя

Проверено, нет. Правка не трогает миграции, права, объявления возможностей и env: `runPatientPaymentMutation`
перестал устанавливать принципала и стал проверять уже установленного. Ролей и грантов правка не требует —
`app_staff` уже объявленный писатель `public.patient_payment` и уже установлен всеми четырьмя staff-дверями.

## 9. ВОПРОСЫ ВЛАДЕЛЬЦУ

**Один предсуществующий дефект, вне скоупа кандидата — решение о заведении работы за владельцем.**

Вебхук эквайринга (`api/payments/patient-acquiring-webhook/[provider]` → `handleAcquiringWebhookEvent` →
`updatePatientPaymentStatus`) ходит под ОРГАНИЗАЦИОННЫМ принципалом, который ставит сам маршрут. По тем же двум
измерениям, что и §2, этот путь до ledger не доходит: ключа `tenant_service` в каталоге нет, а
`app_tenant_service` не имеет прав на `public.patient_payment`. Достижимый сценарий: провайдер списал деньги
пациента, прислал callback — статус `pending` никогда не станет `paid`, маршрут отвечает 5xx, провайдер ретраит
бесконечно, платёж не сверяется.

Это НЕ регрессия кандидата: маршрут ставил тот же принципал и до правки (`23f9723c6`, 08.07), а репозиторий лишь
пере-входил в него тем же видом. Кандидат оставил этот путь ровно таким, каким его нашёл, — как и требовал бриф.
Заводить работу аудит не имеет права; поднимаю как отдельный вопрос.

**Закрыто владельцем 05.09:** «Запусти отдельный поток в отдельной ветке на фикс этой ошибки. Код аудит фикс по
правилам» (MONEY-12). Ветка `wt/acquiring-webhook-fix-20260905`. Обе половины callback'а после резолвера —
чтение конфигурации провайдера клиники и перевод строки ledger'а — переведены на именованные корни класса
`tenant_service` (`app.read_acquiring_webhook_booking_payment_setting(text)`,
`app.settle_patient_acquiring_webhook_payment(text,text,text)`); арендатор берётся из принятого контекста, а не
из аргумента. Сквозной `relation`-двери классу по-прежнему не выдают — это проверяет отдельный тест.
