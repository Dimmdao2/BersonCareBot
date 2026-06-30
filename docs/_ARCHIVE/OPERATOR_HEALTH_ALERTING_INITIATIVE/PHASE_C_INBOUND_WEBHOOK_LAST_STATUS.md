# PHASE C — Входящие вебхуки: последний статус

Канон: [`MASTER_PLAN.md`](MASTER_PLAN.md) §3.4, §5 фаза C, §7 DoD.

## 1. Цель этапа

Для **Rubitime**, **Telegram**, **MAX** сохранять агрегат **последней обработки** входящего вебхука: время, успех/неуспех, стабильный `error_code` / этап (parse, auth, dispatch, 5xx). Отделить это от **исходящих** проб (фаза B) в данных и в будущем UI.

## 2. Зависимости

- **Фаза A** желательна для единой таблицы «last webhook event»; допустимо отдельная узкая таблица `integration_webhook_last_status` если так проще мигрировать без смешения с инцидентами.

## 3. In scope / out of scope

### In scope

- Таблица или расширение существующей: `source` (`rubitime` | `telegram` | `max`), `received_at`, `processed_ok`, `error_class`, `http_status_returned`, `detail` (truncated).
- Upsert **одной строки на источник** (primary key = source).
- Точки входа: завершение обработки в `rubitime/webhook.ts`, `telegram/webhook.ts`, `max/webhook.ts` (или центральный gateway — уточнить при реализации через `rg registerWebhook`).
- При **ошибке обработки** у себя — вызов `reportFailure` с `direction=inbound_webhook` и отдельным `error_class` (не путать с `rubitime_api`).

### Out of scope

- Ретеншн полного тела вебхука (PII); только метаданные и короткий detail.
- Изменение контракта ответа Rubitime к внешнему миру без необходимости.

## 4. Разрешённые области правок

| Разрешено | Пути |
|-----------|------|
| Integrator webhooks | `apps/integrator/src/integrations/rubitime/webhook.ts`, `telegram/webhook.ts`, `max/webhook.ts` |
| DB | `apps/integrator/db` или webapp schema — в зависимости от выбранной схемы в фазе A |
| Порты | новый порт `WebhookLastStatusPort` + impl |

**Вне scope:** webapp routes для приёма Rubitime если сейчас только integrator.

## 5. Декомпозиция шагов

### Шаг C.1 — Схема last-status

**Действия:**

1. Колонки из §3; индекс не обязателен при PK=`source`.
2. Миграция.

**Checklist:**

- [ ] Нет дублирования PII из payload.

**Критерий закрытия:** upsert из SQL/Drizzle проверен.

---

### Шаг C.2 — Инструментация вебхуков

**Действия:**

1. Обёртка `try/finally` или единый middleware: на выходе записать статус.
2. Для 4xx из-за неверной подписи — отдельный `error_class` (`webhook_auth_failed`).

**Checklist:**

- [ ] `rg webhook` в integrator — все три пути покрыты или явный defer в LOG.

**Критерий закрытия:** искусственный bad payload в dev обновляет строку.

---

### Шаг C.3 — Связка с инцидентами

**Действия:**

1. Политика: каждая ошибка входа → `openOrTouch` с ключом `inbound_webhook:rubitime:…` или только счётчик last-status без инцидента до N раз — **продуктовое решение**; по умолчанию из MASTER: алерт на первую новую ошибку класса.

**Checklist:**

- [ ] Не дублировать TG при каждом повторном вебхуке того же сбоя.

**Критерий закрытия:** согласовано с фазой A и задокументировано.

---

### Шаг C.4 — Тесты

**Действия:**

1. Unit: upsert last-status.
2. Integration: webhook handler с моком deps → запись + опционально вызов `reportFailure`.

**Checklist:**

- [ ] Тесты не требуют реальной сети.

**Критерий закрытия:** зелёные тесты пакета integrator.

## 6. Definition of Done (фаза C)

- По каждому из трёх источников есть last-status в БД, обновляемый на каждом запросе.
- Ошибки входящей обработки отражаются в инцидентах согласованно с дедуп-политикой.
- Фаза F может прочитать те же данные через API.

## 7. Ссылки

- [`MASTER_PLAN.md`](MASTER_PLAN.md)
- [`PHASE_D_EVENT_HOOKS.md`](PHASE_D_EVENT_HOOKS.md)
- [`PHASE_F_UI_AND_ADMIN_API.md`](PHASE_F_UI_AND_ADMIN_API.md)
