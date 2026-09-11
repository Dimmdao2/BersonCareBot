# FAIL — независимый аудит S7

Candidate: `32bac1db107bda7a4d8106d2e5ae5076a19d3b60`.

Oracle: `APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` S7.1/S7.2 и
`DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K2 `PAY-APPT-11`.

## Классификация до проверки

- Пункты 1, 2, 3, 4 и 6 — **тест**: declaration/generated drift, новый
  `SECURITY DEFINER` write и конечное состояние записи доступны для rollback-only проверки на
  именованной DEV. Одного чтения для money-adjacent write недостаточно.
- Пункт 5 — **тест + взгляд**: неизменность doctor derivation и отсутствие нового delivery path
  определяются exact diff/поиском; источник badge проверяется по действующим DB-read запросам.

Слепой kill-set: удалить projection update; испортить один generated artifact; дать projection
другого tenant тот же canonical appointment; отсутствие projection; уже завершённая пациентская
отмена; повторный и конкурентный tick; stale upcoming/pay surface; сломанный doctor history source;
specialist notification; пропущенный opt-in test.

## Блокирующие находки

### F1 — новый write способен изменить projection другой организации

**Нарушение.** S7.1 требует довести expiry до связанной пациентской проекции, а `AGENTS.md` §4a
запрещает новому write-path обходить уже существующий `organization_id` ownership path. Candidate
фильтрует только по `canonical_appointment_id`.

**Достижимый сценарий и impact.** PostgreSQL принимает row организации B, ссылающуюся на appointment
организации A: FK проверяет только appointment UUID. На rollback-only фикстуре tick организации A
изменил row B на `cancelled / prepayment_expired`. Это cross-tenant corruption на DB-границе. Это не
заявление о доказанном remote HTTP exploit: пользовательский HTTP-вход для подстановки чужого UUID
в этом проходе не найден, но новый root реально усиливает любое допустимое схемой рассогласование.

Фактические constraints получены командой:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN READ ONLY; \
  SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint \
  WHERE conrelid='public.patient_bookings'::regclass ORDER BY conname; \
  SELECT indexname,indexdef FROM pg_indexes \
  WHERE schemaname='public' AND tablename='patient_bookings' ORDER BY indexname; ROLLBACK;"
```

Observed: `patient_bookings_canonical_appointment_id_fkey` ссылается только на
`be_appointments(id)`; UNIQUE/composite FK с `organization_id` нет. Primary key гарантирует
уникальность appointment UUID, но не соответствие tenant-поля projection.

Состояние DEV измерено командой:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN READ ONLY; \
  SELECT count(*) AS linked_rows, \
  count(*) FILTER (WHERE a.id IS NULL) AS dangling_appointment, \
  count(*) FILTER (WHERE b.organization_id IS DISTINCT FROM a.organization_id) AS cross_org_mismatch \
  FROM public.patient_bookings b LEFT JOIN public.be_appointments a \
  ON a.id=b.canonical_appointment_id WHERE b.canonical_appointment_id IS NOT NULL; \
  SELECT count(*) AS duplicated_canonical_ids FROM (SELECT canonical_appointment_id \
  FROM public.patient_bookings WHERE canonical_appointment_id IS NOT NULL \
  GROUP BY canonical_appointment_id HAVING count(*) > 1) d; ROLLBACK;"
```

Observed: `linked_rows=335`, `dangling_appointment=0`, `cross_org_mismatch=0`,
`duplicated_canonical_ids=3`. Нулевое текущее рассогласование не является constraint.

Concrete failing input, rollback-only: временная organization
`00000000-0000-4000-8000-0000000000b7`, её projection с
`canonical_appointment_id` appointment организации
`a0000000-0000-4000-8000-000000000001`. Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "cd /tmp/bcb-s7-audit.vhyxH9 && node s7-audit-cross-org.mjs"
```

Observed: `expired=1`, разные `appointmentOrg`/`projectionOrg`, projection получила
`projectionStatus=cancelled`, `projectionReason=prepayment_expired`.

### F2 — обязательный migration verify-probe ложен

