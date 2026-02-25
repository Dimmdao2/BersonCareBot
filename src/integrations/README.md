# Integrations

Внешние вебхуки и системы (Rubitime, Tilda и т.п.). Реализации добавлять сюда.

---

## Rubitime

**Назначение:** приём событий записи из Rubitime, сохранение в БД, уведомление клиента, а также iframe-проверка показа кнопки Telegram на странице успеха.

- **Endpoint:** `POST /webhook/rubitime/:token`
- **Защита:** токен берётся только из path-параметра `:token`. Значение задаётся в env как `RUBITIME_WEBHOOK_TOKEN`. При неверном или отсутствующем токене ответ **403**.
- **События:** поддерживаются события:
  - `event-create-record`
  - `event-update-record`
  - `event-remove-record`
- **Хранение в БД:**
  - `rubitime_events` — лог каждого входящего webhook (полный body, event, received_at);
  - `rubitime_records` — актуальный срез записи Rubitime (id, phone_normalized, record_at, status, payload_json, last_event).
- **Уведомления:**
  - если пользователь найден по нормализованному телефону -> отправляется сообщение пользователю в Telegram:
    - `event-create-record`: подтверждение с услугой, датой/временем и филиалом;
    - `event-update-record`: сообщение об изменении со статусом;
    - `event-remove-record`: сообщение об отмене записи;
  - если пользователь не найден или сообщение в Telegram не доставлено -> вызывается `smsClient.sendSms(...)` (SMSC stub);
  - отдельные уведомления админу по fallback/доставке не отправляются.
- **Ответ:** при валидном запросе сервер всегда отвечает **200** (даже если Telegram/SMS отправка завершилась ошибкой). Неверный token -> **403**, невалидный body -> **400**.

### Iframe endpoint для страницы успеха

- **Endpoint:** `GET /api/rubitime?record_success=<record_id>`
- **Назначение:** возвращает HTML-фрагмент для iframe. Внутри рендерится кнопка «Получать подтверждения в Telegram» только если:
  - запись существует;
  - запись не привязана к Telegram (по `phone_normalized`);
  - запись свежая (окно `RUBITIME_REQSUCCESS_WINDOW_MINUTES`, по умолчанию 20 минут).
- **Безопасность/маскировка:**
  - всегда HTTP `200` и однотипный HTML-каркас (`data-showbtn="true|false"`);
  - IP limit в минуту: `RUBITIME_REQSUCCESS_IP_LIMIT_PER_MIN` (по умолчанию 5);
  - global limit в минуту: `RUBITIME_REQSUCCESS_GLOBAL_LIMIT_PER_MIN` (по умолчанию 120);
  - искусственная задержка ответа: `RUBITIME_REQSUCCESS_DELAY_MIN_MS..RUBITIME_REQSUCCESS_DELAY_MAX_MS` (по умолчанию 100..200 мс).

**Пример iframe:**

```html
<iframe
  src="https://tgcarebot.bersonservices.ru/api/rubitime?record_success=7835008"
  style="width:100%;border:0;min-height:72px"
  loading="lazy"
></iframe>
```

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
