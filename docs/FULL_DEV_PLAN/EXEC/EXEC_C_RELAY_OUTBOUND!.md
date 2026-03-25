# PACK C — Relay Outbound (STUB-02) !

> Сложность: **средний** — M2M контракт, HMAC, retry, idempotency  
> Агент: Auto (пул)  
> Зависимости: Pack B (для `shouldDispatch`)  
> Миграции: нет  
> Source of truth: `USER_TODO_STAGE.md` секция 2, `FIX_PLAN_POLISH.md` секция "relay контракт"

---

## Обязательные правила

- После каждого шага: `pnpm run ci`.
- При FAIL: починить → повторить (до 3 попыток). После 3 → СТОП.
- Отчёт: `docs/FULL_DEV_PLAN/finsl_fix_report.md`.

---

## Утверждённый контракт (из USER_TODO_STAGE)

- **Вариант B**: один endpoint `/relay-outbound`, HMAC-подпись, idempotency key.
- **Endpoint**: `POST {INTEGRATOR_API_URL}/api/bersoncare/relay-outbound`
- **Idempotency key**: `message_id + channel + recipient`
- **Dedup TTL**: 24 часа
- **Retry**: `0s`, `10s`, `60s`, `5min` (4 попытки)
- **SLA**: 95% < 30 сек
- **Подпись**: HMAC-SHA256 как в `sendSmsRoute.ts` (`X-Bersoncare-Timestamp` + `X-Bersoncare-Signature`)

---

## Шаг C.1 — Реализовать endpoint в integrator

**Файлы:**
- `apps/integrator/src/integrations/bersoncare/relayOutboundRoute.ts` (новый)
- `apps/integrator/src/integrations/bersoncare/relayOutboundRoute.test.ts` (новый)
- Регистрация route в bootstrap integrator (найти по `registerBersoncareSendSmsRoute`)

**Действия:**
1. Скопировать структуру HMAC-валидации из `sendSmsRoute.ts`.
2. Payload:
   ```ts
   {
     messageId: string;
     channel: "telegram" | "max" | "email" | "sms";
     recipient: string; // externalId канала
     text: string;
     idempotencyKey: string;
     metadata?: Record<string, unknown>;
   }
   ```
3. Валидация: Zod-схема на payload.
4. Dedup: проверить `idempotencyKey` в in-memory Map с TTL 24h (позже можно заменить на Redis).
5. Dispatch: использовать существующий `deliveryAdapter` нужного канала (`telegram`, `max`, `smsc`, `email`).
6. Ответы:
   - `200 { ok: true, status: "accepted" }` — принято в обработку.
   - `200 { ok: true, status: "duplicate" }` — idempotency hit.
   - `400` — невалидный payload.
   - `401` — неверная подпись.
   - `502` — ошибка доставки.
7. Зарегистрировать route рядом с `sendSmsRoute`.

**Тесты (fastify.inject):**
- Валидная подпись + payload → 200 accepted.
- Невалидная подпись → 401.
- Повторный idempotencyKey → 200 duplicate.
- Невалидный payload → 400.
- Мок deliveryAdapter для проверки вызова.

**DoD:** Endpoint принимает подписанные relay-запросы и диспатчит в нужный канал. CI зелёный.

---

## Шаг C.2 — Реализовать клиент relay в webapp

**Файлы:**
- `apps/webapp/src/modules/messaging/relayOutbound.ts` (переписать с нуля)
- `apps/webapp/src/modules/messaging/relayOutbound.test.ts` (новый)
- `apps/webapp/src/config/env.ts` (проверить `INTEGRATOR_API_URL`, `INTEGRATOR_SHARED_SECRET`)

**Действия:**
1. Заменить текущую заглушку (`maybeRelayOutbound`) на рабочую реализацию:
   ```ts
   export async function relayOutbound(params: {
     messageId: string;
     channel: string;
     recipient: string;
     text: string;
   }): Promise<RelayResult>
   ```
2. Формировать HMAC-подпись: `timestamp + "." + JSON.stringify(body)` → `X-Bersoncare-Signature`.
3. Формировать `idempotencyKey`: `${messageId}:${channel}:${recipient}`.
4. Retry с backoff: `0s → 10s → 60s → 5min`. Использовать простой цикл с `setTimeout` (или `setTimeout` через promise).
5. Интегрировать `shouldDispatch(userId)` из Pack B: если `dev_mode` активен и пользователь не в whitelist → skip relay.
6. При отсутствии `INTEGRATOR_API_URL` → `console.warn` один раз и return `{ ok: false, reason: "no_integrator_url" }`.

**Тесты:**
- Мок fetch: успешный relay → ok.
- Мок fetch: 502 → retry до 4 раз.
- Мок fetch: idempotency duplicate → ok.
- `shouldDispatch` false → skip.
- Нет `INTEGRATOR_API_URL` → warn + skip.

**DoD:** Relay работает с подписью, retry, idempotency и dev_mode guard. CI зелёный.

---

## Шаг C.3 — Интегрировать relay в `doctorSupportMessagingService`

**Файлы:**
- `apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts`
- `apps/webapp/src/modules/messaging/doctorSupportMessagingService.test.ts` (обновить)

**Действия:**
1. В `sendAdminReply` после сохранения сообщения в БД → вызвать `relayOutbound` с данными пациента:
   - Определить канал доставки из `channel_preferences` или привязок пользователя.
   - Если у пациента несколько каналов — relay в предпочтительный (первый привязанный мессенджер).
2. Relay не должен блокировать ответ API (fire-and-forget с логированием ошибок).

**Тесты:**
- Обновить существующие тесты: при `sendAdminReply` вызывается `relayOutbound`.
- Ошибка relay не ломает `sendAdminReply` (сообщение всё равно сохраняется).

**DoD:** Сообщения врача relay-ятся в мессенджер пациента. CI зелёный.

---

## Финальный критерий Pack C

- [ ] Endpoint `relay-outbound` в integrator с HMAC, dedup, dispatch.
- [ ] Клиент в webapp с retry и dev_mode guard.
- [ ] Интеграция в `doctorSupportMessagingService.sendAdminReply`.
- [ ] `INTEGRATOR_CONTRACT.md` обновлён разделом relay-outbound.
- [ ] `pnpm run ci` зелёный.