Candidate probe ищет в `pg_get_functiondef` текст
`booking.cancel_reason = 'prepayment_expired'`. PostgreSQL печатает target SET-колонку без alias:
`cancel_reason = 'prepayment_expired'`.

Проверено после применения exact candidate migration внутри `BEGIN … ROLLBACK`:

```sql
SELECT pg_get_functiondef('app.expire_due_booking_prepayments(integer)'::regprocedure)
         LIKE '%UPDATE public.patient_bookings AS booking%'
   AND pg_get_functiondef('app.expire_due_booking_prepayments(integer)'::regprocedure)
         LIKE '%booking.cancel_reason = ''prepayment_expired''%' AS exact_migration_verify;
SELECT strpos(pg_get_functiondef('app.expire_due_booking_prepayments(integer)'::regprocedure),
              'cancel_reason = ''prepayment_expired''') > 0 AS unqualified_target_exists;
```

Observed: `exact_migration_verify=f`, `unqualified_target_exists=t`. Миграция не даёт истинного
probe, требуемого `AGENTS.md` §1 «Миграции schema B»; заявлять её проверенной нельзя.

### F3 — proof-тест фиксирует формат SQL, а не только поведение

`candidateFunction()` всегда требует точное многострочное `source.includes(projectionUpdate)`.
Безвредная замена четырёх пробелов перед `UPDATE` на два не меняет SQL, но команда

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "cd /tmp/bcb-s7-audit.vhyxH9 && RUN_EXPIRED_PREPAYMENT_PATIENT_PROJECTION_DB=1 \
  node --test deploy/postgres/privileges/expired-prepayment-patient-projection.devDbProof.test.mjs"
```

завершилась `rc=1` до DB-вызова: `candidate projection update is missing`. Это запрещённая §10a
проверка текста SQL и ложный red от форматирования. Полезный live oracle теста существует, но
сохранить тест в текущей форме нельзя. Временное форматирование откатил.

## По пунктам брифа

### 1. Least privilege — PASS

В declaration `operationColumns.UPDATE` ровно
`status,cancelled_at,cancel_reason,updated_at`; SELECT дополнительно включает только
`canonical_appointment_id`, нужный предикату. Во всех трёх generated artifacts получены ровно:

```sql
GRANT SELECT ("cancel_reason", "cancelled_at", "canonical_appointment_id", "status", "updated_at") ...;
GRANT UPDATE ("cancel_reason", "cancelled_at", "status", "updated_at") ...;
```

Table-wide grant этой роли на `patient_bookings` не найден. Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "cd /tmp/bcb-s7-audit.vhyxH9 && pnpm run check:db-privileges-generated"
```

прошла для DEV/TEST/PROD artifacts. После удаления `updated_at` только из TEST-artifact та же
команда завершилась `rc=1` и назвала строку 16168; временная порча восстановлена. Миграция GRANT не
содержит: truth действительно в declaration/reconcile.

Дополнительно:

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "cd /tmp/bcb-s7-audit.vhyxH9 && node --test \
  deploy/postgres/privileges/appointment-prepayment-least-privilege.test.mjs"
```

Observed: `tests=9`, `pass=9`, `skip=0`.

### 2. Organization scope — FAIL

См. F1. Exact rollback-only candidate function изменила допустимую constraints row другого tenant.
Отсутствие фактического mismatch сейчас не превращает отсутствующий ownership predicate в стену.

### 3. Missing/moved/repeated/racing rows — PASS для перечисленных состояний

Одноразовый rollback-only harness exact candidate:

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "cd /tmp/bcb-s7-audit.vhyxH9 && node s7-audit-edgecases.mjs"
```

Observed:

- projection отсутствует: `expired=1`, appointment стал `cancelled_by_specialist`, linked rows `0`;
- canonical уже `cancelled_by_patient`, projection `cancelled/patient_cancelled_probe`:
  `expired=0`, причина сохранена;
- два последовательных ticks: `firstExpired=1`, `secondExpired=0`, одно новое history-event.

