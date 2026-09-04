# Независимый аудит: первичная гидратация деталей записи (APPT-DETAIL-11)

- **Роль:** `auditor-live`, ветка `wt/appointment-detail-hydration-20260905`, дерево
  `/home/dev/dev-projects/bcb-wt-appointment-detail-hydration-20260905`.
- **Кандидат:** продуктовый `e11d60577`, интеграционная вершина `6ce476d1e` (merge
  `feat/doctor-ui-rebuild`). Тест аудитора — `f4a025502`.
- **Authority:** `APPT-DETAIL-11` в
  `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md:187`, AGENTS.md §24.4–24.8, §10a, §10b.
- **Слепой kill-set** (составлен ДО чтения тестов):
  `docs/_TODO/runs/appointment-detail-hydration-killset-20260905.md`.

## Вердикт: **FAIL — НЕ ПРИЗЕМЛЯТЬ**

Один блокирующий дефект. Он не в замысле правки — архитектура досбора верна и требование владельца
реализовано, — а в типах ОДНОГО нового SQL-join: он валит весь календарь врача на живой базе.
Правка в текущем виде хуже того бага, который чинит.

## F1 (БЛОКЕР). Новый join сравнивает `uuid` с `text` — календарь врача отвечает 500

`apps/webapp/src/infra/repos/pgPayments.ts:415-421`, метод `listAppointmentPaymentBriefs`:

```ts
.innerJoin(bePayments, and(
  eq(bePayments.id, beAppointments.paymentRef),   // uuid  =  text
  eq(bePayments.organizationId, organizationId),
))
```

`be_payments.id` объявлен `uuid()` (`apps/webapp/db/schema/bookingPayments.ts:160`), а
`be_appointments.payment_ref` — `text('payment_ref')` (`apps/webapp/db/schema/bookingEngine.ts:545`).
Это сравнение **колонки с колонкой**, поэтому Postgres не может привести тип и отказывает:

```
SQLSTATE 42883  operator does not exist: uuid = text
hint: No operator matches the given name and argument types.
```

Предсуществующий код той же таблицы этой ошибки не даёт, потому что сравнивает text-колонку с
JS-строкой (`countAppointmentsByPaymentRef`, `pgPayments.ts:463`) — параметр связывается как text.
Ошибку вносит именно новый column-to-column join.

**Почему это блокер, а не косметика.** Досбор стоит на ОБЩЕМ пути чтения календаря, поэтому падает
не карточка деталей, а всё, что читает записи:

| путь | наблюдаемое на живом DEV |
|---|---|
| `GET /api/doctor/booking-engine/calendar` | **HTTP 500** `calendar_load_failed` |
| `GET /api/doctor/booking-engine/appointments/feed` | **HTTP 500** `appointments_feed_failed` |
| `/app/doctor` (дашборд «Сегодня») | HTTP 200, но та же 42883 гасится внутри — блок ближайшей записи теряет данные молча |

Достаточно ОДНОЙ записи с пациентом в диапазоне: `targets` непусты → досбор идёт → запрос падает.
На DEV это 505 записей из 505.

**Доказательство (живой DEV `bcb_webapp_dev`, кандидат-порт 5210, обычный вход доктора
`dimmdao@yandex.ru`, код ровно как в `6ce476d1e`):**

```
POST /api/auth/email-password/login          → {"ok":true,"role":"doctor"}
GET  /api/doctor/booking-engine/calendar?…   → HTTP 500 {"ok":false,"error":"calendar_load_failed"}
GET  /api/doctor/booking-engine/appointments/feed?… → HTTP 500 {"ok":false,"error":"appointments_feed_failed"}
```

SQLSTATE снят временным диагностическим возвратом `err.cause` в маршруте календаря (откачен);
`respondWithSafeApiError` и логгер сообщение съедают — см. `integrator-logger-strips-error-message`.

**Что доказывает, что это ЕДИНСТВЕННЫЙ блокер.** С временным приведением типа
(`sql\`${bePayments.id}::text = ${beAppointments.paymentRef}\``, тоже откачено) весь путь ожил и
выдал ровно то, чего требует владелец:

```
GET /api/doctor/booking-engine/calendar → HTTP 200, 4 записи
  payment != null: 4/4       primaryComment/payment присутствуют в КАЖДОМ событии
GET …/appointments/feed (505 записей, 3 страницы) → HTTP 200
  с непустым payment: 342    с непустым primaryComment: 3
  пример: 65bb2d85 «Под под на водах поалададада алла»
          payment {totalMinor: 700000, manualPaidMinor: 700000, paymentsEntitled: true}
```

