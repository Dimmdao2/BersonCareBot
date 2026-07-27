# integrations

Адаптеры каналов и внешних сервисов: Telegram, Max, SMSC, email и др. В каждом канале: вебхук, mapIn (входящие в действия), deliveryAdapter (отправка).

Email delivery получает SMTP только из restricted DB-backed `smtp_outbound`. Env fallback отсутствует; секрет не
выводится в логи или ответы.
