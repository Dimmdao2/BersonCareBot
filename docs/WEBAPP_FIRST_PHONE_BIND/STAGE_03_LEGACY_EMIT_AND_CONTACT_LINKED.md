# Этап 3: Legacy M2M — `emit`/202, `contact.linked`, outbox/worker

## Контекст

После перевода **phone bind** на одну TX путь **`POST /api/integrator/events`** с типом `contact.linked` для этой цепочки не должен быть основным. Остаётся:

- **Исправление парсинга ответа** для **оставшихся** вызовов `webappEventsClient.emit`: **202 без `body.ok === true`** = неуспех; невалидный JSON = ошибка и лог.
- **Идемпотентность** обработки `contact.linked` на webapp, пока в outbox есть хвосты или пока не выключен продюсер — без двойного неконсистентного merge.
- **Контракт ответов** webapp: не отдавать integrator «успех», если телефон фактически не применён к пользователю по binding (различие 503 transient vs 422 семантика).

Файлы: `apps/integrator/src/infra/adapters/webappEventsClient.ts` · `apps/webapp/src/app/api/integrator/events/route.ts` · `apps/webapp/src/modules/integrator/events.ts` · `apps/integrator/src/infra/db/repos/projectionFanout.ts` · worker projection (см. план Cursor §Legacy).

## Результат этапа

- [x] Для **не-телефонных** M2M: тест на 202 + `{ ok: false }` / без `ok` → integrator **не** завершает проекцию как успех (`webappEventsClient.test.ts`).
- [x] `contact.linked`: идемпотентность и корректные коды до полного удаления продюсера с phone path (см. ниже).
- [x] Зафиксировано, какие типы событий идут через sync `emit` + outbox/worker (см. «Legacy emit surface»).

## Legacy emit surface (инвентаризация репозитория)

**Интегратор → webapp `POST /api/integrator/events`**

1. **После TX в `writeDb` (`tryEmitWebappProjectionThenEnqueue`)** — при неуспешном sync в очередь `projection_outbox` (воркер ретраит emit). Типы из `apps/integrator/src/infra/db/writePort.ts`:  
   `appointment.record.upserted`, `user.upserted`, поддержка (`support.*`), `preferences.updated`, напоминания (`reminder.*`, `content.access.granted`), рассылки (`mailing.*`, `user.subscription.upserted`).  
   **Phone path:** `contact.linked` сюда больше не пишется (см. STAGE_01); в outbox могут оставаться **старые** записи до дренажа.
2. **Напрямую из оркестратора** — `await webappEventsPort.emit(...)` в сценариях дневника и др. (`executeAction.ts` и смежные handlers), без outbox.
3. **Парсинг ответа** — `apps/integrator/src/infra/adapters/webappEventsClient.ts`: успех только при `(200|202) && body.ok === true`; тело не JSON → `ok: false` + структурный warn в лог.
4. **Воркер** — `isRecoverableWebappEmitFailure`: 422/404 не ретраятся; 503/5xx/сеть — ретраи с backoff (`projectionWorker.ts`).

Версия/дата отключения продюсера `contact.linked` — по мере дренажа outbox на контуре; в коде phone-bind TX остаётся единственным путём записи канона.

## Чек-лист аудита (этап 3)

- [x] Юнит/интеграционный тест: 202 без успешного тела → неуспех для integrator.
- [x] 200/202 с `{ ok: true }` → успех.
- [x] Повтор старого `contact.linked` после TX-cutover: fast-path, если у строки integrator уже тот же телефон и в событии нет пары channel+external (идемпотентный accept без повторного upsert); при channel+external upsert остаётся (ON CONFLICT по binding).
- [x] Нет бесконечного ретрая на семантических 422: `unique_violation` (23505) из projection upsert → `retryable: false` для `contact.linked` / `user.upserted` / `preferences.updated`.
- [x] `pnpm run ci`.
