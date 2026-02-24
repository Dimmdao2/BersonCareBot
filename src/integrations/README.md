# Integrations

Внешние вебхуки и системы (Rubitime, Tilda и т.п.). Реализации добавлять сюда.

---

## Rubitime

**Назначение:** приём событий записи из Rubitime, сохранение в БД и уведомление через Telegram с fallback в SMS stub.

- **Endpoint:** `POST /webhook/rubitime`
- **Защита:** токен передаётся в заголовке **`X-Rubitime-Token`**. Значение задаётся в env как `RUBITIME_WEBHOOK_TOKEN`. При неверном или отсутствующем токене ответ **403**.
- **События:** поддерживаются события:
  - `event-create-record`
  - `event-update-record`
  - `event-remove-record`
- **Хранение в БД:**
  - `rubitime_events` — лог каждого входящего webhook (полный body, event, received_at);
  - `rubitime_records` — актуальный срез записи Rubitime (id, phone_normalized, record_at, status, payload_json, last_event).
- **Бизнес-сценарии:**
  - `event-create-record` -> `CREATE`
  - `event-update-record` -> `TRANSFER_REQUEST`
  - `event-remove-record` -> `CANCEL`
- **Уведомления:**
  - если пользователь найден по нормализованному телефону -> отправляется сообщение пользователю в Telegram;
  - для `TRANSFER_REQUEST` дополнительно отправляется подробное сообщение админу (`ADMIN_TELEGRAM_ID`);
  - если пользователь не найден или отправка пользователю не удалась -> вызывается `smsClient.sendSms(...)` (SMSC stub), админу отправляется сообщение: «пользователь не уведомлён, требуется SMS».
- **Ответ:** при валидном запросе сервер всегда отвечает **200** (даже если Telegram/SMS отправка завершилась ошибкой). Неверный token -> **403**, невалидный body -> **400**.

**Пример payload:**

```json
{
  "from": "rubitime",
  "event": "event-create-record",
  "data": {
    "id": "rec-123",
    "record": "2025-02-24 14:00",
    "name": "Иван",
    "phone": "+79991234567",
    "service": "Стрижка"
  }
}
```
