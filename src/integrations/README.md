# Integrations

Внешние вебхуки и системы (Rubitime, Tilda и т.п.). Реализации добавлять сюда.

---

## Rubitime

**Назначение:** приём событий записи из Rubitime и уведомление в Telegram (inbound webhook → notify).

- **Endpoint:** `POST /webhook/rubitime`
- **Защита:** токен передаётся в заголовке **`X-Rubitime-Token`**. Значение задаётся в env как `RUBITIME_WEBHOOK_TOKEN`. При неверном или отсутствующем токене ответ **403**.
- **События:** поддерживаются события:
  - `event-create-record`
  - `event-update-record`
  - `event-remove-record`
- **Уведомления:** при валидном теле запроса в Telegram отправляется сообщение в чат **INBOX_CHAT_ID** (см. конфиг). Текст включает префикс "Rubitime", тип события (create/update/remove), при наличии в `data` — id, дату/время записи, имя, телефон, услугу.
- **Ответ:** при успешной валидации запроса сервер всегда отвечает **200** (в т.ч. если отправка в Telegram не удалась; ошибка при этом логируется).

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
