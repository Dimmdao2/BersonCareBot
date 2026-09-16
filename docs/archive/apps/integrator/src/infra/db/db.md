# db

Клиент PostgreSQL, миграции, репозитории. **readPort** (`readPort.ts`) и **writePort** (`writePort.ts`) — основные точки входа к данным.

- **readPort**: пользователи, чаты/диалоги, черновики, идемпотентность, напоминания, записи (appointments), рассылки mailing, подписки и др.
- **writePort**: пользователи (в т.ч. upsert для синхронизации идентичностей — покрыто `writePort.userUpsert.test.ts`), бронирование, напоминания, треды сообщений, черновики, доставка, outbox проекции, очередь job, логи и пр.

Полный перечень таблиц и ownership — в `schema.md` рядом с этим файлом.

Restricted SMTP integrator читает через беспараметрическую
`app.read_integrator_smtp_outbound_setting()` в `publicRestrictedSettings.ts`. Базовый API-login получает только
`EXECUTE` этой capability и не получает `SELECT` на restricted settings.