Конкурентный claim проверен двумя PostgreSQL sessions с тем же
`UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` внутри двух rollback-only transactions:

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "cd /tmp/bcb-s7-audit.vhyxH9 && node s7-audit-race.mjs"
```

Observed: `first_claimed=1`, `second_claimed=0`; второй loop не получает row и не делает side effects.
Exact production search
`rg -n "prepayment_expired" ... --glob '!deploy/postgres/generated/**' --glob '!docs/**'`
нашёл writers token только в прежнем expiry history/timeline и новом candidate projection update;
другого writer `cancel_reason='prepayment_expired'` нет.

### 4. Дальнейший patient path — PASS по данным/ветвлению, UI live не заявляется

В `app.read_current_patient_booking_rows` upcoming требует status из live-набора и
`cancelled_at IS NULL`; history включает `status='cancelled'`. Значит candidate row исчезает из
upcoming и входит в history, где `BookingPastHistorySection.tsx` читает `cancelReason`.

S4 проверен на текущем интеграционном `feat`/merge HEAD, а не приписан exact candidate SHA:
`BookingUpcomingSection.tsx` создаёт pay-link/countdown только для `awaiting_payment`;
`PatientBookingPayClient.tsx` классифицирует canonical `cancelled_by_specialist` как cancelled и в
этой ветке не рендерит checkout URL, QR, кнопку или countdown. Автоматизированный UI-test не
создавался согласно §10a.

### 5. Doctor view и notification — PASS

Exact candidate diff по `pgBookingCalendar.ts`, `pgDoctorClients.ts`, doctor UI и integrator пуст.
Оба reader по-прежнему выводят `prepaymentExpired` только из
`be_appointment_history_events.payload.source='prepayment_expired'`; прежние history/timeline INSERT
в новом теле побайтно по смыслу не изменены. Badge остаётся
`DoctorAppointmentIndicators.tsx → «Отменена из-за неоплаты»`.

Новых outgoing-delivery/notification writes, specialist targets или вызовов delivery кода в
candidate нет. Существующий `be_patient_timeline_events` INSERT адресован пациенту и существовал до
S7; doctor notification не добавлен.

### 6. Proof test — FAIL

Нормальный live run:

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "cd /tmp/bcb-s7-audit.vhyxH9 && RUN_EXPIRED_PREPAYMENT_PATIENT_PROJECTION_DB=1 \
  node --test deploy/postgres/privileges/expired-prepayment-patient-projection.devDbProof.test.mjs"
```

Observed: `pass=1`, `skip=0`; appointment и projection отменены в одной DB transaction, source
совпадает.

Лично выполненная fault injection:

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "cd /tmp/bcb-s7-audit.vhyxH9 && RUN_EXPIRED_PREPAYMENT_PATIENT_PROJECTION_DB=1 \
  EXPIRED_PREPAYMENT_PATIENT_PROJECTION_FAULT=omit_projection node --test \
  deploy/postgres/privileges/expired-prepayment-patient-projection.devDbProof.test.mjs"
```

Observed: `rc=1`; actual projection осталась `awaiting_payment`, reason `null`, тогда как canonical
appointment и history истекли.

Unset flag:

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "cd /tmp/bcb-s7-audit.vhyxH9 && node --test \
  deploy/postgres/privileges/expired-prepayment-patient-projection.devDbProof.test.mjs"
```

Observed: `pass=0`, `skipped=1`, процесс `rc=0`. Поиск имени теста и env-флага в `.github`, root и
workspace `package.json` не нашёл CI wiring; поэтому этот skip не является CI evidence вообще.
Строка evidence в owner plan использует explicit opt-in flag. Однако F3 запрещает принять сам файл.

## NOT CHECKED

- Официальный `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root
  /home/dev/dev-projects/BersonCareBot`: не выполнен, потому что `/tmp/bcb-dev-migrate.$(id -u).lock`
  удерживал чужой активный `bash deploy/host/migrate-dev.sh --execute`; процесс не прерывался.
- Live browser/viewport после landing: по §24.3 это проверяет интеграционный SHA на общем `:5200`, а
  не pre-land auditor.
- TEST и оба PROD: TEST не требовался, PROD запрещён даже для чтения.
- Remote HTTP exploit для создания cross-org canonical link: не доказан; F1 доказан как реальный
  DB-boundary/ownership-path defect на состоянии, которое текущая схема принимает.