Направление исправления — вопрос исполнителя, не аудитора; приведение типа в join и есть
локализованная микроправка по §24.1. Тип `payment_ref` менять не предлагаю: колонка legacy-text и
может нести не-uuid значения, поэтому безопаснее приводить `be_payments.id::text`, а не наоборот.

## Слепой kill-set: 12 названо, 12 закрыто, непойманных 0

Fault injection — по одному разу на независимый класс, «что сломано → что покраснело».

| # | kill | как закрыт | инъекция → результат |
|---|---|---|---|
| K1 | нет комментария в первичном payload | тест кандидата + живой DEV | `initialComment = ''` → **2 красных** |
| K2 | нет блока оплаты в первичном payload | тест кандидата + живой DEV | сводка обнулена в `useState` → **6 красных** |
| K3 | немедленное «Изменить» теряет комментарий | тест кандидата | та же инъекция K1 → **красный** |
| K4 | лишний mount-fetch комментария/оплаты | тест кандидата | возвращён `useEffect`-fetch оплаты → **4 красных** |
| K5 | расхождение «Сегодня» и «Расписания» | **НЕ БЫЛ ЗАКРЫТ — тест написан аудитором** (`f4a025502`) | снят `hydrate` с `listAppointmentsInRange` → **3 красных**; с `listAppointmentFeed` → **2**; с `getCalendar` → **2** |
| K6 | N+1 на запись | тот же новый тест + инспекция | досбор в цикле по одной записи → **красный** |
| K7 | утечка между арендаторами | новый тест + инспекция прав | чужой org в досбор → **красный** |
| K8 | регрессия принципала наличных | `pgPatientPayments.principal.unit.test.ts` | возвращён `runWithDbOrganizationPrincipal` → **3 красных** |
| K9 | нет обновления после платёжной мутации | тест кандидата | снят `reload` после мутации → **красный** |
| K10 | сломан потребитель `/payment` | инспекция (см. ниже) | — |
| K11 | небезопасный `any` / сырой SQL | инспекция + eslint | — |
| K12 | нарушение архитектурных границ | инспекция + eslint | — |

**K5 — реальный пробел покрытия, найденный слепым списком.** Досбор сведён в один чокпоинт
`createBookingCalendarService`, но что его зовут ВСЕ три пути чтения, не проверял никто. Отказ
молчаливый: `AppointmentPaymentSection` при `payment === null` не рисуется вовсе, блок оплаты просто
исчезает на одном хосте. Тест добавлен один раз (§10b «самый дешёвый слой»): фейковый порт, без БД и
без UI. Тестов на текст/разметку/присутствие кнопок не добавлено.

## Пункты требования владельца

1. **Комментарий и оплата в первичном payload** — реализовано верно: комментарий батчем в
   `pgBookingCalendar` рядом с прочими деталями, сводка оплаты — досбором на общем пути. Живой payload
   подтверждает оба поля (при снятом F1).
2. **Немедленное «Изменить»** — `useState(selected?.primaryComment ?? '')`; панель пересоздаётся по
   `key={props.selected?.id}` (`DoctorCalendarEventPanel.tsx:201`), поэтому переключение записи не
   тащит чужой черновик. Проверено инъекцией K1/K3.
3. **Нет лишних mount-GET** — оба `useEffect`-чтения удалены; перечитывание осталось только за
   платёжной мутацией, и оно работает (K9).
4. **Общий путь без расхождения хостов** — подтверждено: «Сегодня» (`listAppointmentsInRange`,
   `getCalendar`), «Расписание» (`listAppointmentFeed`, `getCalendar`) и оба API-маршрута идут через
   один чокпоинт сервиса; иных читателей календаря в репозитории нет.
5. **N+1 и арендаторы** — досбор батчевый: фиксированные ~7 запросов на диапазон независимо от числа
   записей. `be_appointment_staff_comments`, `be_payments`, `patient_payment`, `org_enrollments`
   фильтруются по организации явно. `patient_bookings` явного предиката не несёт, но объявлена
   `org: true` (`deploy/postgres/privileges/declaration.ts:1114`), а досбор идёт под staff-принципалом
   (`withDoctorWorkspacePrincipal`), т.е. закрыта RLS; id записей и так org-scoped. Утечки нет.
   Фикс наличных из `c37f08cb8` цел: merge `6ce476d1e` разрешил конфликт правильно (сырой diff
   `c37f08cb8..e11d60577` показывает откат лишь потому, что `e11d60577` ответвлён от `c4433a70c`,
   ДО фикса).
