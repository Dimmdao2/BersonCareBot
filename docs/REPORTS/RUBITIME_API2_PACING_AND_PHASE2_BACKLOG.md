# Rubitime API2: глобальный pacing (фаза 1) и backlog фазы 2

Дата актуализации: 2026-04-13.

## Фаза 1 — выполнено (код + миграция + тесты)

**Проблема:** Rubitime API2 не принимает запросы чаще одного раза в ~5 секунд на ключ; подряд `create-record` и `get-record` (post-create projection) давали `RUBITIME_API_ERROR: Limit on the number of consecutive requests: 5 seconds` и `projectionOk: false`.

**Решение в integrator:**

| Элемент | Где |
|---------|-----|
| Throttle (5500 ms, `pg_advisory_lock`, таблица `rubitime_api_throttle`) | `apps/integrator/src/integrations/rubitime/rubitimeApiThrottle.ts` |
| Обёртка всех исходящих api2-вызовов | `apps/integrator/src/integrations/rubitime/client.ts` → `postRubitimeApi2` |
| Миграция | `apps/integrator/src/integrations/rubitime/db/migrations/20260413_0001_rubitime_api_throttle.sql` |
| Тесты | `rubitimeApiThrottle.test.ts`, расширенный `client.test.ts` (ретрай при лимите) |
| Post-create projection | убран бессмысленный `sleep(500)` между попытками — интервал обеспечивает throttle |

**Деплой:** после выката integrator выполнить применение миграций (как принято в проекте, см. `apps/integrator` / `migrate`). Без строки `rubitime_api_throttle.id = 1` будет ошибка `RUBITIME_THROTTLE_ROW_MISSING`.

**Аварийно:** `INTEGRATOR_SKIP_RUBITIME_THROTTLE=1` отключает pacing (только инциденты; снова возможен лимит Rubitime).

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

- Пайплайн бронирования Rubitime: `docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md` (при необходимости дополнить ссылкой на этот отчёт).
