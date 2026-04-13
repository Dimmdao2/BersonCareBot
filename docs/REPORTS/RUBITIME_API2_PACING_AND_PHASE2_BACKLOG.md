# Rubitime API2: глобальный pacing (фаза 1) и backlog фазы 2

Дата актуализации: 2026-04-13.

## Фаза 1 — выполнено (код + миграция + тесты)

**Проблема:** Rubitime API2 не принимает запросы чаще одного раза в ~5 секунд на ключ; подряд `create-record` и `get-record` (post-create projection) давали `RUBITIME_API_ERROR: Limit on the number of consecutive requests: 5 seconds` и `projectionOk: false`.

**Решение в integrator:**

| Элемент | Где |
|---------|-----|
| Throttle (5500 ms, `pg_advisory_lock`, таблица `rubitime_api_throttle`) | `apps/integrator/src/integrations/rubitime/rubitimeApiThrottle.ts` |
| Обёртка всех исходящих api2-вызовов | `apps/integrator/src/integrations/rubitime/client.ts` → `postRubitimeApi2` |
| Миграция | `apps/integrator/src/integrations/rubitime/db/migrations/20260413_0001_rubitime_api_throttle.sql` (версия в `schema_migrations`: `rubitime:20260413_0001_rubitime_api_throttle.sql`) |
| Тесты | `rubitimeApiThrottle.test.ts`, расширенный `client.test.ts` (ретрай при лимите) |
| Post-create projection | перед повторным `get-record` после ошибки — явная пауза **5200 ms** (запас к окну Rubitime ~5 с); плюс общий throttle **5500 ms** на все api2 |
| Ретрай в `postRubitimeApi2` при теле ответа «consecutive requests / 5 second» | следующая итерация цикла снова вызывает `withRubitimeApiThrottle`: **ожидание до 5500 ms** после *завершения* предыдущего api2-запроса (Rubitime считает и HTTP 200 с такой ошибкой). Отдельный `sleep` в этом месте не нужен — пауза внутри throttle |

**Деплой:** после выката integrator выполнить применение миграций (как принято в проекте, см. `apps/integrator` / `migrate`). Без строки `rubitime_api_throttle.id = 1` будет ошибка `RUBITIME_THROTTLE_ROW_MISSING`.

**Prod/staging:** pacing **нельзя отключить** — переменных вида «skip throttle» нет; нарушать интервал Rubitime бессмысленно (их лимит остаётся).

**UX (webapp):** пока integrator обрабатывает M2M `create-record` (throttle, повторные вызовы api2, post-create projection), HTTP-запрос webapp к integrator обычно **не завершён** — на UI уместен индикатор загрузки до ответа.

**В тестах:** при `NODE_ENV=test` throttle к БД не обращается.

**Контракт для webapp / DevOps:** `apps/webapp/INTEGRATOR_CONTRACT.md` (раздел про Rubitime create-record) — подпункт про интервал api2.

---

## Фаза 2 — backlog (не реализовано в этом PR)

Ниже — сохранённая спецификация для отдельной инициативы (очередь воркера, async создание записи с поллингом и лоадером «выполняется запись», мультивыбор слотов и N записей Rubitime).

### B — очередь и async UX

1. Очередь задач (отдельный `kind` или таблица), payload: параметры `create-record` (v1/v2) + `patient_bookings.id` (UUID webapp).
2. Signed M2M route enqueue (например `create-record-enqueue`), ответ **202** + correlation.
3. Цикл worker: claim → `createRubitimeRecord` + `runPostCreateProjection` (уже через существующий paced client).
4. Финализация `patient_bookings` в `public` (SQL из integrator при unified DB или signed callback webapp).
5. Webapp: `createBooking` → pending → enqueue; polling статуса; UI лоадер.

### C — мультислоты

1. UI: `BookingSlot[]`, toggle, правило пересечения по длительности услуги `D` минут (`[startAt, startAt+D)` vs кандидат `[s,e)`).
2. API: `slots: BookingSlot[]`, валидация, последовательные create в воркере с глобальным pacing.
3. Политика частичного фейла (откат / сообщение пользователю).

### Тесты фазы 2

- Интеграция: два быстрых create подряд → оба успех (второй после задержки).
- Моки worker / enqueue handler.

---

## Ссылки

- Пайплайн бронирования Rubitime: `docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md` (в т.ч. post-create projection и ссылка на pacing/throttle).