6. **`any` / сырой SQL / границы** — чисто. В диффе нет `any`, `as unknown`, `@ts-ignore`,
   `eslint-disable`; единственный `sql\`\`` — предсуществующий `sql\`false\`` при переформатировании.
   Направление зависимостей выдержано: модуль календаря о платежах не знает, композицию делает
   app-layer через инъекцию `AppointmentDetailHydrator`.
7. **Совместимость `/payment`** — форма ответа изменена с `{summary, totalMinor, …}` на
   `{payment: view}`. Единственный потребитель `summary` в репозитории — `BookingStaffPaymentPanel.tsx:37`,
   и он **недостижим**: его хост `BookingManualLifecycleSection` нигде не смонтирован, а его
   `apiBase` по умолчанию — `/api/admin/booking-engine`, где маршрута `appointments/[id]/payment`
   не существует вовсе. Мёртвый код, сломанный до этой правки → **не finding**. Достижимый
   потребитель `AppointmentPaymentSection` обновлён согласованно.

## Наблюдения (НЕ findings, работой не становятся — §24.6)

- `loadDoctorScheduleCalendarBootstrap` зовёт `listAppointmentFeed` дважды и `getCalendar` один раз,
  т.е. батч досбора отрабатывает 3 раза за один бутстрап «Расписания». Это не N+1 и не нарушение
  требования, но при желании схлопывается в один проход.
- `BookingManualLifecycleSection`/`BookingStaffPaymentPanel` — мёртвый код, указывающий на
  несуществующий admin-маршрут. Вопрос владельцу: удалять ли.

## Прогоны

| проверка | результат |
|---|---|
| `vitest --project ui DoctorCalendarEventPanel.ui.test.tsx ScheduleCalendarTab.ui.test.tsx` | **24 PASS** (2 файла) |
| `vitest --project route appointments/[id]/payment/route.route.test.ts` | **11 PASS** |
| `vitest --project unit booking-calendar/service.unit.test.ts` (новый) | **5 PASS** |
| `vitest --project unit pgPatientPayments.principal.unit.test.ts` | **3 PASS** |
| `tsc --noEmit -p apps/webapp/tsconfig.json` | exit 0 |
| `eslint` по 14 изменённым продуктовым файлам + новый тест | exit 0 |
| живая приёмка DEV `bcb_webapp_dev`, порт 5210, вход доктора | см. F1 |

Full CI не гонялся (§24.4 — точечные проверки). Порт 5200 не тронут. Push/merge/deploy не делались.

## Уборка

Все временные продуктовые правки (6 инъекций + 2 диагностических возврата + временное приведение
типа) откачены: `git status` и `git diff HEAD` по продуктовому коду пусты. Постоянными оставлены
только тест аудитора `f4a025502` и артефакты аудита. Персистентные данные DEV не менялись: ни одной
мутации не выполнялось, фикстуры не выдумывались.

**Не сделано:** визуальный первый кадр модалки в браузере — на боксе нет бинаря chromium
(`/home/dev/.cache/ms-playwright/` отсутствует, `playwright-core` есть только в `/tmp/wt-shot`),
а память `port-shot-screenshot-tool` устарела ещё и портом (:5200) и удалённым `dev-bypass`-маршрутом.
Смысл требования при этом доказан там, где он и живёт — в серверном payload и в поведении клиента:
поля приходят первым ответом, mount-fetch отсутствует (инъекция K4 краснеет). Отдельно: на
as-committed коде модалка не отрисовалась бы в любом случае — календарь отвечает 500.

## Передача

По §24.5/§24.6 продуктовый fix делает выбранный по §24.1 исполнитель; F1 — локализованная микроправка
одного join, т.е. работа оркестратора, а не отдельного воркера. Набор для доведения до зелёного —
таблица «Прогоны» плюс живой `GET /api/doctor/booking-engine/calendar` под доктором: **HTTP 200 и
непустой `payment` в событиях**. Повторный слепой аудит не нужен: новая поверхность не создаётся.
